import { useCallback, useEffect, memo, useMemo, useRef, useState } from 'react'
import { read, utils } from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import { supabase } from '../../lib/supabase'
import styles from './ExtratoUpload.module.css'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinhaExtrato {
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  /** true quando o tipo foi determinado por fonte autoritativa (sinal do valor ou coluna Tipo/Natureza).
   *  Quando true, as etapas de classificação local e histórico NÃO devem sobrescrever o tipo. */
  tipoDefinido?: boolean
  /** Classificação já presente no arquivo importado (ex: coluna "Classificação") */
  classificacaoArquivo?: string
  /** Grupo já presente no arquivo importado (ex: coluna "Grupo") */
  grupoArquivo?: string
}

interface LinhaClassificada extends LinhaExtrato {
  classificacao: string
  grupo: string
  status: 'ok' | 'erro'
  /** true quando a IA sugeriu uma classificação não cadastrada no banco */
  sugerida?: boolean
  /** Texto original sugerido pela IA quando não estava no catálogo */
  sugestaoIA?: string
}

type Fase = 'idle' | 'processando' | 'revisao' | 'salvando' | 'concluido'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'

/** Regras locais de fallback — mesmas da edge function, evitam chamada de rede */
const FALLBACK_RULES: Array<{ pattern: RegExp; tipo: 'receita' | 'despesa'; classificacao: string; grupo: string }> = [
  // ── Deduções de Receita (tarifas e taxas) — ANTES das receitas para evitar falso match ──
  { pattern: /(antecipacao.*cartao|cartao.*antecipacao|antecip)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Meios de Pagamento - Antecipação', grupo: 'Deduções de Receita' },
  { pattern: /(pos\b|maquininha|aluguel.*pos|pos.*aluguel)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas', grupo: 'Deduções de Receita' },
  { pattern: /(tarifa.*venda|tarifa.*credito|tarifa.*debito|tarifa.*adquir|getnet.*tarifa|getnet.*cobranca|cobranca.*getnet|adquirencia.*tarifa|taxa cartao|tarifa cartao)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Meios de Pagamento - Padrão', grupo: 'Deduções de Receita' },
  { pattern: /(cancelamento|devolucao|estorno)/i, tipo: 'despesa', classificacao: 'Vendas Canceladas / Devoluções', grupo: 'Deduções de Receita' },
  // ── Despesas bancárias — ANTES dos padrões amplos de pix/transferencia para evitar falso match ──
  { pattern: /(tarifa bancaria|taxa bancaria|manutencao conta|tx manut|taxa manutencao|liquidacao qrcode|liquidacao pix|taxa.*pix|taxa.*transferencia|cip liquidacao|compensacao cip|ted cobranca|doc cobranca)/i, tipo: 'despesa', classificacao: 'Despesas Bancárias', grupo: 'Despesas Financeiras' },
  // ── Receitas ──
  { pattern: /(getnet|cielo|rede\b|stone\b|pagseguro|sumup|pagbank|mercadopago|visa.*credito|master.*credito|elo.*credito|amex.*credito|credito.*adquir|subadquir|adquirente)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(cartao|card)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(transferencia pix rem|pix.*receb|receb.*pix|pix.*entr|cred pix|credito pix|pix cred)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(ted receb|doc receb|ted entr|doc entr|cred ted|cred doc)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(pix|transferencia)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(rendimento|aplicacao|invest facil|invest auto|cdb|lci|lca)/i, tipo: 'receita', classificacao: 'Rendimento de Aplicação Financeira', grupo: 'Receitas Financeiras' },
  { pattern: /\bdinheiro\b/i, tipo: 'receita', classificacao: 'Receita Dinheiro', grupo: 'Receitas Operacionais' },
  { pattern: /(venda|faturamento|consulta|atendimento|tratamento|servico prestado|honorario|receita|pagamento paciente)/i, tipo: 'receita', classificacao: 'Receita Dinheiro', grupo: 'Receitas Operacionais' },
  // ── Impostos ──
  { pattern: /(simples nacional|lucro presumido|imposto|iss|icms|pis|cofins|irpj|tributo|das )/i, tipo: 'despesa', classificacao: 'Impostos sobre Receitas - Presumido e Simples Nacional', grupo: 'Impostos sobre Faturamento' },
  // ── Despesas Operacionais ──
  { pattern: /(laboratorio|\blab\b|tecnico dental|dental.*lab|pag.*\blab\b|laborat)/i, tipo: 'despesa', classificacao: 'Serviços Técnicos para Laboratórios', grupo: 'Despesas Operacionais' },
  { pattern: /(material|insumo|implante|componente)/i, tipo: 'despesa', classificacao: 'Custo de Materiais e Insumos', grupo: 'Despesas Operacionais' },
  { pattern: /(dentista|terceiro pf|prestador|autonomo)/i, tipo: 'despesa', classificacao: 'Serviços Terceiros PF (dentistas)', grupo: 'Despesas Operacionais' },
  { pattern: /(royalt|assistencia tecnica franquia)/i, tipo: 'despesa', classificacao: 'Royalties e Assistência Técnica', grupo: 'Despesas Operacionais' },
  // ── Marketing ──
  { pattern: /(marketing|midia|anuncio|google ads|meta ads|instagram|facebook ads)/i, tipo: 'despesa', classificacao: 'Marketing Digital', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(agencia|assessoria)/i, tipo: 'despesa', classificacao: 'Agência e Assessoria', grupo: 'Despesas Comerciais e Marketing' },
  // ── Pessoal ──
  { pattern: /(pro.?labore)/i, tipo: 'despesa', classificacao: 'Pró-labore', grupo: 'Despesas com Pessoal' },
  { pattern: /(cred salario|dep salario|deposito salario|credito salario|pagto salario|pgto salario|folha de pagamento|salario|ordenado)/i, tipo: 'despesa', classificacao: 'Salários e Ordenados', grupo: 'Despesas com Pessoal' },
  { pattern: /(13.? salario|decimo terceiro)/i, tipo: 'despesa', classificacao: '13° Salário', grupo: 'Despesas com Pessoal' },
  { pattern: /(rescisao|aviso previo|demissao|verbas rescisoria)/i, tipo: 'despesa', classificacao: 'Rescisões', grupo: 'Despesas com Pessoal' },
  { pattern: /(\binss\b|gps\b|pagto gps|pgto gps|recolh.*previdencia)/i, tipo: 'despesa', classificacao: 'INSS', grupo: 'Despesas com Pessoal' },
  { pattern: /\bfgts\b/i, tipo: 'despesa', classificacao: 'FGTS', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale transporte|vt\b|beneficio transporte)/i, tipo: 'despesa', classificacao: 'Vale Transporte', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale refeicao|vale alimentacao|vr\b|va\b|ticket refeicao|alelo|sodexo|flash beneficio)/i, tipo: 'despesa', classificacao: 'Vale Refeição', grupo: 'Despesas com Pessoal' },
  { pattern: /(combustivel|gasolina|etanol|abastecimento|posto )/i, tipo: 'despesa', classificacao: 'Combustível', grupo: 'Despesas com Pessoal' },
  { pattern: /(plano saude|plano odonto|convenio medico|unimed|amil|sulamerica.*saude|bradesco.*saude|hapvida)/i, tipo: 'despesa', classificacao: 'Outras Despesas Com Funcionários', grupo: 'Despesas com Pessoal' },
  { pattern: /(aluguel|locacao|condominio)/i, tipo: 'despesa', classificacao: 'Aluguel', grupo: 'Despesas Administrativas' },
  { pattern: /(energia|luz\b|eletricidade|enel\b|cemig\b|copel\b|elektro\b|cpfl\b|coelba\b|celpe\b|energisa\b)/i, tipo: 'despesa', classificacao: 'Energia Elétrica', grupo: 'Despesas Administrativas' },
  { pattern: /(agua\b|esgoto|sabesp\b|saneamento|caesb\b|sanepar\b|cedae\b|cosanpa\b|copasa\b|caema\b)/i, tipo: 'despesa', classificacao: 'Água e Esgoto', grupo: 'Despesas Administrativas' },
  { pattern: /(telefone|telefonia|celular|plano|vivo\b|claro\b|tim\b|oi\b|nextel|algar)/i, tipo: 'despesa', classificacao: 'Telefonia', grupo: 'Despesas Administrativas' },
  { pattern: /(internet\b|banda larga|fibra|vivo fibra|oi fibra|claro net|net combo)/i, tipo: 'despesa', classificacao: 'Internet', grupo: 'Despesas com TI' },
  { pattern: /(software|sistema|licenca|saas|assinatura|clinicorp|dental office|wevio|gestor|totvs|sankhya)/i, tipo: 'despesa', classificacao: 'Sistema de Gestão', grupo: 'Despesas com TI' },
  { pattern: /(hospedagem|servidor|cloud|aws\b|gcp\b|azure\b|digitalocean|supabase)/i, tipo: 'despesa', classificacao: 'Hospedagem de Dados', grupo: 'Despesas com TI' },
  { pattern: /(computador|notebook|impressora|periférico|hardware)/i, tipo: 'despesa', classificacao: 'Investimento - Computadores e Periféricos', grupo: 'Investimentos' },
  { pattern: /(maquina|equipamento|autoclave|cadeira odonto)/i, tipo: 'despesa', classificacao: 'Investimento - Máquinas e Equipamentos', grupo: 'Investimentos' },
  { pattern: /(movel|mobilia|mesa|cadeira\b)/i, tipo: 'despesa', classificacao: 'Investimento - Móveis e Utensílios', grupo: 'Investimentos' },
  { pattern: /(reforma|instalacao|obra|construcao)/i, tipo: 'despesa', classificacao: 'Investimento - Instalações de Terceiros', grupo: 'Investimentos' },
  { pattern: /(contabilidade|contador|escritorio contabil)/i, tipo: 'despesa', classificacao: 'Contabilidade', grupo: 'Despesas Administrativas' },
  { pattern: /(advogado|juridico|advocacia)/i, tipo: 'despesa', classificacao: 'Jurídico', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza|higienizacao|faxina)/i, tipo: 'despesa', classificacao: 'Limpeza', grupo: 'Despesas Administrativas' },
  { pattern: /(seguranca|vigilancia|monitoramento)/i, tipo: 'despesa', classificacao: 'Segurança e Vigilância', grupo: 'Despesas Administrativas' },
  { pattern: /(seguro\b)/i, tipo: 'despesa', classificacao: 'Seguros', grupo: 'Despesas Administrativas' },
  { pattern: /(manutencao|reparo|conserto)/i, tipo: 'despesa', classificacao: 'Manutenção e Reparos', grupo: 'Despesas Administrativas' },
  { pattern: /(iof\b)/i, tipo: 'despesa', classificacao: 'IOF', grupo: 'Despesas Administrativas' },
  { pattern: /(juros|multa\b|mora\b)/i, tipo: 'despesa', classificacao: 'Multa e Juros s/ Contas Pagas em Atraso', grupo: 'Despesas Administrativas' },
  { pattern: /(financiamento|emprestimo)/i, tipo: 'despesa', classificacao: 'Financiamentos / Empréstimos', grupo: 'Despesas Financeiras' },
  { pattern: /(depreciacao|amortizacao)/i, tipo: 'despesa', classificacao: 'Depreciação e Amortização', grupo: 'Despesas Financeiras' },
  { pattern: /(dividendo|distribuicao lucro|retirada socio)/i, tipo: 'despesa', classificacao: 'Dividendos e Despesas dos Sócios', grupo: 'Investimentos' },
  { pattern: /(consultoria\b)/i, tipo: 'despesa', classificacao: 'Consultoria', grupo: 'Despesas Administrativas' },
  { pattern: /(refeicao|almoco|lanche|restaurante)/i, tipo: 'despesa', classificacao: 'Refeições e Lanches', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(viagem|estadia|hotel|passagem)/i, tipo: 'despesa', classificacao: 'Viagens e Estadias', grupo: 'Despesas Administrativas' },
  { pattern: /(uber\b|taxi|99\b|ifood|cabify)/i, tipo: 'despesa', classificacao: 'Uber e Táxi', grupo: 'Despesas Administrativas' },
  { pattern: /(material escritorio|papel|caneta|toner|cartucho)/i, tipo: 'despesa', classificacao: 'Material de Escritório', grupo: 'Despesas Administrativas' },
  { pattern: /(uniforme|epj|epi\b|vestimenta)/i, tipo: 'despesa', classificacao: 'Uniformes', grupo: 'Despesas Administrativas' },
  { pattern: /(estacionamento|parking|park\b)/i, tipo: 'despesa', classificacao: 'Estacionamento', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza\b|desinfetante|produto limpeza|higienizacao)/i, tipo: 'despesa', classificacao: 'Material de Limpeza', grupo: 'Despesas Administrativas' },
  { pattern: /(motoboy|loggi\b|entregador|motofrete)/i, tipo: 'despesa', classificacao: 'Serviço de Motoboy', grupo: 'Despesas Administrativas' },
  { pattern: /(darf\b|dae\b|guia recolhimento|recolhimento federal)/i, tipo: 'despesa', classificacao: 'Impostos sobre Receitas - Presumido e Simples Nacional', grupo: 'Impostos sobre Faturamento' },
  { pattern: /(taxa\b|tarifa\b|emolumento)/i, tipo: 'despesa', classificacao: 'Taxas e Emolumentos', grupo: 'Despesas Administrativas' },
  { pattern: /(comissao\b|gratificacao\b|bonus func)/i, tipo: 'despesa', classificacao: 'OP Gratificações', grupo: 'Despesas Operacionais' },
  { pattern: /(exame.*admiss|exame.*demiss|exame.*periodi|medicina.*trabalho)/i, tipo: 'despesa', classificacao: 'Exames Ocupacionais', grupo: 'Despesas Administrativas' },
]

const normalize = (s: string) =>
  s.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')           // remove acentos (combining diacritics)
    .replace(/[^\x00-\x7F]/g, '')              // remove qualquer não-ASCII restante (BOM, caracteres invisíveis, etc.)
    .replace(/[\t\r\n]+/g, ' ')                // quebras de linha → espaço
    .replace(/\s+/g, ' ')                      // colapsa espaços múltiplos
    .replace(/[-–—]+/g, '-')                   // vários tipos de traço → hífen
    .toLowerCase()
    .trim()

/** Normalização agressiva: remove toda pontuação para fallback de comparação */
const normalizeAggr = (s: string) =>
  normalize(s).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()

/** Mapa exaustivo classificação → grupo (espelha o plano_de_contas_dre.md) */
const CLASSIFICACAO_GRUPO: Record<string, string> = {
  'Receita Dinheiro': 'Receitas Operacionais',
  'Receita Cartão': 'Receitas Operacionais',
  'Receita Financeiras': 'Receitas Operacionais',
  'Receita PIX / Transferências': 'Receitas Operacionais',
  'Receita Subadquirência (BT)': 'Receitas Operacionais',
  'Rendimento de Aplicação Financeira': 'Receitas Financeiras',
  'Descontos Obtidos': 'Receitas Financeiras',
  'Vendas Canceladas / Devoluções': 'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas': 'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Antecipação': 'Deduções de Receita',
  'Tarifa de Cartão / Meios de Pagamento - Padrão': 'Deduções de Receita',
  'Impostos sobre Receitas - Presumido e Simples Nacional': 'Impostos sobre Faturamento',
  'OP Gratificações': 'Despesas Operacionais',
  'Custo de Materiais e Insumos': 'Despesas Operacionais',
  'Serviços Terceiros PF (dentistas)': 'Despesas Operacionais',
  'Serviços Técnicos para Laboratórios': 'Despesas Operacionais',
  'Royalties e Assistência Técnica': 'Despesas Operacionais',
  'Fundo Nacional de Marketing': 'Despesas Operacionais',
  'Pró-labore': 'Despesas com Pessoal',
  'Salários e Ordenados': 'Despesas com Pessoal',
  '13° Salário': 'Despesas com Pessoal',
  'Rescisões': 'Despesas com Pessoal',
  'INSS': 'Despesas com Pessoal',
  'FGTS': 'Despesas com Pessoal',
  'Outras Despesas Com Funcionários': 'Despesas com Pessoal',
  'Vale Transporte': 'Despesas com Pessoal',
  'Vale Refeição': 'Despesas com Pessoal',
  'Combustível': 'Despesas com Pessoal',
  'Adiantamento a Fornecedor': 'Despesas Administrativas',
  'Energia Elétrica': 'Despesas Administrativas',
  'Água e Esgoto': 'Despesas Administrativas',
  'Aluguel': 'Despesas Administrativas',
  'Manutenção e Conservação Predial': 'Despesas Administrativas',
  'Telefonia': 'Despesas Administrativas',
  'Uniformes': 'Despesas Administrativas',
  'Manutenção e Reparos': 'Despesas Administrativas',
  'Seguros': 'Despesas Administrativas',
  'Uber e Táxi': 'Despesas Administrativas',
  'Copa e Cozinha': 'Despesas Administrativas',
  'Cartórios': 'Despesas Administrativas',
  'Viagens e Estadias': 'Despesas Administrativas',
  'Material de Escritório': 'Despesas Administrativas',
  'Estacionamento': 'Despesas Administrativas',
  'Material de Limpeza': 'Despesas Administrativas',
  'Bens de Pequeno Valor': 'Despesas Administrativas',
  'Custas Processuais': 'Despesas Administrativas',
  'Outras Despesas': 'Despesas Administrativas',
  'Consultoria': 'Despesas Administrativas',
  'Contabilidade': 'Despesas Administrativas',
  'Jurídico': 'Despesas Administrativas',
  'Limpeza': 'Despesas Administrativas',
  'Segurança e Vigilância': 'Despesas Administrativas',
  'Serviço de Motoboy': 'Despesas Administrativas',
  'IOF': 'Despesas Administrativas',
  'Taxas e Emolumentos': 'Despesas Administrativas',
  'Multa e Juros s/ Contas Pagas em Atraso': 'Despesas Administrativas',
  'Exames Ocupacionais': 'Despesas Administrativas',
  'Refeições e Lanches': 'Despesas Comerciais e Marketing',
  'Outras Despesas com Vendas': 'Despesas Comerciais e Marketing',
  'Agência e Assessoria': 'Despesas Comerciais e Marketing',
  'Produção de Material': 'Despesas Comerciais e Marketing',
  'Marketing Digital': 'Despesas Comerciais e Marketing',
  'Feiras e Eventos': 'Despesas Comerciais e Marketing',
  'Internet': 'Despesas com TI',
  'Informática e Software': 'Despesas com TI',
  'Hospedagem de Dados': 'Despesas com TI',
  'Sistema de Gestão': 'Despesas com TI',
  'Despesas Bancárias': 'Despesas Financeiras',
  'Depreciação e Amortização': 'Despesas Financeiras',
  'Juros Passivos': 'Despesas Financeiras',
  'Financiamentos / Empréstimos': 'Despesas Financeiras',
  'Investimento - Máquinas e Equipamentos': 'Investimentos',
  'Investimento - Computadores e Periféricos': 'Investimentos',
  'Investimento - Móveis e Utensílios': 'Investimentos',
  'Investimento - Instalações de Terceiros': 'Investimentos',
  'Dividendos e Despesas dos Sócios': 'Investimentos',
}

/** Lista de grupos disponíveis extraída do mapeamento (sem duplicatas, ordenada) */
const GRUPOS_DISPONIVEIS = [...new Set(Object.values(CLASSIFICACAO_GRUPO))].sort((a, b) =>
  a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
)

/**
 * Mapa normalizado classificação → grupo, usado como fallback quando o nome
 * da classificação não bate exatamente com a chave (acento, case, espaço etc.)
 */
const LOOKUP_GRUPO_NORM = new Map<string, string>([
  ...Object.entries(CLASSIFICACAO_GRUPO).map(([k, v]) => [normalize(k), v] as [string, string]),
  ...FALLBACK_RULES.map(r => [normalize(r.classificacao), r.grupo] as [string, string]),
])


/** Resolve o grupo de uma classificação com múltiplos níveis de fallback */
function resolveGrupo(nome: string, tipo: 'receita' | 'despesa'): string {
  return (
    CLASSIFICACAO_GRUPO[nome] ??
    LOOKUP_GRUPO_NORM.get(normalize(nome)) ??
    (tipo === 'receita' ? 'Receitas Operacionais' : 'Despesas Administrativas')
  )
}

/**
 * Retorna true se as duas descrições são "parecidas o suficiente" para sugerir
 * aplicação em lote. Usa sobreposição de palavras significativas (≥ 3 chars).
 */
function descricaoParecida(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  // substring bidirecional (um contém o outro)
  if (na.length > 5 && nb.length > 5 && (na.includes(nb) || nb.includes(na))) return true
  // sobreposição de palavras ≥ 60 %
  const wa = na.split(/\s+/).filter(w => w.length > 2)
  const wb = nb.split(/\s+/).filter(w => w.length > 2)
  if (wa.length === 0 || wb.length === 0) return false
  const setA = new Set(wa)
  const matches = wb.filter(w => setA.has(w)).length
  return matches / Math.max(wa.length, wb.length) >= 0.6
}


const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Converte DD/MM/AAAA → AAAA-MM-DD para salvar no banco */
function toISO(dataBR: string): string {
  const parts = dataBR.split('/')
  if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return dataBR
}

/** Varre as primeiras N linhas para encontrar a linha de cabeçalho real.
 *  Útil para extratos bancários (Bradesco, Itaú etc.) que possuem linhas de
 *  logotipo / metadados antes do cabeçalho de colunas.
 */
function encontrarLinhaCabecalho(rows: unknown[][], maxLinhas = 20): number {
  const keywords = [
    'data', 'date', 'lanç', 'lanc', 'crédit', 'credit',
    'débit', 'debit', 'valor', 'descriç', 'descric',
    'histórico', 'historico', 'lançamento',
  ]
  for (let i = 0; i < Math.min(rows.length, maxLinhas); i++) {
    const row = rows[i] as unknown[]
    const matches = row.filter(cell =>
      keywords.some(k => String(cell ?? '').toLowerCase().includes(k))
    )
    if (matches.length >= 2) return i
  }
  return 0
}

/** Tenta detectar colunas pelo cabeçalho (case-insensitive).
 *  Retorna também índices de colunas separadas de crédito e débito,
 *  presentes em extratos Bradesco / Itaú.
 */
function detectarColunas(headers: string[]): {
  data: number; descricao: number; valor: number; tipo: number
  credito: number; debito: number
  classificacao: number; grupo: number
} {
  // Normaliza headers (remove acentos, espaços especiais, lowercase) para comparação robusta
  const normHeaders = headers.map(h => normalize(h))
  const idx = (keys: string[]) =>
    normHeaders.findIndex(h => keys.some(k => h.includes(k)))

  // Para classificação: prioriza match exato (evita pegar "Categoria 2" quando quer "Categoria 1")
  const idxClassificacao = (): number => {
    // 1. Exato "categoria 1"
    const i1 = normHeaders.findIndex(h => h === 'categoria 1')
    if (i1 >= 0) return i1
    // 2. Contém "categoria 1" (ex: "sub-categoria 1" não bate, mas "categoria 1 ..." bate)
    const i2 = normHeaders.findIndex(h => h.startsWith('categoria 1'))
    if (i2 >= 0) return i2
    // 3. Contém "classificac"
    const i3 = normHeaders.findIndex(h => h.includes('classificac'))
    if (i3 >= 0) return i3
    // 4. Exato "categoria" (sem número)
    const i4 = normHeaders.findIndex(h => h === 'categoria')
    if (i4 >= 0) return i4
    // 5. Começa com "categoria" (último recurso — pega "categoria 1", "categoria 2", etc.)
    return normHeaders.findIndex(h => h.startsWith('categoria'))
  }

  return {
    data:          idx(['data', 'date', 'dt', 'vencimento']),
    descricao:     idx(['descric', 'historico', 'memo', 'description', 'complement', 'lancamento']),
    valor:         normHeaders.findIndex(h => ['valor', 'value', 'amount', 'vl '].some(k => h.includes(k)) && !h.includes('saldo')),
    tipo:          idx(['tipo', 'type', 'natureza', 'dc', 'credito/debito', 'entrada/saida']),
    credito:       idx(['credit']),
    debito:        idx(['debit']),
    classificacao: idxClassificacao(),
    grupo:         idx(['grupo', 'group', 'agrupamento']),
  }
}

/** Normaliza valor brasileiro: "1.234,56" ou "-1.234,56" → 1234.56 (sempre positivo) */
function parseValor(raw: unknown): number {
  if (typeof raw === 'number') return Math.abs(raw)
  const s = String(raw ?? '').trim().replace(/\s/g, '')
  const clean = s.replace(/[R$]/g, '').trim()
  // Remove sinal negativo antes de testar o regex (o sinal já foi capturado pelo isNeg)
  const cleanAbs = clean.replace(/^-/, '')
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(cleanAbs)) {
    return parseFloat(cleanAbs.replace(/\./g, '').replace(',', '.'))
  }
  return Math.abs(parseFloat(cleanAbs.replace(/,/g, '')) || 0)
}

/** Detecta se é entrada ou saída */
function parseTipo(raw: unknown, valor: number): 'receita' | 'despesa' {
  if (valor < 0) return 'despesa'
  const s = String(raw ?? '').toLowerCase().trim()
  if (!s) return 'receita'
  if (
    s.includes('entra') || s.includes('créd') || s.includes('cred') ||
    s.includes('c ') || s === 'c' || s.includes('receita') || s === '+'
  ) return 'receita'
  return 'despesa'
}

/** Formata data de vários formatos para DD/MM/AAAA */
function formatarData(raw: unknown): string {
  if (!raw) return new Date().toLocaleDateString('pt-BR')
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000))
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }
  const s = String(raw).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split('-')
    return `${d.slice(0,2)}/${m}/${y}`
  }
  return s
}

/**
 * Detecta se o arquivo é um formato estruturado com coluna de categoria/classificação
 * (ex: Conta Azul "Categoria 1"). Nesses casos a IA de parse não é necessária.
 */
async function arquivoTemColunaCategoria(file: File): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer()
    const wb = read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })
    const headerIdx = encontrarLinhaCabecalho(rows)
    const headers = (rows[headerIdx] as unknown[]).map(h => normalize(String(h ?? '')))
    return headers.some(h => h.includes('categoria 1') || h === 'categoria' || h.includes('classificac') || h.includes('classificaç'))
  } catch {
    return false
  }
}

/** Parse planilha → lista de linhas brutas */
function parsePlanilha(buffer: ArrayBuffer): LinhaExtrato[] {
  const wb = read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (rows.length < 2) return []

  // Alguns extratos bancários (Bradesco, Itaú) têm linhas de logo/metadados
  // antes do cabeçalho real — encontra a linha correta automaticamente.
  const headerIdx = encontrarLinhaCabecalho(rows)
  const headers = (rows[headerIdx] as unknown[]).map(h => String(h ?? '').trim())
  const cols = detectarColunas(headers)

  // 🔍 DIAGNÓSTICO — abra o console do navegador (F12) para ver
  console.group('[PainelGestaa] parsePlanilha — diagnóstico de colunas')
  console.log('Headers detectados:', headers)
  console.log('Índices de colunas:', cols)
  console.log('Coluna classificação (índice):', cols.classificacao, '→', headers[cols.classificacao] ?? '(não encontrada)')
  console.groupEnd()

  const usaSeparado = cols.credito >= 0 || cols.debito >= 0

  const linhas: LinhaExtrato[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]

    const rawTipo  = cols.tipo      >= 0 ? row[cols.tipo]      : ''
    const rawDesc  = cols.descricao >= 0 ? row[cols.descricao] : row.find(c => c !== '') ?? ''
    const rawData  = cols.data      >= 0 ? row[cols.data]      : ''

    let valorNum: number
    let tipo: 'receita' | 'despesa'

    let tipoDefinido = false

    if (usaSeparado) {
      // Extrato Bradesco/Itaú: colunas Crédito (R$) e Débito (R$) separadas
      const creditoNum = parseValor(cols.credito >= 0 ? row[cols.credito] : '')
      const debitoNum  = parseValor(cols.debito  >= 0 ? row[cols.debito]  : '')
      if (creditoNum > 0) {
        valorNum = creditoNum; tipo = 'receita'; tipoDefinido = true
      } else if (debitoNum > 0) {
        valorNum = debitoNum; tipo = 'despesa'; tipoDefinido = true
      } else {
        continue // linha sem valor (ex: SALDO ANTERIOR, totalizadores)
      }
    } else {
      // Extrato com coluna única de valor (ex: Conta Azul, Itaú — "Valor (R$)" signed).
      // Preserva o sinal para determinar tipo antes de chamar parseValor.
      // Conta Azul usa valores negativos para despesas e positivos para receitas.
      const rawValor = cols.valor >= 0 ? row[cols.valor] : null
      const isNeg = typeof rawValor === 'number'
        ? rawValor < 0
        : String(rawValor ?? '').trim().startsWith('-')
      const absValor = parseValor(rawValor)
      if (!absValor) continue // skip linhas de saldo/totalizador (Valor vazio)
      valorNum = absValor
      // Sinal negativo → despesa; positivo → verifica coluna Tipo ou default receita
      if (isNeg) {
        tipo = 'despesa'
        tipoDefinido = true
      } else {
        tipo = parseTipo(rawTipo, absValor)
        // tipoDefinido = true quando coluna Tipo/Natureza estava preenchida
        tipoDefinido = cols.tipo >= 0 && String(rawTipo ?? '').trim() !== ''
      }
    }

    const rawClassif = cols.classificacao >= 0 ? String(row[cols.classificacao] ?? '').trim() : ''
    const rawGrupo   = cols.grupo          >= 0 ? String(row[cols.grupo]          ?? '').trim() : ''
    // Armazena a categoria do arquivo exatamente como veio (ex: Conta Azul "Categoria 1").
    // A verificação contra o plano de contas ocorre na etapa de classificação,
    // onde nomesOficiaisSet está disponível.
    const classificacaoFinal = rawClassif

    linhas.push({
      data:      formatarData(rawData),
      descricao: String(rawDesc ?? '').trim() || `Linha ${i + 1}`,
      valor:     valorNum,
      tipo,
      tipoDefinido,
      ...(classificacaoFinal ? { classificacaoArquivo: classificacaoFinal } : {}),
      ...(rawGrupo           ? { grupoArquivo: rawGrupo }                   : {}),
    })
  }

  return linhas
}

/**
 * Normaliza string para comparação: minúsculas, sem acentos, sem espaços extras.
 */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Valida se o arquivo enviado tem estrutura compatível com algum dos modelos
 * cadastrados na tabela `exemplos_upload` (configurável pelo admin).
 * A identificação é feita pelos cabeçalhos — não pelo nome do arquivo.
 */
async function validarEstruturaArquivo(
  file: File,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  try {
    const buffer = await file.arrayBuffer()
    const wb = read(buffer, { type: 'array' })

    if (!wb.SheetNames.length) {
      return { ok: false, motivo: 'O arquivo não contém nenhuma planilha.' }
    }

    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })

    if (rows.length < 2) {
      return { ok: false, motivo: 'A planilha precisa ter ao menos um cabeçalho e uma linha de dados.' }
    }

    const headerIdx = encontrarLinhaCabecalho(rows)
    const uploadHeaders = (rows[headerIdx] as unknown[])
      .map(h => normalizar(String(h ?? '').trim()))

    // Busca os modelos cadastrados no banco
    const { data: exemplos } = await supabase
      .from('exemplos_upload')
      .select('nome, cabecalhos')

    const lista = exemplos ?? []
    let nomeMatch: string | null = null

    for (const ex of lista) {
      const exemploHeaders: string[] = ex.cabecalhos ?? []
      if (exemploHeaders.length === 0) continue

      // Verifica se o arquivo enviado contém todas as colunas do modelo
      const todas = exemploHeaders.every(eh =>
        uploadHeaders.some(uh => uh === eh || uh.includes(eh) || eh.includes(uh)),
      )
      if (todas) { nomeMatch = ex.nome; break }
    }

    if (!nomeMatch) {
      const nomes = lista.map(e => `• ${e.nome}`).join('\n')
      return {
        ok: false,
        motivo:
          `O arquivo não segue nenhum dos modelos disponíveis. ` +
          `Baixe um dos modelos abaixo e use-o como referência:${nomes ? '\n' + nomes : ''}`,
      }
    }

    // Verifica se ao menos uma linha tem data DD/MM/AAAA e valor numérico
    const cols = detectarColunas(
      (rows[headerIdx] as unknown[]).map(h => String(h ?? '').trim()),
    )
    let linhasValidas = 0
    for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 20); i++) {
      const row = rows[i] as unknown[]
      if (row.every(cell => String(cell ?? '').trim() === '')) continue

      const rawData = cols.data >= 0 ? row[cols.data] : ''
      const dataStr = formatarData(rawData)

      let valorNum = 0
      if (cols.valor >= 0) {
        valorNum = Math.abs(parseValor(row[cols.valor]))
      } else if (cols.credito >= 0 || cols.debito >= 0) {
        valorNum = Math.max(
          parseValor(cols.credito >= 0 ? row[cols.credito] : ''),
          parseValor(cols.debito  >= 0 ? row[cols.debito]  : ''),
        )
      }

      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr) && valorNum > 0) linhasValidas++
    }

    if (linhasValidas === 0) {
      return {
        ok: false,
        motivo:
          `Modelo reconhecido (${nomeMatch}), mas nenhuma linha com data DD/MM/AAAA e valor numérico foi encontrada. ` +
          `Verifique se as datas estão no formato "01/01/2026" e os valores são números.`,
      }
    }

    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      motivo:
        `Não foi possível ler o arquivo: ${e instanceof Error ? e.message : 'formato inválido'}. ` +
        `Certifique-se de que é um arquivo Excel (.xlsx/.xls) ou CSV válido e não está corrompido.`,
    }
  }
}

/** Extrai texto de todas as páginas de um PDF */
async function extrairTextoPDF(buffer: ArrayBuffer): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  const paginas: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const texto = content.items
      .map(item => ('str' in item ? (item.str ?? '') : ''))
      .join(' ')
    paginas.push(texto)
  }
  return paginas
}

/** Converte valor monetário em string para número positivo */
function parseValorPDF(s: string): number {
  const clean = s.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const v = parseFloat(clean)
  return Number.isFinite(v) ? Math.abs(v) : 0
}

/** Detecta se uma linha de texto é uma data no formato DD/MM/AAAA */
function isData(s: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s.trim())
}

/**
 * Parse extrato bancário PDF (Bradesco e outros formatos tabulares).
 * Estratégia: detectar datas DD/MM/AAAA → capturar descrição e valores crédito/débito.
 */
async function parsePDF(buffer: ArrayBuffer): Promise<LinhaExtrato[]> {
  const paginas = await extrairTextoPDF(buffer)
  const linhas: LinhaExtrato[] = []

  for (const texto of paginas) {
    // Abordagem 1: regex para formato Bradesco (Data Desc Dcto Credito Debito Saldo)
    const matches = [...texto.matchAll(
      /(\d{2}\/\d{2}\/\d{4})\s+([A-Z][^\d]{5,80?})\s+([\d.]+)\s+([\d.,]+)?\s+([\d.,]+)?\s+([\d.,]+)/g
    )]
    if (matches.length > 0) {
      for (const m of matches) {
        const data = m[1]
        const descricao = m[2].trim().replace(/\s+/g, ' ')
        const credito = parseValorPDF(m[4] ?? '')
        const debito  = parseValorPDF(m[5] ?? '')

        if (descricao.length < 3) continue
        if (descricao.toLowerCase().includes('saldo anterior')) continue

        if (credito > 0) {
          linhas.push({ data, descricao, valor: credito, tipo: 'receita' })
        }
        if (debito > 0) {
          linhas.push({ data, descricao, valor: debito, tipo: 'despesa' })
        }
      }
      if (linhas.length > 0) continue
    }

    // Abordagem 2: tokenização por palavras — funciona para extratos sem regex direta
    // Divide o texto em tokens e tenta encontrar sequências: data + descrição + valor
    const tokens = texto.split(/\s+/).filter(Boolean)
    let i = 0
    while (i < tokens.length) {
      if (isData(tokens[i])) {
        const data = tokens[i]
        i++
        const descTokens: string[] = []
        // Coleta tokens de descrição até encontrar 2 valores numéricos consecutivos
        while (i < tokens.length && !isData(tokens[i])) {
          const raw = tokens[i].replace(/[R$]/g, '')
          if (/^\d{1,3}(\.\d{3})*(,\d{2})?$/.test(raw) || /^\d+(,\d{2})?$/.test(raw)) break
          descTokens.push(tokens[i])
          i++
        }
        const descricao = descTokens.join(' ').trim()
        if (descricao.toLowerCase().includes('saldo anterior') || descricao.length < 3) continue

        // Tenta ler próximos 3 valores (Dcto/Credito/Debito ou Credito/Debito/Saldo)
        const valores: number[] = []
        let j = i
        while (j < tokens.length && valores.length < 3) {
          const v = parseValorPDF(tokens[j])
          if (v > 0) { valores.push(v); j++ } else break
        }

        if (valores.length >= 2) {
          // Heurística: se tem 3 valores → [dcto?, credito, debito, saldo]
          // Bradesco: dcto(int) crédito débito saldo
          // Detectamos pelo primeiro token (dcto é inteiro sem vírgula)
          const primeiroToken = tokens[i] ?? ''
          const isDcto = /^\d+$/.test(primeiroToken) && !primeiroToken.includes(',')
          const credito = isDcto ? valores[1] : valores[0]
          const debito  = isDcto ? valores[2] : valores[1]

          if (credito > 0) linhas.push({ data, descricao, valor: credito, tipo: 'receita' })
          if (debito  > 0) linhas.push({ data, descricao, valor: debito,  tipo: 'despesa' })
        } else if (valores.length === 1) {
          // Apenas um valor — usa heurística por tipo de lançamento
          const desc = descricao.toLowerCase()
          const isReceita = /(credito|getnet|master credito|visa credito|transferencia.*rem|pix.*rem)/i.test(desc)
          linhas.push({ data, descricao, valor: valores[0], tipo: isReceita ? 'receita' : 'despesa' })
        }
      } else {
        i++
      }
    }
  }

  // Remove duplicatas exatas (data + descricao + valor + tipo)
  const visto = new Set<string>()
  return linhas.filter(l => {
    const key = `${l.data}|${l.descricao}|${l.valor}|${l.tipo}`
    if (visto.has(key)) return false
    visto.add(key)
    return true
  })
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Row memoizado — evita re-render de 2500 linhas ao marcar/desmarcar ────────

interface LancamentoRowProps {
  linha: LinhaClassificada
  index: number
  isSelecionado: boolean
  classificacoesOrdenadas: { nome: string; tipo: string }[]
  totalReceitasOp: number
  onToggle: (i: number) => void
  onClassChange: (i: number, nome: string) => void
  onGrupoChange: (i: number, grupo: string) => void
  onAplicarSugestao: (i: number) => void
  onRemover: (i: number) => void
  styles: Record<string, string>
}

const LancamentoRow = memo(function LancamentoRow({
  linha: l,
  index: i,
  isSelecionado,
  classificacoesOrdenadas,
  totalReceitasOp,
  onToggle,
  onClassChange,
  onGrupoChange,
  onAplicarSugestao,
  onRemover,
  styles,
}: LancamentoRowProps) {
  const pct = totalReceitasOp > 0 ? (l.valor / totalReceitasOp) * 100 : null
  return (
    <tr
      className={[
        l.status === 'erro' ? styles.rowErro : '',
        isSelecionado ? styles.rowSelecionada : styles.rowDesmarcada,
      ].join(' ')}
      onClick={() => onToggle(i)}
    >
      <td className={styles.checkCell}>
        <input
          type="checkbox"
          checked={isSelecionado}
          onChange={() => onToggle(i)}
          onClick={e => e.stopPropagation()}
        />
      </td>
      <td className={styles.tdData}>{l.data}</td>
      <td className={styles.tdDesc} title={l.descricao}>{l.descricao}</td>
      <td>
        <span className={`${styles.tipoPill} ${l.tipo === 'receita' ? styles.pillReceita : styles.pillDespesa}`}>
          {l.tipo === 'receita' ? '↑ Rec' : '↓ Desp'}
        </span>
      </td>
      <td className={styles.tdClf} onClick={e => e.stopPropagation()}>
        <select
          className={`${styles.selectClf} ${l.sugerida ? styles.selectClfSugerida : ''}`}
          value={l.classificacao}
          title={l.sugerida ? 'Não identificado — selecione uma classificação para este lançamento.' : l.classificacao}
          onChange={e => onClassChange(i, e.target.value)}
        >
          {classificacoesOrdenadas.map(c => (
            <option key={c.nome} value={c.nome}>{c.nome}</option>
          ))}
          {/* Se a classificação atual não está no banco (ex: sugestão IA), mantém visível */}
          {!classificacoesOrdenadas.some(c => c.nome === l.classificacao) && (
            <option value={l.classificacao}>{l.classificacao}</option>
          )}
        </select>
        {l.sugerida && l.sugestaoIA && (
          <div
            className={styles.badgeSugestaoIA}
            title={`Categoria no arquivo: ${l.sugestaoIA}`}
          >
            💡 {l.sugestaoIA}
          </div>
        )}
      </td>
      <td className={styles.tdGrupo} onClick={e => e.stopPropagation()}>
        <select
          className={styles.selectClf}
          value={l.grupo}
          onChange={e => onGrupoChange(i, e.target.value)}
        >
          {GRUPOS_DISPONIVEIS.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
          {/* Mantém grupo atual visível se não estiver na lista padrão */}
          {!GRUPOS_DISPONIVEIS.includes(l.grupo) && l.grupo && (
            <option value={l.grupo}>{l.grupo}</option>
          )}
        </select>
      </td>
      <td className={`${styles.tdValor} ${l.tipo === 'receita' ? styles.tdReceita : styles.tdDespesa}`}>
        {moeda(l.valor)}
      </td>
      <td className={styles.tdPct} title="% relativo às Receitas Operacionais">
        {pct !== null ? `${pct.toFixed(1)}%` : '—'}
      </td>
      <td className={styles.tdRemover} onClick={e => e.stopPropagation()}>
        <button
          className={styles.btnRemoverLinha}
          onClick={() => onRemover(i)}
          title="Remover esta linha"
        >×</button>
      </td>
    </tr>
  )
})

// ── Componente principal ──────────────────────────────────────────────────────

interface ExtratoUploadProps {
  /** ID da empresa para vincular os lançamentos importados */
  empresaId: string
  /** Chamado após lançamentos salvos com sucesso — use para recarregar a lista na página pai */
  onSaved?: () => void
}

export function ExtratoUpload({ empresaId, onSaved }: ExtratoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  // Contexto salvo para execução manual da IA (Passo 2)
  const iaContextRef = useRef<{
    linhas:          LinhaExtrato[]
    classificadas:   LinhaClassificada[]
    indicesParaIA:   number[]
    classificacoes:  { nome: string; tipo: string }[]
    modelo:          string
  } | null>(null)

  const [dragging, setDragging]                     = useState(false)
  const [arquivo, setArquivo]                       = useState<string>('')
  const [progresso, setProgresso]                   = useState<{ atual: number; total: number; label?: string } | null>(null)
  const [fase, setFase]                             = useState<Fase>('idle')
  const [linhasClass, setLinhasClass]               = useState<LinhaClassificada[]>([])
  const [selecionados, setSelecionados]             = useState<Set<number>>(new Set())
  const [erroSalvar, setErroSalvar]                 = useState<string>('')
  const [sucessoSalvo, setSucessoSalvo]             = useState(0)
  const [msgErroUpload, setMsgErroUpload]           = useState<string>('')
  const [pendentesIACount, setPendentesIACount]     = useState(0)
  const [classificacoesDisp, setClassificacoesDisp] = useState<{ nome: string; tipo: string }[]>([])
  const [showSugeridaModal,    setShowSugeridaModal]    = useState(false)
  const [naoClassificadosModal, setNaoClassificadosModal] = useState<LinhaClassificada[]>([])
  const [exemplosDb, setExemplosDb]                 = useState<{ nome: string; arquivo: string | null }[]>([])
  const [sugestaoParecidos, setSugestaoParecidos]   = useState<{
    classificacao: string; grupo: string; similares: number[]
  } | null>(null)

  useEffect(() => {
    supabase.from('exemplos_upload').select('nome, arquivo').order('created_at')
      .then(({ data }) => setExemplosDb(data ?? []))
  }, [])

  const qtdErros       = linhasClass.filter(l => l.status === 'erro').length
  const todosChecked   = selecionados.size === linhasClass.length && linhasClass.length > 0
  const someChecked    = selecionados.size > 0 && !todosChecked
  const totalSelecionado = [...selecionados].reduce((s, i) => s + linhasClass[i].valor, 0)

  // Total de Receitas Operacionais — base para cálculo de % por linha
  const totalReceitasOp = useMemo(
    () => linhasClass.filter(l => l.grupo === 'Receitas Operacionais').reduce((s, l) => s + l.valor, 0),
    [linhasClass]
  )

  // Pré-computa listas de classificações ordenadas por tipo — evita sort a cada render de linha
  const classificacoesReceita = useMemo(() =>
    classificacoesDisp.filter(c => c.tipo === 'receita').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    [classificacoesDisp]
  )
  const classificacoesDespesa = useMemo(() =>
    classificacoesDisp.filter(c => c.tipo === 'despesa').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    [classificacoesDisp]
  )

  const handleClassChange = useCallback((idx: number, novoNome: string) => {
    // Usa functional update para evitar dependência de linhasClass no callback
    setLinhasClass(prev => {
      const novoGrupo = resolveGrupo(novoNome, prev[idx].tipo)
      // Procura similares do mesmo tipo antes de atualizar o estado
      if (novoNome !== 'Não Identificado') {
        const tipoAtual = prev[idx].tipo
        const descAtual = prev[idx].descricao
        const similares = prev
          .map((l, i) => ({ l, i }))
          .filter(({ l, i }) => i !== idx && l.tipo === tipoAtual && descricaoParecida(l.descricao, descAtual))
          .map(({ i }) => i)
        // Agenda sugestão de parecidos fora do setState para não ter side-effect no updater
        setTimeout(() =>
          setSugestaoParecidos(similares.length > 0 ? { classificacao: novoNome, grupo: novoGrupo, similares } : null)
        , 0)
      } else {
        setTimeout(() => setSugestaoParecidos(null), 0)
      }
      return prev.map((l, i) =>
        i === idx ? { ...l, classificacao: novoNome, grupo: novoGrupo, sugerida: novoNome === 'Não Identificado' } : l
      )
    })
  }, [])

  const handleGrupoChange = useCallback((idx: number, novoGrupo: string) => {
    setLinhasClass(prev => prev.map((l, i) =>
      i === idx ? { ...l, grupo: novoGrupo } : l
    ))
  }, [])

  const handleAplicarSugestao = useCallback((idx: number) => {
    setLinhasClass(prev => {
      const linha = prev[idx]
      if (!linha?.sugestaoIA) return prev
      const novoNome = linha.sugestaoIA!
      const novoGrupo = resolveGrupo(novoNome, linha.tipo)
      const similares = prev
        .map((l, i) => ({ l, i }))
        .filter(({ l, i }) => i !== idx && l.tipo === linha.tipo && descricaoParecida(l.descricao, linha.descricao))
        .map(({ i }) => i)
      setTimeout(() =>
        setSugestaoParecidos(similares.length > 0 ? { classificacao: novoNome, grupo: novoGrupo, similares } : null)
      , 0)
      return prev.map((l, i) =>
        i === idx ? { ...l, classificacao: novoNome, grupo: novoGrupo, sugerida: false, sugestaoIA: undefined } : l
      )
    })
  }, [])

  const aplicarClassificacaoParecidos = () => {
    if (!sugestaoParecidos) return
    const { classificacao, grupo, similares } = sugestaoParecidos
    setLinhasClass(prev => prev.map((l, i) =>
      similares.includes(i) ? { ...l, classificacao, grupo, sugerida: false } : l
    ))
    setSugestaoParecidos(null)
  }

  const toggleItem = useCallback((i: number) => setSelecionados(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  }), [])

  const toggleTodos = () => {
    if (todosChecked || someChecked) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(linhasClass.map((_, i) => i)))
    }
  }

  const desmarcarErros = () =>
    setSelecionados(new Set(linhasClass.map((_, i) => i).filter(i => linhasClass[i].status === 'ok')))

  const removerLinha = useCallback((idx: number) => {
    setLinhasClass(prev => prev.filter((_, i) => i !== idx))
    setSelecionados(prev => {
      const next = new Set<number>()
      for (const s of prev) {
        if (s < idx) next.add(s)
        else if (s > idx) next.add(s - 1)
      }
      return next
    })
  }, [])

  const removerSelecionados = () => {
    const sel = selecionados
    setLinhasClass(prev => prev.filter((_, i) => !sel.has(i)))
    setSelecionados(new Set())
  }

  const reiniciar = () => {
    setFase('idle')
    setArquivo('')
    setLinhasClass([])
    setSelecionados(new Set())
    setErroSalvar('')
    setSucessoSalvo(0)
    setMsgErroUpload('')
    setPendentesIACount(0)
    iaContextRef.current = null
  }

  /** Parse do arquivo usando IA — entende qualquer formato de extrato bancário */
  const parseArquivoComIA = async (
    file: File,
    modelo: string,
    onProgress: (atual: number, total: number) => void,
  ): Promise<LinhaExtrato[]> => {
    const buffer = await file.arrayBuffer()
    const isPDF = file.name.toLowerCase().endsWith('.pdf')

    // Converte o arquivo inteiro para JSON antes de enviar à IA
    let chunks: unknown[][] = []  // cada chunk é um array de linhas (row[] ou string[])
    const LINHAS_POR_CHUNK = 80

    if (isPDF) {
      const paginas = await extrairTextoPDF(buffer)
      const linhas = paginas.join('\n').split('\n').filter(l => l.trim())
      for (let i = 0; i < linhas.length; i += LINHAS_POR_CHUNK) {
        chunks.push(linhas.slice(i, i + LINHAS_POR_CHUNK))
      }
    } else {
      const wb = read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: '' })
      // Normaliza células: número → string com 2 casas decimais, resto → string
      const rowsNorm = rows.map(row =>
        (row as unknown[]).map(c => typeof c === 'number' ? c.toFixed(2) : String(c ?? '').trim())
      ).filter(row => row.some(c => c))  // remove linhas totalmente vazias

      for (let i = 0; i < rowsNorm.length; i += LINHAS_POR_CHUNK) {
        chunks.push(rowsNorm.slice(i, i + LINHAS_POR_CHUNK))
      }
    }

    const resultado: LinhaExtrato[] = []

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(600)
      onProgress(i + 1, chunks.length)

      try {
        const { data: parseData, error } = await supabase.functions.invoke('dre-ai-classify', {
          body: { mode: 'parse', linhas: chunks[i], modelo },
        })

        if (error || !parseData?.lancamentos) continue

        const lancamentos = parseData.lancamentos as Array<{
          data: string; descricao: string; valor: number; tipo: string
        }>

        for (const l of lancamentos) {
          const dataFormatada = formatarData(l.data)
          if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataFormatada)) continue
          const valor = typeof l.valor === 'number' ? Math.abs(l.valor) : parseValor(String(l.valor))
          if (!valor) continue
          resultado.push({
            data: dataFormatada,
            descricao: String(l.descricao ?? '').trim() || 'Sem descrição',
            valor,
            tipo: l.tipo === 'receita' ? 'receita' : 'despesa',
          })
        }
      } catch {
        // Chunk falhou — continua com o próximo
      }
    }

    return resultado
  }

  const processarArquivo = useCallback(async (file: File) => {
    // Validação de tipo de arquivo — garante que o sistema consegue ler antes de processar
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const tiposAceitos = ['xlsx', 'xls', 'csv']
    if (!tiposAceitos.includes(ext)) {
      setMsgErroUpload(
        `Formato ".${ext || 'desconhecido'}" não é suportado. ` +
        `Envie uma planilha .xlsx, .xls ou .csv. ` +
        `PDF não é aceito pois o sistema pode interpretar números de página e totais como lançamentos. ` +
        `Clique em "Baixar exemplo .xlsx" para ver um modelo compatível.`
      )
      setFase('idle')
      return
    }

    // Validação estrutural do arquivo (colunas obrigatórias + dados válidos)
    const validacao = await validarEstruturaArquivo(file)
    if (!validacao.ok) {
      setMsgErroUpload(validacao.motivo)
      setFase('idle')
      return
    }

    setArquivo(file.name)
    setLinhasClass([])
    setSelecionados(new Set())
    setErroSalvar('')
    setMsgErroUpload('')
    setFase('processando')
    setProgresso(null)

    // Busca modelo e classificações em paralelo; histórico é paginado (sem limite server-side)
    const [{ data: configData }, { data: classData }] = await Promise.all([
      supabase.from('configuracoes').select('valor').eq('chave', 'modelo_openai').single(),
      supabase.from('dre_classificacoes').select('nome,tipo').neq('ativo', false),
    ])

    // Pagina o histórico para garantir que tudo é lido, independente do max_rows do Supabase
    const HIST_PAGE = 1000
    let histAll: { descricao_normalizada: string; classificacao: string; grupo: string; tipo: string }[] = []
    let histFrom = 0
    while (true) {
      const { data: page, error: histErr } = await supabase
        .from('dre_classificacao_historico')
        .select('descricao_normalizada, classificacao, grupo, tipo')
        .eq('empresa_id', empresaId)
        .range(histFrom, histFrom + HIST_PAGE - 1)
      if (histErr) break
      histAll = histAll.concat(page ?? [])
      if ((page ?? []).length < HIST_PAGE) break
      histFrom += HIST_PAGE
    }

    const modelo = configData?.valor ?? DEFAULT_OPENAI_MODEL
    const classificacoes = (classData ?? []) as { nome: string; tipo: string }[]

    // 🔍 DIAGNÓSTICO — abra o console do navegador (F12)
    console.group('[PainelGestaa] Plano de contas carregado')
    console.log(`Total de classificações no plano: ${classificacoes.length}`)
    console.log('Primeiros 10 nomes do plano:', classificacoes.slice(0, 10).map(c => c.nome))
    console.groupEnd()

    // Filtra histórico: só mantém entradas cujas classificações ainda existem no plano de contas oficial
    const nomesOficiaisSet = new Set(classificacoes.map(c => c.nome))
    
    const nomesOficiaisNormMap  = new Map(classificacoes.map(c => [normalize(c.nome),     c.nome]))
    // Fallback: comparação sem pontuação (trata "PIX / Transf." vs "PIX Transf", etc.)
    const nomesOficiaisAggrMap  = new Map(classificacoes.map(c => [normalizeAggr(c.nome), c.nome]))
    // Mapa de histórico: descricao_normalizada → classificação confirmada anteriormente
    const historico = new Map<string, { classificacao: string; grupo: string; tipo: 'receita' | 'despesa' }>(
      histAll
        .filter(h => nomesOficiaisSet.has(h.classificacao))
        .map(h => [h.descricao_normalizada, { classificacao: h.classificacao, grupo: h.grupo, tipo: h.tipo as 'receita' | 'despesa' }])
    )

    // ── Parse do arquivo ──────────────────────────────────────────────────────
    // Se o arquivo já tem coluna de categoria/classificação (ex: Conta Azul),
    // usa o parser local diretamente — sem custo de IA.
    let linhas: LinhaExtrato[] = []
    const temCategoria = await arquivoTemColunaCategoria(file)

    if (!temCategoria) {
      try {
        setProgresso({ atual: 0, total: 1, label: 'Lendo arquivo com IA' })
        linhas = await parseArquivoComIA(file, modelo, (atual, total) => {
          setProgresso({ atual, total, label: 'Lendo arquivo com IA' })
        })
      } catch {
        // IA falhou — usa parser tradicional como fallback
      }
    }

    // Parser tradicional: obrigatório para arquivos com categoria, fallback para os demais
    if (linhas.length === 0) {
      try {
        const buffer = await file.arrayBuffer()
        const linhasBruto = file.name.toLowerCase().endsWith('.pdf')
          ? await parsePDF(buffer)
          : parsePlanilha(buffer)
        // Filtra totalizadores e datas inválidas no fallback
        linhas = linhasBruto.filter(l => {
          if (!/^\d{2}\/\d{2}\/\d{4}$/.test(l.data)) return false
          const d = l.descricao.toLowerCase().trim()
          return !/^(total|subtotal|saldo|s\.a\.|resultado|resumo|consolidado)/.test(d)
        })
      } catch {
        setMsgErroUpload('Não foi possível ler o arquivo. Verifique se é um arquivo Excel (.xlsx/.xls), CSV ou PDF válido.')
        setFase('idle')
        return
      }
    }

    if (linhas.length === 0) {
      setMsgErroUpload('Nenhuma linha com valor encontrada. Verifique o formato do arquivo (Excel, CSV ou PDF de extrato bancário).')
      setFase('idle')
      return
    }
    setClassificacoesDisp(classificacoes) // salva no estado para o dropdown de edição

    // ── Passo 1: classificar localmente (plano de contas + histórico) ─────────
    const classificadas: LinhaClassificada[] = new Array(linhas.length)
    const indicesParaIA: number[] = []

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i]

      // Prioridade 1: classificação vinda do arquivo (ex: Conta Azul "Categoria 1")
      // 1a — match exato normalizado (remove acentos, BOM, invisible chars)
      // 1b — match sem pontuação (fallback agressivo)
      // 1c — match fuzzy por sobreposição de palavras
      if (linha.classificacaoArquivo) {
        const nomeOficial =
          nomesOficiaisNormMap.get(normalize(linha.classificacaoArquivo)) ??
          nomesOficiaisAggrMap.get(normalizeAggr(linha.classificacaoArquivo)) ??
          classificacoes.find(c => descricaoParecida(c.nome, linha.classificacaoArquivo!))?.nome
        if (nomeOficial) {
          classificadas[i] = {
            ...linha,
            classificacao: nomeOficial,
            grupo: linha.grupoArquivo || resolveGrupo(nomeOficial, linha.tipo),
            status: 'ok',
          }
          continue
        }
      }

      // Prioridade 2: histórico de correções manuais desta empresa
      const chaveHist = normalize(linha.descricao)
      const hist = historico.get(chaveHist)
      if (hist && (!linha.tipoDefinido || linha.tipo === hist.tipo)) {
        classificadas[i] = {
          ...linha,
          tipo: hist.tipo,
          classificacao: hist.classificacao,
          grupo: hist.grupo,
          status: 'ok',
        }
        continue
      }

      // Não classificado localmente — marcado como pendente para IA
      // sugestaoIA guarda a categoria do arquivo como lembrete visual (somente leitura)
      classificadas[i] = {
        ...linha,
        classificacao: 'Não Identificado',
        grupo: '',
        status: 'ok',
        sugerida: true,
        sugestaoIA: linha.classificacaoArquivo || undefined,
      }
      indicesParaIA.push(i)
    }

    // Passo 1b: valida classificações locais contra o plano (descarta nomes inválidos)
    const validNomes = new Set(classificacoes.map(c => c.nome))
    for (let i = 0; i < classificadas.length; i++) {
      const clf = classificadas[i]
      if (clf && clf.classificacao && clf.classificacao !== 'Não Identificado' && !validNomes.has(clf.classificacao)) {
        // Descarta o nome inválido — nunca expõe como sugestão, pois não está no plano de contas
        classificadas[i] = { ...clf, classificacao: 'Não Identificado', grupo: '', status: 'ok', sugerida: true }
        if (!indicesParaIA.includes(i)) indicesParaIA.push(i)
      }
    }

    // ── Mostra resultado local imediatamente (sem esperar IA) ─────────────────
    // Itens "Não Identificado" mostram a categoria do arquivo como sugestão.
    // O usuário pode revisar e depois apertar "Classificar com IA" para o Passo 2.
    const final = Array.from(classificadas).sort((a, b) => {
      if (a.sugerida && !b.sugerida) return -1
      if (!a.sugerida && b.sugerida) return 1
      return 0
    })
    setLinhasClass(final)
    setSelecionados(new Set(final.map((_, i) => i).filter(i => final[i].status === 'ok' && !final[i].sugerida)))
    setPendentesIACount(indicesParaIA.length)

    // Salva contexto para quando o usuário acionar a IA
    iaContextRef.current = { linhas, classificadas, indicesParaIA, classificacoes, modelo }

    setFase('revisao')
    setProgresso(null)
  }, [])

  /** Passo 2: classifica itens pendentes com IA de forma eficiente
   *  - Itens com categoria do arquivo → 1 chamada para mapear N categorias únicas
   *  - Itens sem categoria → batch por descrição (só para os restantes)
   */
  const classificarComIA = useCallback(async () => {
    if (!iaContextRef.current) return
    const { linhas, classificadas, indicesParaIA, classificacoes, modelo } = iaContextRef.current

    setFase('processando')

    // Separa: itens com categoria do arquivo (Conta Azul, etc.) vs só descrição
    const comCategoria  = indicesParaIA.filter(i => linhas[i].classificacaoArquivo)
    const semCategoria  = indicesParaIA.filter(i => !linhas[i].classificacaoArquivo)
    const totalPassos   = 1 + Math.ceil(semCategoria.length / 15) // 1 chamada de mapeamento + batches de descrição

    setProgresso({ atual: 0, total: totalPassos, label: 'Mapeando categorias' })

    // ── Etapa A: mapeamento de categorias únicas (1 chamada) ──────────────────
    if (comCategoria.length > 0) {
      const categoriasUnicas = [...new Set(comCategoria.map(i => linhas[i].classificacaoArquivo!))]
      try {
        const { data, error } = await supabase.functions.invoke('dre-ai-classify', {
          body: {
            mode: 'mapear_categorias',
            categorias: categoriasUnicas,
            classificacoes_disponiveis: classificacoes.map(c => ({ nome: c.nome, tipo: c.tipo })),
            modelo,
          },
        })

        if (!error && data?.mapeamento) {
          type MapItem = { classificacao_nome: string; grupo: string; tipo: 'receita' | 'despesa' }
          const mapeamento = data.mapeamento as Record<string, MapItem | null>
          for (const i of comCategoria) {
            const resultado = mapeamento[linhas[i].classificacaoArquivo!]
            if (resultado) {
              classificadas[i] = {
                ...linhas[i],
                classificacao: resultado.classificacao_nome,
                grupo:         resultado.grupo,
                tipo:          resultado.tipo,
                status:        'ok',
                sugerida:      false,
              }
            }
            // Se null: permanece como "Não Identificado" (placeholder já definido)
          }
        }
      } catch { /* falha silenciosa — itens ficam como Não Identificado */ }
    }

    setProgresso({ atual: 1, total: totalPassos, label: 'Classificando por descrição' })

    // ── Etapa B: batch por descrição (só itens sem categoria) ─────────────────
    const BATCH_IA = 15
    const DELAY    = 800

    for (let b = 0; b < semCategoria.length; b += BATCH_IA) {
      if (b > 0) await sleep(DELAY)
      const fatia = semCategoria.slice(b, b + BATCH_IA)
      const lote  = fatia.map(i => linhas[i])

      try {
        const { data, error } = await supabase.functions.invoke('dre-ai-classify', {
          body: {
            lancamentos: lote.map(l => ({ descricao: l.descricao, valor: l.valor, tipo: l.tipo })),
            modelo,
            classificacoes_disponiveis: classificacoes.map(c => ({ nome: c.nome, tipo: c.tipo })),
          },
        })

        if (error || !data?.resultados) throw new Error(error?.message ?? 'Sem resposta da IA')

        const resultados = data.resultados as { classificacao_nome?: string; grupo?: string; confianca?: string }[]
        fatia.forEach((linhaIdx, ri) => {
          const r = resultados[ri]
          classificadas[linhaIdx] = {
            ...linhas[linhaIdx],
            classificacao: String(r?.classificacao_nome ?? '').trim() || 'Não Identificado',
            grupo:         String(r?.grupo ?? '').trim() || '',
            status: 'ok',
            sugerida: !r?.classificacao_nome || r?.confianca === 'sugerida',
          }
        })
      } catch {
        fatia.forEach(linhaIdx => {
          classificadas[linhaIdx] = { ...linhas[linhaIdx], classificacao: 'Não Identificado', grupo: '', status: 'erro' }
        })
      }

      setProgresso({ atual: 1 + Math.ceil((b + BATCH_IA) / BATCH_IA), total: totalPassos, label: 'Classificando por descrição' })
    }

    // Valida resultado da IA contra o plano
    const validNomes = new Set(classificacoes.map(c => c.nome))
    for (let i = 0; i < classificadas.length; i++) {
      const clf = classificadas[i]
      if (clf && clf.classificacao && clf.classificacao !== 'Não Identificado' && !validNomes.has(clf.classificacao)) {
        // Nunca expõe como sugestão — não está no plano de contas
        classificadas[i] = { ...clf, classificacao: 'Não Identificado', grupo: '', status: 'ok', sugerida: true }
      }
    }

    const final = (Array.from(classificadas) as LinhaClassificada[]).sort((a, b) => {
      if (a.sugerida && !b.sugerida) return -1
      if (!a.sugerida && b.sugerida) return 1
      return 0
    })
    setLinhasClass(final)
    setSelecionados(new Set(final.map((_, i) => i).filter(i => final[i].status === 'ok' && !final[i].sugerida)))
    setPendentesIACount(0)
    iaContextRef.current = null
    setFase('revisao')
    setProgresso(null)
  }, [])

  const salvarTudo = async () => {
    const naoClass = linhasClass.filter(l => l.sugerida)
    if (naoClass.length > 0) {
      setNaoClassificadosModal(naoClass)
      setShowSugeridaModal(true)
      return
    }
    const indices = new Set(linhasClass.map((_, i) => i))
    setSelecionados(indices)
    await salvarComIndices(indices)
  }

  const salvarLancamentos = async () => {
    const naoClass = [...selecionados].map(i => linhasClass[i]).filter(l => l.sugerida)
    if (naoClass.length > 0) {
      setNaoClassificadosModal(naoClass)
      setShowSugeridaModal(true)
      return
    }
    await salvarComIndices(selecionados)
  }

  const salvarComIndices = async (indices: Set<number>) => {
    setFase('salvando')
    setErroSalvar('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const toInsert = [...indices].sort((a, b) => a - b).map(i => ({
        user_id:          user?.id ?? null,
        empresa_id:       empresaId,
        descricao:        linhasClass[i].descricao,
        valor:            linhasClass[i].valor,
        tipo:             linhasClass[i].tipo,
        classificacao:    linhasClass[i].classificacao,
        grupo:            linhasClass[i].grupo,
        data_lancamento:  toISO(linhasClass[i].data),
      }))
      const { error } = await supabase.from('dre_lancamentos').insert(toInsert)
      if (error) throw new Error(error.message)

      // Aprende com este upload: upsert no histórico para classificações válidas
      // Deduplica por empresa_id+descricao_normalizada para evitar o erro
      // "ON CONFLICT DO UPDATE command cannot affect row a second time"
      type HistoricoItem = { empresa_id: string; descricao_normalizada: string; classificacao: string; grupo: string; tipo: 'receita' | 'despesa'; updated_at: string }
      const historicoMap = new Map<string, HistoricoItem>()
      ;[...indices].sort((a, b) => a - b)
        .filter(i => linhasClass[i].classificacao && linhasClass[i].classificacao !== 'Não Identificado')
        .forEach(i => {
          const key = `${empresaId}|${normalize(linhasClass[i].descricao)}`
          historicoMap.set(key, {
            empresa_id:            empresaId,
            descricao_normalizada: normalize(linhasClass[i].descricao),
            classificacao:         linhasClass[i].classificacao,
            grupo:                 linhasClass[i].grupo,
            tipo:                  linhasClass[i].tipo,
            updated_at:            new Date().toISOString(),
          })
        })
      const historicoItems = [...historicoMap.values()]
      if (historicoItems.length > 0) {
        const { error: histError } = await supabase.from('dre_classificacao_historico')
          .upsert(historicoItems, { onConflict: 'empresa_id,descricao_normalizada' })
        if (histError) throw new Error(histError.message)
      }

      setSucessoSalvo(toInsert.length)
      setFase('concluido')
      onSaved?.()
    } catch (e) {
      setErroSalvar(`Erro ao salvar: ${e instanceof Error ? e.message : 'Desconhecido'}`)
      setFase('revisao')
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processarArquivo(file)
    e.target.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processarArquivo(file)
  }, [processarArquivo])

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Importar Extrato / Planilha</h2>
          <p className={styles.sectionSubtitle}>
            Envie uma planilha Excel (.xlsx/.xls) ou CSV — a IA classifica cada lançamento automaticamente.
          </p>
        </div>
        {exemplosDb.some(e => e.arquivo) && (
          <div className={styles.exemplosWrap}>
            <span className={styles.exemplosLabel}>↓ Baixar modelo:</span>
            {exemplosDb.filter(e => e.arquivo).map(ex => (
              <a
                key={ex.arquivo}
                href={`/exemplos/${ex.arquivo}`}
                download
                className={styles.downloadBtn}
              >
                {ex.nome}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* ── Drop zone (idle / processando) ──────────────────────────────────── */}
      {(fase === 'idle' || fase === 'processando') && (
        <>
          <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''} ${fase === 'processando' ? styles.dropZoneLoading : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fase === 'idle' && fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
            {fase === 'processando' && progresso ? (
              <div className={styles.progressWrap}>
                <div className={styles.progressSpinner} />
                <p className={styles.progressText}>
                  {progresso.label ?? 'Classificando com IA'}… {progresso.atual} de {progresso.total}
                </p>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${(progresso.atual / progresso.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <span className={styles.dropIcon}>📂</span>
                <p className={styles.dropTitle}>
                  {arquivo
                    ? `Enviar outro arquivo (atual: ${arquivo})`
                    : 'Arraste o arquivo aqui ou clique para selecionar'}
                </p>
                <p className={styles.dropHint}>Aceita .xlsx, .xls e .csv</p>
              </>
            )}
          </div>
          {msgErroUpload && (
            <div className={styles.errosBox}>
              <strong>⚠️ {msgErroUpload}</strong>
              {exemplosDb.some(e => e.arquivo) && (
                <div className={styles.exemplosWrapErro}>
                  <span>Baixe um modelo:</span>
                  {exemplosDb.filter(e => e.arquivo).map(ex => (
                    <a
                      key={ex.arquivo}
                      href={`/exemplos/${ex.arquivo}`}
                      download
                      className={styles.errosBoxDownloadLink}
                    >
                      ↓ {ex.nome}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Revisão ─────────────────────────────────────────────────────────── */}
      {(fase === 'revisao' || fase === 'salvando') && linhasClass.length > 0 && (
        <div className={styles.reviewWrap}>

          {/* Cabeçalho da revisão */}
          <div className={styles.reviewHeader}>
            <div className={styles.reviewTitleWrap}>
              <strong className={styles.reviewTitle}>
                Revise os {linhasClass.length} lançamentos classificados
              </strong>
              {linhasClass.filter(l => l.sugerida).length > 0 && (
                <span className={styles.reviewNaoIdBadge}>
                  ⚠ {linhasClass.filter(l => l.sugerida).length} não identificado{linhasClass.filter(l => l.sugerida).length > 1 ? 's' : ''} — revise antes de salvar
                </span>
              )}
              {qtdErros > 0 && (
                <span className={styles.reviewErroBadge}>
                  ⚠ {qtdErros} com atenção — desmarcados automaticamente
                </span>
              )}
            </div>
            <div className={styles.reviewActions}>
              {qtdErros > 0 && (
                <button
                  className={styles.btnSecondary}
                  onClick={desmarcarErros}
                  disabled={fase === 'salvando'}
                >
                  Desmarcar com erro
                </button>
              )}
              <button
                className={styles.btnSecondary}
                onClick={reiniciar}
                disabled={fase === 'salvando'}
              >
                ↺ Novo arquivo
              </button>
            </div>
          </div>

          {erroSalvar && (
            <div className={styles.errosBox}><strong>⚠️ {erroSalvar}</strong></div>
          )}

          {/* Banner: classificar itens pendentes com IA */}
          {pendentesIACount > 0 && fase === 'revisao' && (
            <div className={styles.bannerParecidos}>
              <span className={styles.bannerParecidosTexto}>
                <strong>{pendentesIACount}</strong> lançamento{pendentesIACount > 1 ? 's' : ''} não encontrado{pendentesIACount > 1 ? 's' : ''} no plano de contas — a IA pode classificar pelos itens abaixo
              </span>
              <div className={styles.bannerParecidosBtns}>
                <button className={styles.btnPrimary} onClick={classificarComIA}>
                  ⚡ Classificar com IA ({pendentesIACount})
                </button>
              </div>
            </div>
          )}

          {/* Banner: aplicar classificação a lançamentos parecidos */}
          {sugestaoParecidos && (
            <div className={styles.bannerParecidos}>
              <span className={styles.bannerParecidosTexto}>
                Aplicar <strong>{sugestaoParecidos.classificacao}</strong> aos outros{' '}
                <strong>{sugestaoParecidos.similares.length}</strong> lançamento{sugestaoParecidos.similares.length > 1 ? 's' : ''} parecido{sugestaoParecidos.similares.length > 1 ? 's' : ''}?
              </span>
              <div className={styles.bannerParecidosBtns}>
                <button className={styles.btnPrimary} onClick={aplicarClassificacaoParecidos}>
                  Sim, aplicar a todos
                </button>
                <button className={styles.btnSecondary} onClick={() => setSugestaoParecidos(null)}>
                  Não
                </button>
              </div>
            </div>
          )}

          {/* Tabela de revisão */}
          <div className={styles.reviewTableWrap}>
            <table className={styles.reviewTable}>
              <thead>
                <tr>
                  <th className={styles.checkCell}>
                    <input
                      type="checkbox"
                      checked={todosChecked}
                      ref={el => { if (el) el.indeterminate = someChecked }}
                      onChange={toggleTodos}
                      title="Selecionar / Desselecionar todos"
                    />
                  </th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Classificação</th>
                  <th>Grupo</th>
                  <th className={styles.thValor}>Valor</th>
                  <th className={styles.thPct} title="% relativo às Receitas Operacionais">% Rec. Op.</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {linhasClass.map((l, i) => (
                  <LancamentoRow
                    key={i}
                    linha={l}
                    index={i}
                    isSelecionado={selecionados.has(i)}
                    classificacoesOrdenadas={l.tipo === 'receita' ? classificacoesReceita : classificacoesDespesa}
                    totalReceitasOp={totalReceitasOp}
                    onToggle={toggleItem}
                    onClassChange={handleClassChange}
                    onGrupoChange={handleGrupoChange}
                    onAplicarSugestao={handleAplicarSugestao}
                    onRemover={removerLinha}
                    styles={styles}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda de classificações sugeridas pela IA */}
          {linhasClass.some(l => l.sugerida) && (
            <div className={styles.legendaSugerida}>
              <span className={styles.clfSugerida}>Não Identificado</span>
              {' '}— a IA não conseguiu identificar uma classificação cadastrada. Quando disponível, clique na sugestão amarela 💡 para aplicá-la, ou selecione manualmente antes de salvar.
            </div>
          )}

          {/* Rodapé com botões de salvar */}
          <div className={styles.reviewFooter}>
            <span className={styles.footerInfo}>
              <strong>{selecionados.size}</strong> de {linhasClass.length} selecionados
              {' · '}
              Total: <strong>{moeda(totalSelecionado)}</strong>
            </span>
            <div className={styles.footerBtns}>
              {selecionados.size > 0 && (
                <button
                  className={styles.btnRemover}
                  onClick={removerSelecionados}
                  title="Remove as linhas selecionadas da lista (não serão importadas)"
                >
                  Remover selecionados ({selecionados.size})
                </button>
              )}
              <button
                className={styles.btnSecondary}
                onClick={salvarLancamentos}
                disabled={selecionados.size === 0 || fase === 'salvando'}
                title="Envia apenas os itens marcados na tabela"
              >
                {fase === 'salvando' ? 'Salvando…' : `Enviar selecionados (${selecionados.size})`}
              </button>
              <button
                className={styles.btnPrimary}
                onClick={salvarTudo}
                disabled={fase === 'salvando'}
                title="Envia todos os lançamentos do arquivo de uma vez"
              >
                {fase === 'salvando' ? 'Salvando…' : `Lançar Tudo (${linhasClass.length}) →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: classificações sugeridas ────────────────────────────────── */}
      {showSugeridaModal && (
        <div className={styles.modalOverlaySugerida} onClick={() => setShowSugeridaModal(false)}>
          <div className={styles.modalSugerida} onClick={e => e.stopPropagation()}>
            <div className={styles.modalSugeridaIcon}>⚠️</div>
            <h3 className={styles.modalSugeridaTitulo}>Lançamentos sem classificação</h3>
            <p className={styles.modalSugeridaTexto}>
              Os lançamentos abaixo estão como <strong>Não Identificado</strong>.
              Selecione uma classificação para cada um antes de salvar:
            </p>
            <ul className={styles.modalNaoClassList}>
              {naoClassificadosModal.map((l, i) => (
                <li key={i}>
                  <span className={styles.modalNaoClassData}>{l.data}</span>
                  <span className={styles.modalNaoClassDesc}>{l.descricao}</span>
                  <span className={styles.modalNaoClassValor}>{moeda(l.valor)}</span>
                </li>
              ))}
            </ul>
            <div className={styles.modalSugeridaBtns}>
              <button
                className={styles.btnPrimary}
                onClick={() => setShowSugeridaModal(false)}
              >
                ← Voltar e classificar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sucesso ─────────────────────────────────────────────────────────── */}
      {fase === 'concluido' && (
        <div className={styles.sucessoBox}>
          <span className={styles.sucessoIcon}>✓</span>
          <p><strong>{sucessoSalvo} lançamentos</strong> enviados com sucesso!</p>
          <button className={styles.btnPrimary} onClick={reiniciar}>
            Importar outro arquivo
          </button>
        </div>
      )}
    </section>
  )
}
