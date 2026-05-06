import { useMemo, useState } from "react";
import { formatBRL } from "../domain/money";
import { itemLineTotals, itemMaxCampaignPct } from "../domain/pricing";
import TreatmentPicker from "./TreatmentPicker";

function ItemRow({
  item,
  onChangeQty,
  onRemove,
  onApplyCampaign,
  onApplyPrice,
  onClearDiscount
}) {
  const [campaignInput, setCampaignInput] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const maxCampaign = useMemo(() => itemMaxCampaignPct(item), [item]);
  const { tableTotal, effectiveTotal } = itemLineTotals(item);

  return (
    <div className="item-row">
      <div className="item-main">
        <div className="item-name">{item.name}</div>
        <div className="item-qty">
          <button type="button" onClick={() => onChangeQty(-1)}>
            -
          </button>
          <span>{item.qty}</span>
          <button type="button" onClick={() => onChangeQty(1)}>
            +
          </button>
        </div>
      </div>
      <div className="item-price-line">
        <span className="item-price">{formatBRL(effectiveTotal)}</span>
        {effectiveTotal !== tableTotal && <span className="item-price-orig">{formatBRL(tableTotal)}</span>}
      </div>
      <div className="item-tools">
        <input
          type="number"
          min="0"
          placeholder="%"
          value={campaignInput}
          onChange={(event) => setCampaignInput(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            onApplyCampaign(campaignInput);
            setCampaignInput("");
          }}
        >
          Camp
        </button>
        <button
          type="button"
          onClick={() => {
            onApplyCampaign(maxCampaign);
            setCampaignInput("");
          }}
        >
          Max
        </button>
        <input
          type="number"
          min="0"
          placeholder="R$ un."
          value={priceInput}
          onChange={(event) => setPriceInput(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            onApplyPrice(priceInput);
            setPriceInput("");
          }}
        >
          Valor
        </button>
        <button type="button" onClick={onClearDiscount}>
          Limpar
        </button>
        <button type="button" onClick={onRemove}>
          Remover
        </button>
      </div>
    </div>
  );
}

export default function PlanCard({
  plan,
  isActive,
  totals,
  onActivate,
  onRename,
  onRemovePlan,
  onAddItem,
  onRemoveItem,
  onChangeQty,
  onApplyCampaign,
  onApplyPrice,
  onClearDiscount
}) {
  return (
    <section className={`plan-card ${isActive ? "is-active" : ""}`} onMouseDown={onActivate}>
      <div className="plan-head">
        <input
          className="plan-name"
          value={plan.name}
          onChange={(event) => onRename(event.target.value)}
        />
        <button type="button" className="danger" onClick={onRemovePlan}>
          x
        </button>
      </div>

      <div className="plan-items">
        {plan.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onChangeQty={(delta) => onChangeQty(item.id, delta)}
            onRemove={() => onRemoveItem(item.id)}
            onApplyCampaign={(pct) => onApplyCampaign(item.id, pct)}
            onApplyPrice={(value) => onApplyPrice(item.id, value)}
            onClearDiscount={() => onClearDiscount(item.id)}
          />
        ))}
        {!plan.items.length && <p className="empty-copy">Sem procedimentos neste plano.</p>}
      </div>

      <TreatmentPicker onAdd={onAddItem} />

      <div className="plan-total">
        <span>Total</span>
        <div>
          <strong>{formatBRL(totals.effective)}</strong>
          {totals.effective !== totals.table && <small>{formatBRL(totals.table)}</small>}
        </div>
      </div>
    </section>
  );
}
