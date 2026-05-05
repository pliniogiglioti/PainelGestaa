import type { OwnerSettings, PlanItem, ProcedurePolicy, IndicatorTag, IndicatorRules, IndicatorRoleLabels, IndicatorTone, PaymentStatus } from './types';
import { FLAT_CATALOG } from './catalog';

// ---- Primitive helpers ----

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safeNumber(value: unknown, fallback = 0): number {
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundMoney(value: number): number {
  return Math.round(safeNumber(value, 0) * 100) / 100;
}

export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function fmt(v: number): string {
  return 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
}

// ---- Card rates ----

export function defaultCardRateForInstallments(installments: number): number {
  const n = Math.max(1, Math.round(safeNumber(installments, 1)));
  const table: Record<number, number> = {
    1: 1.9, 2: 2.6, 3: 3.2, 4: 3.9, 5: 4.6, 6: 5.4,
    7: 6.2, 8: 7.0, 9: 7.9, 10: 8.8, 11: 9.7, 12: 10.6,
  };
  if (table[n] != null) return table[n];
  const extra = Math.max(0, n - 12) * 0.9;
  return roundMoney(table[12] + extra);
}

export function createDefaultCardRates(limit = 24): Record<string, number> {
  return Array.from({ length: Math.max(1, limit) }, (_, index) => {
    const installment = index + 1;
    return [String(installment), defaultCardRateForInstallments(installment)] as [string, number];
  }).reduce<Record<string, number>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

// ---- Indicator defaults ----

export function defaultIndicatorTags(): IndicatorTag[] {
  return [
    { id: 'tag-premium', label: 'Condição muito confortável', color: '#59d7b5', mapsTo: 'premium' },
    { id: 'tag-good', label: 'Condição equilibrada', color: '#82a6ff', mapsTo: 'good' },
    { id: 'tag-warn', label: 'Condição mais flexível', color: '#f99f35', mapsTo: 'warn' },
    { id: 'tag-limit', label: 'Condição no limite aprovado', color: '#dc5e5e', mapsTo: 'limit' },
    { id: 'tag-neutral', label: 'Sem leitura ativa', color: '#5f5f5f', mapsTo: 'neutral' },
  ];
}

export function defaultIndicatorRoleLabels(): IndicatorRoleLabels {
  return {
    premium: 'Usa no premium',
    good: 'Usa no equilibrado',
    warn: 'Usa no flexível',
    limit: 'Usa no limite',
    neutral: 'Usa no neutro',
    legend: 'Só legenda',
  };
}

export function defaultIndicatorRules(): IndicatorRules {
  return {
    cash: { limitMaxPct: 8, warnMaxPct: 32, goodMaxPct: 68 },
    entry: { premiumAboveSuggestedPct: 15 },
    card: { premiumUpToIdealPct: 60, goodUpToIdealPct: 100 },
    boleto: { premiumUpToIdealPct: 0, goodUpToIdealPct: 100 },
  };
}

export function normalizeIndicatorColor(color: string, fallback = '#5f5f5f'): string {
  const value = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return '#' + value.slice(1).split('').map(ch => ch + ch).join('');
  }
  return fallback;
}

export function sanitizeIndicatorTags(raw: unknown): IndicatorTag[] {
  const defaults = defaultIndicatorTags();
  const fallbackByMap = Object.fromEntries(defaults.map(tag => [tag.mapsTo, tag]));
  const source = Array.isArray(raw) ? raw : defaults;
  const seen = new Set<string>();
  const valid = ['premium', 'good', 'warn', 'limit', 'neutral', 'legend'] as const;
  const tags = source.map((entry: any, index: number) => {
    const mapsTo = valid.includes(entry?.mapsTo) ? entry.mapsTo : 'legend';
    const fallback = fallbackByMap[mapsTo] || fallbackByMap.neutral;
    let id = String(entry?.id || `tag-${mapsTo}-${index}`).trim() || `tag-${mapsTo}-${index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    return {
      id,
      label: String(entry?.label || fallback.label || `Tag ${index + 1}`).trim() || `Tag ${index + 1}`,
      color: normalizeIndicatorColor(entry?.color, fallback.color || '#5f5f5f'),
      mapsTo,
    } as IndicatorTag;
  }).filter(tag => tag.label);
  return tags.length ? tags : defaults;
}

export function sanitizeIndicatorRoleLabels(raw: unknown): IndicatorRoleLabels {
  const defaults = defaultIndicatorRoleLabels();
  const source = raw && typeof raw === 'object' ? (raw as any) : {};
  return {
    premium: String(source.premium || defaults.premium).trim() || defaults.premium,
    good: String(source.good || defaults.good).trim() || defaults.good,
    warn: String(source.warn || defaults.warn).trim() || defaults.warn,
    limit: String(source.limit || defaults.limit).trim() || defaults.limit,
    neutral: String(source.neutral || defaults.neutral).trim() || defaults.neutral,
    legend: String(source.legend || defaults.legend).trim() || defaults.legend,
  };
}

export function sanitizeIndicatorRules(raw: unknown): IndicatorRules {
  const defaults = defaultIndicatorRules();
  const source = raw && typeof raw === 'object' ? (raw as any) : {};
  const cashLimit = clamp(safeNumber(source.cash?.limitMaxPct, defaults.cash.limitMaxPct), 0, 100);
  const cashWarn = clamp(safeNumber(source.cash?.warnMaxPct, defaults.cash.warnMaxPct), cashLimit, 100);
  const cashGood = clamp(safeNumber(source.cash?.goodMaxPct, defaults.cash.goodMaxPct), cashWarn, 100);
  const cardPremium = clamp(safeNumber(source.card?.premiumUpToIdealPct, defaults.card.premiumUpToIdealPct), 0, 300);
  const cardGood = clamp(safeNumber(source.card?.goodUpToIdealPct, defaults.card.goodUpToIdealPct), cardPremium, 300);
  const boletoPremium = clamp(safeNumber(source.boleto?.premiumUpToIdealPct, defaults.boleto.premiumUpToIdealPct), 0, 300);
  const boletoGood = clamp(safeNumber(source.boleto?.goodUpToIdealPct, defaults.boleto.goodUpToIdealPct), boletoPremium, 300);
  return {
    cash: { limitMaxPct: cashLimit, warnMaxPct: cashWarn, goodMaxPct: cashGood },
    entry: {
      premiumAboveSuggestedPct: clamp(safeNumber(source.entry?.premiumAboveSuggestedPct, defaults.entry.premiumAboveSuggestedPct), 0, 100),
    },
    card: { premiumUpToIdealPct: cardPremium, goodUpToIdealPct: cardGood },
    boleto: { premiumUpToIdealPct: boletoPremium, goodUpToIdealPct: boletoGood },
  };
}

// ---- Default procedure policies ----

export function defaultCatalogMinPrice(proc: { minPrice?: number; tablePrice?: number }): number {
  return roundMoney(safeNumber(proc?.minPrice, proc?.tablePrice || 0));
}

export function createDefaultProcedurePolicies(): Record<string, ProcedurePolicy> {
  return FLAT_CATALOG.reduce<Record<string, ProcedurePolicy>>((acc, proc) => {
    acc[proc.name] = {
      category: proc.category,
      tablePrice: proc.tablePrice,
      idealCashPrice: proc.tablePrice,
      minPrice: defaultCatalogMinPrice(proc),
      narrativePriceOverride: null,
      maxDiscountPct: 10,
      campaignEnabled: true,
      maxCampaignPct: 10,
      programmedEnabled: false,
      programmedStartPct: 30,
      programmedFinishPct: 80,
      programmedStartMonth: 1,
    };
    return acc;
  }, {});
}

// ---- Owner Settings ----

export function createDefaultOwnerSettings(): OwnerSettings {
  return {
    wizardCompleted: false,
    scopeType: 'unidade',
    scopeName: 'Minha Clínica',
    paymentAvailability: { avista: true, entrada: true, parcelado: true, debito: true, boleto: false },
    pricingPolicy: {
      priceSource: 'v7_minprice',
      narrativeEnabled: true,
      interestMode: 'embutido',
      worstCaseInstallments: 24,
      monthlyInterestPct: 1.5,
      roundingMode: 'whole',
      installmentReference: 'manual',
      negotiationBufferSource: 'none',
      manualBufferPct: 0,
      procedurePolicies: createDefaultProcedurePolicies(),
    },
    discountPolicy: {
      maxItemDiscountPct: 10,
      maxPlanDiscountPct: 8,
      maxTotalDiscountPct: 12,
      maxAVistaDiscountPct: 5,
    },
    paymentPolicy: {
      minEntradaPct: 20,
      cardIdealInstallments: 12,
      maxCardInstallments: 24,
      cardNoInterestEnabled: false,
      cardNoInterestInstallments: 0,
      cardChargeInterestFromInstallments: 1,
      cardUseDefaultRateTable: true,
      cardFlatRatePct: 3.9,
      boletoIdealInstallments: 12,
      maxBoletoInstallments: 24,
      boletoEnabled: false,
      boletoNoInterestEnabled: false,
      boletoNoInterestInstallments: 0,
      boletoChargeInterestFromInstallments: 1,
      boletoInterestMode: 'compound_monthly',
      boletoMonthlyInterestPct: 1.5,
      boletoTotalMarkupPct: 18,
      acquirerFeePct: 3.5,
      defaultRiskPct: 3.0,
      debitFeePct: 1.3,
      anticipationEnabled: false,
      anticipationPct: 0.6,
      anticipationMinInstallments: 2,
      cardRates: createDefaultCardRates(24),
    },
    ui: {
      indicatorTags: defaultIndicatorTags(),
      indicatorRoleLabels: defaultIndicatorRoleLabels(),
      indicatorRules: defaultIndicatorRules(),
    },
  };
}

export function hydrateOwnerSettings(raw: unknown): OwnerSettings {
  const defaults = createDefaultOwnerSettings();
  const source = (raw || {}) as any;
  const settings: OwnerSettings = {
    ...defaults,
    ...source,
    pricingPolicy: {
      ...defaults.pricingPolicy,
      ...(source.pricingPolicy || {}),
      procedurePolicies: createDefaultProcedurePolicies(),
    },
    discountPolicy: { ...defaults.discountPolicy, ...(source.discountPolicy || {}) },
    paymentPolicy: { ...defaults.paymentPolicy, ...(source.paymentPolicy || {}) },
    ui: { ...defaults.ui, ...(source.ui || {}) },
  };

  FLAT_CATALOG.forEach(proc => {
    const saved = source.pricingPolicy?.procedurePolicies?.[proc.name] || {};
    settings.pricingPolicy.procedurePolicies[proc.name] = {
      ...settings.pricingPolicy.procedurePolicies[proc.name],
      ...saved,
      category: proc.category,
      tablePrice: proc.tablePrice,
    };
    const policy = settings.pricingPolicy.procedurePolicies[proc.name];
    policy.minPrice = roundMoney(Math.max(0, safeNumber(policy.minPrice, defaultCatalogMinPrice(proc))));
    policy.idealCashPrice = roundMoney(Math.max(policy.minPrice, safeNumber(policy.idealCashPrice, proc.tablePrice)));
    policy.maxDiscountPct = clamp(safeNumber(policy.maxDiscountPct, defaults.discountPolicy.maxItemDiscountPct), 0, 80);
    policy.maxCampaignPct = clamp(safeNumber(policy.maxCampaignPct, policy.maxDiscountPct), 0, 80);
    policy.campaignEnabled = Boolean(policy.campaignEnabled);
    policy.programmedEnabled = Boolean(policy.programmedEnabled);
    policy.programmedStartPct = clamp(safeNumber(policy.programmedStartPct, 30), 0, 100);
    policy.programmedFinishPct = clamp(safeNumber(policy.programmedFinishPct, 80), policy.programmedStartPct, 100);
    policy.programmedStartMonth = clamp(Math.round(safeNumber(policy.programmedStartMonth, 1)), 1, 24);
    const override = parseFloat(source.pricingPolicy?.procedurePolicies?.[proc.name]?.narrativePriceOverride);
    policy.narrativePriceOverride = (!isNaN(override) && override > 0) ? override : null;
  });

  settings.discountPolicy.maxItemDiscountPct = clamp(safeNumber(settings.discountPolicy.maxItemDiscountPct, defaults.discountPolicy.maxItemDiscountPct), 0, 80);
  settings.discountPolicy.maxPlanDiscountPct = clamp(safeNumber(settings.discountPolicy.maxPlanDiscountPct, defaults.discountPolicy.maxPlanDiscountPct), 0, 80);
  settings.discountPolicy.maxTotalDiscountPct = clamp(safeNumber(settings.discountPolicy.maxTotalDiscountPct, defaults.discountPolicy.maxTotalDiscountPct), 0, 80);
  settings.discountPolicy.maxAVistaDiscountPct = clamp(safeNumber(settings.discountPolicy.maxAVistaDiscountPct, defaults.discountPolicy.maxAVistaDiscountPct), 0, 80);

  const pp = settings.paymentPolicy;
  const dpp = defaults.paymentPolicy;
  pp.minEntradaPct = clamp(safeNumber(pp.minEntradaPct, dpp.minEntradaPct), 0, 100);
  pp.cardIdealInstallments = clamp(Math.round(safeNumber(pp.cardIdealInstallments, dpp.cardIdealInstallments)), 1, 36);
  pp.maxCardInstallments = clamp(Math.round(safeNumber(pp.maxCardInstallments, dpp.maxCardInstallments)), pp.cardIdealInstallments, 36);
  pp.cardNoInterestEnabled = Boolean(pp.cardNoInterestEnabled);
  pp.cardNoInterestInstallments = clamp(Math.round(safeNumber(pp.cardNoInterestInstallments, dpp.cardNoInterestInstallments)), 0, pp.maxCardInstallments);
  pp.cardChargeInterestFromInstallments = clamp(
    Math.round(safeNumber(pp.cardChargeInterestFromInstallments, pp.cardNoInterestEnabled ? Math.max(1, pp.cardNoInterestInstallments + 1) : dpp.cardChargeInterestFromInstallments)),
    1, pp.maxCardInstallments
  );
  if (pp.cardNoInterestEnabled) {
    pp.cardChargeInterestFromInstallments = Math.max(pp.cardChargeInterestFromInstallments, pp.cardNoInterestInstallments + 1);
  }
  pp.cardUseDefaultRateTable = Boolean(pp.cardUseDefaultRateTable ?? dpp.cardUseDefaultRateTable);
  pp.cardFlatRatePct = clamp(safeNumber(pp.cardFlatRatePct, dpp.cardFlatRatePct), 0, 40);
  pp.boletoIdealInstallments = clamp(Math.round(safeNumber(pp.boletoIdealInstallments, dpp.boletoIdealInstallments)), 1, 60);
  pp.maxBoletoInstallments = clamp(Math.round(safeNumber(pp.maxBoletoInstallments, dpp.maxBoletoInstallments)), pp.boletoIdealInstallments, 60);
  pp.boletoEnabled = Boolean(pp.boletoEnabled);
  pp.boletoNoInterestEnabled = Boolean(pp.boletoNoInterestEnabled);
  pp.boletoNoInterestInstallments = clamp(Math.round(safeNumber(pp.boletoNoInterestInstallments, dpp.boletoNoInterestInstallments)), 0, pp.maxBoletoInstallments);
  pp.boletoChargeInterestFromInstallments = clamp(
    Math.round(safeNumber(pp.boletoChargeInterestFromInstallments, pp.boletoNoInterestEnabled ? Math.max(1, pp.boletoNoInterestInstallments + 1) : dpp.boletoChargeInterestFromInstallments)),
    1, pp.maxBoletoInstallments
  );
  if (pp.boletoNoInterestEnabled) {
    pp.boletoChargeInterestFromInstallments = Math.max(pp.boletoChargeInterestFromInstallments, pp.boletoNoInterestInstallments + 1);
  }
  const validBolModes = ['compound_monthly', 'simple_monthly', 'manual_total_markup', 'none'] as const;
  pp.boletoInterestMode = validBolModes.includes(pp.boletoInterestMode) ? pp.boletoInterestMode : dpp.boletoInterestMode;
  pp.boletoMonthlyInterestPct = clamp(safeNumber(pp.boletoMonthlyInterestPct, source.pricingPolicy?.monthlyInterestPct ?? dpp.boletoMonthlyInterestPct), 0, 10);
  pp.boletoTotalMarkupPct = clamp(safeNumber(pp.boletoTotalMarkupPct, dpp.boletoTotalMarkupPct), 0, 80);
  pp.debitFeePct = clamp(safeNumber(pp.debitFeePct, dpp.debitFeePct), 0, 15);
  pp.anticipationEnabled = Boolean(pp.anticipationEnabled);
  pp.anticipationPct = clamp(safeNumber(pp.anticipationPct, dpp.anticipationPct), 0, 10);
  pp.anticipationMinInstallments = clamp(Math.round(safeNumber(pp.anticipationMinInstallments, dpp.anticipationMinInstallments)), 1, pp.maxCardInstallments);
  pp.cardRates = { ...createDefaultCardRates(24), ...(source.paymentPolicy?.cardRates || {}) };
  Object.keys(pp.cardRates).forEach(key => {
    pp.cardRates[key] = clamp(safeNumber(pp.cardRates[key], defaultCardRateForInstallments(Number(key))), 0, 40);
  });
  pp.cardRates = Object.fromEntries(Object.entries(pp.cardRates).filter(([key]) => Number(key) <= pp.maxCardInstallments));
  pp.acquirerFeePct = clamp(safeNumber(pp.acquirerFeePct, dpp.acquirerFeePct), 0, 20);
  pp.defaultRiskPct = clamp(safeNumber(pp.defaultRiskPct, dpp.defaultRiskPct), 0, 30);

  const ppp = settings.pricingPolicy;
  const dppp = defaults.pricingPolicy;
  ppp.worstCaseInstallments = clamp(Math.round(safeNumber(ppp.worstCaseInstallments, dppp.worstCaseInstallments)), 1, 60);
  ppp.monthlyInterestPct = clamp(safeNumber(ppp.monthlyInterestPct, dppp.monthlyInterestPct), 0, 10);
  ppp.narrativeEnabled = true;
  const validRound = ['none', 'whole', 'psychology'] as const;
  ppp.roundingMode = validRound.includes(ppp.roundingMode) ? ppp.roundingMode : dppp.roundingMode;
  const validInstRef = ['manual', 'boleto_limit', 'card_limit', 'v7_minprice'] as const;
  ppp.installmentReference = validInstRef.includes(ppp.installmentReference as any) ? ppp.installmentReference : dppp.installmentReference;
  ppp.negotiationBufferSource = 'none';
  ppp.manualBufferPct = 0;
  ppp.priceSource = 'v7_minprice';

  settings.ui.indicatorTags = sanitizeIndicatorTags(source.ui?.indicatorTags);
  settings.ui.indicatorRoleLabels = sanitizeIndicatorRoleLabels(source.ui?.indicatorRoleLabels);
  settings.ui.indicatorRules = sanitizeIndicatorRules(source.ui?.indicatorRules);
  settings.wizardCompleted = Boolean(source.wizardCompleted ?? defaults.wizardCompleted);
  settings.paymentAvailability = { ...defaults.paymentAvailability, ...(source.paymentAvailability || {}) };

  return settings;
}

// ---- Procedure helpers ----

export function procedurePolicy(itemName: string, settings: OwnerSettings): ProcedurePolicy {
  return settings.pricingPolicy.procedurePolicies[itemName] || createDefaultProcedurePolicies()[itemName];
}

export function ownerBaseSourcePrice(itemName: string, settings: OwnerSettings): number {
  const proc = procedurePolicy(itemName, settings);
  if (settings.pricingPolicy.priceSource === 'v7_minprice') {
    return roundMoney(safeNumber(proc?.minPrice, proc?.tablePrice || 0));
  }
  if (settings.pricingPolicy.priceSource === 'margem-preparado') {
    return roundMoney(safeNumber(proc?.idealCashPrice, proc?.tablePrice));
  }
  return roundMoney(safeNumber(proc?.tablePrice, 0));
}

export function itemMinPrice(item: Pick<PlanItem, 'name' | 'tablePrice'>, settings: OwnerSettings): number {
  const policy = procedurePolicy(item.name, settings);
  return roundMoney(policy?.minPrice ?? item.tablePrice);
}

export function itemMaxCampaignPct(item: Pick<PlanItem, 'name' | 'tablePrice'>, settings: OwnerSettings): number {
  const proc = procedurePolicy(item.name, settings);
  if (!proc?.campaignEnabled) return 0;
  const table = safeNumber(item?.tablePrice, 0);
  const minimum = Math.max(0, itemMinPrice(item, settings));
  if (!table || minimum >= table) return 0;
  return Math.round((1 - minimum / table) * 1000) / 10;
}

// ---- Narrative calculations ----

export function effectiveNarrativeInstallments(settings: OwnerSettings): number {
  if (settings.pricingPolicy.installmentReference === 'boleto_limit') {
    return Math.max(1, Math.round(settings.paymentPolicy.maxBoletoInstallments || 1));
  }
  if (settings.pricingPolicy.installmentReference === 'card_limit') {
    return Math.max(1, Math.round(settings.paymentPolicy.maxCardInstallments || 1));
  }
  return Math.max(1, Math.round(settings.pricingPolicy.worstCaseInstallments || 1));
}

export function boletoInterestPeriods(installments: number): number {
  return Math.max(0, Math.round(safeNumber(installments, 1)) - 1);
}

export function boletoFactorForInstallments(installments: number, settings: OwnerSettings): number {
  const count = Math.max(1, Math.round(safeNumber(installments, 1)));
  const periods = boletoInterestPeriods(count);
  if (count <= 1) return 1;
  if (settings.paymentPolicy.boletoInterestMode === 'none') return 1;
  const noInterestEnabled = Boolean(settings.paymentPolicy.boletoNoInterestEnabled);
  const noInterestUpTo = Math.max(0, Math.round(safeNumber(settings.paymentPolicy.boletoNoInterestInstallments, 0)));
  const chargeFrom = Math.max(1, Math.round(safeNumber(settings.paymentPolicy.boletoChargeInterestFromInstallments, 1)));
  if ((noInterestEnabled && count <= noInterestUpTo) || count < chargeFrom) return 1;
  if (settings.paymentPolicy.boletoInterestMode === 'manual_total_markup') {
    const maxPeriods = Math.max(1, boletoInterestPeriods(settings.paymentPolicy.maxBoletoInstallments));
    const ratio = periods / maxPeriods;
    return 1 + (safeNumber(settings.paymentPolicy.boletoTotalMarkupPct, 0) / 100) * ratio;
  }
  const monthly = safeNumber(settings.paymentPolicy.boletoMonthlyInterestPct, 0) / 100;
  if (!monthly) return 1;
  if (settings.paymentPolicy.boletoInterestMode === 'simple_monthly') {
    return 1 + (monthly * periods);
  }
  return Math.pow(1 + monthly, periods);
}

export function boletoTotalWithInterest(baseValue: number, installments: number, settings: OwnerSettings): number {
  return roundMoney(baseValue * boletoFactorForInstallments(installments, settings));
}

export function cardFeePct(installments: number, settings: OwnerSettings): number {
  const count = Math.max(1, Math.round(safeNumber(installments, 1)));
  const noInterestEnabled = Boolean(settings.paymentPolicy.cardNoInterestEnabled);
  const noInterestUpTo = Math.max(0, Math.round(safeNumber(settings.paymentPolicy.cardNoInterestInstallments, 0)));
  const chargeFrom = Math.max(1, Math.round(safeNumber(settings.paymentPolicy.cardChargeInterestFromInstallments, 1)));
  if ((noInterestEnabled && count <= noInterestUpTo) || count < chargeFrom) return 0;
  const baseRate = settings.paymentPolicy.cardUseDefaultRateTable
    ? defaultCardRateForInstallments(count)
    : safeNumber(settings.paymentPolicy.cardFlatRatePct, 0);
  const anticipation = settings.paymentPolicy.anticipationEnabled && count >= Math.max(1, Math.round(safeNumber(settings.paymentPolicy.anticipationMinInstallments, 2)))
    ? safeNumber(settings.paymentPolicy.anticipationPct, 0)
    : 0;
  return roundMoney(baseRate + anticipation);
}

export function narrativeBufferPct(itemName: string, settings: OwnerSettings): number {
  const proc = procedurePolicy(itemName, settings);
  const source = settings.pricingPolicy.negotiationBufferSource;
  if (source === 'campaign') return proc?.campaignEnabled ? clamp(safeNumber(proc.maxCampaignPct, 0), 0, 80) : 0;
  if (source === 'item') return clamp(safeNumber(proc?.maxDiscountPct, settings.discountPolicy.maxItemDiscountPct), 0, 80);
  if (source === 'plan') return clamp(safeNumber(settings.discountPolicy.maxPlanDiscountPct, 0), 0, 80);
  if (source === 'total') return clamp(safeNumber(settings.discountPolicy.maxTotalDiscountPct, 0), 0, 80);
  if (source === 'manual') return clamp(safeNumber(settings.pricingPolicy.manualBufferPct, 0), 0, 80);
  return 0;
}

export function narrativeTargetPrice(baseValue: number, settings: OwnerSettings): number {
  const installments = effectiveNarrativeInstallments(settings);
  const withInterest = boletoTotalWithInterest(baseValue, installments, settings);
  const risk = safeNumber(settings.paymentPolicy.defaultRiskPct, 0) / 100;
  const acquirer = safeNumber(settings.paymentPolicy.acquirerFeePct, 0) / 100;
  return roundMoney(withInterest * (1 + risk) * (1 + acquirer));
}

export function roundWholePriceUp(value: number): number {
  const base = roundMoney(value);
  if (base <= 0) return 0;
  if (base >= 1000) {
    const remainder = base % 100;
    if (remainder === 0 || remainder === 50) return base;
    return Math.ceil(base / 100) * 100;
  }
  if (base >= 100) {
    const remainder = base % 10;
    if (remainder === 0 || remainder === 5) return base;
    return Math.ceil(base / 10) * 10;
  }
  return Math.ceil(base);
}

export function roundPsychologicalPrice(value: number): number {
  const whole = roundWholePriceUp(value);
  if (whole < 1000) return whole;
  const nextThousand = Math.ceil(value / 1000) * 1000;
  if (nextThousand - value <= 30) return nextThousand - 3;
  return whole;
}

export function roundNarrativePrice(value: number, settings: OwnerSettings): number {
  const mode = settings.pricingPolicy.roundingMode;
  if (mode === 'none') return roundMoney(value);
  if (mode === 'psychology') return roundPsychologicalPrice(value);
  return roundWholePriceUp(value);
}

export function annualizedNarrativeValue(baseValue: number, settings: OwnerSettings, itemName = ''): number {
  const target = narrativeTargetPrice(baseValue, settings);
  const bufferPct = itemName ? narrativeBufferPct(itemName, settings) : 0;
  const buffered = bufferPct > 0 ? target / (1 - (bufferPct / 100)) : target;
  const raw = !settings.pricingPolicy.narrativeEnabled ? roundMoney(baseValue) : roundMoney(buffered);
  return roundNarrativePrice(raw, settings);
}

// ---- Plan calculations ----

export function planTableTotal(items: PlanItem[]): number {
  return items.reduce((s, i) => s + i.tablePrice * (i.qty || 1), 0);
}

export function planEffectiveTotal(plan: { items: PlanItem[]; totalOverride: number | null; extraDiscountPct: number }): number {
  if (plan.totalOverride !== null) return plan.totalOverride;
  const sum = plan.items.reduce((s, i) => {
    const qty = i.qty || 1;
    const p = i.overridePrice !== null ? i.overridePrice
            : i.campaignPct !== null   ? i.tablePrice * (1 - i.campaignPct / 100)
            : i.tablePrice;
    return s + p * qty;
  }, 0);
  return sum * (1 - (plan.extraDiscountPct || 0) / 100);
}

export function planMinimumCashTotal(items: PlanItem[], settings: OwnerSettings): number {
  return roundMoney(items.reduce((sum, item) => sum + itemMinPrice(item, settings) * (item.qty || 1), 0));
}

export function saldoAposEntrada(
  plan: { items: PlanItem[]; totalOverride: number | null; extraDiscountPct: number; payment: { entradaPct: number } }
): number {
  const eff = planEffectiveTotal(plan);
  return roundMoney(eff * (1 - (plan.payment.entradaPct || 0) / 100));
}

export function paymentDisplayValue(
  plan: {
    items: PlanItem[];
    totalOverride: number | null;
    extraDiscountPct: number;
    shownPayments: string[];
    payment: {
      entradaPct: number;
      parcelas: number;
      descontoAVista: number;
      parcelasBoleto: number;
      aVistaOverride: number | null;
      parceladoOverride: number | null;
      boletoOverride: number | null;
      debitoOverride: number | null;
    };
  },
  field: string,
  settings: OwnerSettings
): number {
  const eff = planEffectiveTotal(plan);
  const hasEntrada = plan.shownPayments.includes('entrada');
  const base = hasEntrada ? saldoAposEntrada(plan) : eff;
  if (field === 'avista')   return plan.payment.aVistaOverride ?? eff * (1 - plan.payment.descontoAVista / 100);
  if (field === 'parcelado') {
    const inst = Math.max(0, Math.round(plan.payment.parcelas || 0));
    if (!inst) return 0;
    const totalWithFee = base * (1 + cardFeePct(inst, settings) / 100);
    return plan.payment.parceladoOverride ?? (totalWithFee / inst);
  }
  if (field === 'boleto') {
    if (!(plan.payment.parcelasBoleto > 0)) return 0;
    const totalWithBoleto = boletoTotalWithInterest(base, plan.payment.parcelasBoleto, settings);
    return plan.payment.boletoOverride ?? (totalWithBoleto / plan.payment.parcelasBoleto);
  }
  if (field === 'debito') return plan.payment.debitoOverride ?? eff;
  return 0;
}

export function discountPctFromUnitPrice(tablePrice: number, unitPrice: number): number {
  if (!tablePrice || unitPrice >= tablePrice) return 0;
  return Math.round((1 - unitPrice / tablePrice) * 1000) / 10;
}

// ---- Indicator logic ----

export function resolveIndicatorTag(tone: IndicatorTone, settings: OwnerSettings): IndicatorTag {
  const tags = sanitizeIndicatorTags(settings.ui?.indicatorTags);
  return tags.find(t => t.mapsTo === tone) || tags.find(t => t.mapsTo === 'neutral') || sanitizeIndicatorTags(null)[0];
}

export function indicatorTagStyle(tone: IndicatorTone, settings: OwnerSettings): string {
  const tag = resolveIndicatorTag(tone, settings);
  const color = normalizeIndicatorColor(tag?.color, '#5f5f5f');
  return `background:${color};box-shadow:0 0 0 1px ${color}44,0 0 14px ${color}33;`;
}

export function cashNarrativeStatus(
  amount: number,
  reference: number,
  floor: number,
  methodLabel: string,
  rules: IndicatorRules
): PaymentStatus {
  const gap = Math.max(0, reference - floor);
  const limitMax = clamp(safeNumber(rules.cash?.limitMaxPct, 8) / 100, 0, 1);
  const warnMax = clamp(safeNumber(rules.cash?.warnMaxPct, 32) / 100, limitMax, 1);
  const goodMax = clamp(safeNumber(rules.cash?.goodMaxPct, 68) / 100, warnMax, 1);
  if (!reference || gap <= 1) {
    return { label: 'Última condição aprovada', message: `Esse é o limite aprovado para fechamento ${methodLabel}.`, tone: 'limit', rowTone: 'payment-row--limit' };
  }
  const ratio = clamp((amount - floor) / gap, 0, 1);
  if (ratio <= limitMax) return { label: 'Última condição aprovada', message: `Esse é o limite aprovado para fechamento ${methodLabel}.`, tone: 'limit', rowTone: 'payment-row--limit' };
  if (ratio <= warnMax) return { label: 'Condição agressiva', message: `Boa para destravar o fechamento ${methodLabel}, com pouca folga adicional.`, tone: 'warn', rowTone: 'payment-row--warn' };
  if (ratio <= goodMax) return { label: 'Boa condição de fechamento', message: `Essa condição já é competitiva e ainda preserva a estratégia ${methodLabel}.`, tone: 'good', rowTone: 'payment-row--good' };
  return { label: 'Condição premium', message: `Você ainda está em uma condição muito confortável ${methodLabel}.`, tone: 'premium', rowTone: 'payment-row--good' };
}

export function planHasCampaign(plan: { items: PlanItem[]; extraDiscountPct: number; totalOverride: number | null; payment: { descontoAVista: number } }): boolean {
  return plan.items.some(i => i.campaignPct !== null) || plan.extraDiscountPct > 0 || plan.totalOverride !== null || plan.payment.descontoAVista > 0;
}
