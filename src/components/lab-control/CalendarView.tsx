import { useMemo, useState } from 'react'
import type { Lab, LabEnvio, LabPreco } from '../../lib/types'
import styles from '../../pages/LabControlPage.module.css'
import { IconClock } from './icons'
import { buildCalendarEvents, formatDate, today, type CalendarEvent } from './utils'

export function CalendarView({ envios, precosByLab, labs, onClose }: {
  envios: LabEnvio[]
  precosByLab: Record<string, LabPreco[]>
  labs: Lab[]
  onClose: () => void
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const labsById = useMemo(() => Object.fromEntries(labs.map(l => [l.id, l])), [labs])
  const events = useMemo(() => buildCalendarEvents(envios, precosByLab, labsById), [envios, precosByLab, labsById])

  const { year, month } = currentMonth
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthEvents = events.filter(ev => ev.date.startsWith(currentMonthPrefix))
  const monthEventsCount = monthEvents.length
  const labsWithEventsCount = new Set(monthEvents.map(ev => ev.labNome).filter(Boolean)).size
  const todayIso = today()

  const monthLabel = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const prevMonth = () => setCurrentMonth(({ year: y, month: m }) =>
    m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 }
  )
  const nextMonth = () => setCurrentMonth(({ year: y, month: m }) =>
    m === 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 }
  )

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = []
      map[ev.date].push(ev)
    }
    return map
  }, [events])

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calendarHeader}>
        <button type="button" className={styles.btnIcon} onClick={prevMonth}>‹</button>
        <span className={styles.calendarMonthLabel}>{monthLabel}</span>
        <div className={styles.calendarSummary}>
          <span>{monthEventsCount} previsões no mês</span>
          <span>{labsWithEventsCount} laboratório(s)</span>
        </div>
        <button type="button" className={styles.btnIcon} onClick={nextMonth}>›</button>
        <button type="button" className={styles.btnSecondary} onClick={onClose} style={{ marginLeft: 'auto' }}>
          Fechar Calendário
        </button>
      </div>
      <div className={styles.calendarGrid}>
        {weekDays.map(d => (
          <div key={d} className={styles.calendarDayHeader}>{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className={styles.calendarCell} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = eventsByDate[dateStr] ?? []
          const isToday = dateStr === todayIso
          return (
            <div key={dateStr} className={`${styles.calendarCell} ${isToday ? styles.calendarCellToday : ''}`}>
              <div className={styles.calendarCellHeader}>
                <span className={styles.calendarDayNum}>{day}</span>
                {dayEvents.length > 0 && <span className={styles.calendarDayCount}>{dayEvents.length}</span>}
              </div>
              {dayEvents.map((ev, idx) => (
                <div key={`${ev.envioId}-${idx}`} className={styles.calendarEvent}>
                  <span className={styles.calendarEventPatient}>{ev.urgente ? '⚡ ' : ''}{ev.pacienteNome}</span>
                  <span className={styles.calendarEventService}>{ev.servicoNome}</span>
                  <div className={styles.calendarEventTooltip}>
                    {ev.urgente && <div className={styles.kanbanCardUrgent}>⚡ Urgente</div>}
                    {ev.labNome && <div className={styles.kanbanCardLab}>{ev.labNome}</div>}
                    <div className={styles.kanbanCardPatient}>{ev.pacienteNome}</div>
                    <div className={styles.kanbanCardService}>{ev.servicoNome}</div>
                    {(ev.dentes || ev.cor) && (
                      <div className={styles.kanbanCardDetails}>
                        {ev.dentes && <span>Dentes: {ev.dentes}</span>}
                        {ev.cor && <span>Cor: {ev.cor}</span>}
                      </div>
                    )}
                    {ev.dataEntregaPrometida && (
                      <div className={styles.kanbanCardDate}>
                        <IconClock /> {formatDate(ev.dataEntregaPrometida)}
                      </div>
                    )}
                    {ev.valor != null && (
                      <div className={styles.kanbanCardPrice}>
                        {ev.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                    )}
                    <div className={styles.calendarEventTooltipStatus}>{ev.status}</div>
                    <div className={styles.calendarEventTooltipDivider} />
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      Previsto: {formatDate(ev.date)} · Envio: {formatDate(ev.dataEnvio)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
