import { useEffect, useMemo, useState } from 'react'
import styles from './AnaliseDrePage.module.css'
import { supabase } from '../lib/supabase'
import type { DreClassificacao, DreLancamento, Empresa, Database } from '../lib/types'
import { DreAssistentePanel } from '../components/dre-assistente/DreAssistentePanel'
import { ExtratoUpload } from '../components/extrato-upload/ExtratoUpload'

type DreGrupo = Database['public']['Tables']['dre_grupos']['Row']

type Step = 1 | 2 | 3 | 4 | 5 | 6

type FormState = {
  tipo:              '' | 'receita' | 'despesa'  // Step 1: entrada ou saída
  data:              string                        // Step 2: data do lançamento
  descricao:         string                        // Step 3: descrição
  valor:             string                        // Step 4: valor
  classificacaoNome: string                        // Step 5: categoria específica
  grupo:             string                        // Step 6: grupo livre
}

const today = () => new Date().toISOString().split('T')[0]

const INITIAL_FORM: FormState = {
  tipo: '', data: today(), descricao: '', valor: '', classificacaoNome: '', grupo: '',
}

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct   = (v: number) => `${v.toFixed(1)}%`

// ── Mapeamento oficial: classificação → grupo (plano de contas) ───────────────
const CLASSIFICACAO_TO_GRUPO: Record<string, string> = {
  // Receitas Operacionais
  'Receita Dinheiro': 'Receitas Operacionais',
  'Receita Cartão': 'Receitas Operacionais',
  'Receita Financeiras': 'Receitas Operacionais',
  'Receita PIX / Transferências': 'Receitas Operacionais',
  'Receita Subadquirência (BT)': 'Receitas Operacionais',
  // Receitas Financeiras
  'Rendimento de Aplicação Financeira': 'Receitas Financeiras',
  'Descontos Obtidos': 'Receitas Financeiras',
  // Deduções de Receita
  'Vendas Canceladas / Devoluções': 'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas': 'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Antecipação': 'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Padrão': 'Deduções de Receita',
  // Impostos sobre Faturamento
  'Impostos sobre Receitas - Presumido e Simples Nacional': 'Impostos sobre Faturamento',
  // Despesas Operacionais
  'OP Gratificações': 'Despesas Operacionais',
  'Custo de Materiais e Insumos': 'Despesas Operacionais',
  'Serviços Terceiros PF (dentistas)': 'Despesas Operacionais',
  'Serviços Técnicos para Laboratórios': 'Despesas Operacionais',
  'Royalties e Assistência Técnica': 'Despesas Operacionais',
  'Fundo Nacional de Marketing': 'Despesas Operacionais',
  // Despesas com Pessoal
  'Pró-labore': 'Despesas com Pessoal',
  'Salários e Ordenados': 'Despesas com Pessoal',
  '13° Salário': 'Despesas com Pessoal',
  'Rescisões': 'Despesas com Pessoal',
  'INSS': 'Despesas com Pessoal',
  'FGTS': 'Despesas com Pessoal',
  'Outras Despesas Com Funcionários': 'Despesas com Pessoal',
  'Vale Transporte': 'Despesas com Pessoal',
  'Vale Refeição': 'Despesas com Pessoal',
  'Combustível': 'Despesas com Pessoal',
  // Despesas Administrativas
  'Adiantamento a Fornecedor': 'Despesas Administrativas',
  'Energia Elétrica': 'Despesas Administrativas',
  'Água e Esgoto': 'Despesas Administrativas',
  'Aluguel': 'Despesas Administrativas',
  'Manutenção e Conservação Predial': 'Despesas Administrativas',
  'Telefonia': 'Despesas Administrativas',
  'Uniformes': 'Despesas Administrativas',
  'Manutenção e Reparos': 'Despesas Administrativas',
  'Seguros': 'Despesas Administrativas',
  'Uber e Táxi': 'Despesas Administrativas',
  'Copa e Cozinha': 'Despesas Administrativas',
  'Cartórios': 'Despesas Administrativas',
  'Viagens e Estadias': 'Despesas Administrativas',
  'Material de Escritório': 'Despesas Administrativas',
  'Estacionamento': 'Despesas Administrativas',
  'Material de Limpeza': 'Despesas Administrativas',
  'Bens de Pequeno Valor': 'Despesas Administrativas',
  'Custas Processuais': 'Despesas Administrativas',
  'Outras Despesas': 'Despesas Administrativas',
  'Consultoria': 'Despesas Administrativas',
  'Contabilidade': 'Despesas Administrativas',
  'Jurídico': 'Despesas Administrativas',
  'Limpeza': 'Despesas Administrativas',
  'Segurança e Vigilância': 'Despesas Administrativas',
  'Serviço de Motoboy': 'Despesas Administrativas',
  'IOF': 'Despesas Administrativas',
  'Taxas e Emolumentos': 'Despesas Administrativas',
  'Multa e Juros s/ Contas Pagas em Atraso': 'Despesas Administrativas',
  'Exames Ocupacionais': 'Despesas Administrativas',
  // Despesas Comerciais e Marketing
  'Refeições e Lanches': 'Despesas Comerciais e Marketing',
  'Outras Despesas com Vendas': 'Despesas Comerciais e Marketing',
  'Agência e Assessoria': 'Despesas Comerciais e Marketing',
  'Produção de Material': 'Despesas Comerciais e Marketing',
  'Marketing Digital': 'Despesas Comerciais e Marketing',
  'Feiras e Eventos': 'Despesas Comerciais e Marketing',
  // Despesas com TI
  'Internet': 'Despesas com TI',
  'Informática e Software': 'Despesas com TI',
  'Hospedagem de Dados': 'Despesas com TI',
  'Sistema de Gestão': 'Despesas com TI',
  // Despesas Financeiras
  'Despesas Bancárias': 'Despesas Financeiras',
  'Depreciação e Amortização': 'Despesas Financeiras',
  'Juros Passivos': 'Despesas Financeiras',
  'Financiamentos / Empréstimos': 'Despesas Financeiras',
  // Investimentos
  'Investimento - Máquinas e Equipamentos': 'Investimentos',
  'Investimento - Computadores e Periféricos': 'Investimentos',
  'Investimento - Móveis e Utensílios': 'Investimentos',
  'Investimento - Instalações de Terceiros': 'Investimentos',
  'Dividendos e Despesas dos Sócios': 'Investimentos',
}

// ── Helpers: soma por grupo exato (primary) + keywords (fallback) ─────────────

function somaGrupos(
  lancamentos: DreLancamento[],
  gruposAlvo: string[],
  keywordsFallback: string[] = [],
): number {
  const alvoLower = gruposAlvo.map(g => g.toLowerCase().trim())
  return lancamentos
    .filter(l => {
      if (l.tipo !== 'despesa') return false
      const g = (l.grupo ?? '').toLowerCase().trim()
      if (alvoLower.some(a => g === a)) return true
      if (keywordsFallback.length > 0) {
        const haystack = `${g} ${(l.classificacao ?? '').toLowerCase()}`
        return keywordsFallback.some(k => haystack.includes(k))
      }
      return false
    })
    .reduce((s, l) => s + Number(l.valor), 0)
}

function somaGruposReceita(
  lancamentos: DreLancamento[],
  gruposAlvo: string[],
): number {
  const alvoLower = gruposAlvo.map(g => g.toLowerCase().trim())
  return lancamentos
    .filter(l => {
      if (l.tipo !== 'receita') return false
      const g = (l.grupo ?? '').toLowerCase().trim()
      return alvoLower.some(a => g === a)
    })
    .reduce((s, l) => s + Number(l.valor), 0)
}

// ── KPI calculations (seguindo plano_de_contas_dre.md seções 1–15) ────────────

function calcularKpis(lancamentos: DreLancamento[], totalReceitas: number) {
  // ── Seção 2: Deduções de Receita ───────────────────────────────────────────
  const deducoes = somaGrupos(lancamentos, ['Deduções de Receita'], [
    'deduç', 'cancelamento', 'devolução', 'tarifa de cartão', 'tarifa de cartao',
  ])

  // ── Seção 3: Impostos sobre Faturamento (Simples, Presumido) ──────────────
  // Incidem sobre receita → deduzem da Receita Bruta, NÃO do resultado
  const impostosReceita = somaGrupos(lancamentos, ['Impostos sobre Faturamento'], [
    'imposto sobre receita', 'simples nacional', 'lucro presumido', 'issqn',
  ])

  // ── Receita Líquida ────────────────────────────────────────────────────────
  const receitaLiquida = totalReceitas - deducoes - impostosReceita

  // ── Seção 4: Despesas Operacionais (custos diretos de entrega) ─────────────
  const custosDir = somaGrupos(lancamentos, ['Despesas Operacionais'], [
    'custo de materiais', 'insumos', 'serviços terceiros pf', 'servicos terceiros pf',
    'serviços técnicos', 'royalties', 'fundo nacional de marketing',
    'op gratificações', 'op gratificacoes', 'cmv', 'frete de venda',
  ])

  // ── Seção 5: Margem de Contribuição ───────────────────────────────────────
  const margemContrib = receitaLiquida - custosDir

  // ── Seções 6–9: Despesas Operacionais Indiretas ────────────────────────────
  const despPessoal = somaGrupos(lancamentos, ['Despesas com Pessoal'], [
    'pró-labore', 'pro-labore', 'salário', 'salario', '13°', 'rescisão',
    'rescisao', 'inss', 'fgts', 'vale transporte', 'vale refeição', 'vale refeicao',
    'combustível', 'combustivel', 'pessoal',
  ])
  const despAdmin = somaGrupos(lancamentos, ['Despesas Administrativas'], [
    'adiantamento a fornecedor', 'energia elétrica', 'energia eletrica',
    'água', 'agua e esgoto', 'aluguel', 'manutenção predial', 'telefonia',
    'uniformes', 'seguros', 'uber', 'copa e cozinha', 'cartório', 'cartorio',
    'viagens', 'material de escritório', 'material de escritorio',
    'estacionamento', 'material de limpeza', 'bens de pequeno valor',
    'custas processuais', 'consultoria', 'contabilidade', 'jurídico', 'juridico',
    'limpeza', 'segurança', 'seguranca', 'motoboy', 'iof',
    'taxas e emolumentos', 'multa e juros', 'exames ocupacionais', 'administrativ',
  ])
  const despComercial = somaGrupos(lancamentos, ['Despesas Comerciais e Marketing'], [
    'refeições', 'refeicoes', 'agência', 'agencia', 'assessoria',
    'produção de material', 'marketing digital', 'feiras', 'eventos',
    'marketing', 'comercial', 'publicidade',
  ])
  const despTI = somaGrupos(lancamentos, ['Despesas com TI'], [
    'internet', 'informática', 'informatica', 'software', 'hospedagem de dados',
    'sistema de gestão', 'sistema de gestao',
  ])

  // ── Seção 10: EBITDA ───────────────────────────────────────────────────────
  const ebitda = margemContrib - despPessoal - despAdmin - despComercial - despTI

  // ── Seção 11: Receitas Financeiras (rendimentos, descontos obtidos) ────────
  const recFinanc = somaGruposReceita(lancamentos, ['Receitas Financeiras'])

  // ── Seção 12: Despesas Financeiras (D&A, juros, bancárias) ────────────────
  const despFinanc = somaGrupos(lancamentos, ['Despesas Financeiras'], [
    'despesas bancárias', 'despesas bancarias', 'juros passivos',
    'financiamentos', 'empréstimos', 'emprestimos',
    'depreciação', 'depreciacao', 'amortização', 'amortizacao',
  ])

  // ── Seção 13: EBIT ─────────────────────────────────────────────────────────
  const ebit = ebitda + recFinanc - despFinanc

  // ── Seção 14: Investimentos ────────────────────────────────────────────────
  const investimentos = somaGrupos(lancamentos, ['Investimentos'], [
    'investimento -', 'máquinas e equipamentos', 'maquinas e equipamentos',
    'computadores e periféricos', 'móveis e utensílios', 'moveis e utensilios',
    'instalações de terceiros', 'instalacoes de terceiros', 'dividendos',
  ])

  // ── Seção 15: NOPAT / Resultado Operacional ────────────────────────────────
  const nopat = ebit - investimentos

  const base = receitaLiquida > 0 ? receitaLiquida : (totalReceitas > 0 ? totalReceitas : 1)

  return {
    receitaOperacional: totalReceitas,
    receitaLiquida,
    margemContrib,
    ebitda,
    ebit,
    nopat,
    margemContribPct: (margemContrib / base) * 100,
    ebitdaPct:        (ebitda / base) * 100,
    ebitPct:          (ebit / base) * 100,
    nopatPct:         (nopat / base) * 100,
    semDados:         receitaLiquida === 0 && totalReceitas === 0,
  }
}

// ── Components ──

function StatCard({ title, value, tone = 'default' }: {
  title: string; value: string; tone?: 'default' | 'positive' | 'negative'
}) {
  return (
    <article className={`${styles.statCard} ${tone === 'positive' ? styles.positiveCard : ''} ${tone === 'negative' ? styles.negativeCard : ''}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

function KpiCard({ title, value, secondaryValue, hint, tone = 'default' }: {
  title: string
  value: string
  secondaryValue?: string
  hint: string
  tone?: 'default' | 'positive' | 'negative' | 'neutral'
}) {
  return (
    <article className={`${styles.kpiCard} ${tone === 'positive' ? styles.kpiPositive : ''} ${tone === 'negative' ? styles.kpiNegative : ''} ${tone === 'neutral' ? styles.kpiNeutral : ''}`}>
      <span className={styles.kpiTitle}>{title}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      {secondaryValue && <span className={styles.kpiSecondaryValue}>{secondaryValue}</span>}
      <p className={styles.kpiHint}>{hint}</p>
    </article>
  )
}

const STEP_LABELS: Record<Step, string> = {
  1: 'Tipo', 2: 'Data', 3: 'Descrição', 4: 'Valor', 5: 'Classificação', 6: 'Grupo',
}

function StepProgress({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4, 5, 6]
  return (
    <div className={styles.stepProgress}>
      {steps.map((s, i) => {
        const done   = s < current
        const active = s === current
        return (
          <div key={s} className={styles.stepProgressItem}>
            <div className={`${styles.stepDot} ${active ? styles.stepDotActive : ''} ${done ? styles.stepDotDone : ''}`}>
              {done ? '✓' : s}
            </div>
            <span className={`${styles.stepDotLabel} ${active ? styles.stepDotLabelActive : ''}`}>
              {STEP_LABELS[s]}
            </span>
            {i < steps.length - 1 && (
              <div className={`${styles.stepConnector} ${done ? styles.stepConnectorDone : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function AiSpinner() {
  return (
    <div className={styles.aiLoadingBox}>
      <div className={styles.aiSpinner} />
      <span>IA analisando...</span>
    </div>
  )
}

type PerfilUsuario = { id: string; name: string | null; email: string | null }

type GrupoData = {
  nome: string
  total: number
  tipo: 'receita' | 'despesa'
  classificacoes: { nome: string; total: number; items: DreLancamento[] }[]
}

type DreListItem =
  | { kind: 'grupo'; data: GrupoData }
  | { kind: 'totalizador'; label: string; valor: number; pct?: number }

interface AnaliseDreProps {
  empresa: Empresa
  onTrocarEmpresa: () => void
  onVoltar: () => void
}

export default function AnaliseDrePage({ empresa, onTrocarEmpresa, onVoltar }: AnaliseDreProps) {
  const [showWizard,     setShowWizard]     = useState(false)
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [step,           setStep]           = useState<Step>(1)
  const [saving,         setSaving]         = useState(false)
  const [aiLoading,      setAiLoading]      = useState(false)
  const [aiError,        setAiError]        = useState('')
  const [aiWarning,      setAiWarning]      = useState('')
  const [error,          setError]          = useState('')
  const [form,           setForm]           = useState<FormState>(INITIAL_FORM)
  const [lancamentos,    setLancamentos]    = useState<DreLancamento[]>([])
  const [classificacoes, setClassificacoes] = useState<DreClassificacao[]>([])
  const [grupos,         setGrupos]         = useState<DreGrupo[]>([])
  const [anoFiltro,        setAnoFiltro]        = useState(String(new Date().getFullYear()))
  const [mesesFiltro,      setMesesFiltro]      = useState<string[]>([])
  const [tipoFiltro,       setTipoFiltro]       = useState<'todos' | 'receita' | 'despesa'>('todos')
  // Admin
  const [isAdmin,          setIsAdmin]          = useState(false)
  const [usuarios,         setUsuarios]         = useState<PerfilUsuario[]>([])
  const [usuarioFiltro,    setUsuarioFiltro]    = useState<string>('')
  const [buscaUsuario,     setBuscaUsuario]     = useState('')
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  // Accordion lançamentos
  const [expandedGrupos,   setExpandedGrupos]   = useState<Set<string>>(new Set())
  const [expandedClfs,     setExpandedClfs]     = useState<Set<string>>(new Set())
  // Excluir período
  const [showDeletePeriodo, setShowDeletePeriodo] = useState(false)
  const [deletingPeriodo,   setDeletingPeriodo]   = useState(false)

 const fetchLancamentos = async (targetUserId?: string, adminOverride?: boolean) => {
  const { data: authData } = await supabase.auth.getUser()
  const myId = authData.user?.id
  if (!myId) { setLancamentos([]); return }

  // adminOverride is used on initial load to bypass stale isAdmin state (React batching)
  const effectiveAdmin = adminOverride ?? isAdmin

  const PAGE_SIZE = 1000
  let from = 0
  let all: DreLancamento[] = []

  while (true) {
    let query = supabase
      .from('dre_lancamentos')
      .select('*')
      .eq('empresa_id', empresa.id)
      .order('data_lancamento', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (effectiveAdmin && targetUserId) {
      query = query.eq('user_id', targetUserId)
    }

    const { data, error } = await query
    if (error) { setError(error.message); return }

    const chunk = (data ?? []) as DreLancamento[]
    all = all.concat(chunk)

    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  setLancamentos(all)
}

  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('dre_classificacoes').select('*').eq('ativo', true).order('tipo').order('nome')
    setClassificacoes(data ?? [])
  }

  const fetchGrupos = async () => {
    const { data } = await supabase
      .from('dre_grupos').select('*').eq('ativo', true).order('nome')
    setGrupos(data ?? [])
  }

  // Load data on mount + check admin
  useEffect(() => {
    fetchClassificacoes()
    fetchGrupos()

    supabase.auth.getUser().then(({ data }) => {
      const myId = data.user?.id
      if (!myId) { fetchLancamentos(); return }

      supabase.from('profiles').select('role').eq('id', myId).single()
        .then(async ({ data: profile }) => {
          const admin = profile?.role === 'admin'
          setIsAdmin(admin)

          // Validate that user still has access to this empresa (sessionStorage may be stale)
          if (!admin) {
            const { data: membro } = await supabase
              .from('empresa_membros')
              .select('user_id')
              .eq('empresa_id', empresa.id)
              .eq('user_id', myId)
              .maybeSingle()
            if (!membro) {
              onTrocarEmpresa()
              return
            }
          }

          if (admin) {
            supabase.from('profiles')
              .select('id, name, email')
              .order('name', { ascending: true })
              .then(({ data: users }) => setUsuarios(users ?? []))
          }
          // Pass admin explicitly to avoid stale closure (React state not yet committed)
          fetchLancamentos(undefined, admin)
        })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const valorNumerico = useMemo(() => {
    const parsed = Number(form.valor.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [form.valor])

  const tipoMap = useMemo(() =>
    Object.fromEntries(classificacoes.map(c => [c.nome, c.tipo])),
  [classificacoes])

  const anosOptions = useMemo(() =>
    [...new Set(lancamentos.map(item => {
      const src = item.data_lancamento ?? item.created_at
      return src ? src.slice(0, 4) : ''
    }).filter(Boolean))].sort((a, b) => b.localeCompare(a))
  , [lancamentos])

  const mesesOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    const meses = [...new Set(lancamentos
      .filter(item => {
        if (anoFiltro === 'todos') return true
        const src = item.data_lancamento ?? item.created_at
        return src?.slice(0, 4) === anoFiltro
      })
      .map(item => {
        const src = item.data_lancamento ?? item.created_at
        return src ? src.slice(5, 7) : ''
      }).filter(Boolean)
    )].sort()
    return meses.map(mm => ({
      value: mm,
      label: formatter.format(new Date(`2000-${mm}-01T00:00:00Z`)),
    }))
  }, [lancamentos, anoFiltro])

  const toggleMes = (mes: string) =>
    setMesesFiltro(prev =>
      prev.includes(mes) ? prev.filter(m => m !== mes) : [...prev, mes].sort()
    )

  const lancamentosFiltrados = useMemo(() => {
    return lancamentos.filter(item => {
      const tipoItem = item.tipo
        ?? tipoMap[item.classificacao]
        ?? (item.classificacao === 'receita' ? 'receita' : 'despesa')
      if (tipoFiltro !== 'todos' && tipoItem !== tipoFiltro) return false
      const src = item.data_lancamento ?? item.created_at
      if (anoFiltro !== 'todos' && (!src || src.slice(0, 4) !== anoFiltro)) return false
      if (mesesFiltro.length > 0 && (!src || !mesesFiltro.includes(src.slice(5, 7)))) return false
      return true
    })
  }, [lancamentos, anoFiltro, mesesFiltro, tipoFiltro, tipoMap])

  const totais = useMemo(() =>
    lancamentosFiltrados.reduce((acc, item) => {
      const tipo = item.tipo
        ?? tipoMap[item.classificacao]
        ?? (item.classificacao === 'receita' ? 'receita' : 'despesa')
      if (tipo === 'receita') acc.receitas += Number(item.valor)
      else                   acc.despesas += Number(item.valor)
      return acc
    }, { receitas: 0, despesas: 0 }),
  [lancamentosFiltrados, tipoMap])

  const resultado = totais.receitas - totais.despesas

  const kpis = useMemo(
    () => calcularKpis(lancamentosFiltrados, totais.receitas),
    [lancamentosFiltrados, totais.receitas],
  )

  const lancamentosAgrupados = useMemo(() => {
    const grupoMap = new Map<string, {
      total: number; tipo: 'receita' | 'despesa'
      classificacoes: Map<string, { total: number; items: DreLancamento[] }>
    }>()
    for (const l of lancamentosFiltrados) {
      const gKey = l.grupo || 'Sem grupo'
      const cKey = l.classificacao || 'Sem classificação'
      const tipo = (l.tipo ?? tipoMap[l.classificacao] ?? 'despesa') as 'receita' | 'despesa'
      if (!grupoMap.has(gKey)) grupoMap.set(gKey, { total: 0, tipo, classificacoes: new Map() })
      const g = grupoMap.get(gKey)!
      g.total += Number(l.valor)
      if (!g.classificacoes.has(cKey)) g.classificacoes.set(cKey, { total: 0, items: [] })
      const c = g.classificacoes.get(cKey)!
      c.total += Number(l.valor)
      c.items.push(l)
    }
    return [...grupoMap.entries()]
      .map(([nome, d]) => ({
        nome, total: d.total, tipo: d.tipo,
        classificacoes: [...d.classificacoes.entries()]
          .map(([cNome, cd]) => ({ nome: cNome, total: cd.total, items: cd.items }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => {
        if (a.tipo !== b.tipo) return a.tipo === 'receita' ? -1 : 1
        return b.total - a.total
      })
  }, [lancamentosFiltrados, tipoMap])

  // ── DRE ordered list com totalizadores ────────────────────────────────────
  const dreOrdenadoItems = useMemo<DreListItem[]>(() => {
    const gruposMap = new Map<string, GrupoData>(lancamentosAgrupados.map(g => [g.nome.toLowerCase().trim(), g as GrupoData]))
    const used = new Set<string>()
    const result: DreListItem[] = []

    // Seção 1: Receitas Operacionais (todos grupos receita exceto Receitas Financeiras)
    const gruposReceita = lancamentosAgrupados.filter(
      g => g.tipo === 'receita' && g.nome.toLowerCase().trim() !== 'receitas financeiras'
    )
    for (const g of gruposReceita) {
      result.push({ kind: 'grupo', data: g })
      used.add(g.nome.toLowerCase().trim())
    }
    if (gruposReceita.length > 0) {
      result.push({ kind: 'totalizador', label: 'RECEITAS OPERACIONAIS', valor: kpis.receitaOperacional })
    }

    // Seção 2: Deduções de Receita + Impostos → RECEITA LÍQUIDA
    let addedDeducoes = false
    for (const nome of ['deduções de receita', 'impostos sobre faturamento']) {
      const g = gruposMap.get(nome)
      if (g) { result.push({ kind: 'grupo', data: g }); used.add(nome); addedDeducoes = true }
    }
    if (addedDeducoes) {
      result.push({ kind: 'totalizador', label: 'RECEITA LÍQUIDA', valor: kpis.receitaLiquida })
    }

    // Seção 3: Despesas Operacionais diretas → MARGEM DE CONTRIBUIÇÃO
    let addedOp = false
    const g3 = gruposMap.get('despesas operacionais')
    if (g3) { result.push({ kind: 'grupo', data: g3 }); used.add('despesas operacionais'); addedOp = true }
    if (addedOp) {
      result.push({ kind: 'totalizador', label: 'MARGEM DE CONTRIBUIÇÃO', valor: kpis.margemContrib, pct: kpis.margemContribPct })
    }

    // Seção 4: Despesas Indiretas → EBITDA
    let addedIndir = false
    for (const nome of ['despesas com pessoal', 'despesas administrativas', 'despesas comerciais e marketing', 'despesas com ti']) {
      const g = gruposMap.get(nome)
      if (g) { result.push({ kind: 'grupo', data: g }); used.add(nome); addedIndir = true }
    }
    if (addedIndir) {
      result.push({ kind: 'totalizador', label: 'EBITDA', valor: kpis.ebitda, pct: kpis.ebitdaPct })
    }

    // Seção 5: Resultado Financeiro → EBIT
    let addedFin = false
    for (const nome of ['receitas financeiras', 'despesas financeiras']) {
      const g = gruposMap.get(nome)
      if (g) { result.push({ kind: 'grupo', data: g }); used.add(nome); addedFin = true }
    }
    if (addedFin) {
      result.push({ kind: 'totalizador', label: 'EBIT', valor: kpis.ebit, pct: kpis.ebitPct })
    }

    // Seção 6: Investimentos → NOPAT
    let addedInvest = false
    const g6 = gruposMap.get('investimentos')
    if (g6) { result.push({ kind: 'grupo', data: g6 }); used.add('investimentos'); addedInvest = true }
    if (addedInvest) {
      result.push({ kind: 'totalizador', label: 'NOPAT (RESULTADO OPERACIONAL)', valor: kpis.nopat, pct: kpis.nopatPct })
    }

    // Grupos restantes não mapeados no DRE
    for (const g of lancamentosAgrupados) {
      if (!used.has(g.nome.toLowerCase().trim())) {
        result.push({ kind: 'grupo', data: g })
      }
    }

    return result
  }, [lancamentosAgrupados, kpis])

  // ── Comparativo por mês: calcula grupos+kpis para cada mês selecionado ───────
  type MesComparativoData = {
    mes: string
    label: string
    receitas: number
    despesas: number
    agrupados: ReturnType<typeof calcularAgrupados>
    kpis: ReturnType<typeof calcularKpis>
  }

  function calcularAgrupados(
    items: DreLancamento[],
    tMap: Record<string, string>,
  ) {
    const grupoMap = new Map<string, {
      total: number; tipo: 'receita' | 'despesa'
      classificacoes: Map<string, { total: number; items: DreLancamento[] }>
    }>()
    for (const l of items) {
      const gKey = l.grupo || 'Sem grupo'
      const cKey = l.classificacao || 'Sem classificação'
      const tipo = (l.tipo ?? tMap[l.classificacao] ?? 'despesa') as 'receita' | 'despesa'
      if (!grupoMap.has(gKey)) grupoMap.set(gKey, { total: 0, tipo, classificacoes: new Map() })
      const g = grupoMap.get(gKey)!
      g.total += Number(l.valor)
      if (!g.classificacoes.has(cKey)) g.classificacoes.set(cKey, { total: 0, items: [] })
      const c = g.classificacoes.get(cKey)!
      c.total += Number(l.valor)
      c.items.push(l)
    }
    return [...grupoMap.entries()].map(([nome, d]) => ({
      nome, total: d.total, tipo: d.tipo,
      classificacoes: [...d.classificacoes.entries()]
        .map(([cNome, cd]) => ({ nome: cNome, total: cd.total, items: cd.items }))
        .sort((a, b) => b.total - a.total),
    }))
  }

  const dreComparativoPorMes = useMemo<MesComparativoData[]>(() => {
    // Se nenhum mês selecionado, usa todos os meses disponíveis (ano atual)
    const mesesEfetivos = mesesFiltro.length > 0 ? mesesFiltro : mesesOptions.map(m => m.value)
    if (mesesEfetivos.length === 0) return []
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    return mesesEfetivos.map(mes => {
      const items = lancamentos.filter(l => {
        const src = l.data_lancamento ?? l.created_at
        if (!src) return false
        if (anoFiltro !== 'todos' && src.slice(0, 4) !== anoFiltro) return false
        return src.slice(5, 7) === mes
      })
      const rec = items.filter(l => (l.tipo ?? tipoMap[l.classificacao] ?? 'despesa') === 'receita')
        .reduce((s, l) => s + Number(l.valor), 0)
      const desp = items.filter(l => (l.tipo ?? tipoMap[l.classificacao] ?? 'despesa') === 'despesa')
        .reduce((s, l) => s + Number(l.valor), 0)
      const agrupados = calcularAgrupados(items, tipoMap)
      const k = calcularKpis(items, rec)
      return {
        mes,
        label: formatter.format(new Date(`2000-${mes}-01T00:00:00Z`)),
        receitas: rec,
        despesas: desp,
        agrupados,
        kpis: k,
      }
    })
  }, [mesesFiltro, mesesOptions, lancamentos, anoFiltro, tipoMap])

  const toggleGrupo = (key: string) => setExpandedGrupos(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })
  const toggleClf = (key: string) => setExpandedClfs(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  const gruposExistentes = useMemo(() =>
    [...new Set([
      ...grupos.map(g => g.nome).filter(Boolean),
      ...lancamentos.map(l => l.grupo).filter(Boolean),
    ])],
  [grupos, lancamentos])

  const classificacoesFiltradas = useMemo(() =>
    form.tipo ? classificacoes.filter(c => c.tipo === form.tipo) : classificacoes,
  [classificacoes, form.tipo])

  const openWizard = () => {
    setEditingId(null)
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiError('')
    setAiWarning('')
    setShowWizard(true)
  }

  const openEditWizard = (item: DreLancamento) => {
    setEditingId(item.id)
    setForm({
      tipo:              item.tipo,
      data:              item.data_lancamento ?? today(),
      descricao:         item.descricao ?? '',
      valor:             String(item.valor),
      classificacaoNome: item.classificacao,
      grupo:             item.grupo,
    })
    setStep(1)
    setError('')
    setAiError('')
    setAiWarning('')
    setShowWizard(true)
  }

  const closeWizard = () => {
    setShowWizard(false)
    setEditingId(null)
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiError('')
    setAiWarning('')
  }

  const deleteLancamento = async (item: DreLancamento) => {
    const confirmado = window.confirm(
      `Excluir lançamento "${item.descricao ?? '(sem descrição)'}" de ${moeda(Number(item.valor))}?`
    )
    if (!confirmado) return
    const { error } = await supabase.from('dre_lancamentos').delete().eq('id', item.id)
    if (error) { alert(`Erro ao excluir: ${error.message}`); return }
    fetchLancamentos(usuarioFiltro || undefined)
  }

  /** IDs dos lançamentos do período selecionado (ano + meses, ignora filtro de tipo) */
  const idsPeriodoSelecionado = useMemo(() => {
    if (anoFiltro === 'todos') return []
    return lancamentos
      .filter(item => {
        const src = item.data_lancamento ?? item.created_at
        if (!src || src.slice(0, 4) !== anoFiltro) return false
        if (mesesFiltro.length > 0 && !mesesFiltro.includes(src.slice(5, 7))) return false
        return true
      })
      .map(item => item.id)
  }, [lancamentos, anoFiltro, mesesFiltro])

  const excluirLancamentosPeriodo = async () => {
    if (idsPeriodoSelecionado.length === 0) return
    setDeletingPeriodo(true)
    // Deleta em lotes de 200 para não estourar o limite da URL
    const LOTE = 200
    for (let i = 0; i < idsPeriodoSelecionado.length; i += LOTE) {
      const lote = idsPeriodoSelecionado.slice(i, i + LOTE)
      const { error } = await supabase.from('dre_lancamentos').delete().in('id', lote)
      if (error) { alert(`Erro ao excluir: ${error.message}`); setDeletingPeriodo(false); return }
    }
    setDeletingPeriodo(false)
    setShowDeletePeriodo(false)
    setMesesFiltro([])
    fetchLancamentos(usuarioFiltro || undefined)
  }

  const labelPeriodo = (() => {
    if (anoFiltro === 'todos') return ''
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
    if (mesesFiltro.length === 0) return `todos os meses de ${anoFiltro}`
    const nomes = mesesFiltro.map(mm =>
      formatter.format(new Date(`2000-${mm}-01T00:00:00Z`))
    )
    return `${nomes.join(', ')} de ${anoFiltro}`
  })()

  const ensureGrupoCatalogado = async (grupoNomeRaw: string, tipoRaw: '' | 'receita' | 'despesa') => {
    const grupoNome = grupoNomeRaw.trim()
    if (!grupoNome) return { ok: false as const, error: 'Grupo vazio.' }

    const tipoGrupo: 'receita' | 'despesa' = tipoRaw === 'receita' ? 'receita' : 'despesa'

    const { error } = await supabase
      .from('dre_grupos')
      .upsert({ nome: grupoNome, tipo: tipoGrupo, ativo: true }, { onConflict: 'nome,tipo' })

    if (!error) return { ok: true as const }

    const { error: insertError } = await supabase
      .from('dre_grupos')
      .insert({ nome: grupoNome, tipo: tipoGrupo, ativo: true })

    if (insertError && !String(insertError.message).toLowerCase().includes('duplicate')) {
      return { ok: false as const, error: insertError.message }
    }

    return { ok: true as const }
  }

  // After step 4 (valor): AI identifies classificacao + grupo
  const goToStep5 = async () => {
    if (valorNumerico <= 0) return
    setStep(5)
    setAiLoading(true)
    setAiError('')
    setAiWarning('')
    setForm(p => ({ ...p, classificacaoNome: '', grupo: '' }))

    try {
      const { data: configData } = await supabase
        .from('configuracoes').select('valor').eq('chave', 'modelo_groq').single()
      const modelo = configData?.valor ?? DEFAULT_GROQ_MODEL

      const classesDoTipo = classificacoes
        .filter(c => c.tipo === form.tipo)
        .map(c => ({ nome: c.nome, tipo: c.tipo }))

      const { data, error: fnError } = await supabase.functions.invoke('dre-ai-classify', {
        body: {
          descricao: form.descricao,
          valor: valorNumerico,
          tipo: form.tipo,
          modelo,
          classificacoes_disponiveis: classesDoTipo,
          grupos_existentes: gruposExistentes,
        },
      })

      if (fnError) {
        setAiError(`Erro ao chamar IA: ${fnError.message ?? String(fnError)}`)
      } else if (data?.error) {
        setAiError(`IA indisponível: ${data.error}`)
      } else if (data) {
        const grupoIa = String(data.grupo ?? '').trim()
        const classificacaoIa = String(data.classificacao_nome ?? '').trim()

        // Valida se o grupo sugerido está no plano de contas oficial
        const gruposOficiais = grupos.filter(g => g.tipo === form.tipo).map(g => g.nome)
        const grupoFinal =
          gruposOficiais.includes(grupoIa) ? grupoIa :
          (CLASSIFICACAO_TO_GRUPO[classificacaoIa] ?? '')

        setForm(p => ({ ...p, classificacaoNome: classificacaoIa, grupo: grupoFinal }))

        if (data?.aviso) setAiWarning(String(data.aviso))
      }
    } catch (e) {
      setAiError(`Erro inesperado: ${String(e)}`)
    } finally {
      setAiLoading(false)
    }
  }

  const salvar = async () => {
    setError('')
    if (valorNumerico <= 0 || !form.classificacaoNome || !form.grupo.trim()) {
      setError('Preencha todos os campos.')
      return
    }
    setSaving(true)
    const { data: authData } = await supabase.auth.getUser()

    const classificacaoNome  = form.classificacaoNome.trim()
    const grupoNome          = form.grupo.trim()
    const tipoClassificacao  = form.tipo || (tipoMap[classificacaoNome] === 'receita' ? 'receita' : 'despesa')
    const dataLancamento     = form.data || today()

    // Garante a classificação no banco (vindas da IA/plano de contas)
    await supabase
      .from('dre_classificacoes')
      .upsert({ nome: classificacaoNome, tipo: tipoClassificacao, ativo: true }, { onConflict: 'nome' })

    const resGrupo = await ensureGrupoCatalogado(grupoNome, form.tipo)
    if (!resGrupo.ok) {
      setSaving(false)
      setError(`Não foi possível cadastrar o grupo: ${resGrupo.error}`)
      return
    }

    const payload = {
      descricao:        form.descricao.trim() || null,
      valor:            valorNumerico,
      tipo:             tipoClassificacao,
      classificacao:    classificacaoNome,
      grupo:            grupoNome,
      data_lancamento:  dataLancamento,
    }

    const { error } = editingId
      ? await supabase.from('dre_lancamentos').update(payload).eq('id', editingId)
      : await supabase.from('dre_lancamentos').insert({
          ...payload,
          user_id:    authData.user?.id ?? null,
          empresa_id: empresa.id,
        })

    setSaving(false)
    if (error) { setError(error.message); return }
    closeWizard(); fetchLancamentos(usuarioFiltro || undefined); fetchGrupos(); fetchClassificacoes()
  }

  const formatDate = (item: DreLancamento) => {
    const src = item.data_lancamento ?? item.created_at
    return new Date(src).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  const kpiTone = (v: number): 'positive' | 'negative' | 'neutral' =>
    v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral'

  // ── Helpers para colunas mensais no accordion ─────────────────────────────
  const getMesGrupoTotal = (nomeGrupo: string, mesData: MesComparativoData): number =>
    mesData.agrupados.find(g => g.nome === nomeGrupo)?.total ?? 0

  const getMesClfTotal = (nomeGrupo: string, nomeClt: string, mesData: MesComparativoData): number =>
    mesData.agrupados
      .find(g => g.nome === nomeGrupo)
      ?.classificacoes.find(c => c.nome === nomeClt)?.total ?? 0

  const getMesTotalizadorValor = (label: string, mesData: MesComparativoData): number => {
    const k = mesData.kpis
    switch (label) {
      case 'RECEITAS OPERACIONAIS': return k.receitaOperacional
      case 'RECEITA LÍQUIDA': return k.receitaLiquida
      case 'MARGEM DE CONTRIBUIÇÃO': return k.margemContrib
      case 'EBITDA': return k.ebitda
      case 'EBIT': return k.ebit
      case 'NOPAT (RESULTADO OPERACIONAL)': return k.nopat
      default: return 0
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Financeiro • Aplicativo interno</p>
          <h1>Análise DFC</h1>
          <p className={styles.subtitle}>
            <span style={{ color: '#c9a22a', fontWeight: 600 }}>{empresa.nome}</span>
            {empresa.cnpj ? ` · ${empresa.cnpj}` : ''} — Acompanhe receitas, despesas e o resultado do período.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <button onClick={onVoltar} className={styles.backLink} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>← Voltar ao dashboard</button>
          <button
            onClick={onTrocarEmpresa}
            style={{
              background: 'none', border: '1px solid #2a2a2a', borderRadius: 6,
              padding: '4px 12px', color: '#888', fontSize: 12, cursor: 'pointer',
            }}
          >
            Trocar empresa
          </button>
        </div>
      </header>

      {/* ── Stats ── */}
      <section className={styles.statsGrid}>
        <StatCard title="Receitas"  value={moeda(totais.receitas)} tone="positive" />
        <StatCard title="Despesas"  value={moeda(totais.despesas)} tone="negative" />
        <StatCard title="Resultado" value={moeda(resultado)} tone={resultado >= 0 ? 'positive' : 'negative'} />
      </section>

      {/* ── KPI Cards ── */}
      {lancamentosFiltrados.length > 0 && (
        <section className={styles.kpiSection}>
          <h3 className={styles.kpiSectionTitle}>Indicadores DFC</h3>
          <div className={styles.kpiGrid}>
            <KpiCard
              title="Receitas Operacionais"
              value={moeda(kpis.receitaOperacional)}
              secondaryValue={`Líq. ${moeda(kpis.receitaLiquida)}`}
              hint="Receita bruta do período. Líquida = após deduções e impostos sobre faturamento (Simples/Presumido)."
              tone="positive"
            />
            <KpiCard
              title="Margem de Contribuição"
              value={pct(kpis.margemContribPct)}
              secondaryValue={moeda(kpis.margemContrib)}
              hint="Receita Líquida menos custos diretos de entrega (materiais, insumos, serviços operacionais)."
              tone={kpiTone(kpis.margemContribPct)}
            />
            <KpiCard
              title="EBITDA"
              value={pct(kpis.ebitdaPct)}
              secondaryValue={moeda(kpis.ebitda)}
              hint="Margem de Contribuição menos despesas com pessoal, administrativas, comerciais e TI."
              tone={kpiTone(kpis.ebitdaPct)}
            />
            <KpiCard
              title="EBIT"
              value={pct(kpis.ebitPct)}
              secondaryValue={moeda(kpis.ebit)}
              hint="EBITDA + receitas financeiras − despesas financeiras (D&A, juros, bancárias)."
              tone={kpiTone(kpis.ebitPct)}
            />
            <KpiCard
              title="NOPAT (Resultado Op.)"
              value={pct(kpis.nopatPct)}
              secondaryValue={moeda(kpis.nopat)}
              hint="EBIT menos investimentos em ativos — resultado operacional final do período."
              tone={kpiTone(kpis.nopatPct)}
            />
          </div>
          <p className={styles.kpiDisclaimer}>
            * Indicadores calculados com base nos lançamentos cadastrados e seus grupos. Quanto mais detalhado seu lançamento, mais preciso o cálculo.
          </p>
        </section>
      )}

      {/* ── Extrato Upload ── */}
      <ExtratoUpload empresaId={empresa.id} onSaved={() => fetchLancamentos(usuarioFiltro || undefined)} />

      {/* ── AI Assistant ── */}
      <DreAssistentePanel lancamentos={lancamentosFiltrados} />

      {/* ── Lançamentos ── */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Lançamentos</h2>
            <span className={styles.stepIndicator}>{lancamentosFiltrados.length} registros</span>
          </div>
          <div className={styles.filtersRow}>
            {/* Admin: busca de usuário */}
            {isAdmin && (
              <div className={styles.userSearchWrap}>
                <label className={styles.filterLabel}>
                  Buscar usuário
                  <input
                    type="text"
                    className={styles.userSearchInput}
                    placeholder="Nome ou e-mail..."
                    value={buscaUsuario}
                    onChange={e => { setBuscaUsuario(e.target.value); setShowUserDropdown(true) }}
                    onFocus={() => setShowUserDropdown(true)}
                    onBlur={() => setTimeout(() => setShowUserDropdown(false), 150)}
                  />
                </label>
                {showUserDropdown && (
                  <div className={styles.userDropdown}>
                    <button
                      className={`${styles.userDropdownItem} ${!usuarioFiltro ? styles.userDropdownItemActive : ''}`}
                      onMouseDown={() => {
                        setUsuarioFiltro(''); setBuscaUsuario('')
                        setShowUserDropdown(false); fetchLancamentos(undefined)
                      }}
                    >
                      Meus lançamentos
                    </button>
                    {usuarios
                      .filter(u =>
                        !buscaUsuario ||
                        (u.name ?? '').toLowerCase().includes(buscaUsuario.toLowerCase()) ||
                        (u.email ?? '').toLowerCase().includes(buscaUsuario.toLowerCase())
                      )
                      .slice(0, 8)
                      .map(u => (
                        <button
                          key={u.id}
                          className={`${styles.userDropdownItem} ${usuarioFiltro === u.id ? styles.userDropdownItemActive : ''}`}
                          onMouseDown={() => {
                            setUsuarioFiltro(u.id)
                            setBuscaUsuario(u.name ?? u.email ?? '')
                            setShowUserDropdown(false)
                            setAnoFiltro('todos'); setMesesFiltro([])
                            fetchLancamentos(u.id)
                          }}
                        >
                          <span className={styles.userDropdownName}>{u.name ?? u.email}</span>
                          {u.name && u.email && <span className={styles.userDropdownEmail}>{u.email}</span>}
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
            )}

            <label className={styles.filterLabel}>
              Ano
              <select
                value={anoFiltro}
                onChange={e => { setAnoFiltro(e.target.value); setMesesFiltro([]) }}
                className={styles.filterSelect}
              >
                <option value="todos">Todos os anos</option>
                {anosOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
              </select>
            </label>

            <div className={styles.filterLabel}>
              <span>Meses</span>
              <div className={styles.mesFiltroChips}>
                {mesesOptions.map(opt => (
                  <button
                    key={opt.value}
                    className={`${styles.mesChip} ${mesesFiltro.includes(opt.value) ? styles.mesChipSelected : ''}`}
                    onClick={() => toggleMes(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
                {mesesFiltro.length > 0 && (
                  <button className={styles.mesChipClear} onClick={() => setMesesFiltro([])}>
                    ✕ limpar
                  </button>
                )}
              </div>
            </div>

            <label className={styles.filterLabel}>
              Tipo
              <select
                value={tipoFiltro}
                onChange={e => setTipoFiltro(e.target.value as 'todos' | 'receita' | 'despesa')}
                className={styles.filterSelect}
              >
                <option value="todos">Tudo</option>
                <option value="receita">Receitas</option>
                <option value="despesa">Despesas</option>
              </select>
            </label>

            {anoFiltro !== 'todos' && (
              <button
                className={styles.deletePeriodoBtn}
                onClick={() => setShowDeletePeriodo(true)}
                title="Excluir todos os lançamentos do período selecionado"
              >
                🗑 Excluir período
              </button>
            )}

            <button className={styles.newBtn} onClick={openWizard}>+ Novo lançamento</button>
          </div>
        </div>

        {/* ── Accordion de grupos ── */}
        {lancamentosAgrupados.length === 0 ? (
          <div className={styles.emptyAccordion}>
            Nenhum lançamento encontrado.{' '}
            <button className={styles.emptyAction} onClick={openWizard}>Adicionar agora</button>
          </div>
        ) : (
          <div className={styles.accordionList}>
            {dreOrdenadoItems.map((item) => {
              if (item.kind === 'totalizador') {
                const tot = item as { kind: 'totalizador'; label: string; valor: number; pct?: number }
                const tone = tot.valor > 0 ? 'positive' : tot.valor < 0 ? 'negative' : 'neutral'
                return (
                  <div
                    key={`tot-${tot.label}`}
                    className={`${styles.totalizadorRow} ${tone === 'positive' ? styles.totalizadorPositive : tone === 'negative' ? styles.totalizadorNegative : ''}`}
                  >
                    <span className={styles.totalizadorLabel}>{tot.label}</span>
                    <div className={styles.totalizadorValues}>
                      {dreComparativoPorMes.length > 0 ? (
                        <>
                          {dreComparativoPorMes.map(m => {
                            const val = getMesTotalizadorValor(tot.label, m)
                            const base = m.kpis.receitaOperacional > 0 ? m.kpis.receitaOperacional : 1
                            return (
                              <div key={m.mes} className={styles.mesColCell}>
                                <span className={styles.mesColLabel}>{m.label}</span>
                                <strong className={styles.totalizadorValor}>{moeda(val)}</strong>
                                {tot.pct !== undefined && <span className={styles.totalizadorPct}>{((val / base) * 100).toFixed(1)}%</span>}
                              </div>
                            )
                          })}
                          {dreComparativoPorMes.length > 1 && (
                            <div className={`${styles.mesColCell} ${styles.mesColTotal}`}>
                              <span className={styles.mesColLabel}>Total</span>
                              <strong className={styles.totalizadorValor}>{moeda(tot.valor)}</strong>
                              {tot.pct !== undefined && <span className={styles.totalizadorPct}>{tot.pct.toFixed(1)}%</span>}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {tot.pct !== undefined && <span className={styles.totalizadorPct}>{tot.pct.toFixed(1)}%</span>}
                          <strong className={styles.totalizadorValor}>{moeda(tot.valor)}</strong>
                        </>
                      )}
                    </div>
                  </div>
                )
              }
              const grupo = item.data
              const gKey = grupo.nome
              const gAberto = expandedGrupos.has(gKey)
              return (
                <div key={gKey} className={`${styles.grupoBlock} ${grupo.tipo === 'receita' ? styles.grupoBlockReceita : styles.grupoBlockDespesa}`}>
                  <button className={styles.grupoBlockHeader} onClick={() => toggleGrupo(gKey)}>
                    <div className={styles.grupoBlockLeft}>
                      <span className={`${styles.grupoBadge} ${grupo.tipo === 'receita' ? styles.grupoBadgeReceita : styles.grupoBadgeDespesa}`}>
                        {grupo.tipo === 'receita' ? '↑' : '↓'}
                      </span>
                      <strong className={styles.grupoBlockNome}>{grupo.nome}</strong>
                      <span className={styles.grupoBlockCount}>
                        {grupo.classificacoes.reduce((s, c) => s + c.items.length, 0)} lançamentos
                      </span>
                    </div>
                    <div className={styles.grupoBlockRight}>
                      {dreComparativoPorMes.length > 0 ? (
                        <div className={styles.mesColValues}>
                          {dreComparativoPorMes.map(m => {
                            const gVal = getMesGrupoTotal(grupo.nome, m)
                            const gBase = m.kpis.receitaOperacional > 0 ? m.kpis.receitaOperacional : null
                            return (
                              <div key={m.mes} className={styles.mesColCell}>
                                <span className={styles.mesColLabel}>{m.label}</span>
                                <strong className={grupo.tipo === 'receita' ? styles.valorPositivo : styles.valorNegativo}>
                                  {moeda(gVal)}
                                </strong>
                                <span className={styles.totalizadorPct}>{gBase ? ((gVal / gBase) * 100).toFixed(1) + '%' : '—'}</span>
                              </div>
                            )
                          })}
                          {dreComparativoPorMes.length > 1 && (
                            <div className={`${styles.mesColCell} ${styles.mesColTotal}`}>
                              <span className={styles.mesColLabel}>Total</span>
                              <strong className={grupo.tipo === 'receita' ? styles.valorPositivo : styles.valorNegativo}>
                                {moeda(grupo.total)}
                              </strong>
                              <span className={styles.totalizadorPct}>{kpis.receitaOperacional > 0 ? ((grupo.total / kpis.receitaOperacional) * 100).toFixed(1) + '%' : '—'}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <strong className={grupo.tipo === 'receita' ? styles.valorPositivo : styles.valorNegativo}>
                            {moeda(grupo.total)}
                          </strong>
                          <span className={styles.totalizadorPct}>{kpis.receitaOperacional > 0 ? ((grupo.total / kpis.receitaOperacional) * 100).toFixed(1) + '%' : '—'}</span>
                        </>
                      )}
                      <span className={styles.chevronIcon}>{gAberto ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {gAberto && (
                    <div className={styles.clfList}>
                      {grupo.classificacoes.map(clf => {
                        const cKey = `${gKey}::${clf.nome}`
                        const cAberto = expandedClfs.has(cKey)
                        return (
                          <div key={cKey} className={styles.clfBlock}>
                            <button className={styles.clfBlockHeader} onClick={() => toggleClf(cKey)}>
                              <span className={styles.clfNome}>{clf.nome}</span>
                              <div className={styles.clfRight}>
                                <span className={styles.clfCount}>{clf.items.length} lançamento(s)</span>
                                {dreComparativoPorMes.length > 0 ? (
                                  <div className={styles.mesColValues}>
                                    {dreComparativoPorMes.map(m => {
                                      const cVal = getMesClfTotal(grupo.nome, clf.nome, m)
                                      const cBase = m.kpis.receitaOperacional > 0 ? m.kpis.receitaOperacional : null
                                      return (
                                        <div key={m.mes} className={styles.mesColCell}>
                                          <span className={styles.mesColLabel}>{m.label}</span>
                                          <strong className={styles.clfTotal}>{moeda(cVal)}</strong>
                                          <span className={styles.totalizadorPct}>{cBase ? ((cVal / cBase) * 100).toFixed(1) + '%' : '—'}</span>
                                        </div>
                                      )
                                    })}
                                    {dreComparativoPorMes.length > 1 && (
                                      <div className={`${styles.mesColCell} ${styles.mesColTotal}`}>
                                        <span className={styles.mesColLabel}>Total</span>
                                        <strong className={styles.clfTotal}>{moeda(clf.total)}</strong>
                                        <span className={styles.totalizadorPct}>{kpis.receitaOperacional > 0 ? ((clf.total / kpis.receitaOperacional) * 100).toFixed(1) + '%' : '—'}</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <strong className={styles.clfTotal}>{moeda(clf.total)}</strong>
                                    <span className={styles.totalizadorPct}>{kpis.receitaOperacional > 0 ? ((clf.total / kpis.receitaOperacional) * 100).toFixed(1) + '%' : '—'}</span>
                                  </>
                                )}
                                <span className={styles.chevronSm}>{cAberto ? '▲' : '▼'}</span>
                              </div>
                            </button>
                            {cAberto && (
                              <table className={styles.lancTable}>
                                <thead>
                                  <tr><th>Data</th><th>Descrição</th><th>Valor</th><th className={styles.thPct}>% Rec. Op.</th><th></th></tr>
                                </thead>
                                <tbody>
                                  {clf.items.map(item => (
                                    <tr key={item.id}>
                                      <td>{formatDate(item)}</td>
                                      <td>{item.descricao ?? '—'}</td>
                                      <td className={item.tipo === 'receita' ? styles.tdReceita : styles.tdDespesa}>
                                        {moeda(Number(item.valor))}
                                      </td>
                                      <td className={styles.tdPct}>
                                        {kpis.receitaOperacional > 0
                                          ? pct((Number(item.valor) / kpis.receitaOperacional) * 100)
                                          : '—'}
                                      </td>
                                      <td className={styles.actionCell}>
                                        <button className={styles.editBtn} onClick={() => openEditWizard(item)}>
                                          Editar
                                        </button>
                                        <button className={styles.deleteBtn} onClick={() => deleteLancamento(item)}>
                                          Excluir
                                        </button>
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
        )}
      </section>

      {/* ── Wizard modal ── */}
      {showWizard && (
        <div className={styles.modalOverlay} onClick={closeWizard}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>

            <div className={styles.modalHeader}>
              <h2>{editingId ? 'Editar lançamento' : 'Novo lançamento'}</h2>
              <button className={styles.closeBtn} onClick={closeWizard} aria-label="Fechar">✕</button>
            </div>

            <StepProgress current={step} />

            {/* ── STEP 1: Tipo ── */}
            {step === 1 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>O que foi isso?</label>

                <div className={styles.tipoGrid}>
                  <button
                    className={`${styles.tipoBtn} ${styles.tipoBtnReceita} ${form.tipo === 'receita' ? styles.tipoBtnSelected : ''}`}
                    onClick={() => setForm(p => ({ ...p, tipo: 'receita' }))}
                  >
                    <span className={styles.tipoArrow}>↑</span>
                    <div className={styles.tipoBtnText}>
                      <strong>Entrou dinheiro</strong>
                      <small>Venda, serviço prestado, recebimento</small>
                    </div>
                  </button>

                  <button
                    className={`${styles.tipoBtn} ${styles.tipoBtnDespesa} ${form.tipo === 'despesa' ? styles.tipoBtnSelected : ''}`}
                    onClick={() => setForm(p => ({ ...p, tipo: 'despesa' }))}
                  >
                    <span className={styles.tipoArrow}>↓</span>
                    <div className={styles.tipoBtnText}>
                      <strong>Saiu dinheiro</strong>
                      <small>Compra, pagamento, fornecedor, custo</small>
                    </div>
                  </button>
                </div>

                <button className={styles.submit} disabled={!form.tipo} onClick={() => setStep(2)}>
                  Próximo →
                </button>
              </div>
            )}

            {/* ── STEP 2: Data ── */}
            {step === 2 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Em qual data?</label>
                <p className={styles.wizardHint}>
                  Informe quando aconteceu esse {form.tipo === 'receita' ? 'recebimento' : 'pagamento'}.
                </p>
                <input
                  type="date"
                  className={styles.wizardInput}
                  value={form.data}
                  onChange={e => setForm(p => ({ ...p, data: e.target.value }))}
                  max={today()}
                  autoFocus
                />
                <button className={styles.submit} disabled={!form.data} onClick={() => setStep(3)}>
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(1)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 3: Descrição ── */}
            {step === 3 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>
                  {form.tipo === 'receita' ? 'O que você vendeu ou recebeu?' : 'O que você comprou ou pagou?'}
                </label>
                <input
                  className={styles.wizardInput}
                  value={form.descricao}
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder={form.tipo === 'receita' ? 'Ex: Pagamento pelo serviço de design' : 'Ex: Compra de material de escritório'}
                  autoFocus
                />
                <button className={styles.submit} disabled={!form.descricao.trim()} onClick={() => setStep(4)}>
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(2)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 4: Valor ── */}
            {step === 4 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Qual é o valor?</label>
                <input
                  className={styles.wizardInput}
                  value={form.valor}
                  onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                  placeholder="Ex: 1.250,00"
                  inputMode="decimal"
                  autoFocus
                />
                <button className={styles.submit} disabled={valorNumerico <= 0} onClick={goToStep5}>
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(3)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 5: Classificação ── */}
            {step === 5 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Como classificar?</label>

                {aiLoading ? <AiSpinner /> : (
                  <>
                    {aiError && (
                      <div className={styles.aiErrorBox}>
                        <span className={styles.aiErrorIcon}>⚠️</span>
                        <div>
                          <strong>IA indisponível</strong>
                          <p className={styles.aiErrorDetail}>{aiError}</p>
                          <p className={styles.aiErrorHint}>Selecione manualmente. Verifique as configurações da IA.</p>
                        </div>
                      </div>
                    )}

                    {aiWarning && !aiError && (
                      <div className={styles.aiErrorBox}>
                        <span className={styles.aiErrorIcon}>ℹ️</span>
                        <div>
                          <strong>Sugestão por fallback</strong>
                          <p className={styles.aiErrorDetail}>{aiWarning}</p>
                        </div>
                      </div>
                    )}

                    {!aiError && form.classificacaoNome && (
                      <div className={styles.aiSelectedBox}>
                        <span className={styles.aiSelectedLabel}>IA identificou</span>
                        <strong className={styles.aiSelectedValue}>{form.classificacaoNome}</strong>
                      </div>
                    )}

                    {classificacoesFiltradas.length === 0 ? (
                      <p className={styles.error}>
                        Nenhuma classificação cadastrada para este tipo. Acesse Configurações Admin.
                      </p>
                    ) : (
                      <div className={styles.listbox}>
                        {classificacoesFiltradas.map(c => (
                          <button
                            key={c.id}
                            className={`${styles.listboxItem} ${form.classificacaoNome === c.nome ? styles.listboxItemSelected : ''}`}
                            onClick={() => {
                              const grupoMapeado = CLASSIFICACAO_TO_GRUPO[c.nome] ?? form.grupo
                              setForm(p => ({ ...p, classificacaoNome: c.nome, grupo: grupoMapeado }))
                            }}
                          >
                            <span className={styles.listboxRadio}>
                              {form.classificacaoNome === c.nome ? '●' : '○'}
                            </span>
                            {c.nome}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <button
                  className={styles.submit}
                  disabled={!form.classificacaoNome || aiLoading}
                  onClick={() => setStep(6)}
                >
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(4)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 6: Grupo ── */}
            {step === 6 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Grupo / Categoria</label>

                <p className={styles.wizardHint}>
                  {form.grupo
                    ? `IA sugeriu "${form.grupo}" — confirme ou altere abaixo.`
                    : 'Selecione o grupo do plano de contas:'}
                </p>

                <div className={styles.listbox}>
                  {grupos.filter(g => g.tipo === form.tipo).map(g => (
                    <button
                      key={g.id}
                      className={`${styles.listboxItem} ${form.grupo === g.nome ? styles.listboxItemSelected : ''}`}
                      onClick={() => setForm(p => ({ ...p, grupo: g.nome }))}
                    >
                      <span className={styles.listboxRadio}>{form.grupo === g.nome ? '●' : '○'}</span>
                      {g.nome}
                    </button>
                  ))}
                </div>

                <div className={styles.summary}>
                  <div className={styles.summaryRow}><span>Data</span><strong>{new Date(form.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong></div>
                  <div className={styles.summaryRow}><span>Descrição</span><strong>{form.descricao}</strong></div>
                  <div className={styles.summaryRow}><span>Valor</span><strong>{moeda(valorNumerico)}</strong></div>
                  <div className={styles.summaryRow}><span>Classificação</span><strong>{form.classificacaoNome}</strong></div>
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <button
                  className={styles.submit}
                  disabled={saving || !form.grupo.trim()}
                  onClick={salvar}
                >
                  {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar lançamento'}
                </button>
                <button className={styles.backBtn} onClick={() => setStep(5)}>← Voltar</button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Modal: excluir período ── */}
      {showDeletePeriodo && (
        <div className={styles.modalOverlay} onClick={() => !deletingPeriodo && setShowDeletePeriodo(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Excluir período</h2>
              <button className={styles.closeBtn} onClick={() => setShowDeletePeriodo(false)} disabled={deletingPeriodo}>✕</button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>
              Você está prestes a excluir permanentemente:
            </p>

            <div className={styles.deletePeriodoInfo}>
              <span className={styles.deletePeriodoCount}>{idsPeriodoSelecionado.length}</span>
              <span className={styles.deletePeriodoDesc}>
                lançamento{idsPeriodoSelecionado.length !== 1 ? 's' : ''} de{' '}
                <strong>{labelPeriodo}</strong>
              </span>
            </div>

            {idsPeriodoSelecionado.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', margin: '16px 0' }}>
                Nenhum lançamento encontrado neste período.
              </p>
            ) : (
              <p style={{ color: '#ff9f9f', fontSize: 13, marginBottom: 24 }}>
                ⚠ Esta ação não pode ser desfeita.
              </p>
            )}

            <div className={styles.deletePeriodoBtns}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowDeletePeriodo(false)}
                disabled={deletingPeriodo}
              >
                Cancelar
              </button>
              <button
                className={styles.deletePeriodoConfirmBtn}
                onClick={excluirLancamentosPeriodo}
                disabled={deletingPeriodo || idsPeriodoSelecionado.length === 0}
              >
                {deletingPeriodo ? 'Excluindo…' : `Excluir ${idsPeriodoSelecionado.length} lançamento${idsPeriodoSelecionado.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
