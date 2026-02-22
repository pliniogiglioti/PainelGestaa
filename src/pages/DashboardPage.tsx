import { useState, useEffect, useRef } from 'react'
import styles from './DashboardPage.module.css'
import { User } from '../App'
import { supabase } from '../lib/supabase'
import type { App, AppCategory, ForumTopicWithMeta } from '../lib/types'
import ForumTopicPage from './ForumTopicPage'

type Page = 'aplicativos' | 'comunidade' | 'perfil'

interface DashboardPageProps {
  user: User
  onLogout: () => void
}

const IS_ADMIN = true  // TODO: pull from profiles.role once auth is wired

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

// ── Spinner ───────────────────────────────────────────────────────────────

function Spinner() {
  return <div className={styles.spinner} />
}

// ── Modals ────────────────────────────────────────────────────────────────

interface NewAppForm {
  name: string; description: string; category: string
  externalLink: string; internalLink: string; backgroundImage: string
}

function CreateAppModal({ categories, onClose, onCreated }: {
  categories: AppCategory[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<NewAppForm>({
    name: '', description: '', category: '',
    externalLink: '', internalLink: '', backgroundImage: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (f: keyof NewAppForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')

    const { error } = await supabase.from('apps').insert({
      name:             form.name,
      description:      form.description || null,
      category:         form.category,
      external_link:    form.externalLink || null,
      internal_link:    form.internalLink || null,
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
          <div className={styles.modalRow}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Link Externo</label>
              <input className={styles.modalInput} type="url" placeholder="https://app.exemplo.com" value={form.externalLink} onChange={set('externalLink')} />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Link Interno</label>
              <input className={styles.modalInput} placeholder="/apps/gestcaixa" value={form.internalLink} onChange={set('internalLink')} />
            </div>
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
        <div className={`${styles.netflixExpandable} ${hovered ? styles.netflixExpandableOpen : ''}`}>
          {app.description && <p className={styles.netflixDescription}>{app.description}</p>}
          <div className={styles.netflixActions}>
            <a href={app.internal_link ?? '#'} className={styles.netflixBtnPrimary}>Acessar</a>
            {app.external_link && (
              <a href={app.external_link} className={styles.netflixBtnIcon} target="_blank" rel="noreferrer" title="Abrir externamente">
                <IconExternal />
              </a>
            )}
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

  // Drag-to-scroll
  const rowRef    = useRef<HTMLDivElement>(null)
  const dragState = useRef({ dragging: false, startX: 0, scrollLeft: 0 })

  const onMouseDown = (e: React.MouseEvent) => {
    dragState.current = { dragging: true, startX: e.pageX, scrollLeft: rowRef.current?.scrollLeft ?? 0 }
    if (rowRef.current) rowRef.current.style.cursor = 'grabbing'
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current.dragging || !rowRef.current) return
    e.preventDefault()
    rowRef.current.scrollLeft = dragState.current.scrollLeft - (e.pageX - dragState.current.startX)
  }
  const onMouseUp = () => {
    dragState.current.dragging = false
    if (rowRef.current) rowRef.current.style.cursor = 'grab'
  }

  // ── Fetch categories ──
  const fetchCategories = async () => {
    const { data } = await supabase.from('app_categories').select('*').order('name')
    if (data) setCategories(data)
  }

  // ── Fetch apps ──
  const fetchApps = async () => {
    setLoadingApps(true)
    const { data } = await supabase.from('apps').select('*').order('name')
    if (data) setApps(data)
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

  const navItems = [
    { id: 'aplicativos' as Page, label: 'Aplicativos', icon: <IconApps /> },
    { id: 'comunidade'  as Page, label: 'Comunidade',  icon: <IconCommunity /> },
    { id: 'perfil'      as Page, label: 'Perfil',      icon: <IconProfile /> },
  ]

  // Forum topic detail view overlays the community page
  if (activePage === 'comunidade' && openTopicId) {
    return (
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <img src="/favicon.png" width="30" height="30" alt="" className={styles.sidebarFavicon} />
            <img src="/logo.png" height="26" alt="PainelGestaa" className={styles.sidebarLogoFull} />
          </div>
          <nav className={styles.sidebarNav}>
            {navItems.map(item => (
              <button key={item.id}
                className={`${styles.navItem} ${activePage === item.id ? styles.navItemActive : ''}`}
                onClick={() => { setActivePage(item.id); setOpenTopicId(null) }}>
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className={styles.sidebarBottom}>
            <button className={styles.logoutButton} onClick={onLogout}>
              <span className={styles.navIcon}><IconLogout /></span>
              <span className={styles.navLabel}>Sair</span>
            </button>
          </div>
        </aside>
        <main className={styles.main}>
          <ForumTopicPage topicId={openTopicId} currentUser={user} onBack={() => setOpenTopicId(null)} />
        </main>
      </div>
    )
  }

  return (
    <div className={styles.layout}>

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <img src="/favicon.png" width="30" height="30" alt="" className={styles.sidebarFavicon} />
          <img src="/logo.png" height="26" alt="PainelGestaa" className={styles.sidebarLogoFull} />
        </div>
        <nav className={styles.sidebarNav}>
          {navItems.map(item => (
            <button key={item.id}
              className={`${styles.navItem} ${activePage === item.id ? styles.navItemActive : ''}`}
              onClick={() => setActivePage(item.id)}>
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <button className={styles.logoutButton} onClick={onLogout}>
            <span className={styles.navIcon}><IconLogout /></span>
            <span className={styles.navLabel}>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className={styles.main}>

        {/* APLICATIVOS */}
        {activePage === 'aplicativos' && (
          <div className={styles.pageContent} key="apps">
            <div className={styles.welcomeRow}>
              <div>
                <p className={styles.welcomeGreeting}>Bem-vindo de volta,</p>
                <h1 className={styles.welcomeName}>{user.name} 👋</h1>
              </div>
            </div>

            {/* Categories */}
            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                {allCategories.map(cat => (
                  <button key={cat.slug}
                    className={`${styles.categoryChip} ${activeCategory === cat.slug ? styles.categoryChipActive : ''}`}
                    onClick={() => setActiveCategory(cat.slug)}>
                    {cat.name}
                  </button>
                ))}
              </div>
              {IS_ADMIN && (
                <button className={styles.btnIconGhost} onClick={() => setShowCreateCat(true)} title="Nova categoria">
                  <IconTag />
                </button>
              )}
            </div>

            <div className={styles.sectionHeader}>
              <div className={styles.sectionLeft}>
                <h2 className={styles.sectionTitle}>
                  {activeCategory === 'todos' ? 'Todos os Aplicativos' : getCategoryLabel(activeCategory)}
                </h2>
                <span className={styles.sectionCount}>{filteredApps.length} apps</span>
              </div>
              {IS_ADMIN && (
                <button className={styles.adminCreateBtn} onClick={() => setShowCreateApp(true)}>
                  <IconPlus /> Novo App
                </button>
              )}
            </div>

            {loadingApps ? (
              <div className={styles.centeredSpinner}><Spinner /></div>
            ) : filteredApps.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Nenhum app encontrado nesta categoria.</p>
                {IS_ADMIN && <button className={styles.adminCreateBtn} onClick={() => setShowCreateApp(true)}><IconPlus /> Criar primeiro app</button>}
              </div>
            ) : (
              <div className={styles.netflixRow} ref={rowRef}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove}
                onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
                {filteredApps.map((app, i) => (
                  <AppCard key={app.id} app={app} index={i} categoryLabel={getCategoryLabel(app.category)} />
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
              <button className={styles.adminCreateBtn} onClick={() => setShowCreateTopic(true)}>
                <IconPlus /> Novo Tópico
              </button>
            </div>

            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                <button className={`${styles.categoryChip} ${forumFilter === 'todos' ? styles.categoryChipActive : ''}`}
                  onClick={() => setForumFilter('todos')}>Todos</button>
                {categories.map(cat => (
                  <button key={cat.slug}
                    className={`${styles.categoryChip} ${forumFilter === cat.slug ? styles.categoryChipActive : ''}`}
                    onClick={() => setForumFilter(cat.slug)}>
                    {cat.name}
                  </button>
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
                  <span className={styles.profileFieldBadge}>{IS_ADMIN ? 'Admin' : 'Usuário'}</span>
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
    </div>
  )
}
