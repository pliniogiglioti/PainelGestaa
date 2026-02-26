import { useEffect, useMemo, useState } from 'react'
import styles from './AnaliseDrePage.module.css'
import { supabase } from '../lib/supabase'
import type { DreLancamento } from '../lib/types'

type Step = 1 | 2 | 3 | 4

type FormState = {
  descricao: string
  valor: string
  classificacao: '' | 'receita' | 'despesa'
  grupo: string
}

type AiSuggestion = {
  classificacao: 'receita' | 'despesa'
  grupo: string
}

const INITIAL_FORM: FormState = { descricao: '', valor: '', classificacao: '', grupo: '' }

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function StatCard({ title, value, tone = 'default' }: { title: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  return (
    <article className={`${styles.statCard} ${tone === 'positive' ? styles.positiveCard : ''} ${tone === 'negative' ? styles.negativeCard : ''}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

const STEP_LABELS: Record<Step, string> = { 1: 'Descrição', 2: 'Valor', 3: 'Classificação', 4: 'Grupo' }

function StepProgress({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4]
  return (
    <div className={styles.stepProgress}>
      {steps.map((s, i) => {
        const done   = s < current
        const active = s === current
        return (
          <div key={s} className={styles.stepProgressItem}>
            <div className={`${styles.stepDot} ${active ? styles.stepDotActive : ''} ${done ? styles.stepDotDone : ''}`}>
              {done ? '✓' : s}
            </div>
            <span className={`${styles.stepDotLabel} ${active ? styles.stepDotLabelActive : ''}`}>
              {STEP_LABELS[s]}
            </span>
            {i < steps.length - 1 && (
              <div className={`${styles.stepConnector} ${done ? styles.stepConnectorDone : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function AiSpinner() {
  return (
    <div className={styles.aiLoadingBox}>
      <div className={styles.aiSpinner} />
      <span>IA analisando...</span>
    </div>
  )
}

export default function AnaliseDrePage() {
  const [showWizard,  setShowWizard]  = useState(false)
  const [step,        setStep]        = useState<Step>(1)
  const [saving,      setSaving]      = useState(false)
  const [aiLoading,   setAiLoading]   = useState(false)
  const [error,       setError]       = useState('')
  const [form,        setForm]        = useState<FormState>(INITIAL_FORM)
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null)
  const [lancamentos, setLancamentos] = useState<DreLancamento[]>([])

  const fetchLancamentos = async () => {
    const { data, error } = await supabase
      .from('dre_lancamentos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { setError(error.message); return }
    setLancamentos(data ?? [])
  }

  useEffect(() => { fetchLancamentos() }, [])

  const valorNumerico = useMemo(() => {
    const parsed = Number(form.valor.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [form.valor])

  const totais = useMemo(() =>
    lancamentos.reduce(
      (acc, item) => {
        if (item.classificacao === 'receita') acc.receitas += Number(item.valor)
        else                                  acc.despesas += Number(item.valor)
        return acc
      },
      { receitas: 0, despesas: 0 },
    ),
  [lancamentos])

  const resultado = totais.receitas - totais.despesas

  const openWizard = () => {
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiSuggestion(null)
    setShowWizard(true)
  }

  const closeWizard = () => {
    setShowWizard(false)
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiSuggestion(null)
  }

  // Call GroqCloud edge function after step 2
  const callAiClassify = async () => {
    setAiLoading(true)
    setAiSuggestion(null)
    try {
      const gruposExistentes = [...new Set(lancamentos.map(l => l.grupo).filter(Boolean))]
      const { data, error } = await supabase.functions.invoke('dre-ai-classify', {
        body: {
          descricao: form.descricao,
          valor: valorNumerico,
          grupos_existentes: gruposExistentes,
        },
      })
      if (!error && data) {
        setAiSuggestion(data as AiSuggestion)
        setForm(p => ({
          ...p,
          classificacao: data.classificacao ?? '',
          grupo: data.grupo ?? '',
        }))
      }
    } catch {
      // AI failed silently — user can fill manually
    } finally {
      setAiLoading(false)
    }
  }

  const goToStep3 = async () => {
    if (valorNumerico <= 0) return
    setStep(3)
    await callAiClassify()
  }

  const salvar = async () => {
    setError('')
    if (valorNumerico <= 0 || !form.classificacao || !form.grupo.trim()) {
      setError('Preencha todos os campos.')
      return
    }
    setSaving(true)
    const { data: authData } = await supabase.auth.getUser()
    const { error } = await supabase.from('dre_lancamentos').insert({
      descricao:     form.descricao.trim() || null,
      valor:         valorNumerico,
      classificacao: form.classificacao,
      grupo:         form.grupo.trim(),
      user_id:       authData.user?.id ?? null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    closeWizard()
    fetchLancamentos()
  }

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />

      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Financeiro • Aplicativo interno</p>
          <h1>Análise DRE</h1>
          <p className={styles.subtitle}>Acompanhe receitas, despesas e o resultado do período em tempo real.</p>
        </div>
        <a href="/" className={styles.backLink}>← Voltar ao dashboard</a>
      </header>

      <section className={styles.statsGrid}>
        <StatCard title="Receitas"  value={moeda(totais.receitas)} tone="positive" />
        <StatCard title="Despesas"  value={moeda(totais.despesas)} tone="negative" />
        <StatCard title="Resultado" value={moeda(resultado)}       tone={resultado >= 0 ? 'positive' : 'negative'} />
      </section>

      {/* ── Tabela de lançamentos ── */}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Lançamentos</h2>
            <span className={styles.stepIndicator}>{lancamentos.length} registros</span>
          </div>
          <button className={styles.newBtn} onClick={openWizard}>
            + Novo lançamento
          </button>
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Classificação</th>
                <th>Grupo</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map(item => (
                <tr key={item.id}>
                  <td>{new Date(item.created_at).toLocaleDateString('pt-BR')}</td>
                  <td>{item.descricao ?? '—'}</td>
                  <td>
                    <span className={`${styles.tablePill} ${item.classificacao === 'receita' ? styles.receitaPill : styles.despesaPill}`}>
                      {item.classificacao}
                    </span>
                  </td>
                  <td>{item.grupo}</td>
                  <td>{moeda(Number(item.valor))}</td>
                </tr>
              ))}
              {lancamentos.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    Nenhum lançamento ainda.{' '}
                    <button className={styles.emptyAction} onClick={openWizard}>Adicionar agora</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Modal wizard ── */}
      {showWizard && (
        <div className={styles.modalOverlay} onClick={closeWizard}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>

            <div className={styles.modalHeader}>
              <h2>Novo lançamento</h2>
              <button className={styles.closeBtn} onClick={closeWizard} aria-label="Fechar">✕</button>
            </div>

            <StepProgress current={step} />

            {/* STEP 1 — Descrição */}
            {step === 1 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>O que você comprou ou recebeu?</label>
                <input
                  className={styles.wizardInput}
                  value={form.descricao}
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Compra de material de escritório"
                  autoFocus
                />
                <button
                  className={styles.submit}
                  disabled={!form.descricao.trim()}
                  onClick={() => setStep(2)}
                >
                  Próximo →
                </button>
              </div>
            )}

            {/* STEP 2 — Valor */}
            {step === 2 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Qual é o valor?</label>
                <input
                  className={styles.wizardInput}
                  value={form.valor}
                  onChange={e => setForm(p => ({ ...p, valor: e.target.value }))}
                  placeholder="Ex: 1.250,00"
                  inputMode="decimal"
                  autoFocus
                />
                <button
                  className={styles.submit}
                  disabled={valorNumerico <= 0}
                  onClick={goToStep3}
                >
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(1)}>← Voltar</button>
              </div>
            )}

            {/* STEP 3 — Classificação (IA sugere) */}
            {step === 3 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Como classificar?</label>

                {aiLoading ? (
                  <AiSpinner />
                ) : (
                  <>
                    {aiSuggestion && (
                      <div className={styles.aiSuggestionBadge}>
                        IA sugeriu: <strong>{aiSuggestion.classificacao}</strong>
                      </div>
                    )}
                    <div className={styles.classifyGrid}>
                      <button
                        className={`${styles.classifyBtn} ${styles.classifyReceita} ${form.classificacao === 'receita' ? styles.classifySelected : ''}`}
                        onClick={() => { setForm(p => ({ ...p, classificacao: 'receita' })); setStep(4) }}
                      >
                        <span className={styles.classifyArrow}>↑</span>
                        Receita
                      </button>
                      <button
                        className={`${styles.classifyBtn} ${styles.classifyDespesa} ${form.classificacao === 'despesa' ? styles.classifySelected : ''}`}
                        onClick={() => { setForm(p => ({ ...p, classificacao: 'despesa' })); setStep(4) }}
                      >
                        <span className={styles.classifyArrow}>↓</span>
                        Despesa
                      </button>
                    </div>
                  </>
                )}
                <button className={styles.backBtn} onClick={() => setStep(2)}>← Voltar</button>
              </div>
            )}

            {/* STEP 4 — Grupo (IA sugere) */}
            {step === 4 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Qual é o grupo?</label>

                {aiSuggestion && (
                  <div className={styles.aiSuggestionBadge}>
                    IA sugeriu: <strong>{aiSuggestion.grupo}</strong>
                  </div>
                )}

                <input
                  className={styles.wizardInput}
                  value={form.grupo}
                  onChange={e => setForm(p => ({ ...p, grupo: e.target.value }))}
                  placeholder="Ex: Vendas, Custos, Impostos..."
                  autoFocus
                />

                <div className={styles.summary}>
                  <div className={styles.summaryRow}>
                    <span>Descrição</span>
                    <strong>{form.descricao}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Valor</span>
                    <strong>{moeda(valorNumerico)}</strong>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Classificação</span>
                    <strong className={form.classificacao === 'receita' ? styles.receitaText : styles.despesaText}>
                      {form.classificacao}
                    </strong>
                  </div>
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <button
                  className={styles.submit}
                  disabled={saving || !form.grupo.trim()}
                  onClick={salvar}
                >
                  {saving ? 'Salvando…' : 'Salvar lançamento'}
                </button>
                <button className={styles.backBtn} onClick={() => setStep(3)}>← Voltar</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
