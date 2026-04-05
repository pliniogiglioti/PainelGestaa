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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialVenda ? 4 : 1)
  const [clienteNome, setClienteNome] = useState<string>(initialVenda?.cliente_nome ?? '')
  const [planoNome, setPlanoNome] = useState<string>(initialVenda?.observacoes || 'Planejamento A')
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
                <span className={styles.vendaStepLabel}>Nome do planejamento</span>
                <input
                  ref={input2Ref}
                  className={styles.vendaStepInput}
                  value={planoNome}
                  onChange={e => setPlanoNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNextStep2() }}
                  placeholder="Planejamento A"
                  disabled={saving}
                />
                <span className={styles.vendaStepHint}>Pressione Enter para continuar</span>
              </div>
            </div>
          )}

          {/* Etapa 3 — produtos */}
          {step === 3 && (
            <div className={styles.vendaColLeft}>
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
                        <span className={styles.vendaProdutoNome}>{item.nome_produto}</span>
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
                  Verificar meios de pagamento
                </button>
              )}
            </div>
          )}

          {/* Etapa 4 — buscando / meios de pagamento */}
          {step === 4 && (
            <div className={styles.vendaStepWrapper}>
              {(meiosLiberadosEm ?? 0) > 0 ? (
                <div className={styles.vendaProcurando}>
                  <span className={styles.vendaProcurandoTexto}>
                    Buscando meios de pagamento para o cliente {clienteNome.trim()}
                  </span>
                  <span className={styles.vendaProcurandoTimer}>{formatCountdown(meiosLiberadosEm ?? 0)}</span>
                </div>
              ) : (
                <div className={styles.vendaStepCenter}>
                  <div className={styles.vendaMeiosLista}>
                    {FORMAS_PAGAMENTO.map(forma => {
                      const ativo = formaPagamento === forma.id
                      return (
                        <button
                          key={forma.id}
                          type="button"
                          className={`${styles.vendaMeioCard} ${ativo ? styles.vendaMeioCardAtivo : ''}`}
                          onClick={() => setFormaPagamento(prev => prev === forma.id ? null : forma.id)}
                          disabled={saving}
                        >
                          <span className={`${styles.vendaCirculo} ${ativo ? styles.vendaCirculoAtivo : ''}`}>
                            {ativo && <span className={styles.vendaCirculoPonto} />}
                          </span>
                          <span className={styles.vendaMeioNome}>{forma.label}</span>
                        </button>
                      )
                    })}
                  </div>

                  {ofertaExpiraEm != null && (
                    <div className={`${styles.vendaOfertaValida} ${ofertaExpiraEm <= 0 ? styles.vendaOfertaExpirada : ''}`}>
                      <span className={styles.vendaOfertaLabel}>
                        {ofertaExpiraEm > 0 ? 'Oferta valida por' : 'Oferta expirada'}
                      </span>
                      {ofertaExpiraEm > 0 && (
                        <span className={styles.vendaOfertaTimer}>{formatCountdown(ofertaExpiraEm)}</span>
                      )}
                    </div>
                  )}
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
