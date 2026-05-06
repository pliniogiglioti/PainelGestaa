import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Lab, LabEnvio, LabKanbanColuna, LabPreco, LabDentista } from '../../lib/types'
import ModalTransition from '../ModalTransition'
import { useSessionStorageState } from '../../hooks/useSessionStorageState'
import styles from '../../pages/LabControlPage.module.css'
import { DENTISTA_FILTER_ALL, HOME_MODE_OPTIONS, LAB_FILTER_ALL, isLabDetailTab, isString, type LabHomeMode } from './constants'
import { IconAlert, IconArchive, IconBack, IconCalendar, IconClock, IconEdit, IconList, IconMail, IconPhone, IconPlus, IconSettings2, IconTrash } from './icons'
import { ArquivadosModal, DentistasModal, FormasEnvioModal, KanbanConfigModal, LabModal, PrecosModal } from './LabModals'
import { CalendarView } from './CalendarView'
import { EnvioResumoModal } from './EnvioResumoModal'
import { EnvioSteps } from './EnvioSteps'
import { KanbanBoard } from './KanbanBoard'
import { ServicesListView } from './ServicesListView'
import { InfoRow, OverviewMenu, Spinner } from './shared'
import type { LabEtapa } from './utils'
import { applyEtapaChanges, formatDate, formatWhatsAppNumber, getEnvioDataEntregaRealFromEtapas, getEnvioEtapas, getLabFeriados, isOverdue, registrarHistorico, serializeLabEtapas, sortEnviosByCreatedAt, today } from './utils'

export function LabDetailView({ lab, empresaId, userId, isAdmin, colunas, onBack, onLabUpdated, onColunasUpdated }: {
  lab: Lab; empresaId: string; userId: string; isAdmin: boolean
  colunas: LabKanbanColuna[]
  onBack: () => void; onLabUpdated: () => void; onColunasUpdated: () => void
}) {
  const storagePrefix = `lab-control:${empresaId}:lab:${lab.id}`
  const [envios,          setEnvios]          = useState<LabEnvio[]>([])
  const [precos,          setPrecos]          = useState<LabPreco[]>([])
  const [loading,         setLoading]         = useState(true)
  const [activeTab, setActiveTab] = useSessionStorageState<'kanban' | 'info'>(
    `${storagePrefix}:active-tab`,
    'kanban',
    isLabDetailTab,
  )
  const [showEnvioSteps,    setShowEnvioSteps]    = useState(false)
  const [editingEnvio,      setEditingEnvio]      = useState<LabEnvio | null>(null)
  const [resumoEnvio,       setResumoEnvio]       = useState<LabEnvio | null>(null)
  const [showEditLab,       setShowEditLab]       = useState(false)
  const [showPrecos,        setShowPrecos]        = useState(false)
  const [showKanbanCfg,     setShowKanbanCfg]     = useState(false)
  const [showArquivados,    setShowArquivados]    = useState(false)
  const [editingPrecoId,    setEditingPrecoId]    = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useSessionStorageState(
    `${storagePrefix}:patient-search`,
    '',
    isString,
  )
  const [novoFeriado,     setNovoFeriado]     = useState('')

  const fetchEnvios = useCallback(async () => {
    const { data } = await supabase
      .from('lab_envios').select('*')
      .eq('lab_id', lab.id)
      .is('arquivado_em', null)
      .order('created_at', { ascending: false })
    if (data) setEnvios(data)
    setLoading(false)
  }, [lab.id])

  const fetchPrecos = useCallback(async () => {
    const { data } = await supabase
      .from('lab_precos').select('*')
      .eq('lab_id', lab.id).eq('ativo', true).order('nome_servico')
    if (data) setPrecos(data)
  }, [lab.id])

  useEffect(() => {
    void fetchEnvios()
    void fetchPrecos()
  }, [fetchEnvios, fetchPrecos])

  const moveEnvio = async (envioId: string, status: string) => {
    const { error } = await supabase.from('lab_envios').update({ status, updated_at: new Date().toISOString() }).eq('id', envioId)
    if (error) return
    setEnvios(prev => prev.map(e => e.id === envioId ? { ...e, status } : e))
    const e = envios.find(x => x.id === envioId)
    if (e) await registrarHistorico(envioId, empresaId, userId, `Movido para ${status}`)
  }

  const deleteEnvio = async (envioId: string) => {
    const envio = envios.find(e => e.id === envioId)
    if (!envio) return
    if (isAdmin) {
      const choice = confirm('Arquivar este envio?\n\nClique em OK para arquivar.\nClique em Cancelar para outras opções.')
      if (choice) {
        const arquivado_em = new Date().toISOString()
        const { error } = await supabase.from('lab_envios').update({ arquivado_em, updated_at: new Date().toISOString() }).eq('id', envioId)
        if (error) return
        await registrarHistorico(envioId, empresaId, userId, 'Arquivado')
        setEnvios(prev => prev.filter(e => e.id !== envioId))
      }
    } else {
      if (!confirm('Arquivar este envio?')) return
      const arquivado_em = new Date().toISOString()
      const { error } = await supabase.from('lab_envios').update({ arquivado_em, updated_at: new Date().toISOString() }).eq('id', envioId)
      if (error) return
      await registrarHistorico(envioId, empresaId, userId, 'Arquivado')
      setEnvios(prev => prev.filter(e => e.id !== envioId))
    }
  }

  const togglePagoEnvio = async (envio: LabEnvio) => {
    const nextPago = !envio.pago
    const payload = {
      pago: nextPago,
      data_pagamento: nextPago ? today() : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('lab_envios').update(payload).eq('id', envio.id)
    if (error) return
    await registrarHistorico(envio.id, empresaId, userId, nextPago ? 'Pagamento registrado' : 'Pagamento removido')
    setEnvios(prev => prev.map(item => item.id === envio.id ? { ...item, ...payload } : item))
    setResumoEnvio(prev => prev?.id === envio.id ? { ...prev, ...payload } : prev)
  }

  const updateEnvioEtapa = async (
    envio: LabEnvio,
    etapaId: string,
    changes: Partial<Pick<LabEtapa, 'prazo_entrega' | 'concluido' | 'data_conclusao'>>,
  ) => {
    const etapas = getEnvioEtapas(envio).map(etapa =>
      etapa.id === etapaId ? applyEtapaChanges(etapa, changes) : etapa,
    )

    const payload = {
      etapas: serializeLabEtapas(etapas),
      data_entrega_real: getEnvioDataEntregaRealFromEtapas(etapas),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('lab_envios').update(payload).eq('id', envio.id)
    if (error) return

    setEnvios(prev => prev.map(item => item.id === envio.id ? { ...item, ...payload } : item))
    setResumoEnvio(prev => prev?.id === envio.id ? { ...prev, ...payload } : prev)
  }

  const updateLabField = async (payload: Partial<Lab>) => {
    const { error } = await supabase
      .from('labs')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', lab.id)
    if (error) return
    onLabUpdated()
  }

  const filteredEnvios = envios.filter(envio => {
    if (!envio.paciente_nome.toLowerCase().includes(patientSearch.toLowerCase())) return false
    return true
  })

  const overdueCount = envios.filter(isOverdue).length

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <IconBack /> Voltar
        </button>
        <div className={styles.labDetailTitle}>
          <h1 className={styles.pageTitle}>{lab.nome}</h1>
          {overdueCount > 0 && (
            <span className={styles.overdueBadge}>
              <IconAlert /> {overdueCount} atrasado{overdueCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          {isAdmin && (
            <>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowEditLab(true)}>
                <IconEdit /> Editar lab
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowPrecos(true)}>
                Lista de preços
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowKanbanCfg(true)}>
                <IconSettings2 /> Kanban
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowArquivados(true)}>
                <IconArchive /> Arquivados
              </button>
            </>
          )}
          <button type="button" className={styles.btnPrimary} onClick={() => { setEditingEnvio(null); setShowEnvioSteps(true) }}>
            <IconPlus /> Novo envio
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'kanban' ? styles.tabActive : ''}`} onClick={() => setActiveTab('kanban')}>
          Kanban ({envios.length})
        </button>
        <button className={`${styles.tab} ${activeTab === 'info' ? styles.tabActive : ''}`} onClick={() => setActiveTab('info')}>
          Informações
        </button>
      </div>

      {/* Kanban tab */}
      {activeTab === 'kanban' && (
        loading ? <Spinner /> : (
          <>
            <div className={styles.searchRow}>
              <input
                className={styles.input}
                value={patientSearch}
                onChange={e => setPatientSearch(e.target.value)}
                placeholder="Buscar paciente no kanban"
              />
            </div>
            <KanbanBoard
              envios={filteredEnvios}
              colunas={colunas}
              isAdmin={isAdmin}
              getLabFeriados={() => getLabFeriados(lab)}
              precosByLab={{ [lab.id]: precos }}
              onMoveEnvio={moveEnvio}
              onOpenResumo={setResumoEnvio}
              onEditEnvio={e => { setEditingEnvio(e); setShowEnvioSteps(true) }}
              onDeleteEnvio={deleteEnvio}
            />
          </>
        )
      )}

      {/* Info tab */}
      {activeTab === 'info' && (
        <div className={styles.labInfoGrid}>
          <div className={styles.labInfoCard}>
            <h3 className={styles.infoSectionTitle}>Dados do laboratório</h3>
            {lab.cnpj     && <InfoRow label="CNPJ"      value={lab.cnpj} />}
            {lab.telefone && <InfoRow label="WhatsApp"   icon={<IconPhone />} value={formatWhatsAppNumber(lab.telefone)} />}
            {lab.email    && <InfoRow label="E-mail"     icon={<IconMail />}  value={lab.email} />}
            {lab.endereco && <InfoRow label="Endereço"   value={lab.endereco} />}
            <InfoRow label="Prazo médio" icon={<IconClock />} value={`${lab.prazo_medio_dias} dias`} />
            {lab.dia_fechamento && <InfoRow label="Fechamento" value={`Dia ${lab.dia_fechamento}`} />}
            {lab.observacoes && <InfoRow label="Observações" value={lab.observacoes} />}
          </div>
          <div className={styles.labInfoCard}>
            <div className={styles.labInfoCardHeader}>
              <h3 className={styles.infoSectionTitle}>Feriados do laboratório</h3>
            </div>
            {isAdmin && (
              <div className={styles.formGrid2}>
                <div className={styles.formField}>
                  <label className={styles.label}>Cadastrar feriado</label>
                  <input className={styles.input} type="date" value={novoFeriado} onChange={e => setNovoFeriado(e.target.value)} />
                </div>
                <div className={styles.formField} style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => {
                      if (!novoFeriado) return
                      const feriados = Array.from(new Set([...getLabFeriados(lab), novoFeriado])).sort()
                      void updateLabField({ feriados })
                      setNovoFeriado('')
                    }}
                  >
                    <IconPlus /> Adicionar feriado
                  </button>
                </div>
              </div>
            )}
            <div className={styles.financialList}>
              {getLabFeriados(lab).length === 0 && <p className={styles.emptyMsg}>Nenhum feriado cadastrado.</p>}
              {getLabFeriados(lab).map(feriado => (
                <div key={feriado} className={styles.financialRow}>
                  <div className={styles.financialMeta}>
                    <strong>{formatDate(feriado)}</strong>
                    <span>Dia não contabilizado no prazo útil</span>
                  </div>
                  {isAdmin && (
                    <div className={styles.financialActions}>
                      <button
                        type="button"
                        className={`${styles.btnIcon} ${styles.btnIconDanger}`}
                        onClick={() => {
                          const feriados = getLabFeriados(lab).filter(item => item !== feriado)
                          void updateLabField({ feriados })
                        }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className={styles.labInfoCard}>
            <div className={styles.labInfoCardHeader}>
              <h3 className={styles.infoSectionTitle}>Lista de preços</h3>
              {isAdmin && (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    setEditingPrecoId(null)
                    setShowPrecos(true)
                  }}
                >
                  Gerenciar
                </button>
              )}
            </div>
            {precos.length === 0 ? (
              <p className={styles.emptyMsg}>
                Nenhum serviço cadastrado.
                {isAdmin && ' Clique em "Gerenciar" para adicionar.'}
              </p>
            ) : (
              <div className={styles.precosList}>
                {precos.map(p => (
                  <div key={p.id} className={styles.precosRow}>
                    <span className={styles.precosNome}>{p.nome_servico}</span>
                    <span className={styles.precosValor}>
                      {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    {isAdmin && (
                      <button
                        type="button"
                        className={styles.btnIcon}
                        onClick={() => {
                          setEditingPrecoId(p.id)
                          setShowPrecos(true)
                        }}
                        title="Editar preço"
                      >
                        <IconEdit />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showEnvioSteps && (
        <EnvioSteps
          lab={lab} precos={precos} empresaId={empresaId} userId={userId}
          envio={editingEnvio} colunas={colunas}
          onClose={() => setShowEnvioSteps(false)} onSaved={fetchEnvios}
        />
      )}
      <ModalTransition open={showEditLab}>
        <LabModal lab={lab} empresaId={empresaId}
          onClose={() => setShowEditLab(false)} onSaved={onLabUpdated} />
      </ModalTransition>
      <ModalTransition open={showPrecos}>
        <PrecosModal lab={lab}
          initialEditingId={editingPrecoId}
          onClose={() => { setShowPrecos(false); setEditingPrecoId(null) }}
          onSaved={fetchPrecos}
        />
      </ModalTransition>
      <ModalTransition open={showKanbanCfg}>
        <KanbanConfigModal empresaId={empresaId} colunas={colunas}
          onClose={() => setShowKanbanCfg(false)} onSaved={onColunasUpdated} />
      </ModalTransition>
      <ModalTransition open={showArquivados}>
        <ArquivadosModal empresaId={empresaId} userId={userId} labId={lab.id} onClose={() => setShowArquivados(false)} onRestored={() => void fetchEnvios()} />
      </ModalTransition>
      <ModalTransition open={!!resumoEnvio}>
        {resumoEnvio && (
          <EnvioResumoModal
            envio={resumoEnvio}
            labNome={lab.nome}
            labTelefone={lab.telefone}
            isAdmin={isAdmin}
            empresaId={empresaId}
            userId={userId}
            feriados={getLabFeriados(lab)}
            precosByLab={{ [lab.id]: precos }}
            onClose={() => setResumoEnvio(null)}
            onEdit={() => {
              setEditingEnvio(resumoEnvio)
              setResumoEnvio(null)
              setShowEnvioSteps(true)
            }}
            onTogglePago={togglePagoEnvio}
            onUpdateEtapa={updateEnvioEtapa}
          />
        )}
      </ModalTransition>
    </div>
  )
}

export function LabsAggregateDetailView({
  labs,
  empresaId,
  empresaNome,
  userId,
  isAdmin,
  colunas,
  onBack,
  onTrocarEmpresa,
  onColunasUpdated,
  homeMode,
  onHomeModeChange,
  onCreateLab,
  onOpenEditLabPicker,
  onOpenPrecosPicker,
}: {
  labs: Lab[]
  empresaId: string
  empresaNome: string
  userId: string
  isAdmin: boolean
  colunas: LabKanbanColuna[]
  onBack: () => void
  onTrocarEmpresa: () => void
  onColunasUpdated: () => void
  homeMode: LabHomeMode
  onHomeModeChange: (mode: LabHomeMode) => void
  onCreateLab: () => void
  onOpenEditLabPicker: () => void
  onOpenPrecosPicker: () => void
}) {
  const storagePrefix = `lab-control:${empresaId}:aggregate`
  const [envios,           setEnvios]           = useState<LabEnvio[]>([])
  const [precosByLab,      setPrecosByLab]      = useState<Record<string, LabPreco[]>>({})
  const [loading,          setLoading]          = useState(true)
  const [showEnvioSteps,   setShowEnvioSteps]   = useState(false)
  const [editingEnvio,     setEditingEnvio]     = useState<LabEnvio | null>(null)
  const [resumoEnvio,      setResumoEnvio]      = useState<LabEnvio | null>(null)
  const [showKanbanCfg,    setShowKanbanCfg]    = useState(false)
  const [showArquivados,   setShowArquivados]   = useState(false)
  const [showDentistas,    setShowDentistas]    = useState(false)
  const [showFormasEnvio,  setShowFormasEnvio]  = useState(false)
  const [dentistas,        setDentistas]        = useState<LabDentista[]>([])
  const [patientSearch, setPatientSearch] = useSessionStorageState(
    `${storagePrefix}:patient-search`,
    '',
    isString,
  )
  const [labFilterId, setLabFilterId] = useSessionStorageState(
    `${storagePrefix}:lab-filter`,
    LAB_FILTER_ALL,
    isString,
  )
  const [dentistaFilter, setDentistaFilter] = useSessionStorageState(
    `${storagePrefix}:dentista-filter`,
    DENTISTA_FILTER_ALL,
    isString,
  )

  const labsById = Object.fromEntries(labs.map(item => [item.id, item]))

  const fetchEnvios = useCallback(async () => {
    const { data } = await supabase
      .from('lab_envios')
      .select('*')
      .eq('empresa_id', empresaId)
      .is('arquivado_em', null)
      .order('created_at', { ascending: false })

    setEnvios(data ? sortEnviosByCreatedAt(data) : [])
  }, [empresaId])

  const fetchPrecos = useCallback(async () => {
    if (labs.length === 0) {
      setPrecosByLab({})
      return
    }

    const { data } = await supabase
      .from('lab_precos')
      .select('*')
      .in('lab_id', labs.map(item => item.id))
      .eq('ativo', true)
      .order('nome_servico')

    const nextMap: Record<string, LabPreco[]> = {}
    for (const preco of data ?? []) {
      if (!nextMap[preco.lab_id]) nextMap[preco.lab_id] = []
      nextMap[preco.lab_id].push(preco)
    }
    setPrecosByLab(nextMap)
  }, [labs])

  const fetchDentistas = useCallback(async () => {
    const { data } = await supabase.from('lab_dentistas').select('*').eq('empresa_id', empresaId).eq('ativo', true).order('nome')
    setDentistas(data ?? [])
  }, [empresaId])

  useEffect(() => {
    setLoading(true)
    void Promise.all([fetchEnvios(), fetchPrecos(), fetchDentistas()]).then(() => setLoading(false))
  }, [fetchEnvios, fetchPrecos, fetchDentistas])

  useEffect(() => {
    if (labFilterId === LAB_FILTER_ALL) return

    if (!labs.some(item => item.id === labFilterId)) {
      setLabFilterId(LAB_FILTER_ALL)
    }
  }, [labFilterId, labs, setLabFilterId])

  const moveEnvioAgg = async (envioId: string, status: string) => {
    const { error } = await supabase.from('lab_envios').update({ status, updated_at: new Date().toISOString() }).eq('id', envioId)
    if (error) return
    setEnvios(prev => prev.map(item => item.id === envioId ? { ...item, status } : item))
    await registrarHistorico(envioId, empresaId, userId, `Movido para ${status}`)
  }

  const deleteEnvioAgg = async (envioId: string) => {
    if (!confirm('Arquivar este envio?')) return
    const arquivado_em = new Date().toISOString()
    const { error } = await supabase.from('lab_envios').update({ arquivado_em, updated_at: new Date().toISOString() }).eq('id', envioId)
    if (error) return
    await registrarHistorico(envioId, empresaId, userId, 'Arquivado')
    setEnvios(prev => prev.filter(item => item.id !== envioId))
  }

  const togglePagoEnvio = async (envio: LabEnvio) => {
    const nextPago = !envio.pago
    const payload = {
      pago: nextPago,
      data_pagamento: nextPago ? today() : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('lab_envios').update(payload).eq('id', envio.id)
    if (error) return
    await registrarHistorico(envio.id, empresaId, userId, nextPago ? 'Pagamento registrado' : 'Pagamento removido')
    setEnvios(prev => prev.map(item => item.id === envio.id ? { ...item, ...payload } : item))
    setResumoEnvio(prev => prev?.id === envio.id ? { ...prev, ...payload } : prev)
  }

  const updateEnvioEtapa = async (
    envio: LabEnvio,
    etapaId: string,
    changes: Partial<Pick<LabEtapa, 'prazo_entrega' | 'concluido' | 'data_conclusao'>>,
  ) => {
    const etapas = getEnvioEtapas(envio).map(etapa =>
      etapa.id === etapaId ? applyEtapaChanges(etapa, changes) : etapa,
    )

    const payload = {
      etapas: serializeLabEtapas(etapas),
      data_entrega_real: getEnvioDataEntregaRealFromEtapas(etapas),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('lab_envios').update(payload).eq('id', envio.id)
    if (error) return

    setEnvios(prev => prev.map(item => item.id === envio.id ? { ...item, ...payload } : item))
    setResumoEnvio(prev => prev?.id === envio.id ? { ...prev, ...payload } : prev)
  }

  const visibleEnvios = envios.filter(envio => {
    if (!envio.paciente_nome.toLowerCase().includes(patientSearch.toLowerCase())) return false
    if (labFilterId !== LAB_FILTER_ALL && envio.lab_id !== labFilterId) return false
    if (dentistaFilter !== DENTISTA_FILTER_ALL && envio.dentista_nome !== dentistaFilter) return false
    return true
  })

  const aggregateLabCount = new Set(visibleEnvios.map(envio => envio.lab_id)).size
  const selectedHomeModeIndex = HOME_MODE_OPTIONS.findIndex(option => option.value === homeMode)

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.headerMainInfo}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            <IconBack /> Voltar
          </button>
          <button type="button" className={styles.btnSecondary} onClick={onTrocarEmpresa}>
            Trocar empresa
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Empresa: <strong style={{ color: 'var(--text)' }}>{empresaNome}</strong>
          </span>
        </div>
        <div className={styles.headerCenter}>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={labs.length === 0}
            onClick={() => {
              if (labs.length === 0) return
              setEditingEnvio(null)
              setShowEnvioSteps(true)
            }}
          >
            <IconPlus /> Novo envio
          </button>
          <div
            className={styles.viewModeSwitcher}
            style={{ ['--mode-index' as string]: String(selectedHomeModeIndex) }}
          >
            <span className={styles.viewModeIndicator} aria-hidden="true" />
            {HOME_MODE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`${styles.viewModeButton} ${homeMode === option.value ? styles.viewModeButtonActive : ''}`}
                onClick={() => onHomeModeChange(option.value)}
              >
                {option.icon === 'calendar' && <IconCalendar />}
                {option.icon === 'list' && <IconList />}
                {option.label}
              </button>
            ))}
          </div>
          <OverviewMenu
            labs={labs}
            envios={envios}
            colunas={colunas}
            isAdmin={isAdmin}
            getLabName={labId => labsById[labId]?.nome ?? 'Laboratório removido'}
            onCreateLab={onCreateLab}
            onOpenEditLabPicker={onOpenEditLabPicker}
            onOpenPrecosPicker={onOpenPrecosPicker}
            onOpenKanbanCfg={() => setShowKanbanCfg(true)}
            onOpenArquivados={() => setShowArquivados(true)}
            onOpenDentistas={() => setShowDentistas(true)}
            onOpenFormasEnvio={() => setShowFormasEnvio(true)}
          />
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className={styles.searchRow}>
            <input
              className={`${styles.input} ${styles.searchGrow}`}
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
              placeholder="Buscar"
            />
            <select
              className={`${styles.select} ${styles.searchSelect}`}
              value={labFilterId}
              onChange={e => setLabFilterId(e.target.value)}
            >
              <option value={LAB_FILTER_ALL}>Todos os laboratórios</option>
              {labs.map(item => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <select
              className={`${styles.select} ${styles.searchSelect}`}
              value={dentistaFilter}
              onChange={e => setDentistaFilter(e.target.value)}
            >
              <option value={DENTISTA_FILTER_ALL}>Todos os dentistas</option>
              {dentistas.map(d => (
                <option key={d.id} value={d.nome}>{d.nome}</option>
              ))}
            </select>
          </div>

          <div className={styles.aggregateFilterHint}>
            {[
              labFilterId !== LAB_FILTER_ALL && `Lab: ${labsById[labFilterId]?.nome ?? 'selecionado'}`,
              dentistaFilter !== DENTISTA_FILTER_ALL && `Dentista: ${dentistaFilter}`,
            ].filter(Boolean).join(' · ') || `Exibindo ${visibleEnvios.length} trabalhos distribuídos em ${aggregateLabCount} laboratório(s).`}
          </div>

          {homeMode === 'calendar' ? (
        <CalendarView
          envios={visibleEnvios}
          precosByLab={precosByLab}
          labs={labs}
          onClose={() => onHomeModeChange('kanban')}
        />
      ) : homeMode === 'list' ? (
        <ServicesListView
          envios={visibleEnvios}
          precosByLab={precosByLab}
          labs={labs}
          colunas={colunas}
          onMoveEnvio={moveEnvioAgg}
        />
      ) : (
        <KanbanBoard
          envios={visibleEnvios}
          colunas={colunas}
          isAdmin={isAdmin}
          showLabName
          getLabName={labId => labsById[labId]?.nome ?? 'Laboratório removido'}
          getLabFeriados={labId => labsById[labId] ? getLabFeriados(labsById[labId]) : []}
          precosByLab={precosByLab}
          onMoveEnvio={moveEnvioAgg}
          onOpenResumo={setResumoEnvio}
          onEditEnvio={envio => { setEditingEnvio(envio); setShowEnvioSteps(true) }}
          onDeleteEnvio={deleteEnvioAgg}
        />
      )}
        </>
      )}

      {showEnvioSteps && (
        <EnvioSteps
          lab={editingEnvio ? (labsById[editingEnvio.lab_id] ?? null) : null}
          labs={labs}
          precosByLab={precosByLab}
          empresaId={empresaId}
          userId={userId}
          envio={editingEnvio}
          colunas={colunas}
          onClose={() => {
            setShowEnvioSteps(false)
            setEditingEnvio(null)
          }}
          onSaved={async () => {
            await Promise.all([fetchEnvios(), fetchPrecos()])
          }}
        />
      )}
      <ModalTransition open={showKanbanCfg}>
        <KanbanConfigModal
          empresaId={empresaId}
          colunas={colunas}
          onClose={() => setShowKanbanCfg(false)}
          onSaved={onColunasUpdated}
        />
      </ModalTransition>
      <ModalTransition open={showArquivados}>
        <ArquivadosModal empresaId={empresaId} userId={userId} onClose={() => setShowArquivados(false)} onRestored={() => void fetchEnvios()} />
      </ModalTransition>
      <ModalTransition open={showDentistas}>
        {showDentistas && (
          <DentistasModal
            empresaId={empresaId}
            onClose={() => { setShowDentistas(false); void fetchDentistas() }}
          />
        )}
      </ModalTransition>
      <ModalTransition open={showFormasEnvio}>
        {showFormasEnvio && (
          <FormasEnvioModal
            empresaId={empresaId}
            onClose={() => setShowFormasEnvio(false)}
          />
        )}
      </ModalTransition>
      <ModalTransition open={!!resumoEnvio}>
        {resumoEnvio && (
          <EnvioResumoModal
            envio={resumoEnvio}
            labNome={labsById[resumoEnvio.lab_id]?.nome}
            labTelefone={labsById[resumoEnvio.lab_id]?.telefone}
            feriados={labsById[resumoEnvio.lab_id] ? getLabFeriados(labsById[resumoEnvio.lab_id]) : []}
            precosByLab={precosByLab}
            isAdmin={isAdmin}
            empresaId={empresaId}
            userId={userId}
            onClose={() => setResumoEnvio(null)}
            onEdit={() => {
              setEditingEnvio(resumoEnvio)
              setResumoEnvio(null)
              setShowEnvioSteps(true)
            }}
            onTogglePago={togglePagoEnvio}
            onUpdateEtapa={updateEnvioEtapa}
          />
        )}
      </ModalTransition>
    </div>
  )
}

// ── CalendarView ──────────────────────────────────────────────────────────
