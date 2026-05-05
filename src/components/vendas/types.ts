export interface CatalogItem {
  category: string;
  name: string;
  tablePrice: number;
  minPrice: number;
}

export interface PlanItem {
  id: string;
  name: string;
  tablePrice: number;
  baseTablePrice: number;
  qty: number;
  priceVisible: boolean;
  campaignPct: number | null;
  overridePrice: number | null;
  campaignEditing: boolean;
  campaignInput: string;
  priceEditing: boolean;
  priceEditInput: string;
}

export interface PlanPayment {
  entradaPct: number;
  parcelas: number;
  descontoAVista: number;
  parcelasBoleto: number;
  entradaEditing: boolean;
  entradaEditInput: number;
  entradaOverride: number | null;
  aVistaOverride: number | null;
  parceladoOverride: number | null;
  boletoOverride: number | null;
  debitoOverride: number | null;
  editingField: string | null;
  editInput: number;
}

export interface Plan {
  id: string;
  name: string;
  items: PlanItem[];
  totalRevealed: boolean;
  totalVisible: boolean;
  totalEditing: boolean;
  totalEditInput: number;
  totalOverride: number | null;
  paymentRevealed: boolean;
  paymentVisible: boolean;
  cartaNaMangaActive: boolean;
  extraDiscountPct: number;
  planCampaignPctRequested: number;
  planCampaignPctEffective: number;
  shownPayments: PaymentMethod[];
  programmedInfoOpen: boolean;
  redoStack: unknown[];
  searchQuery: string;
  dropdownOpen: boolean;
  payment: PlanPayment;
}

export type PaymentMethod = 'avista' | 'entrada' | 'parcelado' | 'debito' | 'boleto';

export interface PaymentAvailability {
  avista: boolean;
  entrada: boolean;
  parcelado: boolean;
  debito: boolean;
  boleto: boolean;
}

export interface ProcedurePolicy {
  category: string;
  tablePrice: number;
  idealCashPrice: number;
  minPrice: number;
  narrativePriceOverride: number | null;
  maxDiscountPct: number;
  campaignEnabled: boolean;
  maxCampaignPct: number;
  programmedEnabled: boolean;
  programmedStartPct: number;
  programmedFinishPct: number;
  programmedStartMonth: number;
}

export interface PricingPolicy {
  priceSource: string;
  narrativeEnabled: boolean;
  interestMode: string;
  worstCaseInstallments: number;
  monthlyInterestPct: number;
  roundingMode: 'none' | 'whole' | 'psychology';
  installmentReference: string;
  negotiationBufferSource: string;
  manualBufferPct: number;
  procedurePolicies: Record<string, ProcedurePolicy>;
}

export interface DiscountPolicy {
  maxItemDiscountPct: number;
  maxPlanDiscountPct: number;
  maxTotalDiscountPct: number;
  maxAVistaDiscountPct: number;
}

export interface PaymentPolicy {
  minEntradaPct: number;
  cardIdealInstallments: number;
  maxCardInstallments: number;
  cardNoInterestEnabled: boolean;
  cardNoInterestInstallments: number;
  cardChargeInterestFromInstallments: number;
  cardUseDefaultRateTable: boolean;
  cardFlatRatePct: number;
  boletoIdealInstallments: number;
  maxBoletoInstallments: number;
  boletoEnabled: boolean;
  boletoNoInterestEnabled: boolean;
  boletoNoInterestInstallments: number;
  boletoChargeInterestFromInstallments: number;
  boletoInterestMode: 'compound_monthly' | 'simple_monthly' | 'manual_total_markup' | 'none';
  boletoMonthlyInterestPct: number;
  boletoTotalMarkupPct: number;
  acquirerFeePct: number;
  defaultRiskPct: number;
  debitFeePct: number;
  anticipationEnabled: boolean;
  anticipationPct: number;
  anticipationMinInstallments: number;
  cardRates: Record<string, number>;
}

export interface IndicatorTag {
  id: string;
  label: string;
  color: string;
  mapsTo: 'premium' | 'good' | 'warn' | 'limit' | 'neutral' | 'legend';
}

export interface IndicatorRoleLabels {
  premium: string;
  good: string;
  warn: string;
  limit: string;
  neutral: string;
  legend: string;
}

export interface IndicatorRules {
  cash: { limitMaxPct: number; warnMaxPct: number; goodMaxPct: number };
  entry: { premiumAboveSuggestedPct: number };
  card: { premiumUpToIdealPct: number; goodUpToIdealPct: number };
  boleto: { premiumUpToIdealPct: number; goodUpToIdealPct: number };
}

export interface OwnerSettingsUI {
  indicatorTags: IndicatorTag[];
  indicatorRoleLabels: IndicatorRoleLabels;
  indicatorRules: IndicatorRules;
}

export interface OwnerSettings {
  wizardCompleted: boolean;
  scopeType: 'clinica' | 'unidade';
  scopeName: string;
  paymentAvailability: PaymentAvailability;
  pricingPolicy: PricingPolicy;
  discountPolicy: DiscountPolicy;
  paymentPolicy: PaymentPolicy;
  ui: OwnerSettingsUI;
}

export interface OwnerV8CardTerms {
  noInterestEnabled: boolean;
  noInterestUpToInstallments: number;
  chargeInterestFromInstallments: number;
  useDefaultRateTable: boolean;
  flatRatePct: number;
  anticipationEnabled: boolean;
  anticipationPct: number;
  anticipationFromInstallments: number;
}

export interface OwnerV8BoletoTerms {
  noInterestEnabled: boolean;
  noInterestUpToInstallments: number;
  chargeInterestFromInstallments: number;
  monthlyInterestPct: number;
}

export interface ExternalMinimumItem {
  name: string;
  category: string;
  minPrice: number;
  updatedAt: string;
  code?: string | null;
}

export interface ExternalMinimumSnapshot {
  importedAt: string | null;
  source: string;
  items: ExternalMinimumItem[];
}

export interface OwnerV8PerProcedure {
  inputMode: 'auto' | 'pct' | 'absolute';
  gorduraPct: number | null;
  tableAbsolute: number | null;
}

export interface OwnerV8Model {
  version: number;
  completed: boolean;
  currentSection: number;
  identity: { scopeType: 'clinica' | 'unidade'; scopeName: string };
  lastChanceCondition: { monthlyInterestPct: number; maxInstallments: number };
  tableStrategy: {
    mode: 'suggested' | 'globalPct' | 'perProcedure' | 'manual';
    globalGorduraPct: number;
    perProcedure: Record<string, OwnerV8PerProcedure>;
  };
  payments: PaymentAvailability;
  cardTerms: OwnerV8CardTerms;
  boletoTerms: OwnerV8BoletoTerms;
  indicatorTags: IndicatorTag[];
  indicatorRoleLabels: IndicatorRoleLabels;
  indicatorRules: IndicatorRules;
  externalMinimumSnapshot: ExternalMinimumSnapshot;
}

export type IndicatorTone = 'premium' | 'good' | 'warn' | 'limit' | 'neutral';

export interface PaymentStatus {
  label: string;
  message: string;
  tone: IndicatorTone;
  rowTone: string;
}

export interface ManualDraftRow {
  name: string;
  minPrice: number;
  tablePrice: number;
}

export interface OwnerV8State {
  open: boolean;
  currentSection: number;
  model: OwnerV8Model;
  externalPreview: ExternalMinimumSnapshot | null;
  externalWarning: string;
  initialized: boolean;
  importedBadge: string;
  semaforoAdvancedOpen: boolean;
  manualDraft: {
    rows: Record<string, ManualDraftRow>;
    editing: string | null;
  };
}
