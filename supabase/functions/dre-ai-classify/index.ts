// Supabase Edge Function: dre-ai-classify
// Calls GroqCloud API to suggest the best classification for a DRE lancamento.
//
// Environment variable required (Supabase Dashboard → Edge Functions → Secrets):
//   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ClassificacaoItem = { nome: string; tipo: 'receita' | 'despesa' }

serve(async (req: Request) => {
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
  let modelo: string
  let classificacoes_disponiveis: ClassificacaoItem[]

  try {
    const body = await req.json()
    descricao                  = String(body.descricao ?? '')
    valor                      = Number(body.valor ?? 0)
    modelo                     = String(body.modelo ?? 'llama-3.3-70b-versatile')
    classificacoes_disponiveis = Array.isArray(body.classificacoes_disponiveis)
      ? body.classificacoes_disponiveis
      : []
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (classificacoes_disponiveis.length === 0) {
    return new Response(JSON.stringify({ error: 'No classifications provided' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Build numbered list for the prompt
  const listaClassificacoes = classificacoes_disponiveis
    .map((c, i) => `${i + 1}. "${c.nome}" (${c.tipo})`)
    .join('\n')

  const prompt = `Você é um assistente contábil brasileiro especializado em DRE (Demonstração do Resultado do Exercício).

Lançamento financeiro:
- Descrição: "${descricao}"
- Valor: R$ ${valor.toFixed(2).replace('.', ',')}

Classificações disponíveis:
${listaClassificacoes}

Sua tarefa: escolha a classificação da lista acima que melhor representa este lançamento.

Responda SOMENTE com um JSON válido, sem explicações, sem markdown:
{"nome": "nome exato de uma das classificações da lista acima"}`

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 60,
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

    // Extract JSON (handle possible markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: content }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const result = JSON.parse(jsonMatch[0]) as { nome: string }
    const nomeRaw = String(result.nome ?? '').trim()

    // Validate: nome must match one of the provided classifications exactly
    const matched = classificacoes_disponiveis.find(
      c => c.nome.toLowerCase() === nomeRaw.toLowerCase()
    )

    // Use matched nome (preserves original casing) or first item as fallback
    const nome = matched ? matched.nome : classificacoes_disponiveis[0].nome

    return new Response(JSON.stringify({ nome }), {
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
