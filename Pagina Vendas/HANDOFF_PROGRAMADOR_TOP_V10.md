# Handoff Tecnico - TOP V10

## Objetivo desta entrega

Esta entrega iniciou a migracao da TOP V10 para uma arquitetura modular em React, sem quebrar o legado. A decisao foi criar uma base paralela para reduzir risco de regressao nas regras comerciais que ja funcionam na versao atual.

## Resultado entregue

1. Legado preservado:
- `top_v10.html` mantido.
- Snapshot separado em `legacy/top_v10_legacy.html`.

2. Base React criada em paralelo:
- Pasta `app/` com Vite + React.
- Estrutura modular inicial (`data`, `domain`, `hooks`, `components`, `screens`, `storage`, `styles`).

3. Primeira fatia funcional migrada:
- Mundo do vendedor inicial em React.
- Cadastro de ate 3 planos.
- Busca e adicao de procedimentos.
- Quantidade por item.
- Desconto de campanha por item com limite no minimo.
- Botao "Max" para levar direto ao limite possivel.
- Edicao manual de valor unitario com clamp no minimo.
- Total original x total efetivo por plano.
- Persistencia local da sessao React.

## Arquivos principais da nova base

- Entrada/app shell:
  - `app/index.html`
  - `app/src/main.jsx`
  - `app/src/App.jsx`

- Dados:
  - `app/src/data/catalog.js`

- Dominio (regras):
  - `app/src/domain/money.js`
  - `app/src/domain/pricing.js`
  - `app/src/domain/planFactory.js`

- Estado:
  - `app/src/hooks/usePlans.js`

- UI:
  - `app/src/components/PlanBoard.jsx`
  - `app/src/components/PlanCard.jsx`
  - `app/src/components/TreatmentPicker.jsx`
  - `app/src/screens/SellerScreen.jsx`

- Persistencia:
  - `app/src/storage/keys.js`
  - `app/src/storage/localStorage.js`

- Estilo:
  - `app/src/styles/tokens.css`
  - `app/src/styles/app.css`

## Decisoes tecnicas e por que foram tomadas

1. Migracao paralela ao legado:
- Evita reescrever tudo de uma vez.
- Permite comparar comportamento entre legado e React por fases.
- Reduz risco de quebrar regras de negocio criticas (minimo/campanha/pagamento).

2. Extracao primeiro de regras, depois de telas:
- Regras de precificacao sao o coracao do produto.
- Mantendo regras em modulos de dominio, fica mais facil testar e evoluir.
- A interface passa a ser consumidora dessas regras, em vez de misturar tudo no mesmo arquivo.

3. Persistencia isolada da base React:
- Chave atual da sessao React: `top-v10-react-session`.
- Nao sobrescreve o estado de sessao do fluxo legado.

4. Escopo controlado:
- Todas as mudancas foram feitas somente em `Top V10`.
- Nada foi alterado em outras versoes.

## Limites desta fase (intencional)

Ainda nao foi migrado para React:

1. Mundo do Dono completo (wizard + politicas).
2. Regras completas de pagamento e semaforo/indicadores.
3. Equalizacao de planos, zoom, drag e responsividade avancada da V10 legado.
4. Fluxos de import/export externos do dono.
5. Paridade total de UX com o HTML legado.

## Como rodar a base React

Dentro de `Top V10/app`:

```bash
npm install
npm run dev
```

## Continuidade recomendada (ordem sugerida)

1. Migrar `owner settings` para modulos de dominio:
- Portar hidratacao/sanitizacao e contrato interno.
- Definir estado do dono em hook dedicado (`useOwnerSettings`).

2. Migrar pagamentos para dominio:
- Juros, limite de desconto a vista, sinal, parcelado, boleto, debito.
- Separar calculo puro de qualquer detalhe de UI.

3. Introduzir teste de paridade por cenarios:
- Minimo por procedimento.
- Campanha por item.
- Edicao manual de valor.
- Campanha total (quando migrada).
- Casos limite em mobile/tablet.

4. Migrar tela do dono por secoes:
- Primeiro dados e validacoes.
- Depois layout e fluxo visual.

5. Migrar equalizacao e comportamento responsivo:
- Somente depois de paridade das regras.

## Checklist de validacao para aceite de cada fase

1. Nenhum procedimento pode cair abaixo do minimo.
2. Ao pedir desconto acima do permitido, deve travar no maximo e refletir valor minimo.
3. Edicao manual deve clamar no minimo automaticamente.
4. Sessao React deve persistir e reabrir corretamente.
5. Legado deve continuar funcionando sem dependencia da nova base.

## Riscos tecnicos conhecidos

1. Divergencia de nomenclatura entre dados do legado e React (acentos e variacoes de nome).
2. Regras de pagamento ainda fora da base React.
3. UX do legado e React ainda nao equivalentes.

## Mitigacao recomendada

1. Criar mapeamento canonico de nomes de procedimento antes de migrar owner/payment completos.
2. Portar testes de regra primeiro, UI depois.
3. Trabalhar em fatias pequenas com comparacao lado a lado (React vs legado).

## Contexto para quem assumir

Pense na V10 React como "estrada paralela". Ela ainda nao substitui o legado, mas ja criou a fundacao correta para deixar de depender de um arquivo unico gigante. A prioridade da continuidade e manter fidelidade de regra de negocio durante a modularizacao.
