import { useEffect, useMemo, useRef, useState } from 'react'
import { read, utils } from 'xlsx'
import styles from './AdminSettingsPage.module.css'
import { supabase } from '../lib/supabase'
import type { DreClassificacao, Empresa, EmpresaMembro, ExemploUpload, Profile } from '../lib/types'

// ── Constantes ────────────────────────────────────────────────────────────

const OPENAI_MODELS_FALLBACK = [
  { value: 'gpt-4o-mini',       label: 'GPT-4o Mini (Recomendado)' },
  { value: 'gpt-4o',            label: 'GPT-4o' },
  { value: 'gpt-4-turbo',       label: 'GPT-4 Turbo' },
  { value: 'gpt-4',             label: 'GPT-4' },
  { value: 'gpt-3.5-turbo',     label: 'GPT-3.5 Turbo' },
  { value: 'gpt-3.5-turbo-16k', label: 'GPT-3.5 Turbo 16K' },
  { value: 'o1-mini',           label: 'O1 Mini' },
  { value: 'o1-preview',        label: 'O1 Preview' },
  { value: 'o3-mini',           label: 'O3 Mini' },
]

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

const EXEMPLOS_ESTATICOS = [
  { nome: 'Exemplo Básico', arquivo: 'exemplo.xlsx'    },
  { nome: 'Conta Azul',     arquivo: 'conta-azul.xlsx' },
  { nome: 'CliniCorp',      arquivo: 'clinicorp.xlsx'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────

async function lerCabecalhosArquivo(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const wb = read(buffer, { type: 'array' })
  if (!wb.SheetNames.length) return []
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!rows.length) return []
  const headerIdx = rows.findIndex(r =>
    (r as unknown[]).filter(c => String(c ?? '').trim()).length >= 2,
  )
  if (headerIdx < 0) return []
  return (rows[headerIdx] as unknown[])
    .map(h =>
      String(h ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
    )
    .filter(Boolean)
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

// ── Tipos locais ──────────────────────────────────────────────────────────

type Tab = 'modelo' | 'classificacoes' | 'exemplos' | 'usuarios'

interface AdminUsuario extends Profile {
  empresasAcesso: string[]
  titularesResponsaveis: string[]
}

// ── Componente principal ──────────────────────────────────────────────────

interface AdminSettingsPageProps {
  onVoltar: () => void
}

export default function AdminSettingsPage({ onVoltar }: AdminSettingsPageProps) {
  const [tab, setTab] = useState<Tab>('modelo')

  // ── Tab: Modelo IA ────────────────────────────────────────────────────
  const [openaiModels,  setOpenaiModels]  = useState(OPENAI_MODELS_FALLBACK)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modeloAtual,   setModeloAtual]   = useState(DEFAULT_OPENAI_MODEL)
  const [savingModelo,  setSavingModelo]  = useState(false)
  const [savedModelo,   setSavedModelo]   = useState(false)

  // ── Tab: Classificações DRE ───────────────────────────────────────────
  const [classificacoes, setClassificacoes] = useState<DreClassificacao[]>([])
  const [novaClassNome,  setNovaClassNome]  = useState('')
  const [novaClassTipo,  setNovaClassTipo]  = useState<'receita' | 'despesa'>('despesa')
  const [addingClass,    setAddingClass]    = useState(false)

  // ── Tab: Exemplos de Upload ───────────────────────────────────────────
  const [exemplos,        setExemplos]        = useState<ExemploUpload[]>([])
  const [exemplosLoading, setExemplosLoading] = useState(false)
  const [novoExNome,      setNovoExNome]      = useState('')
  const [novoExArquivo,   setNovoExArquivo]   = useState('')
  const [novoExFile,      setNovoExFile]      = useState<File | null>(null)
  const [addingEx,        setAddingEx]        = useState(false)
  const [exErro,          setExErro]          = useState('')
  const exFileRef = useRef<HTMLInputElement>(null)

  // ── Tab: Usuarios ─────────────────────────────────────────────────────
  const [usuarios,        setUsuarios]        = useState<AdminUsuario[]>([])
  const [usuariosLoading, setUsuariosLoading] = useState(false)
  const [showAddUser,     setShowAddUser]     = useState(false)
  const [novoEmail,       setNovoEmail]       = useState('')
  const [novoExpires,     setNovoExpires]     = useState('')
  const [addingUser,      setAddingUser]      = useState(false)
  const [addUserErro,     setAddUserErro]     = useState('')
  const [addUserOk,       setAddUserOk]       = useState('')
  const [savingUserId,    setSavingUserId]    = useState<string | null>(null)
  const [expiresDrafts,   setExpiresDrafts]   = useState<Record<string, string>>({})
  const [savingExpiryId,  setSavingExpiryId]  = useState<string | null>(null)
  const [confirmDelete,   setConfirmDelete]   = useState<Profile | null>(null)
  const [deleteCheck,     setDeleteCheck]     = useState(false)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [deleteErro,      setDeleteErro]      = useState('')
  const [savingRoleId,    setSavingRoleId]    = useState<string | null>(null)
  const [currentUserId,   setCurrentUserId]   = useState<string | null>(null)
  const [usuariosBusca,   setUsuariosBusca]   = useState('')

  // ── Fetch: Modelo IA ──────────────────────────────────────────────────

  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true)
      const { data, error } = await supabase.functions.invoke('openai-models', { method: 'GET' })
      if (!error && Array.isArray(data?.models) && data.models.length > 0) {
        setOpenaiModels(data.models.map((m: string) => ({ value: m, label: m })))
      }
      setModelsLoading(false)
    }
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id ?? null)
    }
    fetchModels()
    fetchClassificacoes()
    fetchExemplos()
    fetchUsuarios()
    fetchCurrentUser()
  }, [])

  useEffect(() => {
    supabase.from('configuracoes').select('valor').eq('chave', 'modelo_openai').single()
      .then(({ data }) => {
        if (!data) return
        const existe = openaiModels.some(m => m.value === data.valor)
        if (existe) { setModeloAtual(data.valor); return }
        if (data.valor) {
          setOpenaiModels(p => [...p, { value: data.valor, label: `${data.valor} (configurado)` }])
          setModeloAtual(data.valor)
          return
        }
        setModeloAtual(DEFAULT_OPENAI_MODEL)
      })
  }, [openaiModels])

  const salvarModelo = async () => {
    setSavingModelo(true)
    await supabase.from('configuracoes').upsert({ chave: 'modelo_openai', valor: modeloAtual })
    setSavingModelo(false)
    setSavedModelo(true)
    setTimeout(() => setSavedModelo(false), 2000)
  }

  // ── Fetch: Classificações ─────────────────────────────────────────────

  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('dre_classificacoes')
      .select('*')
      .order('tipo')
      .order('nome')
    setClassificacoes(data ?? [])
  }

  const adicionarClassificacao = async () => {
    if (!novaClassNome.trim()) return
    setAddingClass(true)
    await supabase.from('dre_classificacoes').insert({ nome: novaClassNome.trim(), tipo: novaClassTipo, ativo: true })
    setNovaClassNome('')
    await fetchClassificacoes()
    setAddingClass(false)
  }

  const removerClassificacao = async (id: string) => {
    await supabase.from('dre_classificacoes').delete().eq('id', id)
    setClassificacoes(p => p.filter(c => c.id !== id))
  }

  // ── Fetch: Exemplos ───────────────────────────────────────────────────

  const fetchExemplos = async () => {
    setExemplosLoading(true)
    const { data } = await supabase.from('exemplos_upload').select('*').order('created_at')
    const lista = data ?? []

    const nomesExistentes = new Set(lista.map(e => e.nome))
    const faltantes = EXEMPLOS_ESTATICOS.filter(ex => !nomesExistentes.has(ex.nome))
    if (faltantes.length > 0) {
      for (const ex of faltantes) {
        try {
          const res = await fetch(`/exemplos/${ex.arquivo}`)
          if (!res.ok) continue
          const buffer = await res.arrayBuffer()
          const wb = read(buffer, { type: 'array' })
          if (!wb.SheetNames.length) continue
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })
          const headerIdx = rows.findIndex(r =>
            (r as unknown[]).filter(c => String(c ?? '').trim()).length >= 2,
          )
          if (headerIdx < 0) continue
          const cabecalhos = (rows[headerIdx] as unknown[])
            .map(h =>
              String(h ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(),
            )
            .filter(Boolean)
          await supabase.from('exemplos_upload').insert({ nome: ex.nome, arquivo: ex.arquivo, cabecalhos })
        } catch { /* ignora erros de seed */ }
      }
      const { data: seeded } = await supabase.from('exemplos_upload').select('*').order('created_at')
      setExemplos(seeded ?? [])
    } else {
      setExemplos(lista)
    }
    setExemplosLoading(false)
  }

  const adicionarExemplo = async () => {
    setExErro('')
    if (!novoExNome.trim()) { setExErro('Informe um nome para o modelo.'); return }
    if (!novoExFile)        { setExErro('Selecione um arquivo .xlsx ou .csv.'); return }

    setAddingEx(true)
    try {
      const cabecalhos = await lerCabecalhosArquivo(novoExFile)
      if (cabecalhos.length === 0) {
        setExErro('Não foi possível ler os cabeçalhos do arquivo.')
        setAddingEx(false)
        return
      }
      const arquivo = novoExArquivo.trim() || null
      const { error } = await supabase.from('exemplos_upload').insert({ nome: novoExNome.trim(), arquivo, cabecalhos })
      if (error) { setExErro(error.message); setAddingEx(false); return }
      setNovoExNome('')
      setNovoExArquivo('')
      setNovoExFile(null)
      if (exFileRef.current) exFileRef.current.value = ''
      await fetchExemplos()
    } catch (e) {
      setExErro(e instanceof Error ? e.message : 'Erro ao adicionar exemplo.')
    }
    setAddingEx(false)
  }

  const removerExemplo = async (id: string) => {
    await supabase.from('exemplos_upload').delete().eq('id', id)
    setExemplos(p => p.filter(e => e.id !== id))
  }

  // ── Fetch: Usuários ───────────────────────────────────────────────────

  const fetchUsuarios = async () => {
    setUsuariosLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, role, tipo_usuario, ativo, expires_at, created_at, updated_at, plan, avatar_url')
      .order('created_at', { ascending: false })

    const perfis = (data ?? []) as Profile[]

    const { data: membrosData } = await supabase
      .from('empresa_membros')
      .select('user_id, role, empresa_id')

    const membros = (membrosData ?? []) as Pick<EmpresaMembro, 'user_id' | 'role' | 'empresa_id'>[]

    const empresaIds = [...new Set(membros.map(item => item.empresa_id))]

    let empresasMap = new Map<string, Pick<Empresa, 'id' | 'nome' | 'created_by'>>()

    if (empresaIds.length > 0) {
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('id, nome, created_by')
        .in('id', empresaIds)

      empresasMap = new Map(
        ((empresasData ?? []) as Pick<Empresa, 'id' | 'nome' | 'created_by'>[]).map(empresa => [empresa.id, empresa]),
      )
    }

    const titularIds = [...new Set(
      membros
        .map(item => empresasMap.get(item.empresa_id)?.created_by)
        .filter((id): id is string => !!id),
    )]

    let titularesMap: Record<string, string> = {}

    if (titularIds.length > 0) {
      const { data: titulares } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', titularIds)

      titularesMap = Object.fromEntries(
        ((titulares ?? []) as Pick<Profile, 'id' | 'name' | 'email'>[]).map(titular => [
          titular.id,
          titular.name?.trim() || titular.email?.trim() || 'Titular',
        ]),
      )
    }

    const vinculosPorUsuario = new Map<string, { empresasAcesso: string[]; titularesResponsaveis: string[] }>()

    membros.forEach(item => {
      const atual = vinculosPorUsuario.get(item.user_id) ?? { empresasAcesso: [], titularesResponsaveis: [] }
      const empresa = empresasMap.get(item.empresa_id)
      const nomeEmpresa = empresa?.nome?.trim()
      const titularResponsavel = empresa?.created_by ? titularesMap[empresa.created_by] : null

      if (nomeEmpresa && !atual.empresasAcesso.includes(nomeEmpresa)) {
        atual.empresasAcesso.push(nomeEmpresa)
      }

      if (item.role === 'membro' && titularResponsavel && !atual.titularesResponsaveis.includes(titularResponsavel)) {
        atual.titularesResponsaveis.push(titularResponsavel)
      }

      vinculosPorUsuario.set(item.user_id, atual)
    })

    setUsuarios(perfis.map(profile => {
      const vinculos = vinculosPorUsuario.get(profile.id)
      return {
        ...profile,
        empresasAcesso: vinculos?.empresasAcesso ?? [],
        titularesResponsaveis: vinculos?.titularesResponsaveis ?? [],
      }
    }))
    setUsuariosLoading(false)
  }

  useEffect(() => {
    setExpiresDrafts(Object.fromEntries(usuarios.map(usuario => [usuario.id, toDateInputValue(usuario.expires_at)])))
  }, [usuarios])

  const roleOrder: Record<string, number> = { admin: 0, editor: 1, user: 2 }

  const usuariosOrdenados = useMemo(
    () => [...usuarios].sort((a, b) => {
      const diff = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99)
      if (diff !== 0) return diff
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }),
    [usuarios],
  )

  const buscaUsuariosNormalizada = usuariosBusca.trim().toLocaleLowerCase('pt-BR')

  const usuariosFiltrados = useMemo(() => {
    if (!buscaUsuariosNormalizada) return usuariosOrdenados

    return usuariosOrdenados.filter(usuario => {
      const textoBusca = [
        usuario.name ?? '',
        usuario.email ?? '',
        usuario.role,
        usuario.tipo_usuario,
        usuario.empresasAcesso.join(' '),
        usuario.titularesResponsaveis.join(' '),
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR')

      return textoBusca.includes(buscaUsuariosNormalizada)
    })
  }, [buscaUsuariosNormalizada, usuariosOrdenados])

  const alternarStatusUsuario = async (usuario: Profile) => {
    if (usuario.role === 'admin') return

    const proximoStatus = !(usuario.ativo ?? true)
    setSavingUserId(usuario.id)

    const { error } = await supabase
      .from('profiles')
      .update({ ativo: proximoStatus })
      .eq('id', usuario.id)

    if (!error) {
      setUsuarios(atual => atual.map(item => (
        item.id === usuario.id ? { ...item, ativo: proximoStatus } : item
      )))
    }

    setSavingUserId(null)
  }


  const salvarExpiracaoUsuario = async (usuario: Profile) => {
    if (usuario.role === 'admin') return

    const expires_at = expiresDrafts[usuario.id]
      ? new Date(`${expiresDrafts[usuario.id]}T00:00:00.000Z`).toISOString()
      : null

    setSavingExpiryId(usuario.id)

    const { error } = await supabase
      .from('profiles')
      .update({ expires_at })
      .eq('id', usuario.id)

    if (!error) {
      setUsuarios(atual => atual.map(item => (
        item.id === usuario.id ? { ...item, expires_at } : item
      )))
    }

    setSavingExpiryId(null)
  }

  const alterarFuncaoUsuario = async (usuario: Profile, novaFuncao: string) => {
    if (usuario.id === currentUserId) return
    if (novaFuncao === usuario.role) return
    setSavingRoleId(usuario.id)

    const { error } = await supabase
      .from('profiles')
      .update({ role: novaFuncao })
      .eq('id', usuario.id)

    if (!error) {
      setUsuarios(atual => atual.map(item => (
        item.id === usuario.id ? { ...item, role: novaFuncao } : item
      )))
    }

    setSavingRoleId(null)
  }

  const deletarUsuario = async (usuario: Profile) => {
    setDeletingId(usuario.id)
    setDeleteErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: usuario.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error || data?.error) {
        setDeleteErro(data?.error ?? error?.message ?? 'Erro ao deletar usuário.')
        setDeletingId(null)
        return
      }
      setUsuarios(atual => atual.filter(u => u.id !== usuario.id))
      setConfirmDelete(null)
      setDeleteCheck(false)
    } catch (e) {
      setDeleteErro(e instanceof Error ? e.message : 'Erro ao deletar usuário.')
    }
    setDeletingId(null)
  }

  const enviarConvite = async () => {
    setAddUserErro('')
    setAddUserOk('')
    if (!novoEmail.trim()) { setAddUserErro('Informe o e-mail do usuário.'); return }

    setAddingUser(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: novoEmail.trim(),
          expires_at: novoExpires ? new Date(novoExpires).toISOString() : null,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })

      if (error || data?.error) {
        setAddUserErro(data?.error ?? error?.message ?? 'Erro ao enviar convite.')
      } else {
        setAddUserOk(`Convite enviado para ${novoEmail.trim()}!`)
        setNovoEmail('')
        setNovoExpires('')
        setShowAddUser(false)
        await fetchUsuarios()
      }
    } catch (e) {
      setAddUserErro(e instanceof Error ? e.message : 'Erro ao enviar convite.')
    }
    setAddingUser(false)
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Cabeçalho */}
      <div className={styles.pageHeader}>
        <button className={styles.backBtn} onClick={onVoltar}>
          ← Voltar
        </button>
        <h1 className={styles.pageTitle}>Configurações Admin</h1>
      </div>

      {/* Abas */}
      <div className={styles.tabs}>
        {([
          { key: 'modelo',         label: 'Modelo IA'         },
          { key: 'classificacoes', label: 'Classificações DRE' },
          { key: 'exemplos',       label: 'Exemplos de Upload' },
          { key: 'usuarios',       label: 'Usuários'           },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>

        {/* ── Modelo IA ─────────────────────────────────────────────────── */}
        {tab === 'modelo' && (
          <div className={styles.section}>
            <div className={styles.field}>
              <label className={styles.label}>Modelo OpenAI</label>
              <select
                className={styles.input}
                value={modeloAtual}
                onChange={e => setModeloAtual(e.target.value)}
              >
                {openaiModels.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className={styles.hint}>
                Modelo usado para sugerir a classificação automática nos lançamentos do DRE.
              </p>
              {modelsLoading && <p className={styles.hint}>Atualizando catálogo de modelos disponíveis...</p>}
            </div>
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={salvarModelo} disabled={savingModelo}>
                {savingModelo ? 'Salvando...' : savedModelo ? 'Salvo ✓' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* ── Classificações DRE ────────────────────────────────────────── */}
        {tab === 'classificacoes' && (
          <div className={styles.section}>
            <div className={styles.listWrap}>
              {classificacoes.length === 0 && (
                <p className={styles.hint}>Nenhuma classificação cadastrada ainda.</p>
              )}
              {classificacoes.map(c => (
                <div key={c.id} className={styles.listItem}>
                  <span className={`${styles.badge} ${c.tipo === 'receita' ? styles.badgeReceita : styles.badgeDespesa}`}>
                    {c.tipo}
                  </span>
                  <span className={styles.itemName}>{c.nome}</span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removerClassificacao(c.id)}
                    title="Remover"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.addForm}>
              <p className={styles.label}>Nova classificação</p>
              <div className={styles.toggleRow}>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${novaClassTipo === 'receita' ? styles.toggleBtnActive : ''}`}
                  onClick={() => setNovaClassTipo('receita')}
                >
                  Receita
                </button>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${novaClassTipo === 'despesa' ? styles.toggleBtnActive : ''}`}
                  onClick={() => setNovaClassTipo('despesa')}
                >
                  Despesa
                </button>
              </div>
              <div className={styles.addRow}>
                <input
                  className={styles.input}
                  placeholder="Ex: Receita sobre Serviço"
                  value={novaClassNome}
                  onChange={e => setNovaClassNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarClassificacao()}
                />
                <button
                  className={styles.btnPrimary}
                  onClick={adicionarClassificacao}
                  disabled={addingClass || !novaClassNome.trim()}
                >
                  {addingClass ? '...' : '+ Adicionar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Exemplos de Upload ────────────────────────────────────────── */}
        {tab === 'exemplos' && (
          <div className={styles.section}>
            <p className={styles.hint}>
              Cada modelo define quais colunas são aceitas no upload de extratos.
              O sistema identifica o arquivo pelo cabeçalho — não pelo nome do arquivo.
            </p>

            {exemplosLoading && <p className={styles.hint}>Carregando...</p>}

            <div className={styles.listWrap}>
              {!exemplosLoading && exemplos.length === 0 && (
                <p className={styles.hint}>Nenhum modelo cadastrado ainda.</p>
              )}
              {exemplos.map(ex => (
                <div key={ex.id} className={styles.listItem}>
                  <div className={styles.exemploInfo}>
                    <span className={styles.itemName}>{ex.nome}</span>
                    <span className={styles.exemploColunasText}>
                      {ex.cabecalhos.join(' · ')}
                    </span>
                  </div>
                  {ex.arquivo && (
                    <a
                      href={`/exemplos/${ex.arquivo}`}
                      download
                      className={styles.downloadLink}
                      title="Baixar arquivo de exemplo"
                    >
                      ↓
                    </a>
                  )}
                  <button
                    className={styles.removeBtn}
                    onClick={() => removerExemplo(ex.id)}
                    title="Remover modelo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.addForm}>
              <p className={styles.label}>Novo modelo</p>
              <div className={styles.addRow}>
                <input
                  className={styles.input}
                  placeholder="Nome do modelo (ex: Conta Azul)"
                  value={novoExNome}
                  onChange={e => setNovoExNome(e.target.value)}
                />
              </div>
              <div className={styles.addRow} style={{ marginTop: 8 }}>
                <input
                  className={styles.input}
                  placeholder="Nome do arquivo estático (ex: conta-azul.xlsx) — opcional"
                  value={novoExArquivo}
                  onChange={e => setNovoExArquivo(e.target.value)}
                />
              </div>
              <div className={styles.addRow} style={{ marginTop: 8 }}>
                <input
                  ref={exFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className={styles.input}
                  style={{ cursor: 'pointer' }}
                  onChange={e => setNovoExFile(e.target.files?.[0] ?? null)}
                />
                <button
                  className={styles.btnPrimary}
                  onClick={adicionarExemplo}
                  disabled={addingEx || !novoExNome.trim() || !novoExFile}
                >
                  {addingEx ? '...' : '+ Adicionar'}
                </button>
              </div>
              {exErro && <p className={styles.erro}>{exErro}</p>}
            </div>
          </div>
        )}

        {/* ── Usuários ──────────────────────────────────────────────────── */}
        {tab === 'usuarios' && (
          <div className={styles.section}>
            <div className={styles.usuariosHeader}>
              <div className={styles.usuariosHeaderInfo}>
                <p className={styles.hint}>
                  Gerencie os usuários do sistema. Convites são enviados por e-mail.
                </p>
                <input
                  className={`${styles.input} ${styles.userSearchInput}`}
                  type="search"
                  placeholder="Buscar por nome, e-mail, empresa ou titular"
                  value={usuariosBusca}
                  onChange={e => setUsuariosBusca(e.target.value)}
                />
              </div>
              <button
                className={styles.btnPrimary}
                onClick={() => { setShowAddUser(true); setAddUserErro(''); setAddUserOk('') }}
              >
                + Adicionar Usuário
              </button>
            </div>

            {/* Formulário de convite */}
            {showAddUser && (
              <div className={styles.inviteForm}>
                <p className={styles.label}>Novo convite</p>
                <div className={styles.inviteFields}>
                  <div className={styles.field}>
                    <label className={styles.labelSm}>E-mail</label>
                    <input
                      className={styles.input}
                      type="email"
                      placeholder="usuario@email.com"
                      value={novoEmail}
                      onChange={e => setNovoEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && enviarConvite()}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.labelSm}>Data de expiração (opcional)</label>
                    <input
                      className={styles.input}
                      type="date"
                      value={novoExpires}
                      onChange={e => setNovoExpires(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.inviteActions}>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => { setShowAddUser(false); setNovoEmail(''); setNovoExpires('') }}
                  >
                    Cancelar
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={enviarConvite}
                    disabled={addingUser || !novoEmail.trim()}
                  >
                    {addingUser ? 'Enviando...' : 'Enviar convite'}
                  </button>
                </div>
                {addUserErro && <p className={styles.erro}>{addUserErro}</p>}
              </div>
            )}

            {addUserOk && <p className={styles.ok}>{addUserOk}</p>}

            {/* Modal de confirmação de delete */}
            {confirmDelete && (
              <div className={styles.modalOverlay}>
                <div className={styles.modalBox}>
                  <div className={styles.modalIcon}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6"/>
                      <path d="M14 11v6"/>
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </div>
                  <h3 className={styles.modalTitle}>Deletar usuário</h3>
                  <p className={styles.modalDesc}>
                    Você está prestes a deletar permanentemente a conta de{' '}
                    <strong>{confirmDelete.name ?? confirmDelete.email ?? 'este usuário'}</strong>.
                  </p>
                  <div className={styles.modalWarning}>
                    <p>⚠ Todos os dados do usuário serão perdidos permanentemente.</p>
                    <p>⚠ Esta ação não poderá ser revertida.</p>
                  </div>
                  <label className={styles.modalCheckLabel}>
                    <input
                      type="checkbox"
                      checked={deleteCheck}
                      onChange={e => setDeleteCheck(e.target.checked)}
                    />
                    Entendo que todos os dados serão perdidos permanentemente e que esta ação não pode ser desfeita.
                  </label>
                  {deleteErro && <p className={styles.erro}>{deleteErro}</p>}
                  <div className={styles.modalActions}>
                    <button
                      className={styles.btnSecondary}
                      onClick={() => { setConfirmDelete(null); setDeleteCheck(false); setDeleteErro('') }}
                      disabled={!!deletingId}
                    >
                      Cancelar
                    </button>
                    <button
                      className={styles.btnDanger}
                      onClick={() => deletarUsuario(confirmDelete)}
                      disabled={!deleteCheck || !!deletingId}
                    >
                      {deletingId === confirmDelete.id ? 'Deletando...' : 'Deletar permanentemente'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tabela de usuários */}
            {usuariosLoading && <p className={styles.hint}>Carregando usuários...</p>}

            {!usuariosLoading && (
              <div className={styles.userCards}>
                {usuarios.length === 0 && (
                  <div className={styles.userCardEmpty}>
                    Nenhum usuário encontrado.
                  </div>
                )}

                {usuarios.length > 0 && usuariosFiltrados.length === 0 && (
                  <div className={styles.userCardEmpty}>
                    Nenhum usuário encontrado para "{usuariosBusca.trim()}".
                  </div>
                )}

                {usuariosFiltrados.map(u => (
                  <article key={u.id} className={styles.userCard}>
                    <div className={styles.userCardTop}>
                      <div className={styles.userCardIdentity}>
                        <h3 className={styles.userCardName}>{u.name ?? '—'}</h3>
                        <p className={styles.userCardEmail}>{u.email ?? '—'}</p>
                      </div>

                      <div className={styles.userCardBadges}>
                        {u.id === currentUserId ? (
                          <div className={styles.roleEditorWrap}>
                            <span className={styles.roleEditLabel}>Sua função</span>
                            <span className={`${styles.roleBadge} ${u.role === 'admin' ? styles.roleAdmin : u.role === 'editor' ? styles.roleEditor : styles.roleUser}`}>
                              {u.role}
                            </span>
                          </div>
                        ) : (
                          <label className={styles.roleEditorWrap}>
                            <span className={styles.roleEditLabel}>Alterar função</span>
                            <select
                              className={styles.roleSelect}
                              value={u.role}
                              onChange={e => alterarFuncaoUsuario(u, e.target.value)}
                              disabled={savingRoleId === u.id}
                            >
                              <option value="admin">admin</option>
                              <option value="editor">editor</option>
                              <option value="user">user</option>
                            </select>
                          </label>
                        )}

                        <span className={`${styles.userTypeBadge} ${u.tipo_usuario === 'colaborador' ? styles.userTypeColaborador : styles.userTypeTitular}`}>
                          {u.tipo_usuario === 'colaborador' ? 'Colaborador' : 'Titular'}
                        </span>
                      </div>
                    </div>

                    <div className={styles.userCardContent}>
                      <div className={styles.userLinksCompact}>
                        <span className={styles.userCardLabel}>Vínculos -</span>
                        {u.tipo_usuario === 'colaborador' && (
                          <span className={styles.userLinksLine}>
                            <span className={styles.userLinksLabel}>Titular:</span>{' '}
                            {u.titularesResponsaveis.length > 0 ? u.titularesResponsaveis.join(', ') : 'Não identificado'}
                          </span>
                        )}
                        <span className={styles.userLinksLine}>
                          <span className={styles.userLinksLabel}>Empresas:</span>{' '}
                          {u.empresasAcesso.length > 0 ? u.empresasAcesso.join(', ') : 'Sem acesso'}
                        </span>
                      </div>

                      <div className={styles.userMetaRow}>
                        <div className={styles.userMetaItem}>
                          <span className={styles.userCardLabel}>Status</span>
                          {u.role !== 'admin' ? (
                            <button
                              type="button"
                              className={`${styles.switch} ${(u.ativo ?? true) ? styles.switchActive : ''}`}
                              onClick={() => alternarStatusUsuario(u)}
                              disabled={savingUserId === u.id}
                              aria-pressed={u.ativo ?? true}
                              aria-label={`${(u.ativo ?? true) ? 'Desativar' : 'Ativar'} usuário ${u.email ?? u.name ?? ''}`.trim()}
                              title={(u.ativo ?? true) ? 'Clique para desativar o usuário' : 'Clique para ativar o usuário'}
                            >
                              <span className={styles.switchTrack}>
                                <span className={styles.switchThumb} />
                              </span>
                              <span className={styles.switchLabel}>{(u.ativo ?? true) ? 'Ativo' : 'Inativo'}</span>
                            </button>
                          ) : (
                            <span className={styles.statusMuted}>Sempre ativo</span>
                          )}
                        </div>

                        <div className={styles.userMetaItem}>
                          <span className={styles.userCardLabel}>Expiração</span>
                          {u.role !== 'admin' ? (
                            <div className={styles.expiryEditor}>
                              <input
                                type="date"
                                className={`${styles.input} ${styles.expiryInput}`}
                                value={expiresDrafts[u.id] ?? ''}
                                onChange={e => setExpiresDrafts(atual => ({ ...atual, [u.id]: e.target.value }))}
                                disabled={savingExpiryId === u.id}
                              />
                              <button
                                type="button"
                                className={styles.btnSecondary}
                                onClick={() => salvarExpiracaoUsuario(u)}
                                disabled={savingExpiryId === u.id}
                              >
                                {savingExpiryId === u.id ? 'Salvando...' : 'Salvar'}
                              </button>
                            </div>
                          ) : (
                            <span className={styles.userCardValue}>{formatDate(u.expires_at)}</span>
                          )}
                        </div>

                        <div className={styles.userMetaItem}>
                          <span className={styles.userCardLabel}>Desde</span>
                          <span className={styles.userCardValue}>{formatDate(u.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.userCardActions}>
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => { setConfirmDelete(u); setDeleteCheck(false); setDeleteErro('') }}
                          title="Deletar usuário"
                        >
                          Deletar
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
