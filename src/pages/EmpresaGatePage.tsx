import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, EmpresaMembro, Profile } from '../lib/types'
import styles from './EmpresaGatePage.module.css'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'

interface Props {
  /** Chamado quando o usuário seleciona (ou cria e seleciona) uma empresa */
  onSelecionar: (empresa: Empresa) => void
  /** Voltar para a home */
  onVoltar: () => void
  /** Navegar para os termos de uso deste app */
  onVerTermos?: () => void
  contexto?: 'dre' | 'labs' | 'precificacao'
}

type EmpresaRoleMap = Record<string, EmpresaMembro['role']>
type EmpresaCard = Empresa & { donoNome: string | null }
type EmpresaMembroResumo = {
  user_id: string
  name: string | null
  email: string | null
  tipo_usuario: 'titular' | 'colaborador'
  empresa_role: 'admin' | 'membro'
  created_at: string
}

type EmpresaFormModalProps = {
  modo: 'criar' | 'editar'
  empresaId?: string | null
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

const IconTrash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
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

  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
    return false
  }

  const calcularDigito = (base: string, pesos: number[]) => {
    const soma = base
      .split('')
      .reduce((total, numero, index) => total + Number(numero) * pesos[index], 0)

    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const digito1 = calcularDigito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const digito2 = calcularDigito(cnpj.slice(0, 12) + String(digito1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return cnpj === `${cnpj.slice(0, 12)}${digito1}${digito2}`
}

function EmpresaFormModal({
  modo,
  empresaId,
  nome,
  cnpj,
  erro,
  salvando,
  onClose,
  onSubmit,
  onNomeChange,
  onCnpjChange,
}: EmpresaFormModalProps) {
  const [membros, setMembros] = useState<EmpresaMembroResumo[]>([])
  const [loadingMembros, setLoadingMembros] = useState(false)
  const [erroMembros, setErroMembros] = useState('')
  const backdropDismiss = useBackdropDismiss(onClose, salvando)

  useEffect(() => {
    if (modo !== 'editar' || !empresaId) return

    let ativo = true

    const carregarMembros = async () => {
      setLoadingMembros(true)
      setErroMembros('')

      const { data, error } = await supabase.rpc('listar_membros_empresa', {
        p_empresa_id: empresaId,
      })

      if (!ativo) return

      if (error) {
        setErroMembros(error.message ?? 'Nao foi possivel carregar os acessos da empresa.')
        setLoadingMembros(false)
        return
      }

      setMembros((data ?? []) as EmpresaMembroResumo[])
      setLoadingMembros(false)
    }

    void carregarMembros()

    return () => {
      ativo = false
    }
  }, [empresaId, modo])

  return (
    <div
      className={styles.modalBackdrop}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={`${styles.modal} ${modo === 'editar' ? styles.modalWide : ''}`} onClick={e => e.stopPropagation()}>
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
            CNPJ *
            <input
              className={styles.input}
              value={cnpj}
              onChange={e => onCnpjChange(formatarCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              maxLength={18}
              pattern="\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}"
              title="Informe um CNPJ válido no formato 00.000.000/0000-00"
              disabled={salvando}
            />
          </label>
          {erro && <p className={styles.erro}>{erro}</p>}

          {modo === 'editar' && (
            <section className={styles.membersSection}>
              <div className={styles.membersHeader}>
                <div>
                  <p className={styles.membersEyebrow}>Acessos da empresa</p>
                  <h3 className={styles.membersTitle}>
                    {loadingMembros ? 'Carregando colaboradores...' : `${membros.length} acesso${membros.length === 1 ? '' : 's'}`}
                  </h3>
                </div>
              </div>

              {erroMembros && <p className={styles.erro}>{erroMembros}</p>}

              {!erroMembros && (
                <div className={styles.membersList}>
                  {membros.map(membro => (
                    <div key={membro.user_id} className={styles.memberItem}>
                      <div className={styles.memberIdentity}>
                        <strong className={styles.memberName}>{membro.name?.trim() || membro.email || 'Usuario'}</strong>
                        <span className={styles.memberEmail}>{membro.email || 'E-mail nao informado'}</span>
                      </div>
                      <div className={styles.memberBadges}>
                        <span className={`${styles.memberBadge} ${membro.empresa_role === 'admin' ? styles.memberBadgeAdmin : styles.memberBadgeMember}`}>
                          {membro.empresa_role === 'admin' ? 'Titular' : 'Colaborador'}
                        </span>
                        <span className={`${styles.memberBadge} ${membro.tipo_usuario === 'titular' ? styles.memberBadgeAdmin : styles.memberBadgeNeutral}`}>
                          {membro.tipo_usuario === 'titular' ? 'Titular' : 'Colaborador'}
                        </span>
                      </div>
                    </div>
                  ))}

                  {!loadingMembros && membros.length === 0 && (
                    <p className={styles.membersHint}>Nenhum acesso encontrado para esta empresa.</p>
                  )}
                </div>
              )}
            </section>
          )}

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

function ConfirmDeleteModal({
  empresa,
  erro,
  deletando,
  onClose,
  onConfirm,
}: {
  empresa: EmpresaCard
  erro: string
  deletando: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const backdropDismiss = useBackdropDismiss(onClose, deletando)
  return (
    <div
      className={styles.modalBackdrop}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>Excluir empresa</h2>
        <p className={styles.deleteWarning}>
          Tem certeza que deseja excluir a empresa <strong>{empresa.nome}</strong>?
          Esta ação irá deletar a empresa e todos os seus lançamentos financeiros.
          Esta operação é irreversível.
        </p>
        {erro && <p className={styles.erro}>{erro}</p>}
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.btnCancelar}
            onClick={onClose}
            disabled={deletando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnExcluir}
            onClick={onConfirm}
            disabled={deletando}
          >
            {deletando ? 'Excluindo…' : 'Excluir empresa'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EmpresaGatePage({
  onSelecionar,
  onVoltar,
  onVerTermos,
  contexto = 'dre',
}: Props) {
  const [tipoUsuario, setTipoUsuario]     = useState<'titular' | 'colaborador'>('titular')
  const [empresas, setEmpresas]           = useState<EmpresaCard[]>([])
  const [loading, setLoading]             = useState(true)
  const [modalModo, setModalModo]         = useState<'criar' | 'editar' | null>(null)
  const [empresaEmEdicao, setEmpresaEmEdicao] = useState<Empresa | null>(null)
  const [empresaParaDeletar, setEmpresaParaDeletar] = useState<EmpresaCard | null>(null)
  const [deletando, setDeletando]         = useState(false)
  const [erroDelete, setErroDelete]       = useState('')
  const [busca, setBusca]                 = useState('')
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
      .select('role, tipo_usuario')
      .eq('id', user.id)
      .single()

    const adminSistema = profile?.role === 'admin'
    setIsSystemAdmin(adminSistema)
    setTipoUsuario((profile?.tipo_usuario as 'titular' | 'colaborador' | undefined) ?? 'titular')

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

  function abrirModalDelete(empresa: EmpresaCard) {
    setEmpresaParaDeletar(empresa)
    setErroDelete('')
  }

  function fecharModalDelete() {
    if (deletando) return
    setEmpresaParaDeletar(null)
    setErroDelete('')
  }

  async function handleDeletarEmpresa() {
    if (!empresaParaDeletar) return
    setDeletando(true)
    setErroDelete('')

    // 1. Delete lançamentos da empresa
    const { error: errLancamentos } = await supabase
      .from('dre_lancamentos')
      .delete()
      .eq('empresa_id', empresaParaDeletar.id)

    if (errLancamentos) {
      console.error('Erro ao excluir lançamentos:', errLancamentos)
      setErroDelete(errLancamentos.message ?? 'Erro ao excluir lançamentos.')
      setDeletando(false)
      return
    }

    // 2. Delete empresa (empresa_membros cascadeiam automaticamente)
    const { error: errEmpresa } = await supabase
      .from('empresas')
      .delete()
      .eq('id', empresaParaDeletar.id)

    if (errEmpresa) {
      console.error('Erro ao excluir empresa:', errEmpresa)
      setErroDelete(errEmpresa.message ?? 'Erro ao excluir empresa.')
      setDeletando(false)
      return
    }

    setEmpresas(prev => prev.filter(e => e.id !== empresaParaDeletar.id))
    setEmpresaParaDeletar(null)
    setDeletando(false)
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
    setCnpj(formatarCnpj(empresa.cnpj ?? ''))
    setErro('')
  }

  async function handleSalvarEmpresa(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Informe o nome da empresa.'); return }
    if (!cnpj.trim()) { setErro('Informe o CNPJ da empresa.'); return }
    if (!validarCnpj(cnpj)) { setErro('Informe um CNPJ valido.'); return }
    setSalvando(true)
    setErro('')

    const cnpjNormalizado = normalizarCnpj(cnpj)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErro('Sessão expirada. Faça login novamente.')
      setSalvando(false)
      return
    }

    if (modalModo === 'editar' && empresaEmEdicao) {
      const payload = {
        nome: nome.trim(),
        cnpj: cnpjNormalizado,
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

    if (!isSystemAdmin && tipoUsuario !== 'titular') {
      setErro('Somente usuarios titulares podem criar empresas.')
      setSalvando(false)
      return
    }

    const { data, error } = await supabase
      .from('empresas')
      .insert({
        nome: nome.trim(),
        cnpj: cnpjNormalizado,
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

  const podeCriarEmpresa = isSystemAdmin || tipoUsuario === 'titular'

  const podeEditarEmpresa = useMemo(() => (
    (empresaId: string) => isSystemAdmin || empresaRoles[empresaId] === 'admin'
  ), [empresaRoles, isSystemAdmin])

  const buscaNormalizada = busca.trim().toLocaleLowerCase('pt-BR')
  const empresasFiltradas = useMemo(() => {
    if (!buscaNormalizada) return empresas

    return empresas.filter(empresa => {
      const nomeEmpresa = empresa.nome.toLocaleLowerCase('pt-BR')
      const nomeDono = empresa.donoNome?.toLocaleLowerCase('pt-BR') ?? ''

      return nomeEmpresa.includes(buscaNormalizada) || nomeDono.includes(buscaNormalizada)
    })
  }, [buscaNormalizada, empresas])

  const textos = contexto === 'labs'
    ? {
        tituloComEmpresas: 'Selecionar empresa',
        tituloSemEmpresas: podeCriarEmpresa ? 'Criar sua primeira empresa' : 'Aguardando vinculo com empresa',
        subtituloComEmpresas: podeCriarEmpresa
          ? 'Escolha a empresa para ver os laboratórios cadastrados ou crie uma nova.'
          : 'Escolha a empresa vinculada ao seu acesso para ver os laboratórios cadastrados.',
        subtituloSemEmpresas: podeCriarEmpresa
          ? 'Para usar o Controle de Laboratórios, você precisa criar uma empresa.'
          : 'Seu acesso esta como colaborador. Um titular precisa vincular voce a uma empresa em Minhas empresas.',
        botaoSelecionar: 'Acessar laboratórios',
      }
    : contexto === 'precificacao'
      ? {
          tituloComEmpresas: 'Selecionar empresa',
          tituloSemEmpresas: podeCriarEmpresa ? 'Criar sua primeira empresa' : 'Aguardando vinculo com empresa',
          subtituloComEmpresas: podeCriarEmpresa
            ? 'Escolha a empresa para gerenciar a precificação ou crie uma nova.'
            : 'Escolha a empresa vinculada ao seu acesso para gerenciar a precificação.',
          subtituloSemEmpresas: podeCriarEmpresa
            ? 'Para usar a Precificação, você precisa criar uma empresa.'
            : 'Seu acesso esta como colaborador. Um titular precisa vincular voce a uma empresa em Minhas empresas.',
          botaoSelecionar: 'Acessar precificação',
        }
    : {
        tituloComEmpresas: 'Selecionar empresa',
        tituloSemEmpresas: podeCriarEmpresa ? 'Criar sua primeira empresa' : 'Aguardando vinculo com empresa',
        subtituloComEmpresas: podeCriarEmpresa
          ? 'Escolha a empresa que deseja analisar ou crie uma nova.'
          : 'Escolha a empresa vinculada ao seu acesso para analisar os dados.',
        subtituloSemEmpresas: podeCriarEmpresa
          ? 'Para usar a Análise DRE, você precisa criar uma empresa.'
          : 'Seu acesso esta como colaborador. Um titular precisa vincular voce a uma empresa em Minhas empresas.',
        botaoSelecionar: 'Acessar DRE',
      }

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
          {empresas.length === 0 ? textos.tituloSemEmpresas : textos.tituloComEmpresas}
        </h1>
        <p className={styles.subtitulo}>
          {empresas.length === 0
            ? textos.subtituloSemEmpresas
            : textos.subtituloComEmpresas}
        </p>
        {empresas.length > 0 && (
          <label className={styles.searchWrap}>
            <span className={styles.searchLabel}>Buscar empresa</span>
            <input
              type="search"
              className={styles.searchInput}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Busque por empresa ou criador"
            />
          </label>
        )}
      </header>

      {empresas.length > 0 && empresasFiltradas.length === 0 && (
        <p className={styles.emptyState}>
          Nenhuma empresa encontrada para “{busca.trim()}”. Tente buscar pelo nome da empresa ou do criador.
        </p>
      )}

      <div className={styles.grade}>
        {empresasFiltradas.map(emp => {
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
                <>
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
                  <button
                    type="button"
                    className={styles.cardDeleteButton}
                    title={`Excluir ${emp.nome}`}
                    aria-label={`Excluir ${emp.nome}`}
                    onClick={event => {
                      event.stopPropagation()
                      abrirModalDelete(emp)
                    }}
                  >
                    <IconTrash />
                  </button>
                </>
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
                    {textos.botaoSelecionar}
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {podeCriarEmpresa && (
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
        )}
      </div>

      {modalModo && (
        <EmpresaFormModal
          modo={modalModo}
          empresaId={empresaEmEdicao?.id ?? null}
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

      {empresaParaDeletar && (
        <ConfirmDeleteModal
          empresa={empresaParaDeletar}
          erro={erroDelete}
          deletando={deletando}
          onClose={fecharModalDelete}
          onConfirm={handleDeletarEmpresa}
        />
      )}

      {onVerTermos && (
        <footer style={{ textAlign: 'center', padding: '24px 0 32px', marginTop: 8 }}>
          <button
            type="button"
            onClick={onVerTermos}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: '#555',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
              padding: 0,
            }}
          >
            Termos de Uso e Política de Privacidade — DFC ClinicScale
          </button>
        </footer>
      )}
    </div>
  )
}
