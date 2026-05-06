import type {
  OwnerV8Model, OwnerV8CardTerms, OwnerV8BoletoTerms, ExternalMinimumSnapshot,
  OwnerSettings,
} from './types';
import {
  clamp, safeNumber, roundMoney, cloneData,
  defaultIndicatorTags, defaultIndicatorRoleLabels, defaultIndicatorRules,
  sanitizeIndicatorTags, sanitizeIndicatorRoleLabels, sanitizeIndicatorRules,
  createDefaultOwnerSettings, hydrateOwnerSettings, defaultCatalogMinPrice,
  defaultCardRateForInstallments,
} from './calcEngine';
import { FLAT_CATALOG } from './catalog';

export const OWNER_V8_STORAGE_KEY = 'top-v9-owner-model';
export const EXTERNAL_MINIMUM_STORAGE_KEY = 'clinicscale:external-minimum-prices:v1';

export const OWNER_V8_SECTIONS = [
  { key: 'welcome', label: 'Boas-vindas' },
  { key: 'identity', label: 'Sua Clínica' },
  { key: 'minimums', label: 'Preços Mínimos' },
  { key: 'lastChance', label: 'Última Condição' },
  { key: 'table', label: 'Tabela e Preços' },
  { key: 'payments', label: 'Pagamentos' },
  { key: 'cardTerms', label: 'Cartão e Juros' },
  { key: 'review', label: 'Pronto' },
];

export function createDefaultOwnerV8PerProcedure(): Record<string, { inputMode: 'auto' | 'pct' | 'absolute'; gorduraPct: number | null; tableAbsolute: number | null }> {
  return FLAT_CATALOG.reduce<Record<string, any>>((acc, proc) => {
    acc[proc.name] = { inputMode: 'auto', gorduraPct: null, tableAbsolute: null };
    return acc;
  }, {});
}

export function createOwnerV8EmptySnapshot(): ExternalMinimumSnapshot {
  return { importedAt: null, source: '', items: [] };
}

export function defaultOwnerV8CardTerms(): OwnerV8CardTerms {
  return {
    noInterestEnabled: false,
    noInterestUpToInstallments: 0,
    chargeInterestFromInstallments: 1,
    useDefaultRateTable: true,
    flatRatePct: 3.9,
    anticipationEnabled: false,
    anticipationPct: 0.6,
    anticipationFromInstallments: 2,
  };
}

export function sanitizeOwnerV8CardTerms(raw: unknown): OwnerV8CardTerms {
  const defaults = defaultOwnerV8CardTerms();
  const source = (raw || {}) as any;
  const noInterestEnabled = Boolean(source.noInterestEnabled ?? defaults.noInterestEnabled);
  const noInterestUpToInstallments = clamp(Math.round(safeNumber(source.noInterestUpToInstallments, defaults.noInterestUpToInstallments)), 0, 36);
  const chargeInterestFromInstallments = clamp(
    Math.round(safeNumber(source.chargeInterestFromInstallments, noInterestEnabled ? Math.max(1, noInterestUpToInstallments + 1) : defaults.chargeInterestFromInstallments)),
    1, 36
  );
  return {
    noInterestEnabled,
    noInterestUpToInstallments,
    chargeInterestFromInstallments: noInterestEnabled
      ? Math.max(chargeInterestFromInstallments, noInterestUpToInstallments + 1)
      : chargeInterestFromInstallments,
    useDefaultRateTable: Boolean(source.useDefaultRateTable ?? defaults.useDefaultRateTable),
    flatRatePct: clamp(safeNumber(source.flatRatePct, defaults.flatRatePct), 0, 40),
    anticipationEnabled: Boolean(source.anticipationEnabled ?? defaults.anticipationEnabled),
    anticipationPct: clamp(safeNumber(source.anticipationPct, defaults.anticipationPct), 0, 10),
    anticipationFromInstallments: clamp(Math.round(safeNumber(source.anticipationFromInstallments, defaults.anticipationFromInstallments)), 1, 36),
  };
}

export function defaultOwnerV8BoletoTerms(): OwnerV8BoletoTerms {
  return { noInterestEnabled: false, noInterestUpToInstallments: 0, chargeInterestFromInstallments: 1, monthlyInterestPct: 1.5 };
}

export function sanitizeOwnerV8BoletoTerms(raw: unknown): OwnerV8BoletoTerms {
  const defaults = defaultOwnerV8BoletoTerms();
  const source = (raw || {}) as any;
  const noInterestEnabled = Boolean(source.noInterestEnabled ?? defaults.noInterestEnabled);
  const noInterestUpToInstallments = clamp(Math.round(safeNumber(source.noInterestUpToInstallments, defaults.noInterestUpToInstallments)), 0, 60);
  const chargeInterestFromInstallments = clamp(
    Math.round(safeNumber(source.chargeInterestFromInstallments, noInterestEnabled ? Math.max(1, noInterestUpToInstallments + 1) : defaults.chargeInterestFromInstallments)),
    1, 60
  );
  return {
    noInterestEnabled,
    noInterestUpToInstallments,
    chargeInterestFromInstallments: noInterestEnabled
      ? Math.max(chargeInterestFromInstallments, noInterestUpToInstallments + 1)
      : chargeInterestFromInstallments,
    monthlyInterestPct: clamp(safeNumber(source.monthlyInterestPct, defaults.monthlyInterestPct), 0, 10),
  };
}

export function createOwnerV8FallbackSnapshot(source = 'manual-defaults'): ExternalMinimumSnapshot {
  const now = new Date().toISOString();
  return {
    importedAt: now,
    source,
    items: FLAT_CATALOG.map(proc => ({
      name: proc.name,
      category: proc.category,
      minPrice: defaultCatalogMinPrice(proc),
      updatedAt: now,
    })),
  };
}

export function defaultOwnerV8Model(): OwnerV8Model {
  return {
    version: 1,
    completed: false,
    currentSection: 0,
    identity: { scopeType: 'unidade', scopeName: 'Minha Clínica' },
    lastChanceCondition: { monthlyInterestPct: 1.5, maxInstallments: 24 },
    tableStrategy: {
      mode: 'suggested',
      globalGorduraPct: 25,
      perProcedure: createDefaultOwnerV8PerProcedure(),
    },
    payments: { avista: true, entrada: true, parcelado: true, debito: true, boleto: false },
    cardTerms: defaultOwnerV8CardTerms(),
    boletoTerms: defaultOwnerV8BoletoTerms(),
    indicatorTags: defaultIndicatorTags(),
    indicatorRoleLabels: defaultIndicatorRoleLabels(),
    indicatorRules: defaultIndicatorRules(),
    externalMinimumSnapshot: createOwnerV8EmptySnapshot(),
  };
}

export function sanitizeOwnerV8Snapshot(raw: unknown): ExternalMinimumSnapshot {
  const snapshot = createOwnerV8EmptySnapshot();
  const source = (raw || {}) as any;
  snapshot.importedAt = typeof source.importedAt === 'string' ? source.importedAt : null;
  snapshot.source = typeof source.source === 'string' ? source.source : '';
  snapshot.items = Array.isArray(source.items)
    ? source.items
        .map((item: any) => ({
          name: item?.name,
          category: item?.category || '',
          minPrice: roundMoney(Math.max(0, safeNumber(item?.minPrice, 0))),
          updatedAt: item?.updatedAt || snapshot.importedAt,
          code: item?.code || null,
        }))
        .filter((item: any) => typeof item.name === 'string' && item.name && item.minPrice > 0)
    : [];
  return snapshot;
}

export function hydrateOwnerV8Model(raw: unknown): OwnerV8Model {
  const defaults = defaultOwnerV8Model();
  const source = (raw || {}) as any;
  const model: OwnerV8Model = {
    ...defaults,
    ...source,
    identity: { ...defaults.identity, ...(source.identity || {}) },
    lastChanceCondition: { ...defaults.lastChanceCondition, ...(source.lastChanceCondition || {}) },
    tableStrategy: { ...defaults.tableStrategy, ...(source.tableStrategy || {}), perProcedure: createDefaultOwnerV8PerProcedure() },
    payments: { ...defaults.payments, ...(source.payments || {}) },
    cardTerms: sanitizeOwnerV8CardTerms(source.cardTerms),
    boletoTerms: sanitizeOwnerV8BoletoTerms(source.boletoTerms),
    indicatorTags: sanitizeIndicatorTags(source.indicatorTags),
    indicatorRoleLabels: sanitizeIndicatorRoleLabels(source.indicatorRoleLabels),
    indicatorRules: sanitizeIndicatorRules(source.indicatorRules),
    externalMinimumSnapshot: sanitizeOwnerV8Snapshot(source.externalMinimumSnapshot),
  };

  const savedProcedures = source.tableStrategy?.perProcedure || {};
  FLAT_CATALOG.forEach(proc => {
    const saved = savedProcedures[proc.name] || {};
    model.tableStrategy.perProcedure[proc.name] = {
      ...model.tableStrategy.perProcedure[proc.name],
      ...saved,
      inputMode: ['auto', 'pct', 'absolute'].includes(saved.inputMode) ? saved.inputMode : (model.tableStrategy.perProcedure[proc.name].inputMode || 'auto'),
      gorduraPct: saved.gorduraPct == null ? null : safeNumber(saved.gorduraPct, 0),
      tableAbsolute: saved.tableAbsolute == null ? null : roundMoney(safeNumber(saved.tableAbsolute, 0)),
    };
  });

  if (['manual-defaults', 'accepted-suggested'].includes(model.externalMinimumSnapshot.source)) {
    model.externalMinimumSnapshot = createOwnerV8FallbackSnapshot(model.externalMinimumSnapshot.source);
  }

  model.version = 1;
  model.completed = Boolean(source.completed ?? defaults.completed);
  model.currentSection = clamp(Math.round(safeNumber(source.currentSection, defaults.currentSection)), 0, OWNER_V8_SECTIONS.length - 1);
  model.identity.scopeType = model.identity.scopeType === 'clinica' ? 'clinica' : 'unidade';
  model.identity.scopeName = String(model.identity.scopeName || '').trim() || defaults.identity.scopeName;
  model.lastChanceCondition.monthlyInterestPct = clamp(safeNumber(model.lastChanceCondition.monthlyInterestPct, defaults.lastChanceCondition.monthlyInterestPct), 0, 10);
  model.lastChanceCondition.maxInstallments = clamp(Math.round(safeNumber(model.lastChanceCondition.maxInstallments, defaults.lastChanceCondition.maxInstallments)), 1, 60);
  const validModes = ['suggested', 'globalPct', 'perProcedure', 'manual'] as const;
  model.tableStrategy.mode = validModes.includes(model.tableStrategy.mode) ? model.tableStrategy.mode : defaults.tableStrategy.mode;
  model.tableStrategy.globalGorduraPct = clamp(safeNumber(model.tableStrategy.globalGorduraPct, defaults.tableStrategy.globalGorduraPct), 0, 300);

  return model;
}

export function ownerV8ToV7Settings(model: OwnerV8Model): OwnerSettings {
  const normalized = hydrateOwnerV8Model(model);
  const settings = createDefaultOwnerSettings();
  settings.wizardCompleted = Boolean(normalized.completed);
  settings.scopeType = normalized.identity.scopeType;
  settings.scopeName = normalized.identity.scopeName;
  settings.paymentAvailability = {
    avista: normalized.payments.avista !== false,
    entrada: normalized.payments.entrada !== false,
    parcelado: normalized.payments.parcelado !== false,
    debito: normalized.payments.debito !== false,
    boleto: normalized.payments.boleto !== false,
  };
  settings.pricingPolicy.worstCaseInstallments = normalized.lastChanceCondition.maxInstallments;
  settings.pricingPolicy.monthlyInterestPct = normalized.lastChanceCondition.monthlyInterestPct;
  settings.paymentPolicy.boletoMonthlyInterestPct = normalized.lastChanceCondition.monthlyInterestPct;
  settings.paymentPolicy.maxBoletoInstallments = normalized.lastChanceCondition.maxInstallments;
  settings.paymentPolicy.maxCardInstallments = Math.min(24, normalized.lastChanceCondition.maxInstallments);
  settings.paymentPolicy.cardIdealInstallments = Math.min(12, settings.paymentPolicy.maxCardInstallments);
  settings.paymentPolicy.cardNoInterestEnabled = normalized.cardTerms.noInterestEnabled;
  settings.paymentPolicy.cardNoInterestInstallments = Math.min(normalized.cardTerms.noInterestUpToInstallments, settings.paymentPolicy.maxCardInstallments);
  settings.paymentPolicy.cardChargeInterestFromInstallments = Math.min(Math.max(1, normalized.cardTerms.chargeInterestFromInstallments), settings.paymentPolicy.maxCardInstallments);
  settings.paymentPolicy.cardUseDefaultRateTable = normalized.cardTerms.useDefaultRateTable;
  settings.paymentPolicy.cardFlatRatePct = normalized.cardTerms.flatRatePct;
  settings.paymentPolicy.boletoIdealInstallments = Math.min(12, settings.paymentPolicy.maxBoletoInstallments);
  settings.paymentPolicy.boletoEnabled = settings.paymentAvailability.boleto;
  settings.paymentPolicy.boletoNoInterestEnabled = normalized.boletoTerms.noInterestEnabled;
  settings.paymentPolicy.boletoNoInterestInstallments = Math.min(normalized.boletoTerms.noInterestUpToInstallments, settings.paymentPolicy.maxBoletoInstallments);
  settings.paymentPolicy.boletoChargeInterestFromInstallments = Math.min(Math.max(1, normalized.boletoTerms.chargeInterestFromInstallments), settings.paymentPolicy.maxBoletoInstallments);
  settings.paymentPolicy.boletoMonthlyInterestPct = normalized.boletoTerms.monthlyInterestPct;
  settings.paymentPolicy.anticipationEnabled = normalized.cardTerms.anticipationEnabled;
  settings.paymentPolicy.anticipationPct = normalized.cardTerms.anticipationPct;
  settings.paymentPolicy.anticipationMinInstallments = Math.min(Math.max(1, normalized.cardTerms.anticipationFromInstallments), settings.paymentPolicy.maxCardInstallments);
  settings.ui.indicatorTags = cloneData(sanitizeIndicatorTags(normalized.indicatorTags));
  settings.ui.indicatorRoleLabels = cloneData(sanitizeIndicatorRoleLabels(normalized.indicatorRoleLabels));
  settings.ui.indicatorRules = cloneData(sanitizeIndicatorRules(normalized.indicatorRules));

  const snapshotMap = new Map((normalized.externalMinimumSnapshot.items || []).map(item => [item.name, item]));

  FLAT_CATALOG.forEach(proc => {
    const policy = settings.pricingPolicy.procedurePolicies[proc.name];
    const minimumRow = snapshotMap.get(proc.name);
    const minPrice = roundMoney(Math.max(0, safeNumber(minimumRow?.minPrice, defaultCatalogMinPrice(proc))));
    policy.minPrice = minPrice;
    policy.idealCashPrice = roundMoney(Math.max(minPrice, safeNumber(proc.tablePrice, minPrice)));

    const procStrategy = normalized.tableStrategy.perProcedure[proc.name] || { inputMode: 'auto', gorduraPct: null, tableAbsolute: null };
    let override: number | null = null;
    if (normalized.tableStrategy.mode === 'globalPct') {
      override = roundMoney(minPrice * (1 + (safeNumber(normalized.tableStrategy.globalGorduraPct, 0) / 100)));
    } else if (normalized.tableStrategy.mode === 'perProcedure' || normalized.tableStrategy.mode === 'manual') {
      if (procStrategy.inputMode === 'pct') {
        override = roundMoney(minPrice * (1 + (safeNumber(procStrategy.gorduraPct, 0) / 100)));
      } else if (procStrategy.inputMode === 'absolute') {
        override = roundMoney(safeNumber(procStrategy.tableAbsolute, 0));
      }
      // inputMode 'auto' → override stays null (engine calculates via annualizedNarrativeValue)
    }
    // 'suggested' mode → override stays null (engine calculates via annualizedNarrativeValue)
    policy.narrativePriceOverride = (override !== null && override >= minPrice) ? override : null;
  });

  Object.keys(settings.paymentPolicy.cardRates).forEach(key => {
    const installment = Math.max(1, Number(key));
    if (settings.paymentPolicy.cardNoInterestEnabled && installment <= settings.paymentPolicy.cardNoInterestInstallments) {
      settings.paymentPolicy.cardRates[key] = 0; return;
    }
    if (installment < settings.paymentPolicy.cardChargeInterestFromInstallments) {
      settings.paymentPolicy.cardRates[key] = 0; return;
    }
    settings.paymentPolicy.cardRates[key] = settings.paymentPolicy.cardUseDefaultRateTable
      ? defaultCardRateForInstallments(installment)
      : settings.paymentPolicy.cardFlatRatePct;
  });

  return settings;
}

export function ownerV8ModelFromLegacySettings(ownerSettings: unknown): OwnerV8Model {
  const settings = hydrateOwnerSettings(ownerSettings || createDefaultOwnerSettings());
  const model = defaultOwnerV8Model();
  model.completed = Boolean(settings.wizardCompleted);
  model.currentSection = model.completed ? OWNER_V8_SECTIONS.length - 1 : 0;
  model.identity.scopeType = settings.scopeType === 'clinica' ? 'clinica' : 'unidade';
  model.identity.scopeName = settings.scopeName || model.identity.scopeName;
  model.lastChanceCondition.monthlyInterestPct = safeNumber(settings.paymentPolicy?.boletoMonthlyInterestPct, model.lastChanceCondition.monthlyInterestPct);
  model.lastChanceCondition.maxInstallments = Math.max(1, Math.round(safeNumber(settings.paymentPolicy?.maxBoletoInstallments, model.lastChanceCondition.maxInstallments)));
  model.payments = {
    avista: settings.paymentAvailability?.avista !== false,
    entrada: settings.paymentAvailability?.entrada !== false,
    parcelado: settings.paymentAvailability?.parcelado !== false,
    debito: settings.paymentAvailability?.debito !== false,
    boleto: settings.paymentAvailability?.boleto !== false,
  };
  model.cardTerms = sanitizeOwnerV8CardTerms({
    noInterestEnabled: settings.paymentPolicy?.cardNoInterestEnabled,
    noInterestUpToInstallments: settings.paymentPolicy?.cardNoInterestInstallments,
    chargeInterestFromInstallments: settings.paymentPolicy?.cardChargeInterestFromInstallments,
    useDefaultRateTable: settings.paymentPolicy?.cardUseDefaultRateTable,
    flatRatePct: settings.paymentPolicy?.cardFlatRatePct,
    anticipationEnabled: settings.paymentPolicy?.anticipationEnabled,
    anticipationPct: settings.paymentPolicy?.anticipationPct,
    anticipationFromInstallments: settings.paymentPolicy?.anticipationMinInstallments,
  });
  model.boletoTerms = sanitizeOwnerV8BoletoTerms({
    noInterestEnabled: settings.paymentPolicy?.boletoNoInterestEnabled,
    noInterestUpToInstallments: settings.paymentPolicy?.boletoNoInterestInstallments,
    chargeInterestFromInstallments: settings.paymentPolicy?.boletoChargeInterestFromInstallments,
    monthlyInterestPct: settings.paymentPolicy?.boletoMonthlyInterestPct,
  });
  model.indicatorTags = sanitizeIndicatorTags(settings.ui?.indicatorTags);
  model.indicatorRoleLabels = sanitizeIndicatorRoleLabels(settings.ui?.indicatorRoleLabels);
  model.indicatorRules = sanitizeIndicatorRules(settings.ui?.indicatorRules);

  const now = new Date().toISOString();
  model.externalMinimumSnapshot = {
    importedAt: now,
    source: 'legacy-v7',
    items: FLAT_CATALOG.map(proc => {
      const policy = settings.pricingPolicy?.procedurePolicies?.[proc.name] || {};
      return {
        name: proc.name,
        category: proc.category,
        minPrice: roundMoney(Math.max(0, safeNumber(policy.minPrice, defaultCatalogMinPrice(proc)))),
        updatedAt: now,
      };
    }),
  };

  const hasManualOverrides = FLAT_CATALOG.some(proc => {
    const override = settings.pricingPolicy?.procedurePolicies?.[proc.name]?.narrativePriceOverride;
    return override != null && safeNumber(override, 0) > 0;
  });

  model.tableStrategy.mode = hasManualOverrides ? 'perProcedure' : 'suggested';
  FLAT_CATALOG.forEach(proc => {
    const override = settings.pricingPolicy?.procedurePolicies?.[proc.name]?.narrativePriceOverride;
    if (override != null && safeNumber(override, 0) > 0) {
      model.tableStrategy.perProcedure[proc.name] = {
        inputMode: 'absolute',
        gorduraPct: null,
        tableAbsolute: roundMoney(safeNumber(override, 0)),
      };
    }
  });

  return hydrateOwnerV8Model(model);
}

export function ownerV8SuggestedGorduraPct(model: OwnerV8Model): number {
  const pct = Math.pow(1 + (safeNumber(model.lastChanceCondition.monthlyInterestPct, 0) / 100), Math.max(1, Math.round(safeNumber(model.lastChanceCondition.maxInstallments, 1)))) - 1;
  return Math.round(Math.max(0, pct) * 1000) / 10;
}

export function ownerV8ProcedureTablePreview(procName: string, model: OwnerV8Model): number {
  const minimumItem = model.externalMinimumSnapshot.items.find(item => item.name === procName);
  const fallbackProc = FLAT_CATALOG.find(proc => proc.name === procName);
  const minPrice = roundMoney(Math.max(0, safeNumber(minimumItem?.minPrice, defaultCatalogMinPrice(fallbackProc || { minPrice: 0 }))));
  const strategy = model.tableStrategy;
  const procStrategy = strategy.perProcedure[procName] || { inputMode: 'auto', gorduraPct: null, tableAbsolute: null };
  const suggested = roundMoney(Math.max(minPrice, safeNumber(fallbackProc?.tablePrice, minPrice)));
  if (strategy.mode === 'suggested') return suggested;
  if (strategy.mode === 'globalPct') return roundMoney(minPrice * (1 + (safeNumber(strategy.globalGorduraPct, 0) / 100)));
  if (strategy.mode === 'manual') return roundMoney(Math.max(minPrice, safeNumber(procStrategy.tableAbsolute, minPrice)));
  if (procStrategy.inputMode === 'pct') return roundMoney(minPrice * (1 + (safeNumber(procStrategy.gorduraPct, 0) / 100)));
  if (procStrategy.inputMode === 'absolute') return roundMoney(safeNumber(procStrategy.tableAbsolute, minPrice));
  return suggested;
}

export function loadOwnerV8Model(): OwnerV8Model {
  try {
    const v8Raw = localStorage.getItem(OWNER_V8_STORAGE_KEY);
    const legacyRaw = localStorage.getItem('top-v7-owner-settings');
    if (v8Raw) return hydrateOwnerV8Model(JSON.parse(v8Raw));
    if (legacyRaw) return ownerV8ModelFromLegacySettings(JSON.parse(legacyRaw));
  } catch {}
  return hydrateOwnerV8Model(defaultOwnerV8Model());
}

export function saveOwnerV8Model(model: OwnerV8Model): void {
  try {
    localStorage.setItem(OWNER_V8_STORAGE_KEY, JSON.stringify(model));
  } catch {}
}

export function applyOwnerV8Model(model: OwnerV8Model): OwnerSettings {
  const v7Raw = ownerV8ToV7Settings(model);
  const settings = hydrateOwnerSettings(v7Raw);
  try {
    localStorage.setItem('top-v7-owner-settings', JSON.stringify(settings));
  } catch {}
  return settings;
}
