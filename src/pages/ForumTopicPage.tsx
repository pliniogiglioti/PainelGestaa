import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { ForumTopicWithMeta, ForumReplyWithAuthor } from '../lib/types'
import { User } from '../App'
import styles from './ForumTopicPage.module.css'

interface ForumTopicPageProps {
  topicId: string
  currentUser: User
  onBack: () => void
}

const IconArrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
)

const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
)

const IconPin = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
)

function Avatar({ name, size = 38 }: { name: string | null; size?: number }) {
  const initial = (name ?? '?').charAt(0).toUpperCase()
  return (
    <div className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function ForumTopicPage({ topicId, currentUser, onBack }: ForumTopicPageProps) {
  const [topic,   setTopic]   = useState<ForumTopicWithMeta | null>(null)
  const [replies, setReplies] = useState<ForumReplyWithAuthor[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Increment views once on mount
  useEffect(() => {
    supabase.rpc('increment_topic_views', { topic_id: topicId } as any).then(() => {})
  }, [topicId])

  // Fetch topic + replies
  useEffect(() => {
    async function load() {
      setLoading(true)

      const [{ data: topicData }, { data: repliesData }] = await Promise.all([
        supabase
          .from('forum_topics')
          .select(`*, profiles(name, avatar_url), forum_categories(name, slug)`)
          .eq('id', topicId)
          .single(),
        supabase
          .from('forum_replies')
          .select(`*, profiles(name, avatar_url)`)
          .eq('topic_id', topicId)
          .order('created_at', { ascending: true }),
      ])

      if (topicData) {
        setTopic({
          ...(topicData as any),
          reply_count: repliesData?.length ?? 0,
        })
      }

      setReplies((repliesData as unknown as ForumReplyWithAuthor[]) ?? [])
      setLoading(false)
    }

    load()
  }, [topicId])

  // Realtime subscription for new replies
  useEffect(() => {
    const channel = supabase
      .channel(`topic-${topicId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'forum_replies', filter: `topic_id=eq.${topicId}` },
        async (payload) => {
          const { data } = await supabase
            .from('forum_replies')
            .select(`*, profiles(name, avatar_url)`)
            .eq('id', payload.new.id)
            .single()
          if (data) {
            setReplies(prev => [...prev, data as unknown as ForumReplyWithAuthor])
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [topicId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim() || submitting) return
    setSubmitting(true)

    // Get current user profile id from supabase auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const { error } = await supabase.from('forum_replies').insert({
      topic_id:  topicId,
      author_id: user.id,
      content:   replyText.trim(),
    })

    if (!error) {
      setReplyText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (!topic) {
    return (
      <div className={styles.loadingWrap}>
        <p style={{ color: 'var(--text-muted)' }}>Tópico não encontrado.</p>
        <button className={styles.backBtn} onClick={onBack}><IconArrow /> Voltar</button>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <IconArrow /> Voltar
        </button>
        <div className={styles.headerMeta}>
          {topic.forum_categories && (
            <span className={styles.catTag}>{topic.forum_categories.name}</span>
          )}
          {topic.pinned && (
            <span className={styles.pinTag}><IconPin /> Fixado</span>
          )}
        </div>
      </div>

      {/* Original post */}
      <div className={styles.originalPost}>
        <div className={styles.postHeader}>
          <Avatar name={topic.profiles?.name ?? currentUser.name} />
          <div className={styles.postAuthorWrap}>
            <span className={styles.postAuthor}>{topic.profiles?.name ?? currentUser.name}</span>
            <span className={styles.postDate}>{formatDate(topic.created_at)}</span>
          </div>
        </div>
        <h1 className={styles.topicTitle}>{topic.title}</h1>
        <p className={styles.postContent}>{topic.content}</p>
      </div>

      {/* Replies */}
      <div className={styles.repliesSection}>
        <span className={styles.replyCount}>{replies.length} {replies.length === 1 ? 'resposta' : 'respostas'}</span>

        <div className={styles.repliesList}>
          {replies.length === 0 && (
            <p className={styles.emptyReplies}>Seja o primeiro a responder este tópico.</p>
          )}
          {replies.map((reply, i) => (
            <div key={reply.id} className={styles.replyCard} style={{ animationDelay: `${i * 40}ms` }}>
              <Avatar name={reply.profiles?.name ?? '?'} size={34} />
              <div className={styles.replyBody}>
                <div className={styles.replyHeader}>
                  <span className={styles.replyAuthor}>{reply.profiles?.name ?? 'Usuário'}</span>
                  <span className={styles.replyDate}>{formatDate(reply.created_at)}</span>
                </div>
                <p className={styles.replyContent}>{reply.content}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Reply composer */}
      <div className={styles.composer}>
        <Avatar name={currentUser.name} size={36} />
        <form className={styles.composerForm} onSubmit={handleSubmit}>
          <textarea
            className={styles.composerInput}
            placeholder="Escreva sua resposta..."
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            rows={1}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e as any)
              }
            }}
          />
          <button
            type="submit"
            className={styles.composerSend}
            disabled={!replyText.trim() || submitting}
          >
            <IconSend />
          </button>
        </form>
      </div>
    </div>
  )
}
