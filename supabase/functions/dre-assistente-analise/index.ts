// Supabase Edge Function: dre-assistente-analise
// Analyzes all user lancamentos using Groq AI and returns a markdown DRE report.
// Context: plano de contas + course links embedded directly (edge functions
// cannot access the filesystem, so the content from public/ia/ is inlined here).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTO DA IA — conteúdo de public/ia/plano_de_contas_dre.md
// ─────────────────────────────────────────────────────────────────────────────
const PLANO_DE_CONTAS = `
# Plano de Contas — DRE (Grupos e Classificações)

## Regras rápidas de classificação
- Receitas: entradas de vendas/serviços/produtos.
- Deduções de receita: estornos, cancelamentos e taxas de cartão/antecipação/POS.
- Impostos sobre faturamento: Simples/Presumido (sobre receita).
- Despesas operacionais: gastos diretamente ligados à entrega (laboratório, materiais, terceiros).
- Despesas com pessoal: salários, encargos, benefícios, pró-labore.
- Despesas administrativas/gerais: aluguel, energia, internet, contabilidade, etc.

## 1. RECEITAS OPERACIONAIS
1.1 — Receita Dinheiro | 1.2 — Receita Cartão | 1.3 — Receita Financeiras
1.4 — Receita PIX / Transferências | 1.5 — Receita Subadquirência (BT)

## 2. DEDUÇÕES DE RECEITA
2.1 — Vendas Canceladas / Devoluções | 2.2 — Tarifa de Cartão / Aluguel de POS
2.3 — Tarifa de Cartão / Antecipação | 2.4 — Tarifa de Cartão / Padrão

## 3. IMPOSTOS SOBRE O FATURAMENTO
3.1 — Impostos sobre Receitas - Presumido e Simples Nacional

## 4. DESPESAS OPERACIONAIS
4.1 — OP Gratificações | 4.2 — Custo de Materiais e Insumos
4.3 — Serviços Terceiros PF (dentistas) | 4.4 — Serviços técnicos para Laboratórios
4.5 — Royalties e Assistência Técnica | 4.6 — Fundo Nacional de Marketing

## 5. MARGEM DE CONTRIBUIÇÃO (Receita − Despesas Variáveis)

## 6. DESPESAS COM PESSOAL
6.1 — Pró-labore | 6.2 — Salários e Ordenados | 6.3 — 13° Salário
6.4 — Rescisões | 6.5 — INSS | 6.6 — FGTS
6.7 — Outras Despesas Com Funcionários | 6.8 — Vale Transporte
6.9 — Vale Refeição | 6.10 — Combustível

## 7. DESPESAS ADMINISTRATIVAS
7.1 — Adiantamento a Fornecedor | 7.2 — Energia Elétrica | 7.3 — Água e Esgoto
7.4 — Aluguel | 7.5 — Manutenção Predial | 7.6 — Telefonia | 7.7 — Uniformes
7.8 — Manutenção e Reparos | 7.9 — Seguros | 7.10 — Uber e Táxi
7.11 — Copa e Cozinha | 7.12 — Cartórios | 7.13 — Viagens e Estadias
7.14 — Material de Escritório | 7.15 — Estacionamento | 7.16 — Material de Limpeza
7.17 — Bens de Pequeno Valor | 7.18 — Custas Processuais | 7.19 — Outras Despesas
7.20 — Consultoria | 7.21 — Contabilidade | 7.22 — Jurídico | 7.23 — Limpeza
7.24 — Segurança e Vigilância | 7.25 — Serviço de Motoboy | 7.26 — IOF
7.27 — Taxas e Emolumentos | 7.28 — Multa e Juros s/ Contas Pagas em Atraso
7.29 — Exames Ocupacionais

## 8. DESPESAS COMERCIAIS E MARKETING
8.1 — Refeições e Lanches | 8.2 — Outras Despesas com Vendas
8.3 — Agência e Assessoria | 8.4 — Produção de Material
8.5 — Marketing Digital | 8.6 — Feiras e Eventos

## 9. DESPESAS COM TI
9.1 — Internet | 9.2 — Informática e Software
9.3 — Hospedagem de Dados | 9.4 — Sistema de Gestão

## 10. EBITDA (Resultado Operacional antes de depreciação)

## 11. RECEITAS FINANCEIRAS
11.1 — Rendimento de Aplicação Financeira | 11.2 — Descontos Obtidos

## 12. DESPESAS FINANCEIRAS
12.1 — Despesas Bancárias | 12.2 — Depreciação e Amortização
12.3 — Juros Passivos | 12.4 — Financiamentos / Empréstimos

## 13. EBIT (Lucro Operacional Real)

## 14. INVESTIMENTOS
14.1 — Investimento - Máquinas e Equipamentos
14.2 — Investimento - Computadores e Periféricos
14.3 — Investimento - Móveis e Utensílios
14.4 — Investimento - Instalações de Terceiros
14.4 — Dividendos e Despesas dos Sócios

## 15. NOPAT (RESULTADO OPERACIONAL)
`

// ─────────────────────────────────────────────────────────────────────────────
// LINKS DAS AULAS — conteúdo de public/ia/aulas_gestao_financeira.md
// Use APENAS estas URLs ao recomendar aulas. Não invente links.
// ─────────────────────────────────────────────────────────────────────────────
const AULAS_LINKS = `
## Aulas disponíveis na plataforma (cite APENAS estas URLs e os minutos indicados)

- **M6_A2_Gestão Financeira** — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f8f102f08eade02c8e7f7a6e00379a21ddf9166f6b87f35ce034c3eb45cdc3775ea16e334ccb3053e
  Momentos-chave:
  • (00:26) "Caixa é rei, gestão é rainha" — diferença entre faturamento e lucro real
  • (01:41) O que é gasto, custo, despesa e investimento — 4 conceitos fundamentais
  • (02:54) Custo variável: o que muda com o volume de vendas da clínica
  • (03:42) Custo fixo: aluguel, salário — não variam com as vendas
  • (05:23) Exercício prático: classificando os custos da clínica

- **M6_A3_Fundamentos Financeiros** — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5fe3b0c3137a472dca022c568c3ad69ea61ebb5dfc1b81550cd3b6966629255b28210a0dc615155d7f
  Momentos-chave:
  • (00:26) Fluxo de caixa como pulso da clínica — acompanhar entradas e saídas diariamente
  • (03:28) Contas a pagar e a receber — como prever o caixa futuro
  • (05:00) D+0, D+30, D+60 — datas de pagamento afetam o caixa
  • (06:27) Não antecipe vendas no cartão sem necessidade — os juros corroem o lucro
  • (07:40) Estoque é dinheiro parado — equilibrar falta com excesso
  • (10:04) Inventário mensal obrigatório para evitar desperdício e roubo

- **M6_A4_DRE** — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5fb334e1273ae0f6b915375684fe428ed57efb99688046f0a323e66fa6aa2b12f38837e03360a61de5
  Momentos-chave:
  • (01:33) DRE como termômetro do negócio — ilumina o caminho, mas quem age é o gestor
  • (03:00) Estrutura do DRE: receita → custos variáveis → margem de contribuição
  • (04:07) EBITDA: primeiro indicador de lucro operacional
  • (05:02) EBIT e valuation — valor da empresa = múltiplo do EBIT anual
  • (13:03) Benchmarks por faturamento — compare sua clínica com o padrão de mercado

- **M6_A5_EBIT** — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5fe2e54ea87eaf1955bcb330114df5ede79d778a1fee96bb52bdfa65933febf4aed57f863d86a6a1a6
  Momentos-chave:
  • (01:22) Receita financeira — ganho de capital fora das vendas (juros de aplicação)
  • (02:19) Amortização — como tratar pagamentos de empréstimos no DRE
  • (04:11) Dever: amortizar dívidas é melhor que investir — retorno garantido
  • (05:27) Depreciação — perda de valor de ativos ao longo do tempo
  • (08:21) Reservar dinheiro para reposição futura de equipamentos

- **M6_A6_Balanço Patrimonial** — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f874e8a957bd891e8ca8bacf58ef5d3e41f47e3ab2995963f09e63bb503eb0240ae1a105003d658e8
  Momentos-chave:
  • (04:53) Ativo, passivo e patrimônio líquido — os 3 componentes do balanço
  • (05:59) Seu contador deve entregar o balanço mensalmente — exija isso
  • (06:36) Patrimônio líquido como fonte de recursos — alternativa a empréstimo
  • (07:49) Patrimônio líquido positivo é pré-requisito para retirar dividendos

- **M6_A7_Ponto de Equilíbrio e CG** — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f5e7fb6918e7c0e82e4aa9f037b3eeeafcecab5a136bcfc52ab479213b0786bca091d4f8bcb1cded2
  Momentos-chave:
  • (00:32) Ponto de equilíbrio — faturamento mínimo onde lucro = zero
  • (02:00) Cortar custos fixos é a alavanca mais eficiente para baixar o PE
  • (05:33) Fórmula: Custos Fixos ÷ (1 − % Margem de Contribuição) = Ponto de Equilíbrio
  • (07:00) Capital de giro = (Custos Variáveis + Fixos) ÷ 2 — guarde 15 dias de despesa

- **M6_A8_Regime Contábil** — https://plataforma.clinicscale.com.br/course/programa-de-aceleracao-clinic-scale/53616c7465645f5f8a227f1dac8f6f5ce0e911927ebd0681b22ae5f3221af01b29f2ababb2854459fea1d09f0d046bfb
  Momentos-chave:
  • (01:01) Regime caixa — lançar quando o dinheiro efetivamente entra/sai da conta
  • (01:56) Regime competência — lançar na data do evento gerador (não do pagamento)
  • (04:05) DRE usa competência; DFC usa caixa — formatos diferentes, mesma contabilidade
  • (06:42) Empresas morrem por falta de caixa, mesmo com DRE positivo — o DFC salva
  • (08:32) DRE positivo com DFC negativo é possível — entenda a diferença dos regimes
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

const buildPrompt = (lancamentos: Lancamento[], resumo: { receitas: number; despesas: number }) => {
  const resultado = resumo.receitas - resumo.despesas
  const margem    = resumo.receitas > 0 ? ((resultado / resumo.receitas) * 100).toFixed(1) : '0.0'

  const linhas = lancamentos
    .map(l => {
      const data  = l.data ? new Date(l.data).toLocaleDateString('pt-BR') : '—'
      const desc  = l.descricao || l.classificacao
      const sinal = l.tipo === 'receita' ? '✅' : '🔴'
      return `| ${data} | ${desc} | ${l.grupo} | ${l.classificacao} | ${sinal} | ${moeda(Number(l.valor))} |`
    })
    .join('\n')

  return `Você é um assistente financeiro especializado em DRE para clínicas e pequenas empresas brasileiras.
Você TEM ACESSO ao plano de contas completo e às aulas da plataforma listados no CONTEXTO abaixo.

═══════════════════════════ CONTEXTO ═══════════════════════════
${PLANO_DE_CONTAS}
${AULAS_LINKS}
════════════════════════════════════════════════════════════════

Analise os lançamentos financeiros abaixo e gere um relatório executivo em Markdown.

## Resumo financeiro
- Total de lançamentos: ${lancamentos.length}
- Receitas totais: ${moeda(resumo.receitas)}
- Despesas totais: ${moeda(resumo.despesas)}
- Resultado: ${moeda(resultado)} (${resultado >= 0 ? 'LUCRO' : 'PREJUÍZO'})
- Margem líquida: ${margem}%

## Lançamentos registrados
| Data | Descrição | Grupo | Classificação | Tipo | Valor |
|------|-----------|-------|---------------|------|-------|
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

  const groqApiKey = Deno.env.get('GROQ_API_KEY')
  if (!groqApiKey) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY não configurada no servidor Supabase.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }

  const prompt = buildPrompt(lancamentos, resumo)

  const callGroq = async (modelToUse: string): Promise<Response> => {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 30000)
    try {
      return await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
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
    let groqRes = await callGroq(modelo)

    // Fallback to default model if the configured one is unavailable
    if (!groqRes.ok) {
      const errText = await groqRes.text()
      if (modelo !== DEFAULT_MODEL && /model|decommissioned|not found|invalid/i.test(errText)) {
        groqRes = await callGroq(DEFAULT_MODEL)
      } else {
        return new Response(
          JSON.stringify({ error: `Groq indisponível: ${errText.slice(0, 200)}` }),
          { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      return new Response(
        JSON.stringify({ error: `Groq indisponível: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const groqData = await groqRes.json()
    const analysis = String(groqData?.choices?.[0]?.message?.content ?? '').trim()

    if (!analysis) {
      return new Response(
        JSON.stringify({ error: 'IA não retornou conteúdo.' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ analysis }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: `Erro ao chamar a IA: ${msg}` }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
