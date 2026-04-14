import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import styles from './PrecificacaoPage.module.css'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'
import { useSessionStorageState } from '../hooks/useSessionStorageState'
import PrecificacaoVendaModal from '../components/precificacao/VendaModal'
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

function isViewMode(value: unknown): value is ViewMode {
  return value === 'vendas' || value === 'lista'
}

type CustoProfissionaisBase =
  | 'custoInsumos'
  | 'custoMaterialAplicado'
  | 'custoLaboratorio'
  | 'royalties'
  | 'impostos'
  | 'comissoes'
  | 'taxaMaquina'

type CalculadoraForm = {
  custoInsumos: string
  custoMaterialAplicado: string
  custoLaboratorio: string
  royaltiesPercent: string
  custoProfissionaisModo: 'percentual' | 'valor'
  custoProfissionaisBases: CustoProfissionaisBase[]
  custoProfissionaisPercent: string
  custoProfissionaisValor: string
  impostosPercent: string
  comissoesPercent: string
  taxaMaquinaPercent: string
}

type CalculadoraPersistida = CalculadoraForm & {
  precoVenda: string
}

type ConfiguracaoGeralForm = {
  royaltiesPercent: string
  custoProfissionaisPercent: string
  impostosPercent: string
  comissoesPercent: string
  taxaMaquinaPercent: string
}

type ConfiguracaoVendasForm = {
  maxCartao: string
  maxBoleto: string
  maxPix: string
  maxCarne: string
  tempoApresentacaoSegundos: string
  ofertaValidaMinutos: string
  exibirCampanhaPromocional: boolean
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

type PrecoFormPayload = {
  nome: string
  categoria: string
  preco: number
  margem: number | null
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

const formatCurrencyInput = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatPercentInput = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

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

const CUSTO_PROFISSIONAIS_BASE_LABELS: Record<CustoProfissionaisBase, string> = {
  custoInsumos: 'Custo insumos',
  custoMaterialAplicado: 'Custo material aplicado',
  custoLaboratorio: 'Custo laboratório',
  royalties: 'Royalties e FNP',
  impostos: 'Impostos',
  comissoes: 'Comissões vendas',
  taxaMaquina: 'Taxa máquina',
}

function Spinner() {
  return <div className={styles.spinner} />
}

function parsePreco(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseMargem(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  if (normalized === '') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function roundCurrencyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function sanitizePercentInput(value: string) {
  return value.replace(/[^\d,.-]/g, '')
}

function formatCurrencyTypingInput(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return formatCurrencyInput(Number(digits) / 100)
}

function formatStoredCurrencyInput(value: unknown) {
  if (typeof value !== 'string') return ''
  if (value.trim() === '') return ''
  return formatCurrencyInput(parsePreco(value))
}

function normalizeCategoria(value?: string | null) {
  const categoria = value?.trim()
  return categoria ? categoria : null
}

function getCategoriaLabel(value?: string | null) {
  return normalizeCategoria(value) ?? CATEGORIA_SEM_CADASTRO
}

function getCustoProfissionaisBaseLabel(base: CustoProfissionaisBase) {
  return CUSTO_PROFISSIONAIS_BASE_LABELS[base]
}

function getCustoProfissionaisBasesLabel(bases: CustoProfissionaisBase[]) {
  if (bases.length === 0) return 'Nenhuma referência selecionada'
  const labels = bases.map(getCustoProfissionaisBaseLabel)
  if (labels.length <= 2) return labels.join(' + ')
  return `${labels.length} referências selecionadas`
}

function isCustoProfissionaisBase(value: unknown): value is CustoProfissionaisBase {
  return typeof value === 'string' && value in CUSTO_PROFISSIONAIS_BASE_LABELS
}

function getCalculadoraPersistida(
  item: EmpresaPreco | null,
  configPadrao: ConfiguracaoGeralForm,
): CalculadoraPersistida {
  const raw = item?.precificacao_calculo
  const saved = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}

  const formBase: CalculadoraForm = {
    custoInsumos: formatStoredCurrencyInput(saved.custoInsumos),
    custoMaterialAplicado: formatStoredCurrencyInput(saved.custoMaterialAplicado),
    custoLaboratorio: formatStoredCurrencyInput(saved.custoLaboratorio),
    royaltiesPercent: typeof saved.royaltiesPercent === 'string' ? saved.royaltiesPercent : configPadrao.royaltiesPercent,
    custoProfissionaisModo: saved.custoProfissionaisModo === 'valor' ? 'valor' : 'percentual',
    custoProfissionaisBases: Array.isArray(saved.custoProfissionaisBases)
      ? saved.custoProfissionaisBases.filter(isCustoProfissionaisBase)
      : [],
    custoProfissionaisPercent: typeof saved.custoProfissionaisPercent === 'string' ? saved.custoProfissionaisPercent : configPadrao.custoProfissionaisPercent,
    custoProfissionaisValor: formatStoredCurrencyInput(saved.custoProfissionaisValor),
    impostosPercent: typeof saved.impostosPercent === 'string' ? saved.impostosPercent : configPadrao.impostosPercent,
    comissoesPercent: typeof saved.comissoesPercent === 'string' ? saved.comissoesPercent : configPadrao.comissoesPercent,
    taxaMaquinaPercent: typeof saved.taxaMaquinaPercent === 'string' ? saved.taxaMaquinaPercent : configPadrao.taxaMaquinaPercent,
  }

  return {
    ...formBase,
    precoVenda: typeof saved.precoVenda === 'string'
      ? formatStoredCurrencyInput(saved.precoVenda)
      : '',
  }
}

function hasGestaaCalculatedPrice(item: EmpresaPreco) {
  const raw = item.precificacao_calculo
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false

  const saved = raw as Record<string, unknown>
  return Object.keys(saved).length > 0 && typeof saved.precoVenda === 'string' && saved.precoVenda.trim() !== ''
}

function getItemMargemPercent(item: EmpresaPreco, configPadrao: ConfiguracaoGeralForm) {
  if (typeof item.margem_percent === 'number' && Number.isFinite(item.margem_percent)) {
    return item.margem_percent
  }

  if (!hasGestaaCalculatedPrice(item)) return null

  return calcularPrecificacao(item.preco, getCalculadoraPersistida(item, configPadrao)).margem
}

function isMargemSaudavel(margem: number | null) {
  return margem != null && margem >= 50
}

function calcularPrecoSugerido(form: CalculadoraForm) {
  const custoInsumos = parsePreco(form.custoInsumos)
  const custoMaterialAplicado = parsePreco(form.custoMaterialAplicado)
  const custoLaboratorio = parsePreco(form.custoLaboratorio)
  const royaltiesRate = parsePreco(form.royaltiesPercent) / 100
  const impostosRate = parsePreco(form.impostosPercent) / 100
  const comissoesRate = parsePreco(form.comissoesPercent) / 100
  const taxaMaquinaRate = parsePreco(form.taxaMaquinaPercent) / 100
  const custoProfissionaisRate = parsePreco(form.custoProfissionaisPercent) / 100
  const custoProfissionaisValor = parsePreco(form.custoProfissionaisValor)

  const custoFixoBase =
    custoInsumos +
    custoMaterialAplicado +
    custoLaboratorio
  const encargosSobreVendaRate =
    royaltiesRate +
    impostosRate +
    comissoesRate +
    taxaMaquinaRate

  const solveSuggestedPrice = (fixedCost: number, variableRate: number) => {
    const denominator = 1 - (2 * variableRate)
    if (denominator <= 0) return 0
    return roundCurrencyValue((2 * fixedCost) / denominator)
  }

  if (form.custoProfissionaisModo === 'valor') {
    return solveSuggestedPrice(custoFixoBase + custoProfissionaisValor, encargosSobreVendaRate)
  }

  const abatimentosFixos = form.custoProfissionaisBases.reduce((total, base) => {
    if (base === 'custoInsumos') return total + custoInsumos
    if (base === 'custoMaterialAplicado') return total + custoMaterialAplicado
    if (base === 'custoLaboratorio') return total + custoLaboratorio
    return total
  }, 0)

  const abatimentosRate = form.custoProfissionaisBases.reduce((total, base) => {
    if (base === 'royalties') return total + royaltiesRate
    if (base === 'impostos') return total + impostosRate
    if (base === 'comissoes') return total + comissoesRate
    if (base === 'taxaMaquina') return total + taxaMaquinaRate
    return total
  }, 0)

  const precoComProfissionais = solveSuggestedPrice(
    custoFixoBase - (custoProfissionaisRate * abatimentosFixos),
    encargosSobreVendaRate + (custoProfissionaisRate * (1 - abatimentosRate)),
  )

  if (precoComProfissionais > 0) {
    const baseLiquidaProfissionais =
      precoComProfissionais -
      abatimentosFixos -
      (precoComProfissionais * abatimentosRate)

    if (baseLiquidaProfissionais > 0) return precoComProfissionais
  }

  return solveSuggestedPrice(custoFixoBase, encargosSobreVendaRate)
}

function calcularPrecificacao(precoVenda: number, form: CalculadoraForm) {
  const custoInsumos = parsePreco(form.custoInsumos)
  const custoMaterialAplicado = parsePreco(form.custoMaterialAplicado)
  const custoLaboratorio = parsePreco(form.custoLaboratorio)
  const royaltiesPercent = parsePreco(form.royaltiesPercent)
  const custoProfissionaisPercent = parsePreco(form.custoProfissionaisPercent)
  const custoProfissionaisValor = parsePreco(form.custoProfissionaisValor)
  const impostosPercent = parsePreco(form.impostosPercent)
  const comissoesPercent = parsePreco(form.comissoesPercent)
  const taxaMaquinaPercent = parsePreco(form.taxaMaquinaPercent)

  const royalties = precoVenda * (royaltiesPercent / 100)
  const impostos = precoVenda * (impostosPercent / 100)
  const comissoes = precoVenda * (comissoesPercent / 100)
  const taxaMaquina = precoVenda * (taxaMaquinaPercent / 100)
  const custoProfissionaisBaseValores: Record<CustoProfissionaisBase, number> = {
    custoInsumos,
    custoMaterialAplicado,
    custoLaboratorio,
    royalties,
    impostos,
    comissoes,
    taxaMaquina,
  }
  const custoProfissionaisAbatimentos = form.custoProfissionaisBases.reduce(
    (total, base) => total + custoProfissionaisBaseValores[base],
    0,
  )
  const subtotalAntesProfissionais =
    custoInsumos +
    custoMaterialAplicado +
    custoLaboratorio +
    royalties +
    impostos +
    comissoes +
    taxaMaquina
  const custoProfissionais =
    form.custoProfissionaisModo === 'valor'
      ? custoProfissionaisValor
      : (() => {
          const percentual = custoProfissionaisPercent / 100
          const baseLiquida = Math.max(precoVenda - custoProfissionaisAbatimentos, 0)

          if (percentual <= 0) return 0
          return baseLiquida * percentual
        })()

  const custoTotal =
    subtotalAntesProfissionais +
    custoProfissionais

  const margem = precoVenda > 0 ? ((precoVenda - custoTotal) / precoVenda) * 100 : 0
  const precoSugerido = calcularPrecoSugerido(form)
  const diferencaParaMargemIdeal = roundCurrencyValue(precoSugerido - precoVenda)

  return {
    custoInsumos,
    custoMaterialAplicado,
    custoLaboratorio,
    royaltiesPercent,
    custoProfissionaisModo: form.custoProfissionaisModo,
    custoProfissionaisBases: form.custoProfissionaisBases,
    custoProfissionaisBaseValor: Math.max(precoVenda - custoProfissionaisAbatimentos, 0),
    custoProfissionaisAbatimentos,
    custoProfissionaisPercent,
    custoProfissionaisValor,
    impostosPercent,
    comissoesPercent,
    taxaMaquinaPercent,
    royalties,
    custoProfissionais,
    impostos,
    comissoes,
    taxaMaquina,
    custoTotal,
    precoSugerido,
    diferencaParaMargemIdeal,
    margem,
    resultadoMargem: margem < 50 ? 'Abaixo da meta de 50%' : 'Meta de 50% atingida',
  }
}

function configToForm(config: EmpresaPrecificacaoConfig | null): ConfiguracaoGeralForm {
  return {
    royaltiesPercent: config ? String(config.royalties_percent) : '',
    custoProfissionaisPercent: config ? String(config.custo_profissionais_percent) : '',
    impostosPercent: config ? String(config.impostos_percent) : '',
    comissoesPercent: config ? String(config.comissoes_percent) : '',
    taxaMaquinaPercent: config ? String(config.taxa_maquina_percent) : '',
  }
}

function configToVendasForm(config: EmpresaPrecificacaoConfig | null): ConfiguracaoVendasForm {
  return {
    maxCartao: config ? String(config.vendas_max_cartao) : '12',
    maxBoleto: config ? String(config.vendas_max_boleto) : '1',
    maxPix: config ? String(config.vendas_max_pix) : '1',
    maxCarne: config ? String(config.vendas_max_carne) : '1',
    tempoApresentacaoSegundos: config ? String(config.vendas_tempo_apresentacao_segundos) : '0',
    ofertaValidaMinutos: config ? String(config.vendas_oferta_valida_minutos) : '15',
    exibirCampanhaPromocional: config ? config.vendas_exibir_campanha_promocional : false,
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

function PrecoModal({
  initialItem,
  configPadrao,
  onClose,
  onSubmit,
  saving,
  error,
}: {
  initialItem?: EmpresaPreco | null
  configPadrao: ConfiguracaoGeralForm
  onClose: () => void
  onSubmit: (item: PrecoFormPayload) => Promise<void>
  saving: boolean
  error: string
}) {
  const [nome, setNome] = useState(initialItem?.nome_produto ?? '')
  const [categoria, setCategoria] = useState(initialItem?.categoria ?? '')
  const [preco, setPreco] = useState(initialItem ? formatCurrencyInput(initialItem.preco) : '')
  const [margem, setMargem] = useState(() => {
    const margemInicial = initialItem ? getItemMargemPercent(initialItem, configPadrao) : null
    return margemInicial != null ? formatPercentInput(margemInicial) : ''
  })
  const [erroLocal, setErroLocal] = useState('')
  const [showCalculadora, setShowCalculadora] = useState(false)
  const backdropDismiss = useBackdropDismiss(onClose, saving)
  const isEditing = Boolean(initialItem)

  useEffect(() => {
    setNome(initialItem?.nome_produto ?? '')
    setCategoria(initialItem?.categoria ?? '')
    setPreco(initialItem ? formatCurrencyInput(initialItem.preco) : '')
    const margemInicial = initialItem ? getItemMargemPercent(initialItem, configPadrao) : null
    setMargem(margemInicial != null ? formatPercentInput(margemInicial) : '')
    setErroLocal('')
    setShowCalculadora(false)
  }, [configPadrao, initialItem])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome.trim()) {
      setErroLocal('Informe o nome do produto ou servico.')
      return
    }

    if (!categoria) {
      setErroLocal('Selecione uma categoria odontologica.')
      return
    }

    const precoNumerico = parsePreco(preco)
    const margemPercentual = parseMargem(margem)
    if (precoNumerico <= 0) {
      setErroLocal('Informe um preço válido.')
      return
    }

    setErroLocal('')

    if (!isEditing && margemPercentual == null) {
      setErroLocal('Informe a margem do preco.')
      return
    }

    await onSubmit({
      nome: nome.trim(),
      categoria,
      preco: precoNumerico,
      margem: margemPercentual,
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
          <h2 className={styles.modalTitle}>{isEditing ? 'Editar preço' : 'Novo preço'}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Nome do produto ou servico</span>
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
            <span className={styles.modalLabel}>Categoria odontologica</span>
            <select
              className={styles.modalInput}
              value={categoria}
              onChange={e => {
                setCategoria(e.target.value)
                setErroLocal('')
              }}
              disabled={saving}
            >
              <option value="">Selecione uma categoria</option>
              {PRECIFICACAO_CATEGORIAS_ODONTO.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <span className={styles.modalFieldHint}>Use a categoria para organizar os produtos e servicos da clinica.</span>
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Preço</span>
            <div className={styles.priceInputRow}>
              <input
                className={styles.modalInput}
                placeholder="Ex: R$ 120,00"
                value={preco}
                onChange={e => {
                  setPreco(formatCurrencyTypingInput(e.target.value))
                  setErroLocal('')
                }}
                inputMode="decimal"
                disabled={saving}
              />
              <button
                type="button"
                className={styles.calcShortcutButton}
                onClick={() => setShowCalculadora(true)}
                disabled={saving}
              >
                Preço calculado
              </button>
            </div>
            <span className={styles.modalFieldHint}>Use a calculadora para montar o preço com base no custo total.</span>
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Margem (%)</span>
            <input
              className={styles.modalInput}
              placeholder="Ex: 50"
              value={margem}
              onChange={e => {
                setMargem(sanitizePercentInput(e.target.value))
                setErroLocal('')
              }}
              inputMode="decimal"
              disabled={saving}
            />
            <span className={styles.modalFieldHint}>A margem ajuda a destacar rapidamente itens abaixo da meta de 50%.</span>
          </label>

          {(erroLocal || error) && <p className={styles.formError}>{erroLocal || error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>

      {showCalculadora && (
        <CalculadoraPrecificacaoModal
          item={{
            id: initialItem?.id ?? 'novo-preco',
            empresa_id: initialItem?.empresa_id ?? '',
            nome_produto: nome.trim() || 'Novo item',
            categoria: categoria || CATEGORIA_SEM_CADASTRO,
            preco: parsePreco(preco),
            margem_percent: parseMargem(margem),
            precificacao_calculo: null,
            ativo: initialItem?.ativo ?? true,
            created_at: initialItem?.created_at ?? new Date().toISOString(),
            updated_at: initialItem?.updated_at ?? new Date().toISOString(),
          }}
          configPadrao={configPadrao}
          canManage
          savingPreco={saving}
          error={error}
          onSavePrice={async ({ preco: precoCalculado, margem: margemCalculada }) => {
            setPreco(formatCurrencyInput(precoCalculado))
            setMargem(formatPercentInput(margemCalculada))
            setErroLocal('')
            setShowCalculadora(false)
            return true
          }}
          onClose={() => setShowCalculadora(false)}
        />
      )}
    </div>
  )
}

function EscolhaCriacaoPrecoModal({
  onClose,
  onSelectSimple,
  onSelectCalculated,
}: {
  onClose: () => void
  onSelectSimple: () => void
  onSelectCalculated: () => void
}) {
  const backdropDismiss = useBackdropDismiss(onClose)

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={`${styles.modal} ${styles.choiceModal}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Como deseja criar o preço?</h2>
            <p className={styles.calcItemName}>Escolha entre cadastro direto ou cálculo completo antes de salvar.</p>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.choiceGrid}>
          <button type="button" className={styles.choiceCard} onClick={onSelectSimple}>
            <strong>Simples</strong>
            <span>Abre o cadastro atual com nome, categoria e preço.</span>
          </button>

          <button type="button" className={styles.choiceCard} onClick={onSelectCalculated}>
            <strong>Calculada</strong>
            <span>Abre a calculadora de precificação e salva o novo produto ou serviço ao final.</span>
          </button>
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancel} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function CalculadoraPrecificacaoModal({
  item,
  configPadrao,
  canManage,
  savingPreco,
  error,
  onSavePrice,
  onPersistCalculo,
  onCreatePrecoCalculado,
  onClose,
}: {
  item?: EmpresaPreco | null
  configPadrao: ConfiguracaoGeralForm
  canManage: boolean
  savingPreco: boolean
  error: string
  onSavePrice?: (result: { preco: number; margem: number }) => Promise<boolean> | boolean
  onPersistCalculo?: (itemId: string, payload: CalculadoraPersistida, preco: number) => Promise<void>
  onCreatePrecoCalculado?: (item: PrecoFormPayload, calculo: CalculadoraPersistida) => Promise<void>
  onClose: () => void
}) {
  const isCreating = !item
  const backdropDismiss = useBackdropDismiss(onClose)
  const initialPersisted = useMemo(() => getCalculadoraPersistida(item ?? null, configPadrao), [configPadrao, item])
  const [nome, setNome] = useState(item?.nome_produto ?? '')
  const [categoria, setCategoria] = useState(item?.categoria ?? '')
  const [form, setForm] = useState<CalculadoraForm>(() => ({
    custoInsumos: initialPersisted.custoInsumos,
    custoMaterialAplicado: initialPersisted.custoMaterialAplicado,
    custoLaboratorio: initialPersisted.custoLaboratorio,
    royaltiesPercent: initialPersisted.royaltiesPercent,
    custoProfissionaisModo: initialPersisted.custoProfissionaisModo,
    custoProfissionaisBases: initialPersisted.custoProfissionaisBases,
    custoProfissionaisPercent: initialPersisted.custoProfissionaisPercent,
    custoProfissionaisValor: initialPersisted.custoProfissionaisValor,
    impostosPercent: initialPersisted.impostosPercent,
    comissoesPercent: initialPersisted.comissoesPercent,
    taxaMaquinaPercent: initialPersisted.taxaMaquinaPercent,
  }))
  const [precoVendaEditado, setPrecoVendaEditado] = useState(() => initialPersisted.precoVenda)
  const [erroLocal, setErroLocal] = useState('')
  const precoVendaAtual = parsePreco(precoVendaEditado) > 0 ? parsePreco(precoVendaEditado) : item?.preco ?? 0
  const modalStateKey = item?.id ?? '__new__'

  const calculo = calcularPrecificacao(precoVendaAtual, form)

  useEffect(() => {
    const persisted = getCalculadoraPersistida(item ?? null, configPadrao)
    setNome(item?.nome_produto ?? '')
    setCategoria(item?.categoria ?? '')
    setForm({
      custoInsumos: persisted.custoInsumos,
      custoMaterialAplicado: persisted.custoMaterialAplicado,
      custoLaboratorio: persisted.custoLaboratorio,
      royaltiesPercent: persisted.royaltiesPercent,
      custoProfissionaisModo: persisted.custoProfissionaisModo,
      custoProfissionaisBases: persisted.custoProfissionaisBases,
      custoProfissionaisPercent: persisted.custoProfissionaisPercent,
      custoProfissionaisValor: persisted.custoProfissionaisValor,
      impostosPercent: persisted.impostosPercent,
      comissoesPercent: persisted.comissoesPercent,
      taxaMaquinaPercent: persisted.taxaMaquinaPercent,
    })
    setPrecoVendaEditado(persisted.precoVenda)
    setErroLocal('')
  }, [modalStateKey])

  const calculadoraPersistida = useMemo<CalculadoraPersistida>(() => ({
    ...form,
    precoVenda: precoVendaEditado,
  }), [form, precoVendaEditado])
  const savedPayload = useMemo(() => getCalculadoraPersistida(item ?? null, configPadrao), [configPadrao, item])
  const hasChanges = useMemo(() => {
    const baseChanged = JSON.stringify(calculadoraPersistida) !== JSON.stringify(savedPayload)
    if (isCreating) return baseChanged || nome.trim() !== '' || categoria !== ''
    return baseChanged
  }, [calculadoraPersistida, categoria, isCreating, nome, savedPayload])

  const handleChange = (field: Exclude<keyof CalculadoraForm, 'custoProfissionaisBases'>, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleToggleCustoProfissionais = (modo: CalculadoraForm['custoProfissionaisModo']) => {
    setForm(prev => ({ ...prev, custoProfissionaisModo: modo }))
  }

  const handleToggleCustoProfissionaisBase = (base: CustoProfissionaisBase) => {
    setForm(prev => ({
      ...prev,
      custoProfissionaisBases: prev.custoProfissionaisBases.includes(base)
        ? prev.custoProfissionaisBases.filter(item => item !== base)
        : [...prev.custoProfissionaisBases, base],
    }))
  }

  const renderProcedimentoComSelecao = (base: CustoProfissionaisBase, label: string) => (
    <div className={styles.calcProcedureCell}>
      {form.custoProfissionaisModo === 'percentual' && (
        <label className={styles.calcRowCheckbox}>
          <input
            type="checkbox"
            checked={form.custoProfissionaisBases.includes(base)}
            onChange={() => handleToggleCustoProfissionaisBase(base)}
          />
        </label>
      )}
      <span>{label}</span>
    </div>
  )

  const handleSalvarCalculo = async () => {
    if (isCreating && !nome.trim()) {
      setErroLocal('Informe o nome do produto ou servico.')
      return
    }
    if (isCreating && !categoria) {
      setErroLocal('Selecione uma categoria odontologica.')
      return
    }

    const precoNumerico = parsePreco(precoVendaEditado)

    if (precoNumerico <= 0) {
      setErroLocal('Informe um preço de venda válido.')
      return
    }

    setErroLocal('')

    if (onSavePrice) {
      await onSavePrice({ preco: precoNumerico, margem: calculo.margem })
      return
    }

    if (isCreating) {
      await onCreatePrecoCalculado?.({
        nome: nome.trim(),
        categoria,
        preco: precoNumerico,
        margem: calculo.margem,
      }, calculadoraPersistida)
      return
    }

    if (!item) return
    await onPersistCalculo?.(item.id, calculadoraPersistida, precoNumerico)
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
            <h2 className={styles.modalTitle}>{isCreating ? 'Criar preço calculado' : 'Verificar cálculo de precificação'}</h2>
            <p className={styles.calcItemName}>
              {isCreating
                ? 'Preencha os dados do produto ou servico e salve tudo em uma etapa.'
                : `${item.nome_produto} - ${getCategoriaLabel(item.categoria)}`}
            </p>
          </div>
          <div className={styles.modalHeaderActions}>
            <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles.calcLayout}>
          <div className={styles.calcForm}>
            {isCreating && (
              <div className={styles.calcFormCard}>
                <div className={styles.calcFormHeader}>
                  <h3 className={styles.calcFormTitle}>Dados do item</h3>
                  <p className={styles.calcFormHint}>Essas informações serão salvas junto com a precificação.</p>
                </div>

                <label className={styles.modalField}>
                  <span className={styles.modalLabel}>Nome do produto ou servico</span>
                  <input
                    className={styles.modalInput}
                    value={nome}
                    onChange={e => {
                      setNome(e.target.value)
                      setErroLocal('')
                    }}
                    placeholder="Ex: Consulta de avaliação"
                    autoFocus
                    disabled={savingPreco}
                  />
                </label>

                <label className={styles.modalField}>
                  <span className={styles.modalLabel}>Categoria odontologica</span>
                  <select
                    className={styles.modalInput}
                    value={categoria}
                    onChange={e => {
                      setCategoria(e.target.value)
                      setErroLocal('')
                    }}
                    disabled={savingPreco}
                  >
                    <option value="">Selecione uma categoria</option>
                    {PRECIFICACAO_CATEGORIAS_ODONTO.map(itemCategoria => (
                      <option key={itemCategoria} value={itemCategoria}>
                        {itemCategoria}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className={styles.calcFormCard}>
              <div className={styles.calcFormHeader}>
                <h3 className={styles.calcFormTitle}>Custos diretos</h3>
                <p className={styles.calcFormHint}>Valores que entram diretamente na execução do procedimento.</p>
              </div>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Custo insumos (R$)</span>
                <input
                  className={styles.modalInput}
                  value={form.custoInsumos}
                  onChange={e => {
                    handleChange('custoInsumos', formatCurrencyTypingInput(e.target.value))
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder="Ex: R$ 40,00"
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Custo material aplicado (R$)</span>
                <input
                  className={styles.modalInput}
                  value={form.custoMaterialAplicado}
                  onChange={e => {
                    handleChange('custoMaterialAplicado', formatCurrencyTypingInput(e.target.value))
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder="Ex: R$ 700,00"
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Custo laboratório (R$)</span>
                <input
                  className={styles.modalInput}
                  value={form.custoLaboratorio}
                  onChange={e => {
                    handleChange('custoLaboratorio', formatCurrencyTypingInput(e.target.value))
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder="Ex: R$ 120,00"
                />
              </label>
            </div>
          </div>

          <div className={styles.calcForm}>
            <div className={styles.calcFormCard}>
              <div className={styles.calcFormHeader}>
                <h3 className={styles.calcFormTitle}>Encargos e repasses</h3>
                <p className={styles.calcFormHint}>Percentuais e remunerações que impactam a margem final.</p>
              </div>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Royalties e FNP (%)</span>
                <input
                  className={styles.modalInput}
                  value={form.royaltiesPercent}
                  onChange={e => {
                    handleChange('royaltiesPercent', sanitizePercentInput(e.target.value))
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder="Ex: 9"
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Custo profissionais</span>
                <div className={styles.switchRow}>
                  <button
                    type="button"
                    className={`${styles.switchOption} ${form.custoProfissionaisModo === 'percentual' ? styles.switchOptionActive : ''}`}
                    onClick={() => handleToggleCustoProfissionais('percentual')}
                  >
                    Porcentagem
                  </button>
                  <button
                    type="button"
                    className={`${styles.switchOption} ${form.custoProfissionaisModo === 'valor' ? styles.switchOptionActive : ''}`}
                    onClick={() => handleToggleCustoProfissionais('valor')}
                  >
                    Valor
                  </button>
                </div>
                <input
                  className={styles.modalInput}
                  value={form.custoProfissionaisModo === 'percentual' ? form.custoProfissionaisPercent : form.custoProfissionaisValor}
                  onChange={e => {
                    handleChange(
                      form.custoProfissionaisModo === 'percentual'
                        ? 'custoProfissionaisPercent'
                        : 'custoProfissionaisValor',
                      form.custoProfissionaisModo === 'percentual'
                        ? sanitizePercentInput(e.target.value)
                        : formatCurrencyTypingInput(e.target.value),
                    )
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder={form.custoProfissionaisModo === 'percentual' ? 'Ex: 30' : 'Ex: R$ 450,00'}
                />
                {form.custoProfissionaisModo === 'percentual' && (
                  <span className={styles.modalFieldHint}>
                    A porcentagem será aplicada sobre o valor da venda. Os procedimentos marcados ao lado entram como abatimento dessa base.
                  </span>
                )}
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Impostos (%)</span>
                <input
                  className={styles.modalInput}
                  value={form.impostosPercent}
                  onChange={e => {
                    handleChange('impostosPercent', sanitizePercentInput(e.target.value))
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder="Ex: 8"
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Comissões vendas (%)</span>
                <input
                  className={styles.modalInput}
                  value={form.comissoesPercent}
                  onChange={e => {
                    handleChange('comissoesPercent', sanitizePercentInput(e.target.value))
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder="Ex: 3"
                />
              </label>

              <label className={styles.modalField}>
                <span className={styles.modalLabel}>Taxa máquina (%)</span>
                <input
                  className={styles.modalInput}
                  value={form.taxaMaquinaPercent}
                  onChange={e => {
                    handleChange('taxaMaquinaPercent', sanitizePercentInput(e.target.value))
                    setErroLocal('')
                  }}
                  inputMode="decimal"
                  placeholder="Ex: 2"
                />
              </label>
            </div>
          </div>

          <div className={styles.calcSummary}>
            <div className={styles.calcTable}>
              <div className={styles.calcTableHead}>
                <span>Procedimento</span>
                <span>Referência</span>
                <span>Custo</span>
              </div>

              <div className={styles.calcRow}>
                {renderProcedimentoComSelecao('custoInsumos', 'Custo insumos')}
                <span>{calculo.custoInsumos > 0 ? formatCurrency(calculo.custoInsumos) : '-'}</span>
                <strong>{calculo.custoInsumos > 0 ? formatCurrency(calculo.custoInsumos) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                {renderProcedimentoComSelecao('custoMaterialAplicado', 'Custo material aplicado')}
                <span>{calculo.custoMaterialAplicado > 0 ? formatCurrency(calculo.custoMaterialAplicado) : '-'}</span>
                <strong>{calculo.custoMaterialAplicado > 0 ? formatCurrency(calculo.custoMaterialAplicado) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                {renderProcedimentoComSelecao('custoLaboratorio', 'Custo laboratório')}
                <span>{calculo.custoLaboratorio > 0 ? formatCurrency(calculo.custoLaboratorio) : '-'}</span>
                <strong>{calculo.custoLaboratorio > 0 ? formatCurrency(calculo.custoLaboratorio) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                {renderProcedimentoComSelecao('royalties', 'Royalties e FNP')}
                <span>{calculo.royaltiesPercent > 0 ? formatPercent(calculo.royaltiesPercent) : '-'}</span>
                <strong>{calculo.royalties > 0 ? formatCurrency(calculo.royalties) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                <span>Custo profissionais</span>
                <span>
                  {calculo.custoProfissionaisModo === 'valor'
                    ? (calculo.custoProfissionaisValor > 0 ? formatCurrency(calculo.custoProfissionaisValor) : '-')
                    : (
                      calculo.custoProfissionaisPercent > 0
                        ? `${formatPercent(calculo.custoProfissionaisPercent)} sobre valor da venda${calculo.custoProfissionaisBases.length > 0 ? ` menos ${getCustoProfissionaisBasesLabel(calculo.custoProfissionaisBases)}` : ''}`
                        : '-'
                    )}
                </span>
                <strong>{calculo.custoProfissionais > 0 ? formatCurrency(calculo.custoProfissionais) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                {renderProcedimentoComSelecao('impostos', 'Impostos')}
                <span>{calculo.impostosPercent > 0 ? formatPercent(calculo.impostosPercent) : '-'}</span>
                <strong>{calculo.impostos > 0 ? formatCurrency(calculo.impostos) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                {renderProcedimentoComSelecao('comissoes', 'Comissões vendas')}
                <span>{calculo.comissoesPercent > 0 ? formatPercent(calculo.comissoesPercent) : '-'}</span>
                <strong>{calculo.comissoes > 0 ? formatCurrency(calculo.comissoes) : '-'}</strong>
              </div>
              <div className={styles.calcRow}>
                {renderProcedimentoComSelecao('taxaMaquina', 'Taxa máquina')}
                <span>{calculo.taxaMaquinaPercent > 0 ? formatPercent(calculo.taxaMaquinaPercent) : '-'}</span>
                <strong>{calculo.taxaMaquina > 0 ? formatCurrency(calculo.taxaMaquina) : '-'}</strong>
              </div>
            </div>
          </div>

          <div className={styles.calcSummaryAside}>
            <div className={styles.calcHighlights}>
              <div className={styles.calcHighlight}>
                <span>Custo total</span>
                <strong>{formatCurrency(calculo.custoTotal)}</strong>
              </div>
              <div className={styles.calcHighlight}>
                <span>Margem</span>
                <strong>{formatPercent(calculo.margem)}</strong>
              </div>
              <div className={`${styles.calcHighlight} ${styles.calcHighlightSuggested}`}>
                <span>Preço sugerido</span>
                <strong>{formatCurrency(calculo.precoSugerido)}</strong>
                <span className={styles.calcHighlightHint}>Sugestão para atingir 50% de margem.</span>
                <span className={styles.calcHighlightHint}>
                  {Math.abs(calculo.diferencaParaMargemIdeal) < 0.005
                    ? 'O preço atual já está no ponto de equilíbrio da meta.'
                    : calculo.diferencaParaMargemIdeal > 0
                      ? `Faltam ${formatCurrency(calculo.diferencaParaMargemIdeal)} no preço de venda para chegar a 50%.`
                      : `O preço atual está ${formatCurrency(Math.abs(calculo.diferencaParaMargemIdeal))} acima da meta de 50%.`}
                </span>
              </div>
              <div className={`${styles.calcHighlight} ${styles.calcHighlightEditable}`}>
                <span>Preço de venda</span>
                {canManage ? (
                  <>
                    <input
                      className={`${styles.modalInput} ${styles.calcHighlightInput}`}
                      value={precoVendaEditado}
                      onChange={e => {
                        setPrecoVendaEditado(formatCurrencyTypingInput(e.target.value))
                        setErroLocal('')
                      }}
                      inputMode="decimal"
                      placeholder="Ex: R$ 1.250,00"
                      disabled={savingPreco}
                    />
                    {(erroLocal || error) && <p className={styles.formError}>{erroLocal || error}</p>}
                    {!erroLocal && !error && (
                      <p className={styles.modalFieldHint}>
                        {isCreating
                          ? 'Ao salvar, o novo produto ou servico será criado com este preço e com toda a configuração da calculadora.'
                          : hasChanges
                            ? 'Use o botão salvar para gravar o preço de venda e toda a configuração desta janela.'
                            : 'Alterações salvas neste produto.'}
                      </p>
                    )}
                  </>
                ) : (
                  <strong>{formatCurrency(precoVendaAtual)}</strong>
                )}
              </div>
              <div className={`${styles.calcHighlight} ${calculo.margem < 50 ? styles.calcHighlightBad : styles.calcHighlightGood}`}>
                <span>Resultado da margem</span>
                <strong>{calculo.resultadoMargem}</strong>
              </div>
            </div>
            {canManage && (
              <div className={styles.inlineActions}>
                <button
                  type="button"
                  className={styles.modalCancel}
                  onClick={() => {
                    if (isCreating) {
                      onClose()
                      return
                    }

                    setForm({
                      custoInsumos: savedPayload.custoInsumos,
                      custoMaterialAplicado: savedPayload.custoMaterialAplicado,
                      custoLaboratorio: savedPayload.custoLaboratorio,
                      royaltiesPercent: savedPayload.royaltiesPercent,
                      custoProfissionaisModo: savedPayload.custoProfissionaisModo,
                      custoProfissionaisBases: savedPayload.custoProfissionaisBases,
                      custoProfissionaisPercent: savedPayload.custoProfissionaisPercent,
                      custoProfissionaisValor: savedPayload.custoProfissionaisValor,
                      impostosPercent: savedPayload.impostosPercent,
                      comissoesPercent: savedPayload.comissoesPercent,
                      taxaMaquinaPercent: savedPayload.taxaMaquinaPercent,
                    })
                    setPrecoVendaEditado(savedPayload.precoVenda)
                    setErroLocal('')
                  }}
                  disabled={savingPreco}
                >
                  {isCreating ? 'Cancelar' : 'Reverter'}
                </button>
                <button
                  type="button"
                  className={styles.modalSubmit}
                  onClick={() => void handleSalvarCalculo()}
                  disabled={savingPreco || (!isCreating && !hasChanges && !erroLocal)}
                >
                  {savingPreco ? 'Salvando...' : isCreating ? 'Criar e salvar preço' : 'Salvar preço'}
                </button>
              </div>
            )}
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

function ConfiguracaoVendasModal({
  form,
  saving,
  error,
  onChange,
  onToggleCampanha,
  onClose,
  onSubmit,
}: {
  form: ConfiguracaoVendasForm
  saving: boolean
  error: string
  onChange: (field: keyof Omit<ConfiguracaoVendasForm, 'exibirCampanhaPromocional'>, value: string) => void
  onToggleCampanha: (checked: boolean) => void
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
          <h2 className={styles.modalTitle}>Configuração de vendas</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form className={styles.modalForm} onSubmit={onSubmit}>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Divisão máxima no cartão</span>
            <input
              className={styles.modalInput}
              value={form.maxCartao}
              onChange={e => onChange('maxCartao', e.target.value)}
              inputMode="numeric"
              placeholder="Ex: 12"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Divisão máxima no boleto</span>
            <input
              className={styles.modalInput}
              value={form.maxBoleto}
              onChange={e => onChange('maxBoleto', e.target.value)}
              inputMode="numeric"
              placeholder="Ex: 6"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Divisão máxima no PIX</span>
            <input
              className={styles.modalInput}
              value={form.maxPix}
              onChange={e => onChange('maxPix', e.target.value)}
              inputMode="numeric"
              placeholder="Ex: 1"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Divisão máxima no carnê</span>
            <input
              className={styles.modalInput}
              value={form.maxCarne}
              onChange={e => onChange('maxCarne', e.target.value)}
              inputMode="numeric"
              placeholder="Ex: 12"
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Timer dos meios de pagamento (segundos)</span>
            <input
              className={styles.modalInput}
              value={form.tempoApresentacaoSegundos}
              onChange={e => onChange('tempoApresentacaoSegundos', e.target.value)}
              inputMode="numeric"
              placeholder="Ex: 5"
              disabled={saving}
            />
            <span className={styles.modalFieldHint}>Controla em quantos segundos as formas de pagamento aparecem no modo apresentação.</span>
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Oferta válida por quantos minutos</span>
            <input
              className={styles.modalInput}
              value={form.ofertaValidaMinutos}
              onChange={e => onChange('ofertaValidaMinutos', e.target.value)}
              inputMode="numeric"
              placeholder="Ex: 15"
              disabled={saving}
            />
            <span className={styles.modalFieldHint}>Essa é a contagem regressiva mostrada para o cliente no modo apresentação.</span>
          </label>

          <label className={styles.switchField}>
            <div className={styles.switchText}>
              <span className={styles.modalLabel}>Exibir campanha promocional antes do preço final</span>
              <span className={styles.modalFieldHint}>Mostra um bloco promocional antes das condições finais da proposta.</span>
            </div>
            <button
              type="button"
              className={`${styles.switchButton} ${form.exibirCampanhaPromocional ? styles.switchButtonActive : ''}`}
              onClick={() => onToggleCampanha(!form.exibirCampanhaPromocional)}
              disabled={saving}
              aria-pressed={form.exibirCampanhaPromocional}
            >
              <span className={styles.switchThumb} />
            </button>
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

function ApresentacaoVendaModal({
  venda,
  precos,
  taxaMaquinaPercent,
  configVendas,
  onClose,
}: {
  venda: VendaCard
  precos: EmpresaPreco[]
  taxaMaquinaPercent: number
  configVendas: EmpresaPrecificacaoConfig | null
  onClose: () => void
}) {
  const backdropDismiss = useBackdropDismiss(onClose)
  const [itensApresentacao, setItensApresentacao] = useState(venda.itens)
  const subtotal = calculateSubtotal(itensApresentacao)

  type FormaPagamento = 'cartao' | 'boleto' | 'pix' | 'carne'

  const [precoAvista, setPrecoAvista] = useState(formatCurrencyInput(subtotal))
  const [entradaApresentacao, setEntradaApresentacao] = useState(formatCurrencyInput(0))
  const [meiosLiberadosEm, setMeiosLiberadosEm] = useState(configVendas?.vendas_tempo_apresentacao_segundos ?? 0)
  const [ofertaExpiraEm, setOfertaExpiraEm] = useState((configVendas?.vendas_oferta_valida_minutos ?? 15) * 60)
  const formasDisponiveis = [
    {
      id: 'cartao' as const,
      label: 'Cartão',
      maxParcelas: Math.max(0, configVendas?.vendas_max_cartao ?? 12),
      taxaPercent: taxaMaquinaPercent,
      resumoUnico: 'Parcelamento no cartão',
    },
    {
      id: 'boleto' as const,
      label: 'Boleto',
      maxParcelas: Math.max(0, configVendas?.vendas_max_boleto ?? 1),
      taxaPercent: 0,
      resumoUnico: 'Boleto bancário',
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
      label: 'Carnê',
      maxParcelas: Math.max(0, configVendas?.vendas_max_carne ?? 1),
      taxaPercent: 0,
      resumoUnico: 'Parcelamento no carnê',
    },
  ].filter(item => item.maxParcelas > 0)
  const formaInicial = formasDisponiveis[0]?.id ?? 'cartao'
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(formaInicial)
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState('1')

  useEffect(() => {
    if (meiosLiberadosEm <= 0) return undefined

    const timer = window.setInterval(() => {
      setMeiosLiberadosEm(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [meiosLiberadosEm])

  useEffect(() => {
    if (ofertaExpiraEm <= 0) return undefined

    const timer = window.setInterval(() => {
      setOfertaExpiraEm(prev => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [ofertaExpiraEm])

  useEffect(() => {
    if (!formasDisponiveis.some(item => item.id === formaPagamento)) {
      setFormaPagamento(formasDisponiveis[0]?.id ?? 'cartao')
    }
  }, [formaPagamento, formasDisponiveis])

  const precoAvistaCalculado = parsePreco(precoAvista)
  const baseApresentacao = precoAvistaCalculado > 0 ? precoAvistaCalculado : subtotal
  const entradaAplicada = sanitizeEntrada(baseApresentacao, parsePreco(entradaApresentacao))
  const formaAtual = formasDisponiveis.find(item => item.id === formaPagamento) ?? {
    id: 'cartao' as const,
    label: 'Cartão',
    maxParcelas: 1,
    taxaPercent: taxaMaquinaPercent,
    resumoUnico: 'Parcelamento no cartão',
  }

  useEffect(() => {
    const parcelasClamped = Math.min(
      parsePositiveInteger(parcelasSelecionadas, 1, 1),
      Math.max(1, formaAtual.maxParcelas),
    )

    if (String(parcelasClamped) !== parcelasSelecionadas) {
      setParcelasSelecionadas(String(parcelasClamped))
    }
  }, [formaAtual.maxParcelas, parcelasSelecionadas])

  const qtdParcelas = Math.min(
    parsePositiveInteger(parcelasSelecionadas, 1, 1),
    Math.max(1, formaAtual.maxParcelas),
  )
  const resumo = buildFormaPagamento(baseApresentacao, qtdParcelas, formaAtual.taxaPercent, entradaAplicada)
  const parcelasApresentacao = buildParcelas(baseApresentacao, formaAtual.maxParcelas, formaAtual.taxaPercent, entradaAplicada)
  const meiosPagamentoLiberados = meiosLiberadosEm <= 0
  const opcoesComplementares = precos
    .filter(item => !itensApresentacao.some(vendaItem => vendaItem.empresa_preco_id === item.id))
    .sort((a, b) => b.preco - a.preco)
    .slice(0, 3)

  const handleAdicionarComplementar = (item: EmpresaPreco) => {
    setItensApresentacao(prev => ([
      ...prev,
      {
        id: `apresentacao-${item.id}`,
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
      return formatCurrencyInput(proximoValor)
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
            <p className={styles.presentationEyebrow}>
              {ofertaExpiraEm > 0 ? `Oferta válida por ${formatCountdown(ofertaExpiraEm)}` : 'Oferta expirada'}
            </p>
            <h2 className={styles.presentationTitle}>{venda.cliente_nome}</h2>
          </div>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.presentationBody}>
          <div className={styles.presentationCountdownRow}>
            <div className={styles.presentationCountdownCard}>
              <span>Subtotal da proposta</span>
              <strong>{formatCurrency(subtotal)}</strong>
              <small>{itensApresentacao.length} item(ns) em apresentação</small>
            </div>
            <div className={styles.presentationCountdownCard}>
              <span>Meios de pagamento</span>
              <strong>{meiosPagamentoLiberados ? 'Liberados' : formatCountdown(meiosLiberadosEm)}</strong>
              <small>{meiosPagamentoLiberados ? 'Prontos para apresentar ao cliente' : 'Aguardando timer configurado'}</small>
            </div>
          </div>

          <div className={styles.presentationControls}>
            <div className={styles.presentationSelectorBlock}>
              <span className={styles.modalLabel}>Preço à vista</span>
              <div className={styles.presentationPriceCard}>
                <input
                  className={styles.presentationPriceInput}
                  value={precoAvista}
                  onChange={e => setPrecoAvista(formatCurrencyTypingInput(e.target.value))}
                  inputMode="decimal"
                  placeholder="Ex: R$ 3.500,00"
                />
              </div>
            </div>

            <div className={styles.presentationSelectorBlock}>
              <span className={styles.modalLabel}>Entrada</span>
              <div className={styles.presentationPriceCard}>
                <input
                  className={styles.presentationPriceInput}
                  value={entradaApresentacao}
                  onChange={e => setEntradaApresentacao(formatCurrencyTypingInput(e.target.value))}
                  inputMode="decimal"
                  placeholder="Ex: R$ 1.000,00"
                />
              </div>
            </div>

            {!meiosPagamentoLiberados ? (
              <div className={styles.presentationDelayBlock}>
                <strong>Meios de pagamento ainda não liberados</strong>
                <span>As opções serão exibidas em {formatCountdown(meiosLiberadosEm)}.</span>
              </div>
            ) : (
              <>
                <div className={styles.presentationSelectorBlock}>
                  <span className={styles.modalLabel}>Forma de pagamento</span>
                  <div className={styles.presentationSelectorGrid}>
                    {formasDisponiveis.map(item => {
                      const previewParcelas = Math.max(1, item.maxParcelas)
                      const previewResumo = buildFormaPagamento(baseApresentacao, previewParcelas, item.taxaPercent, entradaAplicada)

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
                              ? `Até ${previewParcelas}x disponível`
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

                {configVendas?.vendas_exibir_campanha_promocional && (
                  <div className={styles.presentationCampaign}>
                    <span>Campanha promocional ativa</span>
                    <strong>Condição especial liberada para fechar a proposta agora.</strong>
                    <small>Use esse momento para reforçar urgência, valor percebido e a validade da oferta.</small>
                  </div>
                )}
              </>
            )}
          </div>

          {meiosPagamentoLiberados && (
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
                <span>{formaAtual.maxParcelas > 1 ? `${resumo.parcelas}x em ${formaAtual.label}` : formaAtual.label}</span>
                <strong>{formatCurrency(formaAtual.maxParcelas > 1 ? resumo.valorParcela : resumo.totalCobrado)}</strong>
              </div>
            </div>
          )}

          {opcoesComplementares.length > 0 && (
            <div className={styles.presentationBlock}>
              <h3 className={styles.sectionTitle}>Opções complementares</h3>
              <div className={styles.anchorGrid}>
                {opcoesComplementares.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.anchorCard}
                    onClick={() => handleAdicionarComplementar(item)}
                  >
                    <span>{item.nome_produto}</span>
                    <strong>{formatCurrency(item.preco)}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function PrecificacaoPage({ empresa, onTrocarEmpresa, onVoltar }: PrecificacaoPageProps) {
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [view, setView] = useSessionStorageState<ViewMode>(
    `precificacao:${empresa.id}:view`,
    'vendas',
    isViewMode,
  )
  const [showCreatePrecoModal, setShowCreatePrecoModal] = useState(false)
  const [showPrecoModal, setShowPrecoModal] = useState(false)
  const [showPrecoCalculadoModal, setShowPrecoCalculadoModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState('')
  const [importando, setImportando] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showVendasConfigModal, setShowVendasConfigModal] = useState(false)
  const [showVendaModal, setShowVendaModal] = useState(false)
  const [precos, setPrecos] = useState<EmpresaPreco[]>([])
  const [savingPreco, setSavingPreco] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingVenda, setSavingVenda] = useState(false)
  const [loadingWorkspace, setLoadingWorkspace] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [precoEditando, setPrecoEditando] = useState<EmpresaPreco | null>(null)
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
  })
  const [configVendasForm, setConfigVendasForm] = useState<ConfiguracaoVendasForm>({
    maxCartao: '12',
    maxBoleto: '1',
    maxPix: '1',
    maxCarne: '1',
    tempoApresentacaoSegundos: '0',
    ofertaValidaMinutos: '15',
    exibirCampanhaPromocional: false,
  })
  const configPadraoMemo = useMemo(() => configToForm(configGeral), [configGeral])
  const configVendasPadraoMemo = useMemo(() => configToVendasForm(configGeral), [configGeral])
  const taxaMaquinaPercent = configGeral?.taxa_maquina_percent ?? parsePreco(configForm.taxaMaquinaPercent)
  const maxParcelasCartaoPadrao = configGeral?.vendas_max_cartao ?? parsePositiveInteger(configVendasForm.maxCartao, 12, 1)

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
          setConfigVendasForm(configToVendasForm(configData))
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

  const ensureEmpresaAtiva = useCallback(async () => {
    if (!empresa.id) {
      setError('Selecione uma empresa antes de salvar os precos.')
      onTrocarEmpresa()
      return false
    }

    const { data, error: empresaError } = await supabase
      .from('empresas')
      .select('id')
      .eq('id', empresa.id)
      .eq('ativo', true)
      .maybeSingle()

    if (empresaError) {
      setError(empresaError.message ?? 'Nao foi possivel validar a empresa selecionada.')
      return false
    }

    if (!data) {
      setError('A empresa selecionada nao esta mais disponivel. Escolha outra empresa para continuar.')
      onTrocarEmpresa()
      return false
    }

    return true
  }, [empresa.id, onTrocarEmpresa])


  const handleAddPreco = async (item: PrecoFormPayload) => {
    setSavingPreco(true)
    setError('')
    setFeedback('')

    const empresaValida = await ensureEmpresaAtiva()
    if (!empresaValida) {
      setSavingPreco(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('empresa_precos')
      .insert({
        empresa_id: empresa.id,
        nome_produto: item.nome,
        categoria: item.categoria,
        preco: item.preco,
        margem_percent: item.margem,
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
    setPrecoEditando(null)
    setShowCreatePrecoModal(false)
    setShowPrecoModal(false)
    setSavingPreco(false)
    setView('lista')
  }

  const handleImportarLista = async () => {
    setImportError('')

    if (!importFile) {
      setImportError('Selecione um arquivo .xlsx.')
      return
    }

    let rows: unknown[][]
    try {
      const buffer = await importFile.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
    } catch {
      setImportError('Não foi possível ler o arquivo. Verifique se é um .xlsx válido.')
      return
    }

    // ignora primeira linha (cabeçalho)
    const dataRows = rows.slice(1).filter(r => Array.isArray(r) && r.length >= 3)

    if (dataRows.length === 0) {
      setImportError('Nenhuma linha encontrada após o cabeçalho.')
      return
    }

    const itens: { nome: string; margem: number | null; preco: number }[] = []
    for (let i = 0; i < dataRows.length; i++) {
      const [nomeRaw, margemRaw, precoRaw] = dataRows[i] as unknown[]
      const nome = String(nomeRaw ?? '').trim()
      if (!nome) {
        setImportError(`Linha ${i + 2}: nome não pode ser vazio.`)
        return
      }
      const preco = typeof precoRaw === 'number' ? precoRaw : parsePreco(String(precoRaw ?? ''))
      if (preco <= 0) {
        setImportError(`Linha ${i + 2}: preço inválido "${precoRaw}".`)
        return
      }
      const margem = typeof margemRaw === 'number'
        ? margemRaw
        : parseMargem(String(margemRaw ?? ''))
      itens.push({ nome, margem, preco })
    }

    const empresaValida = await ensureEmpresaAtiva()
    if (!empresaValida) return

    setImportando(true)

    const { data: inseridos, error: insertError } = await supabase
      .from('empresa_precos')
      .insert(itens.map(it => ({
        empresa_id: empresa.id,
        nome_produto: it.nome,
        preco: it.preco,
        margem_percent: it.margem,
      })))
      .select('*')

    setImportando(false)

    if (insertError) {
      setImportError(insertError.message ?? 'Erro ao importar.')
      return
    }

    setPrecos(prev =>
      [...prev, ...(inseridos ?? [])].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))
    )
    setFeedback(`${inseridos?.length ?? 0} ite${(inseridos?.length ?? 0) === 1 ? 'm importado' : 'ns importados'} com sucesso.`)
    setShowImportModal(false)
    setImportFile(null)
    setImportError('')
    setView('lista')
  }

  const handleAddPrecoCalculado = async (item: PrecoFormPayload, calculo: CalculadoraPersistida) => {
    setSavingPreco(true)
    setError('')
    setFeedback('')

    const empresaValida = await ensureEmpresaAtiva()
    if (!empresaValida) {
      setSavingPreco(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('empresa_precos')
      .insert({
        empresa_id: empresa.id,
        nome_produto: item.nome,
        categoria: item.categoria,
        preco: item.preco,
        margem_percent: item.margem,
        precificacao_calculo: calculo,
      })
      .select('*')
      .single()

    if (insertError) {
      setError(insertError.message ?? 'Não foi possível salvar o preço calculado.')
      setSavingPreco(false)
      return
    }

    setPrecos(prev =>
      [...prev, data].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))
    )
    setFeedback('Preço calculado salvo com sucesso.')
    setShowCreatePrecoModal(false)
    setShowPrecoCalculadoModal(false)
    setSavingPreco(false)
    setView('lista')
  }

  const handleEditPreco = async (itemId: string, item: PrecoFormPayload) => {
    setSavingPreco(true)
    setError('')
    setFeedback('')

    const empresaValida = await ensureEmpresaAtiva()
    if (!empresaValida) {
      setSavingPreco(false)
      return
    }

    const { data, error: updateError } = await supabase
      .from('empresa_precos')
      .update({
        nome_produto: item.nome,
        categoria: item.categoria,
        preco: item.preco,
        margem_percent: item.margem,
      })
      .eq('id', itemId)
      .eq('empresa_id', empresa.id)
      .select('*')
      .single()

    if (updateError) {
      setError(updateError.message ?? 'Não foi possível atualizar o produto ou serviço.')
      setSavingPreco(false)
      return
    }

    setPrecos(prev =>
      prev.map(current => (current.id === itemId ? data : current))
        .sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))
    )
    setItemCalculadora(prev => (prev?.id === itemId ? data : prev))
    setPrecoEditando(null)
    setShowPrecoModal(false)
    setFeedback('Produto ou serviço atualizado com sucesso.')
    setSavingPreco(false)
  }

  const handleDeletePreco = async (itemId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este preço?')) return
    setError('')
    setFeedback('')

    const { error: deleteError } = await supabase
      .from('empresa_precos')
      .delete()
      .eq('id', itemId)
      .eq('empresa_id', empresa.id)

    if (deleteError) {
      setError(deleteError.message ?? 'Não foi possível excluir o preço.')
      return
    }

    setPrecos(prev => prev.filter(p => p.id !== itemId))
    setFeedback('Preço excluído com sucesso.')
  }

  const handlePersistCalculo = async (itemId: string, payload: CalculadoraPersistida, preco: number) => {
    setSavingPreco(true)
    setError('')

    const empresaValida = await ensureEmpresaAtiva()
    if (!empresaValida) {
      setSavingPreco(false)
      return
    }

    const margem = calcularPrecificacao(preco, payload).margem

    const { data, error: updateError } = await supabase
      .from('empresa_precos')
      .update({
        preco,
        margem_percent: margem,
        precificacao_calculo: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('empresa_id', empresa.id)
      .select('*')
      .single()

    if (updateError) {
      setError(updateError.message ?? 'Não foi possível salvar a calculadora do produto.')
      setSavingPreco(false)
      return
    }

    setPrecos(prev =>
      prev.map(item => (item.id === itemId ? data : item))
        .sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))
    )
    setItemCalculadora(data)
    setSavingPreco(false)
  }

  const handleConfigChange = (field: keyof ConfiguracaoGeralForm, value: string) => {
    setConfigForm(prev => ({ ...prev, [field]: value }))
  }

  const handleConfigVendasChange = (
    field: keyof Omit<ConfiguracaoVendasForm, 'exibirCampanhaPromocional'>,
    value: string,
  ) => {
    setConfigVendasForm(prev => ({ ...prev, [field]: value }))
  }

  const handleConfigVendasCampanha = (checked: boolean) => {
    setConfigVendasForm(prev => ({ ...prev, exibirCampanhaPromocional: checked }))
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
    setConfigVendasForm(configToVendasForm(data))
    setFeedback('Configuração geral salva com sucesso.')
    setShowConfigModal(false)
    setSavingConfig(false)
  }

  const handleSaveConfigVendas = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingConfig(true)
    setError('')
    setFeedback('')

    const maxCartao = parsePositiveInteger(configVendasForm.maxCartao, 12, 0)
    const maxBoleto = parsePositiveInteger(configVendasForm.maxBoleto, 1, 0)
    const maxPix = parsePositiveInteger(configVendasForm.maxPix, 1, 0)
    const maxCarne = parsePositiveInteger(configVendasForm.maxCarne, 1, 0)

    if (maxCartao + maxBoleto + maxPix + maxCarne <= 0) {
      setError('Ative ao menos um meio de pagamento na configuração de vendas.')
      setSavingConfig(false)
      return
    }

    const payload = {
      empresa_id: empresa.id,
      vendas_max_cartao: maxCartao,
      vendas_max_boleto: maxBoleto,
      vendas_max_pix: maxPix,
      vendas_max_carne: maxCarne,
      vendas_tempo_apresentacao_segundos: parsePositiveInteger(configVendasForm.tempoApresentacaoSegundos, 0, 0),
      vendas_oferta_valida_minutos: parsePositiveInteger(configVendasForm.ofertaValidaMinutos, 15, 1),
      vendas_exibir_campanha_promocional: configVendasForm.exibirCampanhaPromocional,
    }

    const { data, error: saveError } = await supabase
      .from('empresa_precificacao_config')
      .upsert(payload)
      .select('*')
      .single()

    if (saveError) {
      setError(saveError.message ?? 'Não foi possível salvar a configuração de vendas.')
      setSavingConfig(false)
      return
    }

    setConfigGeral(data)
    setConfigForm(configToForm(data))
    setConfigVendasForm(configToVendasForm(data))
    setFeedback('Configuração de vendas salva com sucesso.')
    setShowVendasConfigModal(false)
    setSavingConfig(false)
  }

  const handleSaveVenda = async (payload: {
    id?: string
    clienteNome: string
    observacoes: string
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
          entrada_valor: 0,
          max_parcelas: maxParcelasCartaoPadrao,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vendaId)

      if (updateError) {
        setError(updateError.message ?? 'Não foi possível atualizar a apresentação.')
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
          entrada_valor: 0,
          max_parcelas: maxParcelasCartaoPadrao,
        })
        .select('*')
        .single()

      if (insertError || !data) {
        setError(insertError?.message ?? 'Não foi possível criar a apresentação.')
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
      setError(itensInsertError.message ?? 'Não foi possível salvar os itens da apresentação.')
      setSavingVenda(false)
      return
    }

    setFeedback(payload.id ? 'Venda atualizada com sucesso.' : 'Venda criada com sucesso.')
    setShowVendaModal(false)
    setVendaEditando(null)
    setSavingVenda(false)
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
            {canManage && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setImportFile(null)
                  setImportError('')
                  setShowImportModal(true)
                }}
              >
                <IconUpload /> Importar lista
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setError('')
                  setFeedback('')
                  setConfigForm(configPadraoMemo)
                  setShowConfigModal(true)
                }}
              >
                Configuração geral
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setError('')
                  setFeedback('')
                  setConfigVendasForm(configVendasPadraoMemo)
                  setShowVendasConfigModal(true)
                }}
              >
                Configuração de vendas
              </button>
            )}
            {canManage && view === 'lista' && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setError('')
                  setFeedback('')
                  setPrecoEditando(null)
                  setShowCreatePrecoModal(true)
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
                Clique em <strong>Criar preços</strong> para adicionar nome, categoria e preço na sua lista.
              </p>
            </div>
          ) : (
            <div className={styles.priceTable}>
              <div className={styles.priceTableHead}>
                <span>Produto / servico</span>
                <span>Margem</span>
                <span>Ação</span>
                <span>Preço</span>
              </div>
              <div className={styles.priceTableBody}>
                {precos.map(item => {
                  const margemPercentual = getItemMargemPercent(item, configPadraoMemo)
                  const margemSaudavel = isMargemSaudavel(margemPercentual)

                  return (
                    <div key={item.id} className={styles.priceRow}>
                      <div className={styles.priceNameWrap}>
                      <span className={styles.priceName}>{item.nome_produto}</span>
                      {hasGestaaCalculatedPrice(item) && (
                        <span className={styles.priceCalculatedBadge}>Preço ajustado pela calculadora da Gestaa</span>
                      )}
                      <span className={styles.priceCategory}>{getCategoriaLabel(item.categoria)}</span>
                    </div>
                      <div
                        className={`${styles.priceMarginValue} ${
                          margemSaudavel
                            ? styles.priceMarginGood
                            : margemPercentual == null
                              ? styles.priceMarginEmpty
                              : styles.priceMarginBad
                        }`}
                      >
                        {margemPercentual == null || margemPercentual === 0 ? 'Sem precificação' : formatPercent(margemPercentual)}
                      </div>
                      <div className={styles.priceActions}>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className={styles.priceEditButton}
                            onClick={() => {
                              setError('')
                              setFeedback('')
                              setPrecoEditando(item)
                              setShowPrecoModal(true)
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={styles.priceDeleteButton}
                            onClick={() => handleDeletePreco(item.id)}
                          >
                            Excluir
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={`${styles.calcButton} ${margemSaudavel ? styles.calcButtonGood : styles.calcButtonBad}`}
                        onClick={() => setItemCalculadora(item)}
                      >
                        {margemSaudavel ? 'Preco com margem correta' : 'Rever precificacao'}
                      </button>
                      </div>
                      <strong className={styles.priceValue}>{formatCurrency(item.preco)}</strong>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        ) : (
          <div className={styles.blankCanvas}>
            <p className={styles.blankTitle}>Pronto para iniciar uma venda.</p>
            <p className={styles.blankText}>
              Clique em <strong>Nova venda</strong> para comecar.
            </p>
          </div>
        )}
      </div>

      {showPrecoModal && (
        <PrecoModal
          initialItem={precoEditando}
          configPadrao={configPadraoMemo}
          onClose={() => {
            setShowPrecoModal(false)
            setPrecoEditando(null)
          }}
          onSubmit={precoEditando
            ? (item => handleEditPreco(precoEditando.id, item))
            : handleAddPreco}
          saving={savingPreco}
          error={error}
        />
      )}

      {showCreatePrecoModal && (
        <EscolhaCriacaoPrecoModal
          onClose={() => setShowCreatePrecoModal(false)}
          onSelectSimple={() => {
            setShowCreatePrecoModal(false)
            setPrecoEditando(null)
            setShowPrecoModal(true)
          }}
          onSelectCalculated={() => {
            setShowCreatePrecoModal(false)
            setShowPrecoCalculadoModal(true)
          }}
        />
      )}

      {showPrecoCalculadoModal && (
        <CalculadoraPrecificacaoModal
          configPadrao={configPadraoMemo}
          canManage={canManage}
          savingPreco={savingPreco}
          error={error}
          onCreatePrecoCalculado={handleAddPrecoCalculado}
          onClose={() => setShowPrecoCalculadoModal(false)}
        />
      )}

      {itemCalculadora && (
        <CalculadoraPrecificacaoModal
          item={itemCalculadora}
          configPadrao={configPadraoMemo}
          canManage={canManage}
          savingPreco={savingPreco}
          error={error}
          onPersistCalculo={handlePersistCalculo}
          onClose={() => setItemCalculadora(null)}
        />
      )}

      {showImportModal && (
        <div className={styles.modalOverlay} onClick={() => !importando && setShowImportModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Importar lista</h2>
              <button className={styles.modalClose} onClick={() => setShowImportModal(false)} disabled={importando}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalFieldHint} style={{ marginBottom: 12 }}>
                Selecione um arquivo <strong>.xlsx</strong>. A primeira linha (cabeçalho) será ignorada.<br />
                As colunas devem estar na ordem: <strong>nome, margem, preco</strong>.
              </p>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className={styles.modalInput}
                disabled={importando}
                onChange={e => {
                  setImportFile(e.target.files?.[0] ?? null)
                  setImportError('')
                }}
              />
              {importError && <p className={styles.formError}>{importError}</p>}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowImportModal(false)} disabled={importando}>
                Cancelar
              </button>
              <button type="button" className={styles.btnPrimary} onClick={handleImportarLista} disabled={importando || !importFile}>
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
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

      {showVendasConfigModal && (
        <ConfiguracaoVendasModal
          form={configVendasForm}
          saving={savingConfig}
          error={error}
          onChange={handleConfigVendasChange}
          onToggleCampanha={handleConfigVendasCampanha}
          onClose={() => setShowVendasConfigModal(false)}
          onSubmit={handleSaveConfigVendas}
        />
      )}

      {showVendaModal && (
        <PrecificacaoVendaModal
          precos={precos}
          taxaMaquinaPercent={taxaMaquinaPercent}
          configVendas={configGeral}
          maxParcelasCartaoPadrao={maxParcelasCartaoPadrao}
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
          configVendas={configGeral}
          onClose={() => setVendaApresentacao(null)}
        />
      )}
    </div>
  )
}
