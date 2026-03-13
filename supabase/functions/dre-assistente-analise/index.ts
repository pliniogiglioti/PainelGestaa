// Supabase Edge Function: dre-assistente-analise
// Analyzes all user lancamentos using OpenAI and returns a markdown DRE report.
// Context: plano de contas + course links embedded directly (edge functions
// cannot access the filesystem, so the content from public/ia/ is inlined here).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTO DA IA — versão compacta para reduzir tokens no prompt
// ─────────────────────────────────────────────────────────────────────────────
const PLANO_DE_CONTAS = `
Plano de Contas DRE:
1-RECEITAS: Dinheiro|Cartão|Financeiras|PIX|Subadquirência
2-DEDUÇÕES: Devoluções|Tarifa Cartão(POS/Antecipação/Padrão)
3-IMPOSTOS: Simples/Presumido
4-DESP.OPERACIONAIS: Gratificações|Materiais|Terceiros PF|Laboratório|Royalties|Marketing
6-DESP.PESSOAL: Pró-labore|Salários|13°|Rescisão|INSS|FGTS|Benefícios|VT|VR|Combustível
7-DESP.ADMIN: Aluguel|Energia|Água|Telefonia|Manutenção|Seguros|Limpeza|Contabilidade|Jurídico|Consultoria|IOF|Multas|Outras
8-COMERCIAL/MKT: Refeições|Agência|Material|Marketing Digital|Eventos
9-TI: Internet|Software|Hospedagem|Sistema de Gestão
11-REC.FINANCEIRAS: Rendimentos|Descontos obtidos
12-DESP.FINANCEIRAS: Tarifas bancárias|Depreciação|Juros|Financiamentos
14-INVESTIMENTOS: Máquinas|Computadores|Móveis|Instalações|Dividendos sócios
`

// ─────────────────────────────────────────────────────────────────────────────
// LINKS DAS AULAS — versão compacta (2 momentos-chave por aula)
// Use APENAS estas URLs ao recomendar aulas. Não invente links.
// ─────────────────────────────────────────────────────────────────────────────
const AULAS_LINKS = `
Aulas disponíveis (cite APENAS estas URLs e minutos):
- M6_A2_Gestão Financeira — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f8f102f08eade02c8e7f7a6e00379a21ddf9166f6b87f35ce034c3eb45cdc3775ea16e334ccb3053e
  ▶(01:41) gasto/custo/despesa/investimento ▶(05:23) exercício prático custos
- M6_A3_Fundamentos Financeiros — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5fe3b0c3137a472dca022c568c3ad69ea61ebb5dfc1b81550cd3b6966629255b28210a0dc615155d7f
  ▶(00:26) fluxo de caixa diário ▶(06:27) perigo de antecipar cartão
- M6_A4_DRE — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5fb334e1273ae0f6b915375684fe428ed57efb99688046f0a323e66fa6aa2b12f38837e03360a61de5
  ▶(03:00) estrutura DRE ▶(13:03) benchmarks por faturamento
- M6_A5_EBIT — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5fe2e54ea87eaf1955bcb330114df5ede79d778a1fee96bb52bdfa65933febf4aed57f863d86a6a1a6
  ▶(02:19) amortização de empréstimos ▶(05:27) depreciação de ativos
- M6_A6_Balanço Patrimonial — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f874e8a957bd891e8ca8bacf58ef5d3e41f47e3ab2995963f09e63bb503eb0240ae1a105003d658e8
  ▶(04:53) ativo/passivo/PL ▶(07:49) PL positivo para dividendos
- M6_A7_Ponto de Equilíbrio — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f5e7fb6918e7c0e82e4aa9f037b3eeeafcecab5a136bcfc52ab479213b0786bca091d4f8bcb1cded2
  ▶(05:33) fórmula PE ▶(07:00) capital de giro = 15 dias de despesa
- M6_A8_Regime Contábil — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f8a227f1dac8f6f5ce0e911927ebd0681b22ae5f3221af01b29f2ababb2854459fea1d09f0d046bfb
  ▶(04:05) DRE=competência, DFC=caixa ▶(06:42) DFC salva empresa mesmo com DRE positivo
`

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

// Máximo de linhas na tabela do prompt — evita prompts gigantes com centenas de classificações
const MAX_TABELA_ROWS = 30

/** Agrega lançamentos por grupo+classificação para reduzir tokens no prompt */
function agregarLancamentos(lancamentos: Lancamento[]): Array<{
  grupo: string; classificacao: string; tipo: 'receita' | 'despesa'
  total: number; qtd: number
}> {
  const mapa = new Map<string, { grupo: string; classificacao: string; tipo: 'receita' | 'despesa'; total: number; qtd: number }>()
  for (const l of lancamentos) {
    const key = `${l.tipo}||${l.grupo}||${l.classificacao}`
    const entry = mapa.get(key)
    if (entry) {
      entry.total += Number(l.valor)
      entry.qtd++
    } else {
      mapa.set(key, { grupo: l.grupo, classificacao: l.classificacao, tipo: l.tipo, total: Number(l.valor), qtd: 1 })
    }
  }

  const sorted = [...mapa.values()].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'receita' ? -1 : 1
    return b.total - a.total
  })

  // Limita a MAX_TABELA_ROWS linhas; o excedente é consolidado em linhas "Outros"
  if (sorted.length <= MAX_TABELA_ROWS) return sorted

  const top = sorted.slice(0, MAX_TABELA_ROWS)
  const rest = sorted.slice(MAX_TABELA_ROWS)

  const outrosReceita = rest.filter(r => r.tipo === 'receita')
  const outrosDespesa = rest.filter(r => r.tipo === 'despesa')

  if (outrosReceita.length > 0) {
    top.push({
      grupo: 'Outros',
      classificacao: `(${outrosReceita.length} classificações menores agrupadas)`,
      tipo: 'receita',
      total: outrosReceita.reduce((s, r) => s + r.total, 0),
      qtd:   outrosReceita.reduce((s, r) => s + r.qtd,   0),
    })
  }
  if (outrosDespesa.length > 0) {
    top.push({
      grupo: 'Outros',
      classificacao: `(${outrosDespesa.length} classificações menores agrupadas)`,
      tipo: 'despesa',
      total: outrosDespesa.reduce((s, r) => s + r.total, 0),
      qtd:   outrosDespesa.reduce((s, r) => s + r.qtd,   0),
    })
  }

  return top
}

const buildPrompt = (lancamentos: Lancamento[], resumo: { receitas: number; despesas: number }) => {
  const resultado = resumo.receitas - resumo.despesas
  const margem    = resumo.receitas > 0 ? ((resultado / resumo.receitas) * 100).toFixed(1) : '0.0'

  // Agrega por grupo/classificação — evita estouro de tokens com centenas de lançamentos
  const agregados = agregarLancamentos(lancamentos)
  const linhas = agregados
    .map(a => {
      const sinal = a.tipo === 'receita' ? '✅' : '🔴'
      return `| ${a.grupo} | ${a.classificacao} | ${sinal} | ${a.qtd} | ${moeda(a.total)} |`
    })
    .join('\n')

  return `Você é um assistente financeiro especializado em DRE para clínicas e pequenas empresas brasileiras.
Você TEM ACESSO ao plano de contas completo e às aulas da plataforma listados no CONTEXTO abaixo.

═══════════════════════════ CONTEXTO ═══════════════════════════
${PLANO_DE_CONTAS}
${AULAS_LINKS}
════════════════════════════════════════════════════════════════

Analise os dados financeiros abaixo e gere um relatório executivo em Markdown.

## Resumo financeiro
- Total de lançamentos: ${lancamentos.length}
- Receitas totais: ${moeda(resumo.receitas)}
- Despesas totais: ${moeda(resumo.despesas)}
- Resultado: ${moeda(resultado)} (${resultado >= 0 ? 'LUCRO' : 'PREJUÍZO'})
- Margem líquida: ${margem}%

## Lançamentos agrupados por classificação
| Grupo | Classificação | Tipo | Qtd | Total |
|-------|--------------|------|-----|-------|
${linhas}

═══════════════════ INSTRUÇÕES DO RELATÓRIO ═══════════════════
Responda APENAS em Markdown com as seguintes seções:

### 📊 Diagnóstico
Análise objetiva do cenário financeiro atual com base nos lançamentos. Comente sobre o resultado (lucro/prejuízo), os principais grupos de despesa e a composição da receita. (2-4 parágrafos)

### 💡 Sugestões práticas
Lista com 3-5 ações concretas e específicas para melhorar o resultado, baseadas nos dados.

### ⚠️ Alertas
Pontos de atenção: despesas elevadas, classificações inadequadas (compare com o plano de contas), riscos financeiros visíveis nos dados.

### 📚 Aulas recomendadas
Com base nos problemas identificados, recomende as aulas mais relevantes e os minutos exatos a assistir.
Use EXATAMENTE este formato para cada recomendação:
- **Nome da aula** — URL_EXATA_DO_CONTEXTO
  ▶ Assista a partir de (MM:SS) — motivo específico relacionado aos dados analisados

REGRAS OBRIGATÓRIAS:
- Responda em PT-BR, de forma objetiva e profissional.
- Cite APENAS as URLs que estão no CONTEXTO acima. Nunca invente URLs.
- Cite APENAS os minutos que aparecem no CONTEXTO acima. Nunca invente timestamps.
- Se nenhuma aula for relevante, escreva "Nenhuma aula específica identificada para este cenário."
- Não assuma dados ausentes; analise apenas o que foi enviado.
- Seja direto e prático, evite linguagem genérica.`
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
    const body  = await req.json()
    lancamentos = Array.isArray(body.lancamentos) ? body.lancamentos : []
    modelo      = String(body.modelo ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL
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
      else                      acc.despesas += Number(l.valor)
      return acc
    },
    { receitas: 0, despesas: 0 },
  )

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY não configurada no servidor Supabase.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const prompt = buildPrompt(lancamentos, resumo)

  const callOpenAI = async (modelToUse: string): Promise<Response> => {
    const controller = new AbortController()
    // 55 s — deixa margem para o overhead da Edge Function dentro do limite de 60 s do Supabase
    const timeout    = setTimeout(() => controller.abort(), 55000)
    try {
      return await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model:      modelToUse,
          messages:   [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens:  1500,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  try {
    let openaiRes = await callOpenAI(modelo)

    // Rate limit: aguarda 15 s e tenta mais uma vez antes de desistir
    if (openaiRes.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 15000))
      openaiRes = await callOpenAI(modelo)
    }

    // Fallback to default model if the configured one is unavailable
    if (!openaiRes.ok) {
      const errText = await openaiRes.text()

      if (openaiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições da IA atingido. Aguarde alguns segundos e tente novamente.' }),
          { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }

      if (modelo !== DEFAULT_MODEL && /model|not found|invalid/i.test(errText)) {
        openaiRes = await callOpenAI(DEFAULT_MODEL)
      } else {
        return new Response(
          JSON.stringify({ error: `OpenAI indisponível: ${errText.slice(0, 200)}` }),
          { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      if (openaiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições da IA atingido. Aguarde alguns segundos e tente novamente.' }),
          { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({ error: `OpenAI indisponível: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const openaiData = await openaiRes.json()
    const choice     = openaiData?.choices?.[0]
    const analysis   = String(choice?.message?.content || '').trim()

    if (!analysis) {
      const finishReason = choice?.finish_reason ?? 'desconhecido'
      return new Response(
        JSON.stringify({
          error: `IA não retornou conteúdo (finish_reason: ${finishReason}). O modelo configurado pode ser incompatível. Tente alterar o modelo nas configurações.`,
        }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ analysis }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))
    const msg = isTimeout
      ? 'A IA demorou muito para responder. Tente novamente em alguns instantes.'
      : (err instanceof Error ? err.message : String(err))
    return new Response(
      JSON.stringify({ error: `Erro ao chamar a IA: ${msg}` }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
