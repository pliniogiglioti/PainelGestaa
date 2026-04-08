import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ErrorBoundary } from './ErrorBoundary'
import { supabase } from './lib/supabase'
import type { Empresa } from './lib/types'
import AcceptInvitePage from './pages/AcceptInvitePage'
import AdminSettingsPage from './pages/AdminSettingsPage'
import AnaliseDrePage from './pages/AnaliseDrePage'
import DashboardPage from './pages/DashboardPage'
import EmpresaGatePage from './pages/EmpresaGatePage'
import LabControlPage from './pages/LabControlPage'
import LoginPage from './pages/LoginPage'
import PrecificacaoPage from './pages/PrecificacaoPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import TermosPage from './pages/TermosPage'

const KNOWN_PATHS = ['/', '/analise-dre', '/admin-settings', '/lab-control', '/precificacao'] as const
const KNOWN_PATHS_SET = new Set<string>(KNOWN_PATHS)

export interface User {
  name: string
  email: string
}

function sessionToUser(session: Session): User {
  const meta = session.user.user_metadata
  const email = session.user.email ?? ''
  const name = meta?.full_name
    ?? meta?.name
    ?? email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return { name, email }
}

function getProtectedAppPath(pathname: string) {
  if (pathname === '/analise-dre/termospage') return '/analise-dre'
  if (pathname === '/analise-dre' || pathname === '/lab-control' || pathname === '/precificacao') {
    return pathname
  }
  return null
}

async function carregarAcessoUsuario(session: Session) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ativo, app_access_ids')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.ativo === false) {
    await supabase.auth.signOut()
    return { permitido: false, allowedInternalPaths: null as string[] | null }
  }

  if (profile?.role === 'admin' || profile?.app_access_ids == null) {
    return { permitido: true, allowedInternalPaths: null as string[] | null }
  }

  if (profile.app_access_ids.length === 0) {
    return { permitido: true, allowedInternalPaths: [] as string[] }
  }

  const { data: apps, error: appsError } = await supabase
    .from('apps')
    .select('internal_link')
    .in('id', profile.app_access_ids)

  if (appsError) {
    return { permitido: true, allowedInternalPaths: null as string[] | null }
  }

  const allowedInternalPaths = Array.from(
    new Set(
      (apps ?? [])
        .map(app => app.internal_link?.trim() ?? '')
        .filter(link => link.startsWith('/')),
    ),
  )

  return { permitido: true, allowedInternalPaths }
}

async function sairDoFluxoRecuperacao() {
  await supabase.auth.signOut()
}

function limparEmpresaSelecionada(pathname: string) {
  if (pathname === '/analise-dre') {
    localStorage.removeItem('empresa_selecionada')
  }

  if (pathname === '/lab-control') {
    localStorage.removeItem('empresa_selecionada_lab_control')
  }

  if (pathname === '/precificacao') {
    localStorage.removeItem('empresa_selecionada_precificacao')
  }
}

function App() {
  const restaurarEmpresa = (key: string) => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? (JSON.parse(stored) as Empresa) : null
    } catch {
      return null
    }
  }

  const [user, setUser] = useState<User | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pathname, setPathname] = useState(window.location.pathname)
  const [isInviteFlow, setIsInviteFlow] = useState(false)
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [termosAceitos, setTermosAceitos] = useState<boolean | null>(null)
  const [allowedInternalPaths, setAllowedInternalPaths] = useState<string[] | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [mountedPaths, setMountedPaths] = useState<string[]>(['/'])
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(() => restaurarEmpresa('empresa_selecionada'))
  const [empresaSelecionadaLab, setEmpresaSelecionadaLab] = useState<Empresa | null>(() => restaurarEmpresa('empresa_selecionada_lab_control'))
  const [empresaSelecionadaPrecificacao, setEmpresaSelecionadaPrecificacao] = useState<Empresa | null>(() => restaurarEmpresa('empresa_selecionada_precificacao'))

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark')

  const navigate = (path: string) => {
    window.history.pushState({}, '', path)
    setPathname(path)
  }

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=invite')) {
      setIsInviteFlow(true)
    }
    if (hash.includes('type=recovery')) {
      setIsRecoveryFlow(true)
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { permitido, allowedInternalPaths: nextAllowedPaths } = await carregarAcessoUsuario(session)
        if (permitido) {
          setUser(sessionToUser(session))
          setUserId(session.user.id)
          setAllowedInternalPaths(nextAllowedPaths)
          if (session.user.email && hash.includes('type=invite')) {
            setInviteEmail(session.user.email)
          }
        } else {
          setUser(null)
          setUserId(null)
          setAllowedInternalPaths(null)
        }
      } else {
        setUser(null)
        setUserId(null)
        setAllowedInternalPaths(null)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        setUser(null)
        setUserId(null)
        setTermosAceitos(null)
        setAllowedInternalPaths(null)
        setIsInviteFlow(false)
        setIsRecoveryFlow(false)
        return
      }

      void (async () => {
        const { permitido, allowedInternalPaths: nextAllowedPaths } = await carregarAcessoUsuario(session)
        if (permitido) {
          setUser(sessionToUser(session))
          setUserId(session.user.id)
          setAllowedInternalPaths(nextAllowedPaths)
          if (event === 'SIGNED_IN' && session.user.email && window.location.hash.includes('type=invite')) {
            setIsInviteFlow(true)
            setInviteEmail(session.user.email)
          }
          if (event === 'PASSWORD_RECOVERY' || window.location.hash.includes('type=recovery')) {
            setIsRecoveryFlow(true)
          }
        } else {
          setUser(null)
          setUserId(null)
          setTermosAceitos(null)
          setAllowedInternalPaths(null)
        }
      })()
    })

    return () => subscription.unsubscribe()
  }, [])

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
    if (termosAceitos === false && pathname === '/analise-dre') {
      navigate('/analise-dre/termospage')
    }
  }, [pathname, termosAceitos])

  useEffect(() => {
    const appPath = getProtectedAppPath(pathname)
    if (!user || !appPath || allowedInternalPaths === null) return

    if (!allowedInternalPaths.includes(appPath)) {
      limparEmpresaSelecionada(appPath)
      if (appPath === '/analise-dre') {
        setEmpresaSelecionada(null)
      }
      if (appPath === '/lab-control') {
        setEmpresaSelecionadaLab(null)
      }
      if (appPath === '/precificacao') {
        setEmpresaSelecionadaPrecificacao(null)
      }
      navigate('/')
    }
  }, [allowedInternalPaths, pathname, user])

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!user || isInviteFlow || pathname === '/analise-dre/termospage') return

    const normalizedPath = KNOWN_PATHS_SET.has(pathname) ? pathname : '/'
    setMountedPaths(prev => (
      prev.includes(normalizedPath) ? prev : [...prev, normalizedPath]
    ))
  }, [isInviteFlow, pathname, user])

  useEffect(() => {
    if (user) return
    setMountedPaths(['/'])
  }, [user])

  const handleLogout = async () => {
    localStorage.removeItem('empresa_selecionada')
    localStorage.removeItem('empresa_selecionada_lab_control')
    localStorage.removeItem('empresa_selecionada_precificacao')
    await supabase.auth.signOut()
    setTermosAceitos(null)
    setUserId(null)
  }

  const selecionarEmpresa = (emp: Empresa) => {
    localStorage.setItem('empresa_selecionada', JSON.stringify(emp))
    setEmpresaSelecionada(emp)
  }

  const trocarEmpresa = useCallback(() => {
    localStorage.removeItem('empresa_selecionada')
    setEmpresaSelecionada(null)
  }, [])

  const selecionarEmpresaLab = (emp: Empresa) => {
    localStorage.setItem('empresa_selecionada_lab_control', JSON.stringify(emp))
    setEmpresaSelecionadaLab(emp)
  }

  const trocarEmpresaLab = useCallback(() => {
    localStorage.removeItem('empresa_selecionada_lab_control')
    setEmpresaSelecionadaLab(null)
  }, [])

  const selecionarEmpresaPrecificacao = (emp: Empresa) => {
    localStorage.setItem('empresa_selecionada_precificacao', JSON.stringify(emp))
    setEmpresaSelecionadaPrecificacao(emp)
  }

  const trocarEmpresaPrecificacao = useCallback(() => {
    localStorage.removeItem('empresa_selecionada_precificacao')
    setEmpresaSelecionadaPrecificacao(null)
  }, [])

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
    if (isInviteFlow) {
      return (
        <ErrorBoundary>
          <AcceptInvitePage
            email={inviteEmail || user.email}
            onSuccess={() => {
              setIsInviteFlow(false)
              window.history.replaceState({}, '', '/')
              navigate('/')
            }}
          />
        </ErrorBoundary>
      )
    }

    if (pathname === '/reset-password') {
      return (
        <ErrorBoundary>
          <ResetPasswordPage
            recoveryMode={isRecoveryFlow}
            onBack={() => {
              setIsRecoveryFlow(false)
              window.history.replaceState({}, '', '/')
              setPathname('/')
            }}
            onRecoveryComplete={async () => {
              setIsRecoveryFlow(false)
              await sairDoFluxoRecuperacao()
              window.history.replaceState({}, '', '/')
              setPathname('/')
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

    if (pathname === '/analise-dre' && (termosAceitos === null || termosAceitos === false)) {
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

    const activePath = KNOWN_PATHS_SET.has(pathname) ? pathname : '/'

    if (pathname !== activePath) {
      window.history.replaceState({}, '', activePath)
    }

    return (
      <>
        {(activePath === '/' || mountedPaths.includes('/')) && (
          <div style={{ display: activePath === '/' ? 'block' : 'none' }}>
            <ErrorBoundary>
              <DashboardPage
                user={user}
                onLogout={handleLogout}
                theme={theme}
                onToggleTheme={toggleTheme}
                onNavigate={navigate}
              />
            </ErrorBoundary>
          </div>
        )}

        {(activePath === '/analise-dre' || mountedPaths.includes('/analise-dre')) && termosAceitos === true && (
          <div style={{ display: activePath === '/analise-dre' ? 'block' : 'none' }}>
            {!empresaSelecionada ? (
              <ErrorBoundary>
                <EmpresaGatePage
                  onSelecionar={selecionarEmpresa}
                  onVoltar={() => navigate('/')}
                  onVerTermos={() => navigate('/analise-dre/termospage')}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary>
                <AnaliseDrePage
                  empresa={empresaSelecionada}
                  onTrocarEmpresa={trocarEmpresa}
                  onVoltar={() => navigate('/')}
                />
              </ErrorBoundary>
            )}
          </div>
        )}

        {(activePath === '/admin-settings' || mountedPaths.includes('/admin-settings')) && (
          <div style={{ display: activePath === '/admin-settings' ? 'block' : 'none' }}>
            <ErrorBoundary>
              <AdminSettingsPage onVoltar={() => navigate('/')} />
            </ErrorBoundary>
          </div>
        )}

        {(activePath === '/lab-control' || mountedPaths.includes('/lab-control')) && (
          <div style={{ display: activePath === '/lab-control' ? 'block' : 'none' }}>
            {!empresaSelecionadaLab ? (
              <ErrorBoundary>
                <EmpresaGatePage
                  onSelecionar={selecionarEmpresaLab}
                  onVoltar={() => navigate('/')}
                  contexto="labs"
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary>
                <LabControlPage
                  userId={userId!}
                  empresa={empresaSelecionadaLab}
                  onTrocarEmpresa={trocarEmpresaLab}
                  onVoltar={() => navigate('/')}
                />
              </ErrorBoundary>
            )}
          </div>
        )}

        {(activePath === '/precificacao' || mountedPaths.includes('/precificacao')) && (
          <div style={{ display: activePath === '/precificacao' ? 'block' : 'none' }}>
            {!empresaSelecionadaPrecificacao ? (
              <ErrorBoundary>
                <EmpresaGatePage
                  onSelecionar={selecionarEmpresaPrecificacao}
                  onVoltar={() => navigate('/')}
                  contexto="precificacao"
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary>
                <PrecificacaoPage
                  empresa={empresaSelecionadaPrecificacao}
                  onTrocarEmpresa={trocarEmpresaPrecificacao}
                  onVoltar={() => navigate('/')}
                />
              </ErrorBoundary>
            )}
          </div>
        )}
      </>
    )
  }

  if (pathname === '/reset-password') {
    return (
      <ErrorBoundary>
        <ResetPasswordPage
          recoveryMode={isRecoveryFlow}
          onBack={() => {
            setIsRecoveryFlow(false)
            window.history.replaceState({}, '', '/')
            setPathname('/')
          }}
          onRecoveryComplete={async () => {
            setIsRecoveryFlow(false)
            await sairDoFluxoRecuperacao()
            window.history.replaceState({}, '', '/')
            setPathname('/')
          }}
        />
      </ErrorBoundary>
    )
  }

  return <LoginPage onForgotPassword={() => navigate('/reset-password')} />
}

export default App
