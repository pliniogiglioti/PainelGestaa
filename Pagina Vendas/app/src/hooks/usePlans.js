import { useEffect, useMemo, useState } from "react";
import { FLAT_CATALOG } from "../data/catalog";
import { makeItemFromCatalog, makePlan } from "../domain/planFactory";
import { applyCampaignLimit, applyManualUnitPrice, itemLineTotals } from "../domain/pricing";
import { STORAGE_KEYS } from "../storage/keys";
import { loadJson, saveJson } from "../storage/localStorage";
import { safeNumber } from "../domain/money";

const PLAN_NAMES = ["Plano Diamante", "Plano Ouro", "Plano Prata"];

function hydratePlans(rawPlans = []) {
  if (!Array.isArray(rawPlans) || !rawPlans.length) {
    return [makePlan(PLAN_NAMES[0])];
  }

  return rawPlans.map((plan, index) => ({
    id: plan.id || makePlan().id,
    name: plan.name || PLAN_NAMES[index] || "Plano",
    items: Array.isArray(plan.items)
      ? plan.items.map((item) => ({
          ...item,
          qty: Math.max(1, Math.round(safeNumber(item.qty, 1))),
          campaignPct: item.campaignPct == null ? null : safeNumber(item.campaignPct, 0),
          overridePrice: item.overridePrice == null ? null : safeNumber(item.overridePrice, 0)
        }))
      : []
  }));
}

export function usePlans() {
  const [plans, setPlans] = useState(() => {
    const saved = loadJson(STORAGE_KEYS.SESSION, null);
    return hydratePlans(saved?.plans);
  });
  const [activePlanId, setActivePlanId] = useState(() => {
    const saved = loadJson(STORAGE_KEYS.SESSION, null);
    const hydrated = hydratePlans(saved?.plans);
    return saved?.activePlanId || hydrated[0].id;
  });

  useEffect(() => {
    saveJson(STORAGE_KEYS.SESSION, { plans, activePlanId });
  }, [plans, activePlanId]);

  const activePlan = useMemo(() => {
    return plans.find((plan) => plan.id === activePlanId) || plans[0];
  }, [plans, activePlanId]);

  function addPlan() {
    setPlans((prev) => {
      if (prev.length >= 3) return prev;
      const nextPlan = makePlan(PLAN_NAMES[prev.length] || `Plano ${prev.length + 1}`);
      setActivePlanId(nextPlan.id);
      return [...prev, nextPlan];
    });
  }

  function removePlan(planId) {
    setPlans((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((plan) => plan.id !== planId);
      if (!next.find((plan) => plan.id === activePlanId)) {
        setActivePlanId(next[0].id);
      }
      return next;
    });
  }

  function renamePlan(planId, name) {
    setPlans((prev) => prev.map((plan) => (plan.id === planId ? { ...plan, name } : plan)));
  }

  function addItem(planId, procName) {
    const proc = FLAT_CATALOG.find((row) => row.name === procName);
    if (!proc) return;

    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;
        const exists = plan.items.some((item) => item.name === proc.name);
        if (exists) return plan;
        return { ...plan, items: [...plan.items, makeItemFromCatalog(proc)] };
      })
    );
  }

  function removeItem(planId, itemId) {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;
        return { ...plan, items: plan.items.filter((item) => item.id !== itemId) };
      })
    );
  }

  function changeQty(planId, itemId, delta) {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;
        return {
          ...plan,
          items: plan.items.map((item) =>
            item.id === itemId
              ? { ...item, qty: Math.max(1, Math.round(safeNumber(item.qty, 1) + delta)) }
              : item
          )
        };
      })
    );
  }

  function applyCampaign(planId, itemId, requestedPct) {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;
        return {
          ...plan,
          items: plan.items.map((item) => {
            if (item.id !== itemId) return item;
            return applyCampaignLimit(item, requestedPct).item;
          })
        };
      })
    );
  }

  function applyUnitPrice(planId, itemId, requestedUnitPrice) {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;
        return {
          ...plan,
          items: plan.items.map((item) => {
            if (item.id !== itemId) return item;
            return applyManualUnitPrice(item, requestedUnitPrice).item;
          })
        };
      })
    );
  }

  function clearDiscount(planId, itemId) {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== planId) return plan;
        return {
          ...plan,
          items: plan.items.map((item) =>
            item.id === itemId ? { ...item, campaignPct: null, overridePrice: null } : item
          )
        };
      })
    );
  }

  function planTotals(plan) {
    return plan.items.reduce(
      (acc, item) => {
        const { tableTotal, effectiveTotal } = itemLineTotals(item);
        acc.table += tableTotal;
        acc.effective += effectiveTotal;
        return acc;
      },
      { table: 0, effective: 0 }
    );
  }

  return {
    plans,
    activePlanId,
    activePlan,
    setActivePlanId,
    addPlan,
    removePlan,
    renamePlan,
    addItem,
    removeItem,
    changeQty,
    applyCampaign,
    applyUnitPrice,
    clearDiscount,
    planTotals
  };
}
