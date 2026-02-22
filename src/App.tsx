import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'

export interface User {
  name: string
  email: string
}

function sessionToUser(session: Session): User {
  const meta  = session.user.user_metadata
  const email = session.user.email ?? ''
  const name  = meta?.full_name
    ?? meta?.name
    ?? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { name, email }
}

function App() {
  const [user,       setUser]       = useState<User | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [showRegister, setShowRegister] = useState(false)

  useEffect(() => {
    // 1. Restore session that's already persisted in localStorage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session ? sessionToUser(session) : null)
      setLoading(false)
    })

    // 2. Keep state in sync whenever auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? sessionToUser(session) : null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    // onAuthStateChange will set user to null automatically
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#080808',
      }}>
        <div style={{
          width: 28, height: 28,
          border: '3px solid #1e1e1e',
          borderTopColor: '#c9a22a',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (user) {
    return <DashboardPage user={user} onLogout={handleLogout} />
  }

  if (showRegister) {
    return <RegisterPage onBack={() => setShowRegister(false)} />
  }

  return <LoginPage onRegister={() => setShowRegister(true)} />
}

export default App
