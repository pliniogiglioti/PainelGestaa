import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa } from '../lib/types'
import styles from './PrecificacaoPage.module.css'

interface PrecificacaoPageProps {
  empresa: Empresa
  onTrocarEmpresa: () => void
  onVoltar: () => void
}

const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const IconUpload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const IconTag = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41 13.41 20.6a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
)

const IconSpark = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
  </svg>
)

function Spinner() {
  return <div className={styles.spinner} />
}

export default function PrecificacaoPage({ empresa, onTrocarEmpresa, onVoltar }: PrecificacaoPageProps) {
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [view, setView] = useState<'home' | 'lista'>('home')

  useEffect(() => {
    let active = true

    const validarAcesso = async () => {
      setLoading(true)

      const { data: authData } = await supabase.auth.getUser()
      const currentUser = authData.user

      if (!currentUser) {
        if (active) onTrocarEmpresa()
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single()

      const isSystemAdmin = profile?.role === 'admin'

      if (!isSystemAdmin) {
        const { data: membro } = await supabase
          .from('empresa_membros')
          .select('role')
          .eq('empresa_id', empresa.id)
          .eq('user_id', currentUser.id)
          .maybeSingle()

        if (!membro && active) {
          onTrocarEmpresa()
          return
        }

        if (active) {
          setCanManage(membro?.role === 'admin')
        }
      } else if (active) {
        setCanManage(true)
      }

      if (active) {
        setLoading(false)
      }
    }

    void validarAcesso()

    return () => {
      active = false
    }
  }, [empresa.id, onTrocarEmpresa])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <button type="button" className={styles.backBtn} onClick={onVoltar}>
            <IconBack /> Voltar
          </button>
          <h1 className={styles.pageTitle}>Precificação</h1>
        </div>
        <div className={styles.spinnerWrap}>
          <Spinner />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onVoltar}>
          <IconBack /> Voltar
        </button>
        <h1 className={styles.pageTitle}>Precificação</h1>
        <span className={styles.companyMeta}>
          Empresa: <strong>{empresa.nome}</strong>
        </span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={onTrocarEmpresa}>
            Trocar empresa
          </button>
          {canManage && view === 'home' && (
            <button type="button" className={styles.btnPrimary} onClick={() => setView('lista')}>
              <IconPlus /> Minha lista de preço
            </button>
          )}
        </div>
      </div>

      {view === 'home' ? (
        <div className={styles.emptyState}>
          <IconTag />
          <p className={styles.emptyTitle}>Minha lista de preço</p>
          <p className={styles.emptyText}>
            Estrutura inicial pronta para importar a lista de preços ou cadastrar preços manualmente.
          </p>
          {canManage ? (
            <button type="button" className={styles.btnPrimary} onClick={() => setView('lista')}>
              <IconPlus /> Abrir minha lista de preço
            </button>
          ) : (
            <p className={styles.emptyHint}>
              Você pode visualizar a empresa, mas a gestão da lista de preços ficará disponível para o titular.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.workspace}>
          <div className={styles.workspaceHeader}>
            <div>
              <p className={styles.workspaceEyebrow}>Precificação</p>
              <h2 className={styles.workspaceTitle}>Minha lista de preço</h2>
            </div>
            <div className={styles.workspaceActions}>
              <button type="button" className={styles.btnSecondary}>
                <IconUpload /> Importar lista
              </button>
              <button type="button" className={styles.btnPrimary}>
                <IconSpark /> Criar preços
              </button>
            </div>
          </div>

          <div className={styles.blankCanvas} />
        </div>
      )}
    </div>
  )
}
