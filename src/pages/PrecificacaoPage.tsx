import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './PrecificacaoPage.module.css'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'
import type {
  Empresa,
  EmpresaPreco,
  EmpresaPrecificacaoConfig,
  EmpresaVenda,
  EmpresaVendaItem,
} from '../lib/types'

interface PrecificacaoPageProps {
  empresa: Empresa
  onTrocarEmpresa: () => void
  onVoltar: () => void
}

type ViewMode = 'vendas' | 'lista'

type CalculadoraForm = {
  custoInsumos: string
  custoMaterialAplicado: string
  custoLaboratorio: string
  royaltiesPercent: string
  custoProfissionaisPercent: string
  impostosPercent: string
  comissoesPercent: string
  taxaMaquinaPercent: string
}

type ConfiguracaoGeralForm = {
  royaltiesPercent: string
  custoProfissionaisPercent: string
  impostosPercent: string
  comissoesPercent: string
  taxaMaquinaPercent: string
  taxaBoletoPercent: string
}

type VendaItemDraft = {
  id: string
  empresaPrecoId: string | null
  descricao: string
  precoUnitario: number
  quantidade: number
}

type VendaCard = EmpresaVenda & {
  itens: EmpresaVendaItem[]
}

const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const IconUpload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const IconTag = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41 13.41 20.6a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
)

const IconEye = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconReceipt = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 3h16v18l-3-2-3 2-3-2-3 2-3-2-3 2V3Z" />
    <line x1="8" y1="7" x2="16" y2="7" />
    <line x1="8" y1="11" x2="16" y2="11" />
    <line x1="8" y1="15" x2="13" y2="15" />
  </svg>
)

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatPercent = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

function Spinner() {
  return <div className={styles.spinner} />
}

function parsePreco(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function calcularPrecificacao(precoVenda: number, form: CalculadoraForm) {
  const custoInsumos = parsePreco(form.custoInsumos)
  const custoMaterialAplicado = parsePreco(form.custoMaterialAplicado)
  const custoLaboratorio = parsePreco(form.custoLaboratorio)
  const royaltiesPercent = parsePreco(form.royaltiesPercent)
  const custoProfissionaisPercent = parsePreco(form.custoProfissionaisPercent)
  const impostosPercent = parsePreco(form.impostosPercent)
  const comissoesPercent = parsePreco(form.comissoesPercent)
  const taxaMaquinaPercent = parsePreco(form.taxaMaquinaPercent)

  const royalties = precoVenda * (royaltiesPercent / 100)
  const custoProfissionais = precoVenda * (custoProfissionaisPercent / 100)
  const impostos = precoVenda * (impostosPercent / 100)
  const comissoes = precoVenda * (comissoesPercent / 100)
  const taxaMaquina = precoVenda * (taxaMaquinaPercent / 100)

  const custoTotal =
    custoInsumos +
    custoMaterialAplicado +
    custoLaboratorio +
    royalties +
    custoProfissionais +
    impostos +
    comissoes +
    taxaMaquina

  const margem = precoVenda > 0 ? ((precoVenda - custoTotal) / precoVenda) * 100 : 0

  return {
    custoInsumos,
    custoMaterialAplicado,
    custoLaboratorio,
    royaltiesPercent,
    custoProfissionaisPercent,
    impostosPercent,
    comissoesPercent,
    taxaMaquinaPercent,
    royalties,
    custoProfissionais,
    impostos,
    comissoes,
    taxaMaquina,
    custoTotal,
    margem,
    resultadoMargem: margem < 50 ? 'Baixa - Rever Preço' : 'Adequada',
  }
}

function configToForm(config: EmpresaPrecificacaoConfig | null): ConfiguracaoGeralForm {
  return {
    royaltiesPercent: config ? String(config.royalties_percent) : '',
    custoProfissionaisPercent: config ? String(config.custo_profissionais_percent) : '',
    impostosPercent: config ? String(config.impostos_percent) : '',
    comissoesPercent: config ? String(config.comissoes_percent) : '',
    taxaMaquinaPercent: config ? String(config.taxa_maquina_percent) : '',
    taxaBoletoPercent: config ? String(config.taxa_boleto_percent) : '',
  }
}

function configFormToCalculadoraForm(config: ConfiguracaoGeralForm): Pick<
  CalculadoraForm,
  'royaltiesPercent' | 'custoProfissionaisPercent' | 'impostosPercent' | 'comissoesPercent' | 'taxaMaquinaPercent'
> {
  return {
    royaltiesPercent: config.royaltiesPercent,
    custoProfissionaisPercent: config.custoProfissionaisPercent,
    impostosPercent: config.impostosPercent,
    comissoesPercent: config.comissoesPercent,
    taxaMaquinaPercent: config.taxaMaquinaPercent,
  }
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

function getParcelasCompactas(parcelas: ReturnType<typeof buildParcelas>) {
  if (parcelas.length <= 4) return parcelas

  const indices = Array.from(new Set([0, 1, Math.floor(parcelas.length / 2), parcelas.length - 1]))
  return indices
    .map(index => parcelas[index])
    .filter((item): item is (typeof parcelas)[number] => Boolean(item))
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

function PrecoModal({
  onClose,
  onSubmit,
  saving,
  error,
}: {
  onClose: () => void
  onSubmit: (item: { nome: string; preco: number }) => Promise<void>
  saving: boolean
  error: string
}) {
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [erroLocal, setErroLocal] = useState('')
  const backdropDismiss = useBackdropDismiss(onClose, saving)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome.trim()) {
      setErroLocal('Informe o nome do produto.')
      return
    }

    const precoNumerico = parsePreco(preco)
    if (precoNumerico <= 0) {
      setErroLocal('Informe um preço válido.')
      return
    }

    setErroLocal('')

    await onSubmit({
      nome: nome.trim(),
      preco: precoNumerico,
    })
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Novo preço</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Nome do produto</span>
            <input
              className={styles.modalInput}
              placeholder="Ex: Consulta de avaliação"
              value={nome}
              onChange={e => {
                setNome(e.target.value)
                setErroLocal('')
              }}
              autoFocus
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Preço</span>
            <input
              className={styles.modalInput}
              placeholder="Ex: 120,00"
              value={preco}
              onChange={e => {
                setPreco(e.target.value)
                setErroLocal('')
              }}
              inputMode="decimal"
              disabled={saving}
            />
          </label>

          {(erroLocal || error) && <p className={styles.formError}>{erroLocal || error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CalculadoraPrecificacaoModal({
  item,
  configPadrao,
  onClose,
}: {
  item: EmpresaPreco
  configPadrao: ConfiguracaoGeralForm
  onClose: () => void
}) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [form, setForm] = useState<CalculadoraForm>({
    custoInsumos: '',
    custoMaterialAplicado: '',
    custoLaboratorio: '',
    ...configFormToCalculadoraForm(configPadrao),
  })

  const calculo = calcularPrecificacao(item.preco, form)

  const handleChange = (field: keyof CalculadoraForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={`${styles.modal} ${styles.calcModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Verificar cálculo de precificação</h2>
            <p className={styles.calcItemName}>{item.nome_produto}</p>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.calcLayout}>
          <div className={styles.calcForm}>
            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Custo insumos (R$)</span>
              <input
                className={styles.modalInput}
                value={form.custoInsumos}
                onChange={e => handleChange('custoInsumos', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 40,00"
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Custo material aplicado (R$)</span>
              <input
                className={styles.modalInput}
                value={form.custoMaterialAplicado}
                onChange={e => handleChange('custoMaterialAplicado', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 700,00"
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Custo laboratório (R$)</span>
              <input
                className={styles.modalInput}
                value={form.custoLaboratorio}
                onChange={e => handleChange('custoLaboratorio', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 120,00"
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Royalties e FNP (%)</span>
              <input
                className={styles.modalInput}
                value={form.royaltiesPercent}
                onChange={e => handleChange('royaltiesPercent', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 9"
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Custo profissionais (%)</span>
              <input
                className={styles.modalInput}
                value={form.custoProfissionaisPercent}
                onChange={e => handleChange('custoProfissionaisPercent', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 30"
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Impostos (%)</span>
              <input
                className={styles.modalInput}
                value={form.impostosPercent}
                onChange={e => handleChange('impostosPercent', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 8"
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Comissões vendas (%)</span>
              <input
                className={styles.modalInput}
                value={form.comissoesPercent}
                onChange={e => handleChange('comissoesPercent', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 3"
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Taxa máquina (%)</span>
              <input
                className={styles.modalInput}
                value={form.taxaMaquinaPercent}
                onChange={e => handleChange('taxaMaquinaPercent', e.target.value)}
                inputMode="decimal"
                placeholder="Ex: 2"
              />
            </label>
          </div>

          <div className={styles.calcSummary}>
            <div className={styles.calcTable}>
              <div className={styles.calcTableHead}>
                <span>Procedimento</span>
                <span>Referência</span>
                <span>Custo</span>
              </div>

              <div className={styles.calcRow}>
                <span>Custo insumos</span>
                <span>{calculo.custoInsumos > 0 ? formatCurrency(calculo.custoInsumos) : '-'}</span>
                <strong>{calculo.custoInsumos > 0 ? formatCurrency(calculo.custoInsumos) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Custo material aplicado</span>
                <span>{calculo.custoMaterialAplicado > 0 ? formatCurrency(calculo.custoMaterialAplicado) : '-'}</span>
                <strong>{calculo.custoMaterialAplicado > 0 ? formatCurrency(calculo.custoMaterialAplicado) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Custo laboratório</span>
                <span>{calculo.custoLaboratorio > 0 ? formatCurrency(calculo.custoLaboratorio) : '-'}</span>
                <strong>{calculo.custoLaboratorio > 0 ? formatCurrency(calculo.custoLaboratorio) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Royalties e FNP</span>
                <span>{calculo.royaltiesPercent > 0 ? formatPercent(calculo.royaltiesPercent) : '-'}</span>
                <strong>{calculo.royalties > 0 ? formatCurrency(calculo.royalties) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Custo profissionais</span>
                <span>{calculo.custoProfissionaisPercent > 0 ? formatPercent(calculo.custoProfissionaisPercent) : '-'}</span>
                <strong>{calculo.custoProfissionais > 0 ? formatCurrency(calculo.custoProfissionais) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Impostos</span>
                <span>{calculo.impostosPercent > 0 ? formatPercent(calculo.impostosPercent) : '-'}</span>
                <strong>{calculo.impostos > 0 ? formatCurrency(calculo.impostos) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Comissões vendas</span>
                <span>{calculo.comissoesPercent > 0 ? formatPercent(calculo.comissoesPercent) : '-'}</span>
                <strong>{calculo.comissoes > 0 ? formatCurrency(calculo.comissoes) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Taxa máquina</span>
                <span>{calculo.taxaMaquinaPercent > 0 ? formatPercent(calculo.taxaMaquinaPercent) : '-'}</span>
                <strong>{calculo.taxaMaquina > 0 ? formatCurrency(calculo.taxaMaquina) : '-'}</strong>
              </div>
            </div>

            <div className={styles.calcHighlights}>
              <div className={styles.calcHighlight}>
                <span>Custo total</span>
                <strong>{formatCurrency(calculo.custoTotal)}</strong>
              </div>
              <div className={styles.calcHighlight}>
                <span>Margem</span>
                <strong>{formatPercent(calculo.margem)}</strong>
              </div>
              <div className={styles.calcHighlight}>
                <span>Preço de venda</span>
                <strong>{formatCurrency(item.preco)}</strong>
              </div>
              <div className={`${styles.calcHighlight} ${calculo.margem < 50 ? styles.calcHighlightBad : styles.calcHighlightGood}`}>
                <span>Resultado da margem</span>
                <strong>{calculo.resultadoMargem}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfiguracaoGeralModal({
  form,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  form: ConfiguracaoGeralForm
  saving: boolean
  error: string
  onChange: (field: keyof ConfiguracaoGeralForm, value: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => Promise<void>
}) {
  const backdropDismiss = useBackdropDismiss(onClose, saving)

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Configuração geral</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form className={styles.modalForm} onSubmit={onSubmit}>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Royalties e FNP (%)</span>
            <input
              className={styles.modalInput}
              value={form.royaltiesPercent}
              onChange={e => onChange('royaltiesPercent', e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 9"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Custo profissionais (%)</span>
            <input
              className={styles.modalInput}
              value={form.custoProfissionaisPercent}
              onChange={e => onChange('custoProfissionaisPercent', e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 30"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Impostos (%)</span>
            <input
              className={styles.modalInput}
              value={form.impostosPercent}
              onChange={e => onChange('impostosPercent', e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 8"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Comissões vendas (%)</span>
            <input
              className={styles.modalInput}
              value={form.comissoesPercent}
              onChange={e => onChange('comissoesPercent', e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 3"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Taxa máquina (%)</span>
            <input
              className={styles.modalInput}
              value={form.taxaMaquinaPercent}
              onChange={e => onChange('taxaMaquinaPercent', e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 2"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Taxa boleto (%)</span>
            <input
              className={styles.modalInput}
              value={form.taxaBoletoPercent}
              onChange={e => onChange('taxaBoletoPercent', e.target.value)}
              inputMode="decimal"
              placeholder="Ex: 1,5"
              disabled={saving}
            />
            <span className={styles.fieldHint}>Usada somente nas vendas e no modo apresentação.</span>
          </label>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar configuração'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function VendaModal({
  precos,
  taxaMaquinaPercent,
  initialVenda,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  precos: EmpresaPreco[]
  taxaMaquinaPercent: number
  initialVenda?: VendaCard | null
  saving: boolean
  error: string
  onClose: () => void
  onSubmit: (payload: {
    id?: string
    clienteNome: string
    observacoes: string
    entradaValor: number
    maxParcelas: number
    itens: VendaItemDraft[]
  }) => Promise<void>
}) {
  const backdropDismiss = useBackdropDismiss(onClose, saving)
  const [clienteNome, setClienteNome] = useState(initialVenda?.cliente_nome ?? '')
  const [observacoes, setObservacoes] = useState(initialVenda?.observacoes ?? '')
  const [entradaValor, setEntradaValor] = useState(initialVenda ? String(initialVenda.entrada_valor ?? 0) : '')
  const [maxParcelas, setMaxParcelas] = useState(String(initialVenda?.max_parcelas ?? 1))
  const [itens, setItens] = useState<VendaItemDraft[]>(() => mapVendaItensToDrafts(initialVenda?.itens ?? []))
  const [selectedPrecoId, setSelectedPrecoId] = useState('')
  const [selectedQtd, setSelectedQtd] = useState('1')
  const [erroLocal, setErroLocal] = useState('')

  const subtotal = calculateSubtotal(itens.map(item => ({
    preco_unitario: item.precoUnitario,
    quantidade: item.quantidade,
  })))
  const entradaNumerica = parsePreco(entradaValor)
  const entradaAplicada = sanitizeEntrada(subtotal, entradaNumerica)
  const parcelasPreview = getParcelasCompactas(
    buildParcelas(subtotal, Number(maxParcelas) || 1, taxaMaquinaPercent, entradaAplicada),
  )
  const produtosSelecionadosIds = new Set(itens.map(item => item.empresaPrecoId).filter(Boolean))
  const sugestoesAncoragem = [...precos]
    .filter(item => !produtosSelecionadosIds.has(item.id))
    .sort((a, b) => b.preco - a.preco)
    .slice(0, 4)

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
      setErroLocal('Selecione um produto da lista.')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!clienteNome.trim()) {
      setErroLocal('Informe o nome do cliente.')
      return
    }

    if (itens.length === 0) {
      setErroLocal('Adicione ao menos um produto ou serviço.')
      return
    }

    setErroLocal('')

    await onSubmit({
      id: initialVenda?.id,
      clienteNome: clienteNome.trim(),
      observacoes: observacoes.trim(),
      entradaValor: entradaAplicada,
      maxParcelas: Math.max(1, Math.floor(Number(maxParcelas) || 1)),
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
            <h2 className={styles.modalTitle}>{initialVenda ? 'Editar venda' : 'Nova venda'}</h2>
            <p className={styles.calcItemName}>Monte a proposta do cliente com os produtos e serviços da sua lista.</p>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form className={styles.saleForm} onSubmit={handleSubmit}>
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

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Observações</span>
              <textarea
                className={`${styles.modalInput} ${styles.modalTextarea}`}
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Anotações para a proposta"
                rows={3}
                disabled={saving}
              />
            </label>

            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Entrada</span>
              <input
                className={styles.modalInput}
                value={entradaValor}
                onChange={e => setEntradaValor(e.target.value)}
                placeholder="Ex: 300,00"
                inputMode="decimal"
                disabled={saving}
              />
            </label>

            <div className={styles.addItemPanel}>
              <div className={styles.addItemHeader}>
                <h3 className={styles.sectionTitle}>Produtos e serviços</h3>
                <span className={styles.sectionHint}>Adicione itens da sua lista de preços</span>
              </div>

              <div className={styles.addItemRow}>
                <select
                  className={styles.modalInput}
                  value={selectedPrecoId}
                  onChange={e => setSelectedPrecoId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Selecione um produto</option>
                  {precos.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.nome_produto} - {formatCurrency(item.preco)}
                    </option>
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

              <p className={styles.sectionHint}>Você pode adicionar mais de um produto ou serviço na mesma venda.</p>

              {sugestoesAncoragem.length > 0 && (
                <div className={styles.anchorPanel}>
                  <div className={styles.addItemHeader}>
                    <h4 className={styles.sectionTitle}>Sugestões de ancoragem</h4>
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
                        <small>Adicionar na proposta</small>
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
          </div>

          <div className={styles.saleFormSidebar}>
            <label className={styles.modalField}>
              <span className={styles.modalLabel}>Divisão de preço</span>
              <select
                className={styles.modalInput}
                value={maxParcelas}
                onChange={e => setMaxParcelas(e.target.value)}
                disabled={saving}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map(parcela => (
                  <option key={parcela} value={parcela}>
                    Até {parcela}x
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.saleSummaryCard}>
              <h3 className={styles.sectionTitle}>Resumo da venda</h3>
              <div className={styles.summaryLine}>
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              <div className={styles.summaryLine}>
                <span>Entrada</span>
                <strong>{formatCurrency(entradaAplicada)}</strong>
              </div>
              <div className={styles.summaryLine}>
                <span>Saldo parcelado</span>
                <strong>{formatCurrency(Math.max(subtotal - entradaAplicada, 0))}</strong>
              </div>
              <div className={styles.summaryLine}>
                <span>Taxa da maquininha</span>
                <strong>{formatPercent(taxaMaquinaPercent)}</strong>
              </div>
            </div>

            <div className={styles.saleSummaryCard}>
              <h3 className={styles.sectionTitle}>Preços por parcela</h3>
              <div className={styles.parcelasList}>
                {parcelasPreview.map(opcao => (
                  <div key={opcao.parcela} className={styles.parcelaRow}>
                    <span className={styles.parcelaMain}>{opcao.parcela}x {formatCurrency(opcao.valorParcela)}</span>
                    <div className={styles.parcelaValues}>
                      <small>Total parcelado {formatCurrency(opcao.totalCobradoParcelado)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {(erroLocal || error) && <p className={styles.formError}>{erroLocal || error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : initialVenda ? 'Salvar venda' : 'Criar venda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ApresentacaoVendaModal({
  venda,
  precos,
  taxaMaquinaPercent,
  taxaBoletoPercent,
  onClose,
}: {
  venda: VendaCard
  precos: EmpresaPreco[]
  taxaMaquinaPercent: number
  taxaBoletoPercent: number
  onClose: () => void
}) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [itensApresentacao, setItensApresentacao] = useState(venda.itens)
  const subtotal = calculateSubtotal(itensApresentacao)
  const [formaPagamento, setFormaPagamento] = useState<'cartao' | 'boleto'>('cartao')
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState(String(venda.max_parcelas))
  const [precoAvista, setPrecoAvista] = useState(
    subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  )
  const precoAvistaCalculado = parsePreco(precoAvista)
  const baseApresentacao = precoAvistaCalculado > 0 ? precoAvistaCalculado : subtotal
  const entradaAplicada = sanitizeEntrada(baseApresentacao, venda.entrada_valor)

  const usandoCartao = formaPagamento === 'cartao'
  const qtdParcelas = usandoCartao ? Math.max(1, Number(parcelasSelecionadas) || 1) : 1
  const taxaAplicada = usandoCartao ? taxaMaquinaPercent : taxaBoletoPercent
  const resumo = buildFormaPagamento(baseApresentacao, qtdParcelas, taxaAplicada, entradaAplicada)
  const parcelasApresentacao = buildParcelas(baseApresentacao, venda.max_parcelas, taxaMaquinaPercent, entradaAplicada)
  const sugestoesUpsell = precos
    .filter(item => !itensApresentacao.some(vendaItem => vendaItem.empresa_preco_id === item.id))
    .sort((a, b) => b.preco - a.preco)
    .slice(0, 3)

  const handleAddUpsell = (item: EmpresaPreco) => {
    setItensApresentacao(prev => ([
      ...prev,
      {
        id: `upsell-${item.id}`,
        venda_id: venda.id,
        empresa_preco_id: item.id,
        descricao: item.nome_produto,
        preco_unitario: item.preco,
        quantidade: 1,
        created_at: new Date().toISOString(),
      },
    ]))
    setPrecoAvista(prev => {
      const valorAtual = parsePreco(prev)
      const proximoValor = valorAtual > 0 ? valorAtual + item.preco : subtotal + item.preco
      return proximoValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    })
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={`${styles.modal} ${styles.presentationModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.presentationHeader}>
          <div>
            <p className={styles.presentationEyebrow}>Apresentação</p>
            <h2 className={styles.presentationTitle}>{venda.cliente_nome}</h2>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.presentationBody}>
          <div className={styles.presentationControls}>
            <div className={styles.presentationSelectorBlock}>
              <span className={styles.modalLabel}>Preço à vista</span>
              <div className={styles.presentationPriceCard}>
                <input
                  className={styles.presentationPriceInput}
                  value={precoAvista}
                  onChange={e => setPrecoAvista(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex: 3.500,00"
                />
                <small>Você pode ajustar o valor final à vista para apresentar ao cliente.</small>
              </div>
            </div>

            <div className={styles.presentationSelectorBlock}>
              <span className={styles.modalLabel}>Forma de pagamento</span>
              <div className={styles.presentationSelectorGrid}>
                <button
                  type="button"
                  className={`${styles.presentationSelectCard} ${usandoCartao ? styles.presentationSelectCardActive : ''}`}
                  onClick={() => setFormaPagamento('cartao')}
                >
                  <span>Cartão</span>
                  <strong>{formatCurrency(buildFormaPagamento(baseApresentacao, qtdParcelas, taxaMaquinaPercent, entradaAplicada).valorParcela)}</strong>
                  <small>{qtdParcelas}x disponível</small>
                </button>
                <button
                  type="button"
                  className={`${styles.presentationSelectCard} ${!usandoCartao ? styles.presentationSelectCardActive : ''}`}
                  onClick={() => setFormaPagamento('boleto')}
                >
                  <span>Boleto</span>
                  <strong>{formatCurrency(buildFormaPagamento(baseApresentacao, 1, taxaBoletoPercent, entradaAplicada).totalCobrado)}</strong>
                  <small>Pagamento à vista</small>
                </button>
              </div>
            </div>

            {usandoCartao && (
              <div className={styles.presentationSelectorBlock}>
                <span className={styles.modalLabel}>Parcelas</span>
                <div className={styles.presentationParcelasGrid}>
                  {parcelasApresentacao.map(opcao => (
                    <button
                      key={opcao.parcela}
                      type="button"
                      className={`${styles.presentationParcelaCard} ${opcao.parcela === resumo.parcelas ? styles.presentationParcelaCardActive : ''}`}
                      onClick={() => setParcelasSelecionadas(String(opcao.parcela))}
                    >
                      <span>{opcao.parcela}x</span>
                      <strong>{formatCurrency(opcao.valorParcela)}</strong>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.presentationBlock}>
            <h3 className={styles.sectionTitle}>Itens da proposta</h3>
            <div className={styles.presentationItems}>
              {itensApresentacao.map(item => (
                <div key={item.id} className={styles.presentationItem}>
                  <span>{item.descricao}</span>
                  <strong>{formatCurrency(item.preco_unitario * item.quantidade)}</strong>
                </div>
              ))}
            </div>
          </div>

          {sugestoesUpsell.length > 0 && (
            <div className={styles.presentationBlock}>
              <h3 className={styles.sectionTitle}>Sugestões para aumentar a venda</h3>
              <div className={styles.anchorGrid}>
                {sugestoesUpsell.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.anchorCard}
                    onClick={() => handleAddUpsell(item)}
                  >
                    <span>{item.nome_produto}</span>
                    <strong>{formatCurrency(item.preco)}</strong>
                    <small>Adicionar à apresentação</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.presentationTotals}>
            {resumo.entradaAplicada > 0 && (
              <div className={styles.presentationTotalCard}>
                <span>Entrada</span>
                <strong>{formatCurrency(resumo.entradaAplicada)}</strong>
              </div>
            )}
            <div className={styles.presentationTotalCard}>
              <span>Total final</span>
              <strong>{formatCurrency(resumo.totalCobrado)}</strong>
            </div>
            <div className={styles.presentationTotalCard}>
              <span>{usandoCartao ? `${resumo.parcelas}x no cartão` : 'Boleto à vista'}</span>
              <strong>{formatCurrency(resumo.valorParcela)}</strong>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default function PrecificacaoPage({ empresa, onTrocarEmpresa, onVoltar }: PrecificacaoPageProps) {
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [view, setView] = useState<ViewMode>('vendas')
  const [showPrecoModal, setShowPrecoModal] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showVendaModal, setShowVendaModal] = useState(false)
  const [precos, setPrecos] = useState<EmpresaPreco[]>([])
  const [vendas, setVendas] = useState<VendaCard[]>([])
  const [savingPreco, setSavingPreco] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingVenda, setSavingVenda] = useState(false)
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [itemCalculadora, setItemCalculadora] = useState<EmpresaPreco | null>(null)
  const [vendaEditando, setVendaEditando] = useState<VendaCard | null>(null)
  const [vendaApresentacao, setVendaApresentacao] = useState<VendaCard | null>(null)
  const [configGeral, setConfigGeral] = useState<EmpresaPrecificacaoConfig | null>(null)
  const [configForm, setConfigForm] = useState<ConfiguracaoGeralForm>({
    royaltiesPercent: '',
    custoProfissionaisPercent: '',
    impostosPercent: '',
    comissoesPercent: '',
    taxaMaquinaPercent: '',
    taxaBoletoPercent: '',
  })
  const taxaMaquinaPercent = configGeral?.taxa_maquina_percent ?? parsePreco(configForm.taxaMaquinaPercent)
  const taxaBoletoPercent = configGeral?.taxa_boleto_percent ?? parsePreco(configForm.taxaBoletoPercent)

  useEffect(() => {
    let active = true

    const carregarWorkspace = async () => {
      setLoading(true)

      const { data: authData } = await supabase.auth.getUser()
      const currentUser = authData.user

      if (!currentUser) {
        if (active) onTrocarEmpresa()
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single()

      const isSystemAdmin = profile?.role === 'admin'

      if (!isSystemAdmin) {
        const { data: membro } = await supabase
          .from('empresa_membros')
          .select('role')
          .eq('empresa_id', empresa.id)
          .eq('user_id', currentUser.id)
          .maybeSingle()

        if (!membro && active) {
          onTrocarEmpresa()
          return
        }

        if (active) {
          setCanManage(membro?.role === 'admin')
        }
      } else if (active) {
        setCanManage(true)
      }

      if (!active) return

      setLoadingWorkspace(true)
      setError('')

      const { data: precosData, error: precosError } = await supabase
        .from('empresa_precos')
        .select('*')
        .eq('empresa_id', empresa.id)
        .eq('ativo', true)
        .order('nome_produto', { ascending: true })

      const { data: configData, error: configError } = await supabase
        .from('empresa_precificacao_config')
        .select('*')
        .eq('empresa_id', empresa.id)
        .maybeSingle()

      const { data: vendasData, error: vendasError } = await supabase
        .from('empresa_vendas')
        .select('*')
        .eq('empresa_id', empresa.id)
        .eq('ativo', true)
        .order('created_at', { ascending: false })

      let itensAgrupados = new Map<string, EmpresaVendaItem[]>()

      if (!vendasError && vendasData && vendasData.length > 0) {
        const vendaIds = vendasData.map(item => item.id)
        const { data: itensData, error: itensError } = await supabase
          .from('empresa_venda_itens')
          .select('*')
          .in('venda_id', vendaIds)
          .order('created_at', { ascending: true })

        if (itensError && active) {
          setError(itensError.message ?? 'Não foi possível carregar os itens das vendas.')
        } else {
          itensAgrupados = (itensData ?? []).reduce((map, item) => {
            const atual = map.get(item.venda_id) ?? []
            atual.push(item)
            map.set(item.venda_id, atual)
            return map
          }, new Map<string, EmpresaVendaItem[]>())
        }
      }

      if (active) {
        if (precosError) {
          setError(precosError.message ?? 'Não foi possível carregar a lista de preços.')
        } else {
          setPrecos(precosData ?? [])
        }

        if (configError) {
          setError(configError.message ?? 'Não foi possível carregar a configuração geral da precificação.')
        } else {
          setConfigGeral(configData)
          setConfigForm(configToForm(configData))
        }

        if (vendasError) {
          setError(vendasError.message ?? 'Não foi possível carregar as vendas.')
        } else {
          setVendas(
            (vendasData ?? []).map(venda => ({
              ...venda,
              itens: itensAgrupados.get(venda.id) ?? [],
            })),
          )
        }

        setLoadingWorkspace(false)
        setLoading(false)
      }
    }

    void carregarWorkspace()

    return () => {
      active = false
    }
  }, [empresa.id, onTrocarEmpresa])

  const refreshVendas = async () => {
    const { data: vendasData, error: vendasError } = await supabase
      .from('empresa_vendas')
      .select('*')
      .eq('empresa_id', empresa.id)
      .eq('ativo', true)
      .order('created_at', { ascending: false })

    if (vendasError) {
      setError(vendasError.message ?? 'Não foi possível recarregar as vendas.')
      return
    }

    if (!vendasData || vendasData.length === 0) {
      setVendas([])
      return
    }

    const vendaIds = vendasData.map(item => item.id)
    const { data: itensData, error: itensError } = await supabase
      .from('empresa_venda_itens')
      .select('*')
      .in('venda_id', vendaIds)
      .order('created_at', { ascending: true })

    if (itensError) {
      setError(itensError.message ?? 'Não foi possível recarregar os itens das vendas.')
      return
    }

    const itensAgrupados = (itensData ?? []).reduce((map, item) => {
      const atual = map.get(item.venda_id) ?? []
      atual.push(item)
      map.set(item.venda_id, atual)
      return map
    }, new Map<string, EmpresaVendaItem[]>())

    setVendas(
      vendasData.map(venda => ({
        ...venda,
        itens: itensAgrupados.get(venda.id) ?? [],
      })),
    )
  }

  const handleAddPreco = async (item: { nome: string; preco: number }) => {
    setSavingPreco(true)
    setError('')
    setFeedback('')

    const { data, error: insertError } = await supabase
      .from('empresa_precos')
      .insert({
        empresa_id: empresa.id,
        nome_produto: item.nome,
        preco: item.preco,
      })
      .select('*')
      .single()

    if (insertError) {
      setError(insertError.message ?? 'Não foi possível salvar o preço.')
      setSavingPreco(false)
      return
    }

    setPrecos(prev =>
      [...prev, data].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))
    )
    setFeedback('Preço salvo com sucesso.')
    setShowPrecoModal(false)
    setSavingPreco(false)
    setView('lista')
  }

  const handleConfigChange = (field: keyof ConfiguracaoGeralForm, value: string) => {
    setConfigForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingConfig(true)
    setError('')
    setFeedback('')

    const payload = {
      empresa_id: empresa.id,
      royalties_percent: parsePreco(configForm.royaltiesPercent),
      custo_profissionais_percent: parsePreco(configForm.custoProfissionaisPercent),
      impostos_percent: parsePreco(configForm.impostosPercent),
      comissoes_percent: parsePreco(configForm.comissoesPercent),
      taxa_maquina_percent: parsePreco(configForm.taxaMaquinaPercent),
      taxa_boleto_percent: parsePreco(configForm.taxaBoletoPercent),
    }

    const { data, error: saveError } = await supabase
      .from('empresa_precificacao_config')
      .upsert(payload)
      .select('*')
      .single()

    if (saveError) {
      setError(saveError.message ?? 'Não foi possível salvar a configuração geral.')
      setSavingConfig(false)
      return
    }

    setConfigGeral(data)
    setConfigForm(configToForm(data))
    setFeedback('Configuração geral salva com sucesso.')
    setShowConfigModal(false)
    setSavingConfig(false)
  }

  const handleSaveVenda = async (payload: {
    id?: string
    clienteNome: string
    observacoes: string
    entradaValor: number
    maxParcelas: number
    itens: VendaItemDraft[]
  }) => {
    setSavingVenda(true)
    setError('')
    setFeedback('')

    let vendaId = payload.id

    if (vendaId) {
      const { error: updateError } = await supabase
        .from('empresa_vendas')
        .update({
          cliente_nome: payload.clienteNome,
          observacoes: payload.observacoes || null,
          entrada_valor: payload.entradaValor,
          max_parcelas: payload.maxParcelas,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vendaId)

      if (updateError) {
        setError(updateError.message ?? 'Não foi possível atualizar a venda.')
        setSavingVenda(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('empresa_venda_itens')
        .delete()
        .eq('venda_id', vendaId)

      if (deleteError) {
        setError(deleteError.message ?? 'Não foi possível atualizar os itens da venda.')
        setSavingVenda(false)
        return
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('empresa_vendas')
        .insert({
          empresa_id: empresa.id,
          cliente_nome: payload.clienteNome,
          observacoes: payload.observacoes || null,
          entrada_valor: payload.entradaValor,
          max_parcelas: payload.maxParcelas,
        })
        .select('*')
        .single()

      if (insertError || !data) {
        setError(insertError?.message ?? 'Não foi possível criar a venda.')
        setSavingVenda(false)
        return
      }

      vendaId = data.id
    }

    const itensInsert = payload.itens.map(item => ({
      venda_id: vendaId!,
      empresa_preco_id: item.empresaPrecoId,
      descricao: item.descricao,
      preco_unitario: item.precoUnitario,
      quantidade: item.quantidade,
    }))

    const { error: itensInsertError } = await supabase
      .from('empresa_venda_itens')
      .insert(itensInsert)

    if (itensInsertError) {
      setError(itensInsertError.message ?? 'Não foi possível salvar os itens da venda.')
      setSavingVenda(false)
      return
    }

    await refreshVendas()
    setFeedback(payload.id ? 'Venda atualizada com sucesso.' : 'Venda criada com sucesso.')
    setShowVendaModal(false)
    setVendaEditando(null)
    setSavingVenda(false)
  }

  const handleDeleteVenda = async (vendaId: string) => {
    setError('')
    setFeedback('')

    const { error: deleteError } = await supabase
      .from('empresa_vendas')
      .update({
        ativo: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendaId)

    if (deleteError) {
      setError(deleteError.message ?? 'Não foi possível remover a venda.')
      return
    }

    await refreshVendas()
    setFeedback('Venda removida com sucesso.')
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <button type="button" className={styles.backBtn} onClick={onVoltar}>
            <IconBack /> Voltar
          </button>
          <h1 className={styles.pageTitle}>Precificação</h1>
        </div>
        <div className={styles.spinnerWrap}>
          <Spinner />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onVoltar}>
          <IconBack /> Voltar
        </button>
        <h1 className={styles.pageTitle}>Precificação</h1>
        <span className={styles.companyMeta}>
          Empresa: <strong>{empresa.nome}</strong>
        </span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={onTrocarEmpresa}>
            Trocar empresa
          </button>
        </div>
      </div>

      <div className={styles.workspace}>
        <div className={styles.workspaceHeader}>
          <div>
            <p className={styles.workspaceEyebrow}>Precificação</p>
            <h2 className={styles.workspaceTitle}>{view === 'vendas' ? 'Vendas' : 'Minha lista de preço'}</h2>
          </div>
          <div className={styles.workspaceActions}>
            <button
              type="button"
              className={view === 'vendas' ? styles.btnPrimary : styles.btnSecondary}
              onClick={() => {
                setError('')
                setFeedback('')
                setView('vendas')
              }}
            >
              <IconReceipt /> Vendas
            </button>
            <button
              type="button"
              className={view === 'lista' ? styles.btnPrimary : styles.btnSecondary}
              onClick={() => {
                setError('')
                setFeedback('')
                setView('lista')
              }}
            >
              <IconTag /> Minha lista de preço
            </button>
            <button type="button" className={styles.btnSecondary} disabled>
              <IconUpload /> Importar lista
            </button>
            {canManage && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setError('')
                  setFeedback('')
                  setConfigForm(configToForm(configGeral))
                  setShowConfigModal(true)
                }}
              >
                Configuração geral
              </button>
            )}
            {canManage && view === 'lista' && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setError('')
                  setFeedback('')
                  setShowPrecoModal(true)
                }}
              >
                <IconPlus /> Criar preços
              </button>
            )}
            {canManage && view === 'vendas' && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setError('')
                  setFeedback('')
                  setVendaEditando(null)
                  setShowVendaModal(true)
                }}
              >
                <IconPlus /> Nova venda
              </button>
            )}
          </div>
        </div>

        {feedback && <p className={styles.feedbackSuccess}>{feedback}</p>}
        {error && <p className={styles.feedbackError}>{error}</p>}

        {loadingWorkspace ? (
          <div className={styles.blankCanvas}>
            <p className={styles.blankTitle}>Carregando dados...</p>
          </div>
        ) : view === 'lista' ? (
          precos.length === 0 ? (
            <div className={styles.blankCanvas}>
              <p className={styles.blankTitle}>Nenhum preço cadastrado ainda.</p>
              <p className={styles.blankText}>
                Clique em <strong>Criar preços</strong> para adicionar nome do produto e preço na sua lista.
              </p>
            </div>
          ) : (
            <div className={styles.priceTable}>
              <div className={styles.priceTableHead}>
                <span>Produto</span>
                <span>Ação</span>
                <span>Preço</span>
              </div>
              <div className={styles.priceTableBody}>
                {precos.map(item => (
                  <div key={item.id} className={styles.priceRow}>
                    <span className={styles.priceName}>{item.nome_produto}</span>
                    <button
                      type="button"
                      className={styles.calcButton}
                      onClick={() => setItemCalculadora(item)}
                    >
                      Verificar cálculo de precificação
                    </button>
                    <strong className={styles.priceValue}>{formatCurrency(item.preco)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : vendas.length === 0 ? (
          <div className={styles.blankCanvas}>
            <p className={styles.blankTitle}>Nenhuma venda montada ainda.</p>
            <p className={styles.blankText}>
              Crie cards com o nome do cliente, adicione produtos da lista e apresente opções de parcelamento.
            </p>
          </div>
        ) : (
          <div className={styles.salesGrid}>
            {vendas.map(venda => {
              const subtotal = calculateSubtotal(venda.itens)
              const entradaAplicada = sanitizeEntrada(subtotal, venda.entrada_valor)
              const parcelas = getParcelasCompactas(
                buildParcelas(subtotal, venda.max_parcelas, taxaMaquinaPercent, entradaAplicada),
              )

              return (
                <article key={venda.id} className={styles.saleCard}>
                  <div className={styles.saleCardHeader}>
                    <div>
                      <p className={styles.saleCardEyebrow}>Cliente</p>
                      <h3 className={styles.saleClient}>{venda.cliente_nome}</h3>
                    </div>
                    <span className={styles.saleBadge}>Até {venda.max_parcelas}x</span>
                  </div>

                  <div className={styles.saleMetrics}>
                    <div className={styles.saleMetric}>
                      <span>Itens</span>
                      <strong>{venda.itens.length}</strong>
                    </div>
                    <div className={styles.saleMetric}>
                      <span>Subtotal</span>
                      <strong>{formatCurrency(subtotal)}</strong>
                    </div>
                    <div className={styles.saleMetric}>
                      <span>Entrada</span>
                      <strong>{formatCurrency(entradaAplicada)}</strong>
                    </div>
                    <div className={styles.saleMetric}>
                      <span>Saldo parcelado</span>
                      <strong>{formatCurrency(parcelas[0]?.totalCobradoParcelado ?? subtotal)}</strong>
                    </div>
                  </div>

                  <div className={styles.saleItemsPreview}>
                    {venda.itens.slice(0, 4).map(item => (
                      <div key={item.id} className={styles.saleItemPreviewRow}>
                        <span>{item.descricao}</span>
                        <strong>{formatCurrency(item.preco_unitario * item.quantidade)}</strong>
                      </div>
                    ))}
                    {venda.itens.length > 4 && (
                      <p className={styles.sectionHint}>+ {venda.itens.length - 4} itens na proposta</p>
                    )}
                  </div>

                  <div className={styles.saleParcelasPreview}>
                    {parcelas.slice(0, 3).map(opcao => (
                      <div key={opcao.parcela} className={styles.saleParcelaBadge}>
                        <span>{opcao.parcela}x</span>
                        <strong>{formatCurrency(opcao.valorParcela)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className={styles.saleCardActions}>
                    <button
                      type="button"
                      className={styles.calcButton}
                      onClick={() => setVendaApresentacao(venda)}
                    >
                      <IconEye /> Modo apresentação
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => {
                          setError('')
                          setFeedback('')
                          setVendaEditando(venda)
                          setShowVendaModal(true)
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => void handleDeleteVenda(venda.id)}
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {showPrecoModal && (
        <PrecoModal
          onClose={() => setShowPrecoModal(false)}
          onSubmit={handleAddPreco}
          saving={savingPreco}
          error={error}
        />
      )}

      {itemCalculadora && (
        <CalculadoraPrecificacaoModal
          item={itemCalculadora}
          configPadrao={configToForm(configGeral)}
          onClose={() => setItemCalculadora(null)}
        />
      )}

      {showConfigModal && (
        <ConfiguracaoGeralModal
          form={configForm}
          saving={savingConfig}
          error={error}
          onChange={handleConfigChange}
          onClose={() => setShowConfigModal(false)}
          onSubmit={handleSaveConfig}
        />
      )}

      {showVendaModal && (
        <VendaModal
          precos={precos}
          taxaMaquinaPercent={taxaMaquinaPercent}
          initialVenda={vendaEditando}
          saving={savingVenda}
          error={error}
          onClose={() => {
            setShowVendaModal(false)
            setVendaEditando(null)
          }}
          onSubmit={handleSaveVenda}
        />
      )}

      {vendaApresentacao && (
        <ApresentacaoVendaModal
          venda={vendaApresentacao}
          precos={precos}
          taxaMaquinaPercent={taxaMaquinaPercent}
          taxaBoletoPercent={taxaBoletoPercent}
          onClose={() => setVendaApresentacao(null)}
        />
      )}
    </div>
  )
}
