import { ReactNode, useEffect, useRef, useState } from 'react'
import { read, utils } from 'xlsx'
import styles from './DashboardPage.module.css'
import { User } from '../App'
import { supabase } from '../lib/supabase'
import type { App, AppCategory, DreClassificacao, ExemploUpload, ForumTopicWithMeta } from '../lib/types'
import ForumTopicPage from './ForumTopicPage'
import { DesignButton, DesignIconButton } from '../components/design/DesignSystem'

type Page = 'aplicativos' | 'comunidade' | 'perfil'

const GROQ_MODELS_FALLBACK = [
  { value: 'llama-3.3-70b-versatile',        label: 'Llama 3.3 70B Versatile (Recomendado)' },
  { value: 'llama-3.1-8b-instant',           label: 'Llama 3.1 8B Instant (Rápido)' },
  { value: 'deepseek-r1-distill-llama-70b',  label: 'DeepSeek R1 70B' },
]

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

interface DashboardPageProps {
  user: User
  onLogout: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

interface AppCategoryRow extends AppCategory {
  apps: App[]
}

// ── Icons ─────────────────────────────────────────────────────────────────

const IconApps = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)
const IconCommunity = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconProfile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)
const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconExternal = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
)
const IconTag = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
)
const IconMessageSquare = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
)
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)
const IconMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

// ── Spinner ───────────────────────────────────────────────────────────────

function Spinner() {
  return <div className={styles.spinner} />
}

function TopNavigation({
  navItems,
  activePage,
  onSelect,
  isAdmin,
  onSettings,
  onLogout,
  theme,
  onToggleTheme,
}: {
  navItems: { id: Page; label: string; icon: ReactNode }[]
  activePage: Page
  onSelect: (page: Page) => void
  isAdmin: boolean
  onSettings: () => void
  onLogout: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
  const isDark = theme === 'dark'
  return (
    <header className={styles.topNavWrap}>
      <div className={styles.topNavBrand}>
        <img src="/logo.png" height="24" alt="PainelGestaa" />
      </div>

      <nav className={styles.topNavMenu}>
        {navItems.map(item => (
          <DesignButton
            key={item.id}
            variant="pill"
            active={activePage === item.id}
            onClick={() => onSelect(item.id)}
          >
            <span className={styles.topNavButtonContent}>{item.icon}<span>{item.label}</span></span>
          </DesignButton>
        ))}
      </nav>

      <div className={styles.topNavActions}>
        <button
          type="button"
          className={`${styles.themeToggle} ${isDark ? styles.themeToggleDark : styles.themeToggleLight}`}
          onClick={onToggleTheme}
          title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          <span className={styles.themeToggleKnob}>
            {isDark ? <IconMoon /> : <IconSun />}
          </span>
        </button>
        {isAdmin && (
          <DesignIconButton onClick={onSettings} title="Configurações">
            <IconSettings />
          </DesignIconButton>
        )}
        <DesignButton variant="primary" onClick={onLogout}>
          <span className={styles.topNavButtonContent}><IconLogout /><span>Sair</span></span>
        </DesignButton>
      </div>
    </header>
  )
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.categoryChip} ${active ? styles.categoryChipActive : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}


// ── Admin Settings Modal ──────────────────────────────────────────────────

/** Lê cabeçalhos normalizados da primeira aba de um arquivo .xlsx/.csv */
async function lerCabecalhosArquivo(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const wb = read(buffer, { type: 'array' })
  if (!wb.SheetNames.length) return []
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) return []
  // Encontra a primeira linha com pelo menos 2 células preenchidas
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

/** Exemplos pré-definidos (estáticos em /public/exemplos/) para semeadura inicial */
const EXEMPLOS_ESTATICOS = [
  { nome: 'Exemplo Básico', arquivo: 'exemplo.xlsx'    },
  { nome: 'Conta Azul',     arquivo: 'conta-azul.xlsx' },
]

function AdminSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab,            setTab]            = useState<'modelo' | 'classificacoes' | 'exemplos'>('modelo')
  const [groqModels,     setGroqModels]     = useState(GROQ_MODELS_FALLBACK)
  const [modelsLoading,  setModelsLoading]  = useState(false)
  const [modeloAtual,    setModeloAtual]    = useState(DEFAULT_GROQ_MODEL)
  const [savingModelo,   setSavingModelo]   = useState(false)
  const [savedModelo,    setSavedModelo]    = useState(false)
  const [classificacoes, setClassificacoes] = useState<DreClassificacao[]>([])
  const [novaClassNome,  setNovaClassNome]  = useState('')
  const [novaClassTipo,  setNovaClassTipo]  = useState<'receita' | 'despesa'>('despesa')
  const [addingClass,    setAddingClass]    = useState(false)

  // ── Exemplos de upload ─────────────────────────────────────────────────────
  const [exemplos,        setExemplos]        = useState<ExemploUpload[]>([])
  const [exemplosLoading, setExemplosLoading] = useState(false)
  const [novoExNome,      setNovoExNome]      = useState('')
  const [novoExArquivo,   setNovoExArquivo]   = useState('')
  const [novoExFile,      setNovoExFile]      = useState<File | null>(null)
  const [addingEx,        setAddingEx]        = useState(false)
  const [exErro,          setExErro]          = useState('')
  const exFileRef = useRef<HTMLInputElement>(null)

  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('dre_classificacoes')
      .select('*')
      .order('tipo')
      .order('nome')
    setClassificacoes(data ?? [])
  }

  const fetchExemplos = async () => {
    setExemplosLoading(true)
    const { data } = await supabase
      .from('exemplos_upload')
      .select('*')
      .order('created_at')
    const lista = data ?? []

    // Se o banco está vazio, semeia os exemplos estáticos automaticamente
    if (lista.length === 0) {
      for (const ex of EXEMPLOS_ESTATICOS) {
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
          await supabase.from('exemplos_upload').insert({
            nome: ex.nome,
            arquivo: ex.arquivo,
            cabecalhos,
          })
        } catch { /* ignora erros de seed */ }
      }
      const { data: seeded } = await supabase
        .from('exemplos_upload').select('*').order('created_at')
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
      const { error } = await supabase.from('exemplos_upload').insert({
        nome: novoExNome.trim(),
        arquivo,
        cabecalhos,
      })
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

  useEffect(() => {
    const fetchGroqModels = async () => {
      setModelsLoading(true)
      const { data, error } = await supabase.functions.invoke('groq-models', { method: 'GET' })
      if (!error && Array.isArray(data?.models) && data.models.length > 0) {
        setGroqModels(data.models.map((model: string) => ({ value: model, label: model })))
      }
      setModelsLoading(false)
    }

    fetchGroqModels()
    fetchClassificacoes()
    fetchExemplos()
  }, [])

  useEffect(() => {
    supabase.from('configuracoes').select('valor').eq('chave', 'modelo_groq').single()
      .then(({ data }) => {
        if (!data) return
        const existeNoCatalogo = groqModels.some(model => model.value === data.valor)
        if (existeNoCatalogo) {
          setModeloAtual(data.valor)
          return
        }

        if (data.valor) {
          setGroqModels(p => [...p, { value: data.valor, label: `${data.valor} (configurado)` }])
          setModeloAtual(data.valor)
          return
        }

        setModeloAtual(DEFAULT_GROQ_MODEL)
      })
  }, [groqModels])

  const salvarModelo = async () => {
    setSavingModelo(true)
    await supabase.from('configuracoes').upsert({ chave: 'modelo_groq', valor: modeloAtual })
    setSavingModelo(false)
    setSavedModelo(true)
    setTimeout(() => setSavedModelo(false), 2000)
  }

  const adicionarClassificacao = async () => {
    if (!novaClassNome.trim()) return
    setAddingClass(true)
    await supabase.from('dre_classificacoes').insert({ nome: novaClassNome.trim(), tipo: novaClassTipo })
    setNovaClassNome('')
    await fetchClassificacoes()
    setAddingClass(false)
  }

  const removerClassificacao = async (id: string) => {
    await supabase.from('dre_classificacoes').delete().eq('id', id)
    setClassificacoes(p => p.filter(c => c.id !== id))
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalLg}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Configurações Admin</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.settingsTabs}>
          <button
            className={`${styles.settingsTab} ${tab === 'modelo' ? styles.settingsTabActive : ''}`}
            onClick={() => setTab('modelo')}
          >
            Modelo IA
          </button>
          <button
            className={`${styles.settingsTab} ${tab === 'classificacoes' ? styles.settingsTabActive : ''}`}
            onClick={() => setTab('classificacoes')}
          >
            Classificações DRE
          </button>
          <button
            className={`${styles.settingsTab} ${tab === 'exemplos' ? styles.settingsTabActive : ''}`}
            onClick={() => setTab('exemplos')}
          >
            Exemplos de Upload
          </button>
        </div>

        {/* ── Tab: Modelo IA ── */}
        {tab === 'modelo' && (
          <div className={styles.settingsBody}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Modelo GroqCloud</label>
              <select
                className={styles.modalInput}
                value={modeloAtual}
                onChange={e => setModeloAtual(e.target.value)}
              >
                {groqModels.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className={styles.settingsHint}>
                Modelo usado para sugerir a classificação automática nos lançamentos do DRE.
              </p>
              {modelsLoading && (
                <p className={styles.settingsHint}>Atualizando catálogo de modelos ativos...</p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.modalSubmit}
                onClick={salvarModelo}
                disabled={savingModelo}
              >
                {savingModelo ? 'Salvando...' : savedModelo ? 'Salvo ✓' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Exemplos de Upload ── */}
        {tab === 'exemplos' && (
          <div className={styles.settingsBody}>
            <p className={styles.settingsHint}>
              Cada modelo abaixo define quais colunas são aceitas no upload de extratos.
              O sistema identifica o arquivo pelo cabeçalho — não pelo nome do arquivo.
            </p>

            {exemplosLoading && <p className={styles.settingsHint}>Carregando...</p>}

            <div className={styles.classListWrap}>
              {!exemplosLoading && exemplos.length === 0 && (
                <p className={styles.settingsHint}>Nenhum modelo cadastrado ainda.</p>
              )}
              {exemplos.map(ex => (
                <div key={ex.id} className={styles.classItem}>
                  <div className={styles.exemploInfo}>
                    <span className={styles.classNome}>{ex.nome}</span>
                    <span className={styles.exemploColunas}>
                      {ex.cabecalhos.join(' · ')}
                    </span>
                  </div>
                  {ex.arquivo && (
                    <a
                      href={`/exemplos/${ex.arquivo}`}
                      download
                      className={styles.exemploDownloadLink}
                      title="Baixar arquivo de exemplo"
                    >
                      ↓
                    </a>
                  )}
                  <button
                    className={styles.classRemoveBtn}
                    onClick={() => removerExemplo(ex.id)}
                    title="Remover modelo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.classAddForm}>
              <p className={styles.modalLabel}>Novo modelo</p>
              <div className={styles.classAddRow}>
                <input
                  className={styles.modalInput}
                  placeholder="Nome do modelo (ex: Conta Azul)"
                  value={novoExNome}
                  onChange={e => setNovoExNome(e.target.value)}
                />
              </div>
              <div className={styles.classAddRow} style={{ marginTop: 8 }}>
                <input
                  className={styles.modalInput}
                  placeholder="Nome do arquivo estático (ex: conta-azul.xlsx) — opcional"
                  value={novoExArquivo}
                  onChange={e => setNovoExArquivo(e.target.value)}
                />
              </div>
              <div className={styles.classAddRow} style={{ marginTop: 8 }}>
                <input
                  ref={exFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className={styles.modalInput}
                  style={{ cursor: 'pointer' }}
                  onChange={e => setNovoExFile(e.target.files?.[0] ?? null)}
                />
                <button
                  className={styles.modalSubmit}
                  onClick={adicionarExemplo}
                  disabled={addingEx || !novoExNome.trim() || !novoExFile}
                >
                  {addingEx ? '...' : '+ Adicionar'}
                </button>
              </div>
              {exErro && <p className={styles.settingsErro}>{exErro}</p>}
            </div>
          </div>
        )}

        {/* ── Tab: Classificações DRE ── */}
        {tab === 'classificacoes' && (
          <div className={styles.settingsBody}>
            <div className={styles.classListWrap}>
              {classificacoes.length === 0 && (
                <p className={styles.settingsHint}>Nenhuma classificação cadastrada ainda.</p>
              )}
              {classificacoes.map(c => (
                <div key={c.id} className={styles.classItem}>
                  <span className={`${styles.classTipoBadge} ${c.tipo === 'receita' ? styles.classTipoReceita : styles.classTipoDespesa}`}>
                    {c.tipo}
                  </span>
                  <span className={styles.classNome}>{c.nome}</span>
                  <button
                    className={styles.classRemoveBtn}
                    onClick={() => removerClassificacao(c.id)}
                    title="Remover"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.classAddForm}>
              <p className={styles.modalLabel}>Nova classificação</p>
              <div className={styles.linkTypeToggle}>
                <button
                  type="button"
                  className={`${styles.linkTypeBtn} ${novaClassTipo === 'receita' ? styles.linkTypeBtnActive : ''}`}
                  onClick={() => setNovaClassTipo('receita')}
                >
                  Receita
                </button>
                <button
                  type="button"
                  className={`${styles.linkTypeBtn} ${novaClassTipo === 'despesa' ? styles.linkTypeBtnActive : ''}`}
                  onClick={() => setNovaClassTipo('despesa')}
                >
                  Despesa
                </button>
              </div>
              <div className={styles.classAddRow}>
                <input
                  className={styles.modalInput}
                  placeholder="Ex: Receita sobre Serviço"
                  value={novaClassNome}
                  onChange={e => setNovaClassNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarClassificacao()}
                />
                <button
                  className={styles.modalSubmit}
                  onClick={adicionarClassificacao}
                  disabled={addingClass || !novaClassNome.trim()}
                >
                  {addingClass ? '...' : '+ Adicionar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────

interface NewAppForm {
  name: string; description: string; category: string
  linkType: 'interno' | 'externo'
  link: string; backgroundImage: string
}

function CreateAppModal({ categories, onClose, onCreated }: {
  categories: AppCategory[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<NewAppForm>({
    name: '', description: '', category: '',
    linkType: 'externo', link: '', backgroundImage: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (f: keyof NewAppForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.link.trim()) { setError('Informe o link do aplicativo.'); return }
    setSaving(true); setError('')

    const { error } = await supabase.from('apps').insert({
      name:             form.name,
      description:      form.description || null,
      category:         form.category,
      link_type:        form.linkType,
      external_link:    form.linkType === 'externo' ? form.link || null : null,
      internal_link:    form.linkType === 'interno' ? form.link || null : null,
      background_image: form.backgroundImage || null,
    })

    if (error) { setError(error.message); setSaving(false); return }
    onCreated(); onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Novo Aplicativo</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalRow}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Nome</label>
              <input className={styles.modalInput} placeholder="Ex: GestCaixa" value={form.name} onChange={set('name')} required />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Categoria</label>
              <select className={styles.modalInput} value={form.category} onChange={set('category')} required>
                <option value="">Selecione...</option>
                {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Descrição</label>
            <textarea className={`${styles.modalInput} ${styles.modalTextarea}`}
              placeholder="Descreva o que este app faz..."
              value={form.description} onChange={set('description')} rows={3} />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Tipo de Link</label>
            <div className={styles.linkTypeToggle}>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'externo' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(p => ({ ...p, linkType: 'externo', link: '' }))}
              >
                Externo
              </button>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'interno' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(p => ({ ...p, linkType: 'interno', link: '' }))}
              >
                Interno
              </button>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>
              {form.linkType === 'externo' ? 'URL Externa' : 'Rota Interna'}
            </label>
            {form.linkType === 'externo' ? (
              <input className={styles.modalInput} type="url" placeholder="https://app.exemplo.com" value={form.link} onChange={set('link')} required />
            ) : (
              <input className={styles.modalInput} placeholder="/apps/gestcaixa" value={form.link} onChange={set('link')} required />
            )}
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>URL da Imagem de Fundo</label>
            <input className={styles.modalInput} type="url" placeholder="https://exemplo.com/imagem.jpg" value={form.backgroundImage} onChange={set('backgroundImage')} />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar App'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditAppModal({
  app,
  categories,
  onClose,
  onUpdated,
}: {
  app: App
  categories: AppCategory[]
  onClose: () => void
  onUpdated: () => void
}) {
  const initialLinkType: 'interno' | 'externo' =
    app.link_type
    ?? (app.internal_link ? 'interno' : 'externo')
  const initialLink = initialLinkType === 'interno'
    ? (app.internal_link ?? '')
    : (app.external_link ?? '')

  const [form, setForm] = useState<NewAppForm>({
    name: app.name,
    description: app.description ?? '',
    category: app.category,
    linkType: initialLinkType,
    link: initialLink,
    backgroundImage: app.background_image ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (f: keyof NewAppForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.link.trim()) {
      setError('Informe o link do aplicativo.')
      return
    }

    setSaving(true)
    setError('')

    const { error } = await supabase.from('apps').update({
      name: form.name,
      description: form.description || null,
      category: form.category,
      link_type: form.linkType,
      external_link: form.linkType === 'externo' ? form.link || null : null,
      internal_link: form.linkType === 'interno' ? form.link || null : null,
      background_image: form.backgroundImage || null,
    }).eq('id', app.id)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    onUpdated()
    onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Editar Aplicativo</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalRow}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Nome</label>
              <input className={styles.modalInput} placeholder="Ex: GestCaixa" value={form.name} onChange={set('name')} required />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Categoria</label>
              <select className={styles.modalInput} value={form.category} onChange={set('category')} required>
                <option value="">Selecione...</option>
                {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Descrição</label>
            <textarea
              className={`${styles.modalInput} ${styles.modalTextarea}`}
              placeholder="Descreva o que este app faz..."
              value={form.description}
              onChange={set('description')}
              rows={3}
            />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Tipo de Link</label>
            <div className={styles.linkTypeToggle}>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'externo' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(prev => ({ ...prev, linkType: 'externo', link: '' }))}
              >
                Externo
              </button>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'interno' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(prev => ({ ...prev, linkType: 'interno', link: '' }))}
              >
                Interno
              </button>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>
              {form.linkType === 'externo' ? 'URL Externa' : 'Rota Interna'}
            </label>
            {form.linkType === 'externo' ? (
              <input className={styles.modalInput} type="url" placeholder="https://app.exemplo.com" value={form.link} onChange={set('link')} required />
            ) : (
              <input className={styles.modalInput} placeholder="/apps/gestcaixa" value={form.link} onChange={set('link')} required />
            )}
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>URL da Imagem de Fundo</label>
            <input className={styles.modalInput} type="url" placeholder="https://exemplo.com/imagem.jpg" value={form.backgroundImage} onChange={set('backgroundImage')} />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
    await supabase.from('app_categories').insert({ name, slug })
    onCreated(); onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Nova Categoria</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Nome</label>
            <input className={styles.modalInput} placeholder="Ex: Marketing" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>{saving ? '...' : 'Criar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateTopicModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title,   setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [saving,  setSaving]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('forum_topics').insert({
        author_id: user.id,
        title: title.trim(),
        content: content.trim(),
      })
    }
    onCreated(); onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Novo Tópico</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Título</label>
            <input className={styles.modalInput} placeholder="Qual é a sua dúvida ou tema?" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Conteúdo</label>
            <textarea className={`${styles.modalInput} ${styles.modalTextarea}`}
              placeholder="Descreva em detalhes..." rows={5}
              value={content} onChange={e => setContent(e.target.value)} required />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>{saving ? 'Publicando...' : 'Publicar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Netflix App Card ──────────────────────────────────────────────────────

function AppCard({
  app,
  categoryLabel,
  index,
  isAdmin,
  onEdit,
}: {
  app: App
  categoryLabel: string
  index: number
  isAdmin: boolean
  onEdit: (app: App) => void
}) {
  const [hovered, setHovered] = useState(false)

  // Resolve link based on link_type (with backwards-compat fallback)
  const isExternal = app.link_type === 'externo' || (!app.link_type && !!app.external_link)
  const href = isExternal ? (app.external_link ?? '#') : (app.internal_link ?? '#')

  return (
    <div
      className={styles.netflixCard}
      style={{
        backgroundImage: app.background_image ? `url(${app.background_image})` : undefined,
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`${styles.netflixOverlay} ${hovered ? styles.netflixOverlayHovered : ''}`} />
      {isAdmin && (
        <button
          type="button"
          className={styles.appCardSettingsBtn}
          title="Editar aplicativo"
          onClick={event => {
            event.stopPropagation()
            onEdit(app)
          }}
        >
          <IconSettings />
        </button>
      )}
      <div className={styles.netflixCardContent}>
        <span className={styles.netflixCategory}>{categoryLabel}</span>
        <h3 className={styles.netflixTitle}>{app.name}</h3>
        {app.description && <p className={styles.netflixDescription}>{app.description}</p>}
        <div className={`${styles.netflixExpandable} ${hovered ? styles.netflixExpandableOpen : ''}`}>
          <div className={styles.netflixActions}>
            <a
              href={href}
              className={styles.netflixBtnPrimary}
              {...(isExternal ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              Acessar {isExternal && <IconExternal />}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function DashboardPage({ user, onLogout, theme, onToggleTheme }: DashboardPageProps) {
  const [activePage, setActivePage]   = useState<Page>('aplicativos')
  const [activeCategory, setActiveCategory] = useState('todos')
  const [forumFilter, setForumFilter] = useState('todos')
  const [openTopicId, setOpenTopicId] = useState<string | null>(null)
  const [isAdmin,     setIsAdmin]     = useState(false)

  // Supabase data
  const [apps,       setApps]       = useState<App[]>([])
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [topics,     setTopics]     = useState<ForumTopicWithMeta[]>([])
  const [loadingApps,   setLoadingApps]   = useState(true)
  const [loadingTopics, setLoadingTopics] = useState(true)

  // Modals
  const [showCreateApp,   setShowCreateApp]   = useState(false)
  const [showCreateCat,   setShowCreateCat]   = useState(false)
  const [showCreateTopic, setShowCreateTopic] = useState(false)
  const [showSettings,    setShowSettings]    = useState(false)
  const [editingApp,      setEditingApp]      = useState<App | null>(null)
  const appsListRef = useRef<HTMLDivElement | null>(null)
  const categorySectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Check if current user is admin
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('role').eq('id', data.user.id).single()
        .then(({ data: profile }) => setIsAdmin(profile?.role === 'admin'))
    })
  }, [])

  // ── Fetch categories ──
  const fetchCategories = async () => {
    const { data } = await supabase.from('app_categories').select('*').order('name')
    if (data) setCategories(data)
  }

  // ── Fetch apps ──
  const fetchApps = async () => {
    setLoadingApps(true)
    const { data } = await supabase.from('apps').select('*').order('name')
    if (data) {
      const seen = new Set<string>()
      setApps(data.filter(app => seen.has(app.id) ? false : (seen.add(app.id), true)))
    }
    setLoadingApps(false)
  }

  // ── Fetch topics ──
  const fetchTopics = async () => {
    setLoadingTopics(true)
    const { data } = await supabase
      .from('forum_topics')
      .select(`*, profiles(name, avatar_url), forum_categories(name, slug)`)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) {
      // Get reply counts
      const withCounts = await Promise.all(
        (data as any[]).map(async t => {
          const { count } = await supabase
            .from('forum_replies')
            .select('id', { count: 'exact', head: true })
            .eq('topic_id', t.id)
          return { ...t, reply_count: count ?? 0 }
        })
      )
      setTopics(withCounts)
    }
    setLoadingTopics(false)
  }

  useEffect(() => { fetchCategories() }, [])
  useEffect(() => { fetchApps()       }, [])
  useEffect(() => { fetchTopics()     }, [])

  // Realtime: new apps
  useEffect(() => {
    const ch = supabase.channel('apps-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apps' }, fetchApps)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Realtime: new topics
  useEffect(() => {
    const ch = supabase.channel('topics-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics' }, fetchTopics)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const allCategories = [{ id: 'all', name: 'Todos', slug: 'todos' } as AppCategory, ...categories]
  const filteredApps  = apps
  const filteredTopics = forumFilter === 'todos' ? topics : topics.filter(t => t.forum_categories?.slug === forumFilter)

  const getCategoryLabel = (slug: string) => categories.find(c => c.slug === slug)?.name ?? slug

  const appsByCategory: AppCategoryRow[] = categories
    .map(category => ({
      ...category,
      apps: filteredApps.filter(app => app.category === category.slug),
    }))
    .filter(category => category.apps.length > 0)

  const uncategorizedApps = filteredApps.filter(app => !categories.some(category => category.slug === app.category))

  if (uncategorizedApps.length > 0) {
    appsByCategory.push({
      id: 'uncategorized',
      name: 'Outros',
      slug: 'outros',
      created_at: '',
      apps: uncategorizedApps,
    })
  }

  const handleCategoryClick = (slug: string) => {
    setActiveCategory(slug)
    if (slug === 'todos') {
      appsListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const target = categorySectionRefs.current[slug]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const navItems = [
    { id: 'aplicativos' as Page, label: 'Aplicativos', icon: <IconApps /> },
    { id: 'comunidade'  as Page, label: 'Comunidade',  icon: <IconCommunity /> },
    { id: 'perfil'      as Page, label: 'Perfil',      icon: <IconProfile /> },
  ]

  // Forum topic detail view overlays the community page
  if (activePage === 'comunidade' && openTopicId) {
    return (
      <div className={styles.layout}>
        <TopNavigation
          navItems={navItems}
          activePage={activePage}
          onSelect={page => { setActivePage(page); setOpenTopicId(null) }}
          isAdmin={isAdmin}
          onSettings={() => setShowSettings(true)}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
        <main className={styles.mainTopNavOnly}>
          <ForumTopicPage topicId={openTopicId} currentUser={user} onBack={() => setOpenTopicId(null)} />
        </main>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <TopNavigation
        navItems={navItems}
        activePage={activePage}
        onSelect={setActivePage}
        isAdmin={isAdmin}
        onSettings={() => setShowSettings(true)}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className={styles.mainTopNavOnly}>

        {/* APLICATIVOS */}
        {activePage === 'aplicativos' && (
          <div className={styles.pageContent} key="apps">
            {/* Categories */}
            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                {allCategories.map(cat => (
                  <CategoryChip
                    key={cat.slug}
                    label={cat.name}
                    active={activeCategory === cat.slug}
                    onClick={() => handleCategoryClick(cat.slug)}
                  />
                ))}
              </div>
              {isAdmin && (
                <DesignIconButton onClick={() => setShowCreateCat(true)} title="Nova categoria">
                  <IconTag />
                </DesignIconButton>
              )}
            </div>

            {loadingApps ? (
              <div className={styles.centeredSpinner}><Spinner /></div>
            ) : filteredApps.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Nenhum app encontrado nesta categoria.</p>
                {isAdmin && (
                  <DesignButton variant="primary" onClick={() => setShowCreateApp(true)}>
                    <span className={styles.topNavButtonContent}><IconPlus /><span>Criar primeiro app</span></span>
                  </DesignButton>
                )}
              </div>
            ) : (
              <div className={styles.categoryRows} ref={appsListRef}>
                {appsByCategory.map(category => (
                  <section
                    key={category.id}
                    className={styles.categoryRowSection}
                    ref={el => { categorySectionRefs.current[category.slug] = el }}
                  >
                    <div className={styles.categoryRowHeader}>
                      <h3 className={styles.categoryRowTitle}>{category.name}</h3>
                      <span className={styles.sectionCount}>{category.apps.length} apps</span>
                    </div>
                    <div className={styles.netflixRow}>
                      {category.apps.map((app, i) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          index={i}
                          categoryLabel={getCategoryLabel(app.category)}
                          isAdmin={isAdmin}
                          onEdit={setEditingApp}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COMUNIDADE */}
        {activePage === 'comunidade' && (
          <div className={styles.pageContent} key="community">
            <div className={styles.welcomeRow}>
              <div>
                <p className={styles.welcomeGreeting}>Fórum da comunidade</p>
                <h1 className={styles.welcomeName}>Comunidade</h1>
              </div>
              <DesignButton variant="primary" onClick={() => setShowCreateTopic(true)}>
                <span className={styles.topNavButtonContent}><IconPlus /><span>Novo Tópico</span></span>
              </DesignButton>
            </div>

            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                <CategoryChip label="Todos" active={forumFilter === 'todos'} onClick={() => setForumFilter('todos')} />
                {categories.map(cat => (
                  <CategoryChip
                    key={cat.slug}
                    label={cat.name}
                    active={forumFilter === cat.slug}
                    onClick={() => setForumFilter(cat.slug)}
                  />
                ))}
              </div>
            </div>

            {loadingTopics ? (
              <div className={styles.centeredSpinner}><Spinner /></div>
            ) : (
              <div className={styles.forumList}>
                {filteredTopics.length === 0 && (
                  <p className={styles.emptyTopics}>Nenhum tópico ainda. Seja o primeiro!</p>
                )}
                {filteredTopics.map((topic, i) => (
                  <div key={topic.id}
                    className={`${styles.forumTopic} ${topic.pinned ? styles.forumTopicPinned : ''}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => setOpenTopicId(topic.id)}>
                    <div className={styles.forumTopicMain}>
                      {topic.pinned && <span className={styles.forumPinBadge}><IconPin /> Fixado</span>}
                      <h3 className={styles.forumTopicTitle}>{topic.title}</h3>
                      <div className={styles.forumTopicMeta}>
                        {topic.forum_categories && (
                          <span className={styles.forumCategoryTag}>{topic.forum_categories.name}</span>
                        )}
                        <span className={styles.forumAuthor}>
                          por <strong>{topic.profiles?.name ?? 'Anônimo'}</strong>
                        </span>
                        <span className={styles.forumDate}>
                          {new Date(topic.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    </div>
                    <div className={styles.forumTopicStats}>
                      <span className={styles.forumStat}><IconMessageSquare />{topic.reply_count}</span>
                      <span className={styles.forumStat}><IconEye />{topic.views}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PERFIL */}
        {activePage === 'perfil' && (
          <div className={styles.pageContent} key="profile">
            <div className={styles.profilePage}>
              <div className={styles.profileAvatar}>{user.name.charAt(0).toUpperCase()}</div>
              <h2 className={styles.profileName}>{user.name}</h2>
              <p className={styles.profileEmail}>{user.email}</p>
              <div className={styles.profileCard}>
                {[
                  { label: 'Nome',   value: user.name },
                  { label: 'E-mail', value: user.email },
                ].map(f => (
                  <div key={f.label} className={styles.profileField}>
                    <span className={styles.profileFieldLabel}>{f.label}</span>
                    <span className={styles.profileFieldValue}>{f.value}</span>
                  </div>
                ))}
                <div className={styles.profileField}>
                  <span className={styles.profileFieldLabel}>Função</span>
                  <span className={styles.profileFieldBadge}>{isAdmin ? 'Admin' : 'Usuário'}</span>
                </div>
              </div>
              <button className={styles.logoutButtonProfile} onClick={onLogout}>Sair da conta</button>
            </div>
          </div>
        )}
      </main>

      {showCreateApp  && <CreateAppModal categories={categories} onClose={() => setShowCreateApp(false)}  onCreated={fetchApps} />}
      {editingApp && (
        <EditAppModal
          app={editingApp}
          categories={categories}
          onClose={() => setEditingApp(null)}
          onUpdated={fetchApps}
        />
      )}
      {showCreateCat  && <CreateCategoryModal onClose={() => setShowCreateCat(false)}  onCreated={fetchCategories} />}
      {showCreateTopic && <CreateTopicModal   onClose={() => setShowCreateTopic(false)} onCreated={fetchTopics} />}
      {showSettings   && <AdminSettingsModal  onClose={() => setShowSettings(false)} />}
    </div>
  )
}
