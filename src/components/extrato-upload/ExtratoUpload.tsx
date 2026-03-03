import { useCallback, useRef, useState } from 'react'
import { read, utils } from 'xlsx'
import { supabase } from '../../lib/supabase'
import styles from './ExtratoUpload.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinhaExtrato {
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
}

interface LinhaClassificada extends LinhaExtrato {
  classificacao: string
  grupo: string
  status: 'ok' | 'erro'
}

interface ClassificacaoItem {
  nome: string
  total: number
  lancamentos: LinhaClassificada[]
}

interface GrupoResult {
  nome: string
  tipo: 'receita' | 'despesa'
  total: number
  classificacoes: ClassificacaoItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Tenta detectar colunas pelo cabeçalho (case-insensitive). */
function detectarColunas(headers: string[]): {
  data: number; descricao: number; valor: number; tipo: number
} {
  const idx = (keys: string[]) =>
    headers.findIndex(h => keys.some(k => h.toLowerCase().includes(k)))

  return {
    data:     idx(['data', 'date', 'dt', 'vencimento', 'lançamento', 'lancamento']),
    descricao:idx(['descriç', 'descric', 'histórico', 'historico', 'memo', 'description', 'complement']),
    valor:    idx(['valor', 'value', 'amount', 'vl ', 'r$']),
    tipo:     idx(['tipo', 'type', 'natureza', 'dc', 'crédito/débito', 'entrada/saída']),
  }
}

/** Normaliza valor brasileiro: "1.234,56" → 1234.56 */
function parseValor(raw: unknown): number {
  if (typeof raw === 'number') return Math.abs(raw)
  const s = String(raw ?? '').trim().replace(/\s/g, '')
  // Remove símbolo de moeda
  const clean = s.replace(/[R$]/g, '').trim()
  // Formato brasileiro: 1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(clean)) {
    return Math.abs(parseFloat(clean.replace(/\./g, '').replace(',', '.')))
  }
  // Formato americano: 1,234.56
  return Math.abs(parseFloat(clean.replace(/,/g, '')) || 0)
}

/** Detecta se é entrada ou saída */
function parseTipo(raw: unknown, valor: number): 'receita' | 'despesa' {
  if (valor < 0) return 'despesa'  // número negativo → saída
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return 'receita'         // sem coluna tipo e valor positivo → entrada
  if (
    s.includes('entra') || s.includes('créd') || s.includes('cred') ||
    s.includes('c ') || s === 'c' || s.includes('receita') || s === '+'
  ) return 'receita'
  return 'despesa'
}

/** Formata data de vários formatos para DD/MM/AAAA */
function formatarData(raw: unknown): string {
  if (!raw) return new Date().toLocaleDateString('pt-BR')
  // Número serial do Excel
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000))
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }
  const s = String(raw).trim()
  // Já está no formato DD/MM/AAAA
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  // AAAA-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${d.slice(0,2)}/${m}/${y}`
  }
  return s
}

/** Parse planilha → lista de linhas brutas */
function parsePlanilha(buffer: ArrayBuffer): LinhaExtrato[] {
  const wb = read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (rows.length < 2) return []

  const headers = (rows[0] as unknown[]).map(h => String(h ?? '').trim())
  const cols = detectarColunas(headers)

  const linhas: LinhaExtrato[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const rawValor = cols.valor >= 0 ? row[cols.valor] : null
    const valorNum = typeof rawValor === 'number' ? rawValor : parseValor(rawValor)
    if (!valorNum) continue

    const rawTipo  = cols.tipo >= 0 ? row[cols.tipo] : ''
    const rawDesc  = cols.descricao >= 0 ? row[cols.descricao] : row.find(c => c !== '' && c !== rawValor && c !== rawTipo) ?? ''
    const rawData  = cols.data >= 0 ? row[cols.data] : ''

    linhas.push({
      data:      formatarData(rawData),
      descricao: String(rawDesc ?? '').trim() || `Linha ${i + 1}`,
      valor:     Math.abs(valorNum),
      tipo:      parseTipo(rawTipo, typeof rawValor === 'number' ? rawValor : valorNum),
    })
  }

  return linhas
}

/** Agrupa linhas classificadas por grupo e classificação */
function agrupar(linhas: LinhaClassificada[]): GrupoResult[] {
  const map = new Map<string, GrupoResult>()

  for (const l of linhas) {
    const key = l.grupo || 'Sem grupo'
    if (!map.has(key)) {
      map.set(key, { nome: key, tipo: l.tipo, total: 0, classificacoes: [] })
    }
    const g = map.get(key)!
    g.total += l.valor

    let clf = g.classificacoes.find(c => c.nome === l.classificacao)
    if (!clf) {
      clf = { nome: l.classificacao || 'Sem classificação', total: 0, lancamentos: [] }
      g.classificacoes.push(clf)
    }
    clf.total += l.valor
    clf.lancamentos.push(l)
  }

  // Ordenar: receitas antes, depois despesas, cada um por total desc
  return [...map.values()].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'receita' ? -1 : 1
    return b.total - a.total
  })
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ExtratoUpload() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]           = useState(false)
  const [arquivo, setArquivo]             = useState<string>('')
  const [progresso, setProgresso]         = useState<{ atual: number; total: number } | null>(null)
  const [grupos, setGrupos]               = useState<GrupoResult[]>([])
  const [erros, setErros]                 = useState<string[]>([])
  const [expandidos, setExpandidos]       = useState<Set<string>>(new Set())
  const [expandidosClf, setExpandidosClf] = useState<Set<string>>(new Set())
  const [processando, setProcessando]     = useState(false)

  const toggleGrupo = (key: string) =>
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const toggleClf = (key: string) =>
    setExpandidosClf(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const processarArquivo = useCallback(async (file: File) => {
    setArquivo(file.name)
    setGrupos([])
    setErros([])
    setExpandidos(new Set())
    setExpandidosClf(new Set())
    setProcessando(true)
    setProgresso(null)

    let linhas: LinhaExtrato[] = []
    try {
      const buffer = await file.arrayBuffer()
      linhas = parsePlanilha(buffer)
    } catch {
      setErros(['Não foi possível ler o arquivo. Verifique se é um arquivo Excel (.xlsx/.xls) ou CSV válido.'])
      setProcessando(false)
      return
    }

    if (linhas.length === 0) {
      setErros(['Nenhuma linha com valor encontrada. Verifique o formato do arquivo.'])
      setProcessando(false)
      return
    }

    // Buscar modelo e classificações disponíveis do Supabase
    const [{ data: configData }, { data: classData }] = await Promise.all([
      supabase.from('configuracoes').select('valor').eq('chave', 'modelo_groq').single(),
      supabase.from('dre_classificacoes').select('nome,tipo').eq('ativo', true),
    ])
    const modelo = configData?.valor ?? DEFAULT_GROQ_MODEL
    const classificacoes = (classData ?? []) as { nome: string; tipo: string }[]

    // Classificar em lotes de 5 chamadas paralelas
    const classificadas: LinhaClassificada[] = []
    const novosErros: string[] = []
    const BATCH = 5

    setProgresso({ atual: 0, total: linhas.length })

    for (let i = 0; i < linhas.length; i += BATCH) {
      const lote = linhas.slice(i, i + BATCH)
      const classesDoTipo = (tipo: 'receita' | 'despesa') =>
        classificacoes.filter(c => c.tipo === tipo).map(c => ({ nome: c.nome, tipo: c.tipo }))

      const resultados = await Promise.all(
        lote.map(async (l): Promise<LinhaClassificada> => {
          try {
            const { data, error } = await supabase.functions.invoke('dre-ai-classify', {
              body: {
                descricao: l.descricao,
                valor: l.valor,
                tipo: l.tipo,
                modelo,
                classificacoes_disponiveis: classesDoTipo(l.tipo),
                grupos_existentes: [],
              },
            })
            if (error || !data) throw new Error(error?.message ?? 'Sem resposta da IA')
            return {
              ...l,
              classificacao: String(data.classificacao_nome ?? '').trim() || 'Outros',
              grupo:         String(data.grupo ?? '').trim() || 'Outros',
              status: 'ok',
            }
          } catch {
            return { ...l, classificacao: 'Não classificado', grupo: 'Outros', status: 'erro' }
          }
        }),
      )

      classificadas.push(...resultados)
      novosErros.push(
        ...resultados
          .filter(r => r.status === 'erro')
          .map(r => `"${r.descricao}" — falha na classificação`),
      )
      setProgresso({ atual: Math.min(i + BATCH, linhas.length), total: linhas.length })
    }

    setGrupos(agrupar(classificadas))
    setErros(novosErros)
    setProcessando(false)
    setProgresso(null)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processarArquivo(file)
    e.target.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processarArquivo(file)
  }, [processarArquivo])

  const totalReceitas  = grupos.filter(g => g.tipo === 'receita').reduce((s, g) => s + g.total, 0)
  const totalDespesas  = grupos.filter(g => g.tipo === 'despesa').reduce((s, g) => s + g.total, 0)
  const totalResultado = totalReceitas - totalDespesas

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Importar Extrato / Planilha</h2>
          <p className={styles.sectionSubtitle}>
            Envie um extrato de banco ou planilha Excel — a IA classifica cada lançamento automaticamente.
          </p>
        </div>
        <a
          href="/exemplos/exemplo.xlsx"
          download
          className={styles.downloadBtn}
        >
          ↓ Baixar exemplo .xlsx
        </a>
      </div>

      {/* Drop zone */}
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''} ${processando ? styles.dropZoneLoading : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !processando && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
        {processando && progresso ? (
          <div className={styles.progressWrap}>
            <div className={styles.progressSpinner} />
            <p className={styles.progressText}>
              Classificando com IA… {progresso.atual} de {progresso.total}
            </p>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${(progresso.atual / progresso.total) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <span className={styles.dropIcon}>📂</span>
            <p className={styles.dropTitle}>
              {arquivo
                ? `Enviar outro arquivo (atual: ${arquivo})`
                : 'Arraste o arquivo aqui ou clique para selecionar'}
            </p>
            <p className={styles.dropHint}>Aceita .xlsx, .xls e .csv</p>
          </>
        )}
      </div>

      {/* Erros de classificação */}
      {erros.length > 0 && (
        <div className={styles.errosBox}>
          <strong>⚠️ {erros.length} item(s) com problema na classificação</strong>
          <ul>
            {erros.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
            {erros.length > 5 && <li>…e mais {erros.length - 5}</li>}
          </ul>
        </div>
      )}

      {/* Resultados agrupados */}
      {grupos.length > 0 && (
        <>
          {/* Totalizador geral */}
          <div className={styles.resumoRow}>
            <div className={styles.resumoCard} data-tone="positive">
              <span>Total Receitas</span>
              <strong>{moeda(totalReceitas)}</strong>
            </div>
            <div className={styles.resumoCard} data-tone="negative">
              <span>Total Despesas</span>
              <strong>{moeda(totalDespesas)}</strong>
            </div>
            <div className={styles.resumoCard} data-tone={totalResultado >= 0 ? 'positive' : 'negative'}>
              <span>Resultado</span>
              <strong>{moeda(totalResultado)}</strong>
            </div>
          </div>

          {/* Grupos accordion */}
          <div className={styles.gruposList}>
            {grupos.map(grupo => {
              const gKey = grupo.nome
              const aberto = expandidos.has(gKey)
              return (
                <div key={gKey} className={`${styles.grupoCard} ${grupo.tipo === 'receita' ? styles.grupoReceita : styles.grupoDespesa}`}>
                  {/* Header do grupo */}
                  <button className={styles.grupoHeader} onClick={() => toggleGrupo(gKey)}>
                    <div className={styles.grupoInfo}>
                      <span className={`${styles.grupoPill} ${grupo.tipo === 'receita' ? styles.pillReceita : styles.pillDespesa}`}>
                        {grupo.tipo === 'receita' ? '↑ Receita' : '↓ Despesa'}
                      </span>
                      <strong className={styles.grupoNome}>{grupo.nome}</strong>
                      <span className={styles.grupoCount}>{grupo.classificacoes.reduce((s, c) => s + c.lancamentos.length, 0)} lançamentos</span>
                    </div>
                    <div className={styles.grupoRight}>
                      <strong className={`${styles.grupoTotal} ${grupo.tipo === 'receita' ? styles.totalPositive : styles.totalNegative}`}>
                        {moeda(grupo.total)}
                      </strong>
                      <span className={styles.chevron}>{aberto ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Classificações */}
                  {aberto && (
                    <div className={styles.classificacoesList}>
                      {grupo.classificacoes.map(clf => {
                        const cKey = `${gKey}::${clf.nome}`
                        const cAberto = expandidosClf.has(cKey)
                        return (
                          <div key={cKey} className={styles.clfItem}>
                            <button className={styles.clfHeader} onClick={() => toggleClf(cKey)}>
                              <span className={styles.clfNome}>{clf.nome}</span>
                              <div className={styles.clfRight}>
                                <span className={styles.clfCount}>{clf.lancamentos.length} lançamento(s)</span>
                                <strong className={styles.clfTotal}>{moeda(clf.total)}</strong>
                                <span className={styles.chevronSm}>{cAberto ? '▲' : '▼'}</span>
                              </div>
                            </button>

                            {/* Lançamentos individuais */}
                            {cAberto && (
                              <table className={styles.lancTable}>
                                <thead>
                                  <tr><th>Data</th><th>Descrição</th><th>Valor</th></tr>
                                </thead>
                                <tbody>
                                  {clf.lancamentos.map((l, idx) => (
                                    <tr key={idx}>
                                      <td>{l.data}</td>
                                      <td>{l.descricao}</td>
                                      <td className={l.tipo === 'receita' ? styles.tdReceita : styles.tdDespesa}>
                                        {moeda(l.valor)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
