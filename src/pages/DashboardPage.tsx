import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg width="30" height="30" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#6366f1" />
            <path d="M10 18L16 24L26 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.logoText}>PainelGestaa</span>
        </div>

        <div className={styles.userInfo}>
          <span className={styles.userEmail}>{user?.email}</span>
          <button className={styles.signOutBtn} onClick={handleSignOut}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sair
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.badge}>Dashboard</div>
          <h1 className={styles.hello}>Hello, World! 👋</h1>
          <p className={styles.description}>
            Você está autenticado com sucesso. Bem-vindo ao PainelGestaa.
          </p>
          <div className={styles.info}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Usuário</span>
              <span className={styles.infoValue}>{user?.email}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>ID</span>
              <span className={styles.infoValueMono}>{user?.id}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Último acesso</span>
              <span className={styles.infoValue}>
                {user?.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString('pt-BR')
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
