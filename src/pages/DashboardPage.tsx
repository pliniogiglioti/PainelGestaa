import { ReactNode, useEffect, useRef, useState } from 'react'
import styles from './DashboardPage.module.css'
import { User } from '../App'
import { supabase } from '../lib/supabase'
import type { App, AppCategory, Empresa, ForumTopicWithMeta } from '../lib/types'
import ForumTopicPage from './ForumTopicPage'
import { DesignButton, DesignIconButton } from '../components/design/DesignSystem'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'

type Page = 'aplicativos' | 'minhas-empresas' | 'comunidade'


interface DashboardPageProps {
  user: User
  onLogout: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onNavigate: (path: string) => void
}

interface AppCategoryRow extends AppCategory {
  apps: App[]
}

interface EmpresaListItem extends Pick<Empresa, 'id' | 'nome' | 'cnpj' | 'created_at'> {
  role: 'admin' | 'membro'
}

type TipoUsuario = 'titular' | 'colaborador'

interface EmpresaMembroListItem {
  user_id: string
  name: string | null
  email: string | null
  tipo_usuario: TipoUsuario
  empresa_role: 'admin' | 'membro'
  created_at: string
}

interface CompanyFormState {
  nome: string
  cnpj: string
}

const getTipoUsuarioLabel = (tipo: TipoUsuario) => tipo === 'titular' ? 'Titular' : 'Colaborador'
const getEmpresaRoleLabel = (role: EmpresaListItem['role'] | EmpresaMembroListItem['empresa_role']) => (
  role === 'admin' ? 'Titular' : 'Colaborador'
)
const getTipoUsuarioDescricao = (tipo: TipoUsuario) => (
  tipo === 'titular'
    ? 'Pode criar empresas e liberar acesso para colaboradores.'
    : 'Recebe acesso as empresas concedidas por um titular.'
)

const normalizarCnpj = (value: string) => value.replace(/\D/g, '')

const formatarCnpj = (value: string) => {
  const digits = normalizarCnpj(value).slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

const validarCnpj = (value: string) => {
  const cnpj = normalizarCnpj(value)

  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false

  const calcularDigito = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((total, numero, index) => total + Number(numero) * pesos[index], 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const digito1 = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const digito2 = calcularDigito(cnpj.slice(0, 12) + String(digito1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return cnpj === `${cnpj.slice(0, 12)}${digito1}${digito2}`
}

// ── Icons ─────────────────────────────────────────────────────────────────

const IconApps = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)
const IconCommunity = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)
const IconBuilding = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <path d="M9 22V8h6v14"/>
    <path d="M7 6h.01M17 6h.01M7 10h.01M17 10h.01M7 14h.01M17 14h.01"/>
  </svg>
)
const IconLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)
const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconExternal = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
)
const IconTag = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
)
const IconMessageSquare = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
)
const IconPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
)
const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconSun = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)
const IconMoon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)
const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

// ── Spinner ───────────────────────────────────────────────────────────────

function Spinner() {
  return <div className={styles.spinner} />
}

function TopNavigation({
  user,
  tipoUsuario,
  navItems,
  activePage,
  onSelect,
  isAdmin,
  onSettings,
  onLogout,
  theme,
  onToggleTheme,
}: {
  user: User
  tipoUsuario: TipoUsuario
  navItems: { id: Page; label: string; icon: ReactNode }[]
  activePage: Page
  onSelect: (page: Page) => void
  isAdmin: boolean
  onSettings: () => void
  onLogout: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
  const isDark = theme === 'dark'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const userInitial = user.name.trim().charAt(0).toUpperCase() || user.email.trim().charAt(0).toUpperCase() || 'U'
  const roleLabel = isAdmin ? 'Admin' : 'Usuario'

  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  return (
    <header className={styles.topNavWrap}>
      <div className={styles.topNavBrand}>
        <img src="/logo.png" height="24" alt="PainelGestaa" />
      </div>

      <nav className={styles.topNavMenu}>
        {navItems.map(item => (
          <DesignButton
            key={item.id}
            variant="pill"
            active={activePage === item.id}
            onClick={() => onSelect(item.id)}
          >
            <span className={styles.topNavButtonContent}>{item.icon}<span>{item.label}</span></span>
          </DesignButton>
        ))}
      </nav>

      <div className={styles.topNavActions}>
        <div className={styles.userMenuWrap} ref={menuRef}>
          <button
            type="button"
            className={`${styles.userMenuTrigger} ${menuOpen ? styles.userMenuTriggerOpen : ''}`}
            onClick={() => setMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className={styles.userMenuAvatar}>{userInitial}</span>
            <span className={styles.userMenuTriggerText}>
              <span className={styles.userMenuTriggerName}>{user.name}</span>
            </span>
            <span className={styles.userMenuChevron}><IconChevronDown /></span>
          </button>

          {menuOpen && (
            <div className={styles.userMenuDropdown} role="menu">
              <div className={styles.userMenuHeader}>
                <div className={styles.userMenuAvatarLarge}>{userInitial}</div>
                <div className={styles.userMenuIdentity}>
                  <strong className={styles.userMenuName}>{user.name}</strong>
                  <span className={styles.userMenuEmail}>{user.email}</span>
                </div>
              </div>

              <div className={styles.userMenuInfoGrid}>
                <div className={styles.userMenuInfoItem}>
                  <span className={styles.userMenuInfoLabel}>Nome</span>
                  <span className={styles.userMenuInfoValue}>{user.name}</span>
                </div>
                <div className={styles.userMenuInfoItem}>
                  <span className={styles.userMenuInfoLabel}>E-mail</span>
                  <span className={styles.userMenuInfoValue}>{user.email}</span>
                </div>
                <div className={styles.userMenuInfoItem}>
                  <span className={styles.userMenuInfoLabel}>Funcao</span>
                  <span className={styles.userMenuInfoValue}>{roleLabel}</span>
                </div>
                <div className={styles.userMenuInfoItem}>
                  <span className={styles.userMenuInfoLabel}>Classificacao</span>
                  <span className={styles.userMenuInfoValue}>{getTipoUsuarioLabel(tipoUsuario)}</span>
                </div>
              </div>

              <div className={styles.userMenuSection}>
                <span className={styles.userMenuSectionLabel}>Tema</span>
                <div className={styles.userMenuThemeChoices}>
                  <button
                    type="button"
                    className={`${styles.userMenuThemeButton} ${!isDark ? styles.userMenuThemeButtonActive : ''}`}
                    onClick={() => {
                      if (isDark) onToggleTheme()
                    }}
                  >
                    <IconSun />
                    <span>Claro</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.userMenuThemeButton} ${isDark ? styles.userMenuThemeButtonActive : ''}`}
                    onClick={() => {
                      if (!isDark) onToggleTheme()
                    }}
                  >
                    <IconMoon />
                    <span>Escuro</span>
                  </button>
                </div>
              </div>

              <div className={styles.userMenuActions}>
                {isAdmin && (
                  <button
                    type="button"
                    className={styles.userMenuActionButton}
                    onClick={() => {
                      setMenuOpen(false)
                      onSettings()
                    }}
                  >
                    <IconSettings />
                    <span>Configuracoes</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.userMenuActionButton} ${styles.userMenuLogoutButton}`}
                  onClick={onLogout}
                >
                  <IconLogout />
                  <span>Sair</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.categoryChip} ${active ? styles.categoryChipActive : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}


// ── Modals ────────────────────────────────────────────────────────────────

interface NewAppForm {
  name: string; description: string; category: string
  linkType: 'interno' | 'externo'
  link: string; backgroundImage: string
}

function CreateAppModal({ categories, onClose, onCreated }: {
  categories: AppCategory[]
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<NewAppForm>({
    name: '', description: '', category: '',
    linkType: 'externo', link: '', backgroundImage: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const backdropDismiss = useBackdropDismiss(onClose)

  const set = (f: keyof NewAppForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.link.trim()) { setError('Informe o link do aplicativo.'); return }
    setSaving(true); setError('')

    const { error } = await supabase.from('apps').insert({
      name:             form.name,
      description:      form.description || null,
      category:         form.category,
      link_type:        form.linkType,
      external_link:    form.linkType === 'externo' ? form.link || null : null,
      internal_link:    form.linkType === 'interno' ? form.link || null : null,
      background_image: form.backgroundImage || null,
    })

    if (error) { setError(error.message); setSaving(false); return }
    onCreated(); onClose()
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Novo Aplicativo</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalRow}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Nome</label>
              <input className={styles.modalInput} placeholder="Ex: GestCaixa" value={form.name} onChange={set('name')} required />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Categoria</label>
              <select className={styles.modalInput} value={form.category} onChange={set('category')} required>
                <option value="">Selecione...</option>
                {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Descrição</label>
            <textarea className={`${styles.modalInput} ${styles.modalTextarea}`}
              placeholder="Descreva o que este app faz..."
              value={form.description} onChange={set('description')} rows={3} />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Tipo de Link</label>
            <div className={styles.linkTypeToggle}>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'externo' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(p => ({ ...p, linkType: 'externo', link: '' }))}
              >
                Externo
              </button>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'interno' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(p => ({ ...p, linkType: 'interno', link: '' }))}
              >
                Interno
              </button>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>
              {form.linkType === 'externo' ? 'URL Externa' : 'Rota Interna'}
            </label>
            {form.linkType === 'externo' ? (
              <input className={styles.modalInput} type="url" placeholder="https://app.exemplo.com" value={form.link} onChange={set('link')} required />
            ) : (
              <input className={styles.modalInput} placeholder="/apps/gestcaixa" value={form.link} onChange={set('link')} required />
            )}
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>URL da Imagem de Fundo</label>
            <input className={styles.modalInput} type="url" placeholder="https://exemplo.com/imagem.jpg" value={form.backgroundImage} onChange={set('backgroundImage')} />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar App'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditAppModal({
  app,
  categories,
  onClose,
  onUpdated,
}: {
  app: App
  categories: AppCategory[]
  onClose: () => void
  onUpdated: () => void
}) {
  const initialLinkType: 'interno' | 'externo' =
    app.link_type
    ?? (app.internal_link ? 'interno' : 'externo')
  const initialLink = initialLinkType === 'interno'
    ? (app.internal_link ?? '')
    : (app.external_link ?? '')

  const [form, setForm] = useState<NewAppForm>({
    name: app.name,
    description: app.description ?? '',
    category: app.category,
    linkType: initialLinkType,
    link: initialLink,
    backgroundImage: app.background_image ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const backdropDismiss = useBackdropDismiss(onClose)

  const set = (f: keyof NewAppForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [f]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.link.trim()) {
      setError('Informe o link do aplicativo.')
      return
    }

    setSaving(true)
    setError('')

    const { error } = await supabase.from('apps').update({
      name: form.name,
      description: form.description || null,
      category: form.category,
      link_type: form.linkType,
      external_link: form.linkType === 'externo' ? form.link || null : null,
      internal_link: form.linkType === 'interno' ? form.link || null : null,
      background_image: form.backgroundImage || null,
    }).eq('id', app.id)

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    onUpdated()
    onClose()
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Editar Aplicativo</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalRow}>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Nome</label>
              <input className={styles.modalInput} placeholder="Ex: GestCaixa" value={form.name} onChange={set('name')} required />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Categoria</label>
              <select className={styles.modalInput} value={form.category} onChange={set('category')} required>
                <option value="">Selecione...</option>
                {categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Descrição</label>
            <textarea
              className={`${styles.modalInput} ${styles.modalTextarea}`}
              placeholder="Descreva o que este app faz..."
              value={form.description}
              onChange={set('description')}
              rows={3}
            />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Tipo de Link</label>
            <div className={styles.linkTypeToggle}>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'externo' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(prev => ({ ...prev, linkType: 'externo', link: '' }))}
              >
                Externo
              </button>
              <button
                type="button"
                className={`${styles.linkTypeBtn} ${form.linkType === 'interno' ? styles.linkTypeBtnActive : ''}`}
                onClick={() => setForm(prev => ({ ...prev, linkType: 'interno', link: '' }))}
              >
                Interno
              </button>
            </div>
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>
              {form.linkType === 'externo' ? 'URL Externa' : 'Rota Interna'}
            </label>
            {form.linkType === 'externo' ? (
              <input className={styles.modalInput} type="url" placeholder="https://app.exemplo.com" value={form.link} onChange={set('link')} required />
            ) : (
              <input className={styles.modalInput} placeholder="/apps/gestcaixa" value={form.link} onChange={set('link')} required />
            )}
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>URL da Imagem de Fundo</label>
            <input className={styles.modalInput} type="url" placeholder="https://exemplo.com/imagem.jpg" value={form.backgroundImage} onChange={set('backgroundImage')} />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const backdropDismiss = useBackdropDismiss(onClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
    await supabase.from('app_categories').insert({ name, slug })
    onCreated(); onClose()
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={`${styles.modal} ${styles.modalSm}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Nova Categoria</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Nome</label>
            <input className={styles.modalInput} placeholder="Ex: Marketing" value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>{saving ? '...' : 'Criar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateTopicModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title,   setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [saving,  setSaving]  = useState(false)
  const backdropDismiss = useBackdropDismiss(onClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('forum_topics').insert({
        author_id: user.id,
        title: title.trim(),
        content: content.trim(),
      })
    }
    onCreated(); onClose()
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Novo Tópico</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Título</label>
            <input className={styles.modalInput} placeholder="Qual é a sua dúvida ou tema?" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Conteúdo</label>
            <textarea className={`${styles.modalInput} ${styles.modalTextarea}`}
              placeholder="Descreva em detalhes..." rows={5}
              value={content} onChange={e => setContent(e.target.value)} required />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>{saving ? 'Publicando...' : 'Publicar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Netflix App Card ──────────────────────────────────────────────────────

function CompanyFormModal({
  mode,
  form,
  error,
  saving,
  onClose,
  onSubmit,
  onChange,
}: {
  mode: 'create' | 'edit'
  form: CompanyFormState
  error: string
  saving: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  onChange: (field: keyof CompanyFormState, value: string) => void
}) {
  const backdropDismiss = useBackdropDismiss(onClose, saving)
  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{mode === 'create' ? 'Nova empresa' : 'Editar empresa'}</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalForm} onSubmit={onSubmit}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Nome da empresa *</label>
            <input
              className={styles.modalInput}
              placeholder="Ex: Clinica Sorriso Ltda"
              value={form.nome}
              onChange={e => onChange('nome', e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>CNPJ *</label>
            <input
              className={styles.modalInput}
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={e => onChange('cnpj', formatarCnpj(e.target.value))}
              inputMode="numeric"
              maxLength={18}
              pattern="\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}"
              title="Informe um CNPJ válido no formato 00.000.000/0000-00"
              required
            />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar empresa' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AppCard({
  app,
  categoryLabel,
  index,
  isAdmin,
  onEdit,
}: {
  app: App
  categoryLabel: string
  index: number
  isAdmin: boolean
  onEdit: (app: App) => void
}) {
  const [hovered, setHovered] = useState(false)

  // Resolve link based on link_type (with backwards-compat fallback)
  const isExternal = app.link_type === 'externo' || (!app.link_type && !!app.external_link)
  const href = isExternal ? (app.external_link ?? '#') : (app.internal_link ?? '#')

  return (
    <div
      className={styles.netflixCard}
      style={{
        backgroundImage: app.background_image ? `url(${app.background_image})` : undefined,
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`${styles.netflixOverlay} ${hovered ? styles.netflixOverlayHovered : ''}`} />
      {isAdmin && (
        <button
          type="button"
          className={styles.appCardSettingsBtn}
          title="Editar aplicativo"
          onClick={event => {
            event.stopPropagation()
            onEdit(app)
          }}
        >
          <IconSettings />
        </button>
      )}
      <div className={styles.netflixCardContent}>
        <span className={styles.netflixCategory}>{categoryLabel}</span>
        <h3 className={styles.netflixTitle}>{app.name}</h3>
        {app.description && <p className={styles.netflixDescription}>{app.description}</p>}
        <div className={`${styles.netflixExpandable} ${hovered ? styles.netflixExpandableOpen : ''}`}>
          <div className={styles.netflixActions}>
            <a
              href={href}
              className={styles.netflixBtnPrimary}
              {...(isExternal ? { target: '_blank', rel: 'noreferrer' } : {})}
            >
              Acessar {isExternal && <IconExternal />}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function DashboardPage({ user, onLogout, theme, onToggleTheme, onNavigate }: DashboardPageProps) {
  const [activePage, setActivePage]   = useState<Page>('aplicativos')
  const [activeCategory, setActiveCategory] = useState('todos')
  const [forumFilter, setForumFilter] = useState('todos')
  const [openTopicId, setOpenTopicId] = useState<string | null>(null)
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [tipoUsuario, setTipoUsuario] = useState<TipoUsuario>('titular')
  const [allowedAppIds, setAllowedAppIds] = useState<string[] | null>(null)

  // Supabase data
  const [apps,       setApps]       = useState<App[]>([])
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [topics,     setTopics]     = useState<ForumTopicWithMeta[]>([])
  const [empresas,   setEmpresas]   = useState<EmpresaListItem[]>([])
  const [empresaMembros, setEmpresaMembros] = useState<Record<string, EmpresaMembroListItem[]>>({})
  const [loadingApps,   setLoadingApps]   = useState(true)
  const [loadingEmpresas, setLoadingEmpresas] = useState(true)
  const [loadingTopics, setLoadingTopics] = useState(true)
  const [loadingEmpresaMembros, setLoadingEmpresaMembros] = useState<Record<string, boolean>>({})
  const [savingEmpresaMembros, setSavingEmpresaMembros] = useState<Record<string, boolean>>({})
  const [inviteEmailByEmpresa, setInviteEmailByEmpresa] = useState<Record<string, string>>({})
  const [empresaMemberErrors, setEmpresaMemberErrors] = useState<Record<string, string>>({})
  const [empresaMemberSuccess, setEmpresaMemberSuccess] = useState<Record<string, string>>({})
  const [empresaAberta, setEmpresaAberta] = useState<string | null>(null)
  const [companyModalMode, setCompanyModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingCompany, setEditingCompany] = useState<EmpresaListItem | null>(null)
  const [companyForm, setCompanyForm] = useState<CompanyFormState>({ nome: '', cnpj: '' })
  const [companyFormError, setCompanyFormError] = useState('')
  const [savingCompany, setSavingCompany] = useState(false)

  // Modals
  const [showCreateApp,   setShowCreateApp]   = useState(false)
  const [showCreateCat,   setShowCreateCat]   = useState(false)
  const [showCreateTopic, setShowCreateTopic] = useState(false)
  const [editingApp,      setEditingApp]      = useState<App | null>(null)
  const appsListRef = useRef<HTMLDivElement | null>(null)
  const categorySectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Check if current user is admin
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('profiles').select('role, tipo_usuario, app_access_ids').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          setIsAdmin(profile?.role === 'admin')
          setTipoUsuario((profile?.tipo_usuario as TipoUsuario | undefined) ?? 'titular')
          setAllowedAppIds(profile?.role === 'admin' ? null : (profile?.app_access_ids ?? null))
        })
    })
  }, [])

  // ── Fetch categories ──
  const fetchCategories = async () => {
    const { data } = await supabase.from('app_categories').select('*').order('name')
    if (data) setCategories(data)
  }

  // ── Fetch apps ──
  const fetchApps = async () => {
    setLoadingApps(true)
    const { data } = await supabase.from('apps').select('*').order('name')
    if (data) {
      const seen = new Set<string>()
      setApps(data.filter(app => seen.has(app.id) ? false : (seen.add(app.id), true)))
    }
    setLoadingApps(false)
  }

  // ── Fetch topics ──
  const fetchTopics = async () => {
    setLoadingTopics(true)
    const { data } = await supabase
      .from('forum_topics')
      .select(`*, profiles(name, avatar_url), forum_categories(name, slug)`)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (data) {
      // Get reply counts
      const withCounts = await Promise.all(
        (data as any[]).map(async t => {
          const { count } = await supabase
            .from('forum_replies')
            .select('id', { count: 'exact', head: true })
            .eq('topic_id', t.id)
          return { ...t, reply_count: count ?? 0 }
        })
      )
      setTopics(withCounts)
    }
    setLoadingTopics(false)
  }

  const fetchEmpresas = async () => {
    setLoadingEmpresas(true)
    const { data: auth } = await supabase.auth.getUser()
    const currentUser = auth.user

    if (!currentUser) {
      setEmpresas([])
      setLoadingEmpresas(false)
      return
    }

    const { data: membros } = await supabase
      .from('empresa_membros')
      .select('role, empresas(id, nome, cnpj, created_at)')
      .eq('user_id', currentUser.id)

    const mapped = (membros ?? [])
      .map(item => {
        const empresa = item.empresas as unknown as Pick<Empresa, 'id' | 'nome' | 'cnpj' | 'created_at'> | null
        if (!empresa) return null
        return {
          ...empresa,
          role: item.role as 'admin' | 'membro',
        }
      })
      .filter((item): item is EmpresaListItem => !!item)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    setEmpresas(mapped)
    setLoadingEmpresas(false)
  }

  const fetchEmpresaMembros = async (empresaId: string) => {
    setLoadingEmpresaMembros(prev => ({ ...prev, [empresaId]: true }))
    setEmpresaMemberErrors(prev => ({ ...prev, [empresaId]: '' }))

    const { data, error } = await supabase.rpc('listar_membros_empresa', {
      p_empresa_id: empresaId,
    })

    if (error) {
      setEmpresaMemberErrors(prev => ({
        ...prev,
        [empresaId]: error.message ?? 'Nao foi possivel carregar os colaboradores.',
      }))
      setLoadingEmpresaMembros(prev => ({ ...prev, [empresaId]: false }))
      return
    }

    setEmpresaMembros(prev => ({
      ...prev,
      [empresaId]: ((data ?? []) as EmpresaMembroListItem[]).map(item => ({
        ...item,
        tipo_usuario: item.tipo_usuario === 'colaborador' ? 'colaborador' : 'titular',
      })),
    }))
    setLoadingEmpresaMembros(prev => ({ ...prev, [empresaId]: false }))
  }

  const toggleEmpresaColaboradores = async (empresaId: string) => {
    if (empresaAberta === empresaId) {
      setEmpresaAberta(null)
      return
    }

    setEmpresaAberta(empresaId)
    if (!empresaMembros[empresaId]) {
      await fetchEmpresaMembros(empresaId)
    }
  }

  const handleAdicionarColaborador = async (empresaId: string) => {
    const email = inviteEmailByEmpresa[empresaId]?.trim().toLowerCase() ?? ''
    if (!email) {
      setEmpresaMemberErrors(prev => ({ ...prev, [empresaId]: 'Informe o e-mail do colaborador.' }))
      return
    }

    setSavingEmpresaMembros(prev => ({ ...prev, [empresaId]: true }))
    setEmpresaMemberErrors(prev => ({ ...prev, [empresaId]: '' }))
    setEmpresaMemberSuccess(prev => ({ ...prev, [empresaId]: '' }))

    const { data: sessionData } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('invite-company-collaborator', {
      body: {
        empresa_id: empresaId,
        email,
      },
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
      },
    })

    if (error) {
      setEmpresaMemberErrors(prev => ({
        ...prev,
        [empresaId]: error.message ?? 'Nao foi possivel adicionar o colaborador.',
      }))
      setSavingEmpresaMembros(prev => ({ ...prev, [empresaId]: false }))
      return
    }

    setInviteEmailByEmpresa(prev => ({ ...prev, [empresaId]: '' }))

    if (data?.mode === 'linked') {
      setEmpresaMemberSuccess(prev => ({
        ...prev,
        [empresaId]: 'Colaborador vinculado com sucesso.',
      }))
      await fetchEmpresaMembros(empresaId)
    } else {
      setEmpresaMemberSuccess(prev => ({
        ...prev,
        [empresaId]: 'Convite enviado por e-mail para concluir o cadastro.',
      }))
    }

    setSavingEmpresaMembros(prev => ({ ...prev, [empresaId]: false }))
  }

  const handleRemoverColaborador = async (empresaId: string, userId: string) => {
    setSavingEmpresaMembros(prev => ({ ...prev, [empresaId]: true }))
    setEmpresaMemberErrors(prev => ({ ...prev, [empresaId]: '' }))

    const { error } = await supabase.rpc('remover_colaborador_empresa', {
      p_empresa_id: empresaId,
      p_user_id: userId,
    })

    if (error) {
      setEmpresaMemberErrors(prev => ({
        ...prev,
        [empresaId]: error.message ?? 'Nao foi possivel remover o colaborador.',
      }))
      setSavingEmpresaMembros(prev => ({ ...prev, [empresaId]: false }))
      return
    }

    await fetchEmpresaMembros(empresaId)
    setSavingEmpresaMembros(prev => ({ ...prev, [empresaId]: false }))
  }

  const podeCriarEmpresa = isAdmin || tipoUsuario === 'titular'
  const podeEditarEmpresa = (empresa: EmpresaListItem) => isAdmin || empresa.role === 'admin'

  const openCreateCompanyModal = () => {
    setCompanyModalMode('create')
    setEditingCompany(null)
    setCompanyForm({ nome: '', cnpj: '' })
    setCompanyFormError('')
  }

  const openEditCompanyModal = (empresa: EmpresaListItem) => {
    setCompanyModalMode('edit')
    setEditingCompany(empresa)
    setCompanyForm({
      nome: empresa.nome,
      cnpj: formatarCnpj(empresa.cnpj ?? ''),
    })
    setCompanyFormError('')
  }

  const closeCompanyModal = () => {
    if (savingCompany) return
    setCompanyModalMode(null)
    setEditingCompany(null)
    setCompanyForm({ nome: '', cnpj: '' })
    setCompanyFormError('')
  }

  const handleCompanyFormChange = (field: keyof CompanyFormState, value: string) => {
    setCompanyForm(prev => ({
      ...prev,
      [field]: field === 'cnpj' ? formatarCnpj(value) : value,
    }))
    if (companyFormError) {
      setCompanyFormError('')
    }
  }

  const handleSubmitCompany = async (e: React.FormEvent) => {
    e.preventDefault()

    if (companyModalMode === 'create' && !podeCriarEmpresa) {
      setCompanyFormError('Somente titulares podem criar empresas.')
      return
    }

    if (!companyForm.nome.trim()) {
      setCompanyFormError('Informe o nome da empresa.')
      return
    }

    if (!companyForm.cnpj.trim()) {
      setCompanyFormError('Informe o CNPJ da empresa.')
      return
    }

    if (!validarCnpj(companyForm.cnpj)) {
      setCompanyFormError('Informe um CNPJ valido.')
      return
    }

    const cnpj = normalizarCnpj(companyForm.cnpj)
    setSavingCompany(true)
    setCompanyFormError('')

    if (companyModalMode === 'edit' && editingCompany) {
      if (!podeEditarEmpresa(editingCompany)) {
        setCompanyFormError('Voce nao pode editar esta empresa.')
        setSavingCompany(false)
        return
      }

      const { error } = await supabase
        .from('empresas')
        .update({
          nome: companyForm.nome.trim(),
          cnpj,
        })
        .eq('id', editingCompany.id)

      if (error) {
        setCompanyFormError(error.message ?? 'Nao foi possivel editar a empresa.')
        setSavingCompany(false)
        return
      }

      setEmpresas(prev => prev.map(empresa => (
        empresa.id === editingCompany.id
          ? { ...empresa, nome: companyForm.nome.trim(), cnpj }
          : empresa
      )))
      setSavingCompany(false)
      closeCompanyModal()
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const sessionUser = sessionData.session?.user

    if (!sessionUser) {
      setCompanyFormError('Sessao expirada. Faca login novamente.')
      setSavingCompany(false)
      return
    }

    const { data, error } = await supabase
      .from('empresas')
      .insert({
        nome: companyForm.nome.trim(),
        cnpj,
        created_by: sessionUser.id,
      })
      .select('id, nome, cnpj, created_at')
      .single()

    if (error || !data) {
      setCompanyFormError(error?.message ?? 'Nao foi possivel criar a empresa.')
      setSavingCompany(false)
      return
    }

    const novaEmpresa: EmpresaListItem = {
      ...data,
      role: 'admin',
    }

    setEmpresas(prev => [...prev, novaEmpresa].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    setSavingCompany(false)
    closeCompanyModal()
  }

  useEffect(() => { fetchCategories() }, [])
  useEffect(() => { fetchApps()       }, [])
  useEffect(() => { fetchEmpresas()   }, [])
  useEffect(() => { fetchTopics()     }, [])

  // Realtime: new apps
  useEffect(() => {
    const ch = supabase.channel('apps-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apps' }, fetchApps)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Realtime: new topics
  useEffect(() => {
    const ch = supabase.channel('topics-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_topics' }, fetchTopics)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const allCategories = [{ id: 'all', name: 'Todos', slug: 'todos' } as AppCategory, ...categories]
  const filteredApps  = allowedAppIds === null
    ? apps
    : apps.filter(app => allowedAppIds.includes(app.id))
  const filteredTopics = forumFilter === 'todos' ? topics : topics.filter(t => t.forum_categories?.slug === forumFilter)

  const getCategoryLabel = (slug: string) => categories.find(c => c.slug === slug)?.name ?? slug

  const appsByCategory: AppCategoryRow[] = categories
    .map(category => ({
      ...category,
      apps: filteredApps.filter(app => app.category === category.slug),
    }))
    .filter(category => category.apps.length > 0)

  const uncategorizedApps = filteredApps.filter(app => !categories.some(category => category.slug === app.category))

  if (uncategorizedApps.length > 0) {
    appsByCategory.push({
      id: 'uncategorized',
      name: 'Outros',
      slug: 'outros',
      created_at: '',
      apps: uncategorizedApps,
    })
  }

  const handleCategoryClick = (slug: string) => {
    setActiveCategory(slug)
    if (slug === 'todos') {
      appsListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const target = categorySectionRefs.current[slug]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const navItems = [
    { id: 'aplicativos' as Page, label: 'Aplicativos', icon: <IconApps /> },
    { id: 'minhas-empresas' as Page, label: 'Minhas empresas', icon: <IconBuilding /> },
    { id: 'comunidade'  as Page, label: 'Comunidade',  icon: <IconCommunity /> },
  ]

  // Forum topic detail view overlays the community page
  if (activePage === 'comunidade' && openTopicId) {
    return (
      <div className={styles.layout}>
        <TopNavigation
          user={user}
          tipoUsuario={tipoUsuario}
          navItems={navItems}
          activePage={activePage}
          onSelect={page => { setActivePage(page); setOpenTopicId(null) }}
          isAdmin={isAdmin}
          onSettings={() => onNavigate('/admin-settings')}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
        <main className={styles.mainTopNavOnly}>
          <ForumTopicPage topicId={openTopicId} currentUser={user} onBack={() => setOpenTopicId(null)} />
        </main>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <TopNavigation
        user={user}
        tipoUsuario={tipoUsuario}
        navItems={navItems}
        activePage={activePage}
        onSelect={setActivePage}
        isAdmin={isAdmin}
        onSettings={() => onNavigate('/admin-settings')}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className={styles.mainTopNavOnly}>

        {/* APLICATIVOS */}
        {activePage === 'aplicativos' && (
          <div className={styles.pageContent} key="apps">
            {/* Categories */}
            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                {allCategories.map(cat => (
                  <CategoryChip
                    key={cat.slug}
                    label={cat.name}
                    active={activeCategory === cat.slug}
                    onClick={() => handleCategoryClick(cat.slug)}
                  />
                ))}
              </div>
              {isAdmin && (
                <DesignIconButton onClick={() => setShowCreateCat(true)} title="Nova categoria">
                  <IconTag />
                </DesignIconButton>
              )}
            </div>

            <div className={styles.sectionHeader}>
              <div className={styles.sectionLeft}>
                <h2 className={styles.sectionTitle}>
                  {activeCategory === 'todos' ? 'Todos os Aplicativos' : getCategoryLabel(activeCategory)}
                </h2>
                {!loadingApps && <span className={styles.sectionCount}>{filteredApps.length} apps</span>}
              </div>
              {isAdmin && (
                <DesignButton variant="primary" onClick={() => setShowCreateApp(true)}>
                  <span className={styles.topNavButtonContent}><IconPlus /><span>Novo App</span></span>
                </DesignButton>
              )}
            </div>

            {loadingApps ? (
              <div className={styles.centeredSpinner}><Spinner /></div>
            ) : filteredApps.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Nenhum app encontrado nesta categoria.</p>
                {isAdmin && (
                  <DesignButton variant="primary" onClick={() => setShowCreateApp(true)}>
                    <span className={styles.topNavButtonContent}><IconPlus /><span>Criar primeiro app</span></span>
                  </DesignButton>
                )}
              </div>
            ) : (
              <div className={styles.categoryRows} ref={appsListRef}>
                {appsByCategory.map(category => (
                  <section
                    key={category.id}
                    className={styles.categoryRowSection}
                    ref={el => { categorySectionRefs.current[category.slug] = el }}
                  >
                    <div className={styles.categoryRowHeader}>
                      <h3 className={styles.categoryRowTitle}>{category.name}</h3>
                      <span className={styles.sectionCount}>{category.apps.length} apps</span>
                    </div>
                    <div className={styles.netflixRow}>
                      {category.apps.map((app, i) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          index={i}
                          categoryLabel={getCategoryLabel(app.category)}
                          isAdmin={isAdmin}
                          onEdit={setEditingApp}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MINHAS EMPRESAS */}
        {activePage === 'minhas-empresas' && (
          <div className={styles.pageContent} key="companies">
            <div className={styles.welcomeRow}>
              <div>
                <p className={styles.welcomeGreeting}>Empresas vinculadas ao seu acesso</p>
                <h1 className={styles.welcomeName}>Minhas empresas</h1>
              </div>
            </div>

            <section className={styles.companyAccessCard}>
              <div>
                <p className={styles.companyAccessEyebrow}>Classificacao do usuario</p>
                <h2 className={styles.companyAccessTitle}>{getTipoUsuarioLabel(tipoUsuario)}</h2>
                <p className={styles.companyAccessText}>{getTipoUsuarioDescricao(tipoUsuario)}</p>
              </div>
              <span className={`${styles.companyRoleBadge} ${tipoUsuario === 'titular' ? styles.companyRoleAdmin : styles.companyRoleMember}`}>
                {getTipoUsuarioLabel(tipoUsuario)}
              </span>
            </section>

            <div className={styles.sectionHeader}>
              <div className={styles.sectionLeft}>
                <h2 className={styles.sectionTitle}>Listagem de empresas</h2>
                {!loadingEmpresas && <span className={styles.sectionCount}>{empresas.length} empresa{empresas.length === 1 ? '' : 's'}</span>}
              </div>
              {podeCriarEmpresa && (
                <DesignButton variant="primary" onClick={openCreateCompanyModal}>
                  <span className={styles.topNavButtonContent}><IconPlus /><span>Nova empresa</span></span>
                </DesignButton>
              )}
            </div>

            {loadingEmpresas ? (
              <div className={styles.centeredSpinner}><Spinner /></div>
            ) : empresas.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Você ainda não está vinculado a nenhuma empresa.</p>
              </div>
            ) : (
              <div className={styles.companyGrid}>
                {empresas.map((empresa, index) => (
                  <article
                    key={empresa.id}
                    className={styles.companyCard}
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <div className={styles.companyCardTop}>
                      <div className={styles.companyAvatar}>
                        {empresa.nome.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')}
                      </div>
                      <span className={`${styles.companyRoleBadge} ${empresa.role === 'admin' ? styles.companyRoleAdmin : styles.companyRoleMember}`}>
                        {getEmpresaRoleLabel(empresa.role)}
                      </span>
                    </div>
                    <h3 className={styles.companyName}>{empresa.nome}</h3>
                    <p className={styles.companyMeta}>{empresa.cnpj ? formatarCnpj(empresa.cnpj) : 'CNPJ não informado'}</p>
                    <p className={styles.companyMeta}>
                      Vinculada em {new Date(empresa.created_at).toLocaleDateString('pt-BR')}
                    </p>
                    {podeEditarEmpresa(empresa) && (
                      <button
                        type="button"
                        className={styles.companyEditButton}
                        onClick={() => openEditCompanyModal(empresa)}
                      >
                        Editar empresa
                      </button>
                    )}
                    {empresa.role === 'admin' && (
                      <div className={styles.companyMembersWrap}>
                        <button
                          type="button"
                          className={styles.companyManageButton}
                          onClick={() => void toggleEmpresaColaboradores(empresa.id)}
                        >
                          {empresaAberta === empresa.id ? 'Ocultar colaboradores' : 'Gerenciar colaboradores'}
                        </button>

                        {empresaAberta === empresa.id && (
                          <div className={styles.companyMembersPanel}>
                            <div className={styles.companyMembersHeader}>
                              <strong>Acessos da empresa</strong>
                              <span className={styles.companyMembersCount}>
                                {(empresaMembros[empresa.id] ?? []).length} acesso{(empresaMembros[empresa.id] ?? []).length === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className={styles.companyMembersAddRow}>
                              <input
                                type="email"
                                className={styles.companyMembersInput}
                                placeholder="email@colaborador.com"
                                value={inviteEmailByEmpresa[empresa.id] ?? ''}
                                onChange={e => {
                                  const value = e.target.value
                                  setInviteEmailByEmpresa(prev => ({ ...prev, [empresa.id]: value }))
                                }}
                              />
                              <button
                                type="button"
                                className={styles.companyMembersAddButton}
                                disabled={!!savingEmpresaMembros[empresa.id]}
                                onClick={() => void handleAdicionarColaborador(empresa.id)}
                              >
                                {savingEmpresaMembros[empresa.id] ? 'Salvando...' : 'Adicionar'}
                              </button>
                            </div>

                            {empresaMemberErrors[empresa.id] && (
                              <p className={styles.companyMembersError}>{empresaMemberErrors[empresa.id]}</p>
                            )}

                            {empresaMemberSuccess[empresa.id] && (
                              <p className={styles.companyMembersSuccess}>{empresaMemberSuccess[empresa.id]}</p>
                            )}

                            {loadingEmpresaMembros[empresa.id] ? (
                              <p className={styles.companyMembersHint}>Carregando colaboradores...</p>
                            ) : (
                              <div className={styles.companyMembersList}>
                                {(empresaMembros[empresa.id] ?? []).map(membro => (
                                  <div key={membro.user_id} className={styles.companyMemberItem}>
                                    <div>
                                      <p className={styles.companyMemberName}>{membro.name?.trim() || membro.email || 'Usuario'}</p>
                                      <p className={styles.companyMemberEmail}>{membro.email || 'E-mail nao informado'}</p>
                                    </div>
                                    <div className={styles.companyMemberMeta}>
                                      <span className={`${styles.companyRoleBadge} ${membro.empresa_role === 'admin' ? styles.companyRoleAdmin : styles.companyRoleMember}`}>
                                        {getEmpresaRoleLabel(membro.empresa_role)}
                                      </span>
                                      {membro.empresa_role !== 'admin' && (
                                        <button
                                          type="button"
                                          className={styles.companyMemberRemove}
                                          disabled={!!savingEmpresaMembros[empresa.id]}
                                          onClick={() => void handleRemoverColaborador(empresa.id, membro.user_id)}
                                        >
                                          Remover
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                {(empresaMembros[empresa.id] ?? []).length === 0 && (
                                  <p className={styles.companyMembersHint}>Nenhum colaborador vinculado ainda.</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COMUNIDADE */}
        {activePage === 'comunidade' && (
          <div className={styles.pageContent} key="community">
            <div className={styles.welcomeRow}>
              <div>
                <p className={styles.welcomeGreeting}>Fórum da comunidade</p>
                <h1 className={styles.welcomeName}>Comunidade</h1>
              </div>
              <DesignButton variant="primary" onClick={() => setShowCreateTopic(true)}>
                <span className={styles.topNavButtonContent}><IconPlus /><span>Novo Tópico</span></span>
              </DesignButton>
            </div>

            <div className={styles.categoriesBar}>
              <div className={styles.categoriesScroll}>
                <CategoryChip label="Todos" active={forumFilter === 'todos'} onClick={() => setForumFilter('todos')} />
                {categories.map(cat => (
                  <CategoryChip
                    key={cat.slug}
                    label={cat.name}
                    active={forumFilter === cat.slug}
                    onClick={() => setForumFilter(cat.slug)}
                  />
                ))}
              </div>
            </div>

            {loadingTopics ? (
              <div className={styles.centeredSpinner}><Spinner /></div>
            ) : (
              <div className={styles.forumList}>
                {filteredTopics.length === 0 && (
                  <p className={styles.emptyTopics}>Nenhum tópico ainda. Seja o primeiro!</p>
                )}
                {filteredTopics.map((topic, i) => (
                  <div key={topic.id}
                    className={`${styles.forumTopic} ${topic.pinned ? styles.forumTopicPinned : ''}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => setOpenTopicId(topic.id)}>
                    <div className={styles.forumTopicMain}>
                      {topic.pinned && <span className={styles.forumPinBadge}><IconPin /> Fixado</span>}
                      <h3 className={styles.forumTopicTitle}>{topic.title}</h3>
                      <div className={styles.forumTopicMeta}>
                        {topic.forum_categories && (
                          <span className={styles.forumCategoryTag}>{topic.forum_categories.name}</span>
                        )}
                        <span className={styles.forumAuthor}>
                          por <strong>{topic.profiles?.name ?? 'Anônimo'}</strong>
                        </span>
                        <span className={styles.forumDate}>
                          {new Date(topic.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    </div>
                    <div className={styles.forumTopicStats}>
                      <span className={styles.forumStat}><IconMessageSquare />{topic.reply_count}</span>
                      <span className={styles.forumStat}><IconEye />{topic.views}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {showCreateApp  && <CreateAppModal categories={categories} onClose={() => setShowCreateApp(false)}  onCreated={fetchApps} />}
      {editingApp && (
        <EditAppModal
          app={editingApp}
          categories={categories}
          onClose={() => setEditingApp(null)}
          onUpdated={fetchApps}
        />
      )}
      {showCreateCat  && <CreateCategoryModal onClose={() => setShowCreateCat(false)}  onCreated={fetchCategories} />}
      {showCreateTopic && <CreateTopicModal   onClose={() => setShowCreateTopic(false)} onCreated={fetchTopics} />}
      {companyModalMode && (
        <CompanyFormModal
          mode={companyModalMode}
          form={companyForm}
          error={companyFormError}
          saving={savingCompany}
          onClose={closeCompanyModal}
          onSubmit={handleSubmitCompany}
          onChange={handleCompanyFormChange}
        />
      )}
    </div>
  )
}


