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

type Fase = 'idle' | 'processando' | 'revisao' | 'salvando' | 'concluido'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

/** Regras locais de fallback — mesmas da edge function, evitam chamada de rede */
const FALLBACK_RULES: Array<{ pattern: RegExp; tipo: 'receita' | 'despesa'; classificacao: string; grupo: string }> = [
  { pattern: /(venda|faturamento|consulta|atendimento|tratamento|servico prestado|honorario|receita|pagamento paciente)/i, tipo: 'receita', classificacao: 'Receita Dinheiro', grupo: 'Receitas Operacionais' },
  { pattern: /(pix|transferencia)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(cartao|card)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(rendimento|aplicacao|investimento financeiro)/i, tipo: 'receita', classificacao: 'Rendimento de Aplicação Financeira', grupo: 'Receitas Financeiras' },
  { pattern: /(cancelamento|devolucao|estorno)/i, tipo: 'despesa', classificacao: 'Vendas Canceladas / Devoluções', grupo: 'Deduções de Receita' },
  { pattern: /(taxa cartao|tarifa cartao|pos|maquininha|antecipacao)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Padrão', grupo: 'Deduções de Receita' },
  { pattern: /(simples nacional|imposto|iss|icms|pis|cofins|irpj|tributo|das )/i, tipo: 'despesa', classificacao: 'Impostos sobre Receitas - Simples Nacional', grupo: 'Impostos sobre Faturamento' },
  { pattern: /(material|insumo|implante|componente)/i, tipo: 'despesa', classificacao: 'Custo de Materiais e Insumos', grupo: 'Despesas Operacionais' },
  { pattern: /(laboratorio|tecnico dental)/i, tipo: 'despesa', classificacao: 'Serviços Técnicos para Laboratórios', grupo: 'Despesas Operacionais' },
  { pattern: /(dentista|terceiro pf|prestador|autonomo)/i, tipo: 'despesa', classificacao: 'Serviços Terceiros PF (dentistas)', grupo: 'Despesas Operacionais' },
  { pattern: /(royalt|assistencia tecnica franquia)/i, tipo: 'despesa', classificacao: 'Royalties e Assistência Técnica', grupo: 'Despesas Operacionais' },
  { pattern: /(marketing|midia|anuncio|google ads|meta ads|instagram|facebook ads)/i, tipo: 'despesa', classificacao: 'Marketing Digital', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(agencia|assessoria)/i, tipo: 'despesa', classificacao: 'Agência e Assessoria', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(pro.?labore)/i, tipo: 'despesa', classificacao: 'Pró-labore', grupo: 'Despesas com Pessoal' },
  { pattern: /(salario|ordenado|folha de pagamento)/i, tipo: 'despesa', classificacao: 'Salários e Ordenados', grupo: 'Despesas com Pessoal' },
  { pattern: /(13.? salario|decimo terceiro)/i, tipo: 'despesa', classificacao: '13° Salário', grupo: 'Despesas com Pessoal' },
  { pattern: /(rescisao|aviso previo|demissao)/i, tipo: 'despesa', classificacao: 'Rescisões', grupo: 'Despesas com Pessoal' },
  { pattern: /\binss\b/i, tipo: 'despesa', classificacao: 'INSS', grupo: 'Despesas com Pessoal' },
  { pattern: /\bfgts\b/i, tipo: 'despesa', classificacao: 'FGTS', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale transporte|vt\b)/i, tipo: 'despesa', classificacao: 'Vale Transporte', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale refeicao|vale alimentacao|vr\b|va\b)/i, tipo: 'despesa', classificacao: 'Vale Refeição', grupo: 'Despesas com Pessoal' },
  { pattern: /(combustivel|gasolina|etanol|abastecimento)/i, tipo: 'despesa', classificacao: 'Combustível', grupo: 'Despesas com Pessoal' },
  { pattern: /(aluguel|locacao|condominio)/i, tipo: 'despesa', classificacao: 'Aluguel', grupo: 'Despesas Administrativas' },
  { pattern: /(energia|luz\b|eletricidade)/i, tipo: 'despesa', classificacao: 'Energia Elétrica', grupo: 'Despesas Administrativas' },
  { pattern: /(agua\b|esgoto|sabesp|saneamento)/i, tipo: 'despesa', classificacao: 'Água e Esgoto', grupo: 'Despesas Administrativas' },
  { pattern: /(telefone|telefonia|celular|plano|vivo|claro|tim|oi\b)/i, tipo: 'despesa', classificacao: 'Telefonia', grupo: 'Despesas Administrativas' },
  { pattern: /(internet\b|banda larga|fibra)/i, tipo: 'despesa', classificacao: 'Internet', grupo: 'Despesas com TI' },
  { pattern: /(software|sistema|licenca|saas|assinatura)/i, tipo: 'despesa', classificacao: 'Sistema de Gestão', grupo: 'Despesas com TI' },
  { pattern: /(hospedagem|servidor|cloud|aws|gcp|azure)/i, tipo: 'despesa', classificacao: 'Hospedagem de Dados', grupo: 'Despesas com TI' },
  { pattern: /(computador|notebook|impressora|periférico|hardware)/i, tipo: 'despesa', classificacao: 'Investimento - Computadores e Periféricos', grupo: 'Investimentos' },
  { pattern: /(maquina|equipamento|autoclave|cadeira odonto)/i, tipo: 'despesa', classificacao: 'Investimento - Máquinas e Equipamentos', grupo: 'Investimentos' },
  { pattern: /(movel|mobilia|mesa|cadeira\b)/i, tipo: 'despesa', classificacao: 'Investimento - Móveis e Utensílios', grupo: 'Investimentos' },
  { pattern: /(reforma|instalacao|obra|construcao)/i, tipo: 'despesa', classificacao: 'Investimento - Instalações de Terceiros', grupo: 'Investimentos' },
  { pattern: /(contabilidade|contador|escritorio contabil)/i, tipo: 'despesa', classificacao: 'Contabilidade', grupo: 'Despesas Administrativas' },
  { pattern: /(advogado|juridico|advocacia)/i, tipo: 'despesa', classificacao: 'Jurídico', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza|higienizacao|faxina)/i, tipo: 'despesa', classificacao: 'Limpeza', grupo: 'Despesas Administrativas' },
  { pattern: /(seguranca|vigilancia|monitoramento)/i, tipo: 'despesa', classificacao: 'Segurança e Vigilância', grupo: 'Despesas Administrativas' },
  { pattern: /(seguro\b)/i, tipo: 'despesa', classificacao: 'Seguros', grupo: 'Despesas Administrativas' },
  { pattern: /(manutencao|reparo|conserto)/i, tipo: 'despesa', classificacao: 'Manutenção e Reparos', grupo: 'Despesas Administrativas' },
  { pattern: /(iof\b)/i, tipo: 'despesa', classificacao: 'IOF', grupo: 'Despesas Administrativas' },
  { pattern: /(juros|multa\b|mora\b)/i, tipo: 'despesa', classificacao: 'Multa e Juros s/ Contas Pagas em Atraso', grupo: 'Despesas Administrativas' },
  { pattern: /(financiamento|emprestimo|credito)/i, tipo: 'despesa', classificacao: 'Financiamentos / Empréstimos', grupo: 'Despesas Financeiras' },
  { pattern: /(tarifa bancaria|taxa bancaria|manutencao conta)/i, tipo: 'despesa', classificacao: 'Despesas Bancárias', grupo: 'Despesas Financeiras' },
  { pattern: /(depreciacao|amortizacao)/i, tipo: 'despesa', classificacao: 'Depreciação e Amortização', grupo: 'Despesas Financeiras' },
  { pattern: /(dividendo|distribuicao lucro|retirada socio)/i, tipo: 'despesa', classificacao: 'Dividendos e Despesas dos Sócios', grupo: 'Investimentos' },
  { pattern: /(consultoria\b)/i, tipo: 'despesa', classificacao: 'Consultoria', grupo: 'Despesas Administrativas' },
  { pattern: /(refeicao|almoco|lanche|restaurante)/i, tipo: 'despesa', classificacao: 'Refeições e Lanches', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(viagem|estadia|hotel|passagem)/i, tipo: 'despesa', classificacao: 'Viagens e Estadias', grupo: 'Despesas Administrativas' },
  { pattern: /(uber\b|taxi|99\b|ifood)/i, tipo: 'despesa', classificacao: 'Uber e Táxi', grupo: 'Despesas Administrativas' },
  { pattern: /(material escritorio|papel|caneta|toner)/i, tipo: 'despesa', classificacao: 'Material de Escritório', grupo: 'Despesas Administrativas' },
  { pattern: /(uniforme|epj|epi\b)/i, tipo: 'despesa', classificacao: 'Uniformes', grupo: 'Despesas Administrativas' },
  { pattern: /(estacionamento|parking)/i, tipo: 'despesa', classificacao: 'Estacionamento', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza\b|desinfetante|produto limpeza)/i, tipo: 'despesa', classificacao: 'Material de Limpeza', grupo: 'Despesas Administrativas' },
]

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Tenta classificar localmente sem chamada de rede. Retorna null se não houver match. */
function classificarLocal(descricao: string): { classificacao: string; grupo: string } | null {
  const text = normalize(descricao)
  for (const rule of FALLBACK_RULES) {
    if (rule.pattern.test(text)) {
      return { classificacao: rule.classificacao, grupo: rule.grupo }
    }
  }
  return null
}

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Converte DD/MM/AAAA → AAAA-MM-DD para salvar no banco */
function toISO(dataBR: string): string {
  const parts = dataBR.split('/')
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return dataBR
}

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
  const clean = s.replace(/[R$]/g, '').trim()
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(clean)) {
    return Math.abs(parseFloat(clean.replace(/\./g, '').replace(',', '.')))
  }
  return Math.abs(parseFloat(clean.replace(/,/g, '')) || 0)
}

/** Detecta se é entrada ou saída */
function parseTipo(raw: unknown, valor: number): 'receita' | 'despesa' {
  if (valor < 0) return 'despesa'
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return 'receita'
  if (
    s.includes('entra') || s.includes('créd') || s.includes('cred') ||
    s.includes('c ') || s === 'c' || s.includes('receita') || s === '+'
  ) return 'receita'
  return 'despesa'
}

/** Formata data de vários formatos para DD/MM/AAAA */
function formatarData(raw: unknown): string {
  if (!raw) return new Date().toLocaleDateString('pt-BR')
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000))
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }
  const s = String(raw).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Componente principal ──────────────────────────────────────────────────────

export function ExtratoUpload() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]           = useState(false)
  const [arquivo, setArquivo]             = useState<string>('')
  const [progresso, setProgresso]         = useState<{ atual: number; total: number } | null>(null)
  const [fase, setFase]                   = useState<Fase>('idle')
  const [linhasClass, setLinhasClass]     = useState<LinhaClassificada[]>([])
  const [selecionados, setSelecionados]   = useState<Set<number>>(new Set())
  const [erroSalvar, setErroSalvar]       = useState<string>('')
  const [sucessoSalvo, setSucessoSalvo]   = useState(0)
  const [msgErroUpload, setMsgErroUpload] = useState<string>('')

  const qtdErros       = linhasClass.filter(l => l.status === 'erro').length
  const todosChecked   = selecionados.size === linhasClass.length && linhasClass.length > 0
  const someChecked    = selecionados.size > 0 && !todosChecked
  const totalSelecionado = [...selecionados].reduce((s, i) => s + linhasClass[i].valor, 0)

  const toggleItem = (i: number) => setSelecionados(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const toggleTodos = () => {
    if (todosChecked || someChecked) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(linhasClass.map((_, i) => i)))
    }
  }

  const desmarcarErros = () =>
    setSelecionados(new Set(linhasClass.map((_, i) => i).filter(i => linhasClass[i].status === 'ok')))

  const reiniciar = () => {
    setFase('idle')
    setArquivo('')
    setLinhasClass([])
    setSelecionados(new Set())
    setErroSalvar('')
    setSucessoSalvo(0)
    setMsgErroUpload('')
  }

  const processarArquivo = useCallback(async (file: File) => {
    setArquivo(file.name)
    setLinhasClass([])
    setSelecionados(new Set())
    setErroSalvar('')
    setMsgErroUpload('')
    setFase('processando')
    setProgresso(null)

    let linhas: LinhaExtrato[] = []
    try {
      const buffer = await file.arrayBuffer()
      linhas = parsePlanilha(buffer)
    } catch {
      setMsgErroUpload('Não foi possível ler o arquivo. Verifique se é um arquivo Excel (.xlsx/.xls) ou CSV válido.')
      setFase('idle')
      return
    }

    if (linhas.length === 0) {
      setMsgErroUpload('Nenhuma linha com valor encontrada. Verifique o formato do arquivo.')
      setFase('idle')
      return
    }

    const [{ data: configData }, { data: classData }] = await Promise.all([
      supabase.from('configuracoes').select('valor').eq('chave', 'modelo_groq').single(),
      supabase.from('dre_classificacoes').select('nome,tipo').eq('ativo', true),
    ])
    const modelo = configData?.valor ?? DEFAULT_GROQ_MODEL
    const classificacoes = (classData ?? []) as { nome: string; tipo: string }[]

    // ── Passo 1: classificar localmente ───────────────────────────────────────
    const classificadas: LinhaClassificada[] = new Array(linhas.length)
    const indicesParaIA: number[] = []

    for (let i = 0; i < linhas.length; i++) {
      const local = classificarLocal(linhas[i].descricao)
      if (local) {
        classificadas[i] = { ...linhas[i], classificacao: local.classificacao, grupo: local.grupo, status: 'ok' }
      } else {
        indicesParaIA.push(i)
      }
    }

    setProgresso({ atual: linhas.length - indicesParaIA.length, total: linhas.length })

    // ── Passo 2: enviar em batch para IA (com delay para evitar rate limit) ───
    const BATCH_IA = 15  // ~3-4K tokens por chamada, dentro do limite do Groq (12K/min)
    const DELAY_ENTRE_BATCHES = 800  // ms — evita estourar o rate limit de tokens/min

    for (let b = 0; b < indicesParaIA.length; b += BATCH_IA) {
      if (b > 0) await sleep(DELAY_ENTRE_BATCHES)

      const fatia = indicesParaIA.slice(b, b + BATCH_IA)
      const lote  = fatia.map(i => linhas[i])

      try {
        const { data, error } = await supabase.functions.invoke('dre-ai-classify', {
          body: {
            lancamentos: lote.map(l => ({ descricao: l.descricao, valor: l.valor, tipo: l.tipo })),
            modelo,
            classificacoes_disponiveis: classificacoes.map(c => ({ nome: c.nome, tipo: c.tipo })),
          },
        })

        if (error || !data?.resultados) throw new Error(error?.message ?? 'Sem resposta da IA')

        const resultados = data.resultados as { classificacao_nome?: string; grupo?: string }[]
        fatia.forEach((linhaIdx, ri) => {
          const r = resultados[ri]
          classificadas[linhaIdx] = {
            ...linhas[linhaIdx],
            classificacao: String(r?.classificacao_nome ?? '').trim() || 'Outros',
            grupo:         String(r?.grupo ?? '').trim() || 'Outros',
            status: 'ok',
          }
        })
      } catch {
        fatia.forEach(linhaIdx => {
          classificadas[linhaIdx] = {
            ...linhas[linhaIdx],
            classificacao: 'Não classificado',
            grupo: 'Outros',
            status: 'erro',
          }
        })
      }

      setProgresso({
        atual: (linhas.length - indicesParaIA.length) + Math.min(b + BATCH_IA, indicesParaIA.length),
        total: linhas.length,
      })
    }

    const final = Array.from(classificadas)
    setLinhasClass(final)
    // Pré-seleciona só os classificados com sucesso; erros ficam desmarcados
    setSelecionados(new Set(final.map((_, i) => i).filter(i => final[i].status === 'ok')))
    setFase('revisao')
    setProgresso(null)
  }, [])

  const salvarTudo = async () => {
    setSelecionados(new Set(linhasClass.map((_, i) => i)))
    await salvarComIndices(new Set(linhasClass.map((_, i) => i)))
  }

  const salvarLancamentos = async () => {
    await salvarComIndices(selecionados)
  }

  const salvarComIndices = async (indices: Set<number>) => {
    setFase('salvando')
    setErroSalvar('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const toInsert = [...indices].sort((a, b) => a - b).map(i => ({
        user_id:          user?.id ?? null,
        descricao:        linhasClass[i].descricao,
        valor:            linhasClass[i].valor,
        tipo:             linhasClass[i].tipo,
        classificacao:    linhasClass[i].classificacao,
        grupo:            linhasClass[i].grupo,
        data_lancamento:  toISO(linhasClass[i].data),
      }))
      const { error } = await supabase.from('dre_lancamentos').insert(toInsert)
      if (error) throw new Error(error.message)
      setSucessoSalvo(toInsert.length)
      setFase('concluido')
    } catch (e) {
      setErroSalvar(`Erro ao salvar: ${e instanceof Error ? e.message : 'Desconhecido'}`)
      setFase('revisao')
    }
  }

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

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Importar Extrato / Planilha</h2>
          <p className={styles.sectionSubtitle}>
            Envie um extrato de banco ou planilha Excel — a IA classifica cada lançamento automaticamente.
          </p>
        </div>
        <a href="/exemplos/exemplo.xlsx" download className={styles.downloadBtn}>
          ↓ Baixar exemplo .xlsx
        </a>
      </div>

      {/* ── Drop zone (idle / processando) ──────────────────────────────────── */}
      {(fase === 'idle' || fase === 'processando') && (
        <>
          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''} ${fase === 'processando' ? styles.dropZoneLoading : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fase === 'idle' && fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
            {fase === 'processando' && progresso ? (
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
          {msgErroUpload && (
            <div className={styles.errosBox}>
              <strong>⚠️ {msgErroUpload}</strong>
            </div>
          )}
        </>
      )}

      {/* ── Revisão ─────────────────────────────────────────────────────────── */}
      {(fase === 'revisao' || fase === 'salvando') && linhasClass.length > 0 && (
        <div className={styles.reviewWrap}>

          {/* Cabeçalho da revisão */}
          <div className={styles.reviewHeader}>
            <div className={styles.reviewTitleWrap}>
              <strong className={styles.reviewTitle}>
                Revise os {linhasClass.length} lançamentos classificados
              </strong>
              {qtdErros > 0 && (
                <span className={styles.reviewErroBadge}>
                  ⚠ {qtdErros} com atenção — desmarcados automaticamente
                </span>
              )}
            </div>
            <div className={styles.reviewActions}>
              {qtdErros > 0 && (
                <button
                  className={styles.btnSecondary}
                  onClick={desmarcarErros}
                  disabled={fase === 'salvando'}
                >
                  Desmarcar com erro
                </button>
              )}
              <button
                className={styles.btnSecondary}
                onClick={reiniciar}
                disabled={fase === 'salvando'}
              >
                ↺ Novo arquivo
              </button>
            </div>
          </div>

          {erroSalvar && (
            <div className={styles.errosBox}><strong>⚠️ {erroSalvar}</strong></div>
          )}

          {/* Tabela de revisão */}
          <div className={styles.reviewTableWrap}>
            <table className={styles.reviewTable}>
              <thead>
                <tr>
                  <th className={styles.checkCell}>
                    <input
                      type="checkbox"
                      checked={todosChecked}
                      ref={el => { if (el) el.indeterminate = someChecked }}
                      onChange={toggleTodos}
                      title="Selecionar / Desselecionar todos"
                    />
                  </th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Classificação</th>
                  <th>Grupo</th>
                  <th className={styles.thValor}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhasClass.map((l, i) => (
                  <tr
                    key={i}
                    className={[
                      l.status === 'erro' ? styles.rowErro : '',
                      selecionados.has(i) ? styles.rowSelecionada : styles.rowDesmarcada,
                    ].join(' ')}
                    onClick={() => toggleItem(i)}
                  >
                    <td className={styles.checkCell}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(i)}
                        onChange={() => toggleItem(i)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className={styles.tdData}>{l.data}</td>
                    <td className={styles.tdDesc} title={l.descricao}>{l.descricao}</td>
                    <td>
                      <span className={`${styles.tipoPill} ${l.tipo === 'receita' ? styles.pillReceita : styles.pillDespesa}`}>
                        {l.tipo === 'receita' ? '↑ Rec' : '↓ Desp'}
                      </span>
                    </td>
                    <td className={styles.tdClf}>{l.classificacao}</td>
                    <td className={styles.tdGrupo}>{l.grupo}</td>
                    <td className={`${styles.tdValor} ${l.tipo === 'receita' ? styles.tdReceita : styles.tdDespesa}`}>
                      {moeda(l.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rodapé com botões de salvar */}
          <div className={styles.reviewFooter}>
            <span className={styles.footerInfo}>
              <strong>{selecionados.size}</strong> de {linhasClass.length} selecionados
              {' · '}
              Total: <strong>{moeda(totalSelecionado)}</strong>
            </span>
            <div className={styles.footerBtns}>
              <button
                className={styles.btnSecondary}
                onClick={salvarLancamentos}
                disabled={selecionados.size === 0 || fase === 'salvando'}
                title="Envia apenas os itens marcados na tabela"
              >
                {fase === 'salvando' ? 'Salvando…' : `Enviar selecionados (${selecionados.size})`}
              </button>
              <button
                className={styles.btnPrimary}
                onClick={salvarTudo}
                disabled={fase === 'salvando'}
                title="Envia todos os lançamentos do arquivo de uma vez"
              >
                {fase === 'salvando' ? 'Salvando…' : `Lançar Tudo (${linhasClass.length}) →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sucesso ─────────────────────────────────────────────────────────── */}
      {fase === 'concluido' && (
        <div className={styles.sucessoBox}>
          <span className={styles.sucessoIcon}>✓</span>
          <p><strong>{sucessoSalvo} lançamentos</strong> enviados com sucesso!</p>
          <button className={styles.btnPrimary} onClick={reiniciar}>
            Importar outro arquivo
          </button>
        </div>
      )}
    </section>
  )
}
