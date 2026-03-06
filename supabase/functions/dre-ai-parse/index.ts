// Supabase Edge Function: dre-ai-parse
// Recebe conteúdo bruto de um extrato bancário (texto) e usa IA para extrair
// apenas os lançamentos reais, ignorando totais, saldos e seções secundárias.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

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

const callGroq = async (apiKey: string, model: string, prompt: string): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  try {
    return await fetch(GROQ_API_URL, {
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

  const groqApiKey = Deno.env.get('GROQ_API_KEY')
  if (!groqApiKey) {
    return new Response(JSON.stringify({ lancamentos: [], erro: 'GROQ_API_KEY não configurada' }), {
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
  const conteudo = String(body.conteudo ?? '').trim()

  if (!conteudo) {
    return new Response(JSON.stringify({ lancamentos: [] }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const prompt = `Você é um extrator de lançamentos financeiros de extratos bancários brasileiros.

Analise o conteúdo abaixo e extraia APENAS os lançamentos reais (movimentações financeiras que entraram ou saíram da conta).

IGNORE completamente (não inclua no resultado):
- Linhas de total, subtotal, saldo anterior, saldo final, saldo do dia, saldo período
- Cabeçalhos de colunas: "Data", "Histórico", "Valor", "Crédito", "Débito", "Saldo", "Dcto"
- Títulos de seções: "Saldos Invest Fácil", "Resumo", "Extrato", "Período", qualquer linha sem data
- Linhas em branco ou sem valor monetário
- Números de documento/referência isolados
- Quaisquer saldos de aplicações financeiras ou investimentos

Para cada lançamento REAL extraído, retorne:
- data: string exatamente no formato "DD/MM/AAAA"
- descricao: texto da transação (sem a data e sem o valor)
- valor: number POSITIVO (sempre, mesmo que débito/saída)
- tipo: "receita" se for crédito/entrada na conta corrente; "despesa" se for débito/saída

RETORNE SOMENTE um array JSON válido, sem texto adicional, sem markdown, sem explicações.
Exemplo: [{"data":"03/03/2026","descricao":"PAGTO ELETRON FORNECEDOR","valor":802.76,"tipo":"despesa"}]

CONTEÚDO DO EXTRATO:
${conteudo}`

  let res = await callGroq(groqApiKey, modelo, prompt)

  if (!res.ok && modelo !== DEFAULT_MODEL) {
    const errText = await res.text()
    if (/model|decommissioned|not found|invalid/i.test(errText)) {
      res = await callGroq(groqApiKey, DEFAULT_MODEL, prompt)
    }
  }

  if (!res.ok) {
    return new Response(JSON.stringify({ lancamentos: [] }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const groqData = await res.json()
  const content: string = groqData?.choices?.[0]?.message?.content ?? ''
  const lancamentos = parseLancamentos(content)

  return new Response(JSON.stringify({ lancamentos }), {
    status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
