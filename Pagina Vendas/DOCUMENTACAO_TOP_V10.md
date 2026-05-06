# TOP V8

## O que é

A `TOP V8` é a evolução da TOP V7, focada em reescrever **apenas o Mundo do Dono** com uma experiência radicalmente mais simples para donos de clínica leigos em gestão e precificação.

Ela nasce como cópia isolada da `TOP V7`, preservando a V7 intacta. O **motor de cálculo** e todo o **Mundo do Vendedor** são mantidos literais da V7; só a UI do dono é refeita.

## Objetivo da V8

> "À prova de idiota e preguiçoso." Estalo de dedos → sistema pronto.

- Dono responde 7 perguntas, cada uma em uma seção própria, navegáveis horizontalmente.
- O preço mínimo (à vista) vem de **outro sistema** via contrato localStorage.
- O dono define o valor de tabela (gordura) por **sugestão automática**, **% global**, **% por procedimento** ou **valor absoluto**.
- Tudo o mais usa defaults herdados da V7 (taxa maquininha, risco, boleto, descontos máximos) — o dono leigo nunca precisa vê-los.

## Princípio central

> O Mundo do Dono da V8 tem um assunto por tela. Defaults sensatos preenchem tudo que não exige decisão do dono.

## O que herda da V7

- Motor de cálculo (`annualizedNarrativeValue`, `boletoTotalWithInterest`, `syncOwnerSettingsToPlans`, etc.).
- Toda a UI/script do Mundo do Vendedor.
- `FLAT_CATALOG` de procedimentos.
- `createDefaultOwnerSettings` + `hydrateOwnerSettings` como geradores de defaults.

## O que muda da V7

- Wizard de 6 passos + Painel de 3 tabs → **7 seções horizontais** com scroll-snap.
- Integração com sistema externo de preço à vista (`minimo-demo.html` como stub).
- Lógica de gordura nova: sugerida pela fórmula `minPrice × (1 + juros)^parcelas`, com override manual (% ou R$).
- O dono não configura mais taxa maquininha, risco, descontos máximos, boleto detalhado — usam defaults V7.

## Arquivos principais

- `top_v8.html` — aplicação principal
- `minimo-demo.html` — stub do sistema externo de preço à vista
- `DIRETRIZES_PRODUTO_TOP_V8.md` — decisões de produto
- `CONTRATO_INTEGRACAO_V8.md` — especificação do contrato localStorage externo
- `MIGRACAO_V7_PARA_V8.md` — mapa campo-a-campo V8 → V7

## Isolamento

- localStorage próprio (`top-v8-*`) para model, zoom e tema.
- Mantém `top-v7-owner-settings` como chave consumida pelo motor (evita diff interno).
- Não interfere com V7 ou anteriores.
