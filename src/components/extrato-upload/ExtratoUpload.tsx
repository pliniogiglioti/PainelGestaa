import { useCallback, useRef, useState } from 'react'
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
}

type Fase = 'idle' | 'processando' | 'revisao' | 'salvando' | 'concluido'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile'

/** Regras locais de fallback — mesmas da edge function, evitam chamada de rede */
const FALLBACK_RULES: Array<{ pattern: RegExp; tipo: 'receita' | 'despesa'; classificacao: string; grupo: string }> = [
  // ── Deduções de Receita (tarifas e taxas) — ANTES das receitas para evitar falso match ──
  { pattern: /(tarifa.*venda|tarifa.*credito|tarifa.*debito|tarifa.*adquir|getnet.*tarifa|getnet.*cobranca|cobranca.*getnet|adquirencia.*tarifa)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Padrão', grupo: 'Deduções de Receita' },
  { pattern: /(taxa cartao|tarifa cartao|pos\b|maquininha|antecipacao.*cartao)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Padrão', grupo: 'Deduções de Receita' },
  { pattern: /(cancelamento|devolucao|estorno)/i, tipo: 'despesa', classificacao: 'Vendas Canceladas / Devoluções', grupo: 'Deduções de Receita' },
  // ── Despesas bancárias — ANTES dos padrões amplos de pix/transferencia para evitar falso match ──
  { pattern: /(tarifa bancaria|taxa bancaria|manutencao conta|liquidacao qrcode|liquidacao pix|taxa.*pix|taxa.*transferencia)/i, tipo: 'despesa', classificacao: 'Despesas Bancárias', grupo: 'Despesas Financeiras' },
  // ── Receitas ──
  { pattern: /(getnet|cielo|rede\b|stone\b|pagseguro|sumup|pagbank|mercadopago|visa.*credito|master.*credito|elo.*credito|amex.*credito|credito.*adquir)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(cartao|card)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(transferencia pix rem|pix.*receb|receb.*pix|pix.*entr)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(pix|transferencia)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(rendimento|aplicacao|investimento financeiro)/i, tipo: 'receita', classificacao: 'Rendimento de Aplicação Financeira', grupo: 'Receitas Financeiras' },
  { pattern: /\bdinheiro\b/i, tipo: 'receita', classificacao: 'Receita Dinheiro', grupo: 'Receitas Operacionais' },
  { pattern: /(venda|faturamento|consulta|atendimento|tratamento|servico prestado|honorario|receita|pagamento paciente)/i, tipo: 'receita', classificacao: 'Receita Dinheiro', grupo: 'Receitas Operacionais' },
  // ── Impostos ──
  { pattern: /(simples nacional|imposto|iss|icms|pis|cofins|irpj|tributo|das )/i, tipo: 'despesa', classificacao: 'Impostos sobre Receitas - Simples Nacional', grupo: 'Impostos sobre Faturamento' },
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
  { pattern: /(salario|ordenado|folha de pagamento)/i, tipo: 'despesa', classificacao: 'Salários e Ordenados', grupo: 'Despesas com Pessoal' },
  { pattern: /(13.? salario|decimo terceiro)/i, tipo: 'despesa', classificacao: '13° Salário', grupo: 'Despesas com Pessoal' },
  { pattern: /(rescisao|aviso previo|demissao)/i, tipo: 'despesa', classificacao: 'Rescisões', grupo: 'Despesas com Pessoal' },
  { pattern: /\binss\b/i, tipo: 'despesa', classificacao: 'INSS', grupo: 'Despesas com Pessoal' },
  { pattern: /\bfgts\b/i, tipo: 'despesa', classificacao: 'FGTS', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale transporte|vt\b)/i, tipo: 'despesa', classificacao: 'Vale Transporte', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale refeicao|vale alimentacao|vr\b|va\b)/i, tipo: 'despesa', classificacao: 'Vale Refeição', grupo: 'Despesas com Pessoal' },
  { pattern: /(combustivel|gasolina|etanol|abastecimento)/i, tipo: 'despesa', classificacao: 'Combustível', grupo: 'Despesas com Pessoal' },
  { pattern: /(aluguel|locacao|condominio)/i, tipo: 'despesa', classificacao: 'Aluguel', grupo: 'Despesas Administrativas' },
  { pattern: /(energia|luz\b|eletricidade)/i, tipo: 'despesa', classificacao: 'Energia Elétrica', grupo: 'Despesas Administrativas' },
  { pattern: /(agua\b|esgoto|sabesp|saneamento)/i, tipo: 'despesa', classificacao: 'Água e Esgoto', grupo: 'Despesas Administrativas' },
  { pattern: /(telefone|telefonia|celular|plano|vivo|claro|tim|oi\b)/i, tipo: 'despesa', classificacao: 'Telefonia', grupo: 'Despesas Administrativas' },
  { pattern: /(internet\b|banda larga|fibra)/i, tipo: 'despesa', classificacao: 'Internet', grupo: 'Despesas com TI' },
  { pattern: /(software|sistema|licenca|saas|assinatura)/i, tipo: 'despesa', classificacao: 'Sistema de Gestão', grupo: 'Despesas com TI' },
  { pattern: /(hospedagem|servidor|cloud|aws|gcp|azure)/i, tipo: 'despesa', classificacao: 'Hospedagem de Dados', grupo: 'Despesas com TI' },
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
  { pattern: /(uber\b|taxi|99\b|ifood)/i, tipo: 'despesa', classificacao: 'Uber e Táxi', grupo: 'Despesas Administrativas' },
  { pattern: /(material escritorio|papel|caneta|toner)/i, tipo: 'despesa', classificacao: 'Material de Escritório', grupo: 'Despesas Administrativas' },
  { pattern: /(uniforme|epj|epi\b)/i, tipo: 'despesa', classificacao: 'Uniformes', grupo: 'Despesas Administrativas' },
  { pattern: /(estacionamento|parking)/i, tipo: 'despesa', classificacao: 'Estacionamento', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza\b|desinfetante|produto limpeza)/i, tipo: 'despesa', classificacao: 'Material de Limpeza', grupo: 'Despesas Administrativas' },
]

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Tenta classificar localmente sem chamada de rede. Retorna null se não houver match. */
function classificarLocal(descricao: string): { classificacao: string; grupo: string; tipo: 'receita' | 'despesa' } | null {
  const text = normalize(descricao)
  for (const rule of FALLBACK_RULES) {
    if (rule.pattern.test(text)) {
      return { classificacao: rule.classificacao, grupo: rule.grupo, tipo: rule.tipo }
    }
  }
  return null
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
  const idx = (keys: string[]) =>
    headers.findIndex(h => keys.some(k => h.toLowerCase().includes(k)))

  return {
    data:          idx(['data', 'date', 'dt', 'vencimento']),
    descricao:     idx(['descriç', 'descric', 'histórico', 'historico', 'memo', 'description', 'complement', 'lançamento', 'lancamento']),
    valor:         headers.findIndex(h => ['valor', 'value', 'amount', 'vl '].some(k => h.toLowerCase().includes(k)) && !h.toLowerCase().includes('saldo')),
    tipo:          idx(['tipo', 'type', 'natureza', 'dc', 'crédito/débito', 'entrada/saída']),
    credito:       idx(['crédit', 'credit']),
    debito:        idx(['débit', 'debit']),
    classificacao: idx(['classificaç', 'classificac']),
    grupo:         idx(['grupo', 'group', 'agrupamento']),
  }
}

/** Normaliza valor brasileiro: "1.234,56" → 1234.56 */
function parseValor(raw: unknown): number {
  if (typeof raw === 'number') return Math.abs(raw)
  const s = String(raw ?? '').trim().replace(/\s/g, '')
  const clean = s.replace(/[R$]/g, '').trim()
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(clean)) {
    return Math.abs(parseFloat(clean.replace(/\./g, '').replace(',', '.')))
  }
  return Math.abs(parseFloat(clean.replace(/,/g, '')) || 0)
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

  const usaSeparado = cols.credito >= 0 || cols.debito >= 0

  const linhas: LinhaExtrato[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]

    const rawTipo  = cols.tipo      >= 0 ? row[cols.tipo]      : ''
    const rawDesc  = cols.descricao >= 0 ? row[cols.descricao] : row.find(c => c !== '') ?? ''
    const rawData  = cols.data      >= 0 ? row[cols.data]      : ''

    let valorNum: number
    let tipo: 'receita' | 'despesa'

    if (usaSeparado) {
      // Extrato Bradesco/Itaú: colunas Crédito (R$) e Débito (R$) separadas
      const creditoNum = parseValor(cols.credito >= 0 ? row[cols.credito] : '')
      const debitoNum  = parseValor(cols.debito  >= 0 ? row[cols.debito]  : '')
      if (creditoNum > 0) {
        valorNum = creditoNum; tipo = 'receita'
      } else if (debitoNum > 0) {
        valorNum = debitoNum; tipo = 'despesa'
      } else {
        continue // linha sem valor (ex: SALDO ANTERIOR, totalizadores)
      }
    } else {
      // Extrato com coluna única de valor (ex: Itaú — "Valor (R$)" signed).
      // Preserva o sinal para determinar tipo antes de chamar parseValor (que faz Math.abs).
      const rawValor = cols.valor >= 0 ? row[cols.valor] : null
      const isNeg = typeof rawValor === 'number'
        ? rawValor < 0
        : String(rawValor ?? '').trim().startsWith('-')
      const absValor = parseValor(rawValor)
      if (!absValor) continue // skip linhas de saldo/totalizador (Valor vazio)
      valorNum = absValor
      tipo = isNeg ? 'despesa' : parseTipo(rawTipo, absValor)
    }

    const rawClassif = cols.classificacao >= 0 ? String(row[cols.classificacao] ?? '').trim() : ''
    const rawGrupo   = cols.grupo          >= 0 ? String(row[cols.grupo]          ?? '').trim() : ''

    linhas.push({
      data:      formatarData(rawData),
      descricao: String(rawDesc ?? '').trim() || `Linha ${i + 1}`,
      valor:     valorNum,
      tipo,
      ...(rawClassif ? { classificacaoArquivo: rawClassif } : {}),
      ...(rawGrupo   ? { grupoArquivo: rawGrupo }           : {}),
    })
  }

  return linhas
}

/**
 * Valida se um arquivo xlsx/xls/csv tem a estrutura mínima esperada pelo sistema.
 * Verifica: ao menos uma coluna de Data, uma de Descrição e uma de Valor,
 * e pelo menos uma linha de dados com data DD/MM/AAAA e valor numérico.
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
    const headers = (rows[headerIdx] as unknown[]).map(h => String(h ?? '').trim())
    const cols = detectarColunas(headers)

    const faltando: string[] = []
    if (cols.data < 0) faltando.push('"Data"')
    if (cols.valor < 0 && cols.credito < 0 && cols.debito < 0) faltando.push('"Valor" (ou "Crédito"/"Débito")')
    if (cols.descricao < 0) faltando.push('"Descrição" (ou "Histórico")')

    if (faltando.length > 0) {
      return {
        ok: false,
        motivo:
          `Coluna(s) não encontrada(s): ${faltando.join(' e ')}. ` +
          `Use o botão "Baixar exemplo .xlsx" acima para ver o formato correto.`,
      }
    }

    // Verifica se ao menos uma linha tem data DD/MM/AAAA e valor > 0
    let linhasValidas = 0
    for (let i = headerIdx + 1; i < Math.min(rows.length, headerIdx + 20); i++) {
      const row = rows[i] as unknown[]
      const rawData = cols.data >= 0 ? row[cols.data] : ''
      const dataFormatada = formatarData(rawData)
      const valorNum =
        cols.valor >= 0
          ? parseValor(row[cols.valor])
          : Math.max(
              parseValor(cols.credito >= 0 ? row[cols.credito] : ''),
              parseValor(cols.debito >= 0 ? row[cols.debito] : ''),
            )
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataFormatada) && valorNum > 0) linhasValidas++
    }

    if (linhasValidas === 0) {
      return {
        ok: false,
        motivo:
          `Nenhuma linha com data no formato DD/MM/AAAA e valor numérico foi encontrada. ` +
          `Verifique se as datas estão no formato correto (ex: 01/01/2026) e se os valores são números. ` +
          `Clique em "Baixar exemplo .xlsx" acima para ver o modelo esperado.`,
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

// ── Componente principal ──────────────────────────────────────────────────────

interface ExtratoUploadProps {
  /** ID da empresa para vincular os lançamentos importados */
  empresaId: string
  /** Chamado após lançamentos salvos com sucesso — use para recarregar a lista na página pai */
  onSaved?: () => void
}

export function ExtratoUpload({ empresaId, onSaved }: ExtratoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging]                     = useState(false)
  const [arquivo, setArquivo]                       = useState<string>('')
  const [progresso, setProgresso]                   = useState<{ atual: number; total: number; label?: string } | null>(null)
  const [fase, setFase]                             = useState<Fase>('idle')
  const [linhasClass, setLinhasClass]               = useState<LinhaClassificada[]>([])
  const [selecionados, setSelecionados]             = useState<Set<number>>(new Set())
  const [erroSalvar, setErroSalvar]                 = useState<string>('')
  const [sucessoSalvo, setSucessoSalvo]             = useState(0)
  const [msgErroUpload, setMsgErroUpload]           = useState<string>('')
  const [classificacoesDisp, setClassificacoesDisp] = useState<{ nome: string; tipo: string }[]>([])
  const [showSugeridaModal,  setShowSugeridaModal]  = useState(false)

  const qtdErros       = linhasClass.filter(l => l.status === 'erro').length
  const todosChecked   = selecionados.size === linhasClass.length && linhasClass.length > 0
  const someChecked    = selecionados.size > 0 && !todosChecked
  const totalSelecionado = [...selecionados].reduce((s, i) => s + linhasClass[i].valor, 0)

  const handleClassChange = (idx: number, novoNome: string) => {
    setLinhasClass(prev => prev.map((l, i) =>
      i === idx ? { ...l, classificacao: novoNome, sugerida: false } : l
    ))
  }

  const toggleItem = (i: number) => setSelecionados(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  const toggleTodos = () => {
    if (todosChecked || someChecked) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(linhasClass.map((_, i) => i)))
    }
  }

  const desmarcarErros = () =>
    setSelecionados(new Set(linhasClass.map((_, i) => i).filter(i => linhasClass[i].status === 'ok')))

  const removerLinha = (idx: number) => {
    setLinhasClass(prev => prev.filter((_, i) => i !== idx))
    setSelecionados(prev => {
      const next = new Set<number>()
      for (const s of prev) {
        if (s < idx) next.add(s)
        else if (s > idx) next.add(s - 1)
      }
      return next
    })
  }

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

    // Busca modelo e classificações antes de parsear (modelo é necessário para o parse com IA)
    const [{ data: configData }, { data: classData }] = await Promise.all([
      supabase.from('configuracoes').select('valor').eq('chave', 'modelo_groq').single(),
      supabase.from('dre_classificacoes').select('nome,tipo').eq('ativo', true),
    ])
    const modelo = configData?.valor ?? DEFAULT_GROQ_MODEL
    const classificacoes = (classData ?? []) as { nome: string; tipo: string }[]

    // ── Parse do arquivo com IA (entende qualquer formato de extrato) ─────────
    let linhas: LinhaExtrato[] = []
    try {
      setProgresso({ atual: 0, total: 1, label: 'Lendo arquivo com IA' })
      linhas = await parseArquivoComIA(file, modelo, (atual, total) => {
        setProgresso({ atual, total, label: 'Lendo arquivo com IA' })
      })
    } catch {
      // IA falhou — usa parser tradicional como fallback
    }

    // Fallback: parser tradicional se a IA não retornou nada
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

    // ── Passo 1: classificar localmente ───────────────────────────────────────
    const classificadas: LinhaClassificada[] = new Array(linhas.length)
    const indicesParaIA: number[] = []

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i]

      // Prioridade 1: classificação já presente no arquivo importado
      // Só usa dados do arquivo se ambos classificação E grupo estiverem presentes,
      // para não sobrescrever a IA com dados incompletos.
      if (linha.classificacaoArquivo && linha.grupoArquivo) {
        classificadas[i] = {
          ...linha,
          classificacao: linha.classificacaoArquivo,
          grupo: linha.grupoArquivo,
          status: 'ok',
        }
        continue
      }

      // Prioridade 2: regras locais de fallback
      const local = classificarLocal(linha.descricao)
      if (local) {
        classificadas[i] = { ...linha, tipo: local.tipo, classificacao: local.classificacao, grupo: local.grupo, status: 'ok' }
      } else {
        indicesParaIA.push(i)
      }
    }

    setProgresso({ atual: linhas.length - indicesParaIA.length, total: linhas.length, label: 'Classificando com IA' })

    // ── Passo 2: enviar em batch para IA (com delay para evitar rate limit) ───
    const BATCH_IA = 15  // ~3-4K tokens por chamada, dentro do limite do Groq (12K/min)
    const DELAY_ENTRE_BATCHES = 800  // ms — evita estourar o rate limit de tokens/min

    for (let b = 0; b < indicesParaIA.length; b += BATCH_IA) {
      if (b > 0) await sleep(DELAY_ENTRE_BATCHES)

      const fatia = indicesParaIA.slice(b, b + BATCH_IA)
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
            classificacao: String(r?.classificacao_nome ?? '').trim() || 'Outros',
            grupo:         String(r?.grupo ?? '').trim() || 'Outros',
            status: 'ok',
            sugerida: r?.confianca === 'sugerida',
          }
        })
      } catch {
        fatia.forEach(linhaIdx => {
          classificadas[linhaIdx] = {
            ...linhas[linhaIdx],
            classificacao: 'Não classificado',
            grupo: 'Outros',
            status: 'erro',
          }
        })
      }

      setProgresso({
        atual: (linhas.length - indicesParaIA.length) + Math.min(b + BATCH_IA, indicesParaIA.length),
        total: linhas.length,
        label: 'Classificando com IA',
      })
    }

    // Ordena: sugestões da IA primeiro (precisam de revisão), depois erros, depois ok
    const final = Array.from(classificadas).sort((a, b) => {
      if (a.sugerida && !b.sugerida) return -1
      if (!a.sugerida && b.sugerida) return 1
      return 0
    })
    setLinhasClass(final)
    // Pré-seleciona só os classificados com sucesso; erros ficam desmarcados
    setSelecionados(new Set(final.map((_, i) => i).filter(i => final[i].status === 'ok')))
    setFase('revisao')
    setProgresso(null)
  }, [])

  const salvarTudo = async () => {
    const temSugeridas = linhasClass.some(l => l.sugerida)
    if (temSugeridas) {
      setShowSugeridaModal(true)
      return
    }
    setSelecionados(new Set(linhasClass.map((_, i) => i)))
    await salvarComIndices(new Set(linhasClass.map((_, i) => i)))
  }

  const confirmarSalvarTudo = async () => {
    setShowSugeridaModal(false)
    setSelecionados(new Set(linhasClass.map((_, i) => i)))
    await salvarComIndices(new Set(linhasClass.map((_, i) => i)))
  }

  const salvarLancamentos = async () => {
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
        <a href="/exemplos/exemplo.xlsx" download className={styles.downloadBtn}>
          ↓ Baixar exemplo .xlsx
        </a>
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
              <a
                href="/exemplos/exemplo.xlsx"
                download
                className={styles.errosBoxDownloadLink}
              >
                ↓ Baixar exemplo .xlsx
              </a>
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
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {linhasClass.map((l, i) => (
                  <tr
                    key={i}
                    className={[
                      l.status === 'erro' ? styles.rowErro : '',
                      selecionados.has(i) ? styles.rowSelecionada : styles.rowDesmarcada,
                    ].join(' ')}
                    onClick={() => toggleItem(i)}
                  >
                    <td className={styles.checkCell}>
                      <input
                        type="checkbox"
                        checked={selecionados.has(i)}
                        onChange={() => toggleItem(i)}
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
                        title={l.sugerida ? 'Sugestão da IA — não cadastrada no sistema. Altere se necessário.' : l.classificacao}
                        onChange={e => handleClassChange(i, e.target.value)}
                      >
                        {classificacoesDisp
                          .filter(c => c.tipo === l.tipo)
                          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
                          .map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)
                        }
                        {/* Se a classificação atual não está no banco (ex: sugestão IA), mantém visível */}
                        {!classificacoesDisp.some(c => c.nome === l.classificacao) && (
                          <option value={l.classificacao}>{l.classificacao}</option>
                        )}
                      </select>
                    </td>
                    <td className={styles.tdGrupo}>{l.grupo}</td>
                    <td className={`${styles.tdValor} ${l.tipo === 'receita' ? styles.tdReceita : styles.tdDespesa}`}>
                      {moeda(l.valor)}
                    </td>
                    <td className={styles.tdRemover} onClick={e => e.stopPropagation()}>
                      <button
                        className={styles.btnRemoverLinha}
                        onClick={() => removerLinha(i)}
                        title="Remover esta linha"
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda de classificações sugeridas pela IA */}
          {linhasClass.some(l => l.sugerida) && (
            <div className={styles.legendaSugerida}>
              <span className={styles.clfSugerida}>Classificação sugerida</span>
              {' '}— a IA propôs uma categoria não cadastrada no sistema. Revise antes de salvar.
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
            <h3 className={styles.modalSugeridaTitulo}>Classificações com sugestão da IA</h3>
            <p className={styles.modalSugeridaTexto}>
              {linhasClass.filter(l => l.sugerida).length} lançamento(s) foram classificados com categorias{' '}
              <strong>sugeridas pela IA</strong> que podem não estar cadastradas no sistema.
              Recomendamos revisar antes de importar.
            </p>
            <p className={styles.modalSugeridaTexto}>
              Deseja lançar tudo mesmo assim?
            </p>
            <div className={styles.modalSugeridaBtns}>
              <button
                className={styles.btnSecondary}
                onClick={() => setShowSugeridaModal(false)}
              >
                ← Voltar e revisar
              </button>
              <button
                className={styles.btnPrimary}
                onClick={confirmarSalvarTudo}
              >
                Lançar tudo assim mesmo →
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
