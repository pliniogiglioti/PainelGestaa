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
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Aplicativo</p>
          <h1>Análise DRE</h1>
        </div>
        <a href="/" className={styles.backLink}>Voltar ao dashboard</a>
      </header>

      <div className={styles.layout}>
        <section className={styles.card}>
          <h2>Novo lançamento (steps)</h2>

          <div className={styles.step}>
            <span className={`${styles.badge} ${step === 1 ? styles.badgeActive : ''}`}>1</span>
            <div>
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
            <span className={`${styles.badge} ${step === 2 ? styles.badgeActive : ''}`}>2</span>
            <div>
              <label>Classificação</label>
              <div className={styles.actions}>
                <button type="button" onClick={() => atualizarClassificacao('receita')} className={form.classificacao === 'receita' ? styles.activeButton : ''}>Receita</button>
                <button type="button" onClick={() => atualizarClassificacao('despesa')} className={form.classificacao === 'despesa' ? styles.activeButton : ''}>Despesa</button>
              </div>
            </div>
          </div>

          <div className={styles.step}>
            <span className={`${styles.badge} ${step === 3 ? styles.badgeActive : ''}`}>3</span>
            <div>
              <label>Grupo</label>
              <input
                value={form.grupo}
                onChange={e => atualizarGrupo(e.target.value)}
                placeholder="Ex: Vendas, Custos, Impostos..."
              />
            </div>
          </div>

          <div className={styles.preview}>
            <h3>Prévia</h3>
            <p>Valor: <strong>{valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
            <p>Classificação: <strong>{form.classificacao || '-'}</strong></p>
            <p>Grupo: <strong>{form.grupo || '-'}</strong></p>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="button" onClick={adicionarLancamento} disabled={saving} className={styles.submit}>
            {saving ? 'Salvando...' : 'Adicionar lançamento'}
          </button>
        </section>

        <section className={styles.card}>
          <h2>Resumo</h2>
          <div className={styles.kpis}>
            <div>
              <span>Receitas</span>
              <strong>{totais.receitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </div>
            <div>
              <span>Despesas</span>
              <strong>{totais.despesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
            </div>
            <div>
              <span>Resultado</span>
              <strong className={resultado >= 0 ? styles.positive : styles.negative}>
                {resultado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
            </div>
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
                    <td>{item.classificacao}</td>
                    <td>{item.grupo}</td>
                    <td>{Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
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
