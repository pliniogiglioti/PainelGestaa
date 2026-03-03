// Supabase Edge Function: dre-ai-classify
// Calls GroqCloud API to identify BOTH the classification AND the group
// for a DRE lancamento, pre-filling the wizard fields for the user.
// Supports single-item and batch modes.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─────────────────────────────────────────────────────────────────────────────
// Plano de Contas DRE — conteúdo de public/ia/plano_de_contas_dre.md
// ─────────────────────────────────────────────────────────────────────────────
const PLANO_DE_CONTAS_RESUMIDO = `
GRUPOS e suas CLASSIFICAÇÕES (use exatamente esses nomes):

[Receitas Operacionais] → tipo: receita
  - Receita Dinheiro
  - Receita Cartão
  - Receita Financeiras
  - Receita PIX / Transferências
  - Receita Subadquirência (BT)

[Receitas Financeiras] → tipo: receita
  - Rendimento de Aplicação Financeira
  - Descontos Obtidos

[Deduções de Receita] → tipo: despesa
  - Vendas Canceladas / Devoluções
  - Tarifa de Cartão / Aluguel de POS
  - Tarifa de Cartão / Antecipação
  - Tarifa de Cartão / Padrão

[Impostos sobre Faturamento] → tipo: despesa
  - Impostos sobre Receitas - Simples Nacional
  - Impostos sobre Receitas - Lucro Presumido

[Despesas Operacionais] → tipo: despesa
  - OP Gratificações
  - Custo de Materiais e Insumos
  - Serviços Terceiros PF (dentistas)
  - Serviços Técnicos para Laboratórios
  - Royalties e Assistência Técnica
  - Fundo Nacional de Marketing

[Despesas com Pessoal] → tipo: despesa
  - Pró-labore
  - Salários e Ordenados
  - 13° Salário
  - Rescisões
  - INSS
  - FGTS
  - Outras Despesas Com Funcionários
  - Vale Transporte
  - Vale Refeição
  - Combustível

[Despesas Administrativas] → tipo: despesa
  - Adiantamento a Fornecedor
  - Energia Elétrica
  - Água e Esgoto
  - Aluguel
  - Manutenção e Conservação Predial
  - Telefonia
  - Uniformes
  - Manutenção e Reparos
  - Seguros
  - Uber e Táxi
  - Copa e Cozinha
  - Cartórios
  - Viagens e Estadias
  - Material de Escritório
  - Estacionamento
  - Material de Limpeza
  - Bens de Pequeno Valor
  - Custas Processuais
  - Outras Despesas
  - Consultoria
  - Contabilidade
  - Jurídico
  - Limpeza
  - Segurança e Vigilância
  - Serviço de Motoboy
  - IOF
  - Taxas e Emolumentos
  - Multa e Juros s/ Contas Pagas em Atraso
  - Exames Ocupacionais

[Despesas Comerciais e Marketing] → tipo: despesa
  - Refeições e Lanches
  - Outras Despesas com Vendas
  - Agência e Assessoria
  - Produção de Material
  - Marketing Digital
  - Feiras e Eventos

[Despesas com TI] → tipo: despesa
  - Internet
  - Informática e Software
  - Hospedagem de Dados
  - Sistema de Gestão

[Despesas Financeiras] → tipo: despesa
  - Despesas Bancárias
  - Depreciação e Amortização
  - Juros Passivos
  - Financiamentos / Empréstimos

[Investimentos] → tipo: despesa
  - Investimento - Máquinas e Equipamentos
  - Investimento - Computadores e Periféricos
  - Investimento - Móveis e Utensílios
  - Investimento - Instalações de Terceiros
  - Dividendos e Despesas dos Sócios
`

type ClassificacaoItem = { nome: string; tipo: 'receita' | 'despesa' }
type AiResult = { tipo: 'receita' | 'despesa'; classificacao_nome: string; grupo: string; fonte?: 'ia' | 'fallback' }
type LancamentoInput = { descricao: string; valor: number; tipo: 'receita' | 'despesa' }

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

const parseAiResponse = (content: string): { tipo: string; classificacao_nome: string; grupo: string } | null => {
  try {
    const jsonMatch = content.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as { tipo: string; classificacao_nome: string; grupo: string }
  } catch {
    return null
  }
}

/** Parse an array JSON response from the batch prompt */
const parseBatchResponse = (content: string): Array<{ tipo: string; classificacao_nome: string; grupo: string }> | null => {
  try {
    const arrMatch = content.match(/\[[\s\S]*\]/)
    if (!arrMatch) return null
    const arr = JSON.parse(arrMatch[0])
    if (!Array.isArray(arr)) return null
    return arr as Array<{ tipo: string; classificacao_nome: string; grupo: string }>
  } catch {
    return null
  }
}

const FALLBACK_RULES: Array<{ pattern: RegExp; tipo: 'receita' | 'despesa'; classificacao: string; grupo: string }> = [
  { pattern: /(venda|faturamento|consulta|atendimento|tratamento|servico prestado|honorario|receita|pagamento paciente)/i, tipo: 'receita', classificacao: 'Receita Dinheiro', grupo: 'Receitas Operacionais' },
  { pattern: /(pix|transferencia)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(cartao|card)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(rendimento|aplicacao|investimento financeiro)/i, tipo: 'receita', classificacao: 'Rendimento de Aplicação Financeira', grupo: 'Receitas Financeiras' },
  { pattern: /(cancelamento|devolucao|estorno)/i, tipo: 'despesa', classificacao: 'Vendas Canceladas / Devoluções', grupo: 'Deduções de Receita' },
  { pattern: /(taxa cartao|tarifa cartao|pos|maquininha|antecipacao)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Padrão', grupo: 'Deduções de Receita' },
  { pattern: /(simples nacional|imposto|iss|icms|pis|cofins|irpj|tributo|das )/i, tipo: 'despesa', classificacao: 'Impostos sobre Receitas - Simples Nacional', grupo: 'Impostos sobre Faturamento' },
  { pattern: /(material|insumo|implante|componente)/i, tipo: 'despesa', classificacao: 'Custo de Materiais e Insumos', grupo: 'Despesas Operacionais' },
  { pattern: /(laboratorio|tecnico dental)/i, tipo: 'despesa', classificacao: 'Serviços Técnicos para Laboratórios', grupo: 'Despesas Operacionais' },
  { pattern: /(dentista|terceiro pf|prestador|autonomo)/i, tipo: 'despesa', classificacao: 'Serviços Terceiros PF (dentistas)', grupo: 'Despesas Operacionais' },
  { pattern: /(royalt|assistencia tecnica franquia)/i, tipo: 'despesa', classificacao: 'Royalties e Assistência Técnica', grupo: 'Despesas Operacionais' },
  { pattern: /(marketing|midia|anuncio|google ads|meta ads|instagram|facebook ads)/i, tipo: 'despesa', classificacao: 'Marketing Digital', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(agencia|assessoria)/i, tipo: 'despesa', classificacao: 'Agência e Assessoria', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(pro.?labore)/i, tipo: 'despesa', classificacao: 'Pró-labore', grupo: 'Despesas com Pessoal' },
  { pattern: /(salario|ordenado|folha de pagamento)/i, tipo: 'despesa', classificacao: 'Salários e Ordenados', grupo: 'Despesas com Pessoal' },
  { pattern: /(13.? salario|decimo terceiro)/i, tipo: 'despesa', classificacao: '13° Salário', grupo: 'Despesas com Pessoal' },
  { pattern: /(rescisao|aviso previo|demissao)/i, tipo: 'despesa', classificacao: 'Rescisões', grupo: 'Despesas com Pessoal' },
  { pattern: /\binss\b/i, tipo: 'despesa', classificacao: 'INSS', grupo: 'Despesas com Pessoal' },
  { pattern: /\bfgts\b/i, tipo: 'despesa', classificacao: 'FGTS', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale transporte|vt\b)/i, tipo: 'despesa', classificacao: 'Vale Transporte', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale refeicao|vale alimentacao|vr\b|va\b)/i, tipo: 'despesa', classificacao: 'Vale Refeição', grupo: 'Despesas com Pessoal' },
  { pattern: /(combustivel|gasolina|etanol|abastecimento)/i, tipo: 'despesa', classificacao: 'Combustível', grupo: 'Despesas com Pessoal' },
  { pattern: /(aluguel|locacao|condominio)/i, tipo: 'despesa', classificacao: 'Aluguel', grupo: 'Despesas Administrativas' },
  { pattern: /(energia|luz\b|eletricidade)/i, tipo: 'despesa', classificacao: 'Energia Elétrica', grupo: 'Despesas Administrativas' },
  { pattern: /(agua\b|esgoto|sabesp|saneamento)/i, tipo: 'despesa', classificacao: 'Água e Esgoto', grupo: 'Despesas Administrativas' },
  { pattern: /(telefone|telefonia|celular|plano|vivo|claro|tim|oi\b)/i, tipo: 'despesa', classificacao: 'Telefonia', grupo: 'Despesas Administrativas' },
  { pattern: /(internet\b|banda larga|fibra)/i, tipo: 'despesa', classificacao: 'Internet', grupo: 'Despesas com TI' },
  { pattern: /(software|sistema|licenca|saas|assinatura)/i, tipo: 'despesa', classificacao: 'Sistema de Gestão', grupo: 'Despesas com TI' },
  { pattern: /(hospedagem|servidor|cloud|aws|gcp|azure)/i, tipo: 'despesa', classificacao: 'Hospedagem de Dados', grupo: 'Despesas com TI' },
  { pattern: /(computador|notebook|impressora|periférico|hardware)/i, tipo: 'despesa', classificacao: 'Investimento - Computadores e Periféricos', grupo: 'Investimentos' },
  { pattern: /(maquina|equipamento|autoclave|cadeira odonto)/i, tipo: 'despesa', classificacao: 'Investimento - Máquinas e Equipamentos', grupo: 'Investimentos' },
  { pattern: /(movel|mobilia|mesa|cadeira\b)/i, tipo: 'despesa', classificacao: 'Investimento - Móveis e Utensílios', grupo: 'Investimentos' },
  { pattern: /(reforma|instalacao|obra|construcao)/i, tipo: 'despesa', classificacao: 'Investimento - Instalações de Terceiros', grupo: 'Investimentos' },
  { pattern: /(contabilidade|contador|escritorio contabil)/i, tipo: 'despesa', classificacao: 'Contabilidade', grupo: 'Despesas Administrativas' },
  { pattern: /(advogado|juridico|advocacia)/i, tipo: 'despesa', classificacao: 'Jurídico', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza|higienizacao|faxina)/i, tipo: 'despesa', classificacao: 'Limpeza', grupo: 'Despesas Administrativas' },
  { pattern: /(seguranca|vigilancia|monitoramento)/i, tipo: 'despesa', classificacao: 'Segurança e Vigilância', grupo: 'Despesas Administrativas' },
  { pattern: /(seguro\b)/i, tipo: 'despesa', classificacao: 'Seguros', grupo: 'Despesas Administrativas' },
  { pattern: /(manutencao|reparo|conserto)/i, tipo: 'despesa', classificacao: 'Manutenção e Reparos', grupo: 'Despesas Administrativas' },
  { pattern: /(iof\b)/i, tipo: 'despesa', classificacao: 'IOF', grupo: 'Despesas Administrativas' },
  { pattern: /(juros|multa\b|mora\b)/i, tipo: 'despesa', classificacao: 'Multa e Juros s/ Contas Pagas em Atraso', grupo: 'Despesas Administrativas' },
  { pattern: /(financiamento|emprestimo|credito)/i, tipo: 'despesa', classificacao: 'Financiamentos / Empréstimos', grupo: 'Despesas Financeiras' },
  { pattern: /(tarifa bancaria|taxa bancaria|manutencao conta)/i, tipo: 'despesa', classificacao: 'Despesas Bancárias', grupo: 'Despesas Financeiras' },
  { pattern: /(depreciacao|amortizacao)/i, tipo: 'despesa', classificacao: 'Depreciação e Amortização', grupo: 'Despesas Financeiras' },
  { pattern: /(dividendo|distribuicao lucro|retirada socio)/i, tipo: 'despesa', classificacao: 'Dividendos e Despesas dos Sócios', grupo: 'Investimentos' },
  { pattern: /(consultoria\b)/i, tipo: 'despesa', classificacao: 'Consultoria', grupo: 'Despesas Administrativas' },
  { pattern: /(refeicao|almoco|lanche|restaurante)/i, tipo: 'despesa', classificacao: 'Refeições e Lanches', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(viagem|estadia|hotel|passagem)/i, tipo: 'despesa', classificacao: 'Viagens e Estadias', grupo: 'Despesas Administrativas' },
  { pattern: /(uber\b|taxi|99\b|ifood)/i, tipo: 'despesa', classificacao: 'Uber e Táxi', grupo: 'Despesas Administrativas' },
  { pattern: /(material escritorio|papel|caneta|toner)/i, tipo: 'despesa', classificacao: 'Material de Escritório', grupo: 'Despesas Administrativas' },
  { pattern: /(uniforme|epj|epi\b)/i, tipo: 'despesa', classificacao: 'Uniformes', grupo: 'Despesas Administrativas' },
  { pattern: /(estacionamento|parking)/i, tipo: 'despesa', classificacao: 'Estacionamento', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza\b|desinfetante|produto limpeza)/i, tipo: 'despesa', classificacao: 'Material de Limpeza', grupo: 'Despesas Administrativas' },
]

const pickFallback = (
  descricao: string,
  tipoEntrada: 'receita' | 'despesa',
  classificacoesDisponiveis: ClassificacaoItem[],
): AiResult => {
  const text = normalize(descricao)

  for (const rule of FALLBACK_RULES) {
    if (rule.pattern.test(text)) {
      const matched = classificacoesDisponiveis.find(c => normalize(c.nome) === normalize(rule.classificacao))
      return {
        tipo: rule.tipo,
        classificacao_nome: matched?.nome ?? rule.classificacao,
        grupo: rule.grupo,
        fonte: 'fallback',
      }
    }
  }

  const defaultReceita = classificacoesDisponiveis.find(c => c.tipo === 'receita')
  const defaultDespesa = classificacoesDisponiveis.find(c => c.tipo === 'despesa')

  return {
    tipo: tipoEntrada,
    classificacao_nome: tipoEntrada === 'receita'
      ? (defaultReceita?.nome ?? 'Receita Dinheiro')
      : (defaultDespesa?.nome ?? 'Outras Despesas'),
    grupo: tipoEntrada === 'receita' ? 'Receitas Operacionais' : 'Despesas Administrativas',
    fonte: 'fallback',
  }
}

const toFinalResult = (
  parsed: { tipo: string; classificacao_nome: string; grupo: string },
  classificacoesDisponiveis: ClassificacaoItem[],
): AiResult => {
  const tipo: 'receita' | 'despesa' = parsed.tipo === 'receita' ? 'receita' : 'despesa'
  const nomeAi = String(parsed.classificacao_nome ?? '').trim()
  const matched = classificacoesDisponiveis.find(c => normalize(c.nome) === normalize(nomeAi))
  const classificacao_nome = matched?.nome || nomeAi || (tipo === 'receita' ? 'Receita Dinheiro' : 'Outras Despesas')

  return {
    tipo,
    classificacao_nome,
    grupo: String(parsed.grupo ?? '').trim() || (tipo === 'receita' ? 'Receitas Operacionais' : 'Despesas Administrativas'),
    fonte: 'ia',
  }
}

const callGroq = async (groqApiKey: string, model: string, prompt: string): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    return await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.05,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

// ── Batch handler ─────────────────────────────────────────────────────────────

async function handleBatch(
  lancamentos: LancamentoInput[],
  classificacoesDisponiveis: ClassificacaoItem[],
  modelo: string,
  groqApiKey: string | undefined,
): Promise<AiResult[]> {
  if (!groqApiKey) {
    return lancamentos.map(l => pickFallback(l.descricao, l.tipo, classificacoesDisponiveis))
  }

  // Prompt compacto para o batch — omite o plano detalhado para economizar tokens.
  // Os itens óbvios já foram resolvidos pelo fallback local no cliente; só chegam
  // aqui os casos ambíguos, então uma referência resumida é suficiente.
  const GRUPOS_COMPACTOS = `receita→ Receitas Operacionais(Receita Dinheiro,Receita Cartão,Receita PIX/Transferências) | Receitas Financeiras(Rendimento de Aplicação,Descontos Obtidos)
despesa→ Deduções de Receita | Impostos sobre Faturamento | Despesas Operacionais | Despesas com Pessoal(Pró-labore,Salários,INSS,FGTS,VT,VR,Combustível) | Despesas Administrativas(Aluguel,Energia,Água,Telefonia,Seguros,Manutenção,Consultoria,Contabilidade,Jurídico,Limpeza,IOF,Juros/Multas,Material Escritório,Uniformes) | Despesas Comerciais e Marketing(Marketing Digital,Refeições,Agência) | Despesas com TI(Internet,Software,Hospedagem) | Despesas Financeiras(Despesas Bancárias,Financiamentos,Juros Passivos) | Investimentos(Máquinas,Computadores,Móveis,Instalações,Dividendos)`

  const itensTexto = lancamentos
    .map((l, i) => `${i + 1}. "${l.descricao}" | ${l.tipo}`)
    .join('\n')

  const prompt = `Assistente contábil DRE Brasil. Classifique cada lançamento.

GRUPOS: ${GRUPOS_COMPACTOS}

LANÇAMENTOS:
${itensTexto}

RETORNE APENAS array JSON com ${lancamentos.length} objetos na mesma ordem:
[{"tipo":"despesa","classificacao_nome":"Nome exato","grupo":"Grupo exato"}, ...]`

  let res = await callGroq(groqApiKey, modelo, prompt)

  if (!res.ok && modelo !== DEFAULT_MODEL) {
    const errText = await res.text()
    if (/model|decommissioned|not found|invalid/i.test(errText)) {
      res = await callGroq(groqApiKey, DEFAULT_MODEL, prompt)
    }
  }

  if (!res.ok) {
    return lancamentos.map(l => pickFallback(l.descricao, l.tipo, classificacoesDisponiveis))
  }

  const groqData = await res.json()
  const content: string = groqData?.choices?.[0]?.message?.content ?? ''
  const parsed = parseBatchResponse(content)

  if (!parsed || parsed.length !== lancamentos.length) {
    // Fallback para todos se o parse falhar
    return lancamentos.map(l => pickFallback(l.descricao, l.tipo, classificacoesDisponiveis))
  }

  return parsed.map((p, i) => {
    try {
      return toFinalResult(p, classificacoesDisponiveis)
    } catch {
      return pickFallback(lancamentos[i].descricao, lancamentos[i].tipo, classificacoesDisponiveis)
    }
  })
}

// ── Single handler (backwards compat) ────────────────────────────────────────

async function handleSingle(
  descricao: string,
  valor: number,
  tipoEntrada: 'receita' | 'despesa',
  classificacoesDisponiveis: ClassificacaoItem[],
  modelo: string,
  groqApiKey: string | undefined,
): Promise<AiResult> {
  const fallback = pickFallback(descricao, tipoEntrada, classificacoesDisponiveis)
  if (!groqApiKey) return { ...fallback, aviso: 'GROQ_API_KEY não configurada; usado fallback local.' } as AiResult & { aviso: string }

  const listaClassificacoesBanco = classificacoesDisponiveis.length > 0
    ? `\nClassificações já cadastradas no sistema (prefira estas quando aplicável):\n` +
      classificacoesDisponiveis.map((c, i) => `${i + 1}. "${c.nome}" (${c.tipo})`).join('\n')
    : ''

  const prompt = `Você é um assistente contábil especializado em DRE para clínicas e pequenas empresas brasileiras.

Lançamento financeiro a classificar:
- Descrição: "${descricao}"
- Valor: R$ ${valor.toFixed(2).replace('.', ',')}
- Tipo informado pelo usuário: ${tipoEntrada}

═══════════ PLANO DE CONTAS (referência principal) ═══════════
${PLANO_DE_CONTAS_RESUMIDO}
═════════════════════════════════════════════════════════════${listaClassificacoesBanco}

TAREFA:
1. Determine se é "receita" ou "despesa" com base no plano de contas.
2. Escolha a classificação MAIS ESPECÍFICA do plano de contas que se encaixa na descrição.
3. Retorne o grupo correspondente conforme o plano de contas.
4. Responda SOMENTE com JSON válido, sem explicações.

Formato obrigatório:
{"tipo": "despesa", "classificacao_nome": "Nome exato do plano de contas", "grupo": "Grupo exato do plano de contas"}`

  try {
    let groqRes = await callGroq(groqApiKey, modelo, prompt)
    if (!groqRes.ok) {
      const errText = await groqRes.text()
      const shouldRetry = modelo !== DEFAULT_MODEL && /model|decommissioned|not found|invalid/i.test(errText)
      if (shouldRetry) groqRes = await callGroq(groqApiKey, DEFAULT_MODEL, prompt)
      else return { ...fallback, aviso: 'Groq indisponível; usado fallback.' } as AiResult & { aviso: string }
    }
    if (!groqRes.ok) return { ...fallback, aviso: 'Groq indisponível; usado fallback.' } as AiResult & { aviso: string }

    const groqData = await groqRes.json()
    const content: string = groqData?.choices?.[0]?.message?.content ?? ''
    const parsed = parseAiResponse(content)
    if (!parsed) return { ...fallback, aviso: 'Resposta fora do formato esperado; usado fallback.' } as AiResult & { aviso: string }
    return toFinalResult(parsed, classificacoesDisponiveis)
  } catch (err) {
    return { ...fallback, aviso: `Erro na IA (${String(err)}); usado fallback.` } as AiResult & { aviso: string }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const modelo = String(body.modelo ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL
  const classificacoesDisponiveis: ClassificacaoItem[] = Array.isArray(body.classificacoes_disponiveis)
    ? body.classificacoes_disponiveis as ClassificacaoItem[]
    : []
  const groqApiKey = Deno.env.get('GROQ_API_KEY')

  // ── Batch mode ──
  if (Array.isArray(body.lancamentos)) {
    const lancamentos = (body.lancamentos as LancamentoInput[]).map(l => ({
      descricao: String(l.descricao ?? ''),
      valor: Number(l.valor ?? 0),
      tipo: l.tipo === 'receita' ? 'receita' : 'despesa' as 'receita' | 'despesa',
    }))

    if (lancamentos.length === 0) {
      return new Response(JSON.stringify({ resultados: [] }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const resultados = await handleBatch(lancamentos, classificacoesDisponiveis, modelo, groqApiKey)
    return new Response(JSON.stringify({ resultados }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // ── Single mode (backwards compat) ──
  const descricao = String(body.descricao ?? '')
  const valor = Number(body.valor ?? 0)
  const tipoEntrada: 'receita' | 'despesa' = body.tipo === 'receita' ? 'receita' : 'despesa'

  const result = await handleSingle(descricao, valor, tipoEntrada, classificacoesDisponiveis, modelo, groqApiKey)
  return new Response(JSON.stringify(result), {
    status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
