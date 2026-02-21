import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../context/AuthContext'
import styles from './AuthForm.module.css'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await resetPassword(email)
    setLoading(false)
    if (error) {
      setError(error)
    } else {
      setSuccess(true)
    }
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
          <h1 className={styles.title}>Recuperar senha</h1>
          <p className={styles.subtitle}>
            {success
              ? 'Verifique sua caixa de entrada.'
              : 'Digite seu e-mail e enviaremos um link para redefinir sua senha.'}
          </p>
        </div>

        {success ? (
          <>
            <div className={styles.successBox}>
              Enviamos um link de recuperação para <strong>{email}</strong>. Verifique também a pasta de spam.
            </div>
            <p className={styles.footer}>
              <Link to="/login" className={styles.link}>Voltar para o login</Link>
            </p>
          </>
        ) : (
          <>
            <form className={styles.form} onSubmit={handleSubmit}>
              {error && <div className={styles.errorBox}>{error}</div>}

              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>E-mail</label>
                <div className={styles.inputWrapper}>
                  <IconMail />
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

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? <span className={styles.spinner} /> : 'Enviar link de recuperação'}
              </button>
            </form>

            <p className={styles.footer}>
              Lembrou a senha?{' '}
              <Link to="/login" className={styles.link}>Entrar</Link>
            </p>
          </>
        )}
      </div>
    </AuthLayout>
  )
}

function IconMail() {
  return (
    <svg className="inputIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}
