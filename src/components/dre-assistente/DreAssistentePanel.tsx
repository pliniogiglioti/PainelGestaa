import { useEffect, useMemo, useRef, useState } from 'react'
import type { DreLancamento } from '../../lib/types'
import { supabase } from '../../lib/supabase'
import styles from './DreAssistentePanel.module.css'

type DreAssistentePanelProps = {
  lancamentos: DreLancamento[]
  onClose?: () => void
}

// Validates that a URL is safe (http/https only)
const safeUrl = (raw: string): string => {
  try {
    const url = new URL(raw.trim())
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

// Splits a text into spans/links, converting **bold** and bare URLs
function inlineRender(text: string, key: string | number): JSX.Element {
  // Pattern: **bold** | https://... URL
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g)
  return (
    <span key={key}>
      {parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={idx}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('http://') || part.startsWith('https://')) {
          const href = safeUrl(part)
          return href
            ? <a key={idx} href={href} target="_blank" rel="noreferrer" className={styles.mdLink}>{href}</a>
            : <span key={idx}>{part}</span>
        }
        return <span key={idx}>{part}</span>
      })}
    </span>
  )
}

function renderMarkdownSafe(markdown: string) {
  const elements: JSX.Element[] = []
  const lines = markdown.split('\n')

  lines.forEach((line, i) => {
    if (!line.trim()) return

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className={styles.mdH3}>{line.slice(4)}</h3>)
      return
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className={styles.mdH2}>{line.slice(3)}</h2>)
      return
    }
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className={styles.mdH1}>{line.slice(2)}</h1>)
      return
    }

    // List item — check for course link pattern: - **Title** — https://...
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const content = line.slice(2)

      // Pattern: **Title** — https://url
      const courseMatch = content.match(/^\*\*(.+?)\*\*\s*—\s*(https?:\/\/\S+)/)
      if (courseMatch) {
        const [, title, rawUrl] = courseMatch
        const href = safeUrl(rawUrl)
        elements.push(
          <li key={i} className={`${styles.mdLi} ${styles.mdLiCourse}`}>
            <strong>{title}</strong>
            {' — '}
            {href
              ? <a href={href} target="_blank" rel="noreferrer" className={styles.mdLink}>{href}</a>
              : <span className={styles.mdInvalidLink}>(link inválido)</span>
            }
          </li>,
        )
        return
      }

      elements.push(<li key={i} className={styles.mdLi}>{inlineRender(content, `li-${i}`)}</li>)
      return
    }

    elements.push(<p key={i} className={styles.mdP}>{inlineRender(line, `p-${i}`)}</p>)
  })

  return elements
}

const serializeLancamentos = (lancamentos: DreLancamento[]) =>
  lancamentos.map(item => ({
    data: item.data_lancamento ?? item.created_at,
    descricao: item.descricao,
    valor: item.valor,
    tipo: item.tipo,
    classificacao: item.classificacao,
    grupo: item.grupo,
  }))

// Strips markdown syntax so the text reads naturally when spoken aloud
function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')              // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')        // bold
    .replace(/\[(.+?)\]\(https?:\/\/\S+\)/g, '$1') // [label](url)
    .replace(/https?:\/\/\S+/g, '')         // bare URLs
    .replace(/[▶•]/g, '')                   // special bullets
    .replace(/^\s*[-*]\s/gm, '')            // list markers
    .replace(/\n{2,}/g, '. ')              // paragraph breaks → pause
    .replace(/\n/g, ' ')                    // remaining newlines
    .replace(/\s{2,}/g, ' ')               // extra spaces
    .trim()
}

export function DreAssistentePanel({ lancamentos, onClose }: DreAssistentePanelProps) {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [analysis, setAnalysis] = useState('')
  const [audioState, setAudioState] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [audioRate, setAudioRate]   = useState(1.0)
  const lastCountRef            = useRef(-1)
  const utteranceRef            = useRef<SpeechSynthesisUtterance | null>(null)

  const resumo = useMemo(
    () => lancamentos.reduce(
      (acc, item) => {
        if (item.tipo === 'receita') acc.receitas += Number(item.valor)
        else acc.despesas += Number(item.valor)
        return acc
      },
      { receitas: 0, despesas: 0 },
    ),
    [lancamentos],
  )

  const analisarDre = async () => {
    if (lancamentos.length === 0 || loading) return
    setLoading(true)
    setError('')

    try {
      const { data: configData } = await supabase
        .from('configuracoes').select('valor').eq('chave', 'modelo_openai').single()
      const modelo = configData?.valor ?? 'gpt-4o-mini'

      const { data, error: fnError } = await supabase.functions.invoke('dre-assistente-analise', {
        body: {
          lancamentos: serializeLancamentos(lancamentos),
          modelo,
        },
      })

      if (fnError) {
        // O Supabase SDK sempre seta fnError com mensagem genérica em respostas não-2xx.
        // O erro real está em `data.error` quando disponível.
        const detail = (data as Record<string, unknown> | null)?.error
        setError(detail ? String(detail) : `Erro ao chamar a IA: ${fnError.message ?? String(fnError)}`)
        return
      }

      if (data?.error) {
        setError(String(data.error))
        return
      }

      if (data?.analysis) {
        setAnalysis(String(data.analysis))
      } else {
        setError('A IA não retornou análise.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.')
    } finally {
      setLoading(false)
    }
  }

  const startSpeech = (rate: number) => {
    if (!analysis || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const text = stripMarkdownForSpeech(analysis)
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang  = 'pt-BR'
    utterance.rate  = rate
    utterance.pitch = 1
    utterance.onstart = () => setAudioState('playing')
    utterance.onend   = () => setAudioState('idle')
    utterance.onerror = () => setAudioState('idle')
    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  const lerAnalise = () => {
    if (!analysis || typeof window === 'undefined' || !window.speechSynthesis) return

    if (audioState === 'playing') {
      window.speechSynthesis.pause()
      setAudioState('paused')
      return
    }

    if (audioState === 'paused') {
      window.speechSynthesis.resume()
      setAudioState('playing')
      return
    }

    startSpeech(audioRate)
  }

  const mudarVelocidade = (rate: number) => {
    setAudioRate(rate)
    // If already playing, restart with the new rate
    if (audioState !== 'idle') {
      startSpeech(rate)
    }
  }

  const pararLeitura = () => {
    window.speechSynthesis.cancel()
    setAudioState('idle')
  }

  // Stop reading when a new analysis arrives or component unmounts
  useEffect(() => {
    window.speechSynthesis?.cancel()
    setAudioState('idle')
  }, [analysis])

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  // Keep ref in sync so re-analysis button is always available
  useEffect(() => {
    lastCountRef.current = lancamentos.length
  }, [lancamentos.length])

  const rendered = useMemo(() => renderMarkdownSafe(analysis), [analysis])

  const resultado = resumo.receitas - resumo.despesas
  const hasData   = lancamentos.length > 0

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelMeta}>
          <span className={styles.panelEyebrow}>IA • OpenAI</span>
          <h2 className={styles.panelTitle}>Assistente de DFC</h2>
          <p className={styles.panelDesc}>
            Análise dos seus lançamentos com inteligência artificial. Clique em "Gerar Análise" quando quiser.
          </p>
        </div>

        <div className={styles.headerRight}>
          {onClose && (
            <button className={styles.panelCloseBtn} onClick={onClose} title="Fechar">✕</button>
          )}
          {hasData && (
            <>
              <div className={styles.miniStats}>
                <div className={styles.miniStat}>
                  <span className={styles.miniStatLabel}>Lançamentos</span>
                  <strong className={styles.miniStatValue}>{lancamentos.length}</strong>
                </div>
                <div className={`${styles.miniStat} ${resultado >= 0 ? styles.miniStatPositive : styles.miniStatNegative}`}>
                  <span className={styles.miniStatLabel}>Resultado</span>
                  <strong className={styles.miniStatValue}>
                    {resultado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </strong>
                </div>
              </div>

              <button
                className={styles.generateBtn}
                onClick={analisarDre}
                disabled={loading}
              >
                {loading ? '…' : '✦ Gerar Análise'}
              </button>

              {analysis && !loading && (
                <div className={styles.audioControls}>
                  <button
                    className={`${styles.audioBtn} ${audioState === 'playing' ? styles.audioBtnActive : ''}`}
                    onClick={lerAnalise}
                    title={audioState === 'playing' ? 'Pausar leitura' : audioState === 'paused' ? 'Retomar leitura' : 'Ler análise em voz alta'}
                  >
                    {audioState === 'playing' ? (
                      <><span className={styles.audioIcon}>⏸</span> Pausar</>
                    ) : audioState === 'paused' ? (
                      <><span className={styles.audioIcon}>▶</span> Retomar</>
                    ) : (
                      <><span className={styles.audioIcon}>🔊</span> Ouvir</>
                    )}
                  </button>
                  {audioState !== 'idle' && (
                    <button className={styles.audioStopBtn} onClick={pararLeitura} title="Parar leitura">
                      ⏹
                    </button>
                  )}
                  <div className={styles.speedControls}>
                    {([0.75, 1, 1.25, 1.5, 2] as const).map(rate => (
                      <button
                        key={rate}
                        className={`${styles.speedBtn} ${audioRate === rate ? styles.speedBtnActive : ''}`}
                        onClick={() => mudarVelocidade(rate)}
                        title={`Velocidade ${rate}×`}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className={styles.loadingWrap}>
          <div className={styles.loadingDots}>
            <span /><span /><span />
          </div>
          <p className={styles.loadingText}>Analisando seus lançamentos com IA…</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className={styles.errorWrap}>
          <span className={styles.errorIcon}>⚠️</span>
          <div>
            <strong>Não foi possível analisar</strong>
            <p>{error}</p>
          </div>
          <button className={styles.retryBtn} onClick={analisarDre}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !analysis && (
        <div className={styles.emptyWrap}>
          <span className={styles.emptyIcon}>📊</span>
          <p>
            {hasData
              ? 'Clique em "✦ Gerar Análise" para a IA analisar seus lançamentos.'
              : 'Adicione lançamentos e clique em "✦ Gerar Análise" para começar.'}
          </p>
        </div>
      )}

      {/* Analysis result */}
      {!loading && analysis && (
        <article className={styles.result}>
          {rendered}
          <div className={styles.resultActions}>
            <button className={styles.reanalizeBtn} onClick={analisarDre} disabled={loading}>
              ↺ Reanalisar
            </button>
          </div>
        </article>
      )}
    </section>
  )
}
