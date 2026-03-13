// Supabase Edge Function: openai-models
// Returns the list of available OpenAI chat models fetched from the OpenAI API.
// Falls back to a static list if the API is unavailable or key is not set.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Static list of OpenAI chat-completion models (all available languages/capabilities)
const OPENAI_CHAT_MODELS_STATIC = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
  'o1-mini',
  'o1-preview',
  'o3-mini',
]

// Prefixes that identify chat-capable models from the OpenAI /models endpoint
const CHAT_MODEL_PREFIXES = ['gpt-', 'o1', 'o3']

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

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    // Return static list when key is not yet configured
    return new Response(JSON.stringify({ models: OPENAI_CHAT_MODELS_STATIC }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const openaiRes = await fetch(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!openaiRes.ok) {
      // Fallback to static list on API error
      return new Response(JSON.stringify({ models: OPENAI_CHAT_MODELS_STATIC }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const openaiData = await openaiRes.json()
    const models: string[] = Array.isArray(openaiData?.data)
      ? openaiData.data
          .map((item: { id?: string }) => String(item.id ?? ''))
          .filter((id: string) => CHAT_MODEL_PREFIXES.some(prefix => id.startsWith(prefix)))
          .filter((id: string) => !id.includes('instruct') && !id.includes('vision-preview'))
          .sort((a: string, b: string) => a.localeCompare(b))
      : OPENAI_CHAT_MODELS_STATIC

    return new Response(JSON.stringify({ models }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ models: OPENAI_CHAT_MODELS_STATIC }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
