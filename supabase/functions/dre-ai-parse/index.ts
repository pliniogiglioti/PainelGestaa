// Supabase Edge Function: dre-ai-parse
// Recebe o arquivo convertido para JSON (array de linhas) e usa IA para
// extrair apenas os lançamentos reais, ignorando totais, saldos e seções secundárias.
// - XLSX/CSV → array de arrays de células: [["03/01/2026","PAGTO PIX","","-450.00"], ...]
// - PDF      → array de strings (linhas de texto): ["03/01/2026 PAGTO PIX -450,00", ...]

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Lancamento = {
  data: string
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
}

const callOpenAI = async (apiKey: string, model: string, prompt: string): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  try {
    return await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.0,
        max_tokens: 6000,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

const parseLancamentos = (content: string): Lancamento[] => {
  try {
    const match = content.match(/\[[\s\S]*\]/)
    if (!match) return []
    const arr = JSON.parse(match[0])
    if (!Array.isArray(arr)) return []
    return arr.filter((item: unknown) => {
      if (!item || typeof item !== 'object') return false
      const o = item as Record<string, unknown>
      return o.data && o.descricao && typeof o.valor === 'number' && (o.tipo === 'receita' || o.tipo === 'despesa')
    }) as Lancamento[]
  } catch {
    return []
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    return new Response(JSON.stringify({ lancamentos: [], erro: 'OPENAI_API_KEY não configurada' }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ lancamentos: [] }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const modelo = String(body.modelo ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL

  // `linhas` é um array de linhas já convertido para JSON pelo cliente:
  //   XLSX → string[][]  (linhas × colunas)
  //   PDF  → string[]    (uma string por linha de texto)
  const linhas: unknown = body.linhas

  if (!Array.isArray(linhas) || linhas.length === 0) {
    return new Response(JSON.stringify({ lancamentos: [] }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const conteudoJson = JSON.stringify(linhas)

  const prompt = `Você é um extrator de lançamentos financeiros de extratos bancários brasileiros.

Recebeu o conteúdo de um extrato já convertido para JSON.
- Se for XLSX/CSV: cada elemento é um array de células de uma linha da planilha.
- Se for PDF: cada elemento é uma string com o texto de uma linha.

Extraia APENAS os lançamentos reais (movimentações financeiras que entraram ou saíram da conta).

IGNORE completamente:
- Linhas de total, subtotal, saldo anterior, saldo final, saldo do dia, saldo período
- Cabeçalhos de colunas: "Data", "Histórico", "Valor", "Crédito", "Débito", "Saldo", "Dcto"
- Títulos de seções: "Saldos Invest Fácil", "Resumo", "Extrato", "Período"
- Linhas sem data válida no formato DD/MM/AAAA ou sem valor monetário
- Números de documento/referência isolados sem descrição e valor
- Saldos de aplicações financeiras ou investimentos automáticos

Para cada lançamento REAL extraído, retorne:
- data: string exatamente no formato "DD/MM/AAAA"
- descricao: texto da transação (limpo, sem data e sem valor)
- valor: number POSITIVO (sempre positivo, mesmo débito/saída)
- tipo: "receita" se crédito/entrada na conta; "despesa" se débito/saída

RETORNE SOMENTE um array JSON válido, sem texto adicional, sem markdown.
Exemplo: [{"data":"03/03/2026","descricao":"PAGTO ELETRON FORNECEDOR","valor":802.76,"tipo":"despesa"}]

DADOS DO EXTRATO (JSON):
${conteudoJson}`

  let res = await callOpenAI(openaiApiKey, modelo, prompt)

  if (!res.ok && modelo !== DEFAULT_MODEL) {
    const errText = await res.text()
    if (/model|not found|invalid/i.test(errText)) {
      res = await callOpenAI(openaiApiKey, DEFAULT_MODEL, prompt)
    }
  }

  if (!res.ok) {
    return new Response(JSON.stringify({ lancamentos: [] }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const openaiData = await res.json()
  const content: string = openaiData?.choices?.[0]?.message?.content ?? ''
  const lancamentos = parseLancamentos(content)

  return new Response(JSON.stringify({ lancamentos }), {
    status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
