import { roundMoney, safeNumber } from "./money";

export function defaultCatalogMinPrice(proc) {
  return roundMoney(safeNumber(proc?.minPrice, proc?.tablePrice || 0));
}

export function itemMinPrice(item) {
  return roundMoney(safeNumber(item?.minPrice, item?.tablePrice || 0));
}

export function discountPctFromUnitPrice(tablePrice, unitPrice) {
  const table = safeNumber(tablePrice, 0);
  const unit = safeNumber(unitPrice, 0);
  if (!table || unit >= table) return 0;
  return Math.round((1 - unit / table) * 1000) / 10;
}

export function itemMaxCampaignPct(item) {
  const table = safeNumber(item?.tablePrice, 0);
  const minimum = itemMinPrice(item);
  if (!table || minimum >= table) return 0;
  return Math.round((1 - minimum / table) * 1000) / 10;
}

export function applyCampaignLimit(item, requestedPct) {
  const next = { ...item };
  const pct = safeNumber(requestedPct, 0);
  const maxPct = itemMaxCampaignPct(next);
  const minimum = itemMinPrice(next);
  const table = safeNumber(next.tablePrice, 0);
  const limitedPct = Math.min(Math.max(pct, 0), maxPct);

  next.overridePrice = null;
  next.campaignPct = null;

  if (!table || !limitedPct) {
    return { item: next, limitedPct: 0, wasLimited: pct > 0 && maxPct <= 0 };
  }

  if (pct >= maxPct || table * (1 - limitedPct / 100) <= minimum + 0.01) {
    next.overridePrice = minimum;
    next.campaignPct = discountPctFromUnitPrice(table, minimum) || null;
    return { item: next, limitedPct: next.campaignPct || maxPct, wasLimited: pct > maxPct };
  }

  next.campaignPct = limitedPct;
  return { item: next, limitedPct, wasLimited: pct > maxPct };
}

export function applyManualUnitPrice(item, requestedUnitPrice) {
  const next = { ...item };
  const minimum = itemMinPrice(next);
  const table = safeNumber(next.tablePrice, 0);
  const requested = roundMoney(Math.max(0, safeNumber(requestedUnitPrice, 0)));
  const clamped = roundMoney(Math.max(minimum, requested));

  next.overridePrice = clamped;
  next.campaignPct = discountPctFromUnitPrice(table, clamped) || null;
  return { item: next, clamped };
}

export function itemEffectiveUnitPrice(item) {
  if (item.overridePrice != null) return safeNumber(item.overridePrice, item.tablePrice);
  if (item.campaignPct != null) {
    return roundMoney(safeNumber(item.tablePrice, 0) * (1 - safeNumber(item.campaignPct, 0) / 100));
  }
  return safeNumber(item.tablePrice, 0);
}

export function itemLineTotals(item) {
  const qty = Math.max(1, Math.round(safeNumber(item.qty, 1)));
  const tableTotal = roundMoney(safeNumber(item.tablePrice, 0) * qty);
  const effectiveTotal = roundMoney(itemEffectiveUnitPrice(item) * qty);
  return { tableTotal, effectiveTotal };
}
