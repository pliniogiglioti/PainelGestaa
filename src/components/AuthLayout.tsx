import { useState, useEffect, ReactNode } from 'react'
import styles from './AuthLayout.module.css'

const IMAGE_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1)

function getRandomImageUrl(): string {
  const seed = IMAGE_SEEDS[Math.floor(Math.random() * IMAGE_SEEDS.length)]
  return `https://picsum.photos/seed/${seed * 37}/1200/900`
}

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  const [imageUrl, setImageUrl] = useState('')
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    setImageUrl(getRandomImageUrl())
  }, [])

  return (
    <div className={styles.container}>
      {/* Left - Random image (2/3) */}
      <div className={styles.imagePanel}>
        {imageUrl && (
          <>
            <img
              src={imageUrl}
              alt=""
              className={`${styles.backgroundImage} ${imageLoaded ? styles.imageVisible : ''}`}
              onLoad={() => setImageLoaded(true)}
            />
            <div className={styles.imageOverlay} />
            <div className={styles.imageContent}>
              <p className={styles.brand}>PainelGestaa</p>
              <blockquote className={styles.quote}>
                "Gerencie seu negócio com inteligência e eficiência"
              </blockquote>
            </div>
          </>
        )}
      </div>

      {/* Right - Form (1/3) */}
      <div className={styles.formPanel}>
        {children}
      </div>
    </div>
  )
}
