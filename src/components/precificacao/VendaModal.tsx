import { useEffect, useState } from 'react'
import styles from '../../pages/PrecificacaoPage.module.css'
import type {
  EmpresaPreco,
  EmpresaPrecificacaoConfig,
  EmpresaVenda,
  EmpresaVendaItem,
} from '../../lib/types'

export type VendaItemDraft = {
  id: string
  empresaPrecoId: string | null
  descricao: string
  precoUnitario: number
  quantidade: number
}

export type VendaCard = EmpresaVenda & {
  itens: EmpresaVendaItem[]
}

type VendaModalSubmitPayload = {
  id?: string
  clienteNome: string
  observacoes: string
  itens: VendaItemDraft[]
}

type VendaModalProps = {
  precos: EmpresaPreco[]
  taxaMaquinaPercent: number
  configVendas: EmpresaPrecificacaoConfig | null
  maxParcelasCartaoPadrao: number
  initialVenda?: VendaCard | null
  saving: boolean
  error: string
  onClose: () => void
  onSubmit: (payload: VendaModalSubmitPayload) => Promise<void>
}

const PRECIFICACAO_CATEGORIAS_ODONTO = [
  'Consultas e avaliacao',
  'Diagnostico por imagem',
  'Prevencao e profilaxia',
  'Dentistica restauradora',
  'Endodontia',
  'Periodontia',
  'Ortodontia',
  'Implantodontia',
  'Protese dentaria',
  'Cirurgia oral',
  'Odontopediatria',
  'Estetica dental e clareamento',
  'Harmonizacao orofacial',
  'DTM e dor orofacial',
  'Urgencia odontologica',
  'Materiais e insumos',
  'Biosseguranca e esterilizacao',
  'Equipamentos e instrumentais',
  'Laboratorio protetico',
  'Outros produtos e servicos odontologicos',
] as const

const CATEGORIA_SEM_CADASTRO = 'Sem categoria'
const CATEGORIA_ORDEM = new Map<string, number>(
  PRECIFICACAO_CATEGORIAS_ODONTO.map((cat, i): [string, number] => [cat, i]),
)

const FORMAS_PAGAMENTO = [
  { id: 'cartao', label: 'Divisao no cartao' },
  { id: 'boleto', label: 'Divisao no boleto' },
  { id: 'pix', label: 'Divisao no PIX' },
  { id: 'carne', label: 'Divisao no carne' },
] as const

function getCategoriaLabel(value?: string | null): string {
  return value?.trim() || CATEGORIA_SEM_CADASTRO
}

function buildPrecosPorCategoria(precos: EmpresaPreco[]) {
  const grouped = new Map<string, EmpresaPreco[]>()
  for (const item of precos) {
    const cat = getCategoriaLabel(item.categoria)
    const current = grouped.get(cat) ?? []
    current.push(item)
    grouped.set(cat, current)
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => {
      const aE = a === CATEGORIA_SEM_CADASTRO
      const bE = b === CATEGORIA_SEM_CADASTRO
      if (aE && !bE) return 1
      if (!aE && bE) return -1
      const ao = CATEGORIA_ORDEM.get(a)
      const bo = CATEGORIA_ORDEM.get(b)
      if (ao != null && bo != null) return ao - bo
      if (ao != null) return -1
      if (bo != null) return 1
      return a.localeCompare(b, 'pt-BR')
    })
    .map(([cat, itens]) => [
      cat,
      [...itens].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR')),
    ] as const)
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function mapVendaItensToDrafts(itens: EmpresaVendaItem[]): VendaItemDraft[] {
  return itens.map(item => ({
    id: item.id,
    empresaPrecoId: item.empresa_preco_id,
    descricao: item.descricao,
    precoUnitario: item.preco_unitario,
    quantidade: item.quantidade,
  }))
}

export default function VendaModal({
  precos,
  configVendas,
  initialVenda,
  saving,
  error,
  onClose,
  onSubmit,
}: VendaModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(initialVenda ? 3 : 1)
  const [clienteNome, setClienteNome] = useState<string>(initialVenda?.cliente_nome ?? '')
  const [planoNome, setPlanoNome] = useState<string>(initialVenda?.observacoes || 'Planejamento A')
  const [itens, setItens] = useState<VendaItemDraft[]>(() => mapVendaItensToDrafts(initialVenda?.itens ?? []))
  const [busca, setBusca] = useState<string>('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)
  const [erroLocal, setErroLocal] = useState<string>('')
  const [verificacaoIniciada, setVerificacaoIniciada] = useState<boolean>(Boolean(initialVenda))
  const [meiosLiberadosEm, setMeiosLiberadosEm] = useState<number | null>(initialVenda ? 0 : null)
  const [ofertaExpiraEm, setOfertaExpiraEm] = useState<number | null>(null)

  const precosPorCategoria = buildPrecosPorCategoria(precos)
  const categorias = precosPorCategoria.map(([cat]) => cat)
  const produtosSelecionadosIds = new Set<string>(
    itens.map((i: VendaItemDraft) => i.empresaPrecoId).filter((id): id is string => id !== null),
  )

  const produtosFiltrados = precos
    .filter(p => {
      const matchBusca = !busca || p.nome_produto.toLowerCase().includes(busca.toLowerCase())
      const matchCat = !categoriaFiltro || getCategoriaLabel(p.categoria) === categoriaFiltro
      return matchBusca && matchCat
    })
    .sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))

  const meiosPagamentoLiberados = verificacaoIniciada && (meiosLiberadosEm ?? 0) <= 0

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [saving, onClose])

  useEffect(() => {
    if (!verificacaoIniciada || meiosLiberadosEm == null || meiosLiberadosEm <= 0) return undefined
    const timer = window.setInterval(() => {
      setMeiosLiberadosEm((prev: number | null) => (prev == null || prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [verificacaoIniciada, meiosLiberadosEm])

  useEffect(() => {
    if (!verificacaoIniciada || ofertaExpiraEm == null || ofertaExpiraEm <= 0) return undefined
    const timer = window.setInterval(() => {
      setOfertaExpiraEm((prev: number | null) => (prev == null || prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [verificacaoIniciada, ofertaExpiraEm])

  const handleVerificarMeios = () => {
    setVerificacaoIniciada(true)
    setMeiosLiberadosEm(configVendas?.vendas_tempo_apresentacao_segundos ?? 0)
    setOfertaExpiraEm((configVendas?.vendas_oferta_valida_minutos ?? 15) * 60)
  }

  const toggleProduto = (preco: EmpresaPreco) => {
    if (produtosSelecionadosIds.has(preco.id)) {
      setItens((prev: VendaItemDraft[]) => prev.filter((i: VendaItemDraft) => i.empresaPrecoId !== preco.id))
    } else {
      setItens((prev: VendaItemDraft[]) => [
        ...prev,
        {
          id: `draft-${Date.now()}-${prev.length}`,
          empresaPrecoId: preco.id,
          descricao: preco.nome_produto,
          precoUnitario: preco.preco,
          quantidade: 1,
        },
      ])
    }
  }

  const handleSave = async () => {
    if (itens.length === 0) {
      setErroLocal('Selecione ao menos um produto ou servico.')
      return
    }
    setErroLocal('')
    await onSubmit({
      id: initialVenda?.id,
      clienteNome: clienteNome.trim(),
      observacoes: planoNome.trim(),
      itens,
    })
  }

  const goToStep1 = () => { setErroLocal(''); setStep(1) }
  const goToStep2 = () => { setErroLocal(''); setStep(2) }
  const goToStep3 = () => { setErroLocal(''); setStep(3) }

  const handleNextStep1 = () => {
    if (!clienteNome.trim()) { setErroLocal('Informe o nome do cliente.'); return }
    goToStep2()
  }

  const headerSub =
    step >= 3 ? `${clienteNome.trim()} — ${planoNome.trim()}` :
    step === 2 ? clienteNome.trim() :
    undefined

  return (
    <div className={styles.vendaOverlay}>

      {/* Cabeçalho */}
      <div className={styles.vendaHeader}>
        <div className={styles.vendaHeaderInfo}>
          <h2 className={styles.modalTitle}>
            {initialVenda ? 'Editar venda' : 'Nova venda'}
          </h2>
          {headerSub && (
            <p className={styles.calcItemName}>{headerSub}</p>
          )}
        </div>
        <button type="button" className={styles.modalClose} onClick={onClose} disabled={saving}>
          ×
        </button>
      </div>

      {/* Conteúdo */}
      <div className={styles.vendaContent}>

        {/* ── Etapa 1: Nome do cliente ── */}
        {step === 1 && (
          <div className={styles.vendaStepWrap}>
            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Nome do cliente</span>
              <input
                className={styles.modalInput}
                value={clienteNome}
                onChange={e => { setClienteNome(e.target.value); setErroLocal('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleNextStep1() }}
                placeholder="Ex: Maria Silva"
                autoFocus
                disabled={saving}
              />
            </label>
            {erroLocal && <p className={styles.formError}>{erroLocal}</p>}
          </div>
        )}

        {/* ── Etapa 2: Nome do planejamento ── */}
        {step === 2 && (
          <div className={styles.vendaStepWrap}>
            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Nome do planejamento</span>
              <input
                className={styles.modalInput}
                value={planoNome}
                onChange={e => setPlanoNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') goToStep3() }}
                placeholder="Ex: Planejamento A"
                autoFocus
                disabled={saving}
              />
            </label>
            {erroLocal && <p className={styles.formError}>{erroLocal}</p>}
          </div>
        )}

        {/* ── Etapa 3: Produtos + pagamento ── */}
        {step === 3 && (
          <div className={styles.vendaStep3Layout}>

            {/* Coluna esquerda — produtos */}
            <div className={styles.vendaStep3Left}>

              {/* Busca */}
              <input
                className={styles.modalInput}
                value={busca}
                onChange={e => { setBusca(e.target.value); setCategoriaFiltro(null) }}
                placeholder="Buscar produto ou servico..."
                disabled={saving}
              />

              {/* Chips de categoria */}
              <div className={styles.vendaCategoriaChips}>
                <button
                  type="button"
                  className={`${styles.btnSecondary} ${!categoriaFiltro ? styles.btnPrimary : ''}`}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 999 }}
                  onClick={() => { setCategoriaFiltro(null); setBusca('') }}
                >
                  Todos
                </button>
                {categorias.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    className={`${styles.btnSecondary} ${categoriaFiltro === cat ? styles.btnPrimary : ''}`}
                    style={{ fontSize: 12, padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}
                    onClick={() => { setCategoriaFiltro(prev => prev === cat ? null : cat); setBusca('') }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Lista de produtos — SEM precos */}
              <div className={styles.vendaProdutosLista}>
                {produtosFiltrados.length === 0 ? (
                  <p className={styles.sectionHint}>Nenhum produto encontrado.</p>
                ) : (
                  produtosFiltrados.map(item => {
                    const selecionado = produtosSelecionadosIds.has(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.vendaProdutoCard}
                        style={selecionado ? { borderColor: 'var(--text)', background: 'var(--bg-hover)' } : {}}
                        onClick={() => toggleProduto(item)}
                        disabled={saving}
                      >
                        {/* Checkbox */}
                        <span style={{
                          width: 18,
                          height: 18,
                          border: `2px solid ${selecionado ? 'var(--text)' : 'var(--text-muted)'}`,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: selecionado ? 'var(--text)' : 'transparent',
                          flexShrink: 0,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--bg-surface)',
                        }}>
                          {selecionado ? '✓' : ''}
                        </span>
                        <span className={styles.vendaProdutoNome}>{item.nome_produto}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Coluna direita — resumo e pagamento */}
            <div className={styles.vendaStep3Right}>

              {/* Resumo — sem precos */}
              <div className={styles.saleSummaryCard}>
                <h3 className={styles.sectionTitle}>Itens selecionados</h3>
                <div className={styles.summaryLine}>
                  <span>Cliente</span>
                  <strong>{clienteNome.trim() || '—'}</strong>
                </div>
                <div className={styles.summaryLine}>
                  <span>Planejamento</span>
                  <strong>{planoNome.trim() || '—'}</strong>
                </div>
                <div className={styles.summaryLine}>
                  <span>Itens</span>
                  <strong>{itens.length}</strong>
                </div>

                {itens.length > 0 && (
                  <div className={styles.saleItemList} style={{ marginTop: 8 }}>
                    {itens.map(item => (
                      <div key={item.id} className={styles.saleItemRow}>
                        <strong className={styles.saleItemName}>{item.descricao}</strong>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => setItens(prev => prev.filter(i => i.id !== item.id))}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verificar / Timer / Cards de pagamento */}
              {!verificacaoIniciada ? (
                <button
                  type="button"
                  className={styles.modalSubmit}
                  onClick={handleVerificarMeios}
                  disabled={saving}
                  style={{ width: '100%' }}
                >
                  Verificar meios de pagamento
                </button>
              ) : !meiosPagamentoLiberados ? (
                <div className={styles.saleSummaryCard} style={{ textAlign: 'center' }}>
                  <span className={styles.sectionHint}>Liberando meios de pagamento...</span>
                  <div className={styles.vendaTimerDisplay}>
                    {formatCountdown(meiosLiberadosEm ?? 0)}
                  </div>
                </div>
              ) : (
                <div className={styles.saleSummaryCard}>
                  <h3 className={styles.sectionTitle}>Meios de pagamento</h3>
                  <div className={styles.vendaPagamentoGrid}>
                    {FORMAS_PAGAMENTO.map(forma => (
                      <div key={forma.id} className={styles.vendaPagamentoCard}>
                        {forma.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Oferta valida */}
              {ofertaExpiraEm != null && (
                <div className={`${styles.vendaOfertaValida} ${ofertaExpiraEm <= 0 ? styles.vendaOfertaExpirada : ''}`}>
                  <span className={styles.vendaOfertaLabel}>
                    {ofertaExpiraEm > 0 ? 'Oferta valida por' : 'Oferta expirada'}
                  </span>
                  {ofertaExpiraEm > 0 && (
                    <span className={styles.vendaOfertaTimer}>
                      {formatCountdown(ofertaExpiraEm)}
                    </span>
                  )}
                </div>
              )}

              {(erroLocal || error) && (
                <p className={styles.formError}>{erroLocal || error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className={styles.vendaFormActions}>
        <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
          Cancelar
        </button>

        <div style={{ display: 'flex', gap: 12 }}>
          {step === 1 && (
            <button type="button" className={styles.modalSubmit} disabled={saving} onClick={handleNextStep1}>
              Proximo passo
            </button>
          )}
          {step === 2 && (
            <>
              <button type="button" className={styles.modalCancel} disabled={saving} onClick={goToStep1}>
                Voltar
              </button>
              <button type="button" className={styles.modalSubmit} disabled={saving} onClick={goToStep3}>
                Proximo
              </button>
            </>
          )}
          {step === 3 && (
            <>
              {!initialVenda && (
                <button type="button" className={styles.modalCancel} disabled={saving} onClick={goToStep2}>
                  Voltar
                </button>
              )}
              <button
                type="button"
                className={styles.modalSubmit}
                disabled={saving}
                onClick={() => { void handleSave() }}
              >
                {saving ? 'Salvando...' : initialVenda ? 'Salvar' : 'Criar venda'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
