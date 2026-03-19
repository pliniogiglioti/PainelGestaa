// Supabase Edge Function: dre-ai-classify
// Calls OpenAI API to identify BOTH the classification AND the group
// for a DRE lancamento, pre-filling the wizard fields for the user.
// Supports single-item and batch modes.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'

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
  - Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas
  - Tarifa de Cartão / Meios de Pagamento - Antecipação
  - Tarifa de Cartão / Meios de Pagamento - Padrão

[Impostos sobre Faturamento] → tipo: despesa
  - Impostos sobre Receitas - Presumido e Simples Nacional

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
type AiResult = {
  tipo: 'receita' | 'despesa'
  classificacao_nome: string
  grupo: string
  fonte?: 'ia' | 'fallback'
  /** 'confirmada' = bateu com o banco/regras; 'sugerida' = IA propôs algo razoável fora do cadastro */
  confianca: 'confirmada' | 'sugerida'
}
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
  // ── Deduções de Receita (tarifas e taxas) — ANTES das receitas para evitar falso match ──
  { pattern: /(antecipacao.*cartao|cartao.*antecipacao|antecip)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Meios de Pagamento - Antecipação', grupo: 'Deduções de Receita' },
  { pattern: /(pos\b|maquininha|aluguel.*pos|pos.*aluguel)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas', grupo: 'Deduções de Receita' },
  { pattern: /(tarifa.*venda|tarifa.*credito|tarifa.*debito|tarifa.*adquir|getnet.*tarifa|getnet.*cobranca|cobranca.*getnet|adquirencia.*tarifa|taxa cartao|tarifa cartao)/i, tipo: 'despesa', classificacao: 'Tarifa de Cartão / Meios de Pagamento - Padrão', grupo: 'Deduções de Receita' },
  { pattern: /(cancelamento|devolucao|estorno)/i, tipo: 'despesa', classificacao: 'Vendas Canceladas / Devoluções', grupo: 'Deduções de Receita' },
  // ── Despesas bancárias — ANTES dos padrões amplos de pix/transferencia para evitar falso match ──
  { pattern: /(tarifa bancaria|taxa bancaria|manutencao conta|tx manut|taxa manutencao|liquidacao qrcode|liquidacao pix|taxa.*pix|taxa.*transferencia|cip liquidacao|compensacao cip|ted cobranca|doc cobranca)/i, tipo: 'despesa', classificacao: 'Despesas Bancárias', grupo: 'Despesas Financeiras' },
  // ── Receitas ──
  { pattern: /(getnet|cielo|rede\b|stone\b|pagseguro|sumup|pagbank|mercadopago|visa.*credito|master.*credito|elo.*credito|amex.*credito|credito.*adquir|subadquir|adquirente)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(cartao|card)/i, tipo: 'receita', classificacao: 'Receita Cartão', grupo: 'Receitas Operacionais' },
  { pattern: /(transferencia pix rem|pix.*receb|receb.*pix|pix.*entr|cred pix|credito pix|pix cred)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(ted receb|doc receb|ted entr|doc entr|cred ted|cred doc)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(pix|transferencia)/i, tipo: 'receita', classificacao: 'Receita PIX / Transferências', grupo: 'Receitas Operacionais' },
  { pattern: /(rendimento|aplicacao|invest facil|invest auto|cdb|lci|lca)/i, tipo: 'receita', classificacao: 'Rendimento de Aplicação Financeira', grupo: 'Receitas Financeiras' },
  { pattern: /(venda|faturamento|consulta|atendimento|tratamento|servico prestado|honorario|receita|pagamento paciente)/i, tipo: 'receita', classificacao: 'Receita Dinheiro', grupo: 'Receitas Operacionais' },
  // ── Impostos ──
  { pattern: /(simples nacional|lucro presumido|das\b|darf\b|imposto|iss|icms|pis|cofins|irpj|tributo|guia recolhimento)/i, tipo: 'despesa', classificacao: 'Impostos sobre Receitas - Presumido e Simples Nacional', grupo: 'Impostos sobre Faturamento' },
  // ── Despesas Operacionais ──
  { pattern: /(laboratorio|\blab\b|tecnico dental|dental.*lab|pag.*\blab\b|laborat)/i, tipo: 'despesa', classificacao: 'Serviços Técnicos para Laboratórios', grupo: 'Despesas Operacionais' },
  { pattern: /(material|insumo|implante|componente)/i, tipo: 'despesa', classificacao: 'Custo de Materiais e Insumos', grupo: 'Despesas Operacionais' },
  { pattern: /(dentista|terceiro pf|prestador|autonomo)/i, tipo: 'despesa', classificacao: 'Serviços Terceiros PF (dentistas)', grupo: 'Despesas Operacionais' },
  { pattern: /(royalt|assistencia tecnica franquia)/i, tipo: 'despesa', classificacao: 'Royalties e Assistência Técnica', grupo: 'Despesas Operacionais' },
  { pattern: /(comissao\b|gratificacao\b|bonus func)/i, tipo: 'despesa', classificacao: 'OP Gratificações', grupo: 'Despesas Operacionais' },
  // ── Marketing ──
  { pattern: /(marketing|midia|anuncio|google ads|meta ads|instagram|facebook ads)/i, tipo: 'despesa', classificacao: 'Marketing Digital', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(agencia|assessoria)/i, tipo: 'despesa', classificacao: 'Agência e Assessoria', grupo: 'Despesas Comerciais e Marketing' },
  // ── Pessoal ──
  { pattern: /(pro.?labore)/i, tipo: 'despesa', classificacao: 'Pró-labore', grupo: 'Despesas com Pessoal' },
  { pattern: /(cred salario|dep salario|deposito salario|credito salario|pagto salario|pgto salario|folha de pagamento|salario|ordenado)/i, tipo: 'despesa', classificacao: 'Salários e Ordenados', grupo: 'Despesas com Pessoal' },
  { pattern: /(13.? salario|decimo terceiro)/i, tipo: 'despesa', classificacao: '13° Salário', grupo: 'Despesas com Pessoal' },
  { pattern: /(rescisao|aviso previo|demissao|verbas rescisoria)/i, tipo: 'despesa', classificacao: 'Rescisões', grupo: 'Despesas com Pessoal' },
  { pattern: /(\binss\b|gps\b|pagto gps|pgto gps)/i, tipo: 'despesa', classificacao: 'INSS', grupo: 'Despesas com Pessoal' },
  { pattern: /\bfgts\b/i, tipo: 'despesa', classificacao: 'FGTS', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale transporte|vt\b|beneficio transporte)/i, tipo: 'despesa', classificacao: 'Vale Transporte', grupo: 'Despesas com Pessoal' },
  { pattern: /(vale refeicao|vale alimentacao|vr\b|va\b|ticket refeicao|alelo|sodexo|flash beneficio)/i, tipo: 'despesa', classificacao: 'Vale Refeição', grupo: 'Despesas com Pessoal' },
  { pattern: /(combustivel|gasolina|etanol|abastecimento|posto )/i, tipo: 'despesa', classificacao: 'Combustível', grupo: 'Despesas com Pessoal' },
  { pattern: /(plano saude|plano odonto|convenio medico|unimed|amil|hapvida)/i, tipo: 'despesa', classificacao: 'Outras Despesas Com Funcionários', grupo: 'Despesas com Pessoal' },
  // ── Administrativas ──
  { pattern: /(aluguel|locacao|condominio)/i, tipo: 'despesa', classificacao: 'Aluguel', grupo: 'Despesas Administrativas' },
  { pattern: /(energia|luz\b|eletricidade|enel\b|cemig\b|copel\b|elektro\b|cpfl\b|coelba\b|energisa\b)/i, tipo: 'despesa', classificacao: 'Energia Elétrica', grupo: 'Despesas Administrativas' },
  { pattern: /(agua\b|esgoto|sabesp\b|saneamento|caesb\b|sanepar\b|cedae\b|cosanpa\b|copasa\b)/i, tipo: 'despesa', classificacao: 'Água e Esgoto', grupo: 'Despesas Administrativas' },
  { pattern: /(telefone|telefonia|celular|plano|vivo\b|claro\b|tim\b|oi\b|nextel|algar)/i, tipo: 'despesa', classificacao: 'Telefonia', grupo: 'Despesas Administrativas' },
  { pattern: /(internet\b|banda larga|fibra|net combo)/i, tipo: 'despesa', classificacao: 'Internet', grupo: 'Despesas com TI' },
  { pattern: /(software|sistema|licenca|saas|assinatura|clinicorp|dental office|wevio|totvs|sankhya)/i, tipo: 'despesa', classificacao: 'Sistema de Gestão', grupo: 'Despesas com TI' },
  { pattern: /(hospedagem|servidor|cloud|aws\b|gcp\b|azure\b|digitalocean)/i, tipo: 'despesa', classificacao: 'Hospedagem de Dados', grupo: 'Despesas com TI' },
  { pattern: /(computador|notebook|impressora|periferico|hardware)/i, tipo: 'despesa', classificacao: 'Investimento - Computadores e Periféricos', grupo: 'Investimentos' },
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
  { pattern: /(financiamento|emprestimo)/i, tipo: 'despesa', classificacao: 'Financiamentos / Empréstimos', grupo: 'Despesas Financeiras' },
  { pattern: /(depreciacao|amortizacao)/i, tipo: 'despesa', classificacao: 'Depreciação e Amortização', grupo: 'Despesas Financeiras' },
  { pattern: /(dividendo|distribuicao lucro|retirada socio)/i, tipo: 'despesa', classificacao: 'Dividendos e Despesas dos Sócios', grupo: 'Investimentos' },
  { pattern: /(consultoria\b)/i, tipo: 'despesa', classificacao: 'Consultoria', grupo: 'Despesas Administrativas' },
  { pattern: /(refeicao|almoco|lanche|restaurante)/i, tipo: 'despesa', classificacao: 'Refeições e Lanches', grupo: 'Despesas Comerciais e Marketing' },
  { pattern: /(viagem|estadia|hotel|passagem)/i, tipo: 'despesa', classificacao: 'Viagens e Estadias', grupo: 'Despesas Administrativas' },
  { pattern: /(uber\b|taxi|99\b|ifood|cabify)/i, tipo: 'despesa', classificacao: 'Uber e Táxi', grupo: 'Despesas Administrativas' },
  { pattern: /(material escritorio|papel|caneta|toner|cartucho)/i, tipo: 'despesa', classificacao: 'Material de Escritório', grupo: 'Despesas Administrativas' },
  { pattern: /(uniforme|epj|epi\b)/i, tipo: 'despesa', classificacao: 'Uniformes', grupo: 'Despesas Administrativas' },
  { pattern: /(estacionamento|parking)/i, tipo: 'despesa', classificacao: 'Estacionamento', grupo: 'Despesas Administrativas' },
  { pattern: /(limpeza\b|desinfetante|produto limpeza)/i, tipo: 'despesa', classificacao: 'Material de Limpeza', grupo: 'Despesas Administrativas' },
  { pattern: /(motoboy|loggi\b|entregador|motofrete)/i, tipo: 'despesa', classificacao: 'Serviço de Motoboy', grupo: 'Despesas Administrativas' },
  { pattern: /(taxa\b|tarifa\b|emolumento)/i, tipo: 'despesa', classificacao: 'Taxas e Emolumentos', grupo: 'Despesas Administrativas' },
  { pattern: /(exame.*admiss|exame.*demiss|exame.*periodi|medicina.*trabalho)/i, tipo: 'despesa', classificacao: 'Exames Ocupacionais', grupo: 'Despesas Administrativas' },
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
        confianca: 'confirmada',
      }
    }
  }

  return {
    tipo: tipoEntrada,
    classificacao_nome: 'Não Identificado',
    grupo: '',
    fonte: 'fallback',
    confianca: 'sugerida',
  }
}

/**
 * Detecta se a IA devolveu o texto da descrição original como classificação
 * (alucinação). Heurísticas:
 *  - >50% dos chars são maiúsculos (estilo extrato bancário)
 *  - Contém dígitos (datas, códigos bancários)
 *  - Nome muito longo (>8 palavras)
 *  - O nome normalizado está contido na descrição normalizada
 */
const isAlucinacao = (nomeAi: string, descricao: string): boolean => {
  if (!nomeAi) return true
  const upper = (nomeAi.match(/[A-Z]/g) ?? []).length
  if (nomeAi.length > 5 && upper / nomeAi.length > 0.55) return true
  if (/\d/.test(nomeAi)) return true
  if (nomeAi.split(/\s+/).length > 8) return true
  const n1 = normalize(nomeAi)
  const n2 = normalize(descricao)
  if (n1.length > 12 && n2.includes(n1)) return true
  return false
}

const toFinalResult = (
  parsed: { tipo: string; classificacao_nome: string; grupo: string },
  classificacoesDisponiveis: ClassificacaoItem[],
  descricaoOriginal: string,
): AiResult => {
  const tipo: 'receita' | 'despesa' = parsed.tipo === 'receita' ? 'receita' : 'despesa'
  const nomeAi = String(parsed.classificacao_nome ?? '').trim()
  const grupo  = String(parsed.grupo ?? '').trim() || (tipo === 'receita' ? 'Receitas Operacionais' : 'Despesas Administrativas')

  // 1. Bate exatamente com o banco de classificações cadastradas (normalizado)
  const matched = classificacoesDisponiveis.find(c => normalize(c.nome) === normalize(nomeAi))
  if (matched) {
    return { tipo, classificacao_nome: matched.nome, grupo, fonte: 'ia', confianca: 'confirmada' }
  }

  // 2. IA não encontrou exato → tenta fallback por regras locais
  const fallback = pickFallback(descricaoOriginal, tipo, classificacoesDisponiveis)
  if (fallback.classificacao_nome !== 'Não Identificado') {
    return { ...fallback, fonte: 'fallback', confianca: 'confirmada' }
  }

  // 3. Sem match algum → usa "Outras Despesas" ou equivalente como último recurso
  const outrasDespesas = classificacoesDisponiveis.find(c => normalize(c.nome) === 'outras despesas')
  const receitaDinheiro = classificacoesDisponiveis.find(c => normalize(c.nome) === 'receita dinheiro')
  const ultimoRecurso = tipo === 'receita' ? receitaDinheiro : outrasDespesas
  if (ultimoRecurso) {
    return { tipo, classificacao_nome: ultimoRecurso.nome, grupo: grupo || (tipo === 'receita' ? 'Receitas Operacionais' : 'Despesas Administrativas'), fonte: 'fallback', confianca: 'sugerida' }
  }

  return { tipo, classificacao_nome: 'Não Identificado', grupo: '', fonte: 'ia', confianca: 'sugerida' }
}

const callOpenAI = async (openaiApiKey: string, model: string, prompt: string): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    return await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
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
  openaiApiKey: string | undefined,
): Promise<AiResult[]> {
  if (!openaiApiKey) {
    return lancamentos.map(l => pickFallback(l.descricao, l.tipo, classificacoesDisponiveis))
  }

  // Usa os nomes EXATOS do banco de dados no prompt para que a IA retorne nomes que casam na validação
  const listaReceitas = classificacoesDisponiveis.filter(c => c.tipo === 'receita').map(c => `"${c.nome}"`).join(', ')
  const listaDespesas = classificacoesDisponiveis.filter(c => c.tipo === 'despesa').map(c => `"${c.nome}"`).join(', ')

  const itensTexto = lancamentos
    .map((l, i) => `${i + 1}. "${l.descricao}" | ${l.tipo}`)
    .join('\n')

  const prompt = `Assistente contábil DRE Brasil. Classifique cada lançamento usando EXATAMENTE os nomes abaixo.

CLASSIFICAÇÕES DISPONÍVEIS (use o nome EXATO, incluindo acentos e capitalização):
Receitas: ${listaReceitas || '"Receita Dinheiro"'}
Despesas: ${listaDespesas || '"Outras Despesas"'}

LANÇAMENTOS:
${itensTexto}

REGRAS:
- Use SOMENTE os nomes da lista acima (cópia exata, sem alterar nada)
- Para "tipo" use "receita" ou "despesa" conforme o lançamento
- Para "grupo" use o grupo DRE adequado (ex: "Despesas Administrativas", "Despesas com Pessoal", "Receitas Operacionais", etc.)
- Se não souber, escolha o mais parecido da lista

RETORNE APENAS array JSON com ${lancamentos.length} objetos na mesma ordem:
[{"tipo":"despesa","classificacao_nome":"Nome exato da lista","grupo":"Grupo DRE"}, ...]`

  let res = await callOpenAI(openaiApiKey, modelo, prompt)

  if (!res.ok && modelo !== DEFAULT_MODEL) {
    const errText = await res.text()
    if (/model|not found|invalid/i.test(errText)) {
      res = await callOpenAI(openaiApiKey, DEFAULT_MODEL, prompt)
    }
  }

  if (!res.ok) {
    return lancamentos.map(l => pickFallback(l.descricao, l.tipo, classificacoesDisponiveis))
  }

  const openaiData = await res.json()
  const content: string = openaiData?.choices?.[0]?.message?.content ?? ''
  const parsed = parseBatchResponse(content)

  if (!parsed || parsed.length !== lancamentos.length) {
    // Fallback para todos se o parse falhar
    return lancamentos.map(l => pickFallback(l.descricao, l.tipo, classificacoesDisponiveis))
  }

  return parsed.map((p, i) => {
    try {
      return toFinalResult(p, classificacoesDisponiveis, lancamentos[i].descricao)
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
  openaiApiKey: string | undefined,
): Promise<AiResult> {
  const fallback = pickFallback(descricao, tipoEntrada, classificacoesDisponiveis)
  if (!openaiApiKey) return { ...fallback, aviso: 'OPENAI_API_KEY não configurada; usado fallback local.' } as AiResult & { aviso: string }

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
    let openaiRes = await callOpenAI(openaiApiKey, modelo, prompt)
    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      const shouldRetry = modelo !== DEFAULT_MODEL && /model|not found|invalid/i.test(errText)
      if (shouldRetry) openaiRes = await callOpenAI(openaiApiKey, DEFAULT_MODEL, prompt)
      else return { ...fallback, aviso: 'OpenAI indisponível; usado fallback.' } as AiResult & { aviso: string }
    }
    if (!openaiRes.ok) return { ...fallback, aviso: 'OpenAI indisponível; usado fallback.' } as AiResult & { aviso: string }

    const openaiData = await openaiRes.json()
    const content: string = openaiData?.choices?.[0]?.message?.content ?? ''
    const parsed = parseAiResponse(content)
    if (!parsed) return { ...fallback, aviso: 'Resposta fora do formato esperado; usado fallback.' } as AiResult & { aviso: string }
    return toFinalResult(parsed, classificacoesDisponiveis, descricao)
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
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

  // ── Parse mode: extrai lançamentos de linhas brutas de extrato bancário ──────
  if (body.mode === 'parse' && Array.isArray(body.linhas)) {
    type LancamentoParsed = { data: string; descricao: string; valor: number; tipo: 'receita' | 'despesa' }

    const parseLancamentos = (content: string): LancamentoParsed[] => {
      try {
        const match = content.match(/\[[\s\S]*\]/)
        if (!match) return []
        const arr = JSON.parse(match[0])
        if (!Array.isArray(arr)) return []
        return arr.filter((item: unknown) => {
          if (!item || typeof item !== 'object') return false
          const o = item as Record<string, unknown>
          return o.data && o.descricao && typeof o.valor === 'number' &&
            (o.tipo === 'receita' || o.tipo === 'despesa')
        }) as LancamentoParsed[]
      } catch { return [] }
    }

    const linhasJson = JSON.stringify(body.linhas)

    const prompt = `Você é um extrator de lançamentos financeiros de extratos bancários brasileiros.

Recebeu linhas de um extrato já convertidas para JSON.
- Se for XLSX/CSV: cada elemento é um array de células de uma linha da planilha.
- Se for PDF: cada elemento é uma string com o texto de uma linha.

Extraia APENAS os lançamentos reais (movimentações que entraram ou saíram da conta corrente).

IGNORE completamente:
- Linhas de cabeçalho: "Data", "Histórico", "Lançamento", "Valor", "Crédito", "Débito", "Saldo"
- Linhas de saldo/totalizador: "SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL DIA", "SALDO DO DIA", "SALDO FINAL", "SALDO PERÍODO"
- Títulos de seções: "Lançamentos", "Período", "Extrato", "Resumo", "Saldos Invest Fácil"
- Linhas de metadados: "Atualização", "Nome", "Agência", "Conta", "CPF", "CNPJ"
- Linhas sem data válida ou sem valor monetário real
- Saldos de aplicações, rendimentos automáticos sem movimentação

Regra crítica para XLSX: a coluna de VALOR DA TRANSAÇÃO é diferente da coluna SALDO.
O saldo acumulado muda em toda linha; o valor da transação fica vazio em linhas de saldo.
Use o valor da TRANSAÇÃO (não o saldo) para o campo "valor".

Para cada lançamento REAL, retorne:
- data: exatamente no formato "DD/MM/AAAA" (ex: "02/01/2026")
- descricao: texto da transação sem data e sem valor
- valor: número POSITIVO (mesmo que seja débito)
- tipo: "receita" se crédito/entrada; "despesa" se débito/saída

RETORNE SOMENTE um array JSON válido, sem texto adicional, sem markdown.
Exemplo: [{"data":"02/01/2026","descricao":"PIX RECEBIDO ODONTO","valor":3175.00,"tipo":"receita"}]

DADOS (JSON):
${linhasJson}`

    if (!openaiApiKey) {
      return new Response(JSON.stringify({ lancamentos: [] }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    let res = await callOpenAI(openaiApiKey, modelo, prompt)
    if (!res.ok && modelo !== DEFAULT_MODEL) {
      const errText = await res.text()
      if (/model|not found|invalid/i.test(errText)) {
        res = await callOpenAI(openaiApiKey, DEFAULT_MODEL, prompt)
      }
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ lancamentos: [] }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const openaiData = await res.json()
    const content: string = openaiData?.choices?.[0]?.message?.content ?? ''
    const lancamentos = parseLancamentos(content)

    return new Response(JSON.stringify({ lancamentos }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // ── Mapear categorias mode ─────────────────────────────────────────────────
  // Recebe uma lista de categorias únicas do arquivo (ex: Conta Azul "Categoria 1")
  // e retorna um mapeamento { categoria → classificação DRE } em UMA única chamada.
  if (body.mode === 'mapear_categorias' && Array.isArray(body.categorias)) {
    const categorias = (body.categorias as string[]).filter(Boolean)

    type MapeamentoItem = { classificacao_nome: string; grupo: string; tipo: 'receita' | 'despesa' }
    type Mapeamento = Record<string, MapeamentoItem | null>

    if (categorias.length === 0) {
      return new Response(JSON.stringify({ mapeamento: {} }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Sem API key: tenta match local por normalize
    if (!openaiApiKey) {
      const mapeamento: Mapeamento = {}
      for (const cat of categorias) {
        const matched = classificacoesDisponiveis.find(c => normalize(c.nome) === normalize(cat))
        mapeamento[cat] = matched
          ? { classificacao_nome: matched.nome, grupo: '', tipo: matched.tipo }
          : null
      }
      return new Response(JSON.stringify({ mapeamento }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const listaClassificacoes = classificacoesDisponiveis
      .map((c, i) => `${i + 1}. "${c.nome}" (${c.tipo})`)
      .join('\n')

    const listaCategorias = categorias
      .map((c, i) => `${i + 1}. "${c}"`)
      .join('\n')

    const prompt = `Você é um assistente contábil especializado em DRE para clínicas de saúde brasileiras.

Sua tarefa: mapear categorias de um software de gestão financeira (ex: Conta Azul) para as classificações DRE exatas do sistema.

CLASSIFICAÇÕES DRE DISPONÍVEIS (use o nome EXATO, incluindo acentos e capitalização):
${listaClassificacoes}

CATEGORIAS DO ARQUIVO A MAPEAR:
${listaCategorias}

INSTRUÇÕES:
1. Para cada categoria, entenda o seu significado financeiro real e escolha a classificação DRE mais específica e adequada da lista acima.
2. Use SOMENTE nomes copiados exatamente da lista — sem variações, abreviações ou traduções.
3. Prefira sempre a classificação mais específica. Classificações genéricas como "Outras Despesas" ou "Outras Receitas" só devem ser usadas quando absolutamente nenhuma outra da lista se aplicar.
4. Retorne null apenas quando a categoria não tiver correspondência possível com nenhum item da lista.
5. Retorne SOMENTE um objeto JSON, sem texto adicional.

FORMATO: {"categoria original": {"classificacao_nome":"nome exato da lista","grupo":"grupo exato","tipo":"receita ou despesa"}, "outra sem match": null}`

    let res = await callOpenAI(openaiApiKey, modelo, prompt)

    if (!res.ok && modelo !== DEFAULT_MODEL) {
      const errText = await res.text()
      if (/model|not found|invalid/i.test(errText)) {
        res = await callOpenAI(openaiApiKey, DEFAULT_MODEL, prompt)
      }
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ mapeamento: {} }), {
        status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const aiData = await res.json()
    const content: string = aiData?.choices?.[0]?.message?.content ?? ''

    let raw: Record<string, unknown> = {}
    try {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) raw = JSON.parse(match[0]) as Record<string, unknown>
    } catch { /* mantém raw vazio */ }

    // Valida cada resultado contra a lista de classificações cadastradas
    const mapeamento: Mapeamento = {}
    for (const cat of categorias) {
      const val = raw[cat]
      if (!val || typeof val !== 'object') { mapeamento[cat] = null; continue }
      const v = val as { classificacao_nome?: string; grupo?: string; tipo?: string }
      const nomeAi = String(v.classificacao_nome ?? '').trim()
      const matched = classificacoesDisponiveis.find(c => normalize(c.nome) === normalize(nomeAi))
      mapeamento[cat] = matched
        ? { classificacao_nome: matched.nome, grupo: String(v.grupo ?? '').trim(), tipo: matched.tipo }
        : null
    }

    return new Response(JSON.stringify({ mapeamento }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

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

    const resultados = await handleBatch(lancamentos, classificacoesDisponiveis, modelo, openaiApiKey)
    return new Response(JSON.stringify({ resultados }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // ── Single mode (backwards compat) ──
  const descricao = String(body.descricao ?? '')
  const valor = Number(body.valor ?? 0)
  const tipoEntrada: 'receita' | 'despesa' = body.tipo === 'receita' ? 'receita' : 'despesa'

  const result = await handleSingle(descricao, valor, tipoEntrada, classificacoesDisponiveis, modelo, openaiApiKey)
  return new Response(JSON.stringify(result), {
    status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
