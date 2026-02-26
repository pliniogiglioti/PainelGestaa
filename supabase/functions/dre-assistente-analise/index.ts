// Supabase Edge Function: dre-assistente-analise
// Analyzes all user lancamentos using Groq AI and returns a markdown DRE report.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Lancamento = {
  data?: string
  descricao?: string | null
  valor: number
  tipo: 'receita' | 'despesa'
  classificacao: string
  grupo: string
}

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const buildPrompt = (lancamentos: Lancamento[], resumo: { receitas: number; despesas: number }) => {
  const resultado = resumo.receitas - resumo.despesas
  const margem = resumo.receitas > 0 ? ((resultado / resumo.receitas) * 100).toFixed(1) : '0.0'

  const linhas = lancamentos
    .map(l => {
      const data = l.data ? new Date(l.data).toLocaleDateString('pt-BR') : '—'
      const desc = l.descricao || l.classificacao
      return `| ${data} | ${desc} | ${l.grupo} | ${l.classificacao} | ${l.tipo === 'receita' ? '✅' : '🔴'} | ${moeda(Number(l.valor))} |`
    })
    .join('\n')

  return `Você é um assistente financeiro especializado em DRE (Demonstração de Resultado do Exercício) para pequenas e médias empresas brasileiras.

Analise os lançamentos financeiros abaixo e gere um relatório executivo em Markdown.

## Resumo financeiro
- Total de lançamentos: ${lancamentos.length}
- Receitas totais: ${moeda(resumo.receitas)}
- Despesas totais: ${moeda(resumo.despesas)}
- Resultado: ${moeda(resultado)} (${resultado >= 0 ? 'LUCRO' : 'PREJUÍZO'})
- Margem líquida: ${margem}%

## Lançamentos
| Data | Descrição | Grupo | Classificação | Tipo | Valor |
|------|-----------|-------|---------------|------|-------|
${linhas}

## Instruções para o relatório
Responda APENAS em Markdown válido com as seguintes seções:

### 📊 Diagnóstico
Análise objetiva do cenário financeiro atual (2-4 parágrafos).

### 💡 Sugestões práticas
Lista com 3-5 ações concretas para melhorar o resultado.

### ⚠️ Alertas
Pontos de atenção: despesas elevadas, classificações inadequadas, riscos financeiros.

### 📈 Oportunidades
Oportunidades de crescimento ou redução de custos identificadas nos dados.

Regras:
- Responda em PT-BR, de forma objetiva e profissional.
- Não invente dados que não estejam nos lançamentos.
- Seja direto e prático, evite linguagem genérica.
- Não inclua URLs externas.`
}

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

  let lancamentos: Lancamento[] = []
  let modelo = DEFAULT_MODEL

  try {
    const body = await req.json()
    lancamentos = Array.isArray(body.lancamentos) ? body.lancamentos : []
    modelo = String(body.modelo ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (lancamentos.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhum lançamento enviado para análise.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const resumo = lancamentos.reduce(
    (acc, l) => {
      if (l.tipo === 'receita') acc.receitas += Number(l.valor)
      else acc.despesas += Number(l.valor)
      return acc
    },
    { receitas: 0, despesas: 0 },
  )

  const groqApiKey = Deno.env.get('GROQ_API_KEY')

  if (!groqApiKey) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY não configurada no servidor Supabase.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const prompt = buildPrompt(lancamentos, resumo)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    let groqRes: Response
    try {
      groqRes = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelo,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      // Try fallback to default model if the configured model failed
      if (modelo !== DEFAULT_MODEL && /model|decommissioned|not found|invalid/i.test(errText)) {
        const retryRes = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 1024,
          }),
        })

        if (!retryRes.ok) {
          const retryErr = await retryRes.text()
          return new Response(JSON.stringify({ error: `Groq indisponível: ${retryErr.slice(0, 200)}` }), {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          })
        }

        const retryData = await retryRes.json()
        const analysis = String(retryData?.choices?.[0]?.message?.content ?? '').trim()
        return new Response(JSON.stringify({ analysis }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: `Groq indisponível: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const groqData = await groqRes.json()
    const analysis = String(groqData?.choices?.[0]?.message?.content ?? '').trim()

    if (!analysis) {
      return new Response(JSON.stringify({ error: 'IA não retornou conteúdo.' }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ analysis }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: `Erro ao chamar a IA: ${msg}` }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
