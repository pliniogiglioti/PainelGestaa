import { useMemo, useState } from 'react'
import styles from './DreAssistentePanel.module.css'

type ApiResponse = {
  analysis?: string
  error?: string
}

const safeUrl = (raw: string) => {
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) ? raw : ''
  } catch {
    return ''
  }
}

function renderMarkdownSafe(markdown: string) {
  const lines = markdown.split('\n')
  const elements: JSX.Element[] = []

  lines.forEach((line, index) => {
    if (!line.trim()) {
      elements.push(<br key={`br-${index}`} />)
      return
    }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={index}>{line.slice(4)}</h3>)
      return
    }

    if (line.startsWith('## ')) {
      elements.push(<h2 key={index}>{line.slice(3)}</h2>)
      return
    }

    if (line.startsWith('# ')) {
      elements.push(<h1 key={index}>{line.slice(2)}</h1>)
      return
    }

    const linkMatch = line.match(/^-\s+\*\*(.+?)\*\*\s+—\s+(\S+)/)
    if (linkMatch) {
      const [, title, url] = linkMatch
      const href = safeUrl(url)
      elements.push(
        <p key={index}>
          • <strong>{title}</strong>
          {' — '}
          {href ? (
            <a href={href} target="_blank" rel="noreferrer">
              {href}
            </a>
          ) : (
            '(link inválido)'
          )}
        </p>,
      )
      return
    }

    elements.push(<p key={index}>{line}</p>)
  })

  return elements
}

export function DreAssistentePanel() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState('')

  const renderedResponse = useMemo(() => renderMarkdownSafe(response), [response])

  const analisarDre = async () => {
    setError('')
    setResponse('')

    if (!input.trim()) {
      setError('Cole o DRE antes de solicitar a análise.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/assistente-dre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dre: input }),
      })

      const data = (await res.json()) as ApiResponse

      if (!res.ok || !data.analysis) {
        throw new Error(data.error || 'Falha ao analisar o DRE.')
      }

      setResponse(data.analysis)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao analisar o DRE.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <h2>Assistente de DRE (IA)</h2>
        <p>Cole seu DRE em texto/JSON para receber diagnóstico e aulas recomendadas.</p>
      </div>

      <textarea
        className={styles.input}
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder="Ex.: categoria=CMV; valor=12000; descricao=Compra de insumos"
      />

      <button className={styles.button} onClick={analisarDre} disabled={loading}>
        {loading ? 'Analisando...' : 'Analisar DRE'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {response && <article className={styles.response}>{renderedResponse}</article>}
    </section>
  )
}
