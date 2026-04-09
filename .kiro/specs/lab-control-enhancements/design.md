# Design Document — Lab Control Enhancements

## Overview

Este documento descreve o design técnico para as cinco melhorias no módulo `LabControlPage.tsx`. Todas as mudanças são incrementais e não quebram o comportamento existente. O stack é React + TypeScript + Supabase, com CSS Modules para estilização.

As cinco áreas de melhoria são:

1. **Req 1** — Remover o campo "Prazo médio (dias)" do formulário de *criação* de laboratório (mantendo-o na edição).
2. **Req 2** — Adicionar campo "Prazo de produção (dias úteis)" e máscara monetária `R$` no cadastro de serviço (`PrecosModal`).
3. **Req 3** — Cálculo automático do prazo de entrega prometido no modal de novo envio, com alerta quando ultrapassa a data da consulta, e `data_envio` pré-preenchida com a data atual.
4. **Req 4** — Campo "Previsto" somente leitura (calculado) + "Concluído" editável lado a lado por etapa no `EnvioResumoModal`.
5. **Req 5** — Botão "Modo Calendário" na tela principal mostrando datas previstas dos serviços do mês atual com navegação mensal.

---

## Architecture

O módulo é um único arquivo `src/pages/LabControlPage.tsx` com ~2 800 linhas, organizado em componentes funcionais React. Não há estado global — cada componente gerencia seu próprio estado local com `useState`/`useEffect`. A persistência é feita diretamente via `supabase-js`.

```
LabControlPage (root)
├── LabModal              — criar/editar laboratório
├── PrecosModal           — lista de preços do lab
├── EnvioSteps            — wizard de 4 passos para novo/editar envio
├── EnvioResumoModal      — resumo de um envio com etapas
├── KanbanBoard / KanbanCard
├── LabDetailView         — visão de um lab específico
├── LabsAggregateDetailView — visão de todos os labs
└── CalendarView (NOVO)   — modo calendário mensal
```

As mudanças de banco de dados necessárias são mínimas e aditivas:

- `lab_precos`: adicionar coluna `prazo_producao_dias integer null`
- Nenhuma outra alteração de schema é necessária — `data_envio` já existe em `lab_envios`, e as datas previstas são calculadas em memória.

---

## Components and Interfaces

### 1. `LabModal` — remoção condicional do campo prazo médio

O componente já recebe `lab: Lab | null`. A lógica de renderização condicional é simples:

```tsx
// Renderiza o campo "Prazo médio" SOMENTE quando editando (lab !== null)
{lab !== null && (
  <div className={styles.formField}>
    <label className={styles.label}>Prazo médio (dias)</label>
    <input className={styles.input} type="number" min="1"
      value={form.prazo_medio_dias} onChange={set('prazo_medio_dias')} />
  </div>
)}
```

No `handleSubmit`, o payload para criação usa `prazo_medio_dias: 0` como padrão fixo (sem depender do campo do formulário).

### 2. `PrecosModal` — campo prazo de produção + máscara monetária

**Novos campos de estado:**
```tsx
const [novoPrazo, setNovoPrazo] = useState('')   // para adição
const [editPrazo, setEditPrazo] = useState('')   // para edição inline
```

**Máscara monetária** — nova função pura `formatCurrencyMask(digits: string): string`:
```
entrada: "12399"  →  saída: "R$ 123,99"
entrada: "1000"   →  saída: "R$ 10,00"
```
A função trata a entrada como centavos: remove não-dígitos, interpreta os últimos 2 dígitos como centavos.

**`parseMaskedCurrency(masked: string): number`** — inverso da máscara, retorna o valor decimal para persistência.

**Interface `LabPreco` estendida** (apenas no frontend, até o tipo ser regenerado):
```ts
// Adicionado ao tipo LabPreco em types.ts
prazo_producao_dias?: number | null
```

**Layout do `precosAddRow`** — o campo de prazo é inserido entre nome e valor:
```
[Nome do serviço] [Prazo (dias)] [Valor R$] [Adicionar]
```

### 3. `EnvioSteps` — cálculo automático de prazo

**Nova função pura `calcularPrazoEntrega`:**
```ts
function calcularPrazoEntrega(
  dataEnvio: string,
  servicos: ServicoSelecionado[],
  feriados: string[],
  prazoMedioDias: number,
): string
```

Lógica:
1. Filtra serviços com `prazo_producao_dias != null`
2. Se houver ao menos um, usa `Math.max(...prazos)` como dias úteis
3. Caso contrário, usa `prazoMedioDias` do laboratório (fallback existente)
4. Chama `addBusinessDays(dataEnvio, dias, feriados)`

**Alerta de conflito com consulta:**
```tsx
const prazoUltrapassaConsulta =
  form.data_entrega_prometida &&
  form.data_consulta &&
  form.data_entrega_prometida > form.data_consulta

{prazoUltrapassaConsulta && (
  <div className={styles.summaryAlert}>
    <IconAlert /> O prazo de entrega prometido ultrapassa a data da consulta.
  </div>
)}
```

**`data_envio` pré-preenchida:** o estado inicial já usa `today()` para `data_envio` quando `envio === null`. Nenhuma mudança necessária aqui — o requisito 3.6 já está implementado.

**`ServicoSelecionado`** — adicionar campo `prazo_producao_dias`:
```ts
interface ServicoSelecionado {
  // ... campos existentes ...
  prazo_producao_dias: number | null  // NOVO
}
```

O `useEffect` que recalcula `data_entrega_prometida` passa a usar `calcularPrazoEntrega` em vez de `addBusinessDays(form.data_envio, currentLab?.prazo_medio_dias ?? 0, ...)`.

### 4. `EnvioResumoModal` — campo "Previsto" somente leitura

**Nova função pura `calcularDataPrevista`:**
```ts
function calcularDataPrevista(
  dataEnvio: string,
  prazoProducaoDias: number | null,
  feriados: string[],
): string | null
```

Retorna `null` quando `prazoProducaoDias` é nulo.

**`LabEtapa`** — adicionar campo `prazo_producao_dias`:
```ts
type LabEtapa = {
  // ... campos existentes ...
  prazo_producao_dias: number | null  // NOVO — lido de lab_precos via etapa
}
```

**Layout por etapa no `summaryStepCard`** — substituir o grid 2 colunas atual por 3 colunas:

| Previsto (readonly) | Concluído em (editável) |
|---|---|

```tsx
<div className={styles.kanbanCardEtapaGrid}>
  <label className={styles.kanbanCardField}>
    <span>Previsto</span>
    <input
      className={styles.input}
      type="text"
      value={dataPrevista ? formatDate(dataPrevista) : '—'}
      readOnly
      disabled
    />
  </label>
  <label className={styles.kanbanCardField}>
    <span>Concluído em</span>
    <input
      className={styles.input}
      type="date"
      value={etapa.data_conclusao ?? ''}
      disabled={savingEtapa}
      onChange={e => void handleEtapaUpdate(etapa.id, { data_conclusao: e.target.value || null })}
    />
  </label>
</div>
```

### 5. `CalendarView` — novo componente

**Interface:**
```tsx
interface CalendarViewProps {
  envios: LabEnvio[]
  precosByLab: Record<string, LabPreco[]>
  labs: Lab[]
  onClose: () => void
}
```

**Estado interno:**
```tsx
const [currentMonth, setCurrentMonth] = useState(() => {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
})
```

**Estrutura de dados para renderização:**
```ts
type CalendarEvent = {
  envioId: string
  pacienteNome: string
  servicoNome: string
  labNome: string
  date: string  // ISO YYYY-MM-DD
}
```

**Função `buildCalendarEvents`:**
```ts
function buildCalendarEvents(
  envios: LabEnvio[],
  precosByLab: Record<string, LabPreco[]>,
  labsById: Record<string, Lab>,
): CalendarEvent[]
```

Para cada envio em andamento (não em status final), para cada etapa, calcula `calcularDataPrevista(envio.data_envio, etapa.prazo_producao_dias, feriados)` e cria um `CalendarEvent`.

**Integração na tela principal (`LabControlPage`):**

Novo estado: `const [calendarMode, setCalendarMode] = useState(false)`

Botão no header:
```tsx
<button
  type="button"
  className={`${styles.btnSecondary} ${calendarMode ? styles.btnSecondaryActive : ''}`}
  onClick={() => setCalendarMode(v => !v)}
>
  <IconCalendar /> {calendarMode ? 'Fechar Calendário' : 'Modo Calendário'}
</button>
```

Quando `calendarMode === true`, renderiza `<CalendarView>` no lugar do grid de labs.

---

## Data Models

### Alteração de schema — `lab_precos`

```sql
-- Migration: adicionar prazo_producao_dias
alter table public.lab_precos
  add column if not exists prazo_producao_dias integer null;

comment on column public.lab_precos.prazo_producao_dias is
  'Prazo de produção em dias úteis para este serviço. Null = sem prazo definido.';
```

### Tipo TypeScript atualizado — `LabPreco`

```ts
// Em src/lib/types.ts — tabela lab_precos
lab_precos: {
  Row: {
    // ... campos existentes ...
    prazo_producao_dias: number | null  // NOVO
  }
  Insert: {
    // ... campos existentes ...
    prazo_producao_dias?: number | null
  }
  Update: {
    // ... campos existentes ...
    prazo_producao_dias?: number | null
  }
}
```

### Tipo `LabEtapa` (local, não persistido diretamente)

```ts
type LabEtapa = {
  id: string
  nome: string
  preco: number | null
  origem: 'catalogo' | 'manual'
  prazo_entrega: string | null       // data ISO calculada ou manual
  prazo_producao_dias: number | null // NOVO — dias úteis do serviço
  concluido: boolean
  data_conclusao: string | null
}
```

### Tipo `ServicoSelecionado` (local, wizard de envio)

```ts
interface ServicoSelecionado {
  key: string
  nome: string
  preco: number | null
  origem: 'catalogo' | 'manual'
  prazo_entrega: string
  prazo_producao_dias: number | null  // NOVO
  concluido: boolean
  data_conclusao: string
}
```

### Dados calculados (sem persistência adicional)

As datas previstas são calculadas em memória a partir de:
- `envio.data_envio` (data de criação do envio)
- `etapa.prazo_producao_dias` (do serviço correspondente em `lab_precos`)
- `lab.feriados` (feriados do laboratório)

Não há necessidade de persistir `data_prevista` — ela é sempre derivada.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Máscara monetária é consistente com o valor armazenado

*Para qualquer* sequência de dígitos digitada no campo de valor de um serviço, aplicar a máscara monetária e depois fazer o parse do valor mascarado deve produzir o mesmo número decimal que `digits / 100`.

**Validates: Requirements 2.4, 2.5**

### Property 2: Prazo de entrega é o máximo dos prazos de produção

*Para qualquer* conjunto de serviços selecionados com `prazo_producao_dias` definidos e qualquer data de envio, o prazo de entrega prometido calculado deve ser igual a `addBusinessDays(dataEnvio, max(prazo_producao_dias), feriados)`.

**Validates: Requirements 3.1, 3.3**

### Property 3: Dias úteis nunca caem em fim de semana ou feriado

*Para qualquer* data de início, número de dias úteis e conjunto de feriados, a data resultante de `addBusinessDays` nunca deve ser sábado, domingo ou um feriado do conjunto fornecido.

**Validates: Requirements 3.2**

### Property 4: Alerta de conflito com consulta é exibido corretamente

*Para qualquer* par (prazo de entrega prometido, data da consulta), o alerta de conflito deve ser exibido se e somente se o prazo de entrega for posterior à data da consulta.

**Validates: Requirements 3.4**

### Property 5: Data prevista de etapa é calculada corretamente

*Para qualquer* envio com data de envio `D` e qualquer etapa com `prazo_producao_dias = N` (não nulo), o campo "Previsto" exibido deve ser igual a `addBusinessDays(D, N, feriados_do_lab)`.

**Validates: Requirements 4.1**

### Property 6: Campo "Previsto" é sempre somente leitura

*Para qualquer* envio com qualquer conjunto de etapas, ao renderizar o `EnvioResumoModal`, todos os campos "Previsto" devem ter o atributo `readOnly` ou `disabled`, e nenhum campo "Concluído em" deve ter esses atributos.

**Validates: Requirements 4.3, 4.4, 4.5**

### Property 7: Serviços aparecem na célula correta do calendário

*Para qualquer* conjunto de envios em andamento com datas previstas calculadas, ao renderizar o `CalendarView` no mês correspondente, cada serviço deve aparecer exatamente na célula do dia que corresponde à sua data prevista.

**Validates: Requirements 5.4, 5.6**

### Property 8: Navegação mensal é reversível

*Para qualquer* mês inicial exibido no calendário, clicar em "próximo mês" e depois em "mês anterior" deve retornar ao mês inicial.

**Validates: Requirements 5.5**

### Property 9: Alternância do modo calendário restaura a visão original

*Para qualquer* estado inicial da tela principal (lista de labs ou kanban), ativar o modo calendário e depois desativá-lo deve restaurar a visão original.

**Validates: Requirements 5.8**

---

## Error Handling

### Validação de entrada

| Campo | Regra | Comportamento |
|---|---|---|
| `prazo_producao_dias` | Inteiro positivo ou vazio | Se vazio → persiste `null`; se negativo → ignora ou normaliza para `null` |
| Valor do serviço (máscara) | Apenas dígitos | Caracteres não-numéricos são ignorados pela máscara |
| `data_envio` | Data válida | Já validado pelo `<input type="date">` do browser |

### Fallback de prazo

Quando todos os serviços selecionados têm `prazo_producao_dias = null`, o sistema usa `lab.prazo_medio_dias` como fallback. Se este também for 0, o campo `data_entrega_prometida` fica vazio (comportamento atual preservado).

### Etapas sem prazo de produção

No `EnvioResumoModal`, etapas sem `prazo_producao_dias` exibem `—` no campo "Previsto". Nenhum erro é lançado.

### Calendário sem envios

Se não houver envios em andamento no mês exibido, o calendário renderiza normalmente com todas as células vazias. Nenhuma mensagem de erro é necessária.

### Erros de banco de dados

O padrão existente de captura de erros (`if (err) { setError(err.message); ... }`) é mantido em todos os handlers de persistência.

---

## Testing Strategy

### Abordagem dual

- **Testes unitários (exemplo-based):** verificam comportamentos específicos, casos de borda e interações de UI.
- **Testes de propriedade (property-based):** verificam invariantes universais sobre funções puras.

### Funções puras — candidatas a testes de propriedade

As seguintes funções são puras e têm espaço de entrada amplo, tornando-as ideais para PBT:

| Função | Propriedade testada |
|---|---|
| `formatCurrencyMask` + `parseMaskedCurrency` | Round-trip: `parse(mask(digits)) === digits / 100` |
| `calcularPrazoEntrega` | Resultado = `addBusinessDays(start, max(prazos))` |
| `addBusinessDays` | Resultado nunca cai em fim de semana ou feriado |
| Lógica de alerta de consulta | Alerta ↔ `prazo > consulta` |
| `calcularDataPrevista` | Resultado = `addBusinessDays(dataEnvio, N)` |
| Lógica de posicionamento no calendário | Serviço aparece no dia correto |

### Biblioteca de PBT recomendada

**[fast-check](https://github.com/dubzzz/fast-check)** — compatível com Vitest/Jest, suporte nativo a TypeScript, geradores para strings, números, datas e arrays.

```bash
npm install --save-dev fast-check
```

Configuração mínima por teste de propriedade: **100 iterações** (padrão do fast-check).

### Tag de rastreabilidade

Cada teste de propriedade deve incluir um comentário de rastreabilidade:

```ts
// Feature: lab-control-enhancements, Property 1: Máscara monetária é consistente com o valor armazenado
fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 10, unit: 'digit' }), digits => {
  const masked = formatCurrencyMask(digits)
  const parsed = parseMaskedCurrency(masked)
  return Math.abs(parsed - Number(digits) / 100) < 0.001
}))
```

### Testes unitários (exemplo-based)

- `LabModal` com `lab=null` não renderiza o campo "Prazo médio"
- `LabModal` com `lab` existente renderiza o campo "Prazo médio"
- `PrecosModal` renderiza o campo "Prazo de produção" na linha de adição
- Payload de criação de laboratório inclui `prazo_medio_dias: 0`
- Payload de criação de serviço com prazo vazio inclui `prazo_producao_dias: null`
- `EnvioSteps` com `envio=null` pré-preenche `data_envio` com `today()`
- Serviços com todos `prazo_producao_dias=null` usam `prazo_medio_dias` do lab
- `EnvioResumoModal` exibe `—` para etapas sem `prazo_producao_dias`
- `EnvioResumoModal` exibe o campo "Concluído em" como editável
- Tela principal exibe o botão "Modo Calendário"
- Clicar em "Modo Calendário" renderiza o `CalendarView`
- `CalendarView` exibe o mês atual por padrão
- Dias sem serviços exibem células vazias

### Testes de integração

- Salvar um serviço com `prazo_producao_dias=5` persiste o valor correto no Supabase
- Salvar um laboratório novo não persiste `prazo_medio_dias` diferente de 0
- Carregar um envio existente exibe as datas previstas corretas no `EnvioResumoModal`
