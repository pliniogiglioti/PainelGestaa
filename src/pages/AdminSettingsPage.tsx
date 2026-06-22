import { useEffect, useMemo, useRef, useState } from 'react'
import { read, utils } from 'xlsx'
import styles from './AdminSettingsPage.module.css'
import { supabase } from '../lib/supabase'
import { getFunctionErrorMessage } from '../lib/functionError'
import type { App, DreClassificacao, DreGrupo, Empresa, EmpresaMembro, ExemploUpload, Profile } from '../lib/types'
import ModalTransition from '../components/ModalTransition'

// ── Constantes ────────────────────────────────────────────────────────────

const OPENAI_MODELS_FALLBACK = [
  { value: 'gpt-4o-mini',       label: 'GPT-4o Mini (Recomendado)' },
  { value: 'gpt-4o',            label: 'GPT-4o' },
  { value: 'gpt-4-turbo',       label: 'GPT-4 Turbo' },
  { value: 'gpt-4',             label: 'GPT-4' },
  { value: 'gpt-3.5-turbo',     label: 'GPT-3.5 Turbo' },
  { value: 'gpt-3.5-turbo-16k', label: 'GPT-3.5 Turbo 16K' },
  { value: 'o1-mini',           label: 'O1 Mini' },
  { value: 'o1-preview',        label: 'O1 Preview' },
  { value: 'o3-mini',           label: 'O3 Mini' },
]

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

const EXEMPLOS_ESTATICOS = [
  { nome: 'Exemplo Básico', arquivo: 'exemplo.xlsx'    },
  { nome: 'Conta Azul',     arquivo: 'conta-azul.xlsx' },
  { nome: 'CliniCorp',      arquivo: 'clinicorp.xlsx'  },
]

const USERS_PER_PAGE = 5

// Mapeamento classificação → grupo — espelha FALLBACK_RULES de dre-ai-classify
const CLASS_GRUPO_MAP: Record<string, string> = {
  // ── nomes antigos do seed inicial (ainda podem existir no banco) ──
  'Receita sobre Serviço':        'Receitas Operacionais',
  'Receita de Produtos':          'Receitas Operacionais',
  'Receita Financeira':           'Receitas Financeiras',
  'Outras Receitas':              'Receitas Operacionais',
  'Despesa com Pessoal':          'Despesas com Pessoal',
  'Despesa com Fornecedor':       'Despesas Operacionais',
  'Despesa com Aluguel':          'Despesas Administrativas',
  'Despesa com Marketing':        'Despesas Comerciais e Marketing',
  'Despesa com Impostos':         'Impostos sobre Faturamento',
  'Despesa com Infraestrutura':   'Despesas Administrativas',
  // Receitas Operacionais
  'Receita Dinheiro':                                                      'Receitas Operacionais',
  'Receita Cartão':                                                        'Receitas Operacionais',
  'Receita Financeiras':                                                   'Receitas Operacionais',
  'Receita PIX / Transferências':                                          'Receitas Operacionais',
  'Receita Subadquirência (BT)':                                           'Receitas Operacionais',
  // Receitas Financeiras
  'Rendimento de Aplicação Financeira':                                    'Receitas Financeiras',
  'Descontos Obtidos':                                                     'Receitas Financeiras',
  // Deduções de Receita
  'Vendas Canceladas / Devoluções':                                        'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas': 'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Antecipação':                   'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Padrão':                        'Deduções de Receita',
  'Tarifa de Cartão / Aluguel de POS':                                     'Deduções de Receita',
  'Tarifa de Cartão / Antecipação':                                        'Deduções de Receita',
  'Tarifa de Cartão / Padrão':                                             'Deduções de Receita',
  // Impostos sobre Faturamento
  'Impostos sobre Receitas - Presumido e Simples Nacional':                'Impostos sobre Faturamento',
  'Impostos sobre Receitas - Simples Nacional':                            'Impostos sobre Faturamento',
  'Impostos sobre Receitas - Lucro Presumido':                             'Impostos sobre Faturamento',
  // Despesas Operacionais
  'OP Gratificações':                                                      'Despesas Operacionais',
  'Custo de Materiais e Insumos':                                          'Despesas Operacionais',
  'Serviços Terceiros PF (dentistas)':                                     'Despesas Operacionais',
  'Serviços Técnicos para Laboratórios':                                   'Despesas Operacionais',
  'Royalties':                                                             'Despesas Operacionais',
  'Royalties e Assistência Técnica':                                       'Despesas Operacionais',
  'Fundo Nacional de Marketing':                                           'Despesas Operacionais',
  // Despesas com Pessoal
  'Pró-labore':                                                            'Despesas com Pessoal',
  'Salários e Ordenados':                                                  'Despesas com Pessoal',
  '13° Salário':                                                           'Despesas com Pessoal',
  'Rescisões':                                                             'Despesas com Pessoal',
  'INSS':                                                                  'Despesas com Pessoal',
  'FGTS':                                                                  'Despesas com Pessoal',
  'Outras Despesas Com Funcionários':                                      'Despesas com Pessoal',
  'Vale Transporte':                                                       'Despesas com Pessoal',
  'Vale Refeição':                                                         'Despesas com Pessoal',
  'Combustível':                                                           'Despesas com Pessoal',
  // Despesas Administrativas
  'Adiantamento a Fornecedor':                                             'Despesas Administrativas',
  'Energia Elétrica':                                                      'Despesas Administrativas',
  'Água e Esgoto':                                                         'Despesas Administrativas',
  'Aluguel':                                                               'Despesas Administrativas',
  'Manutenção e Conservação Predial':                                      'Despesas Administrativas',
  'Telefonia':                                                             'Despesas Administrativas',
  'Uniformes':                                                             'Despesas Administrativas',
  'Manutenção e Reparos':                                                  'Despesas Administrativas',
  'Seguros':                                                               'Despesas Administrativas',
  'Uber e Táxi':                                                           'Despesas Administrativas',
  'Copa e Cozinha':                                                        'Despesas Administrativas',
  'Cartórios':                                                             'Despesas Administrativas',
  'Viagens e Estadias':                                                    'Despesas Administrativas',
  'Material de Escritório':                                                'Despesas Administrativas',
  'Estacionamento':                                                        'Despesas Administrativas',
  'Material de Limpeza':                                                   'Despesas Administrativas',
  'Bens de Pequeno Valor':                                                 'Despesas Administrativas',
  'Custas Processuais':                                                    'Despesas Administrativas',
  'Outras Despesas':                                                       'Despesas Administrativas',
  'Consultoria':                                                           'Despesas Administrativas',
  'Contabilidade':                                                         'Despesas Administrativas',
  'Jurídico':                                                              'Despesas Administrativas',
  'Limpeza':                                                               'Despesas Administrativas',
  'Segurança e Vigilância':                                                'Despesas Administrativas',
  'Serviço de Motoboy':                                                    'Despesas Administrativas',
  'IOF':                                                                   'Despesas Administrativas',
  'Taxas e Emolumentos':                                                   'Despesas Administrativas',
  'Multa e Juros s/ Contas Pagas em Atraso':                               'Despesas Administrativas',
  'Exames Ocupacionais':                                                   'Despesas Administrativas',
  // Despesas Comerciais e Marketing
  'Refeições e Lanches':                                                   'Despesas Comerciais e Marketing',
  'Outras Despesas com Vendas':                                            'Despesas Comerciais e Marketing',
  'Agência e Assessoria':                                                  'Despesas Comerciais e Marketing',
  'Produção de Material':                                                  'Despesas Comerciais e Marketing',
  'Marketing Digital':                                                     'Despesas Comerciais e Marketing',
  'Feiras e Eventos':                                                      'Despesas Comerciais e Marketing',
  // Despesas com TI
  'Internet':                                                              'Despesas com TI',
  'Informática e Software':                                                'Despesas com TI',
  'Hospedagem de Dados':                                                   'Despesas com TI',
  'Sistema de Gestão':                                                     'Despesas com TI',
  // Despesas Financeiras
  'Despesas Bancárias':                                                    'Despesas Financeiras',
  'Depreciação e Amortização':                                             'Despesas Financeiras',
  'Juros Passivos':                                                        'Despesas Financeiras',
  'Financiamentos / Empréstimos':                                          'Despesas Financeiras',
  // Investimentos
  'Investimento - Máquinas e Equipamentos':                                'Investimentos',
  'Investimento - Computadores e Periféricos':                             'Investimentos',
  'Investimento - Móveis e Utensílios':                                    'Investimentos',
  'Investimento - Instalações de Terceiros':                               'Investimentos',
  'Dividendos e Despesas dos Sócios':                                      'Investimentos',
}

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizeAiLookupValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CLASS_GRUPO_MAP_AI_NORMALIZED = new Map<string, string>(
  Object.entries(CLASS_GRUPO_MAP).map(([classificacao, grupo]) => [
    normalizeAiLookupValue(classificacao),
    grupo,
  ]),
)

function resolveGrupoAi(nome: string) {
  const exact = CLASS_GRUPO_MAP[nome]
  if (exact) return exact

  const normalized = normalizeAiLookupValue(nome)
  const normalizedExact = CLASS_GRUPO_MAP_AI_NORMALIZED.get(normalized)
  if (normalizedExact) return normalizedExact

  for (const [classificacao, grupo] of Object.entries(CLASS_GRUPO_MAP)) {
    const canonical = normalizeAiLookupValue(classificacao)
    if (normalized.includes(canonical) || canonical.includes(normalized)) return grupo
  }

  return ''
}

async function lerCabecalhosArquivo(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const wb = read(buffer, { type: 'array' })
  if (!wb.SheetNames.length) return []
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) return []
  const headerIdx = rows.findIndex(r =>
    (r as unknown[]).filter(c => String(c ?? '').trim()).length >= 2,
  )
  if (headerIdx < 0) return []
  return (rows[headerIdx] as unknown[])
    .map(h =>
      String(h ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
    )
    .filter(Boolean)
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

// ── Tipos locais ──────────────────────────────────────────────────────────

type Tab = 'modelo' | 'classificacoes' | 'exemplos' | 'usuarios'

interface AdminUsuario extends Profile {
  empresasAcesso: string[]
  titularesResponsaveis: string[]
}

type AdminAppOption = Pick<App, 'id' | 'name' | 'internal_link' | 'external_link'>

function arraysIguais(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function normalizarSelecaoApps(appAccessIds: string[] | null | undefined, allAppIds: string[]) {
  if (appAccessIds == null) return allAppIds
  return allAppIds.filter(id => appAccessIds.includes(id))
}

function toggleAppSelection(current: string[], appId: string, allAppIds: string[]) {
  const next = current.includes(appId)
    ? current.filter(id => id !== appId)
    : [...current, appId]

  return allAppIds.filter(id => next.includes(id))
}

// ── Componente principal ──────────────────────────────────────────────────

interface AdminSettingsPageProps {
  onVoltar: () => void
}

export default function AdminSettingsPage({ onVoltar }: AdminSettingsPageProps) {
  const [tab, setTab] = useState<Tab>('modelo')

  // ── Tab: Modelo IA ────────────────────────────────────────────────────
  const [openaiModels,  setOpenaiModels]  = useState(OPENAI_MODELS_FALLBACK)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modeloAtual,   setModeloAtual]   = useState(DEFAULT_OPENAI_MODEL)
  const [savingModelo,  setSavingModelo]  = useState(false)
  const [savedModelo,   setSavedModelo]   = useState(false)

  // ── Tab: Classificações DRE ───────────────────────────────────────────
  const [classificacoes, setClassificacoes] = useState<DreClassificacao[]>([])
  const [novaClassNome,  setNovaClassNome]  = useState('')
  const [novaClassTipo,  setNovaClassTipo]  = useState<'receita' | 'despesa'>('despesa')
  const [novaClassGrupo, setNovaClassGrupo] = useState('')
  const [addingClass,    setAddingClass]    = useState(false)
  // Mapeamento do banco (classificacao → grupo) via dre_lancamentos
  const [classGrupoDB,   setClassGrupoDB]   = useState<Record<string, string>>({})
  // Mapeamento persistido: cobre classificações novas que não estão no CLASS_GRUPO_MAP
  const [classGrupoExtra, setClassGrupoExtra] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('dre-class-grupo-extra') ?? '{}') } catch { return {} }
  })
  // Edição de classificação
  const [editingClass,    setEditingClass]    = useState<(DreClassificacao & { grupo?: { nome: string } | null }) | null>(null)
  const [editClassForm,   setEditClassForm]   = useState<{ nome: string; tipo: 'receita' | 'despesa'; grupoId: string }>({ nome: '', tipo: 'despesa', grupoId: '' })
  const [savingEditClass, setSavingEditClass] = useState(false)
  const [editClassError,  setEditClassError]  = useState('')
  // Edição de grupo
  const [editingGrupo,    setEditingGrupo]    = useState<DreGrupo | null>(null)
  const [editGrupoNome,   setEditGrupoNome]   = useState('')
  const [savingEditGrupo, setSavingEditGrupo] = useState(false)
  const [editGrupoError,  setEditGrupoError]  = useState('')

  // ── Tab: Grupos DRE ───────────────────────────────────────────────────
  const [grupos,        setGrupos]        = useState<DreGrupo[]>([])
  const [novoGrupoNome, setNovoGrupoNome] = useState('')
  const [novoGrupoTipo, setNovoGrupoTipo] = useState<'receita' | 'despesa'>('despesa')
  const [addingGrupo,   setAddingGrupo]   = useState(false)

  // ── Tab: Exemplos de Upload ───────────────────────────────────────────
  const [exemplos,        setExemplos]        = useState<ExemploUpload[]>([])
  const [exemplosLoading, setExemplosLoading] = useState(false)
  const [novoExNome,      setNovoExNome]      = useState('')
  const [novoExArquivo,   setNovoExArquivo]   = useState('')
  const [novoExFile,      setNovoExFile]      = useState<File | null>(null)
  const [addingEx,        setAddingEx]        = useState(false)
  const [exErro,          setExErro]          = useState('')
  const exFileRef = useRef<HTMLInputElement>(null)

  // ── Tab: Usuarios ─────────────────────────────────────────────────────
  const [usuarios,        setUsuarios]        = useState<AdminUsuario[]>([])
  const [usuariosLoading, setUsuariosLoading] = useState(false)
  const [showAddUser,     setShowAddUser]     = useState(false)
  const [novoEmail,       setNovoEmail]       = useState('')
  const [novoExpires,     setNovoExpires]     = useState('')
  const [addingUser,      setAddingUser]      = useState(false)
  const [addUserErro,     setAddUserErro]     = useState('')
  const [addUserOk,       setAddUserOk]       = useState('')
  const [savingUserId,    setSavingUserId]    = useState<string | null>(null)
  const [expiresDrafts,   setExpiresDrafts]   = useState<Record<string, string>>({})
  const [savingExpiryId,  setSavingExpiryId]  = useState<string | null>(null)
  const [confirmDelete,   setConfirmDelete]   = useState<Profile | null>(null)
  const [deleteCheck,     setDeleteCheck]     = useState(false)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [deleteErro,      setDeleteErro]      = useState('')
  const [savingRoleId,    setSavingRoleId]    = useState<string | null>(null)
  const [currentUserId,   setCurrentUserId]   = useState<string | null>(null)
  const [usuariosBusca,   setUsuariosBusca]   = useState('')
  const [usuariosPagina,  setUsuariosPagina]  = useState(1)
  const [appsDisponiveis, setAppsDisponiveis] = useState<AdminAppOption[]>([])
  const [appsLoading,     setAppsLoading]     = useState(false)
  const [appAccessDrafts, setAppAccessDrafts] = useState<Record<string, string[]>>({})
  const [savingAppId,     setSavingAppId]     = useState<string | null>(null)

  // ── Fetch: Modelo IA ──────────────────────────────────────────────────

  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true)
      const { data, error } = await supabase.functions.invoke('openai-models', { method: 'GET' })
      if (!error && Array.isArray(data?.models) && data.models.length > 0) {
        setOpenaiModels(data.models.map((m: string) => ({ value: m, label: m })))
      }
      setModelsLoading(false)
    }
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
    }
    fetchModels()
    fetchClassificacoes()
    fetchGrupos()
    fetchClassGrupoDB()
    fetchExemplos()
    fetchUsuarios()
    fetchAppsDisponiveis()
    fetchCurrentUser()
  }, [])

  useEffect(() => {
    supabase.from('configuracoes').select('valor').eq('chave', 'modelo_openai').single()
      .then(({ data }) => {
        if (!data) return
        const existe = openaiModels.some(m => m.value === data.valor)
        if (existe) { setModeloAtual(data.valor); return }
        if (data.valor) {
          setOpenaiModels(p => [...p, { value: data.valor, label: `${data.valor} (configurado)` }])
          setModeloAtual(data.valor)
          return
        }
        setModeloAtual(DEFAULT_OPENAI_MODEL)
      })
  }, [openaiModels])

  const salvarModelo = async () => {
    setSavingModelo(true)
    await supabase.from('configuracoes').upsert({ chave: 'modelo_openai', valor: modeloAtual })
    setSavingModelo(false)
    setSavedModelo(true)
    setTimeout(() => setSavedModelo(false), 2000)
  }

  // ── Fetch: Classificações ─────────────────────────────────────────────

  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('dre_classificacoes')
      .select('*, grupo:dre_grupos!grupo_id(nome)')
      .order('tipo')
      .order('nome')
    setClassificacoes((data ?? []) as DreClassificacao[])
  }

  const fetchClassGrupoDB = async () => {
    const { data } = await supabase
      .from('dre_lancamentos')
      .select('classificacao, grupo')
      .not('classificacao', 'is', null)
      .not('grupo', 'is', null)
      .neq('classificacao', '')
      .neq('grupo', '')
    if (data) {
      const map: Record<string, string> = {}
      data.forEach((row: { classificacao: string; grupo: string }) => {
        if (row.classificacao && row.grupo) map[row.classificacao] = row.grupo
      })
      setClassGrupoDB(map)
    }
  }

  const adicionarClassificacao = async () => {
    if (!novaClassNome.trim()) return
    setAddingClass(true)
    const nome = novaClassNome.trim()
    const grupoSelecionado = grupos.find(g => g.nome === novaClassGrupo)
    await supabase.from('dre_classificacoes').insert({
      nome, tipo: novaClassTipo, ativo: true,
      grupo_id: grupoSelecionado?.id ?? null,
    })
    if (novaClassGrupo) {
      setClassGrupoExtra(prev => {
        const next = { ...prev, [nome]: novaClassGrupo }
        localStorage.setItem('dre-class-grupo-extra', JSON.stringify(next))
        return next
      })
    }
    setNovaClassNome('')
    await fetchClassificacoes()
    setAddingClass(false)
  }

  const removerClassificacao = async (id: string) => {
    await supabase.from('dre_classificacoes').delete().eq('id', id)
    setClassificacoes(p => p.filter(c => c.id !== id))
  }

  const abrirEdicaoClassificacao = (c: DreClassificacao & { grupo?: { nome: string } | null }) => {
    setEditingClass(c)
    setEditClassForm({ nome: c.nome, tipo: c.tipo, grupoId: c.grupo_id ?? '' })
    setEditClassError('')
  }

  const salvarEdicaoClassificacao = async () => {
    if (!editingClass || !editClassForm.nome.trim()) return
    setSavingEditClass(true)
    setEditClassError('')

    const nomeAntigo = editingClass.nome
    const nomeNovo   = editClassForm.nome.trim()
    const grupoNovo  = grupos.find(g => g.id === editClassForm.grupoId)

    const { error } = await supabase
      .from('dre_classificacoes')
      .update({ nome: nomeNovo, tipo: editClassForm.tipo, grupo_id: editClassForm.grupoId || null })
      .eq('id', editingClass.id)

    if (error) { setEditClassError(error.message); setSavingEditClass(false); return }

    if (nomeAntigo !== nomeNovo) {
      await supabase.from('dre_lancamentos').update({ classificacao: nomeNovo }).eq('classificacao', nomeAntigo)
    }

    if (grupoNovo) {
      await supabase.from('dre_lancamentos').update({ grupo: grupoNovo.nome }).eq('classificacao', nomeNovo)
    }

    setEditingClass(null)
    setSavingEditClass(false)
    await fetchClassificacoes()
  }

  const abrirEdicaoGrupo = (g: DreGrupo) => {
    setEditingGrupo(g)
    setEditGrupoNome(g.nome)
    setEditGrupoError('')
  }

  const salvarEdicaoGrupo = async () => {
    if (!editingGrupo || !editGrupoNome.trim()) return
    setSavingEditGrupo(true)
    setEditGrupoError('')

    const { error } = await supabase
      .from('dre_grupos')
      .update({ nome: editGrupoNome.trim() })
      .eq('id', editingGrupo.id)
    // O trigger trg_propagate_grupo_rename cascateia automaticamente para dre_lancamentos.grupo

    if (error) { setEditGrupoError(error.message); setSavingEditGrupo(false); return }

    setEditingGrupo(null)
    setSavingEditGrupo(false)
    await fetchGrupos()
    await fetchClassificacoes()
  }

  // ── Fetch: Grupos ─────────────────────────────────────────────────────

  const fetchGrupos = async () => {
    const { data } = await supabase
      .from('dre_grupos')
      .select('*')
      .order('tipo')
      .order('nome')
    setGrupos(data ?? [])
  }

  const adicionarGrupo = async () => {
    if (!novoGrupoNome.trim()) return
    setAddingGrupo(true)
    await supabase.from('dre_grupos').insert({ nome: novoGrupoNome.trim(), tipo: novoGrupoTipo, ativo: true })
    setNovoGrupoNome('')
    await fetchGrupos()
    setAddingGrupo(false)
  }

  const removerGrupo = async (id: string) => {
    await supabase.from('dre_grupos').delete().eq('id', id)
    setGrupos(p => p.filter(g => g.id !== id))
  }

  // ── Fetch: Exemplos ───────────────────────────────────────────────────

  const fetchExemplos = async () => {
    setExemplosLoading(true)
    const { data } = await supabase.from('exemplos_upload').select('*').order('created_at')
    const lista = data ?? []

    const nomesExistentes = new Set(lista.map(e => e.nome))
    const faltantes = EXEMPLOS_ESTATICOS.filter(ex => !nomesExistentes.has(ex.nome))
    if (faltantes.length > 0) {
      for (const ex of faltantes) {
        try {
          const res = await fetch(`/exemplos/${ex.arquivo}`)
          if (!res.ok) continue
          const buffer = await res.arrayBuffer()
          const wb = read(buffer, { type: 'array' })
          if (!wb.SheetNames.length) continue
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })
          const headerIdx = rows.findIndex(r =>
            (r as unknown[]).filter(c => String(c ?? '').trim()).length >= 2,
          )
          if (headerIdx < 0) continue
          const cabecalhos = (rows[headerIdx] as unknown[])
            .map(h =>
              String(h ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
            )
            .filter(Boolean)
          await supabase.from('exemplos_upload').insert({ nome: ex.nome, arquivo: ex.arquivo, cabecalhos })
        } catch { /* ignora erros de seed */ }
      }
      const { data: seeded } = await supabase.from('exemplos_upload').select('*').order('created_at')
      setExemplos(seeded ?? [])
    } else {
      setExemplos(lista)
    }
    setExemplosLoading(false)
  }

  const adicionarExemplo = async () => {
    setExErro('')
    if (!novoExNome.trim()) { setExErro('Informe um nome para o modelo.'); return }
    if (!novoExFile)        { setExErro('Selecione um arquivo .xlsx ou .csv.'); return }

    setAddingEx(true)
    try {
      const cabecalhos = await lerCabecalhosArquivo(novoExFile)
      if (cabecalhos.length === 0) {
        setExErro('Não foi possível ler os cabeçalhos do arquivo.')
        setAddingEx(false)
        return
      }
      const arquivo = novoExArquivo.trim() || null
      const { error } = await supabase.from('exemplos_upload').insert({ nome: novoExNome.trim(), arquivo, cabecalhos })
      if (error) { setExErro(error.message); setAddingEx(false); return }
      setNovoExNome('')
      setNovoExArquivo('')
      setNovoExFile(null)
      if (exFileRef.current) exFileRef.current.value = ''
      await fetchExemplos()
    } catch (e) {
      setExErro(e instanceof Error ? e.message : 'Erro ao adicionar exemplo.')
    }
    setAddingEx(false)
  }

  const removerExemplo = async (id: string) => {
    await supabase.from('exemplos_upload').delete().eq('id', id)
    setExemplos(p => p.filter(e => e.id !== id))
  }

  const fetchAppsDisponiveis = async () => {
    setAppsLoading(true)
    const { data } = await supabase
      .from('apps')
      .select('id, name, internal_link, external_link')
      .order('name')

    setAppsDisponiveis((data ?? []) as AdminAppOption[])
    setAppsLoading(false)
  }

  // ── Fetch: Usuários ───────────────────────────────────────────────────

  const fetchUsuarios = async () => {
    setUsuariosLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, tipo_usuario, ativo, expires_at, app_access_ids, created_at, updated_at, plan, avatar_url')
      .order('created_at', { ascending: false })

    const perfis = (data ?? []) as Profile[]

    const { data: membrosData } = await supabase
      .from('empresa_membros')
      .select('user_id, role, empresa_id')

    const membros = (membrosData ?? []) as Pick<EmpresaMembro, 'user_id' | 'role' | 'empresa_id'>[]

    const empresaIds = [...new Set(membros.map(item => item.empresa_id))]

    let empresasMap = new Map<string, Pick<Empresa, 'id' | 'nome' | 'created_by'>>()

    if (empresaIds.length > 0) {
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('id, nome, created_by')
        .in('id', empresaIds)

      empresasMap = new Map(
        ((empresasData ?? []) as Pick<Empresa, 'id' | 'nome' | 'created_by'>[]).map(empresa => [empresa.id, empresa]),
      )
    }

    const titularIds = [...new Set(
      membros
        .map(item => empresasMap.get(item.empresa_id)?.created_by)
        .filter((id): id is string => !!id),
    )]

    let titularesMap: Record<string, string> = {}

    if (titularIds.length > 0) {
      const { data: titulares } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', titularIds)

      titularesMap = Object.fromEntries(
        ((titulares ?? []) as Pick<Profile, 'id' | 'name' | 'email'>[]).map(titular => [
          titular.id,
          titular.name?.trim() || titular.email?.trim() || 'Titular',
        ]),
      )
    }

    const vinculosPorUsuario = new Map<string, { empresasAcesso: string[]; titularesResponsaveis: string[] }>()

    membros.forEach(item => {
      const atual = vinculosPorUsuario.get(item.user_id) ?? { empresasAcesso: [], titularesResponsaveis: [] }
      const empresa = empresasMap.get(item.empresa_id)
      const nomeEmpresa = empresa?.nome?.trim()
      const titularResponsavel = empresa?.created_by ? titularesMap[empresa.created_by] : null

      if (nomeEmpresa && !atual.empresasAcesso.includes(nomeEmpresa)) {
        atual.empresasAcesso.push(nomeEmpresa)
      }

      if (item.role === 'membro' && titularResponsavel && !atual.titularesResponsaveis.includes(titularResponsavel)) {
        atual.titularesResponsaveis.push(titularResponsavel)
      }

      vinculosPorUsuario.set(item.user_id, atual)
    })

    setUsuarios(perfis.map(profile => {
      const vinculos = vinculosPorUsuario.get(profile.id)
      return {
        ...profile,
        empresasAcesso: vinculos?.empresasAcesso ?? [],
        titularesResponsaveis: vinculos?.titularesResponsaveis ?? [],
      }
    }))
    setUsuariosLoading(false)
  }

  useEffect(() => {
    setExpiresDrafts(Object.fromEntries(usuarios.map(usuario => [usuario.id, toDateInputValue(usuario.expires_at)])))
  }, [usuarios])

  useEffect(() => {
    const allAppIds = appsDisponiveis.map(app => app.id)
    setAppAccessDrafts(
      Object.fromEntries(
        usuarios.map(usuario => [
          usuario.id,
          normalizarSelecaoApps(usuario.app_access_ids, allAppIds),
        ]),
      ),
    )
  }, [appsDisponiveis, usuarios])

  const getAppsLiberadosTexto = (usuario: AdminUsuario) => {
    if (usuario.role === 'admin') return 'Todos os apps (admin)'
    if (usuario.app_access_ids == null) return 'Todos os apps'

    const nomes = appsDisponiveis
      .filter(app => usuario.app_access_ids?.includes(app.id))
      .map(app => app.name)

    return nomes.length > 0 ? nomes.join(', ') : 'Nenhum app liberado'
  }

  const getAppsLiberadosResumo = (usuario: AdminUsuario) => {
    if (usuario.role === 'admin' || usuario.app_access_ids == null) {
      return `Todos os ${appsDisponiveis.length} apps liberados`
    }

    if (usuario.app_access_ids.length === 0) {
      return 'Nenhum app liberado'
    }

    return `${usuario.app_access_ids.length} de ${appsDisponiveis.length} apps liberados`
  }

  const roleOrder: Record<string, number> = { admin: 0, editor: 1, user: 2 }

  const usuariosOrdenados = useMemo(
    () => [...usuarios].sort((a, b) => {
      const diff = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99)
      if (diff !== 0) return diff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }),
    [usuarios],
  )

  const buscaUsuariosNormalizada = usuariosBusca.trim().toLocaleLowerCase('pt-BR')

  const usuariosFiltrados = useMemo(() => {
    if (!buscaUsuariosNormalizada) return usuariosOrdenados

    return usuariosOrdenados.filter(usuario => {
      const textoBusca = [
        usuario.name ?? '',
        usuario.email ?? '',
        usuario.role,
        usuario.tipo_usuario,
        usuario.empresasAcesso.join(' '),
        usuario.titularesResponsaveis.join(' '),
        getAppsLiberadosTexto(usuario),
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR')

      return textoBusca.includes(buscaUsuariosNormalizada)
    })
  }, [appsDisponiveis, buscaUsuariosNormalizada, usuariosOrdenados])

  const totalPaginasUsuarios = Math.max(1, Math.ceil(usuariosFiltrados.length / USERS_PER_PAGE))

  const usuariosPaginados = useMemo(() => {
    const inicio = (usuariosPagina - 1) * USERS_PER_PAGE
    return usuariosFiltrados.slice(inicio, inicio + USERS_PER_PAGE)
  }, [usuariosFiltrados, usuariosPagina])

  useEffect(() => {
    setUsuariosPagina(1)
  }, [buscaUsuariosNormalizada])

  useEffect(() => {
    setUsuariosPagina(atual => Math.min(atual, totalPaginasUsuarios))
  }, [totalPaginasUsuarios])

  const alternarStatusUsuario = async (usuario: Profile) => {
    if (usuario.role === 'admin') return

    const proximoStatus = !(usuario.ativo ?? true)
    setSavingUserId(usuario.id)

    const { error } = await supabase
      .from('profiles')
      .update({ ativo: proximoStatus })
      .eq('id', usuario.id)

    if (!error) {
      setUsuarios(atual => atual.map(item => (
        item.id === usuario.id ? { ...item, ativo: proximoStatus } : item
      )))
    }

    setSavingUserId(null)
  }


  const salvarExpiracaoUsuario = async (usuario: Profile) => {
    if (usuario.role === 'admin') return

    const expires_at = expiresDrafts[usuario.id]
      ? new Date(`${expiresDrafts[usuario.id]}T00:00:00.000Z`).toISOString()
      : null

    setSavingExpiryId(usuario.id)

    const { error } = await supabase
      .from('profiles')
      .update({ expires_at })
      .eq('id', usuario.id)

    if (!error) {
      setUsuarios(atual => atual.map(item => (
        item.id === usuario.id ? { ...item, expires_at } : item
      )))
    }

    setSavingExpiryId(null)
  }

  const hasAlteracaoExpiracao = (usuario: Profile) => (
    (expiresDrafts[usuario.id] ?? '') !== toDateInputValue(usuario.expires_at)
  )

  const alterarFuncaoUsuario = async (usuario: Profile, novaFuncao: string) => {
    if (usuario.id === currentUserId) return
    if (novaFuncao === usuario.role) return
    setSavingRoleId(usuario.id)

    const { error } = await supabase
      .from('profiles')
      .update({ role: novaFuncao })
      .eq('id', usuario.id)

    if (!error) {
      setUsuarios(atual => atual.map(item => (
        item.id === usuario.id ? { ...item, role: novaFuncao } : item
      )))
    }

    setSavingRoleId(null)
  }

  const salvarAppsUsuario = async (usuario: AdminUsuario) => {
    if (usuario.role === 'admin') return

    const allAppIds = appsDisponiveis.map(app => app.id)
    const selecionados = normalizarSelecaoApps(appAccessDrafts[usuario.id] ?? [], allAppIds)
    const app_access_ids = selecionados.length === allAppIds.length ? null : selecionados

    setSavingAppId(usuario.id)

    const { error } = await supabase
      .from('profiles')
      .update({
        app_access_ids,
        updated_at: new Date().toISOString(),
      })
      .eq('id', usuario.id)

    if (!error) {
      setUsuarios(atual => atual.map(item => (
        item.id === usuario.id ? { ...item, app_access_ids } : item
      )))
    }

    setSavingAppId(null)
  }

  const getAppIdsDisponiveis = () => appsDisponiveis.map(app => app.id)

  const getAppIdsSelecionados = (usuario: AdminUsuario) => (
    appAccessDrafts[usuario.id] ?? normalizarSelecaoApps(usuario.app_access_ids, getAppIdsDisponiveis())
  )

  const hasAlteracaoApps = (usuario: AdminUsuario) => (
    !arraysIguais(
      getAppIdsSelecionados(usuario),
      normalizarSelecaoApps(usuario.app_access_ids, getAppIdsDisponiveis()),
    )
  )

  const deletarUsuario = async (usuario: Profile) => {
    setDeletingId(usuario.id)
    setDeleteErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: usuario.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error || data?.error) {
        setDeleteErro(data?.error ?? await getFunctionErrorMessage(error, 'Erro ao deletar usuário.'))
        setDeletingId(null)
        return
      }
      setUsuarios(atual => atual.filter(u => u.id !== usuario.id))
      setConfirmDelete(null)
      setDeleteCheck(false)
    } catch (e) {
      setDeleteErro(e instanceof Error ? e.message : 'Erro ao deletar usuário.')
    }
    setDeletingId(null)
  }

  const enviarConvite = async () => {
    setAddUserErro('')
    setAddUserOk('')
    if (!novoEmail.trim()) { setAddUserErro('Informe o e-mail do usuário.'); return }

    setAddingUser(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: novoEmail.trim(),
          expires_at: novoExpires ? new Date(novoExpires).toISOString() : null,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })

      if (error || data?.error) {
        setAddUserErro(data?.error ?? await getFunctionErrorMessage(error, 'Erro ao enviar convite.'))
      } else {
        setAddUserOk(`Convite enviado para ${novoEmail.trim()}!`)
        setNovoEmail('')
        setNovoExpires('')
        setShowAddUser(false)
        await fetchUsuarios()
      }
    } catch (e) {
      setAddUserErro(e instanceof Error ? e.message : 'Erro ao enviar convite.')
    }
    setAddingUser(false)
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Cabeçalho */}
      <div className={styles.pageHeader}>
        <button className={styles.backBtn} onClick={onVoltar}>
          ← Voltar
        </button>
        <h1 className={styles.pageTitle}>Configurações Admin</h1>
      </div>

      {/* Abas */}
      <div className={styles.tabs}>
        {([
          { key: 'modelo',         label: 'Modelo IA'         },
          { key: 'classificacoes', label: 'Classificações DFC' },
          { key: 'exemplos',       label: 'Exemplos de Upload' },
          { key: 'usuarios',       label: 'Usuários'           },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>

        {/* ── Modelo IA ─────────────────────────────────────────────────── */}
        {tab === 'modelo' && (
          <div className={styles.section}>
            <div className={styles.field}>
              <label className={styles.label}>Modelo OpenAI</label>
              <select
                className={styles.input}
                value={modeloAtual}
                onChange={e => setModeloAtual(e.target.value)}
              >
                {openaiModels.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className={styles.hint}>
                Modelo usado para sugerir a classificação automática nos lançamentos do DFC.
              </p>
              {modelsLoading && <p className={styles.hint}>Atualizando catálogo de modelos disponíveis...</p>}
            </div>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={salvarModelo} disabled={savingModelo}>
                {savingModelo ? 'Salvando...' : savedModelo ? 'Salvo ✓' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* ── Classificações DRE ────────────────────────────────────────── */}
        {tab === 'classificacoes' && (() => {
          const gruposValidos = new Set(grupos.map(g => g.nome))

          // Mapa direto via FK (grupo_id) — fonte mais confiável
          const classGrupoFK: Record<string, string> = {}
          for (const c of classificacoes) {
            const g = (c as DreClassificacao & { grupo?: { nome: string } | null }).grupo
            if (g?.nome) classGrupoFK[c.nome] = g.nome
          }

          // Resolve o grupo priorizando FK, depois dre_lancamentos, depois mapa estático
          const resolveGrupo = (nome: string) => {
            const candidatos = [
              classGrupoFK[nome],
              classGrupoDB[nome],
              resolveGrupoAi(nome),
              classGrupoExtra[nome],
            ].filter(Boolean) as string[]

            return candidatos.find(grupo => gruposValidos.has(grupo)) ?? ''
          }

          // Agrupa classificações por grupo — só mostra grupos com ao menos 1 classificação
          const semGrupo = classificacoes.filter(c => !resolveGrupo(c.nome))
          const gruposDaClassificacao = grupos
            .map(g => ({
              grupo: g,
              items: classificacoes.filter(c => resolveGrupo(c.nome) === g.nome),
            }))
            .filter(({ items }) => items.length > 0)
          const gruposOrdenados = [...gruposDaClassificacao].sort((a, b) => {
            if (a.grupo.tipo !== b.grupo.tipo) return a.grupo.tipo === 'receita' ? -1 : 1
            return a.grupo.nome.localeCompare(b.grupo.nome, 'pt-BR')
          })
          const totalReceitas = classificacoes.filter(c => c.tipo === 'receita').length
          const totalDespesas = classificacoes.length - totalReceitas
          const totalAgrupadas = classificacoes.length - semGrupo.length

          return (
            <div className={styles.section}>
              <div className={styles.classDashboard}>
                <div className={styles.classHero}>
                  <div className={styles.classHeroCopy}>
                    <span className={styles.classEyebrow}>Fonte de verdade: IA</span>
                    <h3 className={styles.classHeroTitle}>Classificações DFC organizadas pelo plano canônico</h3>
                    <p className={styles.classHeroText}>
                      Esta visão mostra o catálogo em linguagem de negócio: primeiro o panorama geral,
                      depois as ações de cadastro e por fim os grupos com suas classificações.
                    </p>
                  </div>

                  <div className={styles.classMetrics}>
                    <div className={styles.classMetricCard}>
                      <span className={styles.classMetricLabel}>Classificações</span>
                      <strong className={styles.classMetricValue}>{classificacoes.length}</strong>
                    </div>
                    <div className={styles.classMetricCard}>
                      <span className={styles.classMetricLabel}>Receitas</span>
                      <strong className={styles.classMetricValue}>{totalReceitas}</strong>
                    </div>
                    <div className={styles.classMetricCard}>
                      <span className={styles.classMetricLabel}>Despesas</span>
                      <strong className={styles.classMetricValue}>{totalDespesas}</strong>
                    </div>
                    <div className={`${styles.classMetricCard} ${semGrupo.length > 0 ? styles.classMetricCardWarning : ''}`}>
                      <span className={styles.classMetricLabel}>Sem grupo</span>
                      <strong className={styles.classMetricValue}>{semGrupo.length}</strong>
                    </div>
                  </div>
                </div>

                <div className={styles.classFormsGrid}>
                  <div className={styles.classActionCard}>
                    <div className={styles.classActionHeader}>
                      <div>
                        <p className={styles.classSectionTitle}>Nova classificação</p>
                        <p className={styles.classSectionHint}>Cadastre o nome já alinhado ao vocabulário usado pela IA.</p>
                      </div>
                    </div>

                    <div className={styles.classFormStack}>
                      <div className={styles.toggleRow}>
                        <button
                          type="button"
                          className={`${styles.toggleBtn} ${novaClassTipo === 'receita' ? styles.toggleBtnActive : ''}`}
                          onClick={() => setNovaClassTipo('receita')}
                        >
                          Receita
                        </button>
                        <button
                          type="button"
                          className={`${styles.toggleBtn} ${novaClassTipo === 'despesa' ? styles.toggleBtnActive : ''}`}
                          onClick={() => setNovaClassTipo('despesa')}
                        >
                          Despesa
                        </button>
                      </div>

                      <div className={styles.classFormStack}>
                        <select
                          className={styles.input}
                          value={novaClassGrupo}
                          onChange={e => setNovaClassGrupo(e.target.value)}
                        >
                          <option value="">Selecionar grupo</option>
                          {grupos.map(g => (
                            <option key={g.id} value={g.nome}>{g.nome}</option>
                          ))}
                        </select>
                        <input
                          className={styles.input}
                          placeholder="Ex: Receita sobre Serviço"
                          value={novaClassNome}
                          onChange={e => setNovaClassNome(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && adicionarClassificacao()}
                        />
                      </div>

                      <div className={styles.classInlineAction}>
                        <p className={styles.classSectionHint}>Se o grupo ficar em branco, a tela tentará resolver pela regra canônica da IA.</p>
                        <button
                          className={styles.btnPrimary}
                          onClick={adicionarClassificacao}
                          disabled={addingClass || !novaClassNome.trim()}
                        >
                          {addingClass ? 'Salvando...' : 'Adicionar classificação'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={styles.classActionCard}>
                    <div className={styles.classActionHeader}>
                      <div>
                        <p className={styles.classSectionTitle}>Novo grupo</p>
                        <p className={styles.classSectionHint}>Crie grupos para acomodar novas classificações sem perder a leitura do DFC.</p>
                      </div>
                    </div>

                    <div className={styles.classFormStack}>
                      <div className={styles.toggleRow}>
                        <button
                          type="button"
                          className={`${styles.toggleBtn} ${novoGrupoTipo === 'receita' ? styles.toggleBtnActive : ''}`}
                          onClick={() => setNovoGrupoTipo('receita')}
                        >
                          Receita
                        </button>
                        <button
                          type="button"
                          className={`${styles.toggleBtn} ${novoGrupoTipo === 'despesa' ? styles.toggleBtnActive : ''}`}
                          onClick={() => setNovoGrupoTipo('despesa')}
                        >
                          Despesa
                        </button>
                      </div>

                      <input
                        className={styles.input}
                        placeholder="Ex: Custos Operacionais"
                        value={novoGrupoNome}
                        onChange={e => setNovoGrupoNome(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && adicionarGrupo()}
                      />

                      <div className={styles.classInlineAction}>
                        <p className={styles.classSectionHint}>Os grupos aparecem abaixo já com a contagem de classificações vinculadas.</p>
                        <button
                          className={styles.btnPrimary}
                          onClick={adicionarGrupo}
                          disabled={addingGrupo || !novoGrupoNome.trim()}
                        >
                          {addingGrupo ? 'Salvando...' : 'Adicionar grupo'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.classSectionBar}>
                  <div>
                    <p className={styles.classSectionTitle}>Mapa de grupos</p>
                    <p className={styles.classSectionHint}>Cada card consolida o grupo, o tipo contábil e as classificações já vinculadas.</p>
                  </div>
                  <span className={styles.classSectionPill}>
                    {totalAgrupadas} de {classificacoes.length} classificações agrupadas
                  </span>
                </div>

                {gruposOrdenados.length > 0 ? (
                  <div className={styles.classGroupsGrid}>
                    {gruposOrdenados.map(({ grupo: g, items }) => (
                      <div key={g.id} className={styles.classGroupCard}>
                        <div className={styles.classGroupHeader}>
                          <div className={styles.classGroupTitleRow}>
                            <span className={`${styles.badge} ${g.tipo === 'receita' ? styles.badgeReceita : styles.badgeDespesa}`}>
                              {g.tipo}
                            </span>
                            <strong className={styles.classGroupTitle}>{g.nome}</strong>
                          </div>
                          <div className={styles.classGroupMeta}>
                            <span>{items.length} classificações</span>
                            <button
                              className={styles.removeBtn}
                              onClick={() => abrirEdicaoGrupo(g)}
                              title="Renomear grupo"
                              style={{ color: '#6b9fff' }}
                            >
                              ✎
                            </button>
                            <button
                              className={styles.removeBtn}
                              onClick={() => removerGrupo(g.id)}
                              title="Remover grupo"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        <div className={`${styles.listWrap} ${styles.classGroupList}`}>
                          {items.map(c => (
                            <div key={c.id} className={`${styles.listItem} ${styles.classListItemClean}`}>
                              <span className={styles.itemName}>{c.nome}</span>
                              <button
                                className={styles.removeBtn}
                                onClick={() => abrirEdicaoClassificacao(c as DreClassificacao & { grupo?: { nome: string } | null })}
                                title="Editar classificação"
                                style={{ color: '#6b9fff', marginRight: 2 }}
                              >
                                ✎
                              </button>
                              <button
                                className={styles.removeBtn}
                                onClick={() => removerClassificacao(c.id)}
                                title="Remover"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.classEmptyState}>
                    <p className={styles.classSectionTitle}>Nenhum grupo com classificações ainda</p>
                    <p className={styles.classSectionHint}>Cadastre grupos ou vincule novas classificações para preencher este painel.</p>
                  </div>
                )}

                {semGrupo.length > 0 && (
                  <div className={styles.classWarningCard}>
                    <div className={styles.classWarningHeader}>
                      <div>
                        <p className={styles.classSectionTitle}>Classificações sem grupo</p>
                        <p className={styles.classSectionHint}>Esses itens merecem revisão porque ainda não encontraram um grupo válido no catálogo.</p>
                      </div>
                      <span className={styles.classWarningCount}>{semGrupo.length}</span>
                    </div>

                    <div className={`${styles.listWrap} ${styles.classWarningList}`}>
                      {semGrupo.map(c => (
                        <div key={c.id} className={`${styles.listItem} ${styles.classWarningItem}`}>
                          <span className={`${styles.badge} ${c.tipo === 'receita' ? styles.badgeReceita : styles.badgeDespesa}`}>
                            {c.tipo}
                          </span>
                          <span className={styles.itemName}>{c.nome}</span>
                          <button
                            className={styles.removeBtn}
                            onClick={() => abrirEdicaoClassificacao(c as DreClassificacao & { grupo?: { nome: string } | null })}
                            title="Editar classificação"
                            style={{ color: '#888', marginRight: 2 }}
                          >
                            ✎
                          </button>
                          <button
                            className={styles.removeBtn}
                            onClick={() => removerClassificacao(c.id)}
                            title="Remover"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {classificacoes.length === 0 && grupos.length === 0 && (
                  <div className={styles.classEmptyState}>
                    <p className={styles.classSectionTitle}>Nenhuma classificação ou grupo cadastrado ainda</p>
                    <p className={styles.classSectionHint}>Quando você começar a montar o plano, esta tela organiza tudo por tipo e por grupo automaticamente.</p>
                  </div>
                )}
              </div>

              {false && (
                <>

              {/* Formulário: nova classificação */}
              <div className={styles.addForm}>
                <p className={styles.label}>Nova classificação</p>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${novaClassTipo === 'receita' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setNovaClassTipo('receita')}
                  >
                    Receita
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${novaClassTipo === 'despesa' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setNovaClassTipo('despesa')}
                  >
                    Despesa
                  </button>
                </div>
                <div className={styles.addRow} style={{ flexWrap: 'wrap', gap: 8 }}>
                  <select
                    className={styles.input}
                    style={{ flex: '0 0 200px' }}
                    value={novaClassGrupo}
                    onChange={e => setNovaClassGrupo(e.target.value)}
                  >
                    <option value="">— Grupo (opcional) —</option>
                    {grupos.map(g => (
                      <option key={g.id} value={g.nome}>{g.nome}</option>
                    ))}
                  </select>
                  <input
                    className={styles.input}
                    style={{ flex: 1 }}
                    placeholder="Ex: Receita sobre Serviço"
                    value={novaClassNome}
                    onChange={e => setNovaClassNome(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && adicionarClassificacao()}
                  />
                  <button
                    className={styles.btnPrimary}
                    onClick={adicionarClassificacao}
                    disabled={addingClass || !novaClassNome.trim()}
                  >
                    {addingClass ? '...' : '+ Adicionar'}
                  </button>
                </div>
              </div>

              {/* Formulário: novo grupo */}
              <div className={styles.addForm} style={{ marginTop: 4 }}>
                <p className={styles.label}>Novo grupo</p>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${novoGrupoTipo === 'receita' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setNovoGrupoTipo('receita')}
                  >
                    Receita
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${novoGrupoTipo === 'despesa' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setNovoGrupoTipo('despesa')}
                  >
                    Despesa
                  </button>
                </div>
                <div className={styles.addRow}>
                  <input
                    className={styles.input}
                    placeholder="Ex: Custos Operacionais"
                    value={novoGrupoNome}
                    onChange={e => setNovoGrupoNome(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && adicionarGrupo()}
                  />
                  <button
                    className={styles.btnPrimary}
                    onClick={adicionarGrupo}
                    disabled={addingGrupo || !novoGrupoNome.trim()}
                  >
                    {addingGrupo ? '...' : '+ Adicionar'}
                  </button>
                </div>
              </div>

              {/* Divisor */}
              <hr style={{ border: 'none', borderTop: '1px solid var(--border, rgba(255,255,255,0.08))', margin: '20px 0' }} />

              {/* Grupos com classificações aninhadas */}
              {gruposDaClassificacao.map(({ grupo: g, items }) => (
                <div key={g.id} style={{ marginBottom: 24 }}>
                  {/* Cabeçalho do grupo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span className={`${styles.badge} ${g.tipo === 'receita' ? styles.badgeReceita : styles.badgeDespesa}`}>
                      {g.tipo}
                    </span>
                    <strong style={{ fontSize: 13 }}>{g.nome}</strong>
                    <span style={{ fontSize: 11, color: 'var(--text-muted, #888)', marginLeft: 'auto' }}>
                      {items.length} classificação{items.length !== 1 ? 'ões' : ''}
                    </span>
                    <button
                      className={styles.removeBtn}
                      onClick={() => abrirEdicaoGrupo(g)}
                      title="Renomear grupo"
                      style={{ color: '#888' }}
                    >
                      ✎
                    </button>
                    <button
                      className={styles.removeBtn}
                      onClick={() => removerGrupo(g.id)}
                      title="Remover grupo"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Classificações do grupo */}
                  <div className={styles.listWrap} style={{ marginLeft: 16, marginBottom: 0 }}>
                    {items.length === 0 && (
                      <p className={styles.hint} style={{ margin: '6px 0' }}>Nenhuma classificação neste grupo.</p>
                    )}
                    {items.map(c => (
                      <div key={c.id} className={styles.listItem}>
                        <span className={styles.itemName}>{c.nome}</span>
                        <button
                          className={styles.removeBtn}
                          onClick={() => abrirEdicaoClassificacao(c as DreClassificacao & { grupo?: { nome: string } | null })}
                          title="Editar classificação"
                          style={{ color: '#888', marginRight: 2 }}
                        >
                          ✎
                        </button>
                        <button
                          className={styles.removeBtn}
                          onClick={() => removerClassificacao(c.id)}
                          title="Remover"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Classificações sem grupo */}
              {semGrupo.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-muted, #888)' }}>Sem grupo</strong>
                  </div>
                  <div className={styles.listWrap} style={{ marginLeft: 16, marginBottom: 0 }}>
                    {semGrupo.map(c => (
                      <div key={c.id} className={styles.listItem}>
                        <span className={`${styles.badge} ${c.tipo === 'receita' ? styles.badgeReceita : styles.badgeDespesa}`}>
                          {c.tipo}
                        </span>
                        <span className={styles.itemName}>{c.nome}</span>
                        <button
                          className={styles.removeBtn}
                          onClick={() => removerClassificacao(c.id)}
                          title="Remover"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {classificacoes.length === 0 && grupos.length === 0 && (
                <p className={styles.hint}>Nenhuma classificação ou grupo cadastrado ainda.</p>
              )}

                </>
              )}
            </div>
          )
        })()}

        {/* ── Exemplos de Upload ────────────────────────────────────────── */}
        {tab === 'exemplos' && (
          <div className={styles.section}>
            <p className={styles.hint}>
              Cada modelo define quais colunas são aceitas no upload de extratos.
              O sistema identifica o arquivo pelo cabeçalho — não pelo nome do arquivo.
            </p>

            {exemplosLoading && <p className={styles.hint}>Carregando...</p>}

            <div className={styles.listWrap}>
              {!exemplosLoading && exemplos.length === 0 && (
                <p className={styles.hint}>Nenhum modelo cadastrado ainda.</p>
              )}
              {exemplos.map(ex => (
                <div key={ex.id} className={styles.listItem}>
                  <div className={styles.exemploInfo}>
                    <span className={styles.itemName}>{ex.nome}</span>
                    <span className={styles.exemploColunasText}>
                      {ex.cabecalhos.join(' · ')}
                    </span>
                  </div>
                  {ex.arquivo && (
                    <a
                      href={`/exemplos/${ex.arquivo}`}
                      download
                      className={styles.downloadLink}
                      title="Baixar arquivo de exemplo"
                    >
                      ↓
                    </a>
                  )}
                  <button
                    className={styles.removeBtn}
                    onClick={() => removerExemplo(ex.id)}
                    title="Remover modelo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.addForm}>
              <p className={styles.label}>Novo modelo</p>
              <div className={styles.addRow}>
                <input
                  className={styles.input}
                  placeholder="Nome do modelo (ex: Conta Azul)"
                  value={novoExNome}
                  onChange={e => setNovoExNome(e.target.value)}
                />
              </div>
              <div className={styles.addRow} style={{ marginTop: 8 }}>
                <input
                  className={styles.input}
                  placeholder="Nome do arquivo estático (ex: conta-azul.xlsx) — opcional"
                  value={novoExArquivo}
                  onChange={e => setNovoExArquivo(e.target.value)}
                />
              </div>
              <div className={styles.addRow} style={{ marginTop: 8 }}>
                <input
                  ref={exFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className={styles.input}
                  style={{ cursor: 'pointer' }}
                  onChange={e => setNovoExFile(e.target.files?.[0] ?? null)}
                />
                <button
                  className={styles.btnPrimary}
                  onClick={adicionarExemplo}
                  disabled={addingEx || !novoExNome.trim() || !novoExFile}
                >
                  {addingEx ? '...' : '+ Adicionar'}
                </button>
              </div>
              {exErro && <p className={styles.erro}>{exErro}</p>}
            </div>
          </div>
        )}

        {/* ── Usuários ──────────────────────────────────────────────────── */}
        {tab === 'usuarios' && (
          <div className={styles.section}>
            <div className={styles.usuariosHeader}>
              <div className={styles.usuariosHeaderInfo}>
                <p className={styles.hint}>
                  Gerencie os usuários do sistema. Convites são enviados por e-mail.
                </p>
                <input
                  className={`${styles.input} ${styles.userSearchInput}`}
                  type="search"
                  placeholder="Buscar por nome, e-mail, empresa ou titular"
                  value={usuariosBusca}
                  onChange={e => setUsuariosBusca(e.target.value)}
                />
              </div>
              <button
                className={styles.btnPrimary}
                onClick={() => { setShowAddUser(true); setAddUserErro(''); setAddUserOk('') }}
              >
                + Adicionar Usuário
              </button>
            </div>

            {/* Formulário de convite */}
            {showAddUser && (
              <div className={styles.inviteForm}>
                <p className={styles.label}>Novo convite</p>
                <div className={styles.inviteFields}>
                  <div className={styles.field}>
                    <label className={styles.labelSm}>E-mail</label>
                    <input
                      className={styles.input}
                      type="email"
                      placeholder="usuario@email.com"
                      value={novoEmail}
                      onChange={e => setNovoEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && enviarConvite()}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.labelSm}>Data de expiração (opcional)</label>
                    <input
                      className={styles.input}
                      type="date"
                      value={novoExpires}
                      onChange={e => setNovoExpires(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.inviteActions}>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => { setShowAddUser(false); setNovoEmail(''); setNovoExpires('') }}
                  >
                    Cancelar
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={enviarConvite}
                    disabled={addingUser || !novoEmail.trim()}
                  >
                    {addingUser ? 'Enviando...' : 'Enviar convite'}
                  </button>
                </div>
                {addUserErro && <p className={styles.erro}>{addUserErro}</p>}
              </div>
            )}

            {addUserOk && <p className={styles.ok}>{addUserOk}</p>}

            {/* Modal de confirmação de delete */}
            <ModalTransition open={!!confirmDelete}>
              <div className={styles.modalOverlay}>
                <div className={styles.modalBox}>
                  <div className={styles.modalIcon}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/>
                      <path d="M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </div>
                  <h3 className={styles.modalTitle}>Deletar usuário</h3>
                  <p className={styles.modalDesc}>
                    Você está prestes a deletar permanentemente a conta de{' '}
                    <strong>{confirmDelete?.name ?? confirmDelete?.email ?? 'este usuário'}</strong>.
                  </p>
                  <div className={styles.modalWarning}>
                    <p>⚠ Todos os dados do usuário serão perdidos permanentemente.</p>
                    <p>⚠ Esta ação não poderá ser revertida.</p>
                  </div>
                  <label className={styles.modalCheckLabel}>
                    <input
                      type="checkbox"
                      checked={deleteCheck}
                      onChange={e => setDeleteCheck(e.target.checked)}
                    />
                    Entendo que todos os dados serão perdidos permanentemente e que esta ação não pode ser desfeita.
                  </label>
                  {deleteErro && <p className={styles.erro}>{deleteErro}</p>}
                  <div className={styles.modalActions}>
                    <button
                      className={styles.btnSecondary}
                      onClick={() => { setConfirmDelete(null); setDeleteCheck(false); setDeleteErro('') }}
                      disabled={!!deletingId}
                    >
                      Cancelar
                    </button>
                    <button
                      className={styles.btnDanger}
                      onClick={() => confirmDelete && deletarUsuario(confirmDelete)}
                      disabled={!deleteCheck || !!deletingId}
                    >
                      {confirmDelete && deletingId === confirmDelete.id ? 'Deletando...' : 'Deletar permanentemente'}
                    </button>
                  </div>
                </div>
              </div>
            </ModalTransition>

            {/* Tabela de usuários */}
            {usuariosLoading && <p className={styles.hint}>Carregando usuários...</p>}

            {!usuariosLoading && (
              <div className={styles.userCards}>
                {usuarios.length === 0 && (
                  <div className={styles.userCardEmpty}>
                    Nenhum usuário encontrado.
                  </div>
                )}

                {usuarios.length > 0 && usuariosFiltrados.length === 0 && (
                  <div className={styles.userCardEmpty}>
                    Nenhum usuário encontrado para "{usuariosBusca.trim()}".
                  </div>
                )}

                {usuariosPaginados.map(u => (
                  <article key={u.id} className={styles.userCard}>
                    <div className={styles.userCardTop}>
                      <div className={styles.userCardIdentity}>
                        <div className={styles.userCardNameRow}>
                          <h3 className={styles.userCardName}>{u.name ?? '—'}</h3>
                          <span className={`${styles.userTypeBadge} ${u.tipo_usuario === 'colaborador' ? styles.userTypeColaborador : styles.userTypeTitular}`}>
                            {u.tipo_usuario === 'colaborador' ? 'Colaborador' : 'Titular'}
                          </span>
                        </div>
                        <p className={styles.userCardEmail}>{u.email ?? '—'}</p>
                      </div>

                      <div className={styles.userCardBadges}>
                        {u.id === currentUserId ? (
                          <div className={styles.roleEditorWrap}>
                            <span className={styles.roleEditLabel}>Sua função</span>
                            <span className={`${styles.roleBadge} ${u.role === 'admin' ? styles.roleAdmin : u.role === 'editor' ? styles.roleEditor : styles.roleUser}`}>
                              {u.role}
                            </span>
                          </div>
                        ) : (
                          <label className={styles.roleEditorWrap}>
                            <span className={styles.roleEditLabel}>Alterar função</span>
                            <select
                              className={styles.roleSelect}
                              value={u.role}
                              onChange={e => alterarFuncaoUsuario(u, e.target.value)}
                              disabled={savingRoleId === u.id}
                            >
                              <option value="admin">admin</option>
                              <option value="editor">editor</option>
                              <option value="user">user</option>
                            </select>
                          </label>
                        )}
                      </div>
                    </div>

                    <div className={styles.userCardContent}>
                      <div className={styles.userLinksCompact}>
                        <span className={styles.userCardLabel}>Vínculos -</span>
                        {u.tipo_usuario === 'colaborador' && (
                          <span className={styles.userLinksLine}>
                            <span className={styles.userLinksLabel}>Titular:</span>{' '}
                            {u.titularesResponsaveis.length > 0 ? u.titularesResponsaveis.join(', ') : 'Não identificado'}
                          </span>
                        )}
                        <span className={styles.userLinksLine}>
                          <span className={styles.userLinksLabel}>Empresas:</span>{' '}
                          {u.empresasAcesso.length > 0 ? u.empresasAcesso.join(', ') : 'Sem acesso'}
                        </span>
                        <span className={styles.userLinksLine}>
                          <span className={styles.userLinksLabel}>Apps:</span>{' '}
                          {getAppsLiberadosTexto(u)}
                        </span>
                      </div>

                      <div className={styles.userMetaCards}>
                        <div className={styles.userMetaCard}>
                          <span className={styles.userCardLabel}>Status -</span>
                          {u.role !== 'admin' ? (
                            <button
                              type="button"
                              className={`${styles.switch} ${(u.ativo ?? true) ? styles.switchActive : ''}`}
                              onClick={() => alternarStatusUsuario(u)}
                              disabled={savingUserId === u.id}
                              aria-pressed={u.ativo ?? true}
                              aria-label={`${(u.ativo ?? true) ? 'Desativar' : 'Ativar'} usuário ${u.email ?? u.name ?? ''}`.trim()}
                              title={(u.ativo ?? true) ? 'Clique para desativar o usuário' : 'Clique para ativar o usuário'}
                            >
                              <span className={styles.switchTrack}>
                                <span className={styles.switchThumb} />
                              </span>
                              <span className={styles.switchLabel}>{(u.ativo ?? true) ? 'Ativo' : 'Inativo'}</span>
                            </button>
                          ) : (
                            <span className={styles.statusMuted}>Sempre ativo</span>
                          )}
                        </div>

                        <div className={styles.userMetaCard}>
                          <span className={styles.userCardLabel}>Expiração -</span>
                          {u.role !== 'admin' ? (
                            <div className={styles.expiryEditor}>
                              <input
                                type="date"
                                className={`${styles.input} ${styles.expiryInput}`}
                                value={expiresDrafts[u.id] ?? ''}
                                onChange={e => setExpiresDrafts(atual => ({ ...atual, [u.id]: e.target.value }))}
                                disabled={savingExpiryId === u.id}
                              />
                              <button
                                type="button"
                                className={hasAlteracaoExpiracao(u) ? styles.btnPrimary : styles.btnSecondary}
                                onClick={() => salvarExpiracaoUsuario(u)}
                                disabled={savingExpiryId === u.id || !hasAlteracaoExpiracao(u)}
                              >
                                {savingExpiryId === u.id ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          ) : (
                            <span className={styles.userCardValue}>{formatDate(u.expires_at)}</span>
                          )}
                        </div>

                        <div className={styles.userMetaCard}>
                          <span className={styles.userCardLabel}>Desde -</span>
                          <span className={styles.userCardValue}>{formatDate(u.created_at)}</span>
                        </div>
                      </div>

                      <div className={styles.appAccessCard}>
                        <div className={styles.appAccessHeader}>
                          <div className={styles.appAccessHeaderInfo}>
                            <span className={styles.userCardLabel}>Apps liberados</span>
                            <span className={styles.appAccessSummary}>{getAppsLiberadosResumo(u)}</span>
                          </div>
                          {u.role === 'admin' && (
                            <span className={styles.statusMuted}>Admins mantêm acesso total.</span>
                          )}
                        </div>

                        {u.role === 'admin' ? (
                          <p className={styles.hint}>Esse usuário continua com acesso a todos os apps por ser admin.</p>
                        ) : appsLoading ? (
                          <p className={styles.hint}>Carregando apps disponíveis...</p>
                        ) : appsDisponiveis.length === 0 ? (
                          <p className={styles.hint}>Nenhum app cadastrado para liberar.</p>
                        ) : (
                          <>
                            <div className={styles.appAccessToolbar}>
                              <div className={styles.appAccessToolbarButtons}>
                                <button
                                  type="button"
                                  className={styles.appAccessMiniButton}
                                  onClick={() => setAppAccessDrafts(atual => ({
                                    ...atual,
                                    [u.id]: getAppIdsDisponiveis(),
                                  }))}
                                  disabled={savingAppId === u.id || arraysIguais(getAppIdsSelecionados(u), getAppIdsDisponiveis())}
                                >
                                  Marcar todos
                                </button>
                                <button
                                  type="button"
                                  className={styles.appAccessMiniButton}
                                  onClick={() => setAppAccessDrafts(atual => ({
                                    ...atual,
                                    [u.id]: [],
                                  }))}
                                  disabled={savingAppId === u.id || getAppIdsSelecionados(u).length === 0}
                                >
                                  Limpar
                                </button>
                              </div>
                              <span className={styles.hint}>Marque os apps que esse usuário pode acessar.</span>
                            </div>

                            <div className={styles.appAccessGrid}>
                              {appsDisponiveis.map(app => (
                                <label
                                  key={app.id}
                                  className={`${styles.appAccessOption} ${getAppIdsSelecionados(u).includes(app.id) ? styles.appAccessOptionActive : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    className={styles.appAccessCheckbox}
                                    checked={getAppIdsSelecionados(u).includes(app.id)}
                                    onChange={() => setAppAccessDrafts(atual => ({
                                      ...atual,
                                      [u.id]: toggleAppSelection(getAppIdsSelecionados(u), app.id, getAppIdsDisponiveis()),
                                    }))}
                                    disabled={savingAppId === u.id}
                                  />
                                  <div className={styles.appAccessOptionBody}>
                                    <span className={styles.appAccessOptionName}>{app.name}</span>
                                    <span className={styles.appAccessOptionMeta}>
                                      {app.internal_link ? `Interno: ${app.internal_link}` : 'App externo'}
                                    </span>
                                  </div>
                                </label>
                              ))}
                            </div>

                            <div className={styles.appAccessActions}>
                              <span className={styles.hint}>
                                {getAppIdsSelecionados(u).length === getAppIdsDisponiveis().length
                                  ? 'Todos os apps ficarão liberados para esse usuário.'
                                  : getAppIdsSelecionados(u).length === 0
                                    ? 'Esse usuário ficará sem acesso a apps.'
                                    : `${getAppIdsSelecionados(u).length} app${getAppIdsSelecionados(u).length === 1 ? '' : 's'} selecionado${getAppIdsSelecionados(u).length === 1 ? '' : 's'}.`}
                              </span>
                              <button
                                type="button"
                                className={hasAlteracaoApps(u) ? styles.btnPrimary : styles.btnSecondary}
                                onClick={() => salvarAppsUsuario(u)}
                                disabled={savingAppId === u.id || !hasAlteracaoApps(u)}
                              >
                                {savingAppId === u.id ? 'Salvando...' : 'Salvar apps'}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className={styles.userCardActions}>
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => { setConfirmDelete(u); setDeleteCheck(false); setDeleteErro('') }}
                          title="Deletar usuário"
                        >
                          Deletar
                        </button>
                      )}
                    </div>
                  </article>
                ))}

                {usuariosFiltrados.length > 0 && (
                  <div className={styles.userPagination}>
                    <span className={styles.userPaginationInfo}>
                      Mostrando {((usuariosPagina - 1) * USERS_PER_PAGE) + 1}
                      {' '}a{' '}
                      {Math.min(usuariosPagina * USERS_PER_PAGE, usuariosFiltrados.length)}
                      {' '}de {usuariosFiltrados.length} usuários
                    </span>

                    <div className={styles.userPaginationActions}>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => setUsuariosPagina(atual => Math.max(1, atual - 1))}
                        disabled={usuariosPagina === 1}
                      >
                        Anterior
                      </button>

                      <span className={styles.userPaginationPage}>
                        Página {usuariosPagina} de {totalPaginasUsuarios}
                      </span>

                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => setUsuariosPagina(atual => Math.min(totalPaginasUsuarios, atual + 1))}
                        disabled={usuariosPagina === totalPaginasUsuarios}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* ── Modal: Editar Classificação ── */}
      <ModalTransition open={!!editingClass}>
        {editingClass && (
          <div className={styles.modalOverlay} onClick={() => setEditingClass(null)}>
            <div className={styles.modalBox} onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <h3 className={styles.modalTitle}>Editar classificação</h3>
              <p style={{ color: 'var(--text-muted, #888)', fontSize: 13, marginBottom: 16 }}>
                Alterações no nome e grupo refletem nos lançamentos existentes.
              </p>

              <div style={{ marginBottom: 12 }}>
                <p className={styles.label} style={{ marginBottom: 6 }}>Nome</p>
                <input
                  className={styles.input}
                  value={editClassForm.nome}
                  onChange={e => setEditClassForm(p => ({ ...p, nome: e.target.value }))}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <p className={styles.label} style={{ marginBottom: 6 }}>Tipo</p>
                <div className={styles.toggleRow}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${editClassForm.tipo === 'receita' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setEditClassForm(p => ({ ...p, tipo: 'receita' }))}
                  >Receita</button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${editClassForm.tipo === 'despesa' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setEditClassForm(p => ({ ...p, tipo: 'despesa' }))}
                  >Despesa</button>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p className={styles.label} style={{ marginBottom: 6 }}>Grupo</p>
                <select
                  className={styles.input}
                  value={editClassForm.grupoId}
                  onChange={e => setEditClassForm(p => ({ ...p, grupoId: e.target.value }))}
                >
                  <option value="">Sem grupo</option>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>{g.nome} ({g.tipo})</option>
                  ))}
                </select>
              </div>

              {editClassError && <p className={styles.erro} style={{ marginBottom: 12 }}>{editClassError}</p>}

              <div className={styles.modalActions}>
                <button className={styles.btnSecondary} onClick={() => setEditingClass(null)} disabled={savingEditClass}>
                  Cancelar
                </button>
                <button className={styles.btnPrimary} onClick={salvarEdicaoClassificacao} disabled={savingEditClass || !editClassForm.nome.trim()}>
                  {savingEditClass ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </ModalTransition>

      {/* ── Modal: Renomear Grupo ── */}
      <ModalTransition open={!!editingGrupo}>
        {editingGrupo && (
          <div className={styles.modalOverlay} onClick={() => setEditingGrupo(null)}>
            <div className={styles.modalBox} onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
              <h3 className={styles.modalTitle}>Renomear grupo</h3>
              <p style={{ color: 'var(--text-muted, #888)', fontSize: 13, marginBottom: 16 }}>
                O novo nome será aplicado em todos os lançamentos existentes automaticamente.
              </p>

              <div style={{ marginBottom: 20 }}>
                <p className={styles.label} style={{ marginBottom: 6 }}>Nome do grupo</p>
                <input
                  className={styles.input}
                  value={editGrupoNome}
                  onChange={e => setEditGrupoNome(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && salvarEdicaoGrupo()}
                />
              </div>

              {editGrupoError && <p className={styles.erro} style={{ marginBottom: 12 }}>{editGrupoError}</p>}

              <div className={styles.modalActions}>
                <button className={styles.btnSecondary} onClick={() => setEditingGrupo(null)} disabled={savingEditGrupo}>
                  Cancelar
                </button>
                <button className={styles.btnPrimary} onClick={salvarEdicaoGrupo} disabled={savingEditGrupo || !editGrupoNome.trim()}>
                  {savingEditGrupo ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </ModalTransition>

      </div>
    </div>
  )
}
