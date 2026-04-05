import { useState, type FormEvent } from 'react'
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

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
  initialVenda,
  saving,
  error,
  onClose,
  onSubmit,
}: VendaModalProps) {
  const backdropDismiss = useBackdropDismiss(onClose, saving)
  const [step, setStep] = useState<1 | 2 | 3>(initialVenda ? 3 : 1)
  const [clienteNome, setClienteNome] = useState(initialVenda?.cliente_nome ?? '')
  const [planoNome, setPlanoNome] = useState(initialVenda?.observacoes || 'Planejamento A')
  const [itens, setItens] = useState<VendaItemDraft[]>(() => mapVendaItensToDrafts(initialVenda?.itens ?? []))
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)
  const [erroLocal, setErroLocal] = useState('')

  const precosPorCategoria = buildPrecosPorCategoria(precos)
  const categorias = precosPorCategoria.map(([cat]) => cat)
  const produtosSelecionadosIds = new Set(itens.map(i => i.empresaPrecoId).filter(Boolean))

  const produtosFiltrados = precos.filter(p => {
    const matchBusca = !busca || p.nome_produto.toLowerCase().includes(busca.toLowerCase())
    const matchCategoria = !categoriaFiltro || getCategoriaLabel(p.categoria) === categoriaFiltro
    return matchBusca && matchCategoria
  }).sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))

  const subtotal = itens.reduce((total, item) => total + item.precoUnitario * item.quantidade, 0)

  const handleNextStep1 = () => {
    if (!clienteNome.trim()) {
      setErroLocal('Informe o nome do cliente.')
      return
    }
    setErroLocal('')
    setStep(2)
  }

  const handleNextStep2 = () => {
    setErroLocal('')
    setStep(3)
  }

  const toggleProduto = (preco: EmpresaPreco) => {
    if (produtosSelecionadosIds.has(preco.id)) {
      setItens(prev => prev.filter(i => i.empresaPrecoId !== preco.id))
    } else {
      setItens(prev => [
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

  const handleRemoveItem = (id: string) => {
    setItens(prev => prev.filter(item => item.id !== id))
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
      observacoes: planoNome.trim(),
      itens,
    })
  }

  const isExpanded = step >= 2

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div
        className={`${styles.modal} ${step === 3 ? styles.saleModal : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>
              {initialVenda ? 'Editar apresentacao' : 'Nova apresentacao'}
            </h2>
            {step < 3 && (
              <p className={styles.calcItemName}>
                {step === 1 ? 'Informe o nome do cliente para comecar.' : 'Defina o nome do planejamento.'}
              </p>
            )}
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}>×</button>
        </div>

        <form
          className={step === 3 ? styles.saleForm : `${styles.saleForm} ${styles.saleFormSingleColumn}`}
          onSubmit={handleSubmit}
        >
          <div className={styles.saleFormMain}>

            {/* Etapa 1 — Nome do cliente */}
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

            {step === 1 && (
              <>
                {erroLocal && <p className={styles.formError}>{erroLocal}</p>}
                <div className={styles.modalActions} style={{ marginTop: '1rem' }}>
                  <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
                    Cancelar
                  </button>
                  <button type="button" className={styles.modalSubmit} onClick={handleNextStep1} disabled={saving}>
                    Proximo passo
                  </button>
                </div>
              </>
            )}

            {/* Etapa 2 — Nome do planejamento */}
            {isExpanded && (
              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Nome do planejamento</span>
                <input
                  className={styles.modalInput}
                  value={planoNome}
                  onChange={e => setPlanoNome(e.target.value)}
                  placeholder="Ex: Planejamento A"
                  disabled={saving}
                />
              </label>
            )}

            {step === 2 && (
              <>
                {erroLocal && <p className={styles.formError}>{erroLocal}</p>}
                <div className={styles.modalActions} style={{ marginTop: '1rem' }}>
                  <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
                    Cancelar
                  </button>
                  <button type="button" className={styles.modalSubmit} onClick={handleNextStep2} disabled={saving}>
                    Proximo
                  </button>
                </div>
              </>
            )}

            {/* Etapa 3 — Selecao de produtos */}
            {step === 3 && (
              <div className={styles.addItemPanel}>
                <div className={styles.addItemHeader}>
                  <h3 className={styles.sectionTitle}>Produtos e servicos</h3>
                  <span className={styles.sectionHint}>Selecione os produtos cadastrados</span>
                </div>

                <input
                  className={styles.modalInput}
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto..."
                  disabled={saving}
                />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className={`${styles.btnSecondary} ${!categoriaFiltro ? styles.presentationSelectCardActive : ''}`}
                    onClick={() => setCategoriaFiltro(null)}
                  >
                    Todas
                  </button>
                  {categorias.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`${styles.btnSecondary} ${categoriaFiltro === cat ? styles.presentationSelectCardActive : ''}`}
                      onClick={() => setCategoriaFiltro(prev => prev === cat ? null : cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className={styles.saleItemList} style={{ marginTop: '0.75rem' }}>
                  {produtosFiltrados.length === 0 ? (
                    <p className={styles.sectionHint}>Nenhum produto encontrado.</p>
                  ) : (
                    produtosFiltrados.map(item => {
                      const selecionado = produtosSelecionadosIds.has(item.id)
                      return (
                        <div
                          key={item.id}
                          className={`${styles.saleItemRow} ${selecionado ? styles.presentationSelectCardActive : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => toggleProduto(item)}
                        >
                          <div>
                            <strong className={styles.saleItemName}>{item.nome_produto}</strong>
                            <span className={styles.saleItemMeta}>{getCategoriaLabel(item.categoria)}</span>
                          </div>
                          <div className={styles.saleItemActions}>
                            <strong className={styles.saleItemTotal}>{formatCurrency(item.preco)}</strong>
                            <span style={{ fontSize: '0.75rem', color: selecionado ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                              {selecionado ? 'Selecionado' : 'Adicionar'}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coluna lateral — itens selecionados */}
          {step === 3 && (
            <div className={styles.saleFormSidebar}>
              <div className={styles.saleSummaryCard}>
                <h3 className={styles.sectionTitle}>Itens selecionados</h3>
                <div className={styles.summaryLine}>
                  <span>Cliente</span>
                  <strong>{clienteNome.trim() || '-'}</strong>
                </div>
                <div className={styles.summaryLine}>
                  <span>Planejamento</span>
                  <strong>{planoNome.trim() || '-'}</strong>
                </div>
                <div className={styles.summaryLine}>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(subtotal)}</strong>
                </div>

                {itens.length === 0 ? (
                  <p className={styles.sectionHint} style={{ marginTop: '0.75rem' }}>
                    Nenhum item selecionado ainda.
                  </p>
                ) : (
                  <div className={styles.saleItemList} style={{ marginTop: '0.75rem' }}>
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
                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (erroLocal || error) && (
            <p className={styles.formError}>{erroLocal || error}</p>
          )}

          {step === 3 && (
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className={styles.modalSubmit} disabled={saving}>
                {saving ? 'Salvando...' : initialVenda ? 'Salvar apresentacao' : 'Criar apresentacao'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
