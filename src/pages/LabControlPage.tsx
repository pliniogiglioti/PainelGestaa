import { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import type { Empresa, Lab, LabPreco, LabKanbanColuna, LabEnvio } from '../lib/types'
import styles from './LabControlPage.module.css'

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_COLUNAS = [
  { nome: 'Enviado',      ordem: 0, cor: '#6366f1' },
  { nome: 'Em produção',  ordem: 1, cor: '#f59e0b' },
  { nome: 'Pronto',       ordem: 2, cor: '#10b981' },
  { nome: 'Entregue',     ordem: 3, cor: '#3b82f6' },
  { nome: 'Concluído',    ordem: 4, cor: '#8b5cf6' },
]

const SHADE_OPTIONS = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
  'BL', 'OM', 'Outro',
]

// ── Helpers ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function isOverdue(envio: LabEnvio) {
  if (!envio.data_entrega_prometida) return false
  const finalStatuses = ['Concluído', 'Entregue']
  if (finalStatuses.includes(envio.status)) return false
  return envio.data_entrega_prometida < today()
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
)
const IconPhone = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.53 3.49 2 2 0 0 1 3.5 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
)
const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
)
const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconSettings2 = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconUpload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
)
const IconAlert = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const IconFlask = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6v7l4 8H5l4-8V3z"/>
    <line x1="9" y1="3" x2="15" y2="3"/>
  </svg>
)

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className={styles.spinnerWrap}>
      <div className={styles.spinner} />
    </div>
  )
}

// ── Modal Wrapper ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={`${styles.modal} ${wide ? styles.modalWide : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  )
}

// ── LabModal (Create/Edit Lab — Admin) ────────────────────────────────────

interface LabFormState {
  nome: string; cnpj: string; telefone: string; email: string
  endereco: string; prazo_medio_dias: string; observacoes: string
}

function LabModal({ lab, empresaId, onClose, onSaved }: {
  lab: Lab | null; empresaId: string; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<LabFormState>({
    nome:             lab?.nome ?? '',
    cnpj:             lab?.cnpj ?? '',
    telefone:         lab?.telefone ?? '',
    email:            lab?.email ?? '',
    endereco:         lab?.endereco ?? '',
    prazo_medio_dias: String(lab?.prazo_medio_dias ?? 7),
    observacoes:      lab?.observacoes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (f: keyof LabFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError('')

    const payload = {
      empresa_id:       empresaId,
      nome:             form.nome.trim(),
      cnpj:             form.cnpj.trim()     || null,
      telefone:         form.telefone.trim() || null,
      email:            form.email.trim()    || null,
      endereco:         form.endereco.trim() || null,
      prazo_medio_dias: parseInt(form.prazo_medio_dias) || 7,
      observacoes:      form.observacoes.trim() || null,
    }

    if (lab) {
      const { error: err } = await supabase.from('labs')
        .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', lab.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('labs').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    onSaved(); onClose()
  }

  return (
    <Modal title={lab ? 'Editar Laboratório' : 'Novo Laboratório'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGrid2}>
          <div className={styles.formField}>
            <label className={styles.label}>Nome *</label>
            <input className={styles.input} value={form.nome} onChange={set('nome')} placeholder="Nome do laboratório" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>CNPJ</label>
            <input className={styles.input} value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Telefone</label>
            <input className={styles.input} value={form.telefone} onChange={set('telefone')} placeholder="(00) 00000-0000" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>E-mail</label>
            <input className={styles.input} type="email" value={form.email} onChange={set('email')} placeholder="contato@lab.com" />
          </div>
          <div className={`${styles.formField} ${styles.colSpan2}`}>
            <label className={styles.label}>Endereço</label>
            <input className={styles.input} value={form.endereco} onChange={set('endereco')} placeholder="Rua, número, cidade..." />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>Prazo médio (dias)</label>
            <input className={styles.input} type="number" min="1" value={form.prazo_medio_dias} onChange={set('prazo_medio_dias')} />
          </div>
          <div className={`${styles.formField} ${styles.colSpan2}`}>
            <label className={styles.label}>Observações</label>
            <textarea className={styles.textarea} value={form.observacoes} onChange={set('observacoes')} rows={3} placeholder="Informações adicionais..." />
          </div>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── PrecosModal (Lista de preços + import xlsx — Admin) ───────────────────

function PrecosModal({ lab, onClose, onSaved }: {
  lab: Lab; onClose: () => void; onSaved: () => void
}) {
  const [precos,     setPrecos]     = useState<LabPreco[]>([])
  const [loading,    setLoading]    = useState(true)
  const [novoNome,   setNovoNome]   = useState('')
  const [novoPreco,  setNovoPreco]  = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchPrecos = useCallback(async () => {
    const { data } = await supabase
      .from('lab_precos').select('*')
      .eq('lab_id', lab.id).eq('ativo', true).order('nome_servico')
    if (data) setPrecos(data)
    setLoading(false)
  }, [lab.id])

  useEffect(() => { fetchPrecos() }, [fetchPrecos])

  const addPreco = async () => {
    if (!novoNome.trim()) return
    setSaving(true); setError('')
    const preco = parseFloat(novoPreco.replace(',', '.')) || 0
    const { error: err } = await supabase.from('lab_precos').insert({
      lab_id: lab.id, nome_servico: novoNome.trim(), preco,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setNovoNome(''); setNovoPreco('')
    await fetchPrecos()
    setSaving(false)
    onSaved()
  }

  const removePreco = async (id: string) => {
    await supabase.from('lab_precos').update({ ativo: false }).eq('id', id)
    await fetchPrecos()
    onSaved()
  }

  const handleXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSaving(true); setError('')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
      const inserts = rows
        .map(r => ({
          lab_id:       lab.id,
          nome_servico: String(r['Serviço'] ?? r['Servico'] ?? r['nome_servico'] ?? r['Nome'] ?? r['SERVIÇO'] ?? '').trim(),
          preco:        parseFloat(String(r['Preço'] ?? r['Preco'] ?? r['preco'] ?? r['Valor'] ?? r['PREÇO'] ?? '0').replace(',', '.')) || 0,
        }))
        .filter(p => p.nome_servico)
      if (inserts.length > 0) {
        const { error: err } = await supabase.from('lab_precos').insert(inserts)
        if (err) throw err
        await fetchPrecos()
        onSaved()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao importar planilha.')
    }
    setSaving(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Modal title={`Lista de Preços — ${lab.nome}`} onClose={onClose} wide>
      <div className={styles.precosWrap}>
        <div className={styles.precosAddRow}>
          <input
            className={styles.input}
            placeholder="Nome do serviço"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPreco()}
          />
          <input
            className={`${styles.input} ${styles.inputSmall}`}
            placeholder="Preço (R$)"
            value={novoPreco}
            onChange={e => setNovoPreco(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPreco()}
          />
          <button type="button" className={styles.btnPrimary} onClick={addPreco} disabled={saving}>
            <IconPlus /> Adicionar
          </button>
          <label className={`${styles.btnSecondary} ${styles.labelBtn}`}>
            <IconUpload /> Importar XLSX
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleXlsx} />
          </label>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <p className={styles.xlsxHint}>
          Para importar via planilha, use colunas: <strong>Serviço</strong> e <strong>Preço</strong>
        </p>
        {loading ? <Spinner /> : (
          <div className={styles.precosList}>
            {precos.length === 0 && <p className={styles.emptyMsg}>Nenhum serviço cadastrado.</p>}
            {precos.map(p => (
              <div key={p.id} className={styles.precosRow}>
                <span className={styles.precosNome}>{p.nome_servico}</span>
                <span className={styles.precosValor}>
                  {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <button type="button" className={styles.btnIcon} onClick={() => removePreco(p.id)} title="Remover">
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ── KanbanConfigModal (Admin) ─────────────────────────────────────────────

function KanbanConfigModal({ empresaId, colunas, onClose, onSaved }: {
  empresaId: string; colunas: LabKanbanColuna[]
  onClose: () => void; onSaved: () => void
}) {
  const [cols,     setCols]     = useState<LabKanbanColuna[]>([...colunas].sort((a, b) => a.ordem - b.ordem))
  const [novoNome, setNovoNome] = useState('')
  const [novaCor,  setNovaCor]  = useState('#6366f1')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  const addColuna = async () => {
    if (!novoNome.trim()) return
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('lab_kanban_colunas').insert({
      empresa_id: empresaId, nome: novoNome.trim(), ordem: cols.length, cor: novaCor,
    }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data) setCols(p => [...p, data as LabKanbanColuna])
    setNovoNome(''); setNovaCor('#6366f1')
    setSaving(false); onSaved()
  }

  const removeColuna = async (id: string) => {
    const { error: err } = await supabase.from('lab_kanban_colunas').delete().eq('id', id)
    if (err) { setError(err.message); return }
    const updated = cols.filter(c => c.id !== id).map((c, i) => ({ ...c, ordem: i }))
    for (const c of updated) {
      await supabase.from('lab_kanban_colunas').update({ ordem: c.ordem }).eq('id', c.id)
    }
    setCols(updated); onSaved()
  }

  const moveCol = async (id: string, dir: -1 | 1) => {
    const idx = cols.findIndex(c => c.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= cols.length) return
    const next = [...cols];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    const withOrdem = next.map((c, i) => ({ ...c, ordem: i }))
    setCols(withOrdem)
    for (const c of withOrdem) {
      await supabase.from('lab_kanban_colunas').update({ ordem: c.ordem }).eq('id', c.id)
    }
    onSaved()
  }

  return (
    <Modal title="Configurar Colunas do Kanban" onClose={onClose}>
      <div className={styles.kanbanConfigWrap}>
        <div className={styles.kanbanColList}>
          {cols.map((c, i) => (
            <div key={c.id} className={styles.kanbanColRow}>
              <span className={styles.kanbanColDot} style={{ background: c.cor }} />
              <span className={styles.kanbanColNome}>{c.nome}</span>
              <div className={styles.kanbanColActions}>
                <button type="button" className={styles.btnIcon} disabled={i === 0} onClick={() => moveCol(c.id, -1)}>↑</button>
                <button type="button" className={styles.btnIcon} disabled={i === cols.length - 1} onClick={() => moveCol(c.id, 1)}>↓</button>
                <button type="button" className={styles.btnIcon} onClick={() => removeColuna(c.id)} title="Remover"><IconTrash /></button>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.kanbanAddRow}>
          <input className={styles.input} placeholder="Nome da coluna" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
          <input type="color" className={styles.colorInput} value={novaCor} onChange={e => setNovaCor(e.target.value)} />
          <button type="button" className={styles.btnPrimary} onClick={addColuna} disabled={saving}>
            <IconPlus /> Adicionar
          </button>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ── EnvioSteps — wizard de 4 etapas ──────────────────────────────────────

interface EnvioFormState {
  tipo_trabalho: string; preco_servico: string
  paciente_nome: string; dentes: string; cor: string; observacoes: string
  data_envio: string; data_entrega_prometida: string
}

function EnvioSteps({ lab, precos, empresaId, userId, envio, colunas, onClose, onSaved }: {
  lab: Lab; precos: LabPreco[]; empresaId: string; userId: string
  envio: LabEnvio | null; colunas: LabKanbanColuna[]
  onClose: () => void; onSaved: () => void
}) {
  const [step,   setStep]   = useState(1)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [form,   setForm]   = useState<EnvioFormState>({
    tipo_trabalho:          envio?.tipo_trabalho ?? '',
    preco_servico:          envio?.preco_servico != null ? String(envio.preco_servico) : '',
    paciente_nome:          envio?.paciente_nome ?? '',
    dentes:                 envio?.dentes ?? '',
    cor:                    envio?.cor ?? '',
    observacoes:            envio?.observacoes ?? '',
    data_envio:             envio?.data_envio ?? today(),
    data_entrega_prometida: envio?.data_entrega_prometida ?? '',
  })

  const set = (f: keyof EnvioFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  const selectPreco = (p: LabPreco | null) => {
    if (!p) {
      setForm(prev => ({ ...prev, tipo_trabalho: '__custom__', preco_servico: '' }))
    } else {
      setForm(prev => ({ ...prev, tipo_trabalho: p.nome_servico, preco_servico: String(p.preco) }))
    }
  }

  const nextStep = () => {
    if (step === 1) {
      const trabalho = form.tipo_trabalho === '__custom__' ? '' : form.tipo_trabalho
      if (!trabalho.trim() && form.tipo_trabalho !== '__custom__') {
        setError('Selecione ou informe o tipo de trabalho.'); return
      }
    }
    if (step === 2 && !form.paciente_nome.trim()) {
      setError('Informe o nome do paciente.'); return
    }
    setError(''); setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    const trabalho = form.tipo_trabalho === '__custom__'
      ? (document.getElementById('customService') as HTMLInputElement)?.value ?? ''
      : form.tipo_trabalho

    if (!trabalho.trim()) { setError('Informe o tipo de trabalho.'); return }

    setSaving(true); setError('')
    const payload = {
      lab_id:                 lab.id,
      empresa_id:             empresaId,
      user_id:                userId,
      tipo_trabalho:          trabalho.trim(),
      preco_servico:          parseFloat(form.preco_servico.replace(',', '.')) || null,
      paciente_nome:          form.paciente_nome.trim(),
      dentes:                 form.dentes.trim() || null,
      cor:                    form.cor || null,
      observacoes:            form.observacoes.trim() || null,
      status:                 envio?.status ?? colunas[0]?.nome ?? 'Enviado',
      data_envio:             form.data_envio || today(),
      data_entrega_prometida: form.data_entrega_prometida || null,
    }

    if (envio) {
      const { error: err } = await supabase.from('lab_envios')
        .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', envio.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('lab_envios').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    onSaved(); onClose()
  }

  const stepTitles = ['Tipo de Trabalho', 'Dados do Caso', 'Datas', 'Revisão']
  const displayTrabalho = form.tipo_trabalho === '__custom__'
    ? (document.getElementById('customService') as HTMLInputElement)?.value ?? ''
    : form.tipo_trabalho

  return (
    <Modal title={envio ? 'Editar Envio' : `Novo Envio — ${lab.nome}`} onClose={onClose} wide>
      {/* Step indicator */}
      <div className={styles.stepIndicator}>
        {stepTitles.map((t, i) => (
          <div key={t} className={`${styles.stepItem} ${i + 1 === step ? styles.stepActive : ''} ${i + 1 < step ? styles.stepDone : ''}`}>
            <div className={styles.stepDot}>{i + 1 < step ? '✓' : i + 1}</div>
            <span className={styles.stepLabel}>{t}</span>
          </div>
        ))}
      </div>

      {/* ── Step 1: Tipo de trabalho ── */}
      {step === 1 && (
        <div className={styles.stepContent}>
          <p className={styles.stepHint}>Selecione um serviço da lista de preços ou escolha "Outro" para inserir manualmente.</p>
          <div className={styles.precosGrid}>
            {precos.map(p => (
              <button
                key={p.id}
                type="button"
                className={`${styles.precoOption} ${form.tipo_trabalho === p.nome_servico ? styles.precoOptionActive : ''}`}
                onClick={() => selectPreco(p)}
              >
                <span className={styles.precoOptionNome}>{p.nome_servico}</span>
                <span className={styles.precoOptionValor}>
                  {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </button>
            ))}
            <button
              type="button"
              className={`${styles.precoOption} ${form.tipo_trabalho === '__custom__' ? styles.precoOptionActive : ''}`}
              onClick={() => selectPreco(null)}
            >
              <span className={styles.precoOptionNome}>Outro</span>
              <span className={styles.precoOptionValor}>Personalizado</span>
            </button>
          </div>
          {form.tipo_trabalho === '__custom__' && (
            <div className={styles.formGrid2} style={{ marginTop: 16 }}>
              <div className={styles.formField}>
                <label className={styles.label}>Descrição do serviço *</label>
                <input id="customService" className={styles.input} placeholder="Ex: Coroa de zircônia" />
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Valor (R$)</label>
                <input className={styles.input} value={form.preco_servico} onChange={set('preco_servico')} placeholder="0,00" />
              </div>
            </div>
          )}
          {precos.length === 0 && (
            <p className={styles.stepHint} style={{ marginTop: 12 }}>
              Nenhum serviço na lista de preços. Use "Outro" ou peça ao administrador para cadastrar os serviços.
            </p>
          )}
        </div>
      )}

      {/* ── Step 2: Dados do caso ── */}
      {step === 2 && (
        <div className={styles.stepContent}>
          <div className={styles.formGrid2}>
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>Nome do paciente *</label>
              <input className={styles.input} value={form.paciente_nome} onChange={set('paciente_nome')} placeholder="Nome completo" />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Dentes</label>
              <input className={styles.input} value={form.dentes} onChange={set('dentes')} placeholder="Ex: 11, 12, 21" />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Cor / Shade</label>
              <select className={styles.select} value={form.cor} onChange={set('cor')}>
                <option value="">Não especificado</option>
                {SHADE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>Observações</label>
              <textarea className={styles.textarea} value={form.observacoes} onChange={set('observacoes')} rows={3} placeholder="Instruções especiais, referências de cor..." />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Datas ── */}
      {step === 3 && (
        <div className={styles.stepContent}>
          <div className={styles.formGrid2}>
            <div className={styles.formField}>
              <label className={styles.label}>Data de envio</label>
              <input className={styles.input} type="date" value={form.data_envio} onChange={set('data_envio')} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Prazo de entrega prometido</label>
              <input className={styles.input} type="date" value={form.data_entrega_prometida} onChange={set('data_entrega_prometida')} />
            </div>
          </div>
          {lab.prazo_medio_dias > 0 && (
            <p className={styles.stepHint} style={{ marginTop: 12 }}>
              Prazo médio deste laboratório: <strong>{lab.prazo_medio_dias} dias</strong>
            </p>
          )}
        </div>
      )}

      {/* ── Step 4: Revisão ── */}
      {step === 4 && (
        <div className={styles.stepContent}>
          <div className={styles.reviewGrid}>
            <ReviewRow label="Laboratório"    value={lab.nome} />
            <ReviewRow label="Tipo de trabalho" value={displayTrabalho || form.tipo_trabalho} />
            {form.preco_servico && (
              <ReviewRow label="Valor" value={parseFloat(form.preco_servico.replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            )}
            <ReviewRow label="Paciente"    value={form.paciente_nome} />
            {form.dentes    && <ReviewRow label="Dentes"  value={form.dentes} />}
            {form.cor       && <ReviewRow label="Cor"     value={form.cor} />}
            {form.observacoes && <ReviewRow label="Observações" value={form.observacoes} />}
            <ReviewRow label="Data de envio"  value={formatDate(form.data_envio)} />
            <ReviewRow label="Prazo prometido" value={formatDate(form.data_entrega_prometida || null)} />
          </div>
        </div>
      )}

      {error && <p className={styles.errorMsg}>{error}</p>}

      <div className={styles.formActions}>
        {step > 1 && (
          <button type="button" className={styles.btnSecondary} onClick={() => { setError(''); setStep(s => s - 1) }}>Voltar</button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
        {step < 4 ? (
          <button type="button" className={styles.btnPrimary} onClick={nextStep}>Próximo</button>
        ) : (
          <button type="button" className={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : envio ? 'Salvar alterações' : 'Confirmar envio'}
          </button>
        )}
      </div>
    </Modal>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  )
}

// ── Kanban Card ───────────────────────────────────────────────────────────

function KanbanCard({ envio, dragging, isAdmin, onDragStart, onEdit, onDelete }: {
  envio: LabEnvio; dragging: boolean; isAdmin: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onEdit: () => void; onDelete: () => void
}) {
  const overdue = isOverdue(envio)
  return (
    <div
      className={`${styles.kanbanCard} ${dragging ? styles.kanbanCardDragging : ''} ${overdue ? styles.kanbanCardOverdue : ''}`}
      draggable
      onDragStart={e => onDragStart(e, envio.id)}
    >
      {overdue && (
        <div className={styles.kanbanCardAlert}>
          <IconAlert /> Prazo vencido
        </div>
      )}
      <div className={styles.kanbanCardPatient}>{envio.paciente_nome}</div>
      <div className={styles.kanbanCardService}>{envio.tipo_trabalho}</div>
      {(envio.dentes || envio.cor) && (
        <div className={styles.kanbanCardDetails}>
          {envio.dentes && <span>Dentes: {envio.dentes}</span>}
          {envio.cor    && <span>Cor: {envio.cor}</span>}
        </div>
      )}
      {envio.data_entrega_prometida && (
        <div className={`${styles.kanbanCardDate} ${overdue ? styles.kanbanCardDateOverdue : ''}`}>
          <IconClock /> {formatDate(envio.data_entrega_prometida)}
        </div>
      )}
      {envio.preco_servico != null && (
        <div className={styles.kanbanCardPrice}>
          {envio.preco_servico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>
      )}
      <div className={styles.kanbanCardActions}>
        <button type="button" className={styles.btnIcon} onClick={onEdit} title="Editar"><IconEdit /></button>
        {isAdmin && (
          <button type="button" className={`${styles.btnIcon} ${styles.btnIconDanger}`} onClick={onDelete} title="Excluir"><IconTrash /></button>
        )}
      </div>
    </div>
  )
}

// ── Kanban Board ──────────────────────────────────────────────────────────

function KanbanBoard({ envios, colunas, isAdmin, onMoveEnvio, onEditEnvio, onDeleteEnvio }: {
  envios: LabEnvio[]; colunas: LabKanbanColuna[]; isAdmin: boolean
  onMoveEnvio: (id: string, status: string) => void
  onEditEnvio: (envio: LabEnvio) => void
  onDeleteEnvio: (id: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const sorted = [...colunas].sort((a, b) => a.ordem - b.ordem)

  const handleDrop = (e: React.DragEvent, colNome: string) => {
    e.preventDefault()
    if (draggingId) onMoveEnvio(draggingId, colNome)
    setDraggingId(null); setDragOverCol(null)
  }

  return (
    <div className={styles.kanban}>
      {sorted.map(col => {
        const colEnvios = envios.filter(e => e.status === col.nome)
        return (
          <div
            key={col.id}
            className={`${styles.kanbanCol} ${dragOverCol === col.nome ? styles.kanbanColDragOver : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.nome) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
            onDrop={e => handleDrop(e, col.nome)}
          >
            <div className={styles.kanbanColHeader}>
              <span className={styles.kanbanColIndicator} style={{ background: col.cor }} />
              <span className={styles.kanbanColName}>{col.nome}</span>
              <span className={styles.kanbanColCount}>{colEnvios.length}</span>
            </div>
            <div className={styles.kanbanCards}>
              {colEnvios.map(envio => (
                <KanbanCard
                  key={envio.id}
                  envio={envio}
                  dragging={draggingId === envio.id}
                  isAdmin={isAdmin}
                  onDragStart={(e, id) => { setDraggingId(id); e.dataTransfer.effectAllowed = 'move' }}
                  onEdit={() => onEditEnvio(envio)}
                  onDelete={() => onDeleteEnvio(envio.id)}
                />
              ))}
              {colEnvios.length === 0 && (
                <div className={styles.kanbanEmpty}>Sem trabalhos</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Lab Detail View ───────────────────────────────────────────────────────

function LabDetailView({ lab, empresaId, userId, isAdmin, colunas, onBack, onLabUpdated, onColunasUpdated }: {
  lab: Lab; empresaId: string; userId: string; isAdmin: boolean
  colunas: LabKanbanColuna[]
  onBack: () => void; onLabUpdated: () => void; onColunasUpdated: () => void
}) {
  const [envios,          setEnvios]          = useState<LabEnvio[]>([])
  const [precos,          setPrecos]          = useState<LabPreco[]>([])
  const [loading,         setLoading]         = useState(true)
  const [activeTab,       setActiveTab]       = useState<'kanban' | 'info'>('kanban')
  const [showEnvioSteps,  setShowEnvioSteps]  = useState(false)
  const [editingEnvio,    setEditingEnvio]    = useState<LabEnvio | null>(null)
  const [showEditLab,     setShowEditLab]     = useState(false)
  const [showPrecos,      setShowPrecos]      = useState(false)
  const [showKanbanCfg,   setShowKanbanCfg]   = useState(false)

  const fetchEnvios = useCallback(async () => {
    const { data } = await supabase
      .from('lab_envios').select('*')
      .eq('lab_id', lab.id).order('created_at', { ascending: false })
    if (data) setEnvios(data)
    setLoading(false)
  }, [lab.id])

  const fetchPrecos = useCallback(async () => {
    const { data } = await supabase
      .from('lab_precos').select('*')
      .eq('lab_id', lab.id).eq('ativo', true).order('nome_servico')
    if (data) setPrecos(data)
  }, [lab.id])

  useEffect(() => { fetchEnvios(); fetchPrecos() }, [fetchEnvios, fetchPrecos])

  const moveEnvio = async (envioId: string, status: string) => {
    await supabase.from('lab_envios').update({ status, updated_at: new Date().toISOString() }).eq('id', envioId)
    setEnvios(prev => prev.map(e => e.id === envioId ? { ...e, status } : e))
  }

  const deleteEnvio = async (envioId: string) => {
    if (!confirm('Excluir este envio?')) return
    await supabase.from('lab_envios').delete().eq('id', envioId)
    setEnvios(prev => prev.filter(e => e.id !== envioId))
  }

  const overdueCount = envios.filter(isOverdue).length

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <IconBack /> Voltar
        </button>
        <div className={styles.labDetailTitle}>
          <h1 className={styles.pageTitle}>{lab.nome}</h1>
          {overdueCount > 0 && (
            <span className={styles.overdueBadge}>
              <IconAlert /> {overdueCount} atrasado{overdueCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          {isAdmin && (
            <>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowEditLab(true)}>
                <IconEdit /> Editar lab
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowPrecos(true)}>
                Lista de preços
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowKanbanCfg(true)}>
                <IconSettings2 /> Kanban
              </button>
            </>
          )}
          <button type="button" className={styles.btnPrimary} onClick={() => { setEditingEnvio(null); setShowEnvioSteps(true) }}>
            <IconPlus /> Novo envio
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'kanban' ? styles.tabActive : ''}`} onClick={() => setActiveTab('kanban')}>
          Kanban ({envios.length})
        </button>
        <button className={`${styles.tab} ${activeTab === 'info' ? styles.tabActive : ''}`} onClick={() => setActiveTab('info')}>
          Informações
        </button>
      </div>

      {/* Kanban tab */}
      {activeTab === 'kanban' && (
        loading ? <Spinner /> : (
          <KanbanBoard
            envios={envios}
            colunas={colunas}
            isAdmin={isAdmin}
            onMoveEnvio={moveEnvio}
            onEditEnvio={e => { setEditingEnvio(e); setShowEnvioSteps(true) }}
            onDeleteEnvio={deleteEnvio}
          />
        )
      )}

      {/* Info tab */}
      {activeTab === 'info' && (
        <div className={styles.labInfoGrid}>
          <div className={styles.labInfoCard}>
            <h3 className={styles.infoSectionTitle}>Dados do laboratório</h3>
            {lab.cnpj     && <InfoRow label="CNPJ"      value={lab.cnpj} />}
            {lab.telefone && <InfoRow label="Telefone"   icon={<IconPhone />} value={lab.telefone} />}
            {lab.email    && <InfoRow label="E-mail"     icon={<IconMail />}  value={lab.email} />}
            {lab.endereco && <InfoRow label="Endereço"   value={lab.endereco} />}
            <InfoRow label="Prazo médio" icon={<IconClock />} value={`${lab.prazo_medio_dias} dias`} />
            {lab.observacoes && <InfoRow label="Observações" value={lab.observacoes} />}
          </div>
          <div className={styles.labInfoCard}>
            <div className={styles.labInfoCardHeader}>
              <h3 className={styles.infoSectionTitle}>Lista de preços</h3>
              {isAdmin && (
                <button type="button" className={styles.btnSecondary} onClick={() => setShowPrecos(true)}>
                  Gerenciar
                </button>
              )}
            </div>
            {precos.length === 0 ? (
              <p className={styles.emptyMsg}>
                Nenhum serviço cadastrado.
                {isAdmin && ' Clique em "Gerenciar" para adicionar.'}
              </p>
            ) : (
              <div className={styles.precosList}>
                {precos.map(p => (
                  <div key={p.id} className={styles.precosRow}>
                    <span className={styles.precosNome}>{p.nome_servico}</span>
                    <span className={styles.precosValor}>
                      {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showEnvioSteps && (
        <EnvioSteps
          lab={lab} precos={precos} empresaId={empresaId} userId={userId}
          envio={editingEnvio} colunas={colunas}
          onClose={() => setShowEnvioSteps(false)} onSaved={fetchEnvios}
        />
      )}
      {showEditLab && (
        <LabModal lab={lab} empresaId={empresaId}
          onClose={() => setShowEditLab(false)} onSaved={onLabUpdated} />
      )}
      {showPrecos && (
        <PrecosModal lab={lab}
          onClose={() => setShowPrecos(false)} onSaved={fetchPrecos} />
      )}
      {showKanbanCfg && (
        <KanbanConfigModal empresaId={empresaId} colunas={colunas}
          onClose={() => setShowKanbanCfg(false)} onSaved={onColunasUpdated} />
      )}
    </div>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>
        {icon && <span className={styles.infoIcon}>{icon}</span>}
        {value}
      </span>
    </div>
  )
}

// ── Lab Card (lista principal) ─────────────────────────────────────────────

function LabCard({ lab, envios, isAdmin, colunas, onClick, onEdit }: {
  lab: Lab; envios: LabEnvio[]; isAdmin: boolean; colunas: LabKanbanColuna[]
  onClick: () => void; onEdit: (e: React.MouseEvent) => void
}) {
  const overdue = envios.filter(isOverdue).length
  const active  = envios.filter(e => !['Concluído', 'Entregue'].includes(e.status)).length
  const recent  = [...envios].slice(0, 5)

  return (
    <div className={styles.labCard} onClick={onClick}>
      <div className={styles.labCardHeader}>
        <div className={styles.labCardName}>{lab.nome}</div>
        {isAdmin && (
          <button type="button" className={styles.btnIcon} onClick={onEdit} title="Editar laboratório">
            <IconEdit />
          </button>
        )}
      </div>

      <div className={styles.labCardContact}>
        {lab.telefone && <span className={styles.labCardContactItem}><IconPhone /> {lab.telefone}</span>}
        {lab.email    && <span className={styles.labCardContactItem}><IconMail /> {lab.email}</span>}
        {lab.prazo_medio_dias > 0 && (
          <span className={styles.labCardContactItem}><IconClock /> {lab.prazo_medio_dias}d prazo médio</span>
        )}
      </div>

      <div className={styles.labCardStats}>
        <div className={styles.labCardStat}>
          <span className={styles.labCardStatNum}>{envios.length}</span>
          <span className={styles.labCardStatLabel}>total</span>
        </div>
        <div className={styles.labCardStat}>
          <span className={styles.labCardStatNum}>{active}</span>
          <span className={styles.labCardStatLabel}>em andamento</span>
        </div>
        {overdue > 0 && (
          <div className={`${styles.labCardStat} ${styles.labCardStatOverdue}`}>
            <span className={styles.labCardStatNum}>{overdue}</span>
            <span className={styles.labCardStatLabel}>atrasados</span>
          </div>
        )}
      </div>

      {/* Mini kanban status bars */}
      {envios.length > 0 && (
        <div className={styles.labCardStatusBar}>
          {colunas.sort((a, b) => a.ordem - b.ordem).map(col => {
            const count = envios.filter(e => e.status === col.nome).length
            if (count === 0) return null
            return (
              <div
                key={col.id}
                className={styles.labCardStatusSegment}
                style={{ background: col.cor, flex: count }}
                title={`${col.nome}: ${count}`}
              />
            )
          })}
        </div>
      )}

      {/* Recent envios list */}
      {recent.length > 0 && (
        <div className={styles.labCardEnvios}>
          {recent.map(e => (
            <div key={e.id} className={`${styles.labCardEnvioItem} ${isOverdue(e) ? styles.labCardEnvioOverdue : ''}`}>
              <span className={styles.labCardEnvioPatient}>{e.paciente_nome}</span>
              <span className={styles.labCardEnvioType}>{e.tipo_trabalho}</span>
              {e.data_entrega_prometida && (
                <span className={styles.labCardEnvioDate}>{formatDate(e.data_entrega_prometida)}</span>
              )}
            </div>
          ))}
          {envios.length > 5 && (
            <div className={styles.labCardMore}>+{envios.length - 5} trabalhos</div>
          )}
        </div>
      )}

      {envios.length === 0 && (
        <div className={styles.labCardEmpty}>Nenhum envio ainda. Clique para abrir.</div>
      )}
    </div>
  )
}

// ── Main: LabControlPage ──────────────────────────────────────────────────

export default function LabControlPage({ userId, empresa, onTrocarEmpresa, onVoltar }: {
  userId: string; empresa: Empresa; onTrocarEmpresa: () => void; onVoltar: () => void
}) {
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [labs,         setLabs]         = useState<Lab[]>([])
  const [enviosMap,    setEnviosMap]    = useState<Record<string, LabEnvio[]>>({})
  const [colunas,      setColunas]      = useState<LabKanbanColuna[]>([])
  const [selectedLab,  setSelectedLab]  = useState<Lab | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [showLabModal, setShowLabModal] = useState(false)
  const [editingLab,   setEditingLab]   = useState<Lab | null>(null)

  useEffect(() => {
    const validarAcesso = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      const adminSistema = profile?.role === 'admin'

      if (!adminSistema) {
        const { data: membro } = await supabase
          .from('empresa_membros')
          .select('role')
          .eq('empresa_id', empresa.id)
          .eq('user_id', userId)
          .maybeSingle()

        if (!membro) {
          onTrocarEmpresa()
          return
        }

        setIsAdmin(membro.role === 'admin')
        return
      }

      setIsAdmin(true)
    }

    void validarAcesso()
  }, [empresa.id, onTrocarEmpresa, userId])

  const fetchLabs = useCallback(async () => {
    const { data } = await supabase
      .from('labs').select('*')
      .eq('empresa_id', empresa.id).eq('ativo', true).order('nome')
    if (data) setLabs(data)
  }, [empresa.id])

  const fetchEnvios = useCallback(async () => {
    const { data } = await supabase
      .from('lab_envios').select('*')
      .eq('empresa_id', empresa.id).order('created_at', { ascending: false })
    if (data) {
      const map: Record<string, LabEnvio[]> = {}
      for (const e of data) {
        if (!map[e.lab_id]) map[e.lab_id] = []
        map[e.lab_id].push(e)
      }
      setEnviosMap(map)
    }
  }, [empresa.id])

  const fetchColunas = useCallback(async () => {
    const { data } = await supabase
      .from('lab_kanban_colunas').select('*')
      .eq('empresa_id', empresa.id).order('ordem')

    if (data && data.length > 0) {
      setColunas(data)
    } else {
      // Cria colunas padrão para a empresa
      const defaults = DEFAULT_COLUNAS.map(c => ({ ...c, empresa_id: empresa.id }))
      const { data: inserted } = await supabase.from('lab_kanban_colunas').insert(defaults).select()
      if (inserted) setColunas(inserted)
    }
  }, [empresa.id])

  useEffect(() => {
    setSelectedLab(null)
    setLabs([])
    setEnviosMap({})
    setColunas([])
    setLoading(true)
    Promise.all([fetchLabs(), fetchEnvios(), fetchColunas()]).then(() => setLoading(false))
  }, [fetchLabs, fetchEnvios, fetchColunas])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <button type="button" className={styles.backBtn} onClick={onVoltar}><IconBack /> Voltar</button>
          <h1 className={styles.pageTitle}>Controle de Laboratórios</h1>
        </div>
        <Spinner />
      </div>
    )
  }

  // Detalhe do lab selecionado
  if (selectedLab) {
    return (
      <LabDetailView
        lab={selectedLab}
        empresaId={empresa.id}
        userId={userId}
        isAdmin={isAdmin}
        colunas={colunas}
        onBack={() => { setSelectedLab(null); fetchEnvios() }}
        onLabUpdated={() => { fetchLabs() }}
        onColunasUpdated={fetchColunas}
      />
    )
  }

  // Lista de labs
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onVoltar}>
          <IconBack /> Voltar
        </button>
        <h1 className={styles.pageTitle}>Controle de Laboratórios</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Empresa: <strong style={{ color: 'var(--text)' }}>{empresa.nome}</strong>
        </span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={onTrocarEmpresa}>
            Trocar empresa
          </button>
          {isAdmin && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => { setEditingLab(null); setShowLabModal(true) }}
            >
              <IconPlus /> Novo laboratório
            </button>
          )}
        </div>
      </div>

      {labs.length === 0 ? (
        <div className={styles.emptyState}>
          <IconFlask />
          <p>Nenhum laboratório cadastrado.</p>
          {isAdmin && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => { setEditingLab(null); setShowLabModal(true) }}
            >
              <IconPlus /> Cadastrar primeiro laboratório
            </button>
          )}
        </div>
      ) : (
        <div className={styles.labsGrid}>
          {labs.map(lab => (
            <LabCard
              key={lab.id}
              lab={lab}
              envios={enviosMap[lab.id] ?? []}
              isAdmin={isAdmin}
              colunas={colunas}
              onClick={() => setSelectedLab(lab)}
              onEdit={e => { e.stopPropagation(); setEditingLab(lab); setShowLabModal(true) }}
            />
          ))}
        </div>
      )}

      {showLabModal && (
        <LabModal
          lab={editingLab}
          empresaId={empresa.id}
          onClose={() => setShowLabModal(false)}
          onSaved={fetchLabs}
        />
      )}
    </div>
  )
}
