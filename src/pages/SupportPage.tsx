import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { SupportTicket, SupportTicketMessage } from '../lib/types'
import styles from './SupportPage.module.css'

type TicketStatus = SupportTicket['status']
type TicketPriority = SupportTicket['priority']
type TicketCategory = SupportTicket['category']

const statusLabels: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  aguardando_cliente: 'Aguardando você',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
}

const priorityLabels: Record<TicketPriority, string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
}

const categoryLabels: Record<TicketCategory, string> = {
  duvida: 'Dúvida', problema: 'Problema técnico', financeiro: 'Financeiro', sugestao: 'Sugestão', outro: 'Outro',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function ticketCode(id: number) {
  return `#${String(id).padStart(5, '0')}`
}

export default function SupportPage({ isAdmin }: { isAdmin: boolean }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [messages, setMessages] = useState<SupportTicketMessage[]>([])
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<'todos' | TicketStatus>('todos')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<TicketCategory>('duvida')
  const [priority, setPriority] = useState<TicketPriority>('normal')
  const [description, setDescription] = useState('')
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchProfiles = useCallback(async (ids: string[]) => {
    const uniqueIds = [...new Set(ids)].filter(Boolean)
    if (!uniqueIds.length) return
    const { data } = await supabase.from('profiles').select('id, name, email').in('id', uniqueIds)
    if (!data) return
    setProfileNames(current => ({
      ...current,
      ...Object.fromEntries(data.map(profile => [profile.id, profile.name?.trim() || profile.email || 'Usuário'])),
    }))
  }, [])

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('support_tickets')
      .select('*')
      .order('last_message_at', { ascending: false })
    if (fetchError) setError(fetchError.message)
    const nextTickets = data ?? []
    setTickets(nextTickets)
    await fetchProfiles(nextTickets.map(ticket => ticket.user_id))
    setLoading(false)
  }, [fetchProfiles])

  const fetchMessages = useCallback(async (ticketId: number) => {
    setLoadingMessages(true)
    const { data, error: fetchError } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    if (fetchError) setError(fetchError.message)
    const nextMessages = data ?? []
    setMessages(nextMessages)
    await fetchProfiles(nextMessages.map(message => message.author_id))
    setLoadingMessages(false)
  }, [fetchProfiles])

  useEffect(() => { void fetchTickets() }, [fetchTickets])
  useEffect(() => {
    if (selectedId == null) return
    void fetchMessages(selectedId)
  }, [fetchMessages, selectedId])

  const filteredTickets = useMemo(() => (
    filter === 'todos' ? tickets : tickets.filter(ticket => ticket.status === filter)
  ), [filter, tickets])
  const selectedTicket = tickets.find(ticket => ticket.id === selectedId) ?? null
  const openCount = tickets.filter(ticket => !['resolvido', 'fechado'].includes(ticket.status)).length
  const waitingCount = tickets.filter(ticket => ticket.status === 'aguardando_cliente').length
  const resolvedCount = tickets.filter(ticket => ['resolvido', 'fechado'].includes(ticket.status)).length

  const resetCreateForm = () => {
    setSubject(''); setCategory('duvida'); setPriority('normal'); setDescription(''); setError('')
  }

  const createTicket = async (event: FormEvent) => {
    event.preventDefault()
    if (subject.trim().length < 4 || !description.trim()) {
      setError('Informe um assunto e descreva como podemos ajudar.')
      return
    }
    setSaving(true); setError('')
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { setError('Sua sessão expirou. Entre novamente.'); setSaving(false); return }
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({ user_id: authData.user.id, subject: subject.trim(), category, priority })
      .select('*')
      .single()
    if (ticketError || !ticket) { setError(ticketError?.message ?? 'Não foi possível abrir o ticket.'); setSaving(false); return }
    const { error: messageError } = await supabase.from('support_ticket_messages').insert({
      ticket_id: ticket.id, author_id: authData.user.id, message: description.trim(), is_staff: false,
    })
    if (messageError) { setError(messageError.message); setSaving(false); return }
    await fetchTickets()
    setSelectedId(ticket.id); setShowCreate(false); resetCreateForm(); setSaving(false)
  }

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedTicket || !reply.trim()) return
    setSaving(true); setError('')
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { setError('Sua sessão expirou. Entre novamente.'); setSaving(false); return }
    const { error: replyError } = await supabase.from('support_ticket_messages').insert({
      ticket_id: selectedTicket.id, author_id: authData.user.id, message: reply.trim(), is_staff: isAdmin,
    })
    if (replyError) { setError(replyError.message); setSaving(false); return }
    setReply('')
    await Promise.all([fetchMessages(selectedTicket.id), fetchTickets()])
    setSaving(false)
  }

  const updateTicket = async (updates: { status?: TicketStatus; priority?: TicketPriority }) => {
    if (!selectedTicket || !isAdmin) return
    setSaving(true); setError('')
    const { error: updateError } = await supabase
      .from('support_tickets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', selectedTicket.id)
    if (updateError) setError(updateError.message)
    await fetchTickets(); setSaving(false)
  }

  if (selectedTicket) {
    return (
      <div className={styles.page}>
        <button className={styles.backButton} onClick={() => { setSelectedId(null); setMessages([]); setError('') }}>
          <span>←</span> Voltar para tickets
        </button>
        <div className={styles.detailHeader}>
          <div>
            <div className={styles.detailEyebrow}>{ticketCode(selectedTicket.id)} · {categoryLabels[selectedTicket.category]}</div>
            <h1>{selectedTicket.subject}</h1>
            <p>Aberto por {profileNames[selectedTicket.user_id] ?? 'Usuário'} em {formatDate(selectedTicket.created_at)}</p>
          </div>
          <div className={styles.detailBadges}>
            <span className={`${styles.badge} ${styles[`status_${selectedTicket.status}`]}`}>{statusLabels[selectedTicket.status]}</span>
            <span className={`${styles.priority} ${styles[`priority_${selectedTicket.priority}`]}`}>{priorityLabels[selectedTicket.priority]}</span>
          </div>
        </div>

        {isAdmin && (
          <div className={styles.adminBar}>
            <label>Status
              <select value={selectedTicket.status} disabled={saving} onChange={e => void updateTicket({ status: e.target.value as TicketStatus })}>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Prioridade
              <select value={selectedTicket.priority} disabled={saving} onChange={e => void updateTicket({ priority: e.target.value as TicketPriority })}>
                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <span className={styles.adminHint}>Controles da equipe de suporte</span>
          </div>
        )}

        <section className={styles.conversation}>
          {loadingMessages ? <div className={styles.loading}>Carregando conversa...</div> : messages.map(message => (
            <article key={message.id} className={`${styles.message} ${message.is_staff ? styles.staffMessage : ''}`}>
              <div className={styles.messageAvatar}>{(profileNames[message.author_id] ?? 'U').charAt(0).toUpperCase()}</div>
              <div className={styles.messageBody}>
                <div className={styles.messageMeta}>
                  <strong>{message.is_staff ? 'Equipe Gestaa' : profileNames[message.author_id] ?? 'Usuário'}</strong>
                  {message.is_staff && <span>Suporte</span>}
                  <time>{formatDate(message.created_at)}</time>
                </div>
                <p>{message.message}</p>
              </div>
            </article>
          ))}
        </section>

        {selectedTicket.status !== 'fechado' ? (
          <form className={styles.replyBox} onSubmit={sendReply}>
            <textarea value={reply} onChange={e => setReply(e.target.value)} maxLength={5000} placeholder={isAdmin ? 'Escreva uma resposta para o cliente...' : 'Escreva sua mensagem...'} />
            <div className={styles.replyActions}>
              <span>{reply.length}/5000</span>
              <button type="submit" disabled={saving || !reply.trim()}>{saving ? 'Enviando...' : 'Enviar resposta'}</button>
            </div>
          </form>
        ) : <div className={styles.closedNotice}>Este ticket está fechado.</div>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p>Central de atendimento</p>
          <h1>{isAdmin ? 'Tickets de suporte' : 'Como podemos ajudar?'}</h1>
          <span>{isAdmin ? 'Acompanhe e responda às solicitações dos usuários.' : 'Abra um chamado e acompanhe toda a conversa por aqui.'}</span>
        </div>
        <button className={styles.primaryButton} onClick={() => setShowCreate(true)}><span>＋</span> Novo ticket</button>
      </header>

      <div className={styles.stats}>
        <div><span className={styles.statIcon}>◌</span><p>Em andamento<strong>{openCount}</strong></p></div>
        <div><span className={styles.statIcon}>⌛</span><p>Aguardando você<strong>{waitingCount}</strong></p></div>
        <div><span className={styles.statIcon}>✓</span><p>Resolvidos<strong>{resolvedCount}</strong></p></div>
      </div>

      <section className={styles.ticketSection}>
        <div className={styles.sectionTop}>
          <div><h2>{isAdmin ? 'Todos os tickets' : 'Meus tickets'}</h2><p>{tickets.length} {tickets.length === 1 ? 'solicitação' : 'solicitações'}</p></div>
          <div className={styles.filters}>
            {(['todos', 'aberto', 'em_atendimento', 'aguardando_cliente', 'resolvido'] as const).map(item => (
              <button key={item} className={filter === item ? styles.filterActive : ''} onClick={() => setFilter(item)}>
                {item === 'todos' ? 'Todos' : statusLabels[item]}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className={styles.loading}>Carregando tickets...</div> : filteredTickets.length === 0 ? (
          <div className={styles.empty}><div>?</div><h3>Nenhum ticket por aqui</h3><p>Quando você abrir uma solicitação, ela aparecerá nesta lista.</p></div>
        ) : (
          <div className={styles.ticketList}>
            {filteredTickets.map(ticket => (
              <button key={ticket.id} className={styles.ticketCard} onClick={() => setSelectedId(ticket.id)}>
                <span className={`${styles.ticketMarker} ${styles[`priority_${ticket.priority}`]}`} />
                <div className={styles.ticketMain}>
                  <div className={styles.ticketTitle}><strong>{ticket.subject}</strong><span>{ticketCode(ticket.id)}</span></div>
                  <p>{categoryLabels[ticket.category]}{isAdmin ? ` · ${profileNames[ticket.user_id] ?? 'Usuário'}` : ''}</p>
                </div>
                <span className={`${styles.badge} ${styles[`status_${ticket.status}`]}`}>{statusLabels[ticket.status]}</span>
                <time>{formatDate(ticket.last_message_at)}</time><span className={styles.chevron}>›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget && !saving) setShowCreate(false) }}>
          <form className={styles.modal} onSubmit={createTicket}>
            <div className={styles.modalHeader}><div><p>Novo atendimento</p><h2>Abrir ticket</h2></div><button type="button" onClick={() => setShowCreate(false)}>×</button></div>
            <label>Assunto<input value={subject} onChange={e => setSubject(e.target.value)} maxLength={140} placeholder="Resuma sua solicitação" autoFocus /></label>
            <div className={styles.formRow}>
              <label>Categoria<select value={category} onChange={e => setCategory(e.target.value as TicketCategory)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Prioridade<select value={priority} onChange={e => setPriority(e.target.value as TicketPriority)}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <label>Como podemos ajudar?<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={5000} placeholder="Conte o que aconteceu e inclua os detalhes importantes..." /></label>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.modalActions}><button type="button" onClick={() => setShowCreate(false)} disabled={saving}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Abrindo...' : 'Abrir ticket'}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
