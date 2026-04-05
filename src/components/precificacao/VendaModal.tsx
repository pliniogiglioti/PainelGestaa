import { useEffect, useRef, useState } from 'react'
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
  { id: 'cartao', label: 'Cartao', hint: 'Entrada suave para fechar ainda hoje' },
  { id: 'boleto', label: 'Boleto', hint: 'Parcelas organizadas para facilitar a decisao' },
  { id: 'pix', label: 'PIX', hint: 'Condicao agil para quem quer resolver agora' },
  { id: 'carne', label: 'Carne', hint: 'Opcao acessivel para ampliar a chance de aceite' },
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

function calculateSubtotal(itens: VendaItemDraft[]) {
  return itens.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0)
}

function buildFormaPagamento(subtotal: number, parcelas: number, taxaPercent: number) {
  const qtdParcelas = Math.max(1, Math.floor(parcelas || 1))
  const taxa = taxaPercent > 0 && taxaPercent < 100 ? taxaPercent / 100 : 0
  const totalCobrado = taxa > 0 ? subtotal / (1 - taxa) : subtotal

  return {
    totalCobrado,
    valorParcela: totalCobrado / qtdParcelas,
    parcelas: qtdParcelas,
  }
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialVenda ? 4 : 1)
  const [clienteNome, setClienteNome] = useState<string>(initialVenda?.cliente_nome ?? '')
  const [planoNome, setPlanoNome] = useState<string>(initialVenda?.observacoes || 'Proposta em planejamento')
  const [itens, setItens] = useState<VendaItemDraft[]>(() => mapVendaItensToDrafts(initialVenda?.itens ?? []))
  const [busca, setBusca] = useState<string>('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)
  const [erroLocal, setErroLocal] = useState<string>('')
  const [verificacaoIniciada, setVerificacaoIniciada] = useState<boolean>(Boolean(initialVenda))
  const [meiosLiberadosEm, setMeiosLiberadosEm] = useState<number | null>(initialVenda ? 0 : null)
  const [ofertaExpiraEm, setOfertaExpiraEm] = useState<number | null>(null)
  const [formaPagamento, setFormaPagamento] = useState<string | null>(null)

  const input1Ref = useRef<HTMLInputElement>(null)
  const input2Ref = useRef<HTMLInputElement>(null)

  const precosPorCategoria = buildPrecosPorCategoria(precos)
  const categorias = precosPorCategoria.map(([cat]) => cat)
  const produtosSelecionadosIds = new Set<string>(
    itens.map((i: VendaItemDraft) => i.empresaPrecoId).filter((id): id is string => id !== null && typeof id === 'string'),
  )

  const produtosFiltrados = precos
    .filter(p => {
      const matchBusca = !busca || p.nome_produto.toLowerCase().includes(busca.toLowerCase())
      const matchCat = !categoriaFiltro || getCategoriaLabel(p.categoria) === categoriaFiltro
      return matchBusca && matchCat
    })
    .sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))

  const clienteNomeExibicao = clienteNome.trim() || 'seu paciente'
  const subtotalSelecionado = calculateSubtotal(itens)
  const formasPagamentoDisponiveis = FORMAS_PAGAMENTO
    .map(forma => {
      const maxParcelas = forma.id === 'cartao'
        ? Math.max(0, configVendas?.vendas_max_cartao ?? maxParcelasCartaoPadrao)
        : forma.id === 'boleto'
          ? Math.max(0, configVendas?.vendas_max_boleto ?? 1)
          : forma.id === 'pix'
            ? Math.max(0, configVendas?.vendas_max_pix ?? 1)
            : Math.max(0, configVendas?.vendas_max_carne ?? 1)

      if (maxParcelas <= 0) return null

      const taxaPercent = forma.id === 'cartao'
        ? taxaMaquinaPercent
        : forma.id === 'boleto'
          ? (configVendas?.taxa_boleto_percent ?? 0)
          : 0

      const resumo = buildFormaPagamento(subtotalSelecionado, maxParcelas, taxaPercent)

      return {
        ...forma,
        maxParcelas,
        total: resumo.totalCobrado,
        parcela: resumo.valorParcela,
      }
    })
    .filter((forma): forma is NonNullable<typeof forma> => forma !== null)

  useEffect(() => {
    if (step === 1) input1Ref.current?.focus()
    if (step === 2) input2Ref.current?.focus()
  }, [step])

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
    setStep(4)
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

  const handleNextStep1 = () => {
    if (!clienteNome.trim()) { setErroLocal('Informe o nome do cliente.'); return }
    setErroLocal('')
    setStep(2)
  }

  const handleNextStep2 = () => {
    setErroLocal('')
    setStep(3)
  }

  return (
    <div className={styles.vendaOverlay} onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className={styles.vendaContainer}>

        {/* Botão X flutuante */}
        <button type="button" className={styles.vendaCloseBtn} onClick={onClose} disabled={saving}>
          ×
        </button>

        {/* Corpo rolável */}
        <div className={styles.vendaBody}>

          {/* Etapa 1 — nome do cliente */}
          {step === 1 && (
            <div className={styles.vendaStepWrapper}>
              <div className={styles.vendaStepCenter}>
                <span className={styles.vendaStepLabel}>Como se chama o seu paciente?</span>
                <input
                  ref={input1Ref}
                  className={styles.vendaStepInput}
                  value={clienteNome}
                  onChange={e => { setClienteNome(e.target.value); setErroLocal('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handleNextStep1() }}
                  placeholder="Nome completo"
                  disabled={saving}
                />
                {erroLocal && <span className={styles.vendaErro}>{erroLocal}</span>}
                <span className={styles.vendaStepHint}>Pressione Enter para continuar</span>
              </div>
            </div>
          )}

          {/* Etapa 2 — nome do planejamento */}
          {step === 2 && (
            <div className={styles.vendaStepWrapper}>
              <div className={styles.vendaStepCenter}>
                <span className={styles.vendaStepLabel}>Nome da proposta</span>
                <input
                  ref={input2Ref}
                  className={styles.vendaStepInput}
                  value={planoNome}
                  onChange={e => setPlanoNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNextStep2() }}
                  placeholder="Proposta em planejamento"
                  disabled={saving}
                />
                <span className={styles.vendaStepHint}>Pressione Enter para continuar</span>
              </div>
            </div>
          )}

          {/* Etapa 3 — produtos */}
          {step === 3 && (
            <div className={styles.vendaColLeft}>
              <div className={styles.vendaResultadoHeader}>
                <span className={styles.vendaResultadoLabel}>Proposta em planejamento</span>
                <strong className={styles.vendaResultadoTitulo}>{planoNome.trim() || 'Proposta em planejamento'}</strong>
                <span className={styles.vendaResultadoSub}>
                  Selecione os produtos para montar a proposta de {clienteNomeExibicao}.
                </span>
              </div>

              <div className={styles.vendaSearch}>
                <span className={styles.vendaSearchIcon}>⌕</span>
                <input
                  className={styles.vendaSearchInput}
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setCategoriaFiltro(null) }}
                  placeholder="Buscar produto ou servico..."
                  disabled={saving}
                />
              </div>

              <div className={styles.vendaChips}>
                <button
                  type="button"
                  className={`${styles.vendaChip} ${!categoriaFiltro ? styles.vendaChipAtivo : ''}`}
                  onClick={() => { setCategoriaFiltro(null); setBusca('') }}
                >
                  Todos
                </button>
                {categorias.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    className={`${styles.vendaChip} ${categoriaFiltro === cat ? styles.vendaChipAtivo : ''}`}
                    onClick={() => { setCategoriaFiltro(prev => prev === cat ? null : cat); setBusca('') }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className={styles.vendaProdutoLista}>
                {produtosFiltrados.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: 14 }}>Nenhum produto encontrado.</p>
                ) : (
                  produtosFiltrados.map(item => {
                    const selecionado = produtosSelecionadosIds.has(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.vendaProdutoItem} ${selecionado ? styles.vendaProdutoItemAtivo : ''}`}
                        onClick={() => toggleProduto(item)}
                        disabled={saving}
                      >
                        <span className={`${styles.vendaCirculo} ${selecionado ? styles.vendaCirculoAtivo : ''}`}>
                          {selecionado && <span className={styles.vendaCirculoPonto} />}
                        </span>
                        <span className={styles.vendaProdutoConteudo}>
                          <span className={styles.vendaProdutoNome}>{item.nome_produto}</span>
                          <span className={styles.vendaProdutoMeta}>{getCategoriaLabel(item.categoria)}</span>
                        </span>
                      </button>
                    )
                  })
                )}
              </div>

              {itens.length > 0 && (
                <button
                  type="button"
                  className={styles.vendaVerificarBtn}
                  onClick={handleVerificarMeios}
                  disabled={saving}
                >
                  Buscar propostas para IA
                </button>
              )}
            </div>
          )}

          {/* Etapa 4 — buscando / meios de pagamento */}
          {step === 4 && (
            <div className={styles.vendaStepWrapper}>
              {(meiosLiberadosEm ?? 0) > 0 ? (
                <div className={styles.vendaProcurando}>
                  <div className={styles.vendaPulseOrb} aria-hidden="true">
                    <span className={styles.vendaPulseCore} />
                    <span className={styles.vendaPulseRing} />
                    <span className={styles.vendaPulseRingDelayed} />
                  </div>
                  <span className={styles.vendaProcurandoTexto}>
                    Procurando propostas de pagamento para {clienteNomeExibicao}
                  </span>
                  <span className={styles.vendaProcurandoSub}>
                    A IA esta montando as melhores condicoes para aumentar a chance de fechamento.
                  </span>
                </div>
              ) : (
                <div className={styles.vendaPagamentoStage}>
                  <div className={styles.vendaResultadoHeader}>
                    <span className={styles.vendaResultadoLabel}>Propostas prontas</span>
                    <strong className={styles.vendaResultadoTitulo}>{clienteNomeExibicao}</strong>
                    <span className={styles.vendaResultadoSub}>
                      Escolha a condicao ideal para apresentar agora.
                    </span>
                  </div>

                  <div className={styles.vendaMeiosLista}>
                    {formasPagamentoDisponiveis.map(forma => {
                      const ativo = formaPagamento === forma.id
                      return (
                        <button
                          key={forma.id}
                          type="button"
                          className={`${styles.vendaMeioCard} ${ativo ? styles.vendaMeioCardAtivo : ''}`}
                          onClick={() => setFormaPagamento(prev => prev === forma.id ? null : forma.id)}
                          disabled={saving}
                        >
                          <div className={styles.vendaMeioStatus}>
                            <span className={`${styles.vendaCirculo} ${ativo ? styles.vendaCirculoAtivo : ''}`}>
                              {ativo && <span className={styles.vendaCirculoPonto} />}
                            </span>
                          </div>
                          <span className={styles.vendaMeioNome}>{forma.label}</span>
                          <strong className={styles.vendaMeioValor}>{formatCurrency(forma.total)}</strong>
                          <span className={styles.vendaMeioHint}>{forma.hint}</span>
                          <span className={styles.vendaMeioParcelamento}>
                            {forma.maxParcelas > 1
                              ? `Ate ${forma.maxParcelas}x de ${formatCurrency(forma.parcela)}`
                              : 'Pagamento a vista'}
                          </span>
                          {forma.id === 'pix' && ofertaExpiraEm != null && (
                            <span className={`${styles.vendaOfertaInline} ${ofertaExpiraEm <= 0 ? styles.vendaOfertaInlineExpirada : ''}`}>
                              {ofertaExpiraEm > 0 ? `Oferta valida por ${formatCountdown(ofertaExpiraEm)}` : 'Oferta expirada'}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Rodapé — salvar ao editar */}
        {initialVenda && (step === 3 || step === 4) && (
          <div className={styles.vendaFooter}>
            {(erroLocal || error) && (
              <span className={styles.vendaErro} style={{ marginRight: 'auto' }}>{erroLocal || error}</span>
            )}
            <button
              type="button"
              className={styles.vendaSalvarBtn}
              disabled={saving}
              onClick={() => { void handleSave() }}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
