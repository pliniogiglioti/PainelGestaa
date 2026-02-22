import { useState } from 'react'
import styles from './DashboardPage.module.css'
import { User } from '../App'

type Page = 'aplicativos' | 'comunidade' | 'perfil'

interface DashboardPageProps {
  user: User
  onLogout: () => void
}

const APP_CATEGORIES = [
  { id: 'todos',         label: 'Todos' },
  { id: 'produtividade', label: 'Produtividade' },
  { id: 'financas',      label: 'Finanças' },
  { id: 'gestao',        label: 'Gestão' },
  { id: 'comunicacao',   label: 'Comunicação' },
  { id: 'relatorios',    label: 'Relatórios' },
  { id: 'estoque',       label: 'Estoque' },
]

interface AppItem {
  id: number
  name: string
  description: string
  category: string
  externalLink: string
  internalLink: string
  backgroundImage: string
}

// Placeholder data — will come from Supabase
const APPS: AppItem[] = [
  { id: 1,  name: 'GestCaixa',   description: 'Controle de caixa em tempo real',          category: 'financas',      externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/101/400/600' },
  { id: 2,  name: 'StockPro',    description: 'Gestão completa de estoque e inventário',   category: 'estoque',       externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/202/400/600' },
  { id: 3,  name: 'RelatóriOS',  description: 'Relatórios e análises avançadas',           category: 'relatorios',    externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/303/400/600' },
  { id: 4,  name: 'ChatBiz',     description: 'Comunicação interna da equipe',             category: 'comunicacao',   externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/404/400/600' },
  { id: 5,  name: 'TaskFlow',    description: 'Gerenciamento de tarefas e projetos',       category: 'gestao',        externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/505/400/600' },
  { id: 6,  name: 'PagaFácil',   description: 'Pagamentos e cobranças simplificadas',      category: 'financas',      externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/606/400/600' },
  { id: 7,  name: 'DocManager',  description: 'Gestão de documentos e arquivos',           category: 'produtividade', externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/707/400/600' },
  { id: 8,  name: 'HRConnect',   description: 'Gestão de recursos humanos',                category: 'gestao',        externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/808/400/600' },
  { id: 9,  name: 'NoteFast',    description: 'Anotações rápidas e lembretes',             category: 'produtividade', externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/909/400/600' },
  { id: 10, name: 'VendaPro',    description: 'Sistema de vendas completo',                category: 'financas',      externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/110/400/600' },
  { id: 11, name: 'LogiTrack',   description: 'Rastreamento de logística e entregas',      category: 'estoque',       externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/211/400/600' },
  { id: 12, name: 'MeetSync',    description: 'Agendamento inteligente de reuniões',       category: 'comunicacao',   externalLink: '#', internalLink: '#', backgroundImage: 'https://picsum.photos/seed/312/400/600' },
]

// ── Icons ─────────────────────────────────────────────────────────────────

function IconApps() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  )
}

function IconCommunity() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

function IconExternal() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}

// ── Create App Modal ──────────────────────────────────────────────────────

interface NewAppForm {
  name: string
  category: string
  externalLink: string
  internalLink: string
  backgroundImage: string
}

function CreateAppModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<NewAppForm>({
    name: '',
    category: 'produtividade',
    externalLink: '',
    internalLink: '',
    backgroundImage: '',
  })

  const set = (field: keyof NewAppForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: save to Supabase
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
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Nome</label>
            <input className={styles.modalInput} placeholder="Ex: GestCaixa" value={form.name} onChange={set('name')} required />
          </div>

          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Categoria</label>
            <select className={styles.modalInput} value={form.category} onChange={set('category')}>
              {APP_CATEGORIES.filter(c => c.id !== 'todos').map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Link Externo</label>
            <input className={styles.modalInput} type="url" placeholder="https://app.exemplo.com" value={form.externalLink} onChange={set('externalLink')} />
          </div>

          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Link Interno</label>
            <input className={styles.modalInput} placeholder="/apps/gestcaixa" value={form.internalLink} onChange={set('internalLink')} />
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

// ── Netflix App Card ──────────────────────────────────────────────────────

function AppCard({ app }: { app: AppItem }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={styles.netflixCard}
      style={{ backgroundImage: `url(${app.backgroundImage})` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`${styles.netflixOverlay} ${hovered ? styles.netflixOverlayHovered : ''}`} />

      <div className={styles.netflixCardContent}>
        <span className={styles.netflixCategory}>
          {APP_CATEGORIES.find(c => c.id === app.category)?.label ?? app.category}
        </span>
        <h3 className={styles.netflixTitle}>{app.name}</h3>

        {hovered && (
          <p className={styles.netflixDescription}>{app.description}</p>
        )}

        <div className={styles.netflixActions}>
          <a href={app.internalLink} className={styles.netflixBtnPrimary}>
            Acessar
          </a>
          <a href={app.externalLink} className={styles.netflixBtnIcon} target="_blank" rel="noreferrer" title="Abrir externamente">
            <IconExternal />
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

// Hardcoded for now — will come from Supabase user profile
const IS_ADMIN = true

export default function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [activePage, setActivePage]     = useState<Page>('aplicativos')
  const [activeCategory, setActiveCategory] = useState('todos')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const filteredApps = activeCategory === 'todos'
    ? APPS
    : APPS.filter(app => app.category === activeCategory)

  const navItems = [
    { id: 'aplicativos' as Page, label: 'Aplicativos', icon: <IconApps /> },
    { id: 'comunidade'  as Page, label: 'Comunidade',   icon: <IconCommunity /> },
    { id: 'perfil'      as Page, label: 'Perfil',        icon: <IconProfile /> },
  ]

  return (
    <div className={styles.layout}>

      {/* ── Sidebar Netflix ── */}
      <aside className={styles.sidebar}>
        {/* Logo — favicon only when collapsed, full logo on hover */}
        <div className={styles.sidebarLogo}>
          <img src="/favicon.png" width="30" height="30" alt="Logo" className={styles.sidebarFavicon} />
          <img src="/logo.png"   height="28"             alt="PainelGestaa" className={styles.sidebarLogoFull} />
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
          <div className={styles.pageContent}>

            {/* Welcome — no card, just text */}
            <div className={styles.welcomeRow}>
              <div>
                <p className={styles.welcomeGreeting}>Bem-vindo de volta,</p>
                <h1 className={styles.welcomeName}>{user.name} 👋</h1>
              </div>
              <div className={styles.welcomeAvatar}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Categories */}
            <div className={styles.categoriesScroll}>
              {APP_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`${styles.categoryChip} ${activeCategory === cat.id ? styles.categoryChipActive : ''}`}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Section header */}
            <div className={styles.sectionHeader}>
              <div className={styles.sectionLeft}>
                <h2 className={styles.sectionTitle}>
                  {activeCategory === 'todos'
                    ? 'Todos os Aplicativos'
                    : APP_CATEGORIES.find(c => c.id === activeCategory)?.label}
                </h2>
                <span className={styles.sectionCount}>{filteredApps.length} apps</span>
              </div>

              {IS_ADMIN && (
                <button
                  className={styles.adminCreateBtn}
                  onClick={() => setShowCreateModal(true)}
                >
                  <IconPlus />
                  Novo App
                </button>
              )}
            </div>

            {/* Netflix cards row */}
            <div className={styles.netflixRow}>
              {filteredApps.map(app => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          </div>
        )}

        {/* COMUNIDADE */}
        {activePage === 'comunidade' && (
          <div className={styles.pageContent}>
            <div className={styles.placeholderPage}>
              <div className={styles.placeholderIcon}><IconCommunity /></div>
              <h2 className={styles.placeholderTitle}>Comunidade</h2>
              <p className={styles.placeholderText}>Conecte-se com outros usuários, compartilhe experiências e tire dúvidas.</p>
              <button className={styles.placeholderButton}>Em breve</button>
            </div>
          </div>
        )}

        {/* PERFIL */}
        {activePage === 'perfil' && (
          <div className={styles.pageContent}>
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

      {/* Modal criar app */}
      {showCreateModal && <CreateAppModal onClose={() => setShowCreateModal(false)} />}
    </div>
  )
}
