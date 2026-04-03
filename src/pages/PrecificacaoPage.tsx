import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import styles from './PrecificacaoPage.module.css'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'
import type { Empresa, EmpresaPreco } from '../lib/types'

interface PrecificacaoPageProps {
  empresa: Empresa
  onTrocarEmpresa: () => void
  onVoltar: () => void
}

type ViewMode = 'home' | 'lista'

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

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function Spinner() {
  return <div className={styles.spinner} />
}

function parsePreco(value: string) {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function PrecoModal({
  onClose,
  onSubmit,
  saving,
  error,
}: {
  onClose: () => void
  onSubmit: (item: { nome: string; preco: number }) => Promise<void>
  saving: boolean
  error: string
}) {
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [erroLocal, setErroLocal] = useState('')
  const backdropDismiss = useBackdropDismiss(onClose, saving)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome.trim()) {
      setErroLocal('Informe o nome do produto.')
      return
    }

    const precoNumerico = parsePreco(preco)
    if (precoNumerico <= 0) {
      setErroLocal('Informe um preço válido.')
      return
    }

    setErroLocal('')

    await onSubmit({
      nome: nome.trim(),
      preco: precoNumerico,
    })
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Novo preço</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Nome do produto</span>
            <input
              className={styles.modalInput}
              placeholder="Ex: Consulta de avaliação"
              value={nome}
              onChange={e => {
                setNome(e.target.value)
                setErroLocal('')
              }}
              autoFocus
              disabled={saving}
            />
          </label>

          <label className={styles.modalField}>
            <span className={styles.modalLabel}>Preço</span>
            <input
              className={styles.modalInput}
              placeholder="Ex: 120,00"
              value={preco}
              onChange={e => {
                setPreco(e.target.value)
                setErroLocal('')
              }}
              inputMode="decimal"
              disabled={saving}
            />
          </label>

          {(erroLocal || error) && <p className={styles.formError}>{erroLocal || error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className={styles.modalSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PrecificacaoPage({ empresa, onTrocarEmpresa, onVoltar }: PrecificacaoPageProps) {
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [view, setView] = useState<ViewMode>('home')
  const [showPrecoModal, setShowPrecoModal] = useState(false)
  const [precos, setPrecos] = useState<EmpresaPreco[]>([])
  const [savingPreco, setSavingPreco] = useState(false)
  const [loadingPrecos, setLoadingPrecos] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

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
        setLoadingPrecos(true)
      }

      const { data: precosData, error: precosError } = await supabase
        .from('empresa_precos')
        .select('*')
        .eq('empresa_id', empresa.id)
        .eq('ativo', true)
        .order('nome_produto', { ascending: true })

      if (!precosError && active) {
        setPrecos(precosData ?? [])
      }

      if (precosError && active) {
        setError(precosError.message ?? 'Não foi possível carregar a lista de preços.')
      }

      if (active) {
        setLoadingPrecos(false)
        setLoading(false)
      }
    }

    void validarAcesso()

    return () => {
      active = false
    }
  }, [empresa.id, onTrocarEmpresa])

  const handleAddPreco = async (item: { nome: string; preco: number }) => {
    setSavingPreco(true)
    setError('')
    setFeedback('')

    const { data, error: insertError } = await supabase
      .from('empresa_precos')
      .insert({
        empresa_id: empresa.id,
        nome_produto: item.nome,
        preco: item.preco,
      })
      .select('*')
      .single()

    if (insertError) {
      setError(insertError.message ?? 'Não foi possível salvar o preço.')
      setSavingPreco(false)
      return
    }

    setPrecos(prev =>
      [...prev, data].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'))
    )
    setFeedback('Preço salvo com sucesso.')
    setShowPrecoModal(false)
    setSavingPreco(false)
    setView('lista')
  }

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
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                setError('')
                setFeedback('')
                setView('lista')
              }}
            >
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
            Comece criando seus preços manualmente ou, depois, importe uma lista pronta.
          </p>
          {canManage ? (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                setError('')
                setFeedback('')
                setView('lista')
              }}
            >
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
              <button type="button" className={styles.btnSecondary} disabled>
                <IconUpload /> Importar lista
              </button>
              {canManage && (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => {
                    setError('')
                    setFeedback('')
                    setShowPrecoModal(true)
                  }}
                >
                  <IconPlus /> Criar preços
                </button>
              )}
            </div>
          </div>

          {feedback && <p className={styles.feedbackSuccess}>{feedback}</p>}
          {error && <p className={styles.feedbackError}>{error}</p>}

          {loadingPrecos ? (
            <div className={styles.blankCanvas}>
              <p className={styles.blankTitle}>Carregando preços...</p>
            </div>
          ) : precos.length === 0 ? (
            <div className={styles.blankCanvas}>
              <p className={styles.blankTitle}>Nenhum preço cadastrado ainda.</p>
              <p className={styles.blankText}>
                Clique em <strong>Criar preços</strong> para adicionar nome do produto e preço na sua lista.
              </p>
            </div>
          ) : (
            <div className={styles.priceTable}>
              <div className={styles.priceTableHead}>
                <span>Produto</span>
                <span>Preço</span>
              </div>
              <div className={styles.priceTableBody}>
                {precos.map(item => (
                  <div key={item.id} className={styles.priceRow}>
                    <span className={styles.priceName}>{item.nome_produto}</span>
                    <strong className={styles.priceValue}>{formatCurrency(item.preco)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showPrecoModal && (
        <PrecoModal
          onClose={() => setShowPrecoModal(false)}
          onSubmit={handleAddPreco}
          saving={savingPreco}
          error={error}
        />
      )}
    </div>
  )
}
