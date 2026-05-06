export const DEFAULT_COLUNAS = [
  { nome: 'Pré-envio',               ordem: 0, cor: '#f59e0b' },
  { nome: 'Envio / Em laboratório',  ordem: 1, cor: '#3b82f6' },
  { nome: 'Anexos',                  ordem: 2, cor: '#8b5cf6' },
  { nome: 'Agendamento do paciente', ordem: 3, cor: '#ec4899' },
  { nome: 'Instalado',               ordem: 4, cor: '#10b981' },
]

export const DEFAULT_ENVIO_STATUS = 'Pré-envio'
export const FINAL_ENVIO_STATUSES = ['Instalado', 'Concluído', 'Entregue']

export const KANBAN_PAGE_SIZE = 5

export const SHADE_OPTIONS = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
  'BL', 'OM', 'Outro',
]

export type LabEtapa = {
  id: string
  nome: string
  preco: number | null
  quantidade: number
  origem: 'catalogo' | 'manual'
  prazo_entrega: string | null
  prazo_producao_dias: number | null
  concluido: boolean
  data_conclusao: string | null
}

import type { Lab } from '../../lib/types'

export type LabViewSelection = { kind: 'lab'; lab: Lab } | { kind: 'all' }
export type LabHomeMode = 'kanban' | 'calendar' | 'list'

export const LAB_FILTER_ALL      = '__all__'
export const DENTISTA_FILTER_ALL = '__dentista_all__'

export const CLASSIFICACAO_PROTESE_OPTIONS = ['Removível', 'Fixa', 'Sobre Implante', 'Ortodôntico', 'Clínico'] as const

export const FORMA_ENVIO_OPTIONS = ['Motoboy', 'WhatsApp', 'E-mail', 'Retirada pelo laboratório', 'Outro'] as const
export const FORMA_RECEBIMENTO_OPTIONS = ['Motoboy', 'WhatsApp', 'E-mail', 'Entrega pelo laboratório', 'Outro'] as const
export const HOME_MODE_OPTIONS = [
  { value: 'kanban', label: 'Kanban', icon: null },
  { value: 'calendar', label: 'Calendário', icon: 'calendar' },
  { value: 'list', label: 'Lista', icon: 'list' },
] as const
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isLabDetailTab(value: unknown): value is 'kanban' | 'info' {
  return value === 'kanban' || value === 'info'
}
