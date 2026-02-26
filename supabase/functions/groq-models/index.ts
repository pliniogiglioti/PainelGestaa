import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
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

  const groqRes = await fetch(GROQ_MODELS_URL, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!groqRes.ok) {
    const errText = await groqRes.text()
    return new Response(JSON.stringify({ error: `GroqCloud error: ${errText}` }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const groqData = await groqRes.json()
  const models = Array.isArray(groqData?.data)
    ? groqData.data
      .map((item: { id?: string; active?: boolean }) => ({ id: String(item.id ?? ''), active: item.active !== false }))
      .filter((item: { id: string; active: boolean }) => item.id)
      .filter((item: { id: string; active: boolean }) => item.active)
      .map((item: { id: string; active: boolean }) => item.id)
      .sort((a: string, b: string) => a.localeCompare(b))
    : []

  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
