import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './AuthForm.module.css'

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Supabase sends the recovery token in the URL hash.
    // The client SDK processes it automatically via onAuthStateChange.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidSession(true)
      }
      setChecking(false)
    })

    // Also check if there's already a session (user refreshed the page)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true)
      setChecking(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)

    if (error) {
      setError(error)
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2500)
    }
  }

  if (checking) {
    return (
      <AuthLayout>
        <div className={styles.wrapper}>
          <div className={styles.header}>
            <p className={styles.subtitle}>Verificando link...</p>
          </div>
        </div>
      </AuthLayout>
    )
  }

  if (!validSession) {
    return (
      <AuthLayout>
        <div className={styles.wrapper}>
          <div className={styles.header}>
            <h1 className={styles.title}>Link inválido</h1>
            <p className={styles.subtitle}>Este link de recuperação expirou ou é inválido.</p>
          </div>
          <div className={styles.errorBox}>
            Solicite um novo link de recuperação de senha.
          </div>
          <p className={styles.footer}>
            <a href="/forgot-password" className={styles.link}>Solicitar novo link</a>
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className={styles.wrapper}>
        <div className={styles.logo}>
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="#6366f1" />
            <path d="M10 18L16 24L26 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.logoText}>PainelGestaa</span>
        </div>

        <div className={styles.header}>
          <h1 className={styles.title}>Nova senha</h1>
          <p className={styles.subtitle}>Digite e confirme sua nova senha.</p>
        </div>

        {success ? (
          <div className={styles.successBox}>
            Senha atualizada com sucesso! Redirecionando...
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="password" className={styles.label}>Nova senha</label>
              <div className={styles.inputWrapper}>
                <IconLock />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword" className={styles.label}>Confirmar nova senha</label>
              <div className={styles.inputWrapper}>
                <IconLock />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? <span className={styles.spinner} /> : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

function IconLock() {
  return (
    <svg className="inputIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
