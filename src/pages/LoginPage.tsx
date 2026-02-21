import { useState, useEffect } from 'react'
import styles from './LoginPage.module.css'

const IMAGE_CATEGORIES = [
  'nature',
  'architecture',
  'city',
  'mountains',
  'ocean',
  'forest',
  'abstract',
  'landscape',
]

function getRandomImageUrl(): string {
  const category = IMAGE_CATEGORIES[Math.floor(Math.random() * IMAGE_CATEGORIES.length)]
  const seed = Math.floor(Math.random() * 1000)
  return `https://picsum.photos/seed/${seed}/800/1200?${category}`
}

export default function LoginPage() {
  const [imageUrl, setImageUrl] = useState<string>('')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    setImageUrl(getRandomImageUrl())
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle login logic here
    console.log('Login attempt:', { email, password })
  }

  return (
    <div className={styles.container}>
      {/* Left panel - Random image (2/3) */}
      <div className={styles.imagePanel}>
        {imageUrl && (
          <>
            <img
              src={imageUrl}
              alt="Background"
              className={`${styles.backgroundImage} ${imageLoaded ? styles.imageVisible : ''}`}
              onLoad={() => setImageLoaded(true)}
            />
            <div className={styles.imageOverlay} />
            <div className={styles.imageContent}>
              <blockquote className={styles.quote}>
                "Gerencie seu negócio com inteligência e eficiência"
              </blockquote>
            </div>
          </>
        )}
      </div>

      {/* Right panel - Login form (1/3) */}
      <div className={styles.formPanel}>
        <div className={styles.formWrapper}>
          <div className={styles.logo}>
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="36" height="36" rx="8" fill="#6366f1" />
              <path d="M10 18L16 24L26 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.logoText}>PainelGestaa</span>
          </div>

          <div className={styles.formHeader}>
            <h1 className={styles.title}>Bem-vindo de volta</h1>
            <p className={styles.subtitle}>Entre com sua conta para continuar</p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.fieldGroup}>
              <label htmlFor="email" className={styles.label}>
                E-mail
              </label>
              <div className={styles.inputWrapper}>
                <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.labelRow}>
                <label htmlFor="password" className={styles.label}>
                  Senha
                </label>
                <a href="#" className={styles.forgotLink}>
                  Esqueceu a senha?
                </a>
              </div>
              <div className={styles.inputWrapper}>
                <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.togglePassword}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className={styles.submitButton}>
              Entrar
            </button>
          </form>

          <p className={styles.footerText}>
            Não tem uma conta?{' '}
            <a href="#" className={styles.registerLink}>
              Cadastre-se
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
