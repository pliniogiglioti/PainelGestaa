import { useState } from 'react'
import styles from './LoginPage.module.css'
import { supabase } from '../lib/supabase'

interface LoginPageProps {
  onRegister: () => void
}

export default function LoginPage({ onRegister }: LoginPageProps) {
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : error.message)
    }
    // On success, App.tsx onAuthStateChange fires and switches to Dashboard automatically

    setLoading(false)
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logo}>
          <img src="/favicon.png" width="36" height="36" alt="Logo" />
          <span className={styles.logoText}>PainelGestaa</span>
        </div>

        {/* Header */}
        <div className={styles.formHeader}>
          <h1 className={styles.title}>Bem-vindo de volta</h1>
          <p className={styles.subtitle}>Entre com sua conta para continuar</p>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label htmlFor="email" className={styles.label}>E-mail</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.labelRow}>
              <label htmlFor="password" className={styles.label}>Senha</label>
              <a href="#" className={styles.forgotLink}>Esqueceu a senha?</a>
            </div>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.footerText}>
          Não tem uma conta?{' '}
          <button className={styles.registerLink} onClick={onRegister}>
            Cadastre-se
          </button>
        </p>
      </div>
    </div>
  )
}
