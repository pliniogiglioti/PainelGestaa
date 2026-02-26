// Supabase Edge Function: dre-ai-classify
// Calls GroqCloud API to identify BOTH the classification AND the group
// for a DRE lancamento, pre-filling the wizard fields for the user.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ClassificacaoItem = { nome: string; tipo: 'receita' | 'despesa' }
type AiResult = { tipo: 'receita' | 'despesa'; classificacao_nome: string; grupo: string; fonte?: 'ia' | 'fallback' }

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const parseAiResponse = (content: string): { tipo: string; classificacao_nome: string; grupo: string } | null => {
  const jsonMatch = content.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0]) as { tipo: string; classificacao_nome: string; grupo: string }
}

const pickFallback = (
  descricao: string,
  tipoEntrada: 'receita' | 'despesa',
  classificacoesDisponiveis: ClassificacaoItem[],
  gruposExistentes: string[],
): AiResult => {
  const text = normalize(descricao)

  const isImobilizado = /(carro|veiculo|automovel|moto|caminhao|maquina|equipamento|computador|notebook|impressora|mobilia|moveis)/.test(text)
  const isImposto = /(imposto|tributo|icms|iss|pis|cofins|irpj|simples)/.test(text)
  const isAluguel = /(aluguel|locacao|condominio)/.test(text)
  const isFolha = /(salario|pro labore|folha|fgts|inss|ferias|decimo terceiro)/.test(text)
  const isReceita = /(venda|faturamento|recebimento|mensalidade|consulta|servico prestado|honorario)/.test(text)

  const tipo: 'receita' | 'despesa' = isReceita ? 'receita' : tipoEntrada || 'despesa'

  const classesTipo = classificacoesDisponiveis.filter(c => c.tipo === tipo)
  const chooseByName = (patterns: RegExp[]) =>
    classesTipo.find(c => patterns.some(pattern => pattern.test(normalize(c.nome))))?.nome

  const classificacaoNome =
    (isImobilizado && (chooseByName([/ativo imobilizado/, /ativo nao circulante/, /imobilizado/]) || 'Ativo Imobilizado'))
    || (isImposto && chooseByName([/impost/, /tribut/]))
    || (isAluguel && chooseByName([/aluguel/, /loca/]))
    || (isFolha && chooseByName([/pessoal/, /folha/, /salari/]))
    || (isReceita && chooseByName([/servic/, /receita/, /faturamento/, /consulta/]))
    || classesTipo[0]?.nome
    || classificacoesDisponiveis[0]?.nome
    || (tipo === 'receita' ? 'Receita Operacional' : 'Despesa Operacional')

  const grupoPreferido =
    isImobilizado ? 'Ativo Imobilizado'
    : isImposto ? 'Tributos'
    : isAluguel ? 'Infraestrutura'
    : isFolha ? 'Pessoal'
    : isReceita ? 'Receita Operacional'
    : 'Geral'

  const grupo = gruposExistentes.find(g => normalize(g) === normalize(grupoPreferido)) || grupoPreferido

  return { tipo, classificacao_nome: classificacaoNome, grupo, fonte: 'fallback' }
}

const toFinalResult = (
  parsed: { tipo: string; classificacao_nome: string; grupo: string },
  classificacoesDisponiveis: ClassificacaoItem[],
): AiResult => {
  const tipo: 'receita' | 'despesa' = parsed.tipo === 'receita' || parsed.tipo === 'despesa' ? parsed.tipo : 'despesa'
  const nomeAi = String(parsed.classificacao_nome ?? '').trim()
  const matched = classificacoesDisponiveis.find(c => normalize(c.nome) === normalize(nomeAi))
  const classificacao_nome = matched?.nome
    || nomeAi
    || classificacoesDisponiveis.find(c => c.tipo === tipo)?.nome
    || classificacoesDisponiveis[0]?.nome
    || ''

  return {
    tipo,
    classificacao_nome,
    grupo: String(parsed.grupo ?? '').trim() || 'Geral',
    fonte: 'ia',
  }
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

  let descricao = ''
  let valor = 0
  let modelo = DEFAULT_MODEL
  let tipoEntrada: 'receita' | 'despesa' = 'despesa'
  let classificacoesDisponiveis: ClassificacaoItem[] = []
  let gruposExistentes: string[] = []

  try {
    const body = await req.json()
    descricao = String(body.descricao ?? '')
    valor = Number(body.valor ?? 0)
    modelo = String(body.modelo ?? DEFAULT_MODEL)
    tipoEntrada = body.tipo === 'receita' ? 'receita' : 'despesa'
    classificacoesDisponiveis = Array.isArray(body.classificacoes_disponiveis) ? body.classificacoes_disponiveis : []
    gruposExistentes = Array.isArray(body.grupos_existentes) ? body.grupos_existentes : []
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const listaClassificacoes = classificacoesDisponiveis.length > 0
    ? classificacoesDisponiveis.map((c, i) => `${i + 1}. "${c.nome}" (${c.tipo})`).join('\n')
    : '(nenhuma cadastrada)'

  const listaGrupos = gruposExistentes.length > 0
    ? gruposExistentes.map(g => `"${g}"`).join(', ')
    : 'nenhum ainda'

  const prompt = `Você é um assistente contábil brasileiro especializado em DRE.

Lançamento financeiro:
- Descrição: "${descricao}"
- Valor: R$ ${valor.toFixed(2).replace('.', ',')}

Classificações disponíveis (use quando fizer sentido):
${listaClassificacoes}

Grupos já existentes no sistema: ${listaGrupos}

Sua tarefa:
1. Determine se este lançamento é "receita" ou "despesa".
2. Escolha a classificação mais adequada. Se for aquisição de bem durável para uso da empresa (carro, veículo, máquina, equipamento, computador, móveis), priorize "Ativo Imobilizado"/"Ativo Não Circulante".
3. Sugira o grupo/categoria mais correto (1-4 palavras).
4. Responda estritamente em JSON.

Formato:
{
  "tipo": "receita",
  "classificacao_nome": "classificação mais adequada",
  "grupo": "grupo mais adequado"
}`

  const fallback = pickFallback(descricao, tipoEntrada, classificacoesDisponiveis, gruposExistentes)
  const groqApiKey = Deno.env.get('GROQ_API_KEY')

  if (!groqApiKey) {
    return new Response(JSON.stringify({ ...fallback, aviso: 'GROQ_API_KEY não configurada; usado fallback local.' }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const model = String(modelo || DEFAULT_MODEL).trim() || DEFAULT_MODEL

    const callGroq = async (modelToUse: string) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      try {
        return await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelToUse,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.05,
            max_tokens: 120,
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
    }

    let groqRes = await callGroq(model)
    if (!groqRes.ok) {
      const errText = await groqRes.text()
      const shouldRetryWithDefault = model !== DEFAULT_MODEL && /model|decommissioned|not found|invalid/i.test(errText)
      if (shouldRetryWithDefault) {
        groqRes = await callGroq(DEFAULT_MODEL)
      } else {
        return new Response(JSON.stringify({ ...fallback, aviso: `Groq indisponível (${errText.slice(0, 120)}). Usado fallback.` }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }
    }

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      return new Response(JSON.stringify({ ...fallback, aviso: `Groq indisponível (${errText.slice(0, 120)}). Usado fallback.` }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const groqData = await groqRes.json()
    const content: string = groqData?.choices?.[0]?.message?.content ?? ''
    const parsed = parseAiResponse(content)

    if (!parsed) {
      return new Response(JSON.stringify({ ...fallback, aviso: 'Resposta da IA fora do formato esperado; usado fallback.' }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const result = toFinalResult(parsed, classificacoesDisponiveis)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ...fallback, aviso: `Erro na IA (${String(err)}); usado fallback.` }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
