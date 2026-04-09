# Implementation Plan: Lab Control Enhancements

## Overview

Implementação incremental das cinco melhorias no módulo `LabControlPage.tsx`, seguindo a stack React + TypeScript + Supabase + CSS Modules. Cada tarefa constrói sobre a anterior, terminando com a integração completa.

## Tasks

- [x] 1. Migration SQL e atualização de tipos TypeScript
  - [x] 1.1 Criar migration SQL adicionando coluna `prazo_producao_dias` em `lab_precos`
    - Criar arquivo `supabase/migrations/<timestamp>_lab_precos_prazo_producao.sql`
    - Adicionar `alter table public.lab_precos add column if not exists prazo_producao_dias integer null;`
    - Adicionar `comment on column` conforme design
    - _Requirements: 2.2, 2.3_
  - [x] 1.2 Atualizar tipo `LabPreco` em `src/lib/types.ts`
    - Adicionar `prazo_producao_dias: number | null` nas interfaces `Row`, `Insert` e `Update` de `lab_precos`
    - _Requirements: 2.2_

- [x] 2. Req 1 — Remover campo "Prazo médio (dias)" do formulário de criação
  - [x] 2.1 Tornar o campo "Prazo médio (dias)" condicional em `LabModal`
    - Envolver o `<div className={styles.formField}>` do campo `prazo_medio_dias` com `{lab !== null && (...)}`
    - No `handleSubmit`, garantir que o payload de criação use `prazo_medio_dias: 0` fixo (sem ler do form)
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]* 2.2 Escrever testes unitários para `LabModal`
    - Testar que `lab=null` não renderiza o campo "Prazo médio (dias)"
    - Testar que `lab` existente renderiza o campo "Prazo médio (dias)"
    - Testar que o payload de criação inclui `prazo_medio_dias: 0`
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Req 2 — Campo "Prazo de produção" + máscara monetária em `PrecosModal`
  - [x] 3.1 Implementar funções puras `formatCurrencyMask` e `parseMaskedCurrency` em `LabControlPage.tsx`
    - `formatCurrencyMask(digits: string): string` — trata entrada como centavos, retorna `R$ X.XXX,XX`
    - `parseMaskedCurrency(masked: string): number` — inverso, retorna valor decimal
    - _Requirements: 2.4, 2.5_
  - [ ]* 3.2 Escrever property test para máscara monetária (Property 1)
    - **Property 1: Máscara monetária é consistente com o valor armazenado**
    - **Validates: Requirements 2.4, 2.5**
    - Usar `fast-check`: para qualquer sequência de dígitos, `parseMaskedCurrency(formatCurrencyMask(digits)) === Number(digits) / 100`
    - _Requirements: 2.4, 2.5_
  - [x] 3.3 Adicionar estado e campos de prazo de produção em `PrecosModal`
    - Adicionar `novoPrazo` / `editPrazo` ao estado local
    - Inserir campo numérico "Prazo (dias)" entre nome e valor no `precosAddRow` e na linha de edição inline
    - Incluir `prazo_producao_dias` no payload de `addPreco` e `saveEditPreco`
    - Substituir o campo de valor por `formatCurrencyMask` / `parseMaskedCurrency`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [ ]* 3.4 Escrever testes unitários para `PrecosModal`
    - Testar que o campo "Prazo de produção" é renderizado na linha de adição
    - Testar que payload com prazo vazio inclui `prazo_producao_dias: null`
    - Testar que a máscara monetária é aplicada ao campo de valor
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 4. Checkpoint — Garantir que todos os testes passam até aqui
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Req 3 — Cálculo automático de prazo de entrega em `EnvioSteps`
  - [x] 5.1 Implementar função pura `calcularPrazoEntrega` em `LabControlPage.tsx`
    - Assinatura: `calcularPrazoEntrega(dataEnvio: string, servicos: ServicoSelecionado[], feriados: string[], prazoMedioDias: number): string`
    - Lógica: filtra serviços com `prazo_producao_dias != null`, usa `Math.max` dos prazos; fallback para `prazoMedioDias`; chama `addBusinessDays`
    - _Requirements: 3.1, 3.2, 3.5_
  - [ ]* 5.2 Escrever property test para `calcularPrazoEntrega` (Property 2)
    - **Property 2: Prazo de entrega é o máximo dos prazos de produção**
    - **Validates: Requirements 3.1, 3.3**
    - Para qualquer conjunto de serviços com prazos definidos, resultado = `addBusinessDays(dataEnvio, max(prazos), feriados)`
    - _Requirements: 3.1, 3.3_
  - [ ]* 5.3 Escrever property test para `addBusinessDays` (Property 3)
    - **Property 3: Dias úteis nunca caem em fim de semana ou feriado**
    - **Validates: Requirements 3.2**
    - Para qualquer data de início, N dias úteis e conjunto de feriados, resultado não é sábado/domingo/feriado
    - _Requirements: 3.2_
  - [x] 5.4 Adicionar `prazo_producao_dias` ao tipo `ServicoSelecionado` e propagar no wizard
    - Adicionar campo `prazo_producao_dias: number | null` à interface `ServicoSelecionado`
    - Ao selecionar serviço do catálogo, ler `prazo_producao_dias` de `LabPreco`
    - _Requirements: 3.1_
  - [x] 5.5 Substituir cálculo de `data_entrega_prometida` no `useEffect` de `EnvioSteps`
    - Trocar chamada direta de `addBusinessDays` por `calcularPrazoEntrega`
    - Recalcular sempre que `servicosSelecionados` ou `form.data_envio` mudar
    - _Requirements: 3.1, 3.3_
  - [x] 5.6 Implementar alerta de conflito com data da consulta
    - Calcular `prazoUltrapassaConsulta = form.data_entrega_prometida > form.data_consulta` (quando ambos preenchidos)
    - Renderizar `<div className={styles.summaryAlert}>` com `<IconAlert />` quando verdadeiro
    - _Requirements: 3.4_
  - [ ]* 5.7 Escrever property test para alerta de conflito (Property 4)
    - **Property 4: Alerta de conflito com consulta é exibido corretamente**
    - **Validates: Requirements 3.4**
    - Para qualquer par (prazo, consulta), alerta exibido ↔ prazo > consulta
    - _Requirements: 3.4_
  - [ ]* 5.8 Escrever testes unitários para `EnvioSteps`
    - Testar que `envio=null` pré-preenche `data_envio` com `today()`
    - Testar que serviços com todos `prazo_producao_dias=null` usam `prazo_medio_dias` do lab
    - _Requirements: 3.5, 3.6_

- [x] 6. Req 4 — Campo "Previsto" somente leitura em `EnvioResumoModal`
  - [x] 6.1 Implementar função pura `calcularDataPrevista` em `LabControlPage.tsx`
    - Assinatura: `calcularDataPrevista(dataEnvio: string, prazoProducaoDias: number | null, feriados: string[]): string | null`
    - Retorna `null` quando `prazoProducaoDias` é nulo
    - _Requirements: 4.1, 4.2_
  - [ ]* 6.2 Escrever property test para `calcularDataPrevista` (Property 5)
    - **Property 5: Data prevista de etapa é calculada corretamente**
    - **Validates: Requirements 4.1**
    - Para qualquer `dataEnvio` e `prazoProducaoDias = N` não nulo, resultado = `addBusinessDays(dataEnvio, N, feriados)`
    - _Requirements: 4.1_
  - [x] 6.3 Adicionar `prazo_producao_dias` ao tipo `LabEtapa` e popular em `getEnvioEtapas`
    - Adicionar campo `prazo_producao_dias: number | null` ao tipo `LabEtapa`
    - Em `getEnvioEtapas`, ler `prazo_producao_dias` do objeto raw da etapa
    - _Requirements: 4.1_
  - [x] 6.4 Atualizar layout de etapas no `EnvioResumoModal` para exibir "Previsto" + "Concluído" lado a lado
    - Para cada etapa, calcular `dataPrevista = calcularDataPrevista(envio.data_envio, etapa.prazo_producao_dias, feriados)`
    - Renderizar campo "Previsto" como `<input readOnly disabled value={dataPrevista ? formatDate(dataPrevista) : '—'} />`
    - Manter campo "Concluído em" como `<input type="date">` editável
    - Usar grid 2 colunas (`kanbanCardEtapaGrid`) para exibir lado a lado
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 6.5 Escrever property test para campo "Previsto" somente leitura (Property 6)
    - **Property 6: Campo "Previsto" é sempre somente leitura**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - Para qualquer envio com qualquer conjunto de etapas, todos os campos "Previsto" têm `readOnly`/`disabled`; nenhum campo "Concluído em" tem esses atributos
    - _Requirements: 4.3, 4.4, 4.5_
  - [ ]* 6.6 Escrever testes unitários para `EnvioResumoModal`
    - Testar que etapas sem `prazo_producao_dias` exibem `—` no campo "Previsto"
    - Testar que o campo "Concluído em" é editável
    - _Requirements: 4.2, 4.4_

- [ ] 7. Checkpoint — Garantir que todos os testes passam até aqui
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Req 5 — Modo Calendário na tela principal
  - [x] 8.1 Implementar função pura `buildCalendarEvents` em `LabControlPage.tsx`
    - Assinatura: `buildCalendarEvents(envios: LabEnvio[], precosByLab: Record<string, LabPreco[]>, labsById: Record<string, Lab>): CalendarEvent[]`
    - Para cada envio em andamento, para cada etapa, calcular `calcularDataPrevista` e criar um `CalendarEvent`
    - Definir tipo `CalendarEvent = { envioId, pacienteNome, servicoNome, labNome, date }`
    - _Requirements: 5.4, 5.6_
  - [ ]* 8.2 Escrever property test para posicionamento no calendário (Property 7)
    - **Property 7: Serviços aparecem na célula correta do calendário**
    - **Validates: Requirements 5.4, 5.6**
    - Para qualquer conjunto de envios, cada evento em `buildCalendarEvents` aparece na célula do dia correspondente à sua `date`
    - _Requirements: 5.4, 5.6_
  - [x] 8.3 Implementar componente `CalendarView`
    - Props: `{ envios, precosByLab, labs, onClose }`
    - Estado: `currentMonth = { year, month }` inicializado com mês atual
    - Renderizar grid 7 colunas (Dom–Sáb) com células para cada dia do mês
    - Em cada célula, listar os `CalendarEvent` do dia (nome do paciente + nome do serviço)
    - Botões "‹" e "›" para navegar entre meses
    - Células sem eventos ficam vazias
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ]* 8.4 Escrever property test para navegação mensal (Property 8)
    - **Property 8: Navegação mensal é reversível**
    - **Validates: Requirements 5.5**
    - Para qualquer mês inicial, clicar em "próximo" e depois "anterior" retorna ao mês inicial
    - _Requirements: 5.5_
  - [x] 8.5 Adicionar ícone `IconCalendar` e estado `calendarMode` em `LabControlPage`
    - Implementar SVG `IconCalendar` inline
    - Adicionar `const [calendarMode, setCalendarMode] = useState(false)`
    - _Requirements: 5.1_
  - [x] 8.6 Integrar botão "Modo Calendário" no header e renderização condicional de `CalendarView`
    - Adicionar botão no `headerActions` que alterna `calendarMode`
    - Quando `calendarMode === true`, renderizar `<CalendarView>` no lugar do grid/kanban
    - Passar `envios`, `precosByLab` e `labs` como props
    - _Requirements: 5.1, 5.2, 5.8_
  - [ ]* 8.7 Escrever property test para alternância do modo calendário (Property 9)
    - **Property 9: Alternância do modo calendário restaura a visão original**
    - **Validates: Requirements 5.8**
    - Ativar e desativar o modo calendário restaura o estado de visão anterior
    - _Requirements: 5.8_
  - [ ]* 8.8 Escrever testes unitários para `CalendarView` e integração
    - Testar que o botão "Modo Calendário" é exibido na tela principal
    - Testar que clicar no botão renderiza `CalendarView`
    - Testar que `CalendarView` exibe o mês atual por padrão
    - Testar que dias sem serviços exibem células vazias
    - _Requirements: 5.1, 5.2, 5.3, 5.7_

- [x] 9. Adicionar estilos CSS Modules para novos elementos
  - Adicionar classes em `LabControlPage.module.css` para:
    - `.calendarGrid` — grid 7 colunas para o calendário
    - `.calendarCell` — célula de dia
    - `.calendarEvent` — chip de evento dentro da célula
    - `.calendarHeader` — cabeçalho com navegação mensal
    - `.inputReadonly` — estilo visual para campos somente leitura (Previsto)
  - _Requirements: 4.5, 5.2, 5.6_

- [ ] 10. Checkpoint final — Garantir que todos os testes passam
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tarefas marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- A migration SQL (tarefa 1.1) deve ser aplicada no Supabase antes de testar as tarefas 3 e 5
- Instalar `fast-check` antes de escrever os property tests: `npm install --save-dev fast-check`
- Cada property test deve incluir comentário de rastreabilidade: `// Feature: lab-control-enhancements, Property N: ...`
- O campo `data_envio` já é pré-preenchido com `today()` no estado inicial — nenhuma mudança necessária para o requisito 3.6
- Todas as funções puras (`formatCurrencyMask`, `calcularPrazoEntrega`, `calcularDataPrevista`, `buildCalendarEvents`) devem ser definidas fora dos componentes para facilitar os testes
