import { useEffect, useState, type FormEvent } from 'react'
import { useBackdropDismiss } from '../../hooks/useBackdropDismiss'
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
  PRECIFICACAO_CATEGORIAS_ODONTO.map((categoria, index) => [categoria, index]),
)

const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatCurrencyInput = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function parsePreco(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeCategoria(value?: string | null) {
  const categoria = value?.trim()
  return categoria ? categoria : null
}

function getCategoriaLabel(value?: string | null) {
  return normalizeCategoria(value) ?? CATEGORIA_SEM_CADASTRO
}

function compareCategorias(a: string, b: string) {
  const aIsEmpty = a === CATEGORIA_SEM_CADASTRO
  const bIsEmpty = b === CATEGORIA_SEM_CADASTRO

  if (aIsEmpty && !bIsEmpty) return 1
  if (!aIsEmpty && bIsEmpty) return -1

  const aOrder = CATEGORIA_ORDEM.get(a)
  const bOrder = CATEGORIA_ORDEM.get(b)

  if (aOrder != null && bOrder != null) return aOrder - bOrder
  if (aOrder != null) return -1
  if (bOrder != null) return 1

  return a.localeCompare(b, 'pt-BR')
}

function buildPrecosPorCategoria(precos: EmpresaPreco[]) {
  const grouped = new Map<string, EmpresaPreco[]>()

  for (const item of precos) {
    const categoria = getCategoriaLabel(item.categoria)
    const current = grouped.get(categoria) ?? []
    current.push(item)
    grouped.set(categoria, current)
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => compareCategorias(a, b))
    .map(([categoria, itens]) => [
      categoria,
      [...itens].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR')),
    ] as const)
}

function calculateSubtotal(itens: Array<{ preco_unitario: number; quantidade: number }>) {
  return itens.reduce((total, item) => total + item.preco_unitario * item.quantidade, 0)
}

function sanitizeEntrada(subtotal: number, entradaValor: number) {
  return Math.min(Math.max(entradaValor, 0), subtotal)
}

function buildParcelas(
  subtotal: number,
  maxParcelas: number,
  taxaMaquinaPercent: number,
  entradaValor = 0,
) {
  const parcelas = Math.max(1, Math.floor(maxParcelas || 1))
  const entradaAplicada = sanitizeEntrada(subtotal, entradaValor)
  const saldoParcelado = Math.max(subtotal - entradaAplicada, 0)
  const taxa = taxaMaquinaPercent > 0 && taxaMaquinaPercent < 100
    ? taxaMaquinaPercent / 100
    : 0

  return Array.from({ length: parcelas }, (_, index) => {
    const parcela = index + 1
    const totalCobradoParcelado = taxa > 0 ? saldoParcelado / (1 - taxa) : saldoParcelado
    return {
      parcela,
      entradaAplicada,
      saldoParcelado,
      totalCobradoParcelado,
      valorParcela: totalCobradoParcelado / parcela,
      totalProposta: entradaAplicada + totalCobradoParcelado,
    }
  })
}

function buildFormaPagamento(subtotal: number, parcelas: number, taxaPercent: number, entradaValor = 0) {
  const qtdParcelas = Math.max(1, Math.floor(parcelas || 1))
  const entradaAplicada = sanitizeEntrada(subtotal, entradaValor)
  const saldoParcelado = Math.max(subtotal - entradaAplicada, 0)
  const taxa = taxaPercent > 0 && taxaPercent < 100 ? taxaPercent / 100 : 0
  const totalCobradoParcelado = taxa > 0 ? saldoParcelado / (1 - taxa) : saldoParcelado

  return {
    entradaAplicada,
    saldoParcelado,
    totalCobradoParcelado,
    totalCobrado: entradaAplicada + totalCobradoParcelado,
    valorParcela: totalCobradoParcelado / qtdParcelas,
    parcelas: qtdParcelas,
  }
}

function parsePositiveInteger(value: string, fallback: number, min = 0) {
  const parsed = Math.floor(Number(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, parsed)
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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
  taxaMaquinaPercent,
  configVendas,
  maxParcelasCartaoPadrao,
  initialVenda,
  saving,
  error,
  onClose,
  onSubmit,
}: VendaModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose, saving)
  const [clienteNome, setClienteNome] = useState(initialVenda?.cliente_nome ?? '')
  const [observacoes, setObservacoes] = useState(initialVenda?.observacoes ?? '')
  const [itens, setItens] = useState<VendaItemDraft[]>(() => mapVendaItensToDrafts(initialVenda?.itens ?? []))
  const [selectedPrecoId, setSelectedPrecoId] = useState('')
  const [selectedQtd, setSelectedQtd] = useState('1')
  const [erroLocal, setErroLocal] = useState('')
  const [verificacaoIniciada, setVerificacaoIniciada] = useState(Boolean(initialVenda))
  const [meiosLiberadosEm, setMeiosLiberadosEm] = useState<number | null>(initialVenda ? 0 : null)
  const [ofertaExpiraEm, setOfertaExpiraEm] = useState<number | null>(
    initialVenda ? (configVendas?.vendas_oferta_valida_minutos ?? 15) * 60 : null,
  )
  const [precoApresentacao, setPrecoApresentacao] = useState('')
  const [entradaApresentacao, setEntradaApresentacao] = useState('0,00')
  const [formaPagamento, setFormaPagamento] = useState<'cartao' | 'boleto' | 'pix' | 'carne'>('cartao')
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState('1')

  const subtotal = calculateSubtotal(itens.map(item => ({
    preco_unitario: item.precoUnitario,
    quantidade: item.quantidade,
  })))
  const produtosSelecionadosIds = new Set(itens.map(item => item.empresaPrecoId).filter(Boolean))
  const sugestoesAncoragem = [...precos]
    .filter(item => !produtosSelecionadosIds.has(item.id))
    .sort((a, b) => b.preco - a.preco)
    .slice(0, 4)
  const precosPorCategoria = buildPrecosPorCategoria(precos)
  const formasDisponiveis = [
    {
      id: 'cartao' as const,
      label: 'Cartao',
      maxParcelas: Math.max(0, configVendas?.vendas_max_cartao ?? maxParcelasCartaoPadrao),
      taxaPercent: taxaMaquinaPercent,
      resumoUnico: 'Parcelamento no cartao',
    },
    {
      id: 'boleto' as const,
      label: 'Boleto',
      maxParcelas: Math.max(0, configVendas?.vendas_max_boleto ?? 1),
      taxaPercent: 0,
      resumoUnico: 'Boleto bancario',
    },
    {
      id: 'pix' as const,
      label: 'PIX',
      maxParcelas: Math.max(0, configVendas?.vendas_max_pix ?? 1),
      taxaPercent: 0,
      resumoUnico: 'Pagamento via PIX',
    },
    {
      id: 'carne' as const,
      label: 'Carne',
      maxParcelas: Math.max(0, configVendas?.vendas_max_carne ?? 1),
      taxaPercent: 0,
      resumoUnico: 'Parcelamento no carne',
    },
  ].filter(item => item.maxParcelas > 0)
  const formaAtual = formasDisponiveis.find(item => item.id === formaPagamento) ?? {
    id: 'cartao' as const,
    label: 'Cartao',
    maxParcelas: 1,
    taxaPercent: taxaMaquinaPercent,
    resumoUnico: 'Parcelamento no cartao',
  }
  const precoBaseCalculado = parsePreco(precoApresentacao)
  const baseApresentacao = precoBaseCalculado > 0 ? precoBaseCalculado : subtotal
  const entradaAplicada = sanitizeEntrada(baseApresentacao, parsePreco(entradaApresentacao))
  const qtdParcelas = Math.min(
    parsePositiveInteger(parcelasSelecionadas, 1, 1),
    Math.max(1, formaAtual.maxParcelas),
  )
  const resumoPagamento = buildFormaPagamento(baseApresentacao, qtdParcelas, formaAtual.taxaPercent, entradaAplicada)
  const parcelasApresentacao = buildParcelas(baseApresentacao, formaAtual.maxParcelas, formaAtual.taxaPercent, entradaAplicada)
  const meiosPagamentoLiberados = verificacaoIniciada && (meiosLiberadosEm ?? 0) <= 0

  useEffect(() => {
    setPrecoApresentacao(formatCurrencyInput(subtotal))
  }, [subtotal])

  useEffect(() => {
    if (!formasDisponiveis.some(item => item.id === formaPagamento)) {
      setFormaPagamento(formasDisponiveis[0]?.id ?? 'cartao')
    }
  }, [formaPagamento, formasDisponiveis])

  useEffect(() => {
    const parcelasClamped = Math.min(
      parsePositiveInteger(parcelasSelecionadas, 1, 1),
      Math.max(1, formaAtual.maxParcelas),
    )

    if (String(parcelasClamped) !== parcelasSelecionadas) {
      setParcelasSelecionadas(String(parcelasClamped))
    }
  }, [formaAtual.maxParcelas, parcelasSelecionadas])

  useEffect(() => {
    if (!verificacaoIniciada || meiosLiberadosEm == null || meiosLiberadosEm <= 0) return undefined

    const timer = window.setInterval(() => {
      setMeiosLiberadosEm(prev => (prev == null || prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [verificacaoIniciada, meiosLiberadosEm])

  useEffect(() => {
    if (!verificacaoIniciada || ofertaExpiraEm == null || ofertaExpiraEm <= 0) return undefined

    const timer = window.setInterval(() => {
      setOfertaExpiraEm(prev => (prev == null || prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [verificacaoIniciada, ofertaExpiraEm])

  const addProduto = (precoSelecionado: EmpresaPreco, quantidade = 1) => {
    setItens(prev => [
      ...prev,
      {
        id: `draft-${Date.now()}-${prev.length}`,
        empresaPrecoId: precoSelecionado.id,
        descricao: precoSelecionado.nome_produto,
        precoUnitario: precoSelecionado.preco,
        quantidade,
      },
    ])
  }

  const handleAddItem = () => {
    const precoSelecionado = precos.find(item => item.id === selectedPrecoId)
    if (!precoSelecionado) {
      setErroLocal('Selecione um produto ou servico da lista.')
      return
    }

    const quantidade = Math.max(1, Number(selectedQtd) || 1)

    addProduto(precoSelecionado, quantidade)
    setSelectedPrecoId('')
    setSelectedQtd('1')
    setErroLocal('')
  }

  const handleRemoveItem = (id: string) => {
    setItens(prev => prev.filter(item => item.id !== id))
  }

  const handleVerificarMeiosPagamento = () => {
    if (!clienteNome.trim()) {
      setErroLocal('Informe o nome do cliente antes de verificar os meios de pagamento.')
      return
    }

    setErroLocal('')
    setVerificacaoIniciada(true)
    setMeiosLiberadosEm(configVendas?.vendas_tempo_apresentacao_segundos ?? 0)
    setOfertaExpiraEm((configVendas?.vendas_oferta_valida_minutos ?? 15) * 60)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!clienteNome.trim()) {
      setErroLocal('Informe o nome do cliente.')
      return
    }

    if (itens.length === 0) {
      setErroLocal('Adicione ao menos um produto ou servico.')
      return
    }

    setErroLocal('')

    await onSubmit({
      id: initialVenda?.id,
      clienteNome: clienteNome.trim(),
      observacoes: observacoes.trim(),
      itens,
    })
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={`${styles.modal} ${styles.saleModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{initialVenda ? 'Editar apresentacao' : 'Nova apresentacao'}</h2>
            <p className={styles.calcItemName}>Comece pelo nome e libere o restante da apresentacao quando for a hora certa.</p>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </div>

        <form
          className={verificacaoIniciada ? styles.saleForm : `${styles.saleForm} ${styles.saleFormSingleColumn}`}
          onSubmit={handleSubmit}
        >
          <div className={styles.saleFormMain}>
            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Nome do cliente</span>
              <input
                className={styles.modalInput}
                value={clienteNome}
                onChange={e => {
                  setClienteNome(e.target.value)
                  setErroLocal('')
                }}
                placeholder="Ex: Maria Silva"
                autoFocus
                disabled={saving}
              />
            </label>

            <div className={styles.saleSummaryCard}>
              <div className={styles.addItemHeader}>
                <h3 className={styles.sectionTitle}>Verificacao dos meios de pagamento</h3>
                <span className={styles.sectionHint}>Abertura da apresentacao comercial</span>
              </div>
              <button
                type="button"
                className={styles.modalSubmit}
                onClick={handleVerificarMeiosPagamento}
                disabled={saving}
              >
                Verificar meios de pagamento para o cliente
              </button>
              <p className={styles.sectionHint}>
                {verificacaoIniciada
                  ? meiosPagamentoLiberados
                    ? 'Os meios de pagamento ja estao liberados para esta apresentacao.'
                    : `Timer em andamento. Liberacao prevista em ${formatCountdown(meiosLiberadosEm ?? 0)}.`
                  : 'Somente o nome fica visivel neste primeiro passo. O restante aparece depois da verificacao.'}
              </p>
            </div>

            {!verificacaoIniciada && (erroLocal || error) && <p className={styles.formError}>{erroLocal || error}</p>}

            {verificacaoIniciada && (
              <>
                <label className={styles.modalField}>
                  <span className={styles.modalLabel}>Observacoes</span>
                  <textarea
                    className={`${styles.modalInput} ${styles.modalTextarea}`}
                    value={observacoes}
                    onChange={e => setObservacoes(e.target.value)}
                    placeholder="Anotacoes para a proposta"
                    rows={3}
                    disabled={saving}
                  />
                </label>

                <div className={styles.addItemPanel}>
                  <div className={styles.addItemHeader}>
                    <h3 className={styles.sectionTitle}>Produtos e servicos</h3>
                    <span className={styles.sectionHint}>Adicione itens da sua lista de precos</span>
                  </div>

                  <div className={styles.addItemRow}>
                    <select
                      className={styles.modalInput}
                      value={selectedPrecoId}
                      onChange={e => setSelectedPrecoId(e.target.value)}
                      disabled={saving}
                    >
                      <option value="">Selecione um produto ou servico</option>
                      {precosPorCategoria.map(([categoria, itensCategoria]) => (
                        <optgroup key={categoria} label={categoria}>
                          {itensCategoria.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.nome_produto} - {formatCurrency(item.preco)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    <input
                      className={`${styles.modalInput} ${styles.qtyInput}`}
                      type="number"
                      min="1"
                      step="1"
                      value={selectedQtd}
                      onChange={e => setSelectedQtd(e.target.value)}
                      disabled={saving}
                    />

                    <button type="button" className={styles.btnSecondary} onClick={handleAddItem} disabled={saving}>
                      <IconPlus /> Adicionar
                    </button>
                  </div>

                  <p className={styles.sectionHint}>Voce pode adicionar mais de um produto ou servico na mesma apresentacao.</p>

                  {sugestoesAncoragem.length > 0 && (
                    <div className={styles.anchorPanel}>
                      <div className={styles.addItemHeader}>
                        <h4 className={styles.sectionTitle}>Sugestoes de ancoragem</h4>
                        <span className={styles.sectionHint}>Produtos de maior valor para apoiar a proposta</span>
                      </div>
                      <div className={styles.anchorGrid}>
                        {sugestoesAncoragem.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            className={styles.anchorCard}
                            onClick={() => {
                              addProduto(item, 1)
                              setErroLocal('')
                            }}
                          >
                            <span>{item.nome_produto}</span>
                            <strong>{formatCurrency(item.preco)}</strong>
                            <small>{getCategoriaLabel(item.categoria)}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {itens.length === 0 ? (
                    <p className={styles.sectionHint}>Nenhum item adicionado ainda.</p>
                  ) : (
                    <div className={styles.saleItemList}>
                      {itens.map(item => (
                        <div key={item.id} className={styles.saleItemRow}>
                          <div>
                            <strong className={styles.saleItemName}>{item.descricao}</strong>
                            <span className={styles.saleItemMeta}>
                              {item.quantidade}x {formatCurrency(item.precoUnitario)}
                            </span>
                          </div>
                          <div className={styles.saleItemActions}>
                            <strong className={styles.saleItemTotal}>
                              {formatCurrency(item.precoUnitario * item.quantidade)}
                            </strong>
                            <button type="button" className={styles.removeButton} onClick={() => handleRemoveItem(item.id)}>
                              Remover
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {verificacaoIniciada && (
            <div className={styles.saleFormSidebar}>
              <div className={styles.saleSummaryCard}>
                <h3 className={styles.sectionTitle}>Resumo da apresentacao</h3>
                <div className={styles.summaryLine}>
                  <span>Cliente</span>
                  <strong>{clienteNome.trim() || '-'}</strong>
                </div>
                <div className={styles.summaryLine}>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(subtotal)}</strong>
                </div>
                <div className={styles.summaryLine}>
                  <span>Itens</span>
                  <strong>{itens.length}</strong>
                </div>
                <div className={styles.presentationCountdownRow}>
                  <div className={styles.presentationCountdownCard}>
                    <span>Oferta valida</span>
                    <strong>
                      {ofertaExpiraEm != null && ofertaExpiraEm > 0
                        ? formatCountdown(ofertaExpiraEm)
                        : 'Expirada'}
                    </strong>
                    <small>Tempo configurado para fechar a proposta</small>
                  </div>
                  <div className={styles.presentationCountdownCard}>
                    <span>Meios de pagamento</span>
                    <strong>{meiosPagamentoLiberados ? 'Liberados' : formatCountdown(meiosLiberadosEm ?? 0)}</strong>
                    <small>
                      {meiosPagamentoLiberados
                        ? 'Prontos para apresentar ao cliente'
                        : 'Aguardando o timer configurado'}
                    </small>
                  </div>
                </div>
              </div>

              <div className={styles.saleSummaryCard}>
                <h3 className={styles.sectionTitle}>Apresentacao de pagamento</h3>
                <div className={styles.presentationControls}>
                  <div className={styles.presentationSelectorBlock}>
                    <span className={styles.modalLabel}>Preco a vista</span>
                    <div className={styles.presentationPriceCard}>
                      <input
                        className={styles.presentationPriceInput}
                        value={precoApresentacao}
                        onChange={e => setPrecoApresentacao(e.target.value)}
                        inputMode="decimal"
                        placeholder="Ex: 3.500,00"
                        disabled={saving}
                      />
                      <small>Use o valor base que sera apresentado ao cliente.</small>
                    </div>
                  </div>

                  {!meiosPagamentoLiberados ? (
                    <div className={styles.presentationDelayBlock}>
                      <strong>Meios de pagamento ainda nao liberados</strong>
                      <span>As opcoes serao exibidas em {formatCountdown(meiosLiberadosEm ?? 0)}.</span>
                    </div>
                  ) : (
                    <>
                      {configVendas?.vendas_exibir_campanha_promocional && (
                        <div className={styles.presentationCampaign}>
                          <span>Campanha promocional ativa</span>
                          <strong>Condicao especial liberada antes do valor final.</strong>
                          <small>Use esse momento para reforcar urgencia e valor percebido.</small>
                        </div>
                      )}

                      <div className={styles.presentationSelectorBlock}>
                        <span className={styles.modalLabel}>Entrada</span>
                        <div className={styles.presentationPriceCard}>
                          <input
                            className={styles.presentationPriceInput}
                            value={entradaApresentacao}
                            onChange={e => setEntradaApresentacao(e.target.value)}
                            inputMode="decimal"
                            placeholder="Ex: 1.000,00"
                            disabled={saving}
                          />
                        </div>
                      </div>

                      <div className={styles.presentationSelectorBlock}>
                        <span className={styles.modalLabel}>Forma de pagamento</span>
                        <div className={styles.presentationSelectorGrid}>
                          {formasDisponiveis.map(item => {
                            const previewParcelas = Math.max(1, item.maxParcelas)
                            const previewResumo = buildFormaPagamento(
                              baseApresentacao,
                              previewParcelas,
                              item.taxaPercent,
                              entradaAplicada,
                            )

                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`${styles.presentationSelectCard} ${item.id === formaPagamento ? styles.presentationSelectCardActive : ''}`}
                                onClick={() => setFormaPagamento(item.id)}
                              >
                                <span>{item.label}</span>
                                <strong>
                                  {previewParcelas > 1
                                    ? formatCurrency(previewResumo.valorParcela)
                                    : formatCurrency(previewResumo.totalCobrado)}
                                </strong>
                                <small>
                                  {previewParcelas > 1
                                    ? `Ate ${previewParcelas}x disponivel`
                                    : item.resumoUnico}
                                </small>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {formaAtual.maxParcelas > 1 && (
                        <div className={styles.presentationSelectorBlock}>
                          <span className={styles.modalLabel}>Parcelas</span>
                          <div className={styles.presentationParcelasGrid}>
                            {parcelasApresentacao.map(opcao => (
                              <button
                                key={opcao.parcela}
                                type="button"
                                className={`${styles.presentationParcelaCard} ${opcao.parcela === resumoPagamento.parcelas ? styles.presentationParcelaCardActive : ''}`}
                                onClick={() => setParcelasSelecionadas(String(opcao.parcela))}
                              >
                                <span>{opcao.parcela}x</span>
                                <strong>{formatCurrency(opcao.valorParcela)}</strong>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {resumoPagamento.entradaAplicada > 0 && (
                        <div className={styles.summaryLine}>
                          <span>Entrada</span>
                          <strong>{formatCurrency(resumoPagamento.entradaAplicada)}</strong>
                        </div>
                      )}
                      <div className={styles.summaryLine}>
                        <span>Total final</span>
                        <strong>{formatCurrency(resumoPagamento.totalCobrado)}</strong>
                      </div>
                      <div className={styles.summaryLine}>
                        <span>{formaAtual.maxParcelas > 1 ? `${resumoPagamento.parcelas}x em ${formaAtual.label}` : formaAtual.label}</span>
                        <strong>
                          {formatCurrency(
                            formaAtual.maxParcelas > 1
                              ? resumoPagamento.valorParcela
                              : resumoPagamento.totalCobrado,
                          )}
                        </strong>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {(verificacaoIniciada && (erroLocal || error)) && <p className={styles.formError}>{erroLocal || error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            {verificacaoIniciada && (
              <button type="submit" className={styles.modalSubmit} disabled={saving}>
                {saving ? 'Salvando...' : initialVenda ? 'Salvar apresentacao' : 'Criar apresentacao'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
