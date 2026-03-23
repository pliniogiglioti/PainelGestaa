import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, EmpresaMembro, Profile } from '../lib/types'
import styles from './EmpresaGatePage.module.css'

interface Props {
  /** Chamado quando o usuário seleciona (ou cria e seleciona) uma empresa */
  onSelecionar: (empresa: Empresa) => void
  /** Voltar para a home */
  onVoltar: () => void
}

type EmpresaRoleMap = Record<string, EmpresaMembro['role']>
type EmpresaCard = Empresa & { donoNome: string | null }

type EmpresaFormModalProps = {
  modo: 'criar' | 'editar'
  nome: string
  cnpj: string
  erro: string
  salvando: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  onNomeChange: (value: string) => void
  onCnpjChange: (value: string) => void
}

const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

function EmpresaFormModal({
  modo,
  nome,
  cnpj,
  erro,
  salvando,
  onClose,
  onSubmit,
  onNomeChange,
  onCnpjChange,
}: EmpresaFormModalProps) {
  return (
    <div className={styles.modalBackdrop} onClick={() => { if (!salvando) onClose() }}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>{modo === 'criar' ? 'Nova empresa' : 'Editar empresa'}</h2>
        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.label}>
            Nome da empresa *
            <input
              className={styles.input}
              value={nome}
              onChange={e => onNomeChange(e.target.value)}
              placeholder="Ex: Clínica Sorriso Ltda"
              autoFocus
              disabled={salvando}
            />
          </label>
          <label className={styles.label}>
            CNPJ <span className={styles.opcional}>(opcional)</span>
            <input
              className={styles.input}
              value={cnpj}
              onChange={e => onCnpjChange(e.target.value)}
              placeholder="00.000.000/0000-00"
              disabled={salvando}
            />
          </label>
          {erro && <p className={styles.erro}>{erro}</p>}
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btnCancelar}
              onClick={onClose}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.btnCriar}
              disabled={salvando}
            >
              {salvando
                ? (modo === 'criar' ? 'Criando…' : 'Salvando…')
                : (modo === 'criar' ? 'Criar empresa' : 'Salvar alterações')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function EmpresaGatePage({ onSelecionar, onVoltar }: Props) {
  const [empresas, setEmpresas]           = useState<EmpresaCard[]>([])
  const [loading, setLoading]             = useState(true)
  const [modalModo, setModalModo]         = useState<'criar' | 'editar' | null>(null)
  const [empresaEmEdicao, setEmpresaEmEdicao] = useState<Empresa | null>(null)
  const [nome, setNome]                   = useState('')
  const [cnpj, setCnpj]                   = useState('')
  const [salvando, setSalvando]           = useState(false)
  const [erro, setErro]                   = useState('')
  const [hoveredId, setHoveredId]         = useState<string | null>(null)
  const [isSystemAdmin, setIsSystemAdmin] = useState(false)
  const [empresaRoles, setEmpresaRoles]   = useState<EmpresaRoleMap>({})

  useEffect(() => {
    carregarEmpresas()
  }, [])

  async function carregarEmpresas() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const adminSistema = profile?.role === 'admin'
    setIsSystemAdmin(adminSistema)

    let empresasData: Empresa[] = []
    let rolesMap: EmpresaRoleMap = {}

    if (adminSistema) {
      const { data } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativo', true)
        .order('created_at')
      empresasData = data ?? []
    } else {
      const { data: membros } = await supabase
        .from('empresa_membros')
        .select('empresa_id, role')
        .eq('user_id', user.id)

      const membrosData = (membros ?? []) as Pick<EmpresaMembro, 'empresa_id' | 'role'>[]
      rolesMap = Object.fromEntries(membrosData.map(m => [m.empresa_id, m.role]))
      const ids = membrosData.map(m => m.empresa_id)

      if (ids.length > 0) {
        const { data } = await supabase
          .from('empresas')
          .select('*')
          .in('id', ids)
          .eq('ativo', true)
          .order('created_at')
        empresasData = data ?? []
      }
    }

    const ownerIds = [...new Set(empresasData.map(empresa => empresa.created_by).filter(Boolean))]
    let ownerMap: Record<string, string | null> = {}

    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', ownerIds)

      ownerMap = Object.fromEntries(
        ((profiles ?? []) as Pick<Profile, 'id' | 'name' | 'email'>[]).map(profile => [
          profile.id,
          profile.name?.trim() || profile.email?.trim() || null,
        ]),
      )
    }

    setEmpresaRoles(rolesMap)
    setEmpresas(empresasData.map(empresa => ({
      ...empresa,
      donoNome: ownerMap[empresa.created_by] ?? null,
    })))
    setLoading(false)
  }

  function resetModalState() {
    setModalModo(null)
    setEmpresaEmEdicao(null)
    setNome('')
    setCnpj('')
    setErro('')
    setSalvando(false)
  }

  function abrirModalCriacao() {
    setModalModo('criar')
    setEmpresaEmEdicao(null)
    setNome('')
    setCnpj('')
    setErro('')
  }

  function abrirModalEdicao(empresa: EmpresaCard) {
    setModalModo('editar')
    setEmpresaEmEdicao(empresa)
    setNome(empresa.nome)
    setCnpj(empresa.cnpj ?? '')
    setErro('')
  }

  async function handleSalvarEmpresa(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Informe o nome da empresa.'); return }
    setSalvando(true)
    setErro('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErro('Sessão expirada. Faça login novamente.')
      setSalvando(false)
      return
    }

    if (modalModo === 'editar' && empresaEmEdicao) {
      const payload = {
        nome: nome.trim(),
        cnpj: cnpj.trim() || null,
      }

      const { error } = await supabase
        .from('empresas')
        .update(payload)
        .eq('id', empresaEmEdicao.id)

      if (error) {
        setErro(error.message ?? 'Erro ao editar empresa.')
        setSalvando(false)
        return
      }

      setEmpresas(prev => prev.map(emp => (
        emp.id === empresaEmEdicao.id
          ? { ...emp, ...payload }
          : emp
      )))
      resetModalState()
      return
    }

    const { data, error } = await supabase
      .from('empresas')
      .insert({
        nome: nome.trim(),
        cnpj: cnpj.trim() || null,
        created_by: session.user.id,
      })
      .select()
      .single()

    if (error || !data) {
      setErro(error?.message ?? 'Erro ao criar empresa.')
      setSalvando(false)
      return
    }

    onSelecionar(data as Empresa)
  }

  const inicialEmpresa = (empresaNome: string) =>
    empresaNome.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')

  const podeEditarEmpresa = useMemo(() => (
    (empresaId: string) => isSystemAdmin || empresaRoles[empresaId] === 'admin'
  ), [empresaRoles, isSystemAdmin])

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.btnVoltar} onClick={onVoltar}>
          ← Voltar
        </button>
        <h1 className={styles.titulo}>
          {empresas.length === 0 ? 'Criar sua primeira empresa' : 'Selecionar empresa'}
        </h1>
        <p className={styles.subtitulo}>
          {empresas.length === 0
            ? 'Para usar a Análise DRE, você precisa criar uma empresa.'
            : 'Escolha a empresa que deseja analisar ou crie uma nova.'}
        </p>
      </header>

      <div className={styles.grade}>
        {empresas.map(emp => {
          const podeEditar = podeEditarEmpresa(emp.id)

          return (
            <div
              key={emp.id}
              className={styles.card}
              onMouseEnter={() => setHoveredId(emp.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className={`${styles.overlay} ${hoveredId === emp.id ? styles.overlayHovered : ''}`} />
              {podeEditar && (
                <button
                  type="button"
                  className={styles.cardSettingsButton}
                  title={`Editar ${emp.nome}`}
                  aria-label={`Editar ${emp.nome}`}
                  onClick={event => {
                    event.stopPropagation()
                    abrirModalEdicao(emp)
                  }}
                >
                  <IconSettings />
                </button>
              )}
              <div className={styles.cardContent}>
                <span className={styles.cardLabel}>EMPRESA</span>
                <div className={styles.cardInitiais}>{inicialEmpresa(emp.nome)}</div>
                <h3 className={styles.cardNome}>{emp.nome}</h3>
                <p className={styles.cardDono}>
                  Empresa de: {emp.donoNome ?? 'Usuário'}
                </p>
                {emp.cnpj && <p className={styles.cardCnpj}>{emp.cnpj}</p>}
                <div className={`${styles.cardExpandable} ${hoveredId === emp.id ? styles.cardExpandableOpen : ''}`}>
                  <button
                    className={styles.btnSelecionar}
                    onClick={() => onSelecionar(emp)}
                  >
                    Acessar DRE
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        <div
          className={`${styles.card} ${styles.cardNova}`}
          onMouseEnter={() => setHoveredId('__nova')}
          onMouseLeave={() => setHoveredId(null)}
          onClick={abrirModalCriacao}
        >
          <div className={`${styles.overlay} ${hoveredId === '__nova' ? styles.overlayHovered : ''}`} />
          <div className={styles.cardContent}>
            <div className={styles.iconPlus}>+</div>
            <p className={styles.cardLabelNova}>Criar empresa</p>
          </div>
        </div>
      </div>

      {modalModo && (
        <EmpresaFormModal
          modo={modalModo}
          nome={nome}
          cnpj={cnpj}
          erro={erro}
          salvando={salvando}
          onClose={resetModalState}
          onSubmit={handleSalvarEmpresa}
          onNomeChange={setNome}
          onCnpjChange={setCnpj}
        />
      )}
    </div>
  )
}
