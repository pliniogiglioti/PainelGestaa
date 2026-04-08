import { useState } from 'react'
import styles from './RegisterPage.module.css'
import { supabase } from '../lib/supabase'

interface AcceptInvitePageProps {
  email: string
  onSuccess: () => void | Promise<void>
}

export default function AcceptInvitePage({ email, onSuccess }: AcceptInvitePageProps) {
  const [name,            setName]            = useState('')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword,    setShowPassword]    = useState(false)
  const [error,           setError]           = useState('')
  const [loading,         setLoading]         = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (!name.trim()) {
      setError('Informe seu nome completo.')
      return
    }

    setLoading(true)

    const { error: updateErr } = await supabase.auth.updateUser({
      password,
      data: { full_name: name.trim() },
    })

    if (updateErr) {
      setError(updateErr.message)
      setLoading(false)
      return
    }

    // Atualiza o nome no profile
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (profileError) {
        setError(profileError.message)
        setLoading(false)
        return
      }
    }

    setLoading(false)
    await onSuccess()
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logo}>
          <img src="/logo.png" height="34" alt="PainelGestaa" className={styles.logoImg} />
        </div>

        {/* Header */}
        <div className={styles.formHeader}>
          <h1 className={styles.title}>Complete seu cadastro</h1>
          <p className={styles.subtitle}>Você foi convidado para o PainelGestaa</p>
        </div>

        {/* E-mail (somente leitura) */}
        <div className={styles.form} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>E-mail</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input
                type="email"
                className={styles.input}
                value={email}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
            </div>
          </div>
        </div>

        {/* Formulário */}
        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Nome */}
          <div className={styles.fieldGroup}>
            <label htmlFor="inv-name" className={styles.label}>Nome completo</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                id="inv-name"
                type="text"
                className={styles.input}
                placeholder="Seu nome completo"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          </div>

          {/* Senha */}
          <div className={styles.fieldGroup}>
            <label htmlFor="inv-password" className={styles.label}>Senha</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                id="inv-password"
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

          {/* Confirmar senha */}
          <div className={styles.fieldGroup}>
            <label htmlFor="inv-confirm" className={styles.label}>Confirmar senha</label>
            <div className={styles.inputWrapper}>
              <svg className={styles.inputIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                id="inv-confirm"
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

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? 'Salvando...' : 'Confirmar cadastro'}
          </button>
        </form>
      </div>
    </div>
  )
}
