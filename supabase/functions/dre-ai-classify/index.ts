// Supabase Edge Function: dre-ai-classify
// Calls GroqCloud API to identify BOTH the classification AND the group
// for a DRE lancamento, pre-filling the wizard fields for the user.
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
  let grupos_existentes: string[]

  try {
    const body = await req.json()
    descricao                  = String(body.descricao ?? '')
    valor                      = Number(body.valor ?? 0)
    modelo                     = String(body.modelo ?? 'llama-3.3-70b-versatile')
    classificacoes_disponiveis = Array.isArray(body.classificacoes_disponiveis)
      ? body.classificacoes_disponiveis : []
    grupos_existentes          = Array.isArray(body.grupos_existentes)
      ? body.grupos_existentes : []
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const listaClassificacoes = classificacoes_disponiveis.length > 0
    ? classificacoes_disponiveis.map((c, i) => `${i + 1}. "${c.nome}" (${c.tipo})`).join('\n')
    : '(nenhuma cadastrada)'

  const listaGrupos = grupos_existentes.length > 0
    ? grupos_existentes.map(g => `"${g}"`).join(', ')
    : 'nenhum ainda'

  const prompt = `Você é um assistente contábil brasileiro especializado em DRE.

Lançamento financeiro:
- Descrição: "${descricao}"
- Valor: R$ ${valor.toFixed(2).replace('.', ',')}

Classificações disponíveis (escolha UMA):
${listaClassificacoes}

Grupos já existentes no sistema: ${listaGrupos}

Sua tarefa:
1. Escolha a classificação mais adequada da lista acima
2. Sugira um grupo/categoria conciso (1-4 palavras, em português). Prefira reutilizar um grupo existente se fizer sentido. Crie um novo apenas se necessário.

Responda SOMENTE em JSON válido, sem markdown, sem explicações:
{
  "classificacao_nome": "nome exato de uma classificação da lista",
  "grupo": "grupo mais adequado"
}`

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

    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: content }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const result = JSON.parse(jsonMatch[0]) as { classificacao_nome: string; grupo: string }

    // Validate classificacao_nome: must match one of the provided options exactly
    const matched = classificacoes_disponiveis.find(
      c => c.nome.toLowerCase() === String(result.classificacao_nome ?? '').toLowerCase()
    )
    const classificacao_nome = matched
      ? matched.nome
      : (classificacoes_disponiveis[0]?.nome ?? '')

    const grupo = String(result.grupo ?? '').trim() || 'Geral'

    return new Response(JSON.stringify({ classificacao_nome, grupo }), {
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
