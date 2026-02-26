import { useEffect, useMemo, useState } from 'react'
import styles from './AnaliseDrePage.module.css'
import { supabase } from '../lib/supabase'
import type { DreClassificacao, DreLancamento } from '../lib/types'

type Step = 1 | 2 | 3 | 4

type FormState = {
  descricao:         string
  valor:             string
  classificacaoNome: string  // nome from dre_classificacoes (ex: "Receita sobre Serviço")
  grupo:             string  // free-text category (ex: "Materiais de Escritório")
}

const INITIAL_FORM: FormState = { descricao: '', valor: '', classificacaoNome: '', grupo: '' }

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
  const [showWizard,     setShowWizard]     = useState(false)
  const [step,           setStep]           = useState<Step>(1)
  const [saving,         setSaving]         = useState(false)
  const [aiLoading,      setAiLoading]      = useState(false)
  const [aiError,        setAiError]        = useState('')
  const [error,          setError]          = useState('')
  const [form,           setForm]           = useState<FormState>(INITIAL_FORM)
  const [lancamentos,    setLancamentos]    = useState<DreLancamento[]>([])
  const [classificacoes, setClassificacoes] = useState<DreClassificacao[]>([])

  const fetchLancamentos = async () => {
    const { data, error } = await supabase
      .from('dre_lancamentos')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { setError(error.message); return }
    setLancamentos(data ?? [])
  }

  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('dre_classificacoes')
      .select('*')
      .eq('ativo', true)
      .order('tipo')
      .order('nome')
    setClassificacoes(data ?? [])
  }

  useEffect(() => {
    fetchLancamentos()
    fetchClassificacoes()
  }, [])

  const valorNumerico = useMemo(() => {
    const parsed = Number(form.valor.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [form.valor])

  // Map classification nome → tipo for totals (handles both old 'receita'/'despesa' and new descriptive names)
  const tipoMap = useMemo(() =>
    Object.fromEntries(classificacoes.map(c => [c.nome, c.tipo])),
  [classificacoes])

  const totais = useMemo(() =>
    lancamentos.reduce(
      (acc, item) => {
        const tipo = tipoMap[item.classificacao]
          ?? (item.classificacao === 'receita' ? 'receita' : 'despesa')
        if (tipo === 'receita') acc.receitas += Number(item.valor)
        else                   acc.despesas += Number(item.valor)
        return acc
      },
      { receitas: 0, despesas: 0 },
    ),
  [lancamentos, tipoMap])

  const resultado = totais.receitas - totais.despesas

  // Existing grupos for quick-select in step 4
  const gruposExistentes = useMemo(() =>
    [...new Set(lancamentos.map(l => l.grupo).filter(Boolean))].slice(0, 12),
  [lancamentos])

  const openWizard = () => {
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiError('')
    setShowWizard(true)
  }

  const closeWizard = () => {
    setShowWizard(false)
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiError('')
  }

  // After step 2: call AI and pre-fill both classificacao and grupo
  const goToStep3 = async () => {
    if (valorNumerico <= 0) return
    setStep(3)
    setAiLoading(true)
    setAiError('')
    setForm(p => ({ ...p, classificacaoNome: '', grupo: '' }))

    try {
      const { data: configData } = await supabase
        .from('configuracoes')
        .select('valor')
        .eq('chave', 'modelo_groq')
        .single()

      const modelo = configData?.valor ?? 'llama-3.3-70b-versatile'

      const { data, error: fnError } = await supabase.functions.invoke('dre-ai-classify', {
        body: {
          descricao: form.descricao,
          valor: valorNumerico,
          modelo,
          classificacoes_disponiveis: classificacoes.map(c => ({ nome: c.nome, tipo: c.tipo })),
          grupos_existentes: gruposExistentes,
        },
      })

      if (fnError) {
        // Supabase function invocation error (network, auth, etc.)
        setAiError(`Erro ao chamar IA: ${fnError.message ?? String(fnError)}`)
      } else if (data?.error) {
        // Edge function returned an error payload (e.g. GroqCloud model error)
        setAiError(`IA indisponível: ${data.error}`)
      } else if (data) {
        setForm(p => ({
          ...p,
          classificacaoNome: data.classificacao_nome ?? '',
          grupo:             data.grupo             ?? '',
        }))
      }
    } catch (e) {
      setAiError(`Erro inesperado: ${String(e)}`)
    } finally {
      setAiLoading(false)
    }
  }

  const salvar = async () => {
    setError('')
    if (valorNumerico <= 0 || !form.classificacaoNome || !form.grupo.trim()) {
      setError('Preencha todos os campos.')
      return
    }
    setSaving(true)
    const { data: authData } = await supabase.auth.getUser()
    const { error } = await supabase.from('dre_lancamentos').insert({
      descricao:     form.descricao.trim() || null,
      valor:         valorNumerico,
      classificacao: form.classificacaoNome,
      grupo:         form.grupo.trim(),
      user_id:       authData.user?.id ?? null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    closeWizard()
    fetchLancamentos()
  }

  const receitas = classificacoes.filter(c => c.tipo === 'receita')
  const despesas = classificacoes.filter(c => c.tipo === 'despesa')

  // Pill color: green for receita, red for despesa
  const getPillClass = (classificacao: string) => {
    const tipo = tipoMap[classificacao]
      ?? (classificacao === 'receita' ? 'receita' : classificacao === 'despesa' ? 'despesa' : null)
    if (tipo === 'receita') return styles.receitaPill
    if (tipo === 'despesa') return styles.despesaPill
    return styles.despesaPill
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
          <button className={styles.newBtn} onClick={openWizard}>+ Novo lançamento</button>
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
                    <span className={`${styles.tablePill} ${getPillClass(item.classificacao)}`}>
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

            {/* ── STEP 1: Descrição ── */}
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

            {/* ── STEP 2: Valor ── */}
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

            {/* ── STEP 3: Classificação (IA pré-preencheu) ── */}
            {step === 3 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Classificação</label>

                {aiLoading ? (
                  <AiSpinner />
                ) : (
                  <>
                    {/* Aviso quando a IA falhou */}
                    {aiError && (
                      <div className={styles.aiErrorBox}>
                        <span className={styles.aiErrorIcon}>⚠️</span>
                        <div>
                          <strong>IA indisponível</strong>
                          <p className={styles.aiErrorDetail}>{aiError}</p>
                          <p className={styles.aiErrorHint}>Selecione manualmente abaixo ou verifique as configurações da IA no painel admin.</p>
                        </div>
                      </div>
                    )}

                    {/* Seleção atual destacada (só quando IA funcionou) */}
                    {form.classificacaoNome && !aiError && (
                      <div className={styles.aiSelectedBox}>
                        <span className={styles.aiSelectedLabel}>IA identificou</span>
                        <strong className={styles.aiSelectedValue}>{form.classificacaoNome}</strong>
                      </div>
                    )}

                    {/* Opções para trocar */}
                    {classificacoes.length > 0 && (
                      <div className={styles.classGrid}>
                        {receitas.length > 0 && (
                          <div className={styles.classGroup}>
                            <span className={styles.classGroupLabel}>Receitas</span>
                            {receitas.map(c => (
                              <button
                                key={c.id}
                                className={`${styles.classChip} ${styles.classChipReceita} ${form.classificacaoNome === c.nome ? styles.classChipSelected : ''}`}
                                onClick={() => setForm(p => ({ ...p, classificacaoNome: c.nome }))}
                              >
                                {c.nome}
                                {form.classificacaoNome === c.nome && <span className={styles.chipCheckmark}> ✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {despesas.length > 0 && (
                          <div className={styles.classGroup}>
                            <span className={styles.classGroupLabel}>Despesas</span>
                            {despesas.map(c => (
                              <button
                                key={c.id}
                                className={`${styles.classChip} ${styles.classChipDespesa} ${form.classificacaoNome === c.nome ? styles.classChipSelected : ''}`}
                                onClick={() => setForm(p => ({ ...p, classificacaoNome: c.nome }))}
                              >
                                {c.nome}
                                {form.classificacaoNome === c.nome && <span className={styles.chipCheckmark}> ✓</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                <button
                  className={styles.submit}
                  disabled={!form.classificacaoNome || aiLoading}
                  onClick={() => setStep(4)}
                >
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(2)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 4: Grupo (IA pré-preencheu) ── */}
            {step === 4 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Grupo / Categoria</label>

                {/* Campo pré-preenchido pela IA */}
                {form.grupo && (
                  <div className={styles.aiSelectedBox}>
                    <span className={styles.aiSelectedLabel}>IA identificou</span>
                    <strong className={styles.aiSelectedValue}>{form.grupo}</strong>
                  </div>
                )}

                <input
                  className={styles.wizardInput}
                  value={form.grupo}
                  onChange={e => setForm(p => ({ ...p, grupo: e.target.value }))}
                  placeholder="Ex: Materiais de Escritório"
                  autoFocus
                />

                {/* Atalhos: grupos já usados */}
                {gruposExistentes.length > 0 && (
                  <div className={styles.grupoQuickList}>
                    <span className={styles.classGroupLabel}>Usados anteriormente</span>
                    <div className={styles.grupoQuickChips}>
                      {gruposExistentes.map(g => (
                        <button
                          key={g}
                          className={`${styles.grupoChip} ${form.grupo === g ? styles.grupoChipSelected : ''}`}
                          onClick={() => setForm(p => ({ ...p, grupo: g }))}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resumo final */}
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
                    <strong>{form.classificacaoNome}</strong>
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
