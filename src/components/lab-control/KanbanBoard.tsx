import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { LabEnvio, LabKanbanColuna, LabPreco } from '../../lib/types'
import styles from '../../pages/LabControlPage.module.css'
import { KANBAN_PAGE_SIZE } from './constants'
import { IconAlert, IconClock, IconEdit, IconTrash } from './icons'
import { formatDate, getEnvioEtapas, getEnvioResumo, getEtapaDataPrevista, getOverdueEtapas, isOverdue } from './utils'

export function KanbanCard({ envio, dragging, isAdmin, labNome, feriados, precosByLab, onDragStart, onOpenResumo, onEdit, onDelete }: {
  envio: LabEnvio; dragging: boolean; isAdmin: boolean; labNome?: string | null
  feriados?: string[]
  precosByLab?: Record<string, LabPreco[]>
  onDragStart: (e: React.DragEvent, id: string) => void
  onOpenResumo: () => void
  onEdit: () => void; onDelete: () => void
}) {
  const overdue = isOverdue(envio)
  const overdueEtapas = getOverdueEtapas(envio)
  const resumoTrabalho = getEnvioResumo(envio)
  const etapas = getEnvioEtapas(envio)
  const etapasConcluidas = etapas.filter(etapa => etapa.concluido).length
  const cardDataPrevista = etapas
    .map(etapa => getEtapaDataPrevista(envio, etapa, feriados ?? [], precosByLab))
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? envio.data_entrega_prometida

  return (
    <div
      className={`${styles.kanbanCard} ${dragging ? styles.kanbanCardDragging : ''} ${overdue ? styles.kanbanCardOverdue : ''}`}
      draggable
      onDragStart={e => onDragStart(e, envio.id)}
      onClick={onOpenResumo}
    >
      {overdue && (
        <div className={styles.kanbanCardAlert}>
          <IconAlert /> {overdueEtapas[0] ? `Etapa atrasada: ${overdueEtapas[0].nome}` : 'Prazo vencido'}
        </div>
      )}
      {envio.urgente && <div className={styles.kanbanCardUrgent}>Urgente</div>}
      {labNome && <div className={styles.kanbanCardLab}>{labNome}</div>}
      <div className={styles.kanbanCardPatient}>{envio.paciente_nome}</div>
      <div className={styles.kanbanCardService}>{resumoTrabalho || envio.tipo_trabalho}</div>
      {(envio.dentes || envio.cor) && (
        <div className={styles.kanbanCardDetails}>
          {envio.dentes && <span>Dentes: {envio.dentes}</span>}
          {envio.cor    && <span>Cor: {envio.cor}</span>}
        </div>
      )}
      {cardDataPrevista && (
        <div className={`${styles.kanbanCardDate} ${overdue ? styles.kanbanCardDateOverdue : ''}`}>
          <IconClock /> {formatDate(cardDataPrevista)}
        </div>
      )}
      {envio.preco_servico != null && (
        <div className={styles.kanbanCardPrice}>
          {envio.preco_servico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </div>
      )}
      <div className={styles.kanbanCardStageSummary}>
        <span>{etapasConcluidas}/{etapas.length} etapa(s) prontas</span>
        <span>Ver resumo</span>
      </div>
      <div className={styles.kanbanCardActions}>
        <button type="button" className={styles.btnIcon} onClick={e => { e.stopPropagation(); onEdit() }} title="Editar"><IconEdit /></button>
        {isAdmin && (
          <button type="button" className={`${styles.btnIcon} ${styles.btnIconDanger}`} onClick={e => { e.stopPropagation(); onDelete() }} title="Excluir"><IconTrash /></button>
        )}
      </div>
    </div>
  )
}

// ── Kanban Board ──────────────────────────────────────────────────────────

export function KanbanBoard({ envios, colunas, isAdmin, showLabName, getLabName, getLabFeriados, precosByLab, onMoveEnvio, onOpenResumo, onEditEnvio, onDeleteEnvio }: {
  envios: LabEnvio[]; colunas: LabKanbanColuna[]; isAdmin: boolean
  showLabName?: boolean
  getLabName?: (labId: string) => string
  getLabFeriados?: (labId: string) => string[]
  precosByLab?: Record<string, LabPreco[]>
  onMoveEnvio: (id: string, status: string) => void
  onOpenResumo: (envio: LabEnvio) => void
  onEditEnvio: (envio: LabEnvio) => void
  onDeleteEnvio: (id: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [visibleByCol, setVisibleByCol] = useState<Record<string, number>>({})
  const [loadingCols, setLoadingCols] = useState<Record<string, boolean>>({})
  const loadTimersRef = useRef<Record<string, number>>({})
  const sorted = [...colunas].sort((a, b) => a.ordem - b.ordem)

  useEffect(() => {
    setVisibleByCol(prev => Object.fromEntries(
      sorted.map(col => [col.nome, prev[col.nome] ?? KANBAN_PAGE_SIZE]),
    ))
  }, [colunas])

  useEffect(() => () => {
    Object.values(loadTimersRef.current).forEach(timer => window.clearTimeout(timer))
  }, [])

  const handleDrop = (e: React.DragEvent, colNome: string) => {
    e.preventDefault()
    if (draggingId) onMoveEnvio(draggingId, colNome)
    setDraggingId(null); setDragOverCol(null)
  }

  const loadMoreForColumn = (colNome: string, totalItems: number) => {
    const visibleItems = visibleByCol[colNome] ?? KANBAN_PAGE_SIZE
    if (loadingCols[colNome] || visibleItems >= totalItems) return

    setLoadingCols(prev => ({ ...prev, [colNome]: true }))
    loadTimersRef.current[colNome] = window.setTimeout(() => {
      setVisibleByCol(prev => ({
        ...prev,
        [colNome]: Math.min((prev[colNome] ?? KANBAN_PAGE_SIZE) + KANBAN_PAGE_SIZE, totalItems),
      }))
      setLoadingCols(prev => ({ ...prev, [colNome]: false }))
      delete loadTimersRef.current[colNome]
    }, 350)
  }

  const handleColumnScroll = (e: React.UIEvent<HTMLDivElement>, colNome: string, totalItems: number) => {
    const target = e.currentTarget
    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 32
    if (nearBottom) loadMoreForColumn(colNome, totalItems)
  }

  return (
    <div className={styles.kanban}>
      {sorted.map(col => {
        const colEnvios = envios.filter(e => e.status === col.nome)
        const visibleItems = visibleByCol[col.nome] ?? KANBAN_PAGE_SIZE
        const visibleEnvios = colEnvios.slice(0, visibleItems)
        const isLoadingMore = !!loadingCols[col.nome]
        return (
          <div
            key={col.id}
            className={`${styles.kanbanCol} ${dragOverCol === col.nome ? styles.kanbanColDragOver : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.nome) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null) }}
            onDrop={e => handleDrop(e, col.nome)}
          >
            <div className={styles.kanbanColHeader}>
              <span className={styles.kanbanColIndicator} style={{ background: col.cor }} />
              <span className={styles.kanbanColName}>{col.nome}</span>
              <span className={styles.kanbanColCount}>{colEnvios.length}</span>
            </div>
            <div className={styles.kanbanCards} onScroll={e => handleColumnScroll(e, col.nome, colEnvios.length)}>
              {visibleEnvios.map(envio => (
                <KanbanCard
                  key={envio.id}
                  envio={envio}
                  dragging={draggingId === envio.id}
                  isAdmin={isAdmin}
                  labNome={showLabName ? getLabName?.(envio.lab_id) ?? 'Laboratório' : null}
                  feriados={getLabFeriados?.(envio.lab_id)}
                  precosByLab={precosByLab}
                  onDragStart={(e, id) => { setDraggingId(id); e.dataTransfer.effectAllowed = 'move' }}
                  onOpenResumo={() => onOpenResumo(envio)}
                  onEdit={() => onEditEnvio(envio)}
                  onDelete={() => onDeleteEnvio(envio.id)}
                />
              ))}
              {isLoadingMore && (
                <div className={styles.kanbanLoadingMore}>Carregando...</div>
              )}
              {colEnvios.length === 0 && (
                <div className={styles.kanbanEmpty}>Sem trabalhos</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Lab Detail View ───────────────────────────────────────────────────────
