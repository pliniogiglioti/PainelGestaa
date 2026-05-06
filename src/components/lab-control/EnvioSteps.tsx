import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Lab, LabDentista, LabEnvio, LabFormaEnvio, LabKanbanColuna, LabPreco } from '../../lib/types'
import styles from '../../pages/LabControlPage.module.css'
import { CLASSIFICACAO_PROTESE_OPTIONS, DEFAULT_ENVIO_STATUS, FORMA_RECEBIMENTO_OPTIONS, SHADE_OPTIONS } from './constants'
import { IconAlert, IconTrash } from './icons'
import { Modal, ReviewRow } from './shared'
import { addBusinessDays, calcularPrazoEntrega, formatCurrencyMask, formatDate, getEnvioEtapas, getLabFeriados, normalizeServicoNome, parseMaskedCurrency, registrarHistorico, today } from './utils'

interface EnvioFormState {
  tipo_trabalho: string; preco_servico: string
  paciente_nome: string; dentista_nome: string; dentes: string; cor: string; observacoes: string
  classificacao_protese: string
  data_envio: string; data_entrega_prometida: string; data_consulta: string
  forma_envio: string; retirado_por: string
  data_recebimento: string; forma_recebimento: string; retirado_por_recebimento: string
  conferencia_ok: boolean; anotacao_recebimento: string
  desconto: string; data_pagamento: string; observacao_financeira: string
  urgente: boolean
}

interface ServicoSelecionado {
  key: string
  nome: string
  preco: number | null
  quantidade: number
  origem: 'catalogo' | 'manual'
  prazo_entrega: string
  prazo_producao_dias: number | null
  concluido: boolean
  data_conclusao: string
}

export function EnvioSteps({ lab, labs = [], precos = [], precosByLab, empresaId, userId, envio, colunas, onClose, onSaved }: {
  lab?: Lab | null; labs?: Lab[]; precos?: LabPreco[]; precosByLab?: Record<string, LabPreco[]>
  empresaId: string; userId: string
  envio: LabEnvio | null; colunas: LabKanbanColuna[]
  onClose: () => void; onSaved: () => void
}) {
  const [step,   setStep]   = useState(1)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const availableLabs = lab ? [lab, ...labs.filter(item => item.id !== lab.id)] : labs
  const labsById = Object.fromEntries(availableLabs.map(item => [item.id, item]))
  const [selectedLabId, setSelectedLabId] = useState(envio?.lab_id ?? lab?.id ?? '')
  const shouldSelectLab = !lab || availableLabs.length > 1
  const currentLab = selectedLabId ? (labsById[selectedLabId] ?? null) : (lab ?? null)
  const currentPrecos = currentLab
    ? (precosByLab?.[currentLab.id] ?? (currentLab.id === lab?.id ? precos : []))
    : []
  const feriadosLab = currentLab ? getLabFeriados(currentLab) : []
  const [servicosSelecionados, setServicosSelecionados] = useState<ServicoSelecionado[]>(() => {
    if (!envio) return []

    return getEnvioEtapas(envio).map(etapa => {
      const precoCadastrado = currentPrecos.find(p => normalizeServicoNome(p.nome_servico) === normalizeServicoNome(etapa.nome))
      return {
        key: precoCadastrado ? `preco:${precoCadastrado.id}` : `manual:${etapa.id}`,
        nome: etapa.nome,
        preco: etapa.preco,
        quantidade: etapa.quantidade ?? 1,
        origem: precoCadastrado ? 'catalogo' : etapa.origem,
        prazo_entrega: etapa.prazo_entrega ?? envio.data_entrega_prometida ?? '',
        prazo_producao_dias: etapa.prazo_producao_dias ?? precoCadastrado?.prazo_producao_dias ?? null,
        concluido: etapa.concluido,
        data_conclusao: etapa.data_conclusao ?? '',
      }
    })
  })
  const [usarPrazoAutomatico, setUsarPrazoAutomatico] = useState(!envio)
  const [form,   setForm]   = useState<EnvioFormState>({
    tipo_trabalho:               envio?.tipo_trabalho ?? '',
    preco_servico:               envio?.preco_servico != null ? String(envio.preco_servico) : '',
    paciente_nome:               envio?.paciente_nome ?? '',
    dentista_nome:               envio?.dentista_nome ?? '',
    dentes:                      envio?.dentes ?? '',
    cor:                         envio?.cor ?? '',
    observacoes:                 envio?.observacoes ?? '',
    classificacao_protese:       envio?.classificacao_protese ?? '',
    data_envio:                  envio?.data_envio ?? today(),
    data_entrega_prometida:      envio?.data_entrega_prometida ?? addBusinessDays(envio?.data_envio ?? today(), currentLab?.prazo_medio_dias ?? 0, feriadosLab),
    data_consulta:               envio?.data_consulta ?? '',
    forma_envio:                 envio?.forma_envio ?? '',
    retirado_por:                envio?.retirado_por ?? '',
    data_recebimento:            envio?.data_recebimento ?? '',
    forma_recebimento:           envio?.forma_recebimento ?? '',
    retirado_por_recebimento:    envio?.retirado_por_recebimento ?? '',
    conferencia_ok:              envio?.conferencia_ok ?? false,
    anotacao_recebimento:        envio?.anotacao_recebimento ?? '',
    desconto:                    envio?.desconto != null ? formatCurrencyMask(String(Math.round(envio.desconto * 100))) : '',
    data_pagamento:              envio?.data_pagamento ?? '',
    observacao_financeira:       envio?.observacao_financeira ?? '',
    urgente:                     envio?.urgente ?? false,
  })

  const [dentistas,       setDentistas]       = useState<LabDentista[]>([])
  const [addingDentista,  setAddingDentista]  = useState(false)
  const [novoDentistaName, setNovoDentistaName] = useState('')
  const [savingDentista,  setSavingDentista]  = useState(false)
  const [formasEnvio,       setFormasEnvio]       = useState<LabFormaEnvio[]>([])
  const [addingFormaEnvio,  setAddingFormaEnvio]  = useState(false)
  const [novaFormaEnvioName, setNovaFormaEnvioName] = useState('')
  const [savingFormaEnvio,  setSavingFormaEnvio]  = useState(false)

  useEffect(() => {
    void supabase.from('lab_dentistas').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome')
      .then(({ data }) => setDentistas(data ?? []))
  }, [empresaId])

  useEffect(() => {
    void supabase.from('lab_formas_envio').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome')
      .then(({ data }) => setFormasEnvio(data ?? []))
  }, [empresaId])

  const formasEnvioOptions = formasEnvio.map(forma => forma.nome)

  const handleSaveDentista = async () => {
    if (!novoDentistaName.trim()) return
    setSavingDentista(true)
    const { data } = await supabase.from('lab_dentistas').insert({ empresa_id: empresaId, nome: novoDentistaName.trim() }).select().single()
    if (data) {
      setDentistas(prev => [...prev, data as LabDentista].sort((a, b) => a.nome.localeCompare(b.nome)))
      setForm(p => ({ ...p, dentista_nome: (data as LabDentista).nome }))
    }
    setAddingDentista(false)
    setNovoDentistaName('')
    setSavingDentista(false)
  }

  const handleSaveFormaEnvio = async () => {
    if (!novaFormaEnvioName.trim()) return
    const nome = novaFormaEnvioName.trim()
    setSavingFormaEnvio(true)
    const existente = formasEnvioOptions.find(item => item.toLowerCase() === nome.toLowerCase())
    if (existente) {
      setForm(p => ({ ...p, forma_envio: existente }))
    } else {
      const { data } = await supabase.from('lab_formas_envio').insert({ empresa_id: empresaId, nome }).select().single()
      if (data) {
        setFormasEnvio(prev => [...prev, data as LabFormaEnvio].sort((a, b) => a.nome.localeCompare(b.nome)))
        setForm(p => ({ ...p, forma_envio: (data as LabFormaEnvio).nome }))
      }
    }
    setAddingFormaEnvio(false)
    setNovaFormaEnvioName('')
    setSavingFormaEnvio(false)
  }

  const set = (f: keyof EnvioFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  useEffect(() => {
    const trabalho = servicosSelecionados
      .map(servico => servico.nome.trim())
      .filter(Boolean)
      .join(' + ')

    const possuiPreco = servicosSelecionados.some(servico => servico.preco != null)
    const valorTotal = servicosSelecionados.reduce((total, servico) => total + (servico.preco ?? 0) * servico.quantidade, 0)
    const precoServico = possuiPreco ? String(valorTotal) : ''

    setForm(prev => (
      prev.tipo_trabalho === trabalho && prev.preco_servico === precoServico
        ? prev
        : { ...prev, tipo_trabalho: trabalho, preco_servico: precoServico }
    ))
  }, [servicosSelecionados])

  useEffect(() => {
    if (!usarPrazoAutomatico) return

    const prazoCalculado = calcularPrazoEntrega(form.data_envio, servicosSelecionados, feriadosLab, currentLab?.prazo_medio_dias ?? 0)
    setForm(prev => (
      prev.data_entrega_prometida === prazoCalculado
        ? prev
        : { ...prev, data_entrega_prometida: prazoCalculado }
    ))
  }, [currentLab?.prazo_medio_dias, feriadosLab, form.data_envio, servicosSelecionados, usarPrazoAutomatico])

  const handlePrazoPrometidoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsarPrazoAutomatico(false)
    setForm(prev => ({ ...prev, data_entrega_prometida: e.target.value }))
  }

  const togglePreco = (p: LabPreco) => {
    const key = `preco:${p.id}`
    setServicosSelecionados(prev => (
      prev.some(servico => servico.key === key)
        ? prev.filter(servico => servico.key !== key)
        : [...prev, {
          key,
          nome: p.nome_servico,
          preco: p.preco,
          quantidade: 1,
          origem: 'catalogo',
          prazo_entrega: form.data_entrega_prometida,
          prazo_producao_dias: p.prazo_producao_dias ?? null,
          concluido: false,
          data_conclusao: '',
        }]
    ))
    setError('')
  }

  const updateServico = (key: string, field: keyof ServicoSelecionado, value: string | boolean | number | null) => {
    setServicosSelecionados(prev => prev.map(servico => {
      if (servico.key !== key) return servico
      const next = { ...servico, [field]: value }
      if (field === 'concluido' && !value) {
        next.data_conclusao = ''
      }
      if (field === 'data_conclusao' && typeof value === 'string' && value) {
        next.concluido = true
      }
      return next
    }))
  }

  const removeServico = (key: string) => {
    setServicosSelecionados(prev => prev.filter(servico => servico.key !== key))
    setError('')
  }

  const nextStep = () => {
    if (step === 1) {
      if (!currentLab) {
        setError('Selecione o laboratório.'); return
      }
      if (servicosSelecionados.length === 0) {
        setError('Selecione ao menos um serviço.'); return
      }
    }
    if (step === 2 && !form.paciente_nome.trim()) {
      setError('Informe o nome do paciente.'); return
    }
    setError(''); setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    const trabalho = form.tipo_trabalho

    if (!trabalho.trim()) { setError('Informe o tipo de trabalho.'); return }

    const precoNormalizado = form.preco_servico.trim().replace(',', '.')
    const precoConvertido = precoNormalizado === '' ? null : Number(precoNormalizado)

    if (!currentLab) { setError('Selecione o laboratório.'); return }
    setSaving(true); setError('')

    const payload = {
      lab_id:                      currentLab.id,
      empresa_id:                  empresaId,
      user_id:                     userId,
      tipo_trabalho:               trabalho.trim(),
      preco_servico:               Number.isFinite(precoConvertido) ? precoConvertido : null,
      classificacao_protese:       form.classificacao_protese || null,
      paciente_nome:               form.paciente_nome.trim(),
      dentista_nome:               form.dentista_nome.trim() || null,
      dentes:                      form.dentes.trim() || null,
      cor:                         form.cor || null,
      observacoes:                 form.observacoes.trim() || null,
      status:                      envio?.status ?? colunas[0]?.nome ?? DEFAULT_ENVIO_STATUS,
      data_envio:                  form.data_envio || today(),
      data_entrega_prometida:      form.data_entrega_prometida || null,
      data_consulta:               form.data_consulta || null,
      forma_envio:                 form.forma_envio || null,
      retirado_por:                form.retirado_por.trim() || null,
      data_recebimento:            form.data_recebimento || null,
      forma_recebimento:           form.forma_recebimento || null,
      retirado_por_recebimento:    form.retirado_por_recebimento.trim() || null,
      conferencia_ok:              form.conferencia_ok,
      anotacao_recebimento:        form.anotacao_recebimento.trim() || null,
      desconto:                    form.desconto ? parseMaskedCurrency(form.desconto) : null,
      data_pagamento:              form.data_pagamento || null,
      observacao_financeira:       form.observacao_financeira.trim() || null,
      urgente:                     form.urgente,
      etapas:                      servicosSelecionados.map(servico => ({
        id: servico.key,
        nome: servico.nome.trim(),
        preco: servico.preco,
        quantidade: servico.quantidade,
        origem: servico.origem,
        prazo_entrega: servico.prazo_entrega || null,
        prazo_producao_dias: servico.prazo_producao_dias,
        concluido: servico.concluido,
        data_conclusao: servico.data_conclusao || null,
      })),
      pago:                        form.data_pagamento ? true : envio?.pago ?? false,
    }

    if (envio) {
      const changedFields: string[] = []
      const fieldsToCheck: (keyof typeof payload)[] = ['paciente_nome', 'dentista_nome', 'tipo_trabalho', 'classificacao_protese', 'preco_servico', 'dentes', 'cor', 'observacoes', 'data_envio', 'data_entrega_prometida', 'data_consulta', 'forma_envio', 'retirado_por', 'data_recebimento', 'forma_recebimento', 'urgente', 'desconto', 'data_pagamento', 'observacao_financeira']
      for (const f of fieldsToCheck) {
        if (String(payload[f] ?? '') !== String((envio as Record<string, unknown>)[f] ?? '')) changedFields.push(f)
      }
      const { error: err } = await supabase.from('lab_envios')
        .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', envio.id)
      if (err) { setError(err.message); setSaving(false); return }
      if (changedFields.length > 0) {
        await registrarHistorico(envio.id, empresaId, userId, 'Envio editado', `Campos: ${changedFields.join(', ')}`)
      }
    } else {
      const { data: inserted, error: err } = await supabase.from('lab_envios').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      if (inserted) {
        await registrarHistorico(inserted.id, empresaId, userId, 'Envio criado')
      }
    }
    onSaved(); onClose()
  }

  const steps = [
    { title: 'Tipo de Trabalho', description: 'Escolha laboratório e serviços' },
    { title: 'Dados do Caso', description: 'Paciente, dentista e detalhes' },
    { title: 'Envio', description: 'Datas, retirada e prioridade' },
    { title: 'Retorno', description: 'Recebimento e conferência' },
    { title: 'Financeiro', description: 'Valor, desconto e pagamento' },
    { title: 'Revisão', description: 'Confira antes de salvar' },
  ]
  const TOTAL_STEPS = steps.length
  const displayTrabalho = form.tipo_trabalho

  return (
    <Modal title={envio ? 'Editar Envio' : `Novo Envio${currentLab ? ` — ${currentLab.nome}` : ''}`} onClose={onClose} wide>
      {/* Step indicator */}
      <div className={styles.stepIndicator}>
        {steps.map((stepInfo, i) => (
          <div key={stepInfo.title} className={`${styles.stepItem} ${i + 1 === step ? styles.stepActive : ''} ${i + 1 < step ? styles.stepDone : ''}`}>
            <div className={styles.stepDot}>{i + 1 < step ? '✓' : i + 1}</div>
            <span className={styles.stepText}>
              <span className={styles.stepLabel}>{stepInfo.title}</span>
              <span className={styles.stepDescription}>{stepInfo.description}</span>
            </span>
          </div>
        ))}
      </div>

      {/* ── Step 1: Tipo de trabalho ── */}
      {step === 1 && (
        <div className={styles.stepContent}>
          {shouldSelectLab && (
            <div className={styles.formField} style={{ marginBottom: 16 }}>
              <label className={styles.label}>Laboratório</label>
              <select
                className={styles.select}
                value={selectedLabId}
                onChange={e => {
                  setSelectedLabId(e.target.value)
                  setServicosSelecionados([])
                }}
              >
                <option value="">Selecione o laboratório</option>
                {availableLabs.map(item => (
                  <option key={item.id} value={item.id}>{item.nome}</option>
                ))}
              </select>
            </div>
          )}
          {!currentLab && (
            <div className={styles.summaryAlert}>
              <IconAlert /> Selecione o laboratório para carregar a lista de serviços e continuar o envio.
            </div>
          )}
          {currentLab && currentPrecos.length === 0 && (
            <div className={styles.summaryAlert}>
              <IconAlert /> Este laboratório não tem produto ou serviço cadastrado na lista de preços.
            </div>
          )}
          <div className={styles.priceSelectionPanel}>
            <div className={styles.priceSelectionHeader}>
              <div>
                <strong>Lista de preços</strong>
                <span>Selecione um ou mais serviços cadastrados.</span>
              </div>
              <div className={styles.priceSelectionSummary}>
                <span>{servicosSelecionados.length} selecionado(s)</span>
                <strong>{(form.preco_servico.trim() === '' ? 0 : Number(form.preco_servico)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
              </div>
            </div>

            {!currentLab ? (
              <p className={styles.priceSelectionEmpty}>
                Escolha um laboratório para visualizar os serviços disponíveis.
              </p>
            ) : currentPrecos.length > 0 ? (
              <div className={styles.precosGrid}>
                {currentPrecos.map(p => {
                  const selected = servicosSelecionados.some(servico => servico.key === `preco:${p.id}`)

                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.precoOption} ${selected ? styles.precoOptionActive : ''}`}
                      onClick={() => togglePreco(p)}
                    >
                      <span className={styles.precoOptionCheck}>{selected ? '✓' : '+'}</span>
                      <span className={styles.precoOptionMeta}>
                        <span className={styles.precoOptionNome}>{p.nome_servico}</span>
                        {p.prazo_producao_dias != null && p.prazo_producao_dias > 0 && (
                          <span className={styles.precoOptionPrazo}>{p.prazo_producao_dias} dias úteis</span>
                        )}
                      </span>
                      <span className={styles.precoOptionValor}>
                        {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className={styles.priceSelectionEmpty}>
                Cadastre os serviços na lista de preços do laboratório antes de criar o envio.
              </p>
            )}

            {servicosSelecionados.length > 0 && (
              <div className={styles.selectedServicesList}>
                {servicosSelecionados.map(servico => (
                  <div key={servico.key} className={styles.selectedServiceItem}>
                    <div className={styles.selectedServiceMeta}>
                      <span className={styles.selectedServiceName}>{servico.nome}</span>
                      <span className={styles.selectedServicePrice}>
                        {servico.preco != null
                          ? (servico.preco * servico.quantidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : 'Sem valor'}
                      </span>
                    </div>
                    <div className={styles.qtdControls}>
                      <button type="button" className={styles.qtdBtn} onClick={() => updateServico(servico.key, 'quantidade', Math.max(1, servico.quantidade - 1))} disabled={servico.quantidade <= 1}>−</button>
                      <span className={styles.qtdValue}>{servico.quantidade}</span>
                      <button type="button" className={styles.qtdBtn} onClick={() => updateServico(servico.key, 'quantidade', servico.quantidade + 1)}>+</button>
                    </div>
                    <button type="button" className={`${styles.btnIcon} ${styles.btnIconDanger}`} onClick={() => removeServico(servico.key)} title="Remover serviço">
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/*
                        <div className={styles.formField}>
                          <label className={styles.label}>Data de conclusÃ£o</label>
                          <input className={styles.input} type="date" value={servico.data_conclusao} onChange={e => updateServico(servico.key, 'data_conclusao', e.target.value)} />
                        </div>
                      </div>
                      <label className={styles.checkRow}>
                        <input type="checkbox" checked={servico.concluido} onChange={e => updateServico(servico.key, 'concluido', e.target.checked)} />
                        <span>{servico.concluido ? 'Etapa pronta' : 'Marcar etapa como pronta'}</span>
                      </label>
                      {etapaAtrasada && <span className={styles.etapaAlert}>Etapa atrasada</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          */}
        </div>
      )}

      {/* ── Step 2: Dados do caso ── */}
      {step === 2 && (
        <div className={styles.stepContent}>
          <div className={styles.formGrid2}>
            <div className={styles.formField}>
              <label className={styles.label}>Nome do paciente *</label>
              <input className={styles.input} value={form.paciente_nome} onChange={set('paciente_nome')} placeholder="Nome completo" />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Dentista</label>
              {addingDentista ? (
                <div className={styles.inlineAddRow}>
                  <input
                    className={styles.input}
                    value={novoDentistaName}
                    onChange={e => setNovoDentistaName(e.target.value)}
                    placeholder="Nome do dentista"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') void handleSaveDentista() }}
                  />
                  <button type="button" className={styles.btnPrimary} onClick={() => void handleSaveDentista()} disabled={savingDentista || !novoDentistaName.trim()}>
                    {savingDentista ? '…' : 'Salvar'}
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={() => { setAddingDentista(false); setNovoDentistaName('') }}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <select
                  className={styles.select}
                  value={form.dentista_nome}
                  onChange={e => {
                    if (e.target.value === '__new__') { setAddingDentista(true) }
                    else { setForm(p => ({ ...p, dentista_nome: e.target.value })) }
                  }}
                >
                  <option value="">Selecione um dentista</option>
                  {dentistas.map(d => <option key={d.id} value={d.nome}>{d.nome}</option>)}
                  <option value="__new__">+ Cadastrar novo dentista</option>
                </select>
              )}
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Classificação da prótese</label>
              <select className={styles.select} value={form.classificacao_protese} onChange={set('classificacao_protese')}>
                <option value="">Não especificado</option>
                {CLASSIFICACAO_PROTESE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Dentes</label>
              <input className={styles.input} value={form.dentes} onChange={set('dentes')} placeholder="Ex: 11, 12, 21" />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Cor / Shade</label>
              <select className={styles.select} value={form.cor} onChange={set('cor')}>
                <option value="">Não especificado</option>
                {SHADE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>Observações</label>
              <textarea className={styles.textarea} value={form.observacoes} onChange={set('observacoes')} rows={3} placeholder="Instruções especiais, referências de cor..." />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Envio / Datas ── */}
      {step === 3 && (
        <div className={styles.stepContent}>
          <div className={styles.formGrid2}>
            <div className={styles.formField}>
              <label className={styles.label}>Data de envio</label>
              <input className={styles.input} type="date" value={form.data_envio} onChange={set('data_envio')} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Prazo de entrega prometido</label>
              <input className={styles.input} type="date" value={form.data_entrega_prometida} onChange={handlePrazoPrometidoChange} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Data da consulta</label>
              <input className={styles.input} type="date" value={form.data_consulta} onChange={set('data_consulta')} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Forma de envio</label>
              {addingFormaEnvio ? (
                <div className={styles.inlineAddRow}>
                  <input
                    className={styles.input}
                    value={novaFormaEnvioName}
                    onChange={e => setNovaFormaEnvioName(e.target.value)}
                    placeholder="Nome da forma de envio"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') void handleSaveFormaEnvio() }}
                  />
                  <button type="button" className={styles.btnPrimary} onClick={() => void handleSaveFormaEnvio()} disabled={savingFormaEnvio || !novaFormaEnvioName.trim()}>
                    {savingFormaEnvio ? '…' : 'Salvar'}
                  </button>
                  <button type="button" className={styles.btnSecondary} onClick={() => { setAddingFormaEnvio(false); setNovaFormaEnvioName('') }}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <select
                  className={styles.select}
                  value={form.forma_envio}
                  onChange={e => {
                    if (e.target.value === '__new__') { setAddingFormaEnvio(true) }
                    else { setForm(p => ({ ...p, forma_envio: e.target.value })) }
                  }}
                >
                  <option value="">Não informado</option>
                  {formasEnvioOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  <option value="__new__">+ Cadastrar nova forma de envio</option>
                </select>
              )}
            </div>
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>
                Retirado por
                <span className={styles.fieldHelpWrap}>
                  <span className={styles.fieldHelpIcon}>?</span>
                  <span className={styles.fieldHelpTooltip}>
                    Esse campo será o nome do responsável pela retirada do trabalho na clínica e pode ser adicionado posteriormente.
                  </span>
                </span>
              </label>
              <input className={styles.input} value={form.retirado_por} onChange={set('retirado_por')} placeholder="Nome de quem retirou" />
            </div>
          </div>
          {!!(form.data_entrega_prometida && form.data_consulta && form.data_entrega_prometida > form.data_consulta) && (
            <div className={styles.summaryAlert}>
              ⚠️ O prazo de entrega prometido ultrapassa a data da consulta.
            </div>
          )}
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.urgente}
              onChange={e => setForm(prev => ({ ...prev, urgente: e.target.checked }))}
            />
            <span>{form.urgente ? 'Marcado como urgente' : 'Marcar este envio como urgente'}</span>
          </label>
          {currentLab && currentLab.prazo_medio_dias > 0 && (
            <p className={styles.stepHint} style={{ marginTop: 12 }}>
              Prazo médio deste laboratório: <strong>{currentLab.prazo_medio_dias} dias úteis</strong>. {usarPrazoAutomatico ? 'A data prometida foi calculada automaticamente.' : 'A data prometida foi ajustada manualmente.'}
            </p>
          )}
          {servicosSelecionados.length > 0 && (
            <div className={styles.etapasBox}>
              <div className={styles.manualServiceHeader}>
                <span>Etapas do trabalho</span>
                <span>{servicosSelecionados.length} etapa(s)</span>
              </div>
              <div className={styles.etapasList}>
                {servicosSelecionados.map(servico => {
                  const etapaAtrasada = !servico.concluido && Boolean(servico.prazo_entrega) && servico.prazo_entrega < today()
                  return (
                    <div key={servico.key} className={`${styles.etapaCard} ${etapaAtrasada ? styles.etapaCardOverdue : ''}`}>
                      <div className={styles.etapaHeader}>
                        <strong>{servico.nome}</strong>
                        <span>{servico.preco != null ? servico.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Sem valor'}</span>
                      </div>
                      <div className={styles.formGrid2}>
                        <div className={styles.formField}>
                          <label className={styles.label}>Prazo da etapa</label>
                          <input className={styles.input} type="date" value={servico.prazo_entrega} onChange={e => updateServico(servico.key, 'prazo_entrega', e.target.value)} />
                        </div>
                        <div className={styles.formField}>
                          <label className={styles.label}>Data de conclusão</label>
                          <input className={styles.input} type="date" value={servico.data_conclusao} onChange={e => updateServico(servico.key, 'data_conclusao', e.target.value)} />
                        </div>
                      </div>
                      <label className={styles.checkRow}>
                        <input type="checkbox" checked={servico.concluido} onChange={e => updateServico(servico.key, 'concluido', e.target.checked)} />
                        <span>{servico.concluido ? 'Etapa pronta' : 'Marcar etapa como pronta'}</span>
                      </label>
                      {etapaAtrasada && <span className={styles.etapaAlert}>Etapa atrasada</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Retorno ── */}
      {step === 4 && (
        <div className={styles.stepContent}>
          <div className={styles.formGrid2}>
            <div className={styles.formField}>
              <label className={styles.label}>Data de recebimento</label>
              <input className={styles.input} type="date" value={form.data_recebimento} onChange={set('data_recebimento')} />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Forma de recebimento</label>
              <select className={styles.select} value={form.forma_recebimento} onChange={set('forma_recebimento')}>
                <option value="">Não informado</option>
                {FORMA_RECEBIMENTO_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>Retirado por (recebimento)</label>
              <input className={styles.input} value={form.retirado_por_recebimento} onChange={set('retirado_por_recebimento')} placeholder="Nome de quem retirou/recebeu" />
            </div>
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>Anotação do recebimento</label>
              <textarea className={styles.textarea} value={form.anotacao_recebimento} onChange={set('anotacao_recebimento')} rows={3} placeholder="Observações sobre o recebimento..." />
            </div>
          </div>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.conferencia_ok}
              onChange={e => setForm(prev => ({ ...prev, conferencia_ok: e.target.checked }))}
            />
            <span>{form.conferencia_ok ? 'Conferência realizada ✓' : 'Marcar conferência como realizada'}</span>
          </label>
        </div>
      )}

      {/* ── Step 5: Financeiro ── */}
      {step === 5 && (
        <div className={styles.stepContent}>
          <div className={styles.formGrid2}>
            <div className={styles.formField}>
              <label className={styles.label}>Valor acordado com laboratório</label>
              <input
                className={styles.input}
                value={form.preco_servico !== '' ? parseFloat(form.preco_servico.replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}
                readOnly
                disabled
                placeholder="Calculado pelos serviços"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Desconto opcional</label>
              <input
                className={styles.input}
                value={form.desconto}
                onChange={e => setForm(prev => ({ ...prev, desconto: formatCurrencyMask(e.target.value) }))}
                placeholder="R$ 0,00"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.label}>Data de pagamento</label>
              <input className={styles.input} type="date" value={form.data_pagamento} onChange={set('data_pagamento')} />
            </div>
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>Observação financeira</label>
              <textarea className={styles.textarea} value={form.observacao_financeira} onChange={set('observacao_financeira')} rows={3} placeholder="Notas sobre pagamento, negociação..." />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 6: Revisão ── */}
      {step === 6 && (
        <div className={styles.stepContent}>
          <div className={styles.reviewGrid}>
            <ReviewRow label="Laboratório"    value={currentLab?.nome ?? 'Não selecionado'} />
            <ReviewRow label="Tipo de trabalho" value={displayTrabalho || form.tipo_trabalho} />
            <ReviewRow label="Urgência" value={form.urgente ? 'Urgente' : 'Normal'} />
            {form.classificacao_protese && <ReviewRow label="Classificação" value={form.classificacao_protese} />}
            {form.preco_servico && (
              <ReviewRow label="Valor" value={parseFloat(form.preco_servico.replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            )}
            {form.desconto && <ReviewRow label="Desconto" value={form.desconto} />}
            {form.data_pagamento && <ReviewRow label="Data de pagamento" value={formatDate(form.data_pagamento)} />}
            <ReviewRow label="Paciente"    value={form.paciente_nome} />
            {form.dentista_nome && <ReviewRow label="Dentista" value={form.dentista_nome} />}
            {form.dentes    && <ReviewRow label="Dentes"  value={form.dentes} />}
            {form.cor       && <ReviewRow label="Cor"     value={form.cor} />}
            {form.observacoes && <ReviewRow label="Observações" value={form.observacoes} />}
            <ReviewRow label="Data de envio"  value={formatDate(form.data_envio)} />
            <ReviewRow label="Prazo prometido" value={formatDate(form.data_entrega_prometida || null)} />
            {form.data_consulta && <ReviewRow label="Data da consulta" value={formatDate(form.data_consulta)} />}
            {form.forma_envio && <ReviewRow label="Forma de envio" value={form.forma_envio} />}
            {form.retirado_por && <ReviewRow label="Retirado por" value={form.retirado_por} />}
            {form.data_recebimento && <ReviewRow label="Data de recebimento" value={formatDate(form.data_recebimento)} />}
            {form.forma_recebimento && <ReviewRow label="Forma de recebimento" value={form.forma_recebimento} />}
            {form.conferencia_ok && <ReviewRow label="Conferência" value="Realizada" />}
          </div>
          {!!(form.data_entrega_prometida && form.data_consulta && form.data_entrega_prometida > form.data_consulta) && (
            <div className={styles.summaryAlert}>
              ⚠️ O prazo de entrega prometido ultrapassa a data da consulta.
            </div>
          )}
        </div>
      )}

      {error && <p className={styles.errorMsg}>{error}</p>}

      <div className={styles.formActions}>
        {step > 1 && (
          <button type="button" className={styles.btnSecondary} onClick={() => { setError(''); setStep(s => s - 1) }}>Voltar</button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
        {step < TOTAL_STEPS ? (
          <button type="button" className={styles.btnPrimary} onClick={nextStep}>Próximo</button>
        ) : (
          <button type="button" className={styles.btnPrimary} onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Salvando...' : envio ? 'Salvar alterações' : 'Confirmar envio'}
          </button>
        )}
      </div>
    </Modal>
  )
}
