import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './PrecificacaoPage.module.css'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'
import type { Empresa, EmpresaPreco, EmpresaPrecificacaoConfig } from '../lib/types'

interface PrecificacaoPageProps {
  empresa: Empresa
  onTrocarEmpresa: () => void
  onVoltar: () => void
}

type ViewMode = 'home' | 'lista'

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
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41 13.41 20.6a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
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

export default function PrecificacaoPage({ empresa, onTrocarEmpresa, onVoltar }: PrecificacaoPageProps) {
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [view, setView] = useState<ViewMode>('home')
  const [showPrecoModal, setShowPrecoModal] = useState(false)
  const [precos, setPrecos] = useState<EmpresaPreco[]>([])
  const [savingPreco, setSavingPreco] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [loadingPrecos, setLoadingPrecos] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [itemCalculadora, setItemCalculadora] = useState<EmpresaPreco | null>(null)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [configGeral, setConfigGeral] = useState<EmpresaPrecificacaoConfig | null>(null)
  const [configForm, setConfigForm] = useState<ConfiguracaoGeralForm>({
    royaltiesPercent: '',
    custoProfissionaisPercent: '',
    impostosPercent: '',
    comissoesPercent: '',
    taxaMaquinaPercent: '',
  })

  useEffect(() => {
    let active = true

    const validarAcesso = async () => {
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

      if (active) {
        setLoadingPrecos(true)
      }

      const { data: precosData, error: precosError } = await supabase
        .from('empresa_precos')
        .select('*')
        .eq('empresa_id', empresa.id)
        .eq('ativo', true)
        .order('nome_produto', { ascending: true })

      if (!precosError && active) {
        setPrecos(precosData ?? [])
      }

      if (precosError && active) {
        setError(precosError.message ?? 'Não foi possível carregar a lista de preços.')
      }

      const { data: configData, error: configError } = await supabase
        .from('empresa_precificacao_config')
        .select('*')
        .eq('empresa_id', empresa.id)
        .maybeSingle()

      if (!configError && active) {
        setConfigGeral(configData)
        setConfigForm(configToForm(configData))
      }

      if (configError && active) {
        setError(configError.message ?? 'Não foi possível carregar a configuração geral da precificação.')
      }

      if (active) {
        setLoadingPrecos(false)
        setLoading(false)
      }
    }

    void validarAcesso()

    return () => {
      active = false
    }
  }, [empresa.id, onTrocarEmpresa])

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
          {canManage && view === 'home' && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                setError('')
                setFeedback('')
                setView('lista')
              }}
            >
              <IconPlus /> Minha lista de preço
            </button>
          )}
        </div>
      </div>

      {view === 'home' ? (
        <div className={styles.emptyState}>
          <IconTag />
          <p className={styles.emptyTitle}>Minha lista de preço</p>
          <p className={styles.emptyText}>
            Comece criando seus preços manualmente ou, depois, importe uma lista pronta.
          </p>
          {canManage ? (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                setError('')
                setFeedback('')
                setView('lista')
              }}
            >
              <IconPlus /> Abrir minha lista de preço
            </button>
          ) : (
            <p className={styles.emptyHint}>
              Você pode visualizar a empresa, mas a gestão da lista de preços ficará disponível para o titular.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.workspace}>
          <div className={styles.workspaceHeader}>
            <div>
              <p className={styles.workspaceEyebrow}>Precificação</p>
              <h2 className={styles.workspaceTitle}>Minha lista de preço</h2>
            </div>
            <div className={styles.workspaceActions}>
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
              {canManage && (
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
            </div>
          </div>

          {feedback && <p className={styles.feedbackSuccess}>{feedback}</p>}
          {error && <p className={styles.feedbackError}>{error}</p>}

          {loadingPrecos ? (
            <div className={styles.blankCanvas}>
              <p className={styles.blankTitle}>Carregando preços...</p>
            </div>
          ) : precos.length === 0 ? (
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
          )}
        </div>
      )}

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
    </div>
  )
}
