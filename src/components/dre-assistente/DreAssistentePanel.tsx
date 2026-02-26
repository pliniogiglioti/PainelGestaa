import { useEffect, useMemo, useRef, useState } from 'react'
import type { DreLancamento } from '../../lib/types'
import { supabase } from '../../lib/supabase'
import styles from './DreAssistentePanel.module.css'

type DreAssistentePanelProps = {
  lancamentos: DreLancamento[]
}

function renderMarkdownSafe(markdown: string) {
  const elements: JSX.Element[] = []
  const lines = markdown.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className={styles.mdH3}>{line.slice(4)}</h3>)
      i++
      continue
    }

    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className={styles.mdH2}>{line.slice(3)}</h2>)
      i++
      continue
    }

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className={styles.mdH1}>{line.slice(2)}</h1>)
      i++
      continue
    }

    // Bold inline
    const boldLine = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className={styles.mdLi}
          dangerouslySetInnerHTML={{ __html: boldLine.slice(2) }} />,
      )
      i++
      continue
    }

    elements.push(
      <p key={i} className={styles.mdP}
        dangerouslySetInnerHTML={{ __html: boldLine }} />,
    )
    i++
  }

  return elements
}

const serializeLancamentos = (lancamentos: DreLancamento[]) =>
  lancamentos.map(item => ({
    data: item.created_at,
    descricao: item.descricao,
    valor: item.valor,
    tipo: item.tipo,
    classificacao: item.classificacao,
    grupo: item.grupo,
  }))

export function DreAssistentePanel({ lancamentos }: DreAssistentePanelProps) {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [analysis, setAnalysis] = useState('')
  const lastCountRef            = useRef(-1)

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
        .from('configuracoes').select('valor').eq('chave', 'modelo_groq').single()
      const modelo = configData?.valor ?? 'llama-3.3-70b-versatile'

      const { data, error: fnError } = await supabase.functions.invoke('dre-assistente-analise', {
        body: {
          lancamentos: serializeLancamentos(lancamentos),
          modelo,
        },
      })

      if (fnError) {
        setError(`Erro ao chamar a IA: ${fnError.message ?? String(fnError)}`)
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

  // Auto-analyze whenever the number of lancamentos changes
  useEffect(() => {
    if (lancamentos.length === 0) return
    if (lancamentos.length === lastCountRef.current) return
    lastCountRef.current = lancamentos.length
    analisarDre()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentos.length])

  const rendered = useMemo(() => renderMarkdownSafe(analysis), [analysis])

  const resultado = resumo.receitas - resumo.despesas
  const hasData   = lancamentos.length > 0

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelMeta}>
          <span className={styles.panelEyebrow}>IA • Groq</span>
          <h2 className={styles.panelTitle}>Assistente de DRE</h2>
          <p className={styles.panelDesc}>
            Análise automática dos seus lançamentos com inteligência artificial.
          </p>
        </div>

        {hasData && (
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
        )}
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
          <p>Adicione lançamentos para a IA analisar automaticamente.</p>
        </div>
      )}

      {/* Analysis result */}
      {!loading && analysis && (
        <article className={styles.result}>
          {rendered}
          <button className={styles.reanalizeBtn} onClick={analisarDre} disabled={loading}>
            ↺ Reanalisar
          </button>
        </article>
      )}
    </section>
  )
}
