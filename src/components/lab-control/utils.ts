import { supabase } from '../../lib/supabase'
import type { Lab, LabPreco, LabEnvio } from '../../lib/types'
import { FINAL_ENVIO_STATUSES, type LabEtapa } from './constants'
export type { LabEtapa } from './constants'

export function today() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function getLabFeriados(lab: Lab) {
  return Array.isArray(lab.feriados) ? lab.feriados.filter((item): item is string => typeof item === 'string') : []
}

export function addBusinessDays(startDate: string, businessDays: number, feriados: string[] = []) {
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
export const MARGEM_INTERNA_DIAS = 2

export function calcularPrazoEntrega(
  dataEnvio: string,
  servicos: Array<{ prazo_producao_dias: number | null }>,
  feriados: string[],
  prazoMedioDias: number,
): string {
  const prazos = servicos
    .map(s => s.prazo_producao_dias)
    .filter((p): p is number => p !== null && p > 0)
  const diasLab = prazos.length > 0 ? Math.max(...prazos) : prazoMedioDias
  if (!diasLab) return ''
  return addBusinessDays(dataEnvio, diasLab + MARGEM_INTERNA_DIAS, feriados)
}

// Calculates the expected completion date for a service step
export function calcularDataPrevista(
  dataEnvio: string,
  prazoProducaoDias: number | null,
  feriados: string[],
): string | null {
  if (!prazoProducaoDias || !dataEnvio) return null
  return addBusinessDays(dataEnvio, prazoProducaoDias, feriados)
}

export function normalizeServicoNome(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR')
}

export function getEtapaPrazoProducaoDias(
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

export function getEtapaDataPrevista(
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

export function getEnvioEtapas(envio: LabEnvio): LabEtapa[] {
  if (Array.isArray(envio.etapas) && envio.etapas.length > 0) {
    return envio.etapas.map((raw, index) => {
      const etapa = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
      return {
        id: typeof etapa.id === 'string' ? etapa.id : `etapa-${envio.id}-${index}`,
        nome: typeof etapa.nome === 'string' ? etapa.nome : envio.tipo_trabalho,
        preco: typeof etapa.preco === 'number' ? etapa.preco : envio.preco_servico,
        quantidade: typeof etapa.quantidade === 'number' ? etapa.quantidade : 1,
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
    quantidade: 1,
    origem: 'manual',
    prazo_entrega: envio.data_entrega_prometida,
    prazo_producao_dias: null,
    concluido: Boolean(envio.data_entrega_real),
    data_conclusao: envio.data_entrega_real,
  }]
}

export function getOverdueEtapas(envio: LabEnvio) {
  return getEnvioEtapas(envio).filter(etapa =>
    !etapa.concluido &&
    Boolean(etapa.prazo_entrega) &&
    etapa.prazo_entrega! < today(),
  )
}

export function getEnvioResumo(envio: LabEnvio) {
  return getEnvioEtapas(envio)
    .map(etapa => etapa.nome)
    .filter(Boolean)
    .join(' + ')
}

export function applyEtapaChanges(etapa: LabEtapa, changes: Partial<Pick<LabEtapa, 'prazo_entrega' | 'concluido' | 'data_conclusao'>>) {
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

export function serializeLabEtapas(etapas: LabEtapa[]) {
  return etapas.map(etapa => ({
    id: etapa.id,
    nome: etapa.nome,
    preco: etapa.preco,
    quantidade: etapa.quantidade,
    origem: etapa.origem,
    prazo_entrega: etapa.prazo_entrega,
    prazo_producao_dias: etapa.prazo_producao_dias,
    concluido: etapa.concluido,
    data_conclusao: etapa.data_conclusao,
  }))
}

export function getEnvioDataEntregaRealFromEtapas(etapas: LabEtapa[]) {
  if (etapas.length === 0 || etapas.some(etapa => !etapa.concluido)) return null

  const datasConcluidas = etapas
    .map(etapa => etapa.data_conclusao || today())
    .sort()

  return datasConcluidas[datasConcluidas.length - 1] ?? null
}

export function sortEnviosByCreatedAt(envios: LabEnvio[]) {
  return [...envios].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function isFinalEnvioStatus(status: string) {
  return FINAL_ENVIO_STATUSES.includes(status)
}

export function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('55')) {
    return digits.length === 12 || digits.length === 13 ? digits : null
  }

  return digits.length === 10 || digits.length === 11 ? `55${digits}` : null
}

export function formatWhatsAppNumber(value: string) {
  const normalized = normalizeWhatsAppNumber(value)
  if (!normalized) return value

  const area = normalized.slice(2, 4)
  const number = normalized.slice(4)

  if (number.length === 9) {
    return `(${area}) ${number.slice(0, 5)}-${number.slice(5)}`
  }

  return `(${area}) ${number.slice(0, 4)}-${number.slice(4)}`
}

export function formatWhatsAppInput(value: string) {
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

export function buildWhatsAppUrl(value: string) {
  const normalized = normalizeWhatsAppNumber(value)
  return normalized ? `https://wa.me/${normalized}` : null
}

export function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function isOverdue(envio: LabEnvio) {
  if (getOverdueEtapas(envio).length > 0) return true
  if (!envio.data_entrega_prometida) return false
  if (isFinalEnvioStatus(envio.status)) return false
  return envio.data_entrega_prometida < today()
}

// Formats a digit string as Brazilian currency mask: "12399" → "R$ 123,99"
export function formatCurrencyMask(digits: string): string {
  const onlyDigits = digits.replace(/\D/g, '')
  if (!onlyDigits) return ''
  const num = parseInt(onlyDigits, 10)
  return (num / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Parses a masked currency string back to a decimal number: "R$ 123,99" → 123.99
export function parseMaskedCurrency(masked: string): number {
  const onlyDigits = masked.replace(/\D/g, '')
  if (!onlyDigits) return 0
  return parseInt(onlyDigits, 10) / 100
}

// ── Historico auditavel ───────────────────────────────────────────────────

export async function registrarHistorico(
  envioId: string,
  empresaId: string,
  userId: string,
  tipoAcao: string,
  detalhe?: string | null,
) {
  await supabase.from('lab_historico').insert({
    envio_id:   envioId,
    empresa_id: empresaId,
    user_id:    userId,
    tipo_acao:  tipoAcao,
    detalhe:    detalhe ?? null,
  })
}

// ── Briefing WhatsApp ─────────────────────────────────────────────────────

export function buildBriefingText(envio: LabEnvio, labNome: string): string {
  const lines: string[] = [
    `*Envio para laboratório: ${labNome}*`,
    `Paciente: ${envio.paciente_nome}`,
    envio.dentista_nome ? `Dentista: ${envio.dentista_nome}` : '',
    `Serviço: ${envio.tipo_trabalho}`,
    envio.dentes ? `Dentes: ${envio.dentes}` : '',
    envio.cor ? `Cor/Shade: ${envio.cor}` : '',
    `Data de envio: ${formatDate(envio.data_envio)}`,
    envio.data_entrega_prometida ? `Prazo prometido: ${formatDate(envio.data_entrega_prometida)}` : '',
    envio.urgente ? '⚠️ URGENTE' : '',
    envio.observacoes ? `Observações: ${envio.observacoes}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

// ── Calendar helpers ───────────────────────────────────────────────────────

export type CalendarEvent = {
  envioId: string
  pacienteNome: string
  servicoNome: string
  labNome: string
  status: string
  dataEnvio: string
  dataEntregaPrometida: string | null
  urgente: boolean
  valor: number | null
  dentes: string | null
  cor: string | null
  date: string // ISO YYYY-MM-DD
}

// Builds calendar events from all active envios
export function buildCalendarEvents(
  envios: LabEnvio[],
  precosByLab: Record<string, LabPreco[]>,
  labsById: Record<string, Lab>,
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  for (const envio of envios) {
    if (isFinalEnvioStatus(envio.status)) continue
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
        status: envio.status,
        dataEnvio: envio.data_envio,
        dataEntregaPrometida: envio.data_entrega_prometida,
        urgente: envio.urgente,
        valor: etapa.preco,
        dentes: envio.dentes,
        cor: envio.cor,
        date,
      })
    }
  }
  return events
}
