import PlanCard from "./PlanCard";

export default function PlanBoard({
  plans,
  activePlanId,
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
}) {
  return (
    <div className="board-shell">
      <div className="board-head">
        <h2>Mundo do Vendedor - React</h2>
        <button type="button" onClick={addPlan} disabled={plans.length >= 3}>
          + Comparacao
        </button>
      </div>

      <div className="board">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isActive={activePlanId === plan.id}
            totals={planTotals(plan)}
            onActivate={() => setActivePlanId(plan.id)}
            onRename={(name) => renamePlan(plan.id, name)}
            onRemovePlan={() => removePlan(plan.id)}
            onAddItem={(procName) => addItem(plan.id, procName)}
            onRemoveItem={(itemId) => removeItem(plan.id, itemId)}
            onChangeQty={(itemId, delta) => changeQty(plan.id, itemId, delta)}
            onApplyCampaign={(itemId, pct) => applyCampaign(plan.id, itemId, pct)}
            onApplyPrice={(itemId, value) => applyUnitPrice(plan.id, itemId, value)}
            onClearDiscount={(itemId) => clearDiscount(plan.id, itemId)}
          />
        ))}
      </div>
    </div>
  );
}
