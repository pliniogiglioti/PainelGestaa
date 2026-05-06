import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { Lab, LabEnvio, LabKanbanColuna } from '../../lib/types'
import { Modal as UiModal } from '../ui'
import styles from '../../pages/LabControlPage.module.css'
import { IconArchive, IconEdit, IconList, IconPlus, IconSettings2, IconUser } from './icons'
import { formatDate, isFinalEnvioStatus, isOverdue } from './utils'

export function Spinner() {
  return (
    <div className={styles.spinnerWrap}>
      <div className={styles.spinner} />
    </div>
  )
}

export function LabPickerModal({ title, labs, onClose, onSelect }: {
  title: string
  labs: Lab[]
  onClose: () => void
  onSelect: (lab: Lab) => void
}) {
  const [selectedLabId, setSelectedLabId] = useState(labs[0]?.id ?? '')

  return (
    <Modal title={title} onClose={onClose}>
      <div className={styles.form}>
        <div className={styles.formField}>
          <label className={styles.label}>Laboratório</label>
          <select
            className={styles.select}
            value={selectedLabId}
            onChange={e => setSelectedLabId(e.target.value)}
          >
            {labs.map(lab => (
              <option key={lab.id} value={lab.id}>
                {lab.nome}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!selectedLabId}
            onClick={() => {
              const selectedLab = labs.find(lab => lab.id === selectedLabId)
              if (!selectedLab) return
              onSelect(selectedLab)
              onClose()
            }}
          >
            Abrir
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function OverviewMenu({
  labs,
  envios,
  colunas,
  isAdmin,
  getLabName,
  onCreateLab,
  onOpenEditLabPicker,
  onOpenPrecosPicker,
  onOpenKanbanCfg,
  onOpenArquivados,
  onOpenDentistas,
  onOpenFormasEnvio,
}: {
  labs: Lab[]
  envios: LabEnvio[]
  colunas: LabKanbanColuna[]
  isAdmin: boolean
  getLabName: (labId: string) => string
  onCreateLab: () => void
  onOpenEditLabPicker: () => void
  onOpenPrecosPicker: () => void
  onOpenKanbanCfg: () => void
  onOpenArquivados: () => void
  onOpenDentistas: () => void
  onOpenFormasEnvio: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const recent = envios.slice(0, 5)
  const emAndamento = envios.filter(envio => !isFinalEnvioStatus(envio.status))
  const pagos = envios.filter(envio => envio.pago)
  const overdue = envios.filter(isOverdue)
  const totalValor = envios.reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)
  const valorEmAndamento = emAndamento.reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)
  const ticketMedio = envios.length > 0 ? totalValor / envios.length : 0

  const actions = [
    ...(isAdmin ? [
      { id: 'novo-lab', label: 'Novo laboratório', icon: <IconPlus />, onClick: onCreateLab },
      { id: 'editar-labs', label: 'Editar laboratórios', icon: <IconEdit />, onClick: onOpenEditLabPicker },
      { id: 'precos', label: 'Lista de preços', icon: <IconList />, onClick: onOpenPrecosPicker },
      { id: 'kanbans', label: 'Editar Kanbans', icon: <IconSettings2 />, onClick: onOpenKanbanCfg },
    ] : []),
    { id: 'dentistas',  label: 'Dentistas',  icon: <IconUser />,    onClick: onOpenDentistas },
    { id: 'formas-envio', label: 'Tipos de envio', icon: <IconArchive />, onClick: onOpenFormasEnvio },
    { id: 'arquivados', label: 'Arquivados', icon: <IconArchive />, onClick: onOpenArquivados },
  ]

  return (
    <div className={styles.overviewMenu} ref={menuRef}>
      <button
        type="button"
        className={`${styles.btnSecondary} ${styles.overviewMenuTrigger}`}
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={styles.overviewMenuTriggerLabel}>Visão geral</span>
        <span
          aria-hidden="true"
          className={`${styles.overviewMenuChevron} ${open ? styles.overviewMenuChevronOpen : ''}`}
        >
          <span />
          <span />
        </span>
      </button>

      {open && (
        <div className={styles.overviewMenuDropdown} role="menu">
          <button
            type="button"
            className={`${styles.overviewMenuCard} ${styles.labCard} ${styles.labCardAggregate}`}
            onClick={() => setOpen(false)}
          >
            <div className={styles.labCardHeader}>
              <div>
                <div className={styles.aggregateBadge}>Visão geral</div>
                <div className={styles.labCardName}>Todos</div>
              </div>
            </div>

            <div className={styles.aggregateCardHint}>
              Acompanhe todos os trabalhos no mesmo kanban e filtre por laboratório quando precisar.
            </div>

            <div className={styles.aggregateKpiGrid}>
              <div className={styles.aggregateKpiCard}>
                <strong>{labs.length}</strong>
                <span>laboratórios</span>
              </div>
              <div className={styles.aggregateKpiCard}>
                <strong>{envios.length}</strong>
                <span>trabalhos</span>
              </div>
              <div className={styles.aggregateKpiCard}>
                <strong>{emAndamento.length}</strong>
                <span>em andamento</span>
              </div>
              <div className={`${styles.aggregateKpiCard} ${styles.aggregateKpiCardAlert}`}>
                <strong>{overdue.length}</strong>
                <span>atrasados</span>
              </div>
              <div className={styles.aggregateKpiCard}>
                <strong>{pagos.length}</strong>
                <span>pagos</span>
              </div>
              <div className={styles.aggregateKpiCard}>
                <strong>{ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                <span>ticket médio</span>
              </div>
            </div>

            <div className={styles.labCardValueSummary}>
              <span className={styles.labCardValueLabel}>Valores em andamento</span>
              <strong className={styles.labCardValueAmount}>
                {valorEmAndamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
            </div>

            {envios.length > 0 && (
              <div className={styles.labCardStatusBar}>
                {[...colunas].sort((a, b) => a.ordem - b.ordem).map(col => {
                  const count = envios.filter(envio => envio.status === col.nome).length
                  if (count === 0) return null
                  return (
                    <div
                      key={col.id}
                      className={styles.labCardStatusSegment}
                      style={{ background: col.cor, flex: count }}
                      title={`${col.nome}: ${count}`}
                    />
                  )
                })}
              </div>
            )}

            {recent.length > 0 && (
              <div className={styles.labCardEnvios}>
                {recent.map(envio => (
                  <div key={envio.id} className={`${styles.labCardEnvioItem} ${isOverdue(envio) ? styles.labCardEnvioOverdue : ''}`}>
                    <span className={styles.labCardEnvioPatient}>{envio.paciente_nome}</span>
                    <span className={styles.labCardEnvioType}>{getLabName(envio.lab_id)}</span>
                    {envio.data_entrega_prometida && (
                      <span className={styles.labCardEnvioDate}>{formatDate(envio.data_entrega_prometida)}</span>
                    )}
                  </div>
                ))}
                {envios.length > 5 && (
                  <div className={styles.labCardMore}>+{envios.length - 5} trabalhos</div>
                )}
              </div>
            )}
          </button>
          <div className={styles.overviewMenuActions}>
            {actions.map(action => (
              <button
                key={action.id}
                type="button"
                className={styles.overviewMenuAction}
                onClick={() => {
                  setOpen(false)
                  action.onClick()
                }}
                role="menuitem"
              >
                <span className={styles.overviewMenuActionIcon} aria-hidden="true">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Modal Wrapper ──────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return <UiModal title={title} onClose={onClose} wide={wide}>{children}</UiModal>
}

// ── LabModal (Create/Edit Lab — Admin) ────────────────────────────────────

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  )
}

export function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>
        {icon && <span className={styles.infoIcon}>{icon}</span>}
        {value}
      </span>
    </div>
  )
}
