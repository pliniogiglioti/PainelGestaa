# Migração V7 → V8 — Mapa de Dados

## Objetivo

Documentar como o `ownerV8Model` (novo, simples, editado pelo dono V8) é traduzido pelo **adaptador V8→V7** para um `ownerSettings` compatível com o motor V7 (consumido pelo Mundo do Vendedor).

**Invariante**: após `ownerV8Apply()`, o objeto `ownerSettings` em memória e em `localStorage['top-v7-owner-settings']` tem a mesma forma que teria na V7.

## Modelo V8 (origem)

```js
ownerV8Model = {
  version: 1,
  completed: boolean,
  identity: { scopeType, scopeName },
  lastChanceCondition: { monthlyInterestPct, maxInstallments },
  tableStrategy: {
    mode: 'suggested' | 'globalPct' | 'perProcedure',
    globalGorduraPct: number | null,
    perProcedure: {
      [procName]: {
        inputMode: 'auto' | 'pct' | 'absolute',
        gorduraPct: number | null,
        tableAbsolute: number | null
      }
    }
  },
  payments: { avista, entrada, parcelado, debito, boleto },
  externalMinimumSnapshot: {
    importedAt, source,
    items: [{ name, category, minPrice, updatedAt, code? }]
  }
}
```

Persistido em `localStorage['top-v8-owner-model']`.

## `ownerSettings` V7 (destino, consumido pelo motor + vendedor)

Forma completa mantida via `hydrateOwnerSettings()` (função da V7 preservada).

## Mapa campo-a-campo

### Copy direto

| V7 | ← | V8 |
|---|---|---|
| `wizardCompleted` | ← | `completed` |
| `scopeType` | ← | `identity.scopeType` |
| `scopeName` | ← | `identity.scopeName` |
| `paymentAvailability.avista` | ← | `payments.avista` |
| `paymentAvailability.entrada` | ← | `payments.entrada` |
| `paymentAvailability.parcelado` | ← | `payments.parcelado` |
| `paymentAvailability.debito` | ← | `payments.debito` |
| `paymentAvailability.boleto` | ← | `payments.boleto` |
| `pricingPolicy.worstCaseInstallments` | ← | `lastChanceCondition.maxInstallments` |
| `pricingPolicy.monthlyInterestPct` | ← | `lastChanceCondition.monthlyInterestPct` |
| `paymentPolicy.boletoMonthlyInterestPct` | ← | `lastChanceCondition.monthlyInterestPct` (unificado) |
| `paymentPolicy.maxBoletoInstallments` | ← | `lastChanceCondition.maxInstallments` |
| `paymentPolicy.boletoEnabled` | ← | `payments.boleto` |

### Derivados

| V7 | = | Fórmula |
|---|---|---|
| `paymentPolicy.maxCardInstallments` | = | `min(24, lastChanceCondition.maxInstallments)` |
| `paymentPolicy.cardIdealInstallments` | = | `min(12, maxCardInstallments)` |
| `paymentPolicy.boletoIdealInstallments` | = | `min(12, maxBoletoInstallments)` |

### Por procedimento

Para cada `procName` em `FLAT_CATALOG`, `procurePolicies[procName]`:

| V7 | ← | V8 |
|---|---|---|
| `tablePrice` | ← | `FLAT_CATALOG[procName].tablePrice` (herança direta) |
| `minPrice` | ← | `externalMinimumSnapshot.items[procName].minPrice` |
| `idealCashPrice` | ← | mesmo que `minPrice` (V8 unifica os dois conceitos) |
| `narrativePriceOverride` | ← | regra especial (ver abaixo) |

**Fallback quando o snapshot não tem o procedimento**: `minPrice = tablePrice × 0.9` (90%).

### Regra do `narrativePriceOverride`

Depende de `tableStrategy.mode` e de `perProcedure[procName].inputMode`:

```
effectiveInputMode =
  tableStrategy.mode === 'suggested'   → 'auto'
  tableStrategy.mode === 'globalPct'   → 'pct' (usando globalGorduraPct)
  tableStrategy.mode === 'perProcedure'→ perProcedure[procName].inputMode

if effectiveInputMode === 'auto':
  narrativePriceOverride = null
  (motor V7 calcula via annualizedNarrativeValue)

if effectiveInputMode === 'pct':
  gordura = tableStrategy.mode === 'globalPct'
    ? globalGorduraPct
    : perProcedure[procName].gorduraPct
  narrativePriceOverride = minPrice × (1 + gordura/100)

if effectiveInputMode === 'absolute':
  narrativePriceOverride = perProcedure[procName].tableAbsolute
```

**Validação**: se `narrativePriceOverride < minPrice`, recusar a edição na UI com aviso ("Esse valor ficou abaixo do seu mínimo — vai cair no prejuízo."). Nunca gravar override abaixo do mínimo.

### Defaults fixos (V8 não expõe, usa `createDefaultOwnerSettings()`)

| Campo V7 | Valor fixo |
|---|---|
| `pricingPolicy.priceSource` | `'v7_minprice'` |
| `pricingPolicy.narrativeEnabled` | `true` |
| `pricingPolicy.interestMode` | `'embutido'` |
| `pricingPolicy.negotiationBufferSource` | `'none'` |
| `pricingPolicy.manualBufferPct` | `0` |
| `pricingPolicy.roundingMode` | `'whole'` |
| `pricingPolicy.installmentReference` | `'manual'` |
| `discountPolicy.maxItemDiscountPct` | `10` |
| `discountPolicy.maxPlanDiscountPct` | `8` |
| `discountPolicy.maxTotalDiscountPct` | `12` |
| `discountPolicy.maxAVistaDiscountPct` | `5` |
| `paymentPolicy.minEntradaPct` | `20` |
| `paymentPolicy.acquirerFeePct` | `3.5` |
| `paymentPolicy.defaultRiskPct` | `3.0` |
| `paymentPolicy.debitFeePct` | `1.3` |
| `paymentPolicy.anticipationEnabled` | `false` |
| `paymentPolicy.anticipationPct` | `0.6` |
| `paymentPolicy.boletoInterestMode` | `'compound_monthly'` |
| `paymentPolicy.boletoTotalMarkupPct` | `18` |
| `paymentPolicy.cardRates` | tabela default via `createDefaultCardRates()` |
| `procurePolicies[*].maxDiscountPct` | `10` |
| `procurePolicies[*].campaignEnabled` | `true` |
| `procurePolicies[*].maxCampaignPct` | `10` |
| `procurePolicies[*].programmedEnabled` | `false` |
| `procurePolicies[*].programmedStartPct` | `30` |
| `procurePolicies[*].programmedFinishPct` | `80` |
| `procurePolicies[*].programmedStartMonth` | `1` |

## Fluxo de aplicação (`ownerV8Apply()`)

```
1. v7Raw = ownerV8ToV7Settings(model)
   // aplica mapeamento acima sobre createDefaultOwnerSettings()
2. this.ownerSettings = hydrateOwnerSettings(v7Raw)
   // garante shape completo e defaults finais
3. this.syncOwnerSettingsToPlans()
   // propaga para planos abertos no vendedor
4. localStorage.setItem('top-v8-owner-model', JSON.stringify(model))
5. localStorage.setItem('top-v7-owner-settings', JSON.stringify(this.ownerSettings))
```

## Fluxo de inicialização

```
1. Se existir 'top-v8-owner-model':
     ownerV8Model = hidrata
     v7Raw = ownerV8ToV7Settings(model)
     this.ownerSettings = hydrateOwnerSettings(v7Raw)
     Se completed: render §6 com badge "já configurado"
     Senão: render §currentSection preservada
2. Senão se existir 'top-v7-owner-settings' (legado):
     carrega direto, deixa o dono editar na UI V8 (sincroniza model a partir dele se possível)
3. Senão:
     defaults V8 + §0
```

## Regras de compatibilidade

- Qualquer campo que o vendedor V7 consome **precisa** estar presente e válido após o adapter.
- `hydrateOwnerSettings()` é o guardião: se o adapter esquecer algum campo, ele preenche o default.
- Testes manuais de paridade (ver `DOCUMENTACAO_TOP_V8.md` e plano) confirmam a invariante.
