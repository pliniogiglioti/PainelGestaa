import type { App, AppCategory } from '../../lib/types'
import styles from './StreamingAppsView.module.css'
import StreamingAppCard from './StreamingAppCard'

interface AppCategoryRow extends AppCategory {
  apps: App[]
}

interface StreamingAppsViewProps {
  userName: string
  isAdmin: boolean
  allCategories: Array<{ slug: string; name: string }>
  activeCategory: string
  loadingApps: boolean
  filteredApps: App[]
  appsByCategory: AppCategoryRow[]
  getCategoryLabel: (slug: string) => string
  onCategoryChange: (slug: string) => void
  onCreateCategory: () => void
  onCreateApp: () => void
}

export default function StreamingAppsView({
  userName,
  isAdmin,
  allCategories,
  activeCategory,
  loadingApps,
  filteredApps,
  appsByCategory,
  getCategoryLabel,
  onCategoryChange,
  onCreateApp,
  onCreateCategory,
}: StreamingAppsViewProps) {
  const featuredApp = filteredApps[0]
  const trendingApps = filteredApps.slice(1, 5)

  return (
    <div className={styles.screenGlow}>
      <div className={styles.screenFrame}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.logoBadge}>PG</div>
            <nav className={styles.topTabs}>
              {allCategories.slice(0, 6).map(category => (
                <button
                  key={category.slug}
                  className={`${styles.topTab} ${activeCategory === category.slug ? styles.topTabActive : ''}`}
                  onClick={() => onCategoryChange(category.slug)}
                >
                  {category.name}
                </button>
              ))}
            </nav>
          </div>
          <div className={styles.topbarRight}>
            <span className={styles.brandAccent}>N</span>
            <div className={styles.avatar}>{userName.charAt(0).toUpperCase()}</div>
          </div>
        </header>

        <section className={styles.heroSection}>
          <div className={styles.heroTitleRow}>
            <h2>Trending now</h2>
            <span>{filteredApps.length} apps</span>
          </div>

          {loadingApps ? (
            <p className={styles.infoText}>Carregando catálogo...</p>
          ) : filteredApps.length === 0 ? (
            <p className={styles.infoText}>Nenhum app encontrado para esta categoria.</p>
          ) : (
            <div className={styles.heroGrid}>
              {featuredApp && (
                <StreamingAppCard
                  app={featuredApp}
                  categoryLabel={getCategoryLabel(featuredApp.category)}
                  highlight
                />
              )}
              <div className={styles.trendingRail}>
                {trendingApps.map(app => (
                  <StreamingAppCard key={app.id} app={app} categoryLabel={getCategoryLabel(app.category)} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className={styles.categoriesArea}>
          <div className={styles.categoriesHeader}>
            <h3>Catálogo por categoria</h3>
            {isAdmin && (
              <div className={styles.adminButtons}>
                <button className={styles.ghostButton} onClick={onCreateCategory}>+ Categoria</button>
                <button className={styles.primaryButton} onClick={onCreateApp}>+ Novo app</button>
              </div>
            )}
          </div>

          {appsByCategory.map(category => (
            <div key={category.id} className={styles.categoryRow}>
              <div className={styles.categoryLabel}>{category.name}</div>
              <div className={styles.categoryRail}>
                {category.apps.map(app => (
                  <StreamingAppCard key={app.id} app={app} categoryLabel={getCategoryLabel(app.category)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
