export const DEFAULT_COLUNAS = [
  { nome: 'Pré-envio',               ordem: 0, cor: '#f59e0b' },
  { nome: 'Envio / Em laboratório',  ordem: 1, cor: '#3b82f6' },
  { nome: 'Anexos',                  ordem: 2, cor: '#8b5cf6' },
  { nome: 'Agendamento do paciente', ordem: 3, cor: '#ec4899' },
  { nome: 'Instalado',               ordem: 4, cor: '#10b981' },
]

export const COLUNA_DESCRICOES: Record<string, string> = {
  'Pré-envio': 'Trabalhos que ainda não foram enviados ao laboratório.',
  'Envio / Em laboratório': 'Trabalhos enviados e em produção no laboratório.',
  'Anexos': 'Trabalhos com anexos/arquivos pendentes ou disponíveis.',
  'Agendamento do paciente': 'Trabalhos prontos, aguardando agendamento/consulta do paciente.',
  'Instalado': 'Trabalhos já instalados/concluídos no paciente.',
}

export const COLUNA_DESCRICAO_PADRAO = 'Coluna personalizada do kanban.'

export const COLUNA_EDITAR_DICA = 'Para editar ou criar colunas, use o menu (⋯) → "Editar Kanbans".'

export const DEFAULT_ENVIO_STATUS = 'Pré-envio'
export const FINAL_ENVIO_STATUSES = ['Instalado', 'Concluído', 'Entregue']

export const KANBAN_PAGE_SIZE = 5

export const ETIQUETA_COR_PADRAO = '#6366f1'

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

export const LAB_CONTROL_PERMISSION_OPTIONS = [
  { key: 'novo_laboratorio', label: 'Novo laboratório' },
  { key: 'editar_laboratorios', label: 'Editar Laboratórios' },
  { key: 'lista_precos', label: 'Lista de Preços' },
  { key: 'arquivados', label: 'Arquivados' },
  { key: 'feriados', label: 'Adicionar/remover feriado' },
  { key: 'gerenciar_precos', label: 'Gerenciar lista de preços' },
  { key: 'excluir_envio', label: 'Botão de excluir envio no card' },
  { key: 'marcar_pago', label: 'Marcar como pago / remover pagamento' },
] as const

export type LabControlPermissionKey = typeof LAB_CONTROL_PERMISSION_OPTIONS[number]['key']
export type LabControlPermissions = Partial<Record<LabControlPermissionKey, boolean>>

export function buildLabControlPermissions(keys?: string[] | null): LabControlPermissions {
  const allowed = new Set(keys ?? [])
  return Object.fromEntries(
    LAB_CONTROL_PERMISSION_OPTIONS.map(option => [option.key, allowed.has(option.key)]),
  ) as LabControlPermissions
}

export function getAllLabControlPermissions(): LabControlPermissions {
  return Object.fromEntries(
    LAB_CONTROL_PERMISSION_OPTIONS.map(option => [option.key, true]),
  ) as LabControlPermissions
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isLabDetailTab(value: unknown): value is 'kanban' | 'info' {
  return value === 'kanban' || value === 'info'
}
