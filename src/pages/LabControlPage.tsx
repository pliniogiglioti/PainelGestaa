import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import type { Empresa, Lab, LabPreco, LabKanbanColuna, LabEnvio } from '../lib/types'
import styles from './LabControlPage.module.css'
import { useBackdropDismiss } from '../hooks/useBackdropDismiss'
import { useSessionStorageState } from '../hooks/useSessionStorageState'

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_COLUNAS = [
  { nome: 'Enviado',      ordem: 0, cor: '#6366f1' },
  { nome: 'Em produção',  ordem: 1, cor: '#f59e0b' },
  { nome: 'Pronto',       ordem: 2, cor: '#10b981' },
  { nome: 'Entregue',     ordem: 3, cor: '#3b82f6' },
  { nome: 'Concluído',    ordem: 4, cor: '#8b5cf6' },
]

const KANBAN_PAGE_SIZE = 5

const SHADE_OPTIONS = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
  'BL', 'OM', 'Outro',
]

type LabEtapa = {
  id: string
  nome: string
  preco: number | null
  origem: 'catalogo' | 'manual'
  prazo_entrega: string | null
  prazo_producao_dias: number | null
  concluido: boolean
  data_conclusao: string | null
}

type FinanceiroFiltro = 'todos' | 'em_andamento' | 'pagos'
type LabViewSelection = { kind: 'lab'; lab: Lab } | { kind: 'all' }
type LabViewSelectionPersisted = { kind: 'lab'; labId: string } | { kind: 'all' }

const LAB_FILTER_ALL = '__all__'
const FINAL_ENVIO_STATUSES = ['Concluído', 'Entregue']

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isLabDetailTab(value: unknown): value is 'kanban' | 'info' {
  return value === 'kanban' || value === 'info'
}

function isLabViewSelectionPersisted(value: unknown): value is LabViewSelectionPersisted | null {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  if (candidate.kind === 'all') return true

  return candidate.kind === 'lab' && typeof candidate.labId === 'string'
}

// ── Helpers ────────────────────────────────────────────────────────────────

function today() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(Date.UTC(year, month - 1, day))
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getLabFeriados(lab: Lab) {
  return Array.isArray(lab.feriados) ? lab.feriados.filter((item): item is string => typeof item === 'string') : []
}

function addBusinessDays(startDate: string, businessDays: number, feriados: string[] = []) {
  if (!startDate || businessDays <= 0) return ''

  const date = parseIsoDate(startDate)
  if (!date) return ''

  const feriadosSet = new Set(feriados)
  let remaining = businessDays
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    const dayOfWeek = date.getUTCDay()
    const isoDate = formatIsoDate(date)
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !feriadosSet.has(isoDate)) remaining -= 1
  }

  return formatIsoDate(date)
}

// Calculates the promised delivery date based on the longest service deadline
function calcularPrazoEntrega(
  dataEnvio: string,
  servicos: Array<{ prazo_producao_dias: number | null }>,
  feriados: string[],
  prazoMedioDias: number,
): string {
  const prazos = servicos
    .map(s => s.prazo_producao_dias)
    .filter((p): p is number => p !== null && p > 0)
  const dias = prazos.length > 0 ? Math.max(...prazos) : prazoMedioDias
  if (!dias) return ''
  return addBusinessDays(dataEnvio, dias, feriados)
}

// Calculates the expected completion date for a service step
function calcularDataPrevista(
  dataEnvio: string,
  prazoProducaoDias: number | null,
  feriados: string[],
): string | null {
  if (!prazoProducaoDias || !dataEnvio) return null
  return addBusinessDays(dataEnvio, prazoProducaoDias, feriados)
}

function normalizeServicoNome(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR')
}

function getEtapaPrazoProducaoDias(
  envio: LabEnvio,
  etapa: LabEtapa,
  precosByLab?: Record<string, LabPreco[]>,
) {
  if (etapa.prazo_producao_dias != null && etapa.prazo_producao_dias > 0) {
    return etapa.prazo_producao_dias
  }

  const etapaNome = normalizeServicoNome(etapa.nome)
  const preco = (precosByLab?.[envio.lab_id] ?? []).find(item =>
    normalizeServicoNome(item.nome_servico) === etapaNome,
  )

  return preco?.prazo_producao_dias != null && preco.prazo_producao_dias > 0
    ? preco.prazo_producao_dias
    : null
}

function getEtapaDataPrevista(
  envio: LabEnvio,
  etapa: LabEtapa,
  feriados: string[],
  precosByLab?: Record<string, LabPreco[]>,
) {
  const prazoProducaoDias = getEtapaPrazoProducaoDias(envio, etapa, precosByLab)
  return calcularDataPrevista(envio.data_envio, prazoProducaoDias, feriados)
    ?? etapa.prazo_entrega
    ?? envio.data_entrega_prometida
}

function generateEtapaId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeCurrencyInput(value: string) {
  return value.replace(/[^\d,.-]/g, '')
}

function parseCurrencyInput(value: string) {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function getEnvioEtapas(envio: LabEnvio): LabEtapa[] {
  if (Array.isArray(envio.etapas) && envio.etapas.length > 0) {
    return envio.etapas.map((raw, index) => {
      const etapa = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
      return {
        id: typeof etapa.id === 'string' ? etapa.id : `etapa-${envio.id}-${index}`,
        nome: typeof etapa.nome === 'string' ? etapa.nome : envio.tipo_trabalho,
        preco: typeof etapa.preco === 'number' ? etapa.preco : envio.preco_servico,
        origem: etapa.origem === 'manual' ? 'manual' : 'catalogo',
        prazo_entrega: typeof etapa.prazo_entrega === 'string' ? etapa.prazo_entrega : envio.data_entrega_prometida,
        prazo_producao_dias: typeof etapa.prazo_producao_dias === 'number' ? etapa.prazo_producao_dias : null,
        concluido: Boolean(etapa.concluido),
        data_conclusao: typeof etapa.data_conclusao === 'string' ? etapa.data_conclusao : envio.data_entrega_real,
      }
    })
  }

  return [{
    id: `etapa-${envio.id}`,
    nome: envio.tipo_trabalho,
    preco: envio.preco_servico,
    origem: 'manual',
    prazo_entrega: envio.data_entrega_prometida,
    prazo_producao_dias: null,
    concluido: Boolean(envio.data_entrega_real),
    data_conclusao: envio.data_entrega_real,
  }]
}

function getOverdueEtapas(envio: LabEnvio) {
  return getEnvioEtapas(envio).filter(etapa =>
    !etapa.concluido &&
    Boolean(etapa.prazo_entrega) &&
    etapa.prazo_entrega! < today(),
  )
}

function getEnvioResumo(envio: LabEnvio) {
  return getEnvioEtapas(envio)
    .map(etapa => etapa.nome)
    .filter(Boolean)
    .join(' + ')
}

function applyEtapaChanges(etapa: LabEtapa, changes: Partial<Pick<LabEtapa, 'prazo_entrega' | 'concluido' | 'data_conclusao'>>) {
  const next: LabEtapa = { ...etapa, ...changes }

  if (changes.concluido === true && !next.data_conclusao) {
    next.data_conclusao = today()
  }

  if (changes.concluido === false) {
    next.data_conclusao = null
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'data_conclusao')) {
    next.concluido = Boolean(next.data_conclusao)
  }

  return next
}

function serializeLabEtapas(etapas: LabEtapa[]) {
  return etapas.map(etapa => ({
    id: etapa.id,
    nome: etapa.nome,
    preco: etapa.preco,
    origem: etapa.origem,
    prazo_entrega: etapa.prazo_entrega,
    prazo_producao_dias: etapa.prazo_producao_dias,
    concluido: etapa.concluido,
    data_conclusao: etapa.data_conclusao,
  }))
}

function getEnvioDataEntregaRealFromEtapas(etapas: LabEtapa[]) {
  if (etapas.length === 0 || etapas.some(etapa => !etapa.concluido)) return null

  const datasConcluidas = etapas
    .map(etapa => etapa.data_conclusao || today())
    .sort()

  return datasConcluidas[datasConcluidas.length - 1] ?? null
}

function getFinanceiroReferenceDate(envio: LabEnvio) {
  return envio.pago ? (envio.data_pagamento ?? envio.data_envio) : envio.data_envio
}

function sortEnviosByCreatedAt(envios: LabEnvio[]) {
  return [...envios].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function getEnvioMetrics(envios: LabEnvio[]) {
  const emAndamento = envios.filter(envio => !FINAL_ENVIO_STATUSES.includes(envio.status))
  const concluidos = envios.filter(envio => FINAL_ENVIO_STATUSES.includes(envio.status))
  const pagos = envios.filter(envio => envio.pago)
  const overdue = envios.filter(isOverdue)
  const totalValor = envios.reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)
  const valorEmAndamento = emAndamento.reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)
  const valorPago = pagos.reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)

  return {
    total: envios.length,
    emAndamento: emAndamento.length,
    concluidos: concluidos.length,
    pagos: pagos.length,
    overdue: overdue.length,
    valorEmAndamento,
    valorPago,
    ticketMedio: envios.length > 0 ? totalValor / envios.length : 0,
  }
}

function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('55')) {
    return digits.length === 12 || digits.length === 13 ? digits : null
  }

  return digits.length === 10 || digits.length === 11 ? `55${digits}` : null
}

function formatWhatsAppNumber(value: string) {
  const normalized = normalizeWhatsAppNumber(value)
  if (!normalized) return value

  const area = normalized.slice(2, 4)
  const number = normalized.slice(4)

  if (number.length === 9) {
    return `(${area}) ${number.slice(0, 5)}-${number.slice(5)}`
  }

  return `(${area}) ${number.slice(0, 4)}-${number.slice(4)}`
}

function formatWhatsAppInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 13)
  if (!digits) return ''

  if (digits.startsWith('55')) {
    const country = digits.slice(0, 2)
    const area = digits.slice(2, 4)
    const number = digits.slice(4)

    if (digits.length <= 2) return `(${country}`
    if (digits.length <= 4) return `(${country}) ${area}`
    if (number.length <= 5) return `(${country}) ${area} ${number}`
    return `(${country}) ${area} ${number.slice(0, 5)}-${number.slice(5, 9)}`
  }

  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9, 13)}`
}

function buildWhatsAppUrl(value: string) {
  const normalized = normalizeWhatsAppNumber(value)
  return normalized ? `https://wa.me/${normalized}` : null
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function isOverdue(envio: LabEnvio) {
  if (getOverdueEtapas(envio).length > 0) return true
  if (!envio.data_entrega_prometida) return false
  const finalStatuses = ['Concluído', 'Entregue']
  if (finalStatuses.includes(envio.status)) return false
  return envio.data_entrega_prometida < today()
}

// Formats a digit string as Brazilian currency mask: "12399" → "R$ 123,99"
function formatCurrencyMask(digits: string): string {
  const onlyDigits = digits.replace(/\D/g, '')
  if (!onlyDigits) return ''
  const num = parseInt(onlyDigits, 10)
  return (num / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Parses a masked currency string back to a decimal number: "R$ 123,99" → 123.99
function parseMaskedCurrency(masked: string): number {
  const onlyDigits = masked.replace(/\D/g, '')
  if (!onlyDigits) return 0
  return parseInt(onlyDigits, 10) / 100
}

// ── Calendar helpers ───────────────────────────────────────────────────────

type CalendarEvent = {
  envioId: string
  pacienteNome: string
  servicoNome: string
  labNome: string
  date: string // ISO YYYY-MM-DD
}

// Builds calendar events from all active envios
function buildCalendarEvents(
  envios: LabEnvio[],
  precosByLab: Record<string, LabPreco[]>,
  labsById: Record<string, Lab>,
): CalendarEvent[] {
  const finalStatuses = ['Concluído', 'Entregue']
  const events: CalendarEvent[] = []
  for (const envio of envios) {
    if (finalStatuses.includes(envio.status)) continue
    const lab = labsById[envio.lab_id]
    const feriados = lab ? getLabFeriados(lab) : []
    const etapas = getEnvioEtapas(envio)
    for (const etapa of etapas) {
      const date = getEtapaDataPrevista(envio, etapa, feriados, precosByLab)
      if (!date) continue
      events.push({
        envioId: envio.id,
        pacienteNome: envio.paciente_nome,
        servicoNome: etapa.nome,
        labNome: lab?.nome ?? '',
        date,
      })
    }
  }
  return events
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
)
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
)
const IconPhone = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.53 3.49 2 2 0 0 1 3.5 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
)
const IconWhatsApp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M19.05 4.94A9.86 9.86 0 0 0 12.03 2C6.54 2 2.08 6.46 2.08 11.95c0 1.76.46 3.47 1.34 4.97L2 22l5.24-1.37a9.93 9.93 0 0 0 4.76 1.21h.01c5.49 0 9.95-4.46 9.95-9.95a9.86 9.86 0 0 0-2.91-6.95ZM12.01 20.16h-.01a8.27 8.27 0 0 1-4.21-1.15l-.3-.18-3.11.81.83-3.03-.2-.31a8.24 8.24 0 0 1-1.28-4.35c0-4.56 3.71-8.27 8.28-8.27 2.21 0 4.29.86 5.85 2.42a8.22 8.22 0 0 1 2.42 5.85c0 4.56-3.71 8.27-8.27 8.27Zm4.54-6.2c-.25-.12-1.46-.72-1.69-.8-.23-.08-.4-.12-.57.12-.17.25-.65.8-.8.96-.15.17-.29.19-.54.06-.25-.12-1.04-.38-1.98-1.2-.73-.65-1.23-1.45-1.37-1.69-.14-.25-.02-.38.1-.5.11-.11.25-.29.37-.43.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.57-1.37-.78-1.88-.21-.5-.42-.43-.57-.43h-.49c-.17 0-.43.06-.66.31-.23.25-.88.86-.88 2.1 0 1.23.9 2.43 1.02 2.6.12.17 1.77 2.7 4.28 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29Z"/>
  </svg>
)
const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
)
const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)
const IconSettings2 = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)
const IconUpload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
  </svg>
)
const IconAlert = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const IconFlask = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6v7l4 8H5l4-8V3z"/>
    <line x1="9" y1="3" x2="15" y2="3"/>
  </svg>
)
function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className={styles.spinnerWrap}>
      <div className={styles.spinner} />
    </div>
  )
}

// ── Modal Wrapper ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  const backdropDismiss = useBackdropDismiss(onClose)
  return (
    <div
      className={styles.overlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
    >
      <div className={`${styles.modal} ${wide ? styles.modalWide : ''}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>{children}</div>
      </div>
    </div>
  )
}

// ── LabModal (Create/Edit Lab — Admin) ────────────────────────────────────

interface LabFormState {
  nome: string; cnpj: string; telefone: string; email: string
  endereco: string; prazo_medio_dias: string; dia_fechamento: string; observacoes: string
}

function LabModal({ lab, empresaId, onClose, onSaved }: {
  lab: Lab | null; empresaId: string; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<LabFormState>({
    nome:             lab?.nome ?? '',
    cnpj:             lab?.cnpj ?? '',
    telefone:         formatWhatsAppInput(lab?.telefone ?? ''),
    email:            lab?.email ?? '',
    endereco:         lab?.endereco ?? '',
    prazo_medio_dias: String(lab?.prazo_medio_dias ?? 7),
    dia_fechamento:   lab?.dia_fechamento != null ? String(lab.dia_fechamento) : '',
    observacoes:      lab?.observacoes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (f: keyof LabFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, telefone: formatWhatsAppInput(e.target.value) }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    const telefoneNormalizado = form.telefone.trim() ? normalizeWhatsAppNumber(form.telefone) : null
    if (form.telefone.trim() && !telefoneNormalizado) {
      setError('Informe um WhatsApp válido. Ex.: (18) 99751-1381'); return
    }
    setSaving(true); setError('')

    const payload = {
      empresa_id:       empresaId,
      nome:             form.nome.trim(),
      cnpj:             form.cnpj.trim()     || null,
      telefone:         telefoneNormalizado,
      email:            form.email.trim()    || null,
      endereco:         form.endereco.trim() || null,
      prazo_medio_dias: lab !== null ? (parseInt(form.prazo_medio_dias) || 7) : 0,
      dia_fechamento:   form.dia_fechamento.trim() ? Math.min(Math.max(parseInt(form.dia_fechamento) || 1, 1), 31) : null,
      observacoes:      form.observacoes.trim() || null,
    }

    if (lab) {
      const { error: err } = await supabase.from('labs')
        .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', lab.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('labs').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    onSaved(); onClose()
  }

  return (
    <Modal title={lab ? 'Editar Laboratório' : 'Novo Laboratório'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGrid2}>
          <div className={styles.formField}>
            <label className={styles.label}>Nome *</label>
            <input className={styles.input} value={form.nome} onChange={set('nome')} placeholder="Nome do laboratório" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>CNPJ</label>
            <input className={styles.input} value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0000-00" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>WhatsApp</label>
            <input className={styles.input} value={form.telefone} onChange={handleTelefoneChange} placeholder="(18) 99751-1381" inputMode="tel" />
          </div>
          <div className={styles.formField}>
            <label className={styles.label}>E-mail</label>
            <input className={styles.input} type="email" value={form.email} onChange={set('email')} placeholder="contato@lab.com" />
          </div>
          <div className={`${styles.formField} ${styles.colSpan2}`}>
            <label className={styles.label}>Endereço</label>
            <input className={styles.input} value={form.endereco} onChange={set('endereco')} placeholder="Rua, número, cidade..." />
          </div>
          {lab !== null && (
            <div className={styles.formField}>
              <label className={styles.label}>Prazo médio (dias)</label>
              <input className={styles.input} type="number" min="1" value={form.prazo_medio_dias} onChange={set('prazo_medio_dias')} />
            </div>
          )}
          <div className={styles.formField}>
            <label className={styles.label}>Dia do fechamento</label>
            <input className={styles.input} type="number" min="1" max="31" value={form.dia_fechamento} onChange={set('dia_fechamento')} placeholder="Ex: 25" />
          </div>
          <div className={`${styles.formField} ${styles.colSpan2}`}>
            <label className={styles.label}>Observações</label>
            <textarea className={styles.textarea} value={form.observacoes} onChange={set('observacoes')} rows={3} placeholder="Informações adicionais..." />
          </div>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancelar</button>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── PrecosModal (Lista de preços + import xlsx — Admin) ───────────────────

function PrecosModal({ lab, initialEditingId, onClose, onSaved }: {
  lab: Lab; initialEditingId?: string | null; onClose: () => void; onSaved: () => void
}) {
  const [precos,     setPrecos]     = useState<LabPreco[]>([])
  const [loading,    setLoading]    = useState(true)
  const [novoNome,   setNovoNome]   = useState('')
  const [novoPreco,  setNovoPreco]  = useState('')
  const [novoPrazo,  setNovoPrazo]  = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editNome,   setEditNome]   = useState('')
  const [editPreco,  setEditPreco]  = useState('')
  const [editPrazo,  setEditPrazo]  = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchPrecos = useCallback(async () => {
    const { data } = await supabase
      .from('lab_precos').select('*')
      .eq('lab_id', lab.id).eq('ativo', true).order('nome_servico')
    if (data) setPrecos(data)
    setLoading(false)
  }, [lab.id])

  useEffect(() => { fetchPrecos() }, [fetchPrecos])

  const addPreco = async () => {
    if (!novoNome.trim()) return
    setSaving(true); setError('')
    const preco = parseMaskedCurrency(novoPreco)
    const { error: err } = await supabase.from('lab_precos').insert({
      lab_id: lab.id, nome_servico: novoNome.trim(), preco,
      prazo_producao_dias: novoPrazo ? parseInt(novoPrazo) : null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setNovoNome(''); setNovoPreco(''); setNovoPrazo('')
    await fetchPrecos()
    setSaving(false)
    onSaved()
  }

  const removePreco = async (id: string) => {
    await supabase.from('lab_precos').update({ ativo: false }).eq('id', id)
    await fetchPrecos()
    onSaved()
  }

  const startEditPreco = (preco: LabPreco) => {
    setEditingId(preco.id)
    setEditNome(preco.nome_servico)
    setEditPreco(formatCurrencyMask(String(Math.round(preco.preco * 100))))
    setEditPrazo(String(preco.prazo_producao_dias ?? ''))
    setError('')
  }

  useEffect(() => {
    if (!initialEditingId || editingId === initialEditingId) return
    const preco = precos.find(item => item.id === initialEditingId)
    if (preco) startEditPreco(preco)
  }, [editingId, initialEditingId, precos])

  const saveEditPreco = async () => {
    if (!editingId || !editNome.trim()) return
    setSaving(true); setError('')
    const preco = parseMaskedCurrency(editPreco)
    const { error: err } = await supabase
      .from('lab_precos')
      .update({ nome_servico: editNome.trim(), preco, prazo_producao_dias: editPrazo ? parseInt(editPrazo) : null })
      .eq('id', editingId)
    if (err) { setError(err.message); setSaving(false); return }
    setEditingId(null)
    setEditNome('')
    setEditPreco('')
    setEditPrazo('')
    await fetchPrecos()
    setSaving(false)
    onSaved()
  }

  const handleXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSaving(true); setError('')
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
      const inserts = rows
        .map(r => ({
          lab_id:       lab.id,
          nome_servico: String(r['Serviço'] ?? r['Servico'] ?? r['nome_servico'] ?? r['Nome'] ?? r['SERVIÇO'] ?? '').trim(),
          preco:        parseFloat(String(r['Preço'] ?? r['Preco'] ?? r['preco'] ?? r['Valor'] ?? r['PREÇO'] ?? '0').replace(',', '.')) || 0,
        }))
        .filter(p => p.nome_servico)
      if (inserts.length > 0) {
        const { error: err } = await supabase.from('lab_precos').insert(inserts)
        if (err) throw err
        await fetchPrecos()
        onSaved()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao importar planilha.')
    }
    setSaving(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Modal title={`Lista de Preços — ${lab.nome}`} onClose={onClose} wide>
      <div className={styles.precosWrap}>
        <div className={styles.precosAddRow}>
          <input
            className={styles.input}
            placeholder="Nome do serviço"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPreco()}
          />
          <input
            className={`${styles.input} ${styles.inputSmall}`}
            type="number"
            min="1"
            placeholder="Prazo (dias)"
            value={novoPrazo}
            onChange={e => setNovoPrazo(e.target.value)}
          />
          <input
            className={`${styles.input} ${styles.inputSmall}`}
            placeholder="Preço (R$)"
            value={novoPreco}
            onChange={e => setNovoPreco(formatCurrencyMask(e.target.value))}
            onKeyDown={e => e.key === 'Enter' && addPreco()}
          />
          <button type="button" className={styles.btnPrimary} onClick={addPreco} disabled={saving}>
            <IconPlus /> Adicionar
          </button>
          <label className={`${styles.btnSecondary} ${styles.labelBtn}`}>
            <IconUpload /> Importar XLSX
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleXlsx} />
          </label>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <p className={styles.xlsxHint}>
          Para importar via planilha, use colunas: <strong>Serviço</strong> e <strong>Preço</strong>
        </p>
        {loading ? <Spinner /> : (
          <div className={styles.precosList}>
            {precos.length === 0 && <p className={styles.emptyMsg}>Nenhum serviço cadastrado.</p>}
            {precos.map(p => (
              <div key={p.id} className={styles.precosRow}>
                {editingId === p.id ? (
                  <>
                    <input className={styles.input} value={editNome} onChange={e => setEditNome(e.target.value)} />
                    <input className={`${styles.input} ${styles.inputSmall}`} type="number" min="1" placeholder="Prazo (dias)" value={editPrazo} onChange={e => setEditPrazo(e.target.value)} />
                    <input className={`${styles.input} ${styles.inputSmall}`} placeholder="Preço (R$)" value={editPreco} onChange={e => setEditPreco(formatCurrencyMask(e.target.value))} />
                    <button type="button" className={styles.btnIcon} onClick={saveEditPreco} title="Salvar">
                      <IconEdit />
                    </button>
                    <button
                      type="button"
                      className={styles.btnIcon}
                      onClick={() => {
                        setEditingId(null)
                        setEditNome('')
                        setEditPreco('')
                        setEditPrazo('')
                      }}
                      title="Cancelar"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className={styles.precosNome}>{p.nome_servico}</span>
                    <span className={styles.precosValor}>
                      {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <button type="button" className={styles.btnIcon} onClick={() => startEditPreco(p)} title="Editar">
                      <IconEdit />
                    </button>
                  </>
                )}
                <button type="button" className={styles.btnIcon} onClick={() => removePreco(p.id)} title="Remover">
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ── KanbanConfigModal (Admin) ─────────────────────────────────────────────

function KanbanConfigModal({ empresaId, colunas, onClose, onSaved }: {
  empresaId: string; colunas: LabKanbanColuna[]
  onClose: () => void; onSaved: () => void
}) {
  const [cols,     setCols]     = useState<LabKanbanColuna[]>([...colunas].sort((a, b) => a.ordem - b.ordem))
  const [novoNome, setNovoNome] = useState('')
  const [novaCor,  setNovaCor]  = useState('#6366f1')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [editingColNome, setEditingColNome] = useState('')

  const addColuna = async () => {
    if (!novoNome.trim()) return
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('lab_kanban_colunas').insert({
      empresa_id: empresaId, nome: novoNome.trim(), ordem: cols.length, cor: novaCor,
    }).select().single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data) setCols(p => [...p, data as LabKanbanColuna])
    setNovoNome(''); setNovaCor('#6366f1')
    setSaving(false); onSaved()
  }

  const removeColuna = async (id: string) => {
    const { error: err } = await supabase.from('lab_kanban_colunas').delete().eq('id', id)
    if (err) { setError(err.message); return }
    const updated = cols.filter(c => c.id !== id).map((c, i) => ({ ...c, ordem: i }))
    for (const c of updated) {
      await supabase.from('lab_kanban_colunas').update({ ordem: c.ordem }).eq('id', c.id)
    }
    setCols(updated); onSaved()
  }

  const moveCol = async (id: string, dir: -1 | 1) => {
    const idx = cols.findIndex(c => c.id === id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= cols.length) return
    const next = [...cols];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    const withOrdem = next.map((c, i) => ({ ...c, ordem: i }))
    setCols(withOrdem)
    for (const c of withOrdem) {
      await supabase.from('lab_kanban_colunas').update({ ordem: c.ordem }).eq('id', c.id)
    }
    onSaved()
  }

  const startEditColuna = (coluna: LabKanbanColuna) => {
    setEditingColId(coluna.id)
    setEditingColNome(coluna.nome)
    setError('')
  }

  const cancelEditColuna = () => {
    setEditingColId(null)
    setEditingColNome('')
  }

  const saveEditColuna = async (id: string) => {
    if (!editingColNome.trim()) {
      setError('Informe o nome da coluna.')
      return
    }

    setSaving(true)
    setError('')
    const nome = editingColNome.trim()
    const { error: err } = await supabase
      .from('lab_kanban_colunas')
      .update({ nome })
      .eq('id', id)

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setCols(prev => prev.map(col => col.id === id ? { ...col, nome } : col))
    setSaving(false)
    cancelEditColuna()
    onSaved()
  }

  return (
    <Modal title="Configurar Colunas do Kanban" onClose={onClose}>
      <div className={styles.kanbanConfigWrap}>
        <div className={styles.kanbanColList}>
          {cols.map((c, i) => (
            <div key={c.id} className={styles.kanbanColRow}>
              <span className={styles.kanbanColDot} style={{ background: c.cor }} />
              {editingColId === c.id ? (
                <input
                  className={`${styles.input} ${styles.kanbanColInput}`}
                  value={editingColNome}
                  onChange={e => setEditingColNome(e.target.value)}
                  autoFocus
                  disabled={saving}
                />
              ) : (
                <span className={styles.kanbanColNome}>{c.nome}</span>
              )}
              <div className={styles.kanbanColActions}>
                {editingColId === c.id ? (
                  <>
                    <button type="button" className={styles.btnIcon} onClick={() => void saveEditColuna(c.id)} disabled={saving} title="Salvar">
                      <IconEdit />
                    </button>
                    <button type="button" className={styles.btnIcon} onClick={cancelEditColuna} disabled={saving} title="Cancelar">
                      ✕
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.btnIcon} onClick={() => startEditColuna(c)} title="Editar nome">
                    <IconEdit />
                  </button>
                )}
                <button type="button" className={styles.btnIcon} disabled={i === 0} onClick={() => moveCol(c.id, -1)}>↑</button>
                <button type="button" className={styles.btnIcon} disabled={i === cols.length - 1} onClick={() => moveCol(c.id, 1)}>↓</button>
                <button type="button" className={styles.btnIcon} onClick={() => removeColuna(c.id)} title="Remover"><IconTrash /></button>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.kanbanAddRow}>
          <input className={styles.input} placeholder="Nome da coluna" value={novoNome} onChange={e => setNovoNome(e.target.value)} />
          <input type="color" className={styles.colorInput} value={novaCor} onChange={e => setNovaCor(e.target.value)} />
          <button type="button" className={styles.btnPrimary} onClick={addColuna} disabled={saving}>
            <IconPlus /> Adicionar
          </button>
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
        <div className={styles.formActions}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ── EnvioSteps — wizard de 4 etapas ──────────────────────────────────────

interface EnvioFormState {
  tipo_trabalho: string; preco_servico: string
  paciente_nome: string; dentes: string; cor: string; observacoes: string
  data_envio: string; data_entrega_prometida: string; data_consulta: string
  urgente: boolean
}

interface ServicoSelecionado {
  key: string
  nome: string
  preco: number | null
  origem: 'catalogo' | 'manual'
  prazo_entrega: string
  prazo_producao_dias: number | null
  concluido: boolean
  data_conclusao: string
}

function EnvioSteps({ lab, labs = [], precos = [], precosByLab, empresaId, userId, envio, colunas, onClose, onSaved }: {
  lab?: Lab | null; labs?: Lab[]; precos?: LabPreco[]; precosByLab?: Record<string, LabPreco[]>
  empresaId: string; userId: string
  envio: LabEnvio | null; colunas: LabKanbanColuna[]
  onClose: () => void; onSaved: () => void
}) {
  const [step,   setStep]   = useState(1)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [manualNome, setManualNome] = useState('')
  const [manualPreco, setManualPreco] = useState('')
  const availableLabs = lab ? [lab, ...labs.filter(item => item.id !== lab.id)] : labs
  const labsById = Object.fromEntries(availableLabs.map(item => [item.id, item]))
  const [selectedLabId, setSelectedLabId] = useState(envio?.lab_id ?? lab?.id ?? '')
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
    tipo_trabalho:          envio?.tipo_trabalho ?? '',
    preco_servico:          envio?.preco_servico != null ? String(envio.preco_servico) : '',
    paciente_nome:          envio?.paciente_nome ?? '',
    dentes:                 envio?.dentes ?? '',
    cor:                    envio?.cor ?? '',
    observacoes:            envio?.observacoes ?? '',
    data_envio:             envio?.data_envio ?? today(),
    data_entrega_prometida: envio?.data_entrega_prometida ?? addBusinessDays(envio?.data_envio ?? today(), currentLab?.prazo_medio_dias ?? 0, feriadosLab),
    data_consulta:          envio?.data_consulta ?? '',
    urgente:                envio?.urgente ?? false,
  })

  const set = (f: keyof EnvioFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [f]: e.target.value }))

  useEffect(() => {
    const trabalho = servicosSelecionados
      .map(servico => servico.nome.trim())
      .filter(Boolean)
      .join(' + ')

    const possuiPreco = servicosSelecionados.some(servico => servico.preco != null)
    const valorTotal = servicosSelecionados.reduce((total, servico) => total + (servico.preco ?? 0), 0)
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

  const addManualServico = () => {
    if (!manualNome.trim()) {
      setError('Informe o nome do serviço manual.')
      return
    }

    const precoNormalizado = normalizeCurrencyInput(manualPreco)
    const precoConvertido = precoNormalizado === '' ? null : parseCurrencyInput(precoNormalizado)

    if (precoNormalizado !== '' && precoConvertido == null) {
      setError('Informe um valor válido para o serviço manual.')
      return
    }

    setServicosSelecionados(prev => [
      ...prev,
      {
        key: `manual:${generateEtapaId()}`,
        nome: manualNome.trim(),
        preco: precoConvertido,
        origem: 'manual',
        prazo_entrega: form.data_entrega_prometida,
        prazo_producao_dias: null,
        concluido: false,
        data_conclusao: '',
      },
    ])
    setManualNome('')
    setManualPreco('')
    setError('')
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
      lab_id:                 currentLab.id,
      empresa_id:             empresaId,
      user_id:                userId,
      tipo_trabalho:          trabalho.trim(),
      preco_servico:          Number.isFinite(precoConvertido) ? precoConvertido : null,
      paciente_nome:          form.paciente_nome.trim(),
      dentes:                 form.dentes.trim() || null,
      cor:                    form.cor || null,
      observacoes:            form.observacoes.trim() || null,
      status:                 envio?.status ?? colunas[0]?.nome ?? 'Enviado',
      data_envio:             form.data_envio || today(),
      data_entrega_prometida: form.data_entrega_prometida || null,
      data_consulta:          form.data_consulta || null,
      urgente:                form.urgente,
      etapas:                 servicosSelecionados.map(servico => ({
        id: servico.key,
        nome: servico.nome.trim(),
        preco: servico.preco,
        origem: servico.origem,
        prazo_entrega: servico.prazo_entrega || null,
        prazo_producao_dias: servico.prazo_producao_dias,
        concluido: servico.concluido,
        data_conclusao: servico.data_conclusao || null,
      })),
      pago:                   envio?.pago ?? false,
      data_pagamento:         envio?.data_pagamento ?? null,
    }

    if (envio) {
      const { error: err } = await supabase.from('lab_envios')
        .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', envio.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('lab_envios').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    onSaved(); onClose()
  }

  const stepTitles = ['Tipo de Trabalho', 'Dados do Caso', 'Datas', 'Revisão']
  const displayTrabalho = form.tipo_trabalho

  return (
    <Modal title={envio ? 'Editar Envio' : `Novo Envio${currentLab ? ` — ${currentLab.nome}` : ''}`} onClose={onClose} wide>
      {/* Step indicator */}
      <div className={styles.stepIndicator}>
        {stepTitles.map((t, i) => (
          <div key={t} className={`${styles.stepItem} ${i + 1 === step ? styles.stepActive : ''} ${i + 1 < step ? styles.stepDone : ''}`}>
            <div className={styles.stepDot}>{i + 1 < step ? '✓' : i + 1}</div>
            <span className={styles.stepLabel}>{t}</span>
          </div>
        ))}
      </div>

      {/* ── Step 1: Tipo de trabalho ── */}
      {step === 1 && (
        <div className={styles.stepContent}>
          {availableLabs.length > 1 && (
            <div className={styles.formField} style={{ marginBottom: 16 }}>
              <label className={styles.label}>Laboratório</label>
              <select
                className={styles.select}
                value={selectedLabId}
                onChange={e => {
                  setSelectedLabId(e.target.value)
                  setServicosSelecionados([])
                  setManualNome('')
                  setManualPreco('')
                }}
              >
                <option value="">Selecione o laboratório</option>
                {availableLabs.map(item => (
                  <option key={item.id} value={item.id}>{item.nome}</option>
                ))}
              </select>
            </div>
          )}
          {currentLab && currentPrecos.length === 0 && (
            <div className={styles.summaryAlert}>
              <IconAlert /> Este laboratório não tem produto ou serviço cadastrado na lista de preços. Você pode adicionar um serviço manual agora ou cadastrar os produtos depois.
            </div>
          )}
          <p className={styles.stepHint}>Selecione um ou mais serviços da lista de preços. Se precisar, adicione também um serviço manual.</p>
          <div className={styles.precosGrid}>
            {currentPrecos.map(p => (
              <button
                key={p.id}
                type="button"
                className={`${styles.precoOption} ${servicosSelecionados.some(servico => servico.key === `preco:${p.id}`) ? styles.precoOptionActive : ''}`}
                onClick={() => togglePreco(p)}
              >
                <span className={styles.precoOptionNome}>{p.nome_servico}</span>
                <span className={styles.precoOptionValor}>
                  {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </button>
            ))}
          </div>
          <div className={styles.manualServiceBox}>
            <div className={styles.manualServiceHeader}>
              <span>Adicionar serviço manual</span>
              <span>{servicosSelecionados.length} selecionado(s)</span>
            </div>
            <div className={styles.formGrid2}>
              <div className={styles.formField}>
                <label className={styles.label}>Descrição do serviço</label>
                <input className={styles.input} value={manualNome} onChange={e => setManualNome(e.target.value)} placeholder="Ex: Coroa de zircônia" />
              </div>
              <div className={styles.formField}>
                <label className={styles.label}>Valor (R$)</label>
                <input className={styles.input} value={manualPreco} onChange={e => setManualPreco(normalizeCurrencyInput(e.target.value))} placeholder="0,00" />
              </div>
            </div>
            <div className={styles.manualServiceActions}>
              <button type="button" className={styles.btnSecondary} onClick={addManualServico}>
                <IconPlus /> Adicionar serviço manual
              </button>
              <strong className={styles.manualServiceTotal}>
                Total: {(form.preco_servico.trim() === '' ? 0 : Number(form.preco_servico)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </strong>
            </div>
          </div>
          {servicosSelecionados.length > 0 && (
            <div className={styles.selectedServicesList}>
              {servicosSelecionados.map(servico => (
                <div key={servico.key} className={styles.selectedServiceItem}>
                  <div className={styles.selectedServiceMeta}>
                    <span className={styles.selectedServiceName}>{servico.nome}</span>
                    <span className={styles.selectedServicePrice}>
                      {servico.preco != null
                        ? servico.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : 'Sem valor'}
                    </span>
                  </div>
                  <button type="button" className={`${styles.btnIcon} ${styles.btnIconDanger}`} onClick={() => removeServico(servico.key)} title="Remover serviço">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          )}
          {currentLab && currentPrecos.length === 0 && (
            <p className={styles.stepHint} style={{ marginTop: 12 }}>
              Nenhum serviço na lista de preços. Adicione um serviço manual ou peça ao administrador para cadastrar os serviços.
            </p>
          )}
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
            <div className={`${styles.formField} ${styles.colSpan2}`}>
              <label className={styles.label}>Nome do paciente *</label>
              <input className={styles.input} value={form.paciente_nome} onChange={set('paciente_nome')} placeholder="Nome completo" />
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

      {/* ── Step 3: Datas ── */}
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
        </div>
      )}

      {/* ── Step 4: Revisão ── */}
      {step === 4 && (
        <div className={styles.stepContent}>
          <div className={styles.reviewGrid}>
            <ReviewRow label="Laboratório"    value={currentLab?.nome ?? 'Nao selecionado'} />
            <ReviewRow label="Tipo de trabalho" value={displayTrabalho || form.tipo_trabalho} />
            <ReviewRow label="Urgência" value={form.urgente ? 'Urgente' : 'Normal'} />
            {form.preco_servico && (
              <ReviewRow label="Valor" value={parseFloat(form.preco_servico.replace(',', '.')).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            )}
            <ReviewRow label="Paciente"    value={form.paciente_nome} />
            {form.dentes    && <ReviewRow label="Dentes"  value={form.dentes} />}
            {form.cor       && <ReviewRow label="Cor"     value={form.cor} />}
            {form.observacoes && <ReviewRow label="Observações" value={form.observacoes} />}
            <ReviewRow label="Data de envio"  value={formatDate(form.data_envio)} />
            <ReviewRow label="Prazo prometido" value={formatDate(form.data_entrega_prometida || null)} />
            {form.data_consulta && <ReviewRow label="Data da consulta" value={formatDate(form.data_consulta)} />}
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
        {step < 4 ? (
          <button type="button" className={styles.btnPrimary} onClick={nextStep}>Próximo</button>
        ) : (
          <button type="button" className={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : envio ? 'Salvar alterações' : 'Confirmar envio'}
          </button>
        )}
      </div>
    </Modal>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.reviewRow}>
      <span className={styles.reviewLabel}>{label}</span>
      <span className={styles.reviewValue}>{value}</span>
    </div>
  )
}

function EnvioResumoModal({ envio, labNome, feriados, precosByLab, isAdmin, onClose, onEdit, onTogglePago, onUpdateEtapa }: {
  envio: LabEnvio
  labNome?: string
  feriados?: string[]
  precosByLab?: Record<string, LabPreco[]>
  isAdmin: boolean
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

  const handleEtapaUpdate = async (
    etapaId: string,
    changes: Partial<Pick<LabEtapa, 'prazo_entrega' | 'concluido' | 'data_conclusao'>>,
  ) => {
    setSavingEtapaId(etapaId)
    await onUpdateEtapa(envio, etapaId, changes)
    setSavingEtapaId(prev => prev === etapaId ? null : prev)
  }

  return (
    <Modal title={`Resumo do trabalho — ${envio.paciente_nome}`} onClose={onClose} wide>
      <div className={styles.summaryGrid}>
        {labNome && <ReviewRow label="Laboratório" value={labNome} />}
        <ReviewRow label="Paciente" value={envio.paciente_nome} />
        <ReviewRow label="Resumo" value={getEnvioResumo(envio) || envio.tipo_trabalho} />
        <ReviewRow label="Status" value={envio.status} />
        <ReviewRow label="Data de envio" value={formatDate(envio.data_envio)} />
        <ReviewRow label="Prazo geral" value={formatDate(envio.data_entrega_prometida)} />
        {envio.data_consulta && <ReviewRow label="Data da consulta" value={formatDate(envio.data_consulta)} />}
        {envio.preco_servico != null && (
          <ReviewRow label="Valor" value={envio.preco_servico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
        )}
        <ReviewRow label="Pagamento" value={envio.pago ? `Pago em ${formatDate(envio.data_pagamento)}` : 'Pendente'} />
        {envio.observacoes && <ReviewRow label="Observações" value={envio.observacoes} />}
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
                  <input
                    className={`${styles.input} ${styles.inputReadonly}`}
                    type="text"
                    value={dataPrevista ? formatDate(dataPrevista) : '—'}
                    readOnly
                    disabled
                  />
                </label>
                <label className={styles.kanbanCardField}>
                  <span>Concluído em</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={etapa.data_conclusao ?? ''}
                    disabled={savingEtapa}
                    onChange={e => void handleEtapaUpdate(etapa.id, { data_conclusao: e.target.value || null })}
                  />
                </label>
              </div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={etapa.concluido}
                  disabled={savingEtapa}
                  onChange={e => void handleEtapaUpdate(etapa.id, { concluido: e.target.checked })}
                />
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

      <div className={styles.formActions}>
        <button type="button" className={styles.btnSecondary} onClick={onClose}>Fechar</button>
        <span style={{ flex: 1 }} />
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

function FinanceiroModal({ lab, envios, isAdmin, onClose, onTogglePago }: {
  lab: Lab
  envios: LabEnvio[]
  isAdmin: boolean
  onClose: () => void
  onTogglePago: (envio: LabEnvio) => Promise<void>
}) {
  const [filtro, setFiltro] = useState<FinanceiroFiltro>('todos')
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')

  const enviosComData = envios.filter(envio => {
    const dataReferencia = getFinanceiroReferenceDate(envio)
    if (!dataReferencia) return !dataInicial && !dataFinal
    if (dataInicial && dataReferencia < dataInicial) return false
    if (dataFinal && dataReferencia > dataFinal) return false
    return true
  })

  const filtered = enviosComData.filter(envio => {
    if (filtro === 'pagos') return envio.pago
    if (filtro === 'em_andamento') return !envio.pago
    return true
  })

  const totalEmAndamento = enviosComData.filter(envio => !envio.pago).reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)
  const totalPagos = enviosComData.filter(envio => envio.pago).reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)

  return (
    <Modal title={`Financeiro — ${lab.nome}`} onClose={onClose} wide>
      <div className={styles.financialSummary}>
        <div className={styles.financialCard}>
          <span>Valores em andamento</span>
          <strong>{totalEmAndamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </div>
        <div className={styles.financialCard}>
          <span>Valores já pagos</span>
          <strong>{totalPagos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
        </div>
      </div>

      <div className={styles.filterRow}>
        <button type="button" className={`${styles.filterChip} ${filtro === 'todos' ? styles.filterChipActive : ''}`} onClick={() => setFiltro('todos')}>Todos</button>
        <button type="button" className={`${styles.filterChip} ${filtro === 'em_andamento' ? styles.filterChipActive : ''}`} onClick={() => setFiltro('em_andamento')}>Em andamento</button>
        <button type="button" className={`${styles.filterChip} ${filtro === 'pagos' ? styles.filterChipActive : ''}`} onClick={() => setFiltro('pagos')}>Pagos</button>
      </div>

      <div className={styles.financialDateFilters}>
        <label className={styles.kanbanCardField}>
          <span>Data inicial</span>
          <input className={styles.input} type="date" value={dataInicial} onChange={e => setDataInicial(e.target.value)} />
        </label>
        <label className={styles.kanbanCardField}>
          <span>Data final</span>
          <input className={styles.input} type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)} />
        </label>
        <button type="button" className={styles.btnSecondary} onClick={() => { setDataInicial(''); setDataFinal('') }}>
          Limpar datas
        </button>
      </div>

      <div className={styles.financialList}>
        {filtered.length === 0 && <p className={styles.emptyMsg}>Nenhum trabalho nesse filtro.</p>}
        {filtered.map(envio => (
          <div key={envio.id} className={styles.financialRow}>
            <div className={styles.financialMeta}>
              <strong>{envio.paciente_nome}</strong>
              <span>{getEnvioResumo(envio) || envio.tipo_trabalho}</span>
              <small>{envio.status} · Referência: {formatDate(getFinanceiroReferenceDate(envio))}</small>
            </div>
            <div className={styles.financialActions}>
              <strong>{(envio.preco_servico ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
              <span className={envio.pago ? styles.paidBadge : styles.pendingBadge}>{envio.pago ? 'Pago' : 'Pendente'}</span>
              {isAdmin && (
                <button type="button" className={styles.btnSecondary} onClick={() => void onTogglePago(envio)}>
                  {envio.pago ? 'Desfazer' : 'Marcar pago'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Kanban Card ───────────────────────────────────────────────────────────

function KanbanCard({ envio, dragging, isAdmin, labNome, feriados, precosByLab, onDragStart, onOpenResumo, onEdit, onDelete }: {
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
  const etapasPrevistas = etapas
    .map(etapa => ({
      etapa,
      date: getEtapaDataPrevista(envio, etapa, feriados ?? [], precosByLab),
    }))
    .filter((item): item is { etapa: LabEtapa; date: string } => Boolean(item.date))

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
      {envio.data_entrega_prometida && (
        <div className={`${styles.kanbanCardDate} ${overdue ? styles.kanbanCardDateOverdue : ''}`}>
          <IconClock /> {formatDate(envio.data_entrega_prometida)}
        </div>
      )}
      {etapasPrevistas.length > 0 && (
        <div className={styles.kanbanCardEtapaDates}>
          {etapasPrevistas.map(({ etapa, date }) => {
            const etapaAtrasada = !etapa.concluido && date < today()
            return (
              <div
                key={etapa.id}
                className={`${styles.kanbanCardEtapaDate} ${etapaAtrasada ? styles.kanbanCardEtapaDateOverdue : ''}`}
                title={`${etapa.nome}: ${formatDate(date)}`}
              >
                <span>{etapa.nome}</span>
                <strong>Previsto {formatDate(date)}</strong>
              </div>
            )
          })}
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

function KanbanBoard({ envios, colunas, isAdmin, showLabName, getLabName, getLabFeriados, precosByLab, onMoveEnvio, onOpenResumo, onEditEnvio, onDeleteEnvio }: {
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

function LabDetailView({ lab, empresaId, userId, isAdmin, colunas, onBack, onLabUpdated, onColunasUpdated }: {
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
  const [showEnvioSteps,  setShowEnvioSteps]  = useState(false)
  const [editingEnvio,    setEditingEnvio]    = useState<LabEnvio | null>(null)
  const [resumoEnvio,     setResumoEnvio]     = useState<LabEnvio | null>(null)
  const [showEditLab,     setShowEditLab]     = useState(false)
  const [showPrecos,      setShowPrecos]      = useState(false)
  const [showKanbanCfg,   setShowKanbanCfg]   = useState(false)
  const [editingPrecoId,  setEditingPrecoId]  = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useSessionStorageState(
    `${storagePrefix}:patient-search`,
    '',
    isString,
  )
  const [novoFeriado,     setNovoFeriado]     = useState('')

  const fetchEnvios = useCallback(async () => {
    const { data } = await supabase
      .from('lab_envios').select('*')
      .eq('lab_id', lab.id).order('created_at', { ascending: false })
    if (data) setEnvios(data)
    setLoading(false)
  }, [lab.id])

  const fetchPrecos = useCallback(async () => {
    const { data } = await supabase
      .from('lab_precos').select('*')
      .eq('lab_id', lab.id).eq('ativo', true).order('nome_servico')
    if (data) setPrecos(data)
  }, [lab.id])

  useEffect(() => { fetchEnvios(); fetchPrecos() }, [fetchEnvios, fetchPrecos])

  const moveEnvio = async (envioId: string, status: string) => {
    await supabase.from('lab_envios').update({ status, updated_at: new Date().toISOString() }).eq('id', envioId)
    setEnvios(prev => prev.map(e => e.id === envioId ? { ...e, status } : e))
  }

  const deleteEnvio = async (envioId: string) => {
    if (!confirm('Excluir este envio?')) return
    await supabase.from('lab_envios').delete().eq('id', envioId)
    setEnvios(prev => prev.filter(e => e.id !== envioId))
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

  const filteredEnvios = envios.filter(envio =>
    envio.paciente_nome.toLowerCase().includes(patientSearch.toLowerCase()),
  )

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
                        title="Editar preÃ§o"
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
      {showEditLab && (
        <LabModal lab={lab} empresaId={empresaId}
          onClose={() => setShowEditLab(false)} onSaved={onLabUpdated} />
      )}
      {showPrecos && (
        <PrecosModal lab={lab}
          initialEditingId={editingPrecoId}
          onClose={() => {
            setShowPrecos(false)
            setEditingPrecoId(null)
          }}
          onSaved={fetchPrecos}
        />
      )}
      {showKanbanCfg && (
        <KanbanConfigModal empresaId={empresaId} colunas={colunas}
          onClose={() => setShowKanbanCfg(false)} onSaved={onColunasUpdated} />
      )}
      {resumoEnvio && (
        <EnvioResumoModal
          envio={resumoEnvio}
          isAdmin={isAdmin}
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
    </div>
  )
}

function LabsAggregateDetailView({
  labs,
  empresaId,
  userId,
  isAdmin,
  colunas,
  onBack,
  onColunasUpdated,
}: {
  labs: Lab[]
  empresaId: string
  userId: string
  isAdmin: boolean
  colunas: LabKanbanColuna[]
  onBack: () => void
  onColunasUpdated: () => void
}) {
  const storagePrefix = `lab-control:${empresaId}:aggregate`
  const [envios,         setEnvios]         = useState<LabEnvio[]>([])
  const [precosByLab,    setPrecosByLab]    = useState<Record<string, LabPreco[]>>({})
  const [loading,        setLoading]        = useState(true)
  const [showEnvioSteps, setShowEnvioSteps] = useState(false)
  const [editingEnvio,   setEditingEnvio]   = useState<LabEnvio | null>(null)
  const [resumoEnvio,    setResumoEnvio]    = useState<LabEnvio | null>(null)
  const [showKanbanCfg,  setShowKanbanCfg]  = useState(false)
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

  const labsById = Object.fromEntries(labs.map(item => [item.id, item]))

  const fetchEnvios = useCallback(async () => {
    const { data } = await supabase
      .from('lab_envios')
      .select('*')
      .eq('empresa_id', empresaId)
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

  useEffect(() => {
    setLoading(true)
    void Promise.all([fetchEnvios(), fetchPrecos()]).then(() => setLoading(false))
  }, [fetchEnvios, fetchPrecos])

  useEffect(() => {
    if (labFilterId === LAB_FILTER_ALL) return

    if (!labs.some(item => item.id === labFilterId)) {
      setLabFilterId(LAB_FILTER_ALL)
    }
  }, [labFilterId, labs, setLabFilterId])

  const moveEnvio = async (envioId: string, status: string) => {
    await supabase.from('lab_envios').update({ status, updated_at: new Date().toISOString() }).eq('id', envioId)
    setEnvios(prev => prev.map(item => item.id === envioId ? { ...item, status } : item))
  }

  const deleteEnvio = async (envioId: string) => {
    if (!confirm('Excluir este envio?')) return
    await supabase.from('lab_envios').delete().eq('id', envioId)
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
    return true
  })

  const overdueCount = envios.filter(isOverdue).length
  const aggregateLabCount = new Set(visibleEnvios.map(envio => envio.lab_id)).size

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <IconBack /> Voltar
        </button>
        <div className={styles.labDetailTitle}>
          <h1 className={styles.pageTitle}>Todos os laboratórios</h1>
          {overdueCount > 0 && (
            <span className={styles.overdueBadge}>
              <IconAlert /> {overdueCount} atrasado{overdueCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className={styles.headerMetaBadge}>{labs.length} laboratórios ativos</span>
        <div className={styles.headerActions}>
          {isAdmin && (
            <button type="button" className={styles.btnSecondary} onClick={() => setShowKanbanCfg(true)}>
              <IconSettings2 /> Kanban
            </button>
          )}
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
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${styles.tabActive}`}>
          Kanban ({visibleEnvios.length})
        </button>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className={styles.searchRow}>
            <input
              className={`${styles.input} ${styles.searchGrow}`}
              value={patientSearch}
              onChange={e => setPatientSearch(e.target.value)}
              placeholder="Buscar paciente no kanban"
            />
            <select
              className={styles.select}
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
          </div>

          <div className={styles.aggregateFilterHint}>
            {labFilterId === LAB_FILTER_ALL
              ? `Exibindo ${visibleEnvios.length} trabalhos distribuídos em ${aggregateLabCount} laboratório(s).`
              : `Filtrado para ${labsById[labFilterId]?.nome ?? 'laboratório selecionado'}.`}
          </div>

          <KanbanBoard
            envios={visibleEnvios}
            colunas={colunas}
            isAdmin={isAdmin}
            showLabName
            getLabName={labId => labsById[labId]?.nome ?? 'Laboratório removido'}
            getLabFeriados={labId => labsById[labId] ? getLabFeriados(labsById[labId]) : []}
            precosByLab={precosByLab}
            onMoveEnvio={moveEnvio}
            onOpenResumo={setResumoEnvio}
            onEditEnvio={envio => { setEditingEnvio(envio); setShowEnvioSteps(true) }}
            onDeleteEnvio={deleteEnvio}
          />
        </>
      )}

      {showEnvioSteps && (
        <EnvioSteps
          lab={editingEnvio ? (labsById[editingEnvio.lab_id] ?? null) : (labFilterId !== LAB_FILTER_ALL ? (labsById[labFilterId] ?? null) : null)}
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
      {showKanbanCfg && (
        <KanbanConfigModal
          empresaId={empresaId}
          colunas={colunas}
          onClose={() => setShowKanbanCfg(false)}
          onSaved={onColunasUpdated}
        />
      )}
      {resumoEnvio && (
        <EnvioResumoModal
          envio={resumoEnvio}
          labNome={labsById[resumoEnvio.lab_id]?.nome}
          feriados={labsById[resumoEnvio.lab_id] ? getLabFeriados(labsById[resumoEnvio.lab_id]) : []}
          precosByLab={precosByLab}
          isAdmin={isAdmin}
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
    </div>
  )
}

// ── CalendarView ──────────────────────────────────────────────────────────

function CalendarView({ envios, precosByLab, labs, onClose }: {
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
          return (
            <div key={dateStr} className={styles.calendarCell}>
              <span className={styles.calendarDayNum}>{day}</span>
              {dayEvents.map((ev, idx) => (
                <div key={`${ev.envioId}-${idx}`} className={styles.calendarEvent} title={`${ev.pacienteNome} — ${ev.servicoNome} (${ev.labNome})`}>
                  <span className={styles.calendarEventPatient}>{ev.pacienteNome}</span>
                  <span className={styles.calendarEventService}>{ev.servicoNome}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
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

// ── Lab Card (lista principal) ─────────────────────────────────────────────

function LabCard({ lab, envios, isAdmin, colunas, onClick, onEdit, onOpenFinanceiro }: {
  lab: Lab; envios: LabEnvio[]; isAdmin: boolean; colunas: LabKanbanColuna[]
  onClick: () => void; onEdit: (e: React.MouseEvent) => void; onOpenFinanceiro: (e: React.MouseEvent) => void
}) {
  const overdue = envios.filter(isOverdue).length
  const enviosEmAndamento = envios.filter(e => !['Concluído', 'Entregue'].includes(e.status))
  const active  = enviosEmAndamento.length
  const valorEmAndamento = enviosEmAndamento.reduce((total, envio) => total + (envio.preco_servico ?? 0), 0)
  const recent  = [...envios].slice(0, 5)
  const whatsappUrl = lab.telefone ? buildWhatsAppUrl(lab.telefone) : null

  return (
    <div className={styles.labCard} onClick={onClick}>
      <div className={styles.labCardHeader}>
        <div className={styles.labCardName}>{lab.nome}</div>
        <div className={styles.labCardHeaderActions}>
          {whatsappUrl && (
            <button
              type="button"
              className={`${styles.btnIcon} ${styles.btnIconWhatsApp}`}
              onClick={e => {
                e.stopPropagation()
                window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
              }}
              title="Abrir no WhatsApp"
            >
              <IconWhatsApp />
            </button>
          )}
          {isAdmin && (
            <button type="button" className={styles.btnIcon} onClick={onEdit} title="Editar laboratório">
              <IconEdit />
            </button>
          )}
        </div>
      </div>

      <div className={styles.labCardContact}>
        {lab.telefone && <span className={styles.labCardContactItem}><IconPhone /> {formatWhatsAppNumber(lab.telefone)}</span>}
        {lab.email    && <span className={styles.labCardContactItem}><IconMail /> {lab.email}</span>}
        {lab.prazo_medio_dias > 0 && (
          <span className={styles.labCardContactItem}><IconClock /> {lab.prazo_medio_dias}d prazo médio</span>
        )}
      </div>

      <div className={styles.labCardStats}>
        <div className={styles.labCardStat}>
          <span className={styles.labCardStatNum}>{envios.length}</span>
          <span className={styles.labCardStatLabel}>total</span>
        </div>
        <div className={styles.labCardStat}>
          <span className={styles.labCardStatNum}>{active}</span>
          <span className={styles.labCardStatLabel}>em andamento</span>
        </div>
        <div className={`${styles.labCardStat} ${styles.labCardStatOverdue}`}>
          <span className={styles.labCardStatNum}>{overdue}</span>
          <span className={styles.labCardStatLabel}>atrasados</span>
        </div>
      </div>

      <div className={styles.labCardValueSummary}>
        <span className={styles.labCardValueLabel}>Valores em andamento</span>
        <strong className={styles.labCardValueAmount}>
          {valorEmAndamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </strong>
      </div>
      <button type="button" className={styles.btnSecondary} onClick={onOpenFinanceiro}>
        Ver financeiro
      </button>

      {/* Mini kanban status bars */}
      {envios.length > 0 && (
        <div className={styles.labCardStatusBar}>
          {[...colunas].sort((a, b) => a.ordem - b.ordem).map(col => {
            const count = envios.filter(e => e.status === col.nome).length
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

      {/* Recent envios list */}
      {recent.length > 0 && (
        <div className={styles.labCardEnvios}>
          {recent.map(e => (
            <div key={e.id} className={`${styles.labCardEnvioItem} ${isOverdue(e) ? styles.labCardEnvioOverdue : ''}`}>
              <span className={styles.labCardEnvioPatient}>{e.paciente_nome}</span>
              <span className={styles.labCardEnvioType}>{getEnvioResumo(e) || e.tipo_trabalho}</span>
              {e.data_entrega_prometida && (
                <span className={styles.labCardEnvioDate}>{formatDate(e.data_entrega_prometida)}</span>
              )}
            </div>
          ))}
          {envios.length > 5 && (
            <div className={styles.labCardMore}>+{envios.length - 5} trabalhos</div>
          )}
        </div>
      )}

      {envios.length === 0 && (
        <div className={styles.labCardEmpty}>Nenhum envio ainda. Clique para abrir.</div>
      )}
    </div>
  )
}

// ── Main: LabControlPage ──────────────────────────────────────────────────

function TodosLabsCard({ labs, envios, colunas, getLabName, onClick }: {
  labs: Lab[]
  envios: LabEnvio[]
  colunas: LabKanbanColuna[]
  getLabName: (labId: string) => string
  onClick: () => void
}) {
  const metrics = getEnvioMetrics(envios)
  const recent = envios.slice(0, 5)

  return (
    <div className={`${styles.labCard} ${styles.labCardAggregate}`} onClick={onClick}>
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
          <strong>{metrics.total}</strong>
          <span>trabalhos</span>
        </div>
        <div className={styles.aggregateKpiCard}>
          <strong>{metrics.emAndamento}</strong>
          <span>em andamento</span>
        </div>
        <div className={`${styles.aggregateKpiCard} ${styles.aggregateKpiCardAlert}`}>
          <strong>{metrics.overdue}</strong>
          <span>atrasados</span>
        </div>
        <div className={styles.aggregateKpiCard}>
          <strong>{metrics.pagos}</strong>
          <span>pagos</span>
        </div>
        <div className={styles.aggregateKpiCard}>
          <strong>{metrics.ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
          <span>ticket médio</span>
        </div>
      </div>

      <div className={styles.labCardValueSummary}>
        <span className={styles.labCardValueLabel}>Valores em andamento</span>
        <strong className={styles.labCardValueAmount}>
          {metrics.valorEmAndamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
    </div>
  )
}

export default function LabControlPage({ userId, empresa, onTrocarEmpresa, onVoltar }: {
  userId: string; empresa: Empresa; onTrocarEmpresa: () => void; onVoltar: () => void
}) {
  const storagePrefix = `lab-control:${empresa.id}`
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [labs,         setLabs]         = useState<Lab[]>([])
  const [enviosMap,    setEnviosMap]    = useState<Record<string, LabEnvio[]>>({})
  const [precosByLab,  setPrecosByLab]  = useState<Record<string, LabPreco[]>>({})
  const [colunas,      setColunas]      = useState<LabKanbanColuna[]>([])
  const [selectedViewPersisted, setSelectedViewPersisted] = useSessionStorageState<LabViewSelectionPersisted | null>(
    `${storagePrefix}:selected-view`,
    null,
    isLabViewSelectionPersisted,
  )
  const [selectedView, setSelectedView] = useState<LabViewSelection | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [showLabModal, setShowLabModal] = useState(false)
  const [editingLab,   setEditingLab]   = useState<Lab | null>(null)
  const [financeiroLab, setFinanceiroLab] = useState<Lab | null>(null)
  const [calendarMode, setCalendarMode] = useState(false)

  useEffect(() => {
    const validarAcesso = async () => {
      // Verifica se a empresa ainda existe
      const { data: empresaExiste } = await supabase
        .from('empresas')
        .select('id')
        .eq('id', empresa.id)
        .eq('ativo', true)
        .maybeSingle()

      if (!empresaExiste) {
        onTrocarEmpresa()
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      const adminSistema = profile?.role === 'admin'

      if (!adminSistema) {
        const { data: membro } = await supabase
          .from('empresa_membros')
          .select('role')
          .eq('empresa_id', empresa.id)
          .eq('user_id', userId)
          .maybeSingle()

        if (!membro) {
          onTrocarEmpresa()
          return
        }

        setIsAdmin(membro.role === 'admin')
        return
      }

      setIsAdmin(true)
    }

    void validarAcesso()
  }, [empresa.id, onTrocarEmpresa, userId])

  const fetchPrecosForLabs = useCallback(async (targetLabs: Lab[]) => {
    if (targetLabs.length === 0) {
      setPrecosByLab({})
      return
    }

    const { data } = await supabase
      .from('lab_precos')
      .select('*')
      .in('lab_id', targetLabs.map(item => item.id))
      .eq('ativo', true)
      .order('nome_servico')

    const nextMap: Record<string, LabPreco[]> = {}
    for (const preco of data ?? []) {
      if (!nextMap[preco.lab_id]) nextMap[preco.lab_id] = []
      nextMap[preco.lab_id].push(preco)
    }
    setPrecosByLab(nextMap)
  }, [])

  const fetchLabs = useCallback(async () => {
    const { data } = await supabase
      .from('labs').select('*')
      .eq('empresa_id', empresa.id).eq('ativo', true).order('nome')
    if (data) {
      setLabs(data)
      await fetchPrecosForLabs(data)
      setSelectedView(prev => {
        if (!prev) return prev
        if (prev.kind === 'all') return prev
        const updatedLab = data.find(item => item.id === prev.lab.id)
        return updatedLab ? { kind: 'lab', lab: updatedLab } : null
      })
      setFinanceiroLab(prev => prev ? data.find(item => item.id === prev.id) ?? prev : prev)
    }
  }, [empresa.id, fetchPrecosForLabs])

  const fetchEnvios = useCallback(async () => {
    const { data } = await supabase
      .from('lab_envios').select('*')
      .eq('empresa_id', empresa.id).order('created_at', { ascending: false })
    if (data) {
      const map: Record<string, LabEnvio[]> = {}
      for (const e of data) {
        if (!map[e.lab_id]) map[e.lab_id] = []
        map[e.lab_id].push(e)
      }
      setEnviosMap(map)
    }
  }, [empresa.id])

  const togglePagoEnvioLista = async (envio: LabEnvio) => {
    const nextPago = !envio.pago
    const payload = {
      pago: nextPago,
      data_pagamento: nextPago ? today() : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('lab_envios').update(payload).eq('id', envio.id)
    if (error) return
    setEnviosMap(prev => ({
      ...prev,
      [envio.lab_id]: (prev[envio.lab_id] ?? []).map(item => item.id === envio.id ? { ...item, ...payload } : item),
    }))
  }

  const fetchColunas = useCallback(async () => {
    const { data } = await supabase
      .from('lab_kanban_colunas').select('*')
      .eq('empresa_id', empresa.id).order('ordem')

    if (data && data.length > 0) {
      setColunas(data)
    } else {
      // Cria colunas padrão para a empresa
      const defaults = DEFAULT_COLUNAS.map(c => ({ ...c, empresa_id: empresa.id }))
      const { data: inserted } = await supabase.from('lab_kanban_colunas').insert(defaults).select()
      if (inserted) setColunas(inserted)
    }
  }, [empresa.id])

  useEffect(() => {
    setSelectedView(null)
    setLabs([])
    setEnviosMap({})
    setPrecosByLab({})
    setColunas([])
    setLoading(true)
    Promise.all([fetchLabs(), fetchEnvios(), fetchColunas()]).then(() => setLoading(false))
  }, [fetchLabs, fetchEnvios, fetchColunas])

  useEffect(() => {
    if (loading) return

    if (!selectedViewPersisted) {
      setSelectedView(null)
      return
    }

    if (selectedViewPersisted.kind === 'all') {
      setSelectedView({ kind: 'all' })
      return
    }

    const restoredLab = labs.find(item => item.id === selectedViewPersisted.labId)
    if (!restoredLab) {
      setSelectedView(null)
      setSelectedViewPersisted(null)
      return
    }

    setSelectedView({ kind: 'lab', lab: restoredLab })
  }, [labs, loading, selectedViewPersisted, setSelectedViewPersisted])

  const abrirVisaoTodos = () => {
    setSelectedView({ kind: 'all' })
    setSelectedViewPersisted({ kind: 'all' })
  }

  const abrirVisaoLab = (lab: Lab) => {
    setSelectedView({ kind: 'lab', lab })
    setSelectedViewPersisted({ kind: 'lab', labId: lab.id })
  }

  const voltarParaLista = () => {
    setSelectedView(null)
    setSelectedViewPersisted(null)
    void fetchEnvios()
    void fetchPrecosForLabs(labs)
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <button type="button" className={styles.backBtn} onClick={onVoltar}><IconBack /> Voltar</button>
          <h1 className={styles.pageTitle}>Controle de Laboratórios</h1>
        </div>
        <Spinner />
      </div>
    )
  }

  // Detalhe do lab selecionado
  if (selectedView) {
    if (selectedView.kind === 'all') {
      return (
        <LabsAggregateDetailView
          labs={labs}
          empresaId={empresa.id}
          userId={userId}
          isAdmin={isAdmin}
          colunas={colunas}
          onBack={voltarParaLista}
          onColunasUpdated={fetchColunas}
        />
      )
    }

    return (
      <LabDetailView
        lab={selectedView.lab}
        empresaId={empresa.id}
        userId={userId}
        isAdmin={isAdmin}
        colunas={colunas}
        onBack={voltarParaLista}
        onLabUpdated={() => { fetchLabs() }}
        onColunasUpdated={fetchColunas}
      />
    )
  }

  // Lista de labs
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onVoltar}>
          <IconBack /> Voltar
        </button>
        <h1 className={styles.pageTitle}>Controle de Laboratórios</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Empresa: <strong style={{ color: 'var(--text)' }}>{empresa.nome}</strong>
        </span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={onTrocarEmpresa}>
            Trocar empresa
          </button>
          <button
            type="button"
            className={`${styles.btnSecondary} ${calendarMode ? styles.btnSecondaryActive : ''}`}
            onClick={() => setCalendarMode(v => !v)}
          >
            <IconCalendar /> {calendarMode ? 'Fechar Calendário' : 'Modo Calendário'}
          </button>
          {isAdmin && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => { setEditingLab(null); setShowLabModal(true) }}
            >
              <IconPlus /> Novo laboratório
            </button>
          )}
        </div>
      </div>

      {labs.length === 0 ? (
        <div className={styles.emptyState}>
          <IconFlask />
          <p>Nenhum laboratório cadastrado.</p>
          {isAdmin && (
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => { setEditingLab(null); setShowLabModal(true) }}
            >
              <IconPlus /> Cadastrar primeiro laboratório
            </button>
          )}
        </div>
      ) : calendarMode ? (
        <CalendarView
          envios={sortEnviosByCreatedAt(Object.values(enviosMap).flat())}
          precosByLab={precosByLab}
          labs={labs}
          onClose={() => setCalendarMode(false)}
        />
      ) : (
        <div className={styles.labsGrid}>
          <TodosLabsCard
            labs={labs}
            envios={sortEnviosByCreatedAt(Object.values(enviosMap).flat())}
            colunas={colunas}
            getLabName={labId => labs.find(item => item.id === labId)?.nome ?? 'Laboratório removido'}
            onClick={abrirVisaoTodos}
          />
          {labs.map(lab => (
            <LabCard
              key={lab.id}
              lab={lab}
              envios={enviosMap[lab.id] ?? []}
              isAdmin={isAdmin}
              colunas={colunas}
              onClick={() => abrirVisaoLab(lab)}
              onEdit={e => { e.stopPropagation(); setEditingLab(lab); setShowLabModal(true) }}
              onOpenFinanceiro={e => { e.stopPropagation(); setFinanceiroLab(lab) }}
            />
          ))}
        </div>
      )}

      {showLabModal && (
        <LabModal
          lab={editingLab}
          empresaId={empresa.id}
          onClose={() => setShowLabModal(false)}
          onSaved={fetchLabs}
        />
      )}
      {financeiroLab && (
        <FinanceiroModal
          lab={financeiroLab}
          envios={enviosMap[financeiroLab.id] ?? []}
          isAdmin={isAdmin}
          onClose={() => setFinanceiroLab(null)}
          onTogglePago={togglePagoEnvioLista}
        />
      )}
    </div>
  )
}
