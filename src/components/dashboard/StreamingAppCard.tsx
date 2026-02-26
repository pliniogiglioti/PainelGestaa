import { useMemo } from 'react'
import type { App } from '../../lib/types'
import styles from './StreamingAppsView.module.css'

interface StreamingAppCardProps {
  app: App
  categoryLabel: string
  highlight?: boolean
}

export default function StreamingAppCard({ app, categoryLabel, highlight = false }: StreamingAppCardProps) {
  const { href, isExternal } = useMemo(() => {
    const external = app.link_type === 'externo' || (!app.link_type && !!app.external_link)
    return {
      href: external ? (app.external_link ?? '#') : (app.internal_link ?? '#'),
      isExternal: external,
    }
  }, [app])

  return (
    <article
      className={`${styles.posterCard} ${highlight ? styles.posterCardHighlight : ''}`}
      style={{ backgroundImage: app.background_image ? `url(${app.background_image})` : undefined }}
    >
      <div className={styles.posterOverlay} />
      <div className={styles.posterContent}>
        <span className={styles.posterCategory}>{categoryLabel}</span>
        <h3 className={styles.posterTitle}>{app.name}</h3>
        {app.description && <p className={styles.posterDescription}>{app.description}</p>}
        <a
          href={href}
          className={styles.posterButton}
          {...(isExternal ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          Abrir aplicativo {isExternal ? '↗' : ''}
        </a>
      </div>
    </article>
  )
}
