import { loadDreContext } from './_lib/loadDreContext'

type ChatMessage = { role: 'system' | 'user'; content: string }

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'

const SYSTEM_PROMPT = `Você é um assistente de análise de DRE para PMEs no Brasil.
Regras obrigatórias:
- Responda em PT-BR, de forma objetiva.
- Não invente links de aulas; cite apenas URLs que estejam no CONTEXTO fornecido.
- Se não houver link relevante no contexto, diga explicitamente que não encontrou.
- Não assuma dados ausentes do DRE. Informe o que faltou e use o mínimo de suposições.
- Entregue a resposta em Markdown com seções:
  1) Diagnóstico
  2) Sugestões práticas
  3) Alertas de classificação
  4) Aulas recomendadas
- No bloco "Aulas recomendadas", cada item deve seguir o formato:
  - **Título da aula** — URL`

const buildMessages = (dreInput: string, context: string): ChatMessage[] => [
  { role: 'system', content: SYSTEM_PROMPT },
  {
    role: 'user',
    content: `CONTEXTO (plano de contas + aulas + transcrições):\n\n${context}`,
  },
  {
    role: 'user',
    content: `DRE enviado pelo usuário:\n\n${dreInput}`,
  },
]

const callModel = async (messages: ChatMessage[]) => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada no servidor.')
  }

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Falha ao consultar IA (${response.status}).`)
  }

  const data = await response.json()
  return String(data?.choices?.[0]?.message?.content || '').trim()
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const dreInput = String(body?.dre || body?.input || '').trim()

    if (!dreInput) {
      return res.status(400).json({ error: 'Envie o DRE em `dre` (texto ou JSON em string).' })
    }

    const contextResult = await loadDreContext()
    const messages = buildMessages(dreInput, contextResult.context)
    const analysis = await callModel(messages)

    return res.status(200).json({
      analysis,
      contextSource: contextResult.source,
      contextTruncated: contextResult.truncated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado.'
    return res.status(500).json({
      error: 'Não foi possível analisar seu DRE agora. Tente novamente em instantes.',
      details: message,
    })
  }
}
