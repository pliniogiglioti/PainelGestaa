# Plano de Reestruturacao - TOP V10

## Objetivo

Transformar a TOP de um arquivo unico grande em uma aplicacao organizada por partes menores, com componentes e responsabilidades claras, sem perder as regras comerciais ja validadas na V9.

## Principio central

A V10 deve nascer como uma copia segura da V9 e virar a versao de transicao. A regra e preservar comportamento primeiro, organizar depois, e so entao melhorar interface e escala.

## Fase 1 - Congelar a versao atual

- Manter `top_v10.html` como snapshot funcional da V9.
- Validar que a V10 abre, salva configuracoes separadas da V9 e mantem as regras de preco minimo, campanha, edicao de valor, tablet e mobile.
- Criar uma lista de fluxos obrigatorios para teste: Mundo do Dono, Mundo do Vendedor, adicionar tratamento, campanha por item, campanha total, editar valor, equalizar planos, pagamentos, mobile e tablet.

## Fase 2 - Mapear responsabilidades

Separar mentalmente a ferramenta em blocos:

- Dados: catalogo de procedimentos, precos, minimos e configuracoes.
- Regras: calculo de preco, campanha, travas, pagamento, indicadores e semaforo.
- Estado: paciente, planos, tratamentos selecionados, vendedor, dono e tela atual.
- Interface: cards, busca, sidebar, modais, toast, botoes e tabelas.
- Persistencia: localStorage, importacao, exportacao e configuracao salva.

## Fase 3 - Criar base React

Criar uma estrutura React com Vite dentro da V10, mantendo o HTML antigo como referencia ate a nova versao ficar equivalente.

Estrutura sugerida:

```txt
Top V10/
  legacy/
    top_v10_legacy.html
  app/
    index.html
    package.json
    src/
      main.jsx
      App.jsx
      data/
      domain/
      hooks/
      components/
      screens/
      styles/
```

## Fase 4 - Extrair primeiro o que nao aparece na tela

Comecar pelas partes menos arriscadas:

- `data/catalog.js`: catalogo de procedimentos.
- `domain/pricing.js`: minimos, campanha e edicao de valor.
- `domain/payments.js`: cartao, boleto, entrada, debito e a vista.
- `domain/ownerSettings.js`: configuracoes do Mundo do Dono.
- `storage/localStorage.js`: chaves e leitura/escrita.

Essa fase reduz risco porque a tela continua a mesma ideia, mas as regras ficam testaveis.

## Fase 5 - Componentizar a interface

Ordem sugerida:

- `AppShell`: estrutura geral da ferramenta.
- `Launchpad`: escolha Mundo do Dono ou Mundo do Vendedor.
- `OwnerWorld`: configuracao da clinica.
- `SellerWorld`: ambiente de venda.
- `PlanBoard`: area com os planos.
- `PlanCard`: card individual do plano.
- `TreatmentSearch`: busca e adicao de tratamentos.
- `TreatmentRow`: linha de tratamento.
- `CampaignEditor`: desconto por tratamento.
- `PaymentSection`: condicoes de pagamento.
- `Sidebar`: menu de acoes.
- `Modal`, `Toast`, `Button`, `Input`: componentes reutilizaveis.

## Fase 6 - Criar hooks de comportamento

Separar a inteligencia em hooks:

- `usePlans`: criar, remover, equalizar e escolher planos.
- `usePricing`: preco efetivo, minimo, desconto maximo e travas.
- `usePayments`: formas de pagamento e indicadores.
- `useOwnerSettings`: Mundo do Dono e politicas.
- `useResponsiveLayout`: mobile, tablet, sidebar inferior e equalizacao.

## Fase 7 - Testar paridade com a V9

A nova versao so deve substituir a antiga quando passar nos mesmos cenarios:

- Todos os procedimentos respeitam minimo.
- Campanha por item aplica o maximo possivel sem quebrar minimo.
- Campanha total distribui desconto sem passar do minimo individual.
- Edicao manual de valor tambem respeita minimo.
- Equalizar funciona com 2 e 3 planos no desktop, tablet e mobile.
- Mundo do Dono salva e o vendedor usa as regras corretas.

## Fase 8 - Melhorar sem baguncar

So depois da paridade:

- Refinar visual.
- Melhorar performance.
- Adicionar testes automatizados.
- Preparar build final.
- Remover o legado quando a nova versao estiver confiavel.

## Recomendada

Nao migrar tudo de uma vez. A melhor rota e:

1. Congelar V10 como copia segura.
2. Criar React em paralelo dentro da V10.
3. Extrair regras comerciais primeiro.
4. Recriar telas por blocos.
5. Comparar comportamento antigo e novo antes de substituir.

