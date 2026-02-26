import { useEffect, useMemo, useState } from 'react'
import styles from './AnaliseDrePage.module.css'
import { supabase } from '../lib/supabase'
import type { DreLancamento } from '../lib/types'

type Step = 1 | 2 | 3

type FormState = {
  valor: string
  classificacao: '' | 'receita' | 'despesa'
  grupo: string
}

const INITIAL_FORM: FormState = {
  valor: '',
  classificacao: '',
  grupo: '',
}

const moeda = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function StatCard({ title, value, tone = 'default' }: { title: string; value: string; tone?: 'default' | 'positive' | 'negative' }) {
  return (
    <article className={`${styles.statCard} ${tone === 'positive' ? styles.positiveCard : ''} ${tone === 'negative' ? styles.negativeCard : ''}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

function StepBadge({ index, isActive }: { index: Step; isActive: boolean }) {
  return <span className={`${styles.badge} ${isActive ? styles.badgeActive : ''}`}>{index}</span>
}

export default function AnaliseDrePage() {
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [lancamentos, setLancamentos] = useState<DreLancamento[]>([])

  const fetchLancamentos = async () => {
    const { data, error } = await supabase
      .from('dre_lancamentos')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setLancamentos(data ?? [])
  }

  useEffect(() => {
    fetchLancamentos()
  }, [])

  const valorNumerico = useMemo(() => {
    const parsed = Number(form.valor.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : 0
  }, [form.valor])

  const totais = useMemo(() => {
    return lancamentos.reduce(
      (acc, item) => {
        if (item.classificacao === 'receita') {
          acc.receitas += Number(item.valor)
        } else {
          acc.despesas += Number(item.valor)
        }
        return acc
      },
      { receitas: 0, despesas: 0 },
    )
  }, [lancamentos])

  const resultado = totais.receitas - totais.despesas

  const atualizarValor = (valor: string) => {
    setForm(prev => ({ ...prev, valor }))
    const parsed = Number(valor.replace(',', '.'))
    if (Number.isFinite(parsed) && parsed > 0) {
      setStep(2)
    }
  }

  const atualizarClassificacao = (classificacao: 'receita' | 'despesa') => {
    setForm(prev => ({ ...prev, classificacao }))
    setStep(3)
  }

  const atualizarGrupo = (grupo: string) => {
    setForm(prev => ({ ...prev, grupo }))
  }

  const limparForm = () => {
    setForm(INITIAL_FORM)
    setStep(1)
  }

  const adicionarLancamento = async () => {
    setError('')

    if (valorNumerico <= 0 || !form.classificacao || !form.grupo.trim()) {
      setError('Preencha valor, classificação e grupo para continuar.')
      return
    }

    setSaving(true)
    const { data: authData } = await supabase.auth.getUser()

    const { error } = await supabase.from('dre_lancamentos').insert({
      valor: valorNumerico,
      classificacao: form.classificacao,
      grupo: form.grupo.trim(),
      user_id: authData.user?.id ?? null,
    })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    limparForm()
    fetchLancamentos()
  }

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden />
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Financeiro • Aplicativo interno</p>
          <h1>Análise DRE</h1>
          <p className={styles.subtitle}>Lance receitas e despesas com visual guiado e acompanhe o resultado em tempo real.</p>
        </div>
        <a href="/" className={styles.backLink}>Voltar ao dashboard</a>
      </header>

      <section className={styles.statsGrid}>
        <StatCard title="Receitas" value={moeda(totais.receitas)} tone="positive" />
        <StatCard title="Despesas" value={moeda(totais.despesas)} tone="negative" />
        <StatCard title="Resultado" value={moeda(resultado)} tone={resultado >= 0 ? 'positive' : 'negative'} />
      </section>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Novo lançamento</h2>
            <span className={styles.stepIndicator}>Etapa {step} de 3</span>
          </div>

          <div className={styles.step}>
            <StepBadge index={1} isActive={step === 1} />
            <div className={styles.inputWrap}>
              <label>Valor</label>
              <input
                value={form.valor}
                onChange={e => atualizarValor(e.target.value)}
                placeholder="Ex: 1250,00"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className={styles.step}>
            <StepBadge index={2} isActive={step === 2} />
            <div className={styles.inputWrap}>
              <label>Classificação</label>
              <div className={styles.actions}>
                <button type="button" onClick={() => atualizarClassificacao('receita')} className={form.classificacao === 'receita' ? styles.activeButton : ''}>Receita</button>
                <button type="button" onClick={() => atualizarClassificacao('despesa')} className={form.classificacao === 'despesa' ? styles.activeButton : ''}>Despesa</button>
              </div>
            </div>
          </div>

          <div className={styles.step}>
            <StepBadge index={3} isActive={step === 3} />
            <div className={styles.inputWrap}>
              <label>Grupo</label>
              <input
                value={form.grupo}
                onChange={e => atualizarGrupo(e.target.value)}
                placeholder="Ex: Vendas, Custos, Impostos..."
              />
            </div>
          </div>

          <div className={styles.preview}>
            <h3>Prévia do lançamento</h3>
            <div className={styles.previewRows}>
              <p><span>Valor</span><strong>{moeda(valorNumerico)}</strong></p>
              <p><span>Classificação</span><strong>{form.classificacao || '-'}</strong></p>
              <p><span>Grupo</span><strong>{form.grupo || '-'}</strong></p>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="button" onClick={adicionarLancamento} disabled={saving} className={styles.submit}>
            {saving ? 'Salvando...' : 'Adicionar lançamento'}
          </button>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Lançamentos recentes</h2>
            <span className={styles.stepIndicator}>{lancamentos.length} itens</span>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Classificação</th>
                  <th>Grupo</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map(item => (
                  <tr key={item.id}>
                    <td>{new Date(item.created_at).toLocaleDateString('pt-BR')}</td>
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
                    <td colSpan={4} className={styles.empty}>Sem lançamentos ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
