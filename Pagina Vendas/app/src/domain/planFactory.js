import { safeNumber } from "./money";

function uid() {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function makePlan(name = "Plano") {
  return {
    id: uid(),
    name,
    items: []
  };
}

export function makeItemFromCatalog(proc) {
  return {
    id: uid(),
    name: proc.name,
    category: proc.category,
    tablePrice: safeNumber(proc.tablePrice, 0),
    minPrice: safeNumber(proc.minPrice, proc.tablePrice),
    qty: 1,
    campaignPct: null,
    overridePrice: null
  };
}
