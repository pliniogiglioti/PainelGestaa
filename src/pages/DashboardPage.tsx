import { useState } from 'react'
import styles from './DashboardPage.module.css'
import { User } from '../App'

type Page = 'aplicativos' | 'comunidade' | 'perfil'

interface DashboardPageProps {
  user: User
  onLogout: () => void
}

const APP_CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'produtividade', label: 'Produtividade' },
  { id: 'financas', label: 'Finanças' },
  { id: 'gestao', label: 'Gestão' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'estoque', label: 'Estoque' },
]

interface AppItem {
  id: number
  name: string
  description: string
  category: string
  icon: string
  rating: number
  installs: string
}

const APPS: AppItem[] = [
  { id: 1,  name: 'GestCaixa',   description: 'Controle de caixa em tempo real',          category: 'financas',      icon: '💰', rating: 4.8, installs: '10k+' },
  { id: 2,  name: 'StockPro',    description: 'Gestão completa de estoque e inventário',   category: 'estoque',       icon: '📦', rating: 4.6, installs: '8k+' },
  { id: 3,  name: 'RelatóriOS',  description: 'Relatórios e análises avançadas',           category: 'relatorios',    icon: '📊', rating: 4.7, installs: '12k+' },
  { id: 4,  name: 'ChatBiz',     description: 'Comunicação interna da equipe',             category: 'comunicacao',   icon: '💬', rating: 4.5, installs: '15k+' },
  { id: 5,  name: 'TaskFlow',    description: 'Gerenciamento de tarefas e projetos',       category: 'gestao',        icon: '✅', rating: 4.9, installs: '20k+' },
  { id: 6,  name: 'PagaFácil',   description: 'Pagamentos e cobranças simplificadas',      category: 'financas',      icon: '💳', rating: 4.4, installs: '7k+' },
  { id: 7,  name: 'DocManager',  description: 'Gestão de documentos e arquivos',           category: 'produtividade', icon: '📁', rating: 4.3, installs: '5k+' },
  { id: 8,  name: 'HRConnect',   description: 'Gestão de recursos humanos',                category: 'gestao',        icon: '👥', rating: 4.6, installs: '9k+' },
  { id: 9,  name: 'NoteFast',    description: 'Anotações rápidas e lembretes',             category: 'produtividade', icon: '📝', rating: 4.2, installs: '18k+' },
  { id: 10, name: 'VendaPro',    description: 'Sistema de vendas completo',                category: 'financas',      icon: '🛒', rating: 4.8, installs: '11k+' },
  { id: 11, name: 'LogiTrack',   description: 'Rastreamento de logística e entregas',      category: 'estoque',       icon: '🚚', rating: 4.5, installs: '6k+' },
  { id: 12, name: 'MeetSync',    description: 'Agendamento inteligente de reuniões',       category: 'comunicacao',   icon: '📅', rating: 4.7, installs: '13k+' },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className={styles.starRating}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill={star <= Math.round(rating) ? '#c9a22a' : 'none'}
          stroke="#c9a22a"
          strokeWidth="2"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
      <span className={styles.ratingText}>{rating}</span>
    </div>
  )
}

// ── Sidebar icons ────────────────────────────────────────────────────────────

function IconApps() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function IconCommunity() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// Logo icon (checkmark in golden square)
function LogoIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <rect width="36" height="36" rx="8" fill="url(#goldGrad)" />
      <path d="M10 18L16 24L26 12" stroke="#080808" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e8c84e" />
          <stop offset="100%" stopColor="#8b6914" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [activePage, setActivePage] = useState<Page>('aplicativos')
  const [activeCategory, setActiveCategory] = useState('todos')

  const filteredApps = activeCategory === 'todos'
    ? APPS
    : APPS.filter((app) => app.category === activeCategory)

  const navItems = [
    { id: 'aplicativos' as Page, label: 'Aplicativos', icon: <IconApps /> },
    { id: 'comunidade' as Page, label: 'Comunidade',   icon: <IconCommunity /> },
    { id: 'perfil'      as Page, label: 'Perfil',       icon: <IconProfile /> },
  ]

  return (
    <div className={styles.layout}>
      {/* ── Sidebar Netflix-style ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <LogoIcon />
          <span className={styles.sidebarLogoText}>PainelGestaa</span>
        </div>

        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
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

      {/* ── Main Content ── */}
      <main className={styles.main}>

        {/* Aplicativos */}
        {activePage === 'aplicativos' && (
          <div className={styles.pageContent}>
            <div className={styles.welcomeHeader}>
              <div className={styles.welcomeText}>
                <p className={styles.welcomeGreeting}>Bem-vindo de volta,</p>
                <h1 className={styles.welcomeName}>{user.name} 👋</h1>
              </div>
              <div className={styles.welcomeAvatar}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>

            <div className={styles.categoriesWrapper}>
              <div className={styles.categoriesScroll}>
                {APP_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    className={`${styles.categoryChip} ${activeCategory === cat.id ? styles.categoryChipActive : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                {activeCategory === 'todos'
                  ? 'Todos os Aplicativos'
                  : APP_CATEGORIES.find(c => c.id === activeCategory)?.label}
              </h2>
              <span className={styles.sectionCount}>{filteredApps.length} apps</span>
            </div>

            <div className={styles.appsGrid}>
              {filteredApps.map((app) => (
                <div key={app.id} className={styles.appCard}>
                  <div className={styles.appCardTop}>
                    <div className={styles.appIconWrapper}>
                      <span className={styles.appEmoji}>{app.icon}</span>
                    </div>
                    <div className={styles.appInfo}>
                      <h3 className={styles.appName}>{app.name}</h3>
                      <p className={styles.appDescription}>{app.description}</p>
                    </div>
                  </div>
                  <div className={styles.appCardBottom}>
                    <div className={styles.appMeta}>
                      <StarRating rating={app.rating} />
                      <span className={styles.appInstalls}>{app.installs} instalações</span>
                    </div>
                    <button className={styles.installButton}>
                      Acessar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comunidade */}
        {activePage === 'comunidade' && (
          <div className={styles.pageContent}>
            <div className={styles.placeholderPage}>
              <div className={styles.placeholderIcon}>
                <IconCommunity />
              </div>
              <h2 className={styles.placeholderTitle}>Comunidade</h2>
              <p className={styles.placeholderText}>
                Conecte-se com outros usuários, compartilhe experiências e tire dúvidas.
              </p>
              <button className={styles.placeholderButton}>Em breve</button>
            </div>
          </div>
        )}

        {/* Perfil */}
        {activePage === 'perfil' && (
          <div className={styles.pageContent}>
            <div className={styles.profilePage}>
              <div className={styles.profileAvatar}>
                {user.name.charAt(0).toUpperCase()}
              </div>
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
                  <span className={styles.profileFieldLabel}>Plano</span>
                  <span className={styles.profileFieldBadge}>Pro</span>
                </div>
              </div>

              <button className={styles.logoutButtonProfile} onClick={onLogout}>
                Sair da conta
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
