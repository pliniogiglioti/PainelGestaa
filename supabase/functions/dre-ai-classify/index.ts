// Supabase Edge Function: dre-ai-classify
// Calls GroqCloud API to identify BOTH the classification AND the group
// for a DRE lancamento, pre-filling the wizard fields for the user.
//
// Environment variable required (Supabase Dashboard → Edge Functions → Secrets):
//   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

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
    modelo                     = String(body.modelo ?? DEFAULT_MODEL)
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

Classificações disponíveis (use quando fizer sentido):
${listaClassificacoes}

Grupos já existentes no sistema: ${listaGrupos}

Sua tarefa:
1. Determine se este lançamento é "receita" (entrada de dinheiro: venda, serviço prestado, recebimento) ou "despesa" (saída de dinheiro: compra, pagamento, custo, fornecedor).
   - Regra importante: compra de bens duráveis para uso da clínica/empresa (ex.: carro, veículo, máquina, equipamentos, computadores) deve ser classificada como "Ativo Imobilizado" (ou "Ativo Não Circulante") e grupo equivalente.
2. Escolha a classificação mais adequada para a movimentação. Reutilize uma classificação da lista quando fizer sentido; se não houver boa correspondência, crie um nome novo (1-5 palavras, em português).
3. Sugira o grupo/categoria MAIS correto para a movimentação (1-4 palavras, em português), mesmo que não exista ainda.
4. Só reutilize um grupo existente quando ele realmente representar esta movimentação. Não force correspondência.

Responda SOMENTE em JSON válido, sem markdown, sem explicações:
{
  "tipo": "receita",
  "classificacao_nome": "classificação mais adequada",
  "grupo": "grupo mais adequado"
}`

  try {
    const model = String(modelo || DEFAULT_MODEL).trim() || DEFAULT_MODEL
    let groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 80,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      const shouldRetryWithDefault =
        model !== DEFAULT_MODEL
        && /model|decommissioned|not found|invalid/i.test(errText)

      if (shouldRetryWithDefault) {
        groqRes = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 80,
          }),
        })

        if (groqRes.ok) {
          const groqData = await groqRes.json()
          const content: string = groqData?.choices?.[0]?.message?.content ?? ''
          const jsonMatch = content.match(/\{[\s\S]*?\}/)
          if (!jsonMatch) {
            return new Response(JSON.stringify({ error: 'Could not parse AI response', raw: content }), {
              status: 502,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            })
          }

          const result = JSON.parse(jsonMatch[0]) as { tipo: string; classificacao_nome: string; grupo: string }
          const tipo: 'receita' | 'despesa' =
            result.tipo === 'receita' || result.tipo === 'despesa' ? result.tipo : 'despesa'

          const nomeAi = String(result.classificacao_nome ?? '').trim()
          const matched = classificacoes_disponiveis.find(
            c => c.nome.toLowerCase() === nomeAi.toLowerCase()
          )
          const classificacao_nome = matched?.nome
            || nomeAi
            || classificacoes_disponiveis.find(c => c.tipo === tipo)?.nome
            || classificacoes_disponiveis[0]?.nome
            || ''

          const grupo = String(result.grupo ?? '').trim() || 'Geral'

          return new Response(JSON.stringify({ tipo, classificacao_nome, grupo }), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          })
        }
      }

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

    const result = JSON.parse(jsonMatch[0]) as { tipo: string; classificacao_nome: string; grupo: string }

    // Validate tipo
    const tipo: 'receita' | 'despesa' =
      result.tipo === 'receita' || result.tipo === 'despesa' ? result.tipo : 'despesa'

    // Keep AI suggestion (existing or new). If empty, fallback to one of available classifications.
    const nomeAi = String(result.classificacao_nome ?? '').trim()
    const matched = classificacoes_disponiveis.find(
      c => c.nome.toLowerCase() === nomeAi.toLowerCase()
    )
    const classificacao_nome = matched?.nome
      || nomeAi
      || classificacoes_disponiveis.find(c => c.tipo === tipo)?.nome
      || classificacoes_disponiveis[0]?.nome
      || ''

    const grupo = String(result.grupo ?? '').trim() || 'Geral'

    return new Response(JSON.stringify({ tipo, classificacao_nome, grupo }), {
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
