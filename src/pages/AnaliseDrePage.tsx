import { useEffect, useMemo, useState } from 'react'
import styles from './AnaliseDrePage.module.css'
import { supabase } from '../lib/supabase'
import type { DreClassificacao, DreLancamento, Database } from '../lib/types'
import { DreAssistentePanel } from '../components/dre-assistente/DreAssistentePanel'

type DreGrupo = Database['public']['Tables']['dre_grupos']['Row']

type Step = 1 | 2 | 3 | 4 | 5 | 6

type FormState = {
  tipo:              '' | 'receita' | 'despesa'  // Step 1: entrada ou saída
  data:              string                        // Step 2: data do lançamento
  descricao:         string                        // Step 3: descrição
  valor:             string                        // Step 4: valor
  classificacaoNome: string                        // Step 5: categoria específica
  grupo:             string                        // Step 6: grupo livre
}

const today = () => new Date().toISOString().split('T')[0]

const INITIAL_FORM: FormState = {
  tipo: '', data: today(), descricao: '', valor: '', classificacaoNome: '', grupo: '',
}

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct   = (v: number) => `${v.toFixed(1)}%`

// ── Simple helpers to categorise expenses by grupo / classificacao keywords ──

function somaDesp(lancamentos: DreLancamento[], keywords: string[]): number {
  return lancamentos
    .filter(l => {
      if (l.tipo !== 'despesa') return false
      const haystack = `${l.grupo ?? ''} ${l.classificacao ?? ''}`.toLowerCase()
      return keywords.some(k => haystack.includes(k))
    })
    .reduce((s, l) => s + Number(l.valor), 0)
}

// ── KPI calculations ──

function calcularKpis(lancamentos: DreLancamento[], totalReceitas: number) {
  const deducoes = somaDesp(lancamentos, ['deduç', 'cancelamento', 'tarifa de cartão'])
  const receitaLiquida = totalReceitas - deducoes

  const custos = somaDesp(lancamentos, ['custo', 'cmv', 'produto', 'serviço prestado', 'frete de venda'])

  const despesasOper = somaDesp(lancamentos, [
    'pessoal', 'salário', 'pró-labore', 'administrativ', 'comercial',
    'marketing', 'publicidade', 'ti', 'softwares', 'aluguel', 'energia', 'internet',
  ])

  const impostos = somaDesp(lancamentos, ['imposto', 'simples', 'presumido', 'tributo'])

  const margemContrib = receitaLiquida - custos
  const ebitda        = margemContrib - despesasOper
  const ebit          = ebitda  // no D&A data in this system
  const nopat         = ebit - impostos

  const base = receitaLiquida > 0 ? receitaLiquida : 1 // avoid div/0

  return {
    receitaOperacional: totalReceitas,
    margemContribPct:   (margemContrib / base) * 100,
    ebitdaPct:          (ebitda / base) * 100,
    ebitPct:            (ebit / base) * 100,
    nopatPct:           (nopat / base) * 100,
    receitaLiquida,
    semDados:           receitaLiquida === 0 && totalReceitas === 0,
  }
}

// ── Components ──

function StatCard({ title, value, tone = 'default' }: {
  title: string; value: string; tone?: 'default' | 'positive' | 'negative'
}) {
  return (
    <article className={`${styles.statCard} ${tone === 'positive' ? styles.positiveCard : ''} ${tone === 'negative' ? styles.negativeCard : ''}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

function KpiCard({ title, value, hint, tone = 'default' }: {
  title: string; value: string; hint: string; tone?: 'default' | 'positive' | 'negative' | 'neutral'
}) {
  return (
    <article className={`${styles.kpiCard} ${tone === 'positive' ? styles.kpiPositive : ''} ${tone === 'negative' ? styles.kpiNegative : ''} ${tone === 'neutral' ? styles.kpiNeutral : ''}`}>
      <span className={styles.kpiTitle}>{title}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      <p className={styles.kpiHint}>{hint}</p>
    </article>
  )
}

const STEP_LABELS: Record<Step, string> = {
  1: 'Tipo', 2: 'Data', 3: 'Descrição', 4: 'Valor', 5: 'Classificação', 6: 'Grupo',
}

function StepProgress({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4, 5, 6]
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
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [step,           setStep]           = useState<Step>(1)
  const [saving,         setSaving]         = useState(false)
  const [aiLoading,      setAiLoading]      = useState(false)
  const [aiError,        setAiError]        = useState('')
  const [aiWarning,      setAiWarning]      = useState('')
  const [error,          setError]          = useState('')
  const [form,           setForm]           = useState<FormState>(INITIAL_FORM)
  const [lancamentos,    setLancamentos]    = useState<DreLancamento[]>([])
  const [classificacoes, setClassificacoes] = useState<DreClassificacao[]>([])
  const [grupos,         setGrupos]         = useState<DreGrupo[]>([])

  const fetchLancamentos = async () => {
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData.user?.id
    if (!userId) {
      setLancamentos([])
      return
    }

    const { data, error } = await supabase
      .from('dre_lancamentos')
      .select('*')
      .eq('user_id', userId)
      .order('data_lancamento', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) { setError(error.message); return }
    setLancamentos(data ?? [])
  }

  const fetchClassificacoes = async () => {
    const { data } = await supabase
      .from('dre_classificacoes').select('*').eq('ativo', true).order('tipo').order('nome')
    setClassificacoes(data ?? [])
  }

  const fetchGrupos = async () => {
    const { data } = await supabase
      .from('dre_grupos').select('*').eq('ativo', true).order('nome')
    setGrupos(data ?? [])
  }

  // Load data on mount
  useEffect(() => { fetchLancamentos(); fetchClassificacoes(); fetchGrupos() }, [])

  const valorNumerico = useMemo(() => {
    const parsed = Number(form.valor.replace(',', '.'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [form.valor])

  const tipoMap = useMemo(() =>
    Object.fromEntries(classificacoes.map(c => [c.nome, c.tipo])),
  [classificacoes])

  const totais = useMemo(() =>
    lancamentos.reduce((acc, item) => {
      const tipo = item.tipo
        ?? tipoMap[item.classificacao]
        ?? (item.classificacao === 'receita' ? 'receita' : 'despesa')
      if (tipo === 'receita') acc.receitas += Number(item.valor)
      else                   acc.despesas += Number(item.valor)
      return acc
    }, { receitas: 0, despesas: 0 }),
  [lancamentos, tipoMap])

  const resultado = totais.receitas - totais.despesas

  const kpis = useMemo(
    () => calcularKpis(lancamentos, totais.receitas),
    [lancamentos, totais.receitas],
  )

  const gruposExistentes = useMemo(() =>
    [...new Set([
      ...grupos.map(g => g.nome).filter(Boolean),
      ...lancamentos.map(l => l.grupo).filter(Boolean),
    ])].slice(0, 12),
  [grupos, lancamentos])

  const classificacoesFiltradas = useMemo(() =>
    form.tipo ? classificacoes.filter(c => c.tipo === form.tipo) : classificacoes,
  [classificacoes, form.tipo])

  const classificacaoEhNova = useMemo(() => {
    const nome = form.classificacaoNome.trim().toLowerCase()
    if (!nome) return false
    return !classificacoes.some(c => c.nome.trim().toLowerCase() === nome)
  }, [classificacoes, form.classificacaoNome])

  const openWizard = () => {
    setEditingId(null)
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiError('')
    setAiWarning('')
    setShowWizard(true)
  }

  const openEditWizard = (item: DreLancamento) => {
    setEditingId(item.id)
    setForm({
      tipo:              item.tipo,
      data:              item.data_lancamento ?? today(),
      descricao:         item.descricao ?? '',
      valor:             String(item.valor),
      classificacaoNome: item.classificacao,
      grupo:             item.grupo,
    })
    setStep(1)
    setError('')
    setAiError('')
    setAiWarning('')
    setShowWizard(true)
  }

  const closeWizard = () => {
    setShowWizard(false)
    setEditingId(null)
    setForm(INITIAL_FORM)
    setStep(1)
    setError('')
    setAiError('')
    setAiWarning('')
  }

  const ensureGrupoCatalogado = async (grupoNomeRaw: string, tipoRaw: '' | 'receita' | 'despesa') => {
    const grupoNome = grupoNomeRaw.trim()
    if (!grupoNome) return { ok: false as const, error: 'Grupo vazio.' }

    const tipoGrupo: 'receita' | 'despesa' = tipoRaw === 'receita' ? 'receita' : 'despesa'

    const { error } = await supabase
      .from('dre_grupos')
      .upsert({ nome: grupoNome, tipo: tipoGrupo, ativo: true }, { onConflict: 'nome,tipo' })

    if (!error) return { ok: true as const }

    const { error: insertError } = await supabase
      .from('dre_grupos')
      .insert({ nome: grupoNome, tipo: tipoGrupo, ativo: true })

    if (insertError && !String(insertError.message).toLowerCase().includes('duplicate')) {
      return { ok: false as const, error: insertError.message }
    }

    return { ok: true as const }
  }

  // After step 4 (valor): AI identifies classificacao + grupo
  const goToStep5 = async () => {
    if (valorNumerico <= 0) return
    setStep(5)
    setAiLoading(true)
    setAiError('')
    setAiWarning('')
    setForm(p => ({ ...p, classificacaoNome: '', grupo: '' }))

    try {
      const { data: configData } = await supabase
        .from('configuracoes').select('valor').eq('chave', 'modelo_groq').single()
      const modelo = configData?.valor ?? DEFAULT_GROQ_MODEL

      const classesDoTipo = classificacoes
        .filter(c => c.tipo === form.tipo)
        .map(c => ({ nome: c.nome, tipo: c.tipo }))

      const { data, error: fnError } = await supabase.functions.invoke('dre-ai-classify', {
        body: {
          descricao: form.descricao,
          valor: valorNumerico,
          tipo: form.tipo,
          modelo,
          classificacoes_disponiveis: classesDoTipo,
          grupos_existentes: gruposExistentes,
        },
      })

      if (fnError) {
        setAiError(`Erro ao chamar IA: ${fnError.message ?? String(fnError)}`)
      } else if (data?.error) {
        setAiError(`IA indisponível: ${data.error}`)
      } else if (data) {
        const grupoIa = String(data.grupo ?? '').trim()
        const classificacaoIa = String(data.classificacao_nome ?? '').trim()

        setForm(p => ({ ...p, classificacaoNome: classificacaoIa, grupo: grupoIa }))

        if (data?.aviso) setAiWarning(String(data.aviso))

        if (grupoIa) {
          const resGrupo = await ensureGrupoCatalogado(grupoIa, form.tipo)
          if (!resGrupo.ok) {
            setAiError(`Grupo sugerido, mas falha ao cadastrar no catálogo: ${resGrupo.error}`)
          } else {
            fetchGrupos()
          }
        }
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

    const classificacaoNome  = form.classificacaoNome.trim()
    const grupoNome          = form.grupo.trim()
    const tipoClassificacao  = form.tipo || (tipoMap[classificacaoNome] === 'receita' ? 'receita' : 'despesa')
    const dataLancamento     = form.data || today()

    const { error: classError } = await supabase
      .from('dre_classificacoes')
      .upsert({ nome: classificacaoNome, tipo: tipoClassificacao, ativo: true }, { onConflict: 'nome' })

    if (classError) {
      setSaving(false)
      setError(`Não foi possível cadastrar a classificação: ${classError.message}`)
      return
    }

    const resGrupo = await ensureGrupoCatalogado(grupoNome, form.tipo)
    if (!resGrupo.ok) {
      setSaving(false)
      setError(`Não foi possível cadastrar o grupo: ${resGrupo.error}`)
      return
    }

    const payload = {
      descricao:        form.descricao.trim() || null,
      valor:            valorNumerico,
      tipo:             tipoClassificacao,
      classificacao:    classificacaoNome,
      grupo:            grupoNome,
      data_lancamento:  dataLancamento,
    }

    const { error } = editingId
      ? await supabase.from('dre_lancamentos').update(payload).eq('id', editingId)
      : await supabase.from('dre_lancamentos').insert({ ...payload, user_id: authData.user?.id ?? null })

    setSaving(false)
    if (error) { setError(error.message); return }
    closeWizard(); fetchLancamentos(); fetchGrupos(); fetchClassificacoes()
  }

  const getPillClass = (classificacao: string, tipoLancamento?: 'receita' | 'despesa') => {
    const tipo = tipoLancamento
      ?? tipoMap[classificacao]
      ?? (classificacao === 'receita' ? 'receita' : classificacao === 'despesa' ? 'despesa' : null)
    return tipo === 'receita' ? styles.receitaPill : styles.despesaPill
  }

  const formatDate = (item: DreLancamento) => {
    const src = item.data_lancamento ?? item.created_at
    return new Date(src).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  const kpiTone = (v: number): 'positive' | 'negative' | 'neutral' =>
    v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral'

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

      {/* ── Stats ── */}
      <section className={styles.statsGrid}>
        <StatCard title="Receitas"  value={moeda(totais.receitas)} tone="positive" />
        <StatCard title="Despesas"  value={moeda(totais.despesas)} tone="negative" />
        <StatCard title="Resultado" value={moeda(resultado)} tone={resultado >= 0 ? 'positive' : 'negative'} />
      </section>

      {/* ── KPI Cards ── */}
      {lancamentos.length > 0 && (
        <section className={styles.kpiSection}>
          <h3 className={styles.kpiSectionTitle}>Indicadores DRE</h3>
          <div className={styles.kpiGrid}>
            <KpiCard
              title="Receitas Operacionais"
              value={moeda(kpis.receitaOperacional)}
              hint="Total que entrou no período (vendas + serviços)."
              tone="positive"
            />
            <KpiCard
              title="Margem de Contribuição"
              value={pct(kpis.margemContribPct)}
              hint="Quanto sobra das receitas após pagar os custos diretos (produto/serviço)."
              tone={kpiTone(kpis.margemContribPct)}
            />
            <KpiCard
              title="EBITDA"
              value={pct(kpis.ebitdaPct)}
              hint="Resultado antes de impostos e financiamentos — mostra a eficiência do negócio."
              tone={kpiTone(kpis.ebitdaPct)}
            />
            <KpiCard
              title="EBIT"
              value={pct(kpis.ebitPct)}
              hint="Resultado operacional (sem depreciação/amortização cadastrada, igual ao EBITDA)."
              tone={kpiTone(kpis.ebitPct)}
            />
            <KpiCard
              title="NOPAT (Resultado Op.)"
              value={pct(kpis.nopatPct)}
              hint="Resultado operacional após impostos — o que o negócio gera de verdade."
              tone={kpiTone(kpis.nopatPct)}
            />
          </div>
          <p className={styles.kpiDisclaimer}>
            * Indicadores calculados com base nos lançamentos cadastrados e seus grupos. Quanto mais detalhado seu lançamento, mais preciso o cálculo.
          </p>
        </section>
      )}

      {/* ── AI Assistant ── */}
      <DreAssistentePanel lancamentos={lancamentos} />

      {/* ── Lançamentos ── */}
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
              <tr><th>Data</th><th>Descrição</th><th>Classificação</th><th>Grupo</th><th>Valor</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {lancamentos.map(item => (
                <tr key={item.id}>
                  <td>{formatDate(item)}</td>
                  <td>{item.descricao ?? '—'}</td>
                  <td>
                    <span className={`${styles.tablePill} ${getPillClass(item.classificacao, item.tipo)}`}>
                      {item.classificacao}
                    </span>
                  </td>
                  <td>{item.grupo}</td>
                  <td>{moeda(Number(item.valor))}</td>
                  <td className={styles.actionsCell}>
                    <button className={styles.editBtn} onClick={() => openEditWizard(item)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {lancamentos.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    Nenhum lançamento ainda.{' '}
                    <button className={styles.emptyAction} onClick={openWizard}>Adicionar agora</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Wizard modal ── */}
      {showWizard && (
        <div className={styles.modalOverlay} onClick={closeWizard}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>

            <div className={styles.modalHeader}>
              <h2>{editingId ? 'Editar lançamento' : 'Novo lançamento'}</h2>
              <button className={styles.closeBtn} onClick={closeWizard} aria-label="Fechar">✕</button>
            </div>

            <StepProgress current={step} />

            {/* ── STEP 1: Tipo ── */}
            {step === 1 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>O que foi isso?</label>

                <div className={styles.tipoGrid}>
                  <button
                    className={`${styles.tipoBtn} ${styles.tipoBtnReceita} ${form.tipo === 'receita' ? styles.tipoBtnSelected : ''}`}
                    onClick={() => setForm(p => ({ ...p, tipo: 'receita' }))}
                  >
                    <span className={styles.tipoArrow}>↑</span>
                    <div className={styles.tipoBtnText}>
                      <strong>Entrou dinheiro</strong>
                      <small>Venda, serviço prestado, recebimento</small>
                    </div>
                  </button>

                  <button
                    className={`${styles.tipoBtn} ${styles.tipoBtnDespesa} ${form.tipo === 'despesa' ? styles.tipoBtnSelected : ''}`}
                    onClick={() => setForm(p => ({ ...p, tipo: 'despesa' }))}
                  >
                    <span className={styles.tipoArrow}>↓</span>
                    <div className={styles.tipoBtnText}>
                      <strong>Saiu dinheiro</strong>
                      <small>Compra, pagamento, fornecedor, custo</small>
                    </div>
                  </button>
                </div>

                <button className={styles.submit} disabled={!form.tipo} onClick={() => setStep(2)}>
                  Próximo →
                </button>
              </div>
            )}

            {/* ── STEP 2: Data ── */}
            {step === 2 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Em qual data?</label>
                <p className={styles.wizardHint}>
                  Informe quando aconteceu esse {form.tipo === 'receita' ? 'recebimento' : 'pagamento'}.
                </p>
                <input
                  type="date"
                  className={styles.wizardInput}
                  value={form.data}
                  onChange={e => setForm(p => ({ ...p, data: e.target.value }))}
                  max={today()}
                  autoFocus
                />
                <button className={styles.submit} disabled={!form.data} onClick={() => setStep(3)}>
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(1)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 3: Descrição ── */}
            {step === 3 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>
                  {form.tipo === 'receita' ? 'O que você vendeu ou recebeu?' : 'O que você comprou ou pagou?'}
                </label>
                <input
                  className={styles.wizardInput}
                  value={form.descricao}
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder={form.tipo === 'receita' ? 'Ex: Pagamento pelo serviço de design' : 'Ex: Compra de material de escritório'}
                  autoFocus
                />
                <button className={styles.submit} disabled={!form.descricao.trim()} onClick={() => setStep(4)}>
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(2)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 4: Valor ── */}
            {step === 4 && (
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
                <button className={styles.submit} disabled={valorNumerico <= 0} onClick={goToStep5}>
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(3)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 5: Classificação ── */}
            {step === 5 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Como classificar?</label>

                {aiLoading ? <AiSpinner /> : (
                  <>
                    {aiError && (
                      <div className={styles.aiErrorBox}>
                        <span className={styles.aiErrorIcon}>⚠️</span>
                        <div>
                          <strong>IA indisponível</strong>
                          <p className={styles.aiErrorDetail}>{aiError}</p>
                          <p className={styles.aiErrorHint}>Selecione manualmente. Verifique as configurações da IA.</p>
                        </div>
                      </div>
                    )}

                    {aiWarning && !aiError && (
                      <div className={styles.aiErrorBox}>
                        <span className={styles.aiErrorIcon}>ℹ️</span>
                        <div>
                          <strong>Sugestão por fallback</strong>
                          <p className={styles.aiErrorDetail}>{aiWarning}</p>
                        </div>
                      </div>
                    )}

                    {!aiError && form.classificacaoNome && (
                      <div className={styles.aiSelectedBox}>
                        <span className={styles.aiSelectedLabel}>IA identificou</span>
                        <strong className={styles.aiSelectedValue}>{form.classificacaoNome}</strong>
                        {classificacaoEhNova && (
                          <span className={styles.aiSelectedLabel}>Será cadastrada como nova classificação ao salvar.</span>
                        )}
                      </div>
                    )}

                    {classificacoesFiltradas.length === 0 ? (
                      <p className={styles.error}>
                        Nenhuma classificação cadastrada para este tipo. Acesse Configurações Admin.
                      </p>
                    ) : (
                      <div className={styles.listbox}>
                        {classificacoesFiltradas.map(c => (
                          <button
                            key={c.id}
                            className={`${styles.listboxItem} ${form.classificacaoNome === c.nome ? styles.listboxItemSelected : ''}`}
                            onClick={() => setForm(p => ({ ...p, classificacaoNome: c.nome }))}
                          >
                            <span className={styles.listboxRadio}>
                              {form.classificacaoNome === c.nome ? '●' : '○'}
                            </span>
                            {c.nome}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <button
                  className={styles.submit}
                  disabled={!form.classificacaoNome || aiLoading}
                  onClick={() => setStep(6)}
                >
                  Próximo →
                </button>
                <button className={styles.backBtn} onClick={() => setStep(4)}>← Voltar</button>
              </div>
            )}

            {/* ── STEP 6: Grupo ── */}
            {step === 6 && (
              <div className={styles.wizardStep}>
                <label className={styles.wizardLabel}>Grupo / Categoria</label>

                {form.grupo && !aiError && (
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

                <div className={styles.summary}>
                  <div className={styles.summaryRow}><span>Data</span><strong>{new Date(form.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong></div>
                  <div className={styles.summaryRow}><span>Descrição</span><strong>{form.descricao}</strong></div>
                  <div className={styles.summaryRow}><span>Valor</span><strong>{moeda(valorNumerico)}</strong></div>
                  <div className={styles.summaryRow}><span>Classificação</span><strong>{form.classificacaoNome}</strong></div>
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <button
                  className={styles.submit}
                  disabled={saving || !form.grupo.trim()}
                  onClick={salvar}
                >
                  {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar lançamento'}
                </button>
                <button className={styles.backBtn} onClick={() => setStep(5)}>← Voltar</button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
