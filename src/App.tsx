import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import AnaliseDrePage from './pages/AnaliseDrePage'
import EmpresaGatePage from './pages/EmpresaGatePage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import TermosPage from './pages/TermosPage'
import { ErrorBoundary } from './ErrorBoundary'
import type { Empresa } from './lib/types'

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

async function validarUsuarioAtivo(session: Session) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ativo')
    .eq('id', session.user.id)
    .single()

  if (profile?.role === 'user' && profile.ativo === false) {
    await supabase.auth.signOut()
    return false
  }

  return true
}

function App() {
  const [user,             setUser]             = useState<User | null>(null)
  const [userId,           setUserId]           = useState<string | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [showRegister,     setShowRegister]     = useState(false)
  const [pathname,         setPathname]         = useState(window.location.pathname)
  const [isInviteFlow,     setIsInviteFlow]     = useState(false)
  const [inviteEmail,      setInviteEmail]      = useState('')
  const [termosAceitos,    setTermosAceitos]    = useState<boolean | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(() => {
    try {
      const stored = localStorage.getItem('empresa_selecionada')
      return stored ? (JSON.parse(stored) as Empresa) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  useEffect(() => {
    // Detecta fluxo de convite via hash da URL antes da primeira renderização
    const hash = window.location.hash
    if (hash.includes('type=invite')) {
      setIsInviteFlow(true)
    }

    // 1. Restore session that's already persisted in localStorage
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const permitido = await validarUsuarioAtivo(session)
        if (permitido) {
          setUser(sessionToUser(session))
          setUserId(session.user.id)
          if (session.user.email && hash.includes('type=invite')) {
            setInviteEmail(session.user.email)
          }
        } else {
          setUser(null)
          setUserId(null)
        }
      } else {
        setUser(null)
        setUserId(null)
      }
      setLoading(false)
    })

    // 2. Keep state in sync whenever auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        setUser(null)
        setUserId(null)
        setTermosAceitos(null)
        return
      }

      void (async () => {
        const permitido = await validarUsuarioAtivo(session)
        if (permitido) {
          setUser(sessionToUser(session))
          setUserId(session.user.id)
          // Detecta quando o usuário chega pelo link de convite
          if (event === 'SIGNED_IN' && session.user.email && window.location.hash.includes('type=invite')) {
            setIsInviteFlow(true)
            setInviteEmail(session.user.email)
          }
        } else {
          setUser(null)
          setUserId(null)
          setTermosAceitos(null)
        }
      })()
    })

    return () => subscription.unsubscribe()
  }, [])

  // Verifica aceite de termos sempre que o userId mudar
  useEffect(() => {
    if (!userId) {
      setTermosAceitos(null)
      return
    }
    supabase
      .from('termos_aceite')
      .select('id')
      .eq('user_id', userId)
      .eq('app', 'dfc-clinicscale')
      .maybeSingle()
      .then(({ data }) => setTermosAceitos(!!data))
  }, [userId])

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const handleLogout = async () => {
    localStorage.removeItem('empresa_selecionada')
    await supabase.auth.signOut()
    setTermosAceitos(null)
    setUserId(null)
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

  const navigate = (path: string) => {
    window.history.pushState({}, '', path)
    setPathname(path)
  }

  const selecionarEmpresa = (emp: Empresa) => {
    localStorage.setItem('empresa_selecionada', JSON.stringify(emp))
    setEmpresaSelecionada(emp)
  }

  const trocarEmpresa = () => {
    localStorage.removeItem('empresa_selecionada')
    setEmpresaSelecionada(null)
  }

  if (user) {
    // Fluxo de aceite de convite: usuário logou via link de convite
    if (isInviteFlow) {
      return (
        <ErrorBoundary>
          <AcceptInvitePage
            email={inviteEmail || user.email}
            onSuccess={() => {
              setIsInviteFlow(false)
              // Limpa o hash do convite da URL
              window.history.replaceState({}, '', '/')
              navigate('/')
            }}
          />
        </ErrorBoundary>
      )
    }

    if (pathname === '/analise-dre/termospage') {
      return (
        <ErrorBoundary>
          <TermosPage
            userId={userId!}
            userName={user.name}
            onAceitar={() => {
              setTermosAceitos(true)
              navigate('/analise-dre')
            }}
          />
        </ErrorBoundary>
      )
    }

    if (pathname === '/analise-dre') {
      // Aguarda verificação de termos
      if (termosAceitos === null) {
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

      // Redireciona para aceitar termos se ainda não aceitou
      if (!termosAceitos) {
        navigate('/analise-dre/termospage')
        return null
      }

      if (!empresaSelecionada) {
        return (
          <ErrorBoundary>
            <EmpresaGatePage
              onSelecionar={selecionarEmpresa}
              onVoltar={() => navigate('/')}
              onVerTermos={() => navigate('/analise-dre/termospage')}
            />
          </ErrorBoundary>
        )
      }
      return (
        <ErrorBoundary>
          <AnaliseDrePage
            empresa={empresaSelecionada}
            onTrocarEmpresa={trocarEmpresa}
            onVoltar={() => navigate('/')}
          />
        </ErrorBoundary>
      )
    }

    if (pathname === '/admin-settings') {
      return (
        <ErrorBoundary>
          <AdminSettingsPage onVoltar={() => navigate('/')} />
        </ErrorBoundary>
      )
    }

    // Redirect unknown routes to home
    if (pathname !== '/') {
      navigate('/')
    }
    return (
      <ErrorBoundary>
        <DashboardPage user={user} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme} onNavigate={navigate} />
      </ErrorBoundary>
    )
  }

  if (showRegister) {
    return <RegisterPage onBack={() => setShowRegister(false)} />
  }

  return <LoginPage onRegister={() => setShowRegister(true)} />
}

export default App
