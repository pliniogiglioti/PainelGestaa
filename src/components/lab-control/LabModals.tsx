import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import type { Lab, LabDentista, LabEnvio, LabFormaEnvio, LabKanbanColuna, LabPreco } from '../../lib/types'
import styles from '../../pages/LabControlPage.module.css'
import { FORMA_ENVIO_OPTIONS } from './constants'
import { IconEdit, IconPlus, IconTrash, IconUpload } from './icons'
import { Modal, Spinner } from './shared'
import { formatCurrencyMask, formatDate, formatWhatsAppInput, normalizeWhatsAppNumber, parseMaskedCurrency, registrarHistorico } from './utils'

interface LabFormState {
  nome: string; cnpj: string; telefone: string; email: string
  endereco: string; prazo_medio_dias: string; dia_fechamento: string; observacoes: string
}

export function LabModal({ lab, empresaId, onClose, onSaved }: {
  lab: Lab | null; empresaId: string; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<LabFormState>({
    nome:             lab?.nome ?? '',
    cnpj:             lab?.cnpj ?? '',
    telefone:         formatWhatsAppInput(lab?.telefone ?? ''),
    email:            lab?.email ?? '',
    endereco:         lab?.endereco ?? '',
    prazo_medio_dias: String(lab?.prazo_medio_dias ?? 7),
    dia_fechamento:   lab?.dia_fechamento != null ? String(lab.dia_fechamento) : '',
    observacoes:      lab?.observacoes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (f: keyof LabFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, telefone: formatWhatsAppInput(e.target.value) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    const telefoneNormalizado = form.telefone.trim() ? normalizeWhatsAppNumber(form.telefone) : null
    if (form.telefone.trim() && !telefoneNormalizado) {
      setError('Informe um WhatsApp válido. Ex.: (18) 99751-1381'); return
    }
    setSaving(true); setError('')

    const payload = {
      empresa_id:       empresaId,
      nome:             form.nome.trim(),
      cnpj:             form.cnpj.trim()     || null,
      telefone:         telefoneNormalizado,
      email:            form.email.trim()    || null,
      endereco:         form.endereco.trim() || null,
      prazo_medio_dias: lab !== null ? (parseInt(form.prazo_medio_dias) || 7) : 0,
      dia_fechamento:   form.dia_fechamento.trim() ? Math.min(Math.max(parseInt(form.dia_fechamento) || 1, 1), 31) : null,
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
            <label className={styles.label}>WhatsApp</label>
            <input className={styles.input} value={form.telefone} onChange={handleTelefoneChange} placeholder="(18) 99751-1381" inputMode="tel" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>E-mail</label>
            <input className={styles.input} type="email" value={form.email} onChange={set('email')} placeholder="contato@lab.com" />
          </div>
          <div className={`${styles.formField} ${styles.colSpan2}`}>
            <label className={styles.label}>Endereço</label>
            <input className={styles.input} value={form.endereco} onChange={set('endereco')} placeholder="Rua, número, cidade..." />
          </div>
          {lab !== null && (
            <div className={styles.formField}>
              <label className={styles.label}>Prazo médio (dias)</label>
              <input className={styles.input} type="number" min="1" value={form.prazo_medio_dias} onChange={set('prazo_medio_dias')} />
            </div>
          )}
          <div className={styles.formField}>
            <label className={styles.label}>Dia do fechamento</label>
            <input className={styles.input} type="number" min="1" max="31" value={form.dia_fechamento} onChange={set('dia_fechamento')} placeholder="Ex: 25" />
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

export function PrecosModal({ lab, initialEditingId, onClose, onSaved }: {
  lab: Lab; initialEditingId?: string | null; onClose: () => void; onSaved: () => void
}) {
  const [precos,     setPrecos]     = useState<LabPreco[]>([])
  const [loading,    setLoading]    = useState(true)
  const [novoNome,   setNovoNome]   = useState('')
  const [novoPreco,  setNovoPreco]  = useState('')
  const [novoPrazo,  setNovoPrazo]  = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editNome,   setEditNome]   = useState('')
  const [editPreco,  setEditPreco]  = useState('')
  const [editPrazo,  setEditPrazo]  = useState('')
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
    const preco = parseMaskedCurrency(novoPreco)
    const { error: err } = await supabase.from('lab_precos').insert({
      lab_id: lab.id, nome_servico: novoNome.trim(), preco,
      prazo_producao_dias: novoPrazo ? parseInt(novoPrazo) : null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setNovoNome(''); setNovoPreco(''); setNovoPrazo('')
    await fetchPrecos()
    setSaving(false)
    onSaved()
  }

  const removePreco = async (id: string) => {
    await supabase.from('lab_precos').update({ ativo: false }).eq('id', id)
    await fetchPrecos()
    onSaved()
  }

  const startEditPreco = (preco: LabPreco) => {
    setEditingId(preco.id)
    setEditNome(preco.nome_servico)
    setEditPreco(formatCurrencyMask(String(Math.round(preco.preco * 100))))
    setEditPrazo(String(preco.prazo_producao_dias ?? ''))
    setError('')
  }

  useEffect(() => {
    if (!initialEditingId || editingId === initialEditingId) return
    const preco = precos.find(item => item.id === initialEditingId)
    if (preco) startEditPreco(preco)
  }, [editingId, initialEditingId, precos])

  const saveEditPreco = async () => {
    if (!editingId || !editNome.trim()) return
    setSaving(true); setError('')
    const preco = parseMaskedCurrency(editPreco)
    const { error: err } = await supabase
      .from('lab_precos')
      .update({ nome_servico: editNome.trim(), preco, prazo_producao_dias: editPrazo ? parseInt(editPrazo) : null })
      .eq('id', editingId)
    if (err) { setError(err.message); setSaving(false); return }
    setEditingId(null)
    setEditNome('')
    setEditPreco('')
    setEditPrazo('')
    await fetchPrecos()
    setSaving(false)
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
            type="number"
            min="1"
            placeholder="Prazo (dias)"
            value={novoPrazo}
            onChange={e => setNovoPrazo(e.target.value)}
          />
          <input
            className={`${styles.input} ${styles.inputSmall}`}
            placeholder="Preço (R$)"
            value={novoPreco}
            onChange={e => setNovoPreco(formatCurrencyMask(e.target.value))}
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
                {editingId === p.id ? (
                  <>
                    <input className={styles.input} value={editNome} onChange={e => setEditNome(e.target.value)} />
                    <input className={`${styles.input} ${styles.inputSmall}`} type="number" min="1" placeholder="Prazo (dias)" value={editPrazo} onChange={e => setEditPrazo(e.target.value)} />
                    <input className={`${styles.input} ${styles.inputSmall}`} placeholder="Preço (R$)" value={editPreco} onChange={e => setEditPreco(formatCurrencyMask(e.target.value))} />
                    <button type="button" className={styles.btnIcon} onClick={saveEditPreco} title="Salvar">
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      className={styles.btnIcon}
                      onClick={() => {
                        setEditingId(null)
                        setEditNome('')
                        setEditPreco('')
                        setEditPrazo('')
                      }}
                      title="Cancelar"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className={styles.precosNome}>{p.nome_servico}</span>
                    <span className={styles.precosValor}>
                      {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <button type="button" className={styles.btnIcon} onClick={() => startEditPreco(p)} title="Editar">
                      <IconEdit />
                    </button>
                  </>
                )}
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

export function KanbanConfigModal({ empresaId, colunas, onClose, onSaved }: {
  empresaId: string; colunas: LabKanbanColuna[]
  onClose: () => void; onSaved: () => void
}) {
  const [cols,     setCols]     = useState<LabKanbanColuna[]>([...colunas].sort((a, b) => a.ordem - b.ordem))
  const [novoNome, setNovoNome] = useState('')
  const [novaCor,  setNovaCor]  = useState('#6366f1')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [editingColNome, setEditingColNome] = useState('')

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

  const startEditColuna = (coluna: LabKanbanColuna) => {
    setEditingColId(coluna.id)
    setEditingColNome(coluna.nome)
    setError('')
  }

  const cancelEditColuna = () => {
    setEditingColId(null)
    setEditingColNome('')
  }

  const saveEditColuna = async (id: string) => {
    if (!editingColNome.trim()) {
      setError('Informe o nome da coluna.')
      return
    }

    setSaving(true)
    setError('')
    const nome = editingColNome.trim()
    const { error: err } = await supabase
      .from('lab_kanban_colunas')
      .update({ nome })
      .eq('id', id)

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setCols(prev => prev.map(col => col.id === id ? { ...col, nome } : col))
    setSaving(false)
    cancelEditColuna()
    onSaved()
  }

  return (
    <Modal title="Configurar Colunas do Kanban" onClose={onClose}>
      <div className={styles.kanbanConfigWrap}>
        <div className={styles.kanbanColList}>
          {cols.map((c, i) => (
            <div key={c.id} className={styles.kanbanColRow}>
              <span className={styles.kanbanColDot} style={{ background: c.cor }} />
              {editingColId === c.id ? (
                <input
                  className={`${styles.input} ${styles.kanbanColInput}`}
                  value={editingColNome}
                  onChange={e => setEditingColNome(e.target.value)}
                  autoFocus
                  disabled={saving}
                />
              ) : (
                <span className={styles.kanbanColNome}>{c.nome}</span>
              )}
              <div className={styles.kanbanColActions}>
                {editingColId === c.id ? (
                  <>
                    <button type="button" className={styles.btnIcon} onClick={() => void saveEditColuna(c.id)} disabled={saving} title="Salvar">
                      <IconEdit />
                    </button>
                    <button type="button" className={styles.btnIcon} onClick={cancelEditColuna} disabled={saving} title="Cancelar">
                      ✕
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.btnIcon} onClick={() => startEditColuna(c)} title="Editar nome">
                    <IconEdit />
                  </button>
                )}
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

// ── ArquivadosModal ───────────────────────────────────────────────────────

export function ArquivadosModal({ empresaId, userId, labId, onClose, onRestored }: {
  empresaId: string; userId: string; labId?: string; onClose: () => void; onRestored: () => void
}) {
  const [envios,   setEnvios]   = useState<LabEnvio[]>([])
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const fetch = useCallback(async () => {
    let q = supabase.from('lab_envios').select('*').eq('empresa_id', empresaId).not('arquivado_em', 'is', null).order('arquivado_em', { ascending: false })
    if (labId) q = q.eq('lab_id', labId)
    const { data } = await q
    if (data) setEnvios(data)
    setLoading(false)
  }, [empresaId, labId])

  useEffect(() => { void fetch() }, [fetch])

  const restaurar = async (envio: LabEnvio) => {
    await supabase.from('lab_envios').update({ arquivado_em: null, updated_at: new Date().toISOString() }).eq('id', envio.id)
    await registrarHistorico(envio.id, empresaId, userId, 'Restaurado')
    await fetch()
    onRestored()
  }

  const excluirPermanente = async (envio: LabEnvio) => {
    if (confirmText !== 'EXCLUIR') { return }
    setDeleting(envio.id)
    await registrarHistorico(envio.id, empresaId, userId, 'Excluído permanentemente')
    await supabase.from('lab_envio_etiquetas').delete().eq('envio_id', envio.id)
    await supabase.from('lab_historico').delete().eq('envio_id', envio.id)
    await supabase.from('lab_anexos').delete().eq('envio_id', envio.id)
    await supabase.from('lab_envios').delete().eq('id', envio.id)
    setDeleting(null)
    setConfirmDeleteId(null)
    setConfirmText('')
    await fetch()
    onRestored()
  }

  return (
    <Modal title="Envios Arquivados" onClose={onClose} wide>
      {loading ? <Spinner /> : (
        <div>
          {envios.length === 0 && <p className={styles.emptyMsg}>Nenhum envio arquivado.</p>}
          <div className={styles.financialList}>
            {envios.map(e => (
              <div key={e.id} className={styles.financialRow}>
                <div className={styles.financialMeta}>
                  <strong>{e.paciente_nome}</strong>
                  <span>{e.tipo_trabalho}</span>
                  <small>Arquivado em {formatDate(e.arquivado_em)}</small>
                  {confirmDeleteId === e.id && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                      <input
                        className={styles.input}
                        value={confirmText}
                        onChange={ev => setConfirmText(ev.target.value)}
                        placeholder='Digite EXCLUIR para confirmar'
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className={`${styles.btnIcon} ${styles.btnIconDanger}`}
                        disabled={confirmText !== 'EXCLUIR' || deleting === e.id}
                        onClick={() => void excluirPermanente(e)}
                      >
                        Excluir
                      </button>
                      <button type="button" className={styles.btnSecondary} onClick={() => { setConfirmDeleteId(null); setConfirmText('') }}>Cancelar</button>
                    </div>
                  )}
                </div>
                <div className={styles.financialActions}>
                  <button type="button" className={styles.btnSecondary} onClick={() => void restaurar(e)}>Restaurar</button>
                  {confirmDeleteId !== e.id && (
                    <button type="button" className={`${styles.btnIcon} ${styles.btnIconDanger}`} onClick={() => { setConfirmDeleteId(e.id); setConfirmText('') }} title="Excluir permanentemente">
                      <IconTrash />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={styles.formActions} style={{ marginTop: 12 }}>
        <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}

// ── DentistasModal ────────────────────────────────────────────────────────

export function DentistasModal({ empresaId, onClose }: { empresaId: string; onClose: () => void }) {
  const [dentistas, setDentistas] = useState<LabDentista[]>([])
  const [loading,   setLoading]   = useState(true)
  const [addNome,   setAddNome]   = useState('')
  const [addEsp,    setAddEsp]    = useState('')
  const [saving,    setSaving]    = useState(false)

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('lab_dentistas').select('*').eq('empresa_id', empresaId).order('nome')
    setDentistas(data ?? [])
    setLoading(false)
  }, [empresaId])

  useEffect(() => { void fetch() }, [fetch])

  const handleAdd = async () => {
    if (!addNome.trim()) return
    setSaving(true)
    await supabase.from('lab_dentistas').insert({ empresa_id: empresaId, nome: addNome.trim(), especialidade: addEsp.trim() || null })
    setAddNome('')
    setAddEsp('')
    setSaving(false)
    void fetch()
  }

  const handleToggle = async (d: LabDentista) => {
    await supabase.from('lab_dentistas').update({ ativo: !d.ativo }).eq('id', d.id)
    void fetch()
  }

  return (
    <Modal title="Dentistas" onClose={onClose}>
      <div className={styles.form}>
        {loading ? <Spinner /> : (
          <>
            {dentistas.length > 0 ? (
              <div className={styles.dentistaList}>
                {dentistas.map(d => (
                  <div key={d.id} className={`${styles.dentistaRow} ${!d.ativo ? styles.dentistaInativo : ''}`}>
                    <div className={styles.dentistaInfo}>
                      <strong>{d.nome}</strong>
                      {d.especialidade && <span className={styles.dentistaEsp}>{d.especialidade}</span>}
                      {!d.ativo && <span className={styles.dentistaInativoBadge}>Inativo</span>}
                    </div>
                    <button type="button" className={styles.btnSecondary} onClick={() => void handleToggle(d)}>
                      {d.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Nenhum dentista cadastrado ainda.</p>
            )}

            <div className={styles.formGrid2} style={{ marginTop: 16 }}>
              <div className={styles.formField}>
                <label className={styles.label}>Nome *</label>
                <input className={styles.input} value={addNome} onChange={e => setAddNome(e.target.value)} placeholder="Nome do dentista" />
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Especialidade</label>
                <input className={styles.input} value={addEsp} onChange={e => setAddEsp(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
              <button type="button" className={styles.btnPrimary} disabled={saving || !addNome.trim()} onClick={() => void handleAdd()}>
                {saving ? 'Salvando…' : 'Adicionar dentista'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── FormasEnvioModal ───────────────────────────────────────────────────────

export function FormasEnvioModal({ empresaId, onClose }: { empresaId: string; onClose: () => void }) {
  const [formas, setFormas] = useState<LabFormaEnvio[]>([])
  const [loading, setLoading] = useState(true)
  const [addNome, setAddNome] = useState('')
  const [saving, setSaving] = useState(false)
  const nomesPadrao = FORMA_ENVIO_OPTIONS.map(nome => nome.toLowerCase())

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('lab_formas_envio').select('*').eq('empresa_id', empresaId).order('nome')
    const existentes = data ?? []
    const missing = FORMA_ENVIO_OPTIONS.filter(
      nome => !existentes.some(forma => forma.nome.toLowerCase() === nome.toLowerCase()),
    )

    if (missing.length > 0) {
      await supabase.from('lab_formas_envio').insert(missing.map(nome => ({ empresa_id: empresaId, nome })))
      const { data: refreshed } = await supabase.from('lab_formas_envio').select('*').eq('empresa_id', empresaId).order('nome')
      setFormas(refreshed ?? [])
    } else {
      setFormas(existentes)
    }
    setLoading(false)
  }, [empresaId])

  useEffect(() => { void fetch() }, [fetch])

  const handleAdd = async () => {
    if (!addNome.trim()) return
    setSaving(true)
    await supabase.from('lab_formas_envio').insert({ empresa_id: empresaId, nome: addNome.trim() })
    setAddNome('')
    setSaving(false)
    void fetch()
  }

  const handleToggle = async (forma: LabFormaEnvio) => {
    await supabase.from('lab_formas_envio').update({ ativo: !forma.ativo }).eq('id', forma.id)
    void fetch()
  }

  return (
    <Modal title="Tipos de envio" onClose={onClose}>
      <div className={styles.form}>
        {loading ? <Spinner /> : (
          <>
            {formas.length > 0 ? (
              <div className={styles.dentistaList}>
                {formas.map(forma => (
                  <div key={forma.id} className={`${styles.dentistaRow} ${!forma.ativo ? styles.dentistaInativo : ''}`}>
                    <div className={styles.dentistaInfo}>
                      <strong>{forma.nome}</strong>
                      {nomesPadrao.includes(forma.nome.toLowerCase()) && <span className={styles.dentistaEsp}>Padrão do sistema</span>}
                      {!forma.ativo && <span className={styles.dentistaInativoBadge}>Inativo</span>}
                    </div>
                    <button type="button" className={styles.btnSecondary} onClick={() => void handleToggle(forma)}>
                      {forma.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Nenhum tipo de envio cadastrado ainda.</p>
            )}

            <div className={styles.formField} style={{ marginTop: 16 }}>
              <label className={styles.label}>Nome *</label>
              <input className={styles.input} value={addNome} onChange={e => setAddNome(e.target.value)} placeholder="Ex: Motoboy da clínica" />
            </div>
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
              <button type="button" className={styles.btnPrimary} disabled={saving || !addNome.trim()} onClick={() => void handleAdd()}>
                {saving ? 'Salvando…' : 'Adicionar tipo de envio'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── EnvioSteps — wizard de 4 etapas ──────────────────────────────────────
