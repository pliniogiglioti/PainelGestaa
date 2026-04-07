import { useEffect, useState } from 'react'
import styles from './LoginPage.module.css'
import { supabase } from '../lib/supabase'

interface ResetPasswordPageProps {
  recoveryMode: boolean
  onBack: () => void
  onRecoveryComplete: () => Promise<void> | void
}

export default function ResetPasswordPage({
  recoveryMode,
  onBack,
  onRecoveryComplete,
}: ResetPasswordPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(recoveryMode ? null : false)

  useEffect(() => {
    if (!recoveryMode) {
      setHasRecoverySession(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasRecoverySession(!!session)
    })
  }, [recoveryMode])

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setSuccess('Enviamos o link de recuperação para o seu e-mail.')
    setLoading(false)
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setSuccess('Senha redefinida com sucesso.')
    setLoading(false)
  }

  const renderSuccessState = () => (
    <>
      <div className={styles.formHeader}>
        <h1 className={styles.title}>Tudo certo</h1>
        <p className={styles.subtitle}>{success}</p>
      </div>

      <div className={styles.stackActions}>
        {recoveryMode ? (
          <button
            type="button"
            className={styles.submitButton}
            onClick={() => void onRecoveryComplete()}
          >
            Voltar para o login
          </button>
        ) : (
          <button type="button" className={styles.submitButton} onClick={onBack}>
            Voltar para o login
          </button>
        )}
      </div>
    </>
  )

  const renderInvalidRecoveryState = () => (
    <>
      <div className={styles.formHeader}>
        <h1 className={styles.title}>Link inválido</h1>
        <p className={styles.subtitle}>
          Esse link de recuperação expirou ou não é mais válido. Solicite um novo link para continuar.
        </p>
      </div>

      <div className={styles.stackActions}>
        <button type="button" className={styles.submitButton} onClick={onBack}>
          Solicitar novo link
        </button>
      </div>
    </>
  )

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <img src="/logo.png" height="34" alt="PainelGestaa" className={styles.logoImg} />
        </div>

        {success
          ? renderSuccessState()
          : recoveryMode && hasRecoverySession === false
            ? renderInvalidRecoveryState()
            : (
              <>
                <div className={styles.formHeader}>
                  <h1 className={styles.title}>
                    {recoveryMode ? 'Redefinir senha' : 'Recuperar senha'}
                  </h1>
                  <p className={styles.subtitle}>
                    {recoveryMode
                      ? 'Digite a nova senha para concluir a recuperação.'
                      : 'Informe seu e-mail para receber o link de recuperação.'}
                  </p>
                </div>

                {recoveryMode ? (
                  <form className={styles.form} onSubmit={handleUpdatePassword}>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="reset-password" className={styles.label}>Nova senha</label>
                      <div className={styles.inputWrapper}>
                        <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <input
                          id="reset-password"
                          type={showPassword ? 'text' : 'password'}
                          className={styles.input}
                          placeholder="Mínimo 6 caracteres"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className={styles.togglePassword}
                          onClick={() => setShowPassword(current => !current)}
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          {showPassword ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className={styles.fieldGroup}>
                      <label htmlFor="reset-confirm" className={styles.label}>Confirmar senha</label>
                      <div className={styles.inputWrapper}>
                        <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <input
                          id="reset-confirm"
                          type={showPassword ? 'text' : 'password'}
                          className={styles.input}
                          placeholder="Repita a senha"
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          required
                          autoComplete="new-password"
                        />
                      </div>
                    </div>

                    {error && <p className={styles.errorMsg}>{error}</p>}
                    {hasRecoverySession === null && <p className={styles.infoMsg}>Validando link de recuperação...</p>}

                    <div className={styles.stackActions}>
                      <button type="submit" className={styles.submitButton} disabled={loading || hasRecoverySession !== true}>
                        {loading ? 'Salvando...' : 'Salvar nova senha'}
                      </button>
                      <button type="button" className={styles.secondaryButton} onClick={onBack} disabled={loading}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className={styles.form} onSubmit={handleRequestReset}>
                    <div className={styles.fieldGroup}>
                      <label htmlFor="reset-email" className={styles.label}>E-mail</label>
                      <div className={styles.inputWrapper}>
                        <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        <input
                          id="reset-email"
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

                    {error && <p className={styles.errorMsg}>{error}</p>}
                    {!error && (
                      <p className={styles.infoMsg}>
                        O cadastro é liberado apenas por convite. Aqui você recupera o acesso a uma conta já existente.
                      </p>
                    )}

                    <div className={styles.stackActions}>
                      <button type="submit" className={styles.submitButton} disabled={loading}>
                        {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                      </button>
                      <button type="button" className={styles.secondaryButton} onClick={onBack} disabled={loading}>
                        Voltar
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
      </div>
    </div>
  )
}
