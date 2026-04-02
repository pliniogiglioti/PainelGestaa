import { useEffect, useMemo, useRef, useState } from 'react'
import { read, utils } from 'xlsx'
import styles from './AdminSettingsPage.module.css'
import { supabase } from '../lib/supabase'
import type { DreClassificacao, ExemploUpload, Profile } from '../lib/types'

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
  const [usuarios,        setUsuarios]        = useState<Profile[]>([])
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
    fetchModels()
    fetchClassificacoes()
    fetchExemplos()
    fetchUsuarios()
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
      .select('id, name, email, role, ativo, expires_at, created_at')
      .order('created_at', { ascending: false })
    setUsuarios((data ?? []) as Profile[])
    setUsuariosLoading(false)
  }

  useEffect(() => {
    setExpiresDrafts(Object.fromEntries(usuarios.map(usuario => [usuario.id, toDateInputValue(usuario.expires_at)])))
  }, [usuarios])

  const usuariosOrdenados = useMemo(
    () => [...usuarios].sort((a, b) => {
      if (a.role === b.role) return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return a.role === 'admin' ? -1 : 1
    }),
    [usuarios],
  )

  const alternarStatusUsuario = async (usuario: Profile) => {
    if (usuario.role !== 'user') return

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
    if (usuario.role !== 'user') return

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
              <p className={styles.hint}>
                Gerencie os usuários do sistema. Convites são enviados por e-mail.
              </p>
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
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Nome</th>
                      <th className={styles.th}>E-mail</th>
                      <th className={styles.th}>Função</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>Expiração</th>
                      <th className={styles.th}>Desde</th>
                      <th className={styles.th}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.length === 0 && (
                      <tr>
                        <td className={styles.td} colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          Nenhum usuário encontrado.
                        </td>
                      </tr>
                    )}
                    {usuariosOrdenados.map(u => (
                      <tr key={u.id} className={styles.tr}>
                        <td className={styles.td}>{u.name ?? '—'}</td>
                        <td className={styles.td}>{u.email ?? '—'}</td>
                        <td className={styles.td}>
                          <span className={`${styles.roleBadge} ${u.role === 'admin' ? styles.roleAdmin : styles.roleUser}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className={styles.td}>
                          {u.role === 'user' ? (
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
                        </td>
                        <td className={styles.td}>
                          {u.role === 'user' ? (
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
                            formatDate(u.expires_at)
                          )}
                        </td>
                        <td className={styles.td}>{formatDate(u.created_at)}</td>
                        <td className={styles.td}>
                          {u.role === 'user' && (
                            <button
                              type="button"
                              className={styles.deleteBtn}
                              onClick={() => { setConfirmDelete(u); setDeleteCheck(false); setDeleteErro('') }}
                              title="Deletar usuário"
                            >
                              Deletar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
