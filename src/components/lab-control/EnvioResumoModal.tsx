import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { LabAnexo, LabEnvio, LabHistorico, LabPreco } from '../../lib/types'
import styles from '../../pages/LabControlPage.module.css'
import { IconAlert, IconDownload, IconTrash, IconUpload, IconWhatsApp } from './icons'
import { Modal, ReviewRow, Spinner } from './shared'
import type { LabEtapa } from './utils'
import { buildBriefingText, buildWhatsAppUrl, formatDate, getEnvioEtapas, getEnvioResumo, getEtapaDataPrevista, getOverdueEtapas, today } from './utils'

export function EnvioResumoModal({ envio, labNome, labTelefone, feriados, precosByLab, isAdmin, empresaId, userId, onClose, onEdit, onTogglePago, onUpdateEtapa }: {
  envio: LabEnvio
  labNome?: string
  labTelefone?: string | null
  feriados?: string[]
  precosByLab?: Record<string, LabPreco[]>
  isAdmin: boolean
  empresaId: string
  userId: string
  onClose: () => void
  onEdit: () => void
  onTogglePago: (envio: LabEnvio) => Promise<void>
  onUpdateEtapa: (
    envio: LabEnvio,
    etapaId: string,
    changes: Partial<Pick<LabEtapa, 'prazo_entrega' | 'concluido' | 'data_conclusao'>>,
  ) => Promise<void>
}) {
  const etapas = getEnvioEtapas(envio)
  const overdueEtapas = getOverdueEtapas(envio)
  const [savingEtapaId, setSavingEtapaId] = useState<string | null>(null)
  const [resumoTab, setResumoTab] = useState<'detalhes' | 'historico' | 'anexos'>('detalhes')

  // Histórico
  const [historico, setHistorico] = useState<LabHistorico[]>([])
  const [loadingHist, setLoadingHist] = useState(true)

  const fetchHistorico = useCallback(async () => {
    const { data } = await supabase.from('lab_historico').select('*').eq('envio_id', envio.id).order('created_at', { ascending: false })
    if (data) setHistorico(data)
    setLoadingHist(false)
  }, [envio.id])

  useEffect(() => { if (resumoTab === 'historico') void fetchHistorico() }, [resumoTab, fetchHistorico])

  // Anexos
  const [anexos, setAnexos] = useState<LabAnexo[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(true)
  const [uploadingAnexo, setUploadingAnexo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchAnexos = useCallback(async () => {
    const { data } = await supabase.from('lab_anexos').select('*').eq('envio_id', envio.id).order('created_at', { ascending: false })
    if (data) setAnexos(data)
    setLoadingAnexos(false)
  }, [envio.id])

  useEffect(() => { if (resumoTab === 'anexos') void fetchAnexos() }, [resumoTab, fetchAnexos])

  const handleUploadAnexo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAnexo(true)
    const path = `${empresaId}/${envio.id}/${Date.now()}_${file.name}`
    const { error: uploadErr } = await supabase.storage.from('lab-anexos').upload(path, file)
    if (!uploadErr) {
      await supabase.from('lab_anexos').insert({
        envio_id: envio.id,
        empresa_id: empresaId,
        user_id: userId,
        nome_arquivo: file.name,
        storage_path: path,
        tipo_mime: file.type || null,
        tamanho_bytes: file.size,
      })
      await fetchAnexos()
    }
    setUploadingAnexo(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadAnexo = async (anexo: LabAnexo) => {
    const { data } = await supabase.storage.from('lab-anexos').createSignedUrl(anexo.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const excluirAnexo = async (anexo: LabAnexo) => {
    if (!confirm(`Excluir "${anexo.nome_arquivo}"?`)) return
    await supabase.storage.from('lab-anexos').remove([anexo.storage_path])
    await supabase.from('lab_anexos').delete().eq('id', anexo.id)
    await fetchAnexos()
  }

  const handleEtapaUpdate = async (
    etapaId: string,
    changes: Partial<Pick<LabEtapa, 'prazo_entrega' | 'concluido' | 'data_conclusao'>>,
  ) => {
    setSavingEtapaId(etapaId)
    await onUpdateEtapa(envio, etapaId, changes)
    setSavingEtapaId(prev => prev === etapaId ? null : prev)
  }

  const whatsappUrl = labTelefone ? buildWhatsAppUrl(labTelefone) : null
  const briefingUrl = whatsappUrl
    ? `${whatsappUrl}?text=${encodeURIComponent(buildBriefingText(envio, labNome ?? ''))}`
    : null

  return (
      <Modal title={`Resumo do trabalho — ${envio.paciente_nome}`} onClose={onClose} wide>
      {/* Tabs */}
      <div className={styles.tabs} style={{ marginBottom: 16 }}>
        {(['detalhes', 'historico', 'anexos'] as const).map(tab => (
          <button key={tab} className={`${styles.tab} ${resumoTab === tab ? styles.tabActive : ''}`} onClick={() => setResumoTab(tab)}>
            {tab === 'detalhes' ? 'Detalhes' : tab === 'historico' ? 'Histórico' : 'Anexos'}
          </button>
        ))}
      </div>

      {/* Detalhes tab */}
      {resumoTab === 'detalhes' && (
        <>
          <div className={styles.summaryGrid}>
            {labNome && <ReviewRow label="Laboratório" value={labNome} />}
            <ReviewRow label="Paciente" value={envio.paciente_nome} />
            {envio.dentista_nome && <ReviewRow label="Dentista" value={envio.dentista_nome} />}
            <ReviewRow label="Resumo" value={getEnvioResumo(envio) || envio.tipo_trabalho} />
            {envio.classificacao_protese && <ReviewRow label="Classificação" value={envio.classificacao_protese} />}
            <ReviewRow label="Status" value={envio.status} />
            <ReviewRow label="Data de envio" value={formatDate(envio.data_envio)} />
            <ReviewRow label="Prazo geral" value={formatDate(envio.data_entrega_prometida)} />
            {envio.data_consulta && <ReviewRow label="Data da consulta" value={formatDate(envio.data_consulta)} />}
            {envio.forma_envio && <ReviewRow label="Forma de envio" value={envio.forma_envio} />}
            {envio.retirado_por && <ReviewRow label="Retirado por" value={envio.retirado_por} />}
            {envio.data_recebimento && <ReviewRow label="Recebido em" value={formatDate(envio.data_recebimento)} />}
            {envio.forma_recebimento && <ReviewRow label="Forma de recebimento" value={envio.forma_recebimento} />}
            {envio.conferencia_ok && <ReviewRow label="Conferência" value="Realizada" />}
            {envio.preco_servico != null && (
              <ReviewRow label="Valor" value={envio.preco_servico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            )}
            {envio.desconto != null && envio.desconto > 0 && (
              <ReviewRow label="Desconto" value={envio.desconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            )}
            <ReviewRow label="Pagamento" value={envio.pago ? `Pago em ${formatDate(envio.data_pagamento)}` : 'Pendente'} />
            {envio.observacoes && <ReviewRow label="Observações" value={envio.observacoes} />}
            {envio.anotacao_recebimento && <ReviewRow label="Anotação recebimento" value={envio.anotacao_recebimento} />}
            {envio.observacao_financeira && <ReviewRow label="Obs. financeira" value={envio.observacao_financeira} />}
          </div>

          {overdueEtapas.length > 0 && (
            <div className={styles.summaryAlert}>
              <IconAlert /> {overdueEtapas.length} etapa(s) atrasada(s)
            </div>
          )}
          {envio.urgente && (
            <div className={`${styles.summaryAlert} ${styles.summaryAlertUrgent}`}>
              <IconAlert /> Envio marcado como urgente
            </div>
          )}

          <div className={styles.summarySteps}>
            {etapas.map(etapa => {
              const etapaAtrasada = !etapa.concluido && etapa.prazo_entrega != null && etapa.prazo_entrega < today()
              const savingEtapa = savingEtapaId === etapa.id
              const dataPrevista = getEtapaDataPrevista(envio, etapa, feriados ?? [], precosByLab)
              return (
                <div key={etapa.id} className={`${styles.summaryStepCard} ${etapaAtrasada ? styles.summaryStepCardOverdue : ''}`}>
                  <div className={styles.summaryStepHeader}>
                    <strong>{etapa.nome}</strong>
                    <span>{etapa.preco != null ? etapa.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Sem valor'}</span>
                  </div>
                  <div className={styles.kanbanCardEtapaGrid}>
                    <label className={styles.kanbanCardField}>
                      <span>Previsto</span>
                      <input className={`${styles.input} ${styles.inputReadonly}`} type="text" value={dataPrevista ? formatDate(dataPrevista) : '—'} readOnly disabled />
                    </label>
                    <label className={styles.kanbanCardField}>
                      <span>Concluído em</span>
                      <input className={styles.input} type="date" value={etapa.data_conclusao ?? ''} disabled={savingEtapa} onChange={e => void handleEtapaUpdate(etapa.id, { data_conclusao: e.target.value || null })} />
                    </label>
                  </div>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={etapa.concluido} disabled={savingEtapa} onChange={e => void handleEtapaUpdate(etapa.id, { concluido: e.target.checked })} />
                    <span>{etapa.concluido ? 'Etapa pronta' : 'Marcar etapa como pronta'}</span>
                  </label>
                  <div className={styles.summaryStepMeta}>
                    <span>{etapa.concluido ? `Pronto em ${formatDate(etapa.data_conclusao)}` : 'Em andamento'}</span>
                  </div>
                  {etapaAtrasada && <span className={styles.etapaAlert}>Etapa atrasada</span>}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Histórico tab */}
      {resumoTab === 'historico' && (
        <div>
          {loadingHist ? <Spinner /> : (
            <>
              {historico.length === 0 && <p className={styles.emptyMsg}>Nenhum registro no histórico.</p>}
              <div className={styles.financialList}>
                {historico.map(h => (
                  <div key={h.id} className={styles.financialRow}>
                    <div className={styles.financialMeta}>
                      <strong>{h.tipo_acao}</strong>
                      {h.detalhe && <span>{h.detalhe}</span>}
                      <small>{new Date(h.created_at).toLocaleString('pt-BR')}</small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Anexos tab */}
      {resumoTab === 'anexos' && (
        <div>
          <div className={styles.formActions} style={{ marginBottom: 12 }}>
            <label className={`${styles.btnSecondary} ${styles.labelBtn}`}>
              <IconUpload /> {uploadingAnexo ? 'Enviando...' : 'Enviar arquivo'}
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleUploadAnexo} disabled={uploadingAnexo} />
            </label>
          </div>
          {loadingAnexos ? <Spinner /> : (
            <>
              {anexos.length === 0 && <p className={styles.emptyMsg}>Nenhum anexo enviado.</p>}
              <div className={styles.financialList}>
                {anexos.map(a => (
                  <div key={a.id} className={styles.financialRow}>
                    <div className={styles.financialMeta}>
                      <strong>{a.nome_arquivo}</strong>
                      <small>{new Date(a.created_at).toLocaleString('pt-BR')}{a.tamanho_bytes ? ` · ${Math.round(a.tamanho_bytes / 1024)} KB` : ''}</small>
                    </div>
                    <div className={styles.financialActions}>
                      <button type="button" className={styles.btnIcon} onClick={() => void downloadAnexo(a)} title="Baixar"><IconDownload /></button>
                      <button type="button" className={`${styles.btnIcon} ${styles.btnIconDanger}`} onClick={() => void excluirAnexo(a)} title="Excluir"><IconTrash /></button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.formActions}>
        <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
        <span style={{ flex: 1 }} />
        {briefingUrl && (
          <a href={briefingUrl} target="_blank" rel="noopener noreferrer" className={styles.btnSecondary} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
            <IconWhatsApp /> WhatsApp
          </a>
        )}
        {isAdmin && (
          <button type="button" className={styles.btnSecondary} onClick={() => void onTogglePago(envio)}>
            {envio.pago ? 'Remover pagamento' : 'Marcar como pago'}
          </button>
        )}
        <button type="button" className={styles.btnPrimary} onClick={onEdit}>Editar</button>
      </div>
    </Modal>
  )
}

// ── Kanban Card ───────────────────────────────────────────────────────────
