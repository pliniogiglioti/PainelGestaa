import { ReactNode, useEffect, useRef, useState } from 'react'
import styles from './DashboardPage.module.css'
import { User } from '../App'
import { supabase } from '../lib/supabase'
import type { App, AppCategory, DreClassificacao, ForumTopicWithMeta } from '../lib/types'
import ForumTopicPage from './ForumTopicPage'

type Page = 'aplicativos' | 'comunidade' | 'perfil'

const GROQ_MODELS = [
  { value: 'llama-3.3-70b-versatile',        label: 'Llama 3.3 70B Versatile (Recomendado)' },
  { value: 'llama-3.1-8b-instant',           label: 'Llama 3.1 8B Instant (Rápido)' },
  { value: 'mixtral-8x7b-32768',             label: 'Mixtral 8x7B (32K contexto)' },
  { value: 'gemma2-9b-it',                   label: 'Gemma2 9B' },
  { value: 'deepseek-r1-distill-llama-70b',  label: 'DeepSeek R1 70B' },
]

interface DashboardPageProps {
  user: User
  onLogout: () => void
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

// ── Spinner ───────────────────────────────────────────────────────────────

function Spinner() {
  return <div className={styles.spinner} />
}

function DesignSection({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className={styles.designSection}>
      <div className={styles.designSectionHead}>
        <p className={styles.designEyebrow}>{eyebrow}</p>
        <h2 className={styles.designTitle}>{title}</h2>
        <p className={styles.designSubtitle}>{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function DesignButton({
  children,
  onClick,
  variant = 'ghost',
  active = false,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'ghost' | 'primary' | 'pill'
  active?: boolean
  title?: string
}) {
  const variantClass = variant === 'primary'
    ? styles.designButtonPrimary
    : variant === 'pill'
      ? styles.designButtonPill
      : styles.designButtonGhost

  return (
    <button
      className={`${styles.designButtonBase} ${variantClass} ${active ? styles.designButtonActive : ''}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  )
}

function DesignIconButton({ children, onClick, title }: { children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button type="button" className={styles.designIconButton} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

function TopNavigation({
  navItems,
  activePage,
  onSelect,
  isAdmin,
  onSettings,
  onLogout,
}: {
  navItems: { id: Page; label: string; icon: ReactNode }[]
  activePage: Page
  onSelect: (page: Page) => void
  isAdmin: boolean
  onSettings: () => void
  onLogout: () => void
}) {
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

function AdminSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab,            setTab]            = useState<'modelo' | 'classificacoes'>('modelo')
  const [modeloAtual,    setModeloAtual]    = useState('llama-3.3-70b-versatile')
  const [savingModelo,   setSavingModelo]   = useState(false)
  const [savedModelo,    setSavedModelo]    = useState(false)
  const [classificacoes, setClassificacoes] = useState<DreClassificacao[]>([])
  const [novaClassNome,  setNovaClassNome]  = useState('')
  const [novaClassTipo,  setNovaClassTipo]  = useState<'receita' | 'despesa'>('despesa')
  const [addingClass,    setAddingClass]    = useState(false)

  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('dre_classificacoes')
      .select('*')
      .order('tipo')
      .order('nome')
    setClassificacoes(data ?? [])
  }

  useEffect(() => {
    supabase.from('configuracoes').select('valor').eq('chave', 'modelo_groq').single()
      .then(({ data }) => { if (data) setModeloAtual(data.valor) })
    fetchClassificacoes()
  }, [])

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
                {GROQ_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className={styles.settingsHint}>
                Modelo usado para sugerir a classificação automática nos lançamentos do DRE.
              </p>
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

function AppCard({ app, categoryLabel, index }: { app: App; categoryLabel: string; index: number }) {
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

export default function DashboardPage({ user, onLogout }: DashboardPageProps) {
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
  const appsListRef = useRef<HTMLDivElement | null>(null)

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
  const filteredApps  = activeCategory === 'todos' ? apps : apps.filter(a => a.category === activeCategory)
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
    appsListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
              <>

                <DesignSection
                  eyebrow="Biblioteca"
                  title={activeCategory === 'todos' ? 'Todos os Aplicativos' : getCategoryLabel(activeCategory)}
                  subtitle="Todos os cards usam o mesmo tamanho para manter consistência visual."
                >
                  <div className={styles.sectionHeader} ref={appsListRef}>
                    <div className={styles.sectionLeft}>
                      <span className={styles.sectionCount}>{filteredApps.length} apps</span>
                    </div>
                    {isAdmin && (
                      <DesignButton variant="primary" onClick={() => setShowCreateApp(true)}>
                        <span className={styles.topNavButtonContent}><IconPlus /><span>Novo App</span></span>
                      </DesignButton>
                    )}
                  </div>

                  <div className={styles.categoryRows}>
                    {appsByCategory.map(category => (
                      <section key={category.id} className={styles.categoryRowSection}>
                        <div className={styles.categoryRowHeader}>
                          <h3 className={styles.categoryRowTitle}>{category.name}</h3>
                          <span className={styles.sectionCount}>{category.apps.length} apps</span>
                        </div>
                        <div className={styles.netflixRow}>
                          {category.apps.map((app, i) => (
                            <AppCard key={app.id} app={app} index={i} categoryLabel={getCategoryLabel(app.category)} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </DesignSection>
              </>
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
      {showCreateCat  && <CreateCategoryModal onClose={() => setShowCreateCat(false)}  onCreated={fetchCategories} />}
      {showCreateTopic && <CreateTopicModal   onClose={() => setShowCreateTopic(false)} onCreated={fetchTopics} />}
      {showSettings   && <AdminSettingsModal  onClose={() => setShowSettings(false)} />}
    </div>
  )
}
