// Supabase Edge Function: dre-ai-classify
// Calls GroqCloud API to suggest classificacao and grupo for a DRE lancamento.
//
// Environment variable required (set in Supabase dashboard → Edge Functions → Secrets):
//   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const groqApiKey = Deno.env.get('GROQ_API_KEY')
  if (!groqApiKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let descricao: string
  let valor: number
  let grupos_existentes: string[]

  try {
    const body = await req.json()
    descricao         = String(body.descricao ?? '')
    valor             = Number(body.valor ?? 0)
    grupos_existentes = Array.isArray(body.grupos_existentes) ? body.grupos_existentes : []
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const gruposStr = grupos_existentes.length > 0
    ? grupos_existentes.map(g => `"${g}"`).join(', ')
    : 'nenhum cadastrado ainda'

  const prompt = `Você é um assistente contábil brasileiro. Analise o lançamento financeiro abaixo e retorne APENAS um JSON válido, sem explicações adicionais.

Lançamento:
- Descrição: "${descricao}"
- Valor: R$ ${valor.toFixed(2).replace('.', ',')}

Grupos já existentes no sistema: ${gruposStr}

Regras:
1. "classificacao" deve ser "receita" se for entrada de dinheiro (venda, pagamento recebido, etc.) ou "despesa" se for saída (compra, pagamento, custo, etc.)
2. "grupo" deve ser conciso (1 a 3 palavras), em português, sem acentos especiais
3. Prefira reutilizar um grupo já existente se fizer sentido; crie um novo apenas se necessário

Responda SOMENTE com este JSON:
{"classificacao": "receita" ou "despesa", "grupo": "nome do grupo"}`

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 80,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      return new Response(JSON.stringify({ error: `GroqCloud error: ${errText}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const groqData = await groqRes.json()
    const content: string = groqData?.choices?.[0]?.message?.content ?? ''

    // Extract JSON from the model response (handles markdown code blocks too)
    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: content }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const result = JSON.parse(jsonMatch[0]) as { classificacao: string; grupo: string }

    // Validate classificacao value
    const classificacao = result.classificacao === 'receita' ? 'receita' : 'despesa'
    const grupo = String(result.grupo ?? '').trim() || 'Outros'

    return new Response(JSON.stringify({ classificacao, grupo }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
