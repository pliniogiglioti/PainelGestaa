import { useState, useRef } from 'react'
import styles from './DashboardPage.module.css'
import { User } from '../App'

type Page = 'aplicativos' | 'comunidade' | 'perfil'

interface DashboardPageProps {
  user: User
  onLogout: () => void
}

// Hardcoded — will come from Supabase
const IS_ADMIN = true

// ── Types ─────────────────────────────────────────────────────────────────

interface Category {
  id: string
  label: string
}

interface AppItem {
  id: number
  name: string
  description: string
  category: string
  externalLink: string
  internalLink: string
  backgroundImage: string
}

interface ForumTopic {
  id: number
  title: string
  category: string
  author: string
  date: string
  replies: number
  views: number
  pinned?: boolean
}

// ── Initial data ──────────────────────────────────────────────────────────

const INITIAL_CATEGORIES: Category[] = [
  { id: 'todos',         label: 'Todos' },
  { id: 'produtividade', label: 'Produtividade' },
  { id: 'financas',      label: 'Finanças' },
  { id: 'gestao',        label: 'Gestão' },
  { id: 'comunicacao',   label: 'Comunicação' },
  { id: 'relatorios',    label: 'Relatórios' },
  { id: 'estoque',       label: 'Estoque' },
]

const APPS: AppItem[] = [
  { id: 1,  name: 'GestCaixa',  description: 'Controle de caixa e fluxo financeiro em tempo real com dashboards interativos.',          category: 'financas',      externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/101/400/600' },
  { id: 2,  name: 'StockPro',   description: 'Gestão completa de estoque, inventário e rastreamento de produtos.',                        category: 'estoque',       externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/202/400/600' },
  { id: 3,  name: 'RelatóriOS', description: 'Relatórios e análises avançadas com exportação em PDF e Excel.',                            category: 'relatorios',    externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/303/400/600' },
  { id: 4,  name: 'ChatBiz',    description: 'Comunicação interna da equipe com canais, mensagens diretas e videochamadas.',              category: 'comunicacao',   externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/404/400/600' },
  { id: 5,  name: 'TaskFlow',   description: 'Gerenciamento de tarefas, projetos e sprints com metodologia ágil.',                       category: 'gestao',        externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/505/400/600' },
  { id: 6,  name: 'PagaFácil',  description: 'Pagamentos, cobranças e conciliação bancária em um só lugar.',                             category: 'financas',      externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/606/400/600' },
  { id: 7,  name: 'DocManager', description: 'Gestão de documentos, contratos e arquivos com assinatura digital.',                       category: 'produtividade', externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/707/400/600' },
  { id: 8,  name: 'HRConnect',  description: 'Gestão de recursos humanos, folha de pagamento e ponto eletrônico.',                       category: 'gestao',        externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/808/400/600' },
  { id: 9,  name: 'NoteFast',   description: 'Anotações rápidas, lembretes e base de conhecimento da equipe.',                           category: 'produtividade', externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/909/400/600' },
  { id: 10, name: 'VendaPro',   description: 'Sistema de vendas completo com PDV, CRM e gestão de clientes.',                            category: 'financas',      externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/110/400/600' },
  { id: 11, name: 'LogiTrack',  description: 'Rastreamento de logística, rotas de entrega e gestão de frotas.',                          category: 'estoque',       externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/211/400/600' },
  { id: 12, name: 'MeetSync',   description: 'Agendamento inteligente de reuniões, salas e integração com calendários.',                 category: 'comunicacao',   externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/312/400/600' },
]

const FORUM_TOPICS: ForumTopic[] = [
  { id: 1, title: 'Como integrar o GestCaixa com meu ERP?',         category: 'financas',      author: 'Ana Lima',      date: '22 fev',  replies: 12, views: 340, pinned: true },
  { id: 2, title: 'Dicas para otimizar o controle de estoque',      category: 'estoque',       author: 'Carlos Mota',   date: '21 fev',  replies: 8,  views: 210 },
  { id: 3, title: 'Relatórios personalizados — passo a passo',      category: 'relatorios',    author: 'Julia Santos',  date: '20 fev',  replies: 5,  views: 180 },
  { id: 4, title: 'Melhores práticas de gestão de equipe remota',   category: 'gestao',        author: 'Pedro Alves',   date: '19 fev',  replies: 23, views: 620 },
  { id: 5, title: 'Integração ChatBiz com WhatsApp Business',       category: 'comunicacao',   externalLink: '#', internalLink: '#', author: 'Mariana Costa', date: '18 fev', replies: 15, views: 440 } as any,
  { id: 6, title: 'Erro ao exportar PDF no RelatóriOS v2.1',        category: 'relatorios',    author: 'Rafael Nunes',  date: '17 fev',  replies: 3,  views: 95 },
  { id: 7, title: 'TaskFlow — como usar templates de projeto',      category: 'gestao',        author: 'Fernanda Lima', date: '16 fev',  replies: 9,  views: 280 },
  { id: 8, title: 'Configurando NoteFast para toda a equipe',       category: 'produtividade', author: 'Diego Silva',   date: '15 fev',  replies: 6,  views: 160 },
]

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
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const IconProfile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const IconLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
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
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const IconPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
)

// ── Modals ────────────────────────────────────────────────────────────────

interface NewAppForm {
  name: string
  description: string
  category: string
  externalLink: string
  internalLink: string
  backgroundImage: string
}

function CreateAppModal({ categories, onClose }: { categories: Category[], onClose: () => void }) {
  const [form, setForm] = useState<NewAppForm>({
    name: '', description: '', category: 'produtividade',
    externalLink: '', internalLink: '', backgroundImage: '',
  })

  const set = (f: keyof NewAppForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('New app:', form)
    onClose()
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
              <select className={styles.modalInput} value={form.category} onChange={set('category')}>
                {categories.filter(c => c.id !== 'todos').map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Descrição</label>
            <textarea className={`${styles.modalInput} ${styles.modalTextarea}`} placeholder="Descreva o que este app faz..." value={form.description} onChange={set('description')} required rows={3} />
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
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit}>Criar App</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateCategoryModal({ onClose, onCreate }: { onClose: () => void, onCreate: (cat: Category) => void }) {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
    onCreate({ id, label: name })
    onClose()
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
            <label className={styles.modalLabel}>Nome da categoria</label>
            <input className={styles.modalInput} placeholder="Ex: Marketing" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit}>Criar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Netflix Card ──────────────────────────────────────────────────────────

function AppCard({ app, categoryLabel, index }: { app: AppItem, categoryLabel: string, index: number }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={styles.netflixCard}
      style={{
        backgroundImage: `url(${app.backgroundImage})`,
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
          <p className={styles.netflixDescription}>{app.description}</p>
          <div className={styles.netflixActions}>
            <a href={app.internalLink} className={styles.netflixBtnPrimary}>Acessar</a>
            <a href={app.externalLink} className={styles.netflixBtnIcon} target="_blank" rel="noreferrer" title="Abrir externamente">
              <IconExternal />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [activePage, setActivePage]       = useState<Page>('aplicativos')
  const [activeCategory, setActiveCategory] = useState('todos')
  const [categories, setCategories]       = useState(INITIAL_CATEGORIES)
  const [showCreateApp, setShowCreateApp] = useState(false)
  const [showCreateCat, setShowCreateCat] = useState(false)
  const [forumFilter, setForumFilter]     = useState('todos')

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
    const dx = e.pageX - dragState.current.startX
    rowRef.current.scrollLeft = dragState.current.scrollLeft - dx
  }
  const onMouseUp = () => {
    dragState.current.dragging = false
    if (rowRef.current) rowRef.current.style.cursor = 'grab'
  }

  const filteredApps   = activeCategory === 'todos' ? APPS : APPS.filter(a => a.category === activeCategory)
  const filteredTopics = forumFilter    === 'todos' ? FORUM_TOPICS : FORUM_TOPICS.filter(t => t.category === forumFilter)

  const navItems = [
    { id: 'aplicativos' as Page, label: 'Aplicativos', icon: <IconApps /> },
    { id: 'comunidade'  as Page, label: 'Comunidade',  icon: <IconCommunity /> },
    { id: 'perfil'      as Page, label: 'Perfil',      icon: <IconProfile /> },
  ]

  return (
    <div className={styles.layout}>

      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          {/* Cross-fade: favicon → logo */}
          <img src="/favicon.png" width="30" height="30" alt="" className={styles.sidebarFavicon} />
          <img src="/logo.png"    height="26"            alt="PainelGestaa" className={styles.sidebarLogoFull} />
        </div>

        <nav className={styles.sidebarNav}>
          {navItems.map(item => (
            <button
              key={item.id}
              className={`${styles.navItem} ${activePage === item.id ? styles.navItemActive : ''}`}
              onClick={() => setActivePage(item.id)}
            >
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
            {/* Welcome — no avatar */}
            <div className={styles.welcomeRow}>
              <div>
                <p className={styles.welcomeGreeting}>Bem-vindo de volta,</p>
                <h1 className={styles.welcomeName}>{user.name} 👋</h1>
              </div>
            </div>

            {/* Categories row */}
            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    className={`${styles.categoryChip} ${activeCategory === cat.id ? styles.categoryChipActive : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {IS_ADMIN && (
                <button className={styles.btnIconGhost} onClick={() => setShowCreateCat(true)} title="Nova categoria">
                  <IconTag />
                </button>
              )}
            </div>

            {/* Section header */}
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLeft}>
                <h2 className={styles.sectionTitle}>
                  {activeCategory === 'todos' ? 'Todos os Aplicativos' : categories.find(c => c.id === activeCategory)?.label}
                </h2>
                <span className={styles.sectionCount}>{filteredApps.length} apps</span>
              </div>
              {IS_ADMIN && (
                <button className={styles.adminCreateBtn} onClick={() => setShowCreateApp(true)}>
                  <IconPlus /> Novo App
                </button>
              )}
            </div>

            {/* Netflix cards — drag to scroll */}
            <div
              className={styles.netflixRow}
              ref={rowRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {filteredApps.map((app, i) => (
                <AppCard
                  key={app.id}
                  app={app}
                  index={i}
                  categoryLabel={categories.find(c => c.id === app.category)?.label ?? app.category}
                />
              ))}
            </div>
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
              <button className={styles.adminCreateBtn}>
                <IconPlus /> Novo Tópico
              </button>
            </div>

            {/* Forum category filter */}
            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                {[{ id: 'todos', label: 'Todos' }, ...categories.filter(c => c.id !== 'todos')].map(cat => (
                  <button
                    key={cat.id}
                    className={`${styles.categoryChip} ${forumFilter === cat.id ? styles.categoryChipActive : ''}`}
                    onClick={() => setForumFilter(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Topics list */}
            <div className={styles.forumList}>
              {filteredTopics.map((topic, i) => (
                <div
                  key={topic.id}
                  className={`${styles.forumTopic} ${topic.pinned ? styles.forumTopicPinned : ''}`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className={styles.forumTopicMain}>
                    {topic.pinned && (
                      <span className={styles.forumPinBadge}>
                        <IconPin /> Fixado
                      </span>
                    )}
                    <h3 className={styles.forumTopicTitle}>{topic.title}</h3>
                    <div className={styles.forumTopicMeta}>
                      <span className={styles.forumCategoryTag}>
                        {categories.find(c => c.id === topic.category)?.label ?? topic.category}
                      </span>
                      <span className={styles.forumAuthor}>por <strong>{topic.author}</strong></span>
                      <span className={styles.forumDate}>{topic.date}</span>
                    </div>
                  </div>
                  <div className={styles.forumTopicStats}>
                    <span className={styles.forumStat}><IconMessageSquare />{topic.replies}</span>
                    <span className={styles.forumStat}><IconEye />{topic.views}</span>
                  </div>
                </div>
              ))}
            </div>
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
                <div className={styles.profileField}>
                  <span className={styles.profileFieldLabel}>Nome</span>
                  <span className={styles.profileFieldValue}>{user.name}</span>
                </div>
                <div className={styles.profileField}>
                  <span className={styles.profileFieldLabel}>E-mail</span>
                  <span className={styles.profileFieldValue}>{user.email}</span>
                </div>
                <div className={styles.profileField}>
                  <span className={styles.profileFieldLabel}>Função</span>
                  <span className={styles.profileFieldBadge}>{IS_ADMIN ? 'Admin' : 'Usuário'}</span>
                </div>
                <div className={styles.profileField}>
                  <span className={styles.profileFieldLabel}>Plano</span>
                  <span className={styles.profileFieldBadge}>Pro</span>
                </div>
              </div>

              <button className={styles.logoutButtonProfile} onClick={onLogout}>Sair da conta</button>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {showCreateApp && (
        <CreateAppModal categories={categories} onClose={() => setShowCreateApp(false)} />
      )}
      {showCreateCat && (
        <CreateCategoryModal
          onClose={() => setShowCreateCat(false)}
          onCreate={cat => setCategories(prev => [...prev, cat])}
        />
      )}
    </div>
  )
}
