import { useRef, useState } from 'react';
import type { Plan, PlanItem, OwnerSettings } from './types';
import {
  fmt, planTableTotal, planEffectiveTotal, planHasCampaign,
  itemMinPrice, itemMaxCampaignPct,
  uid, safeNumber, roundMoney, discountPctFromUnitPrice,
  planMinimumCashTotal, ownerBaseSourcePrice, annualizedNarrativeValue, roundNarrativePrice,
  procedurePolicy,
} from './calcEngine';
import { CATALOG } from './catalog';
import { PaymentSection } from './PaymentSection';
import styles from './Vendas.module.css';

interface PlanCardProps {
  plan: Plan;
  planIndex: number;
  plansCount: number;
  ownerSettings: OwnerSettings;
  onChange: (p: Plan) => void;
  onRemove: () => void;
  onNotify: (msg: string, kind?: 'info' | 'danger') => void;
  badgeLabel?: string;
  badgeClass?: string;
}

function applyItemCampaignLimitFn(item: PlanItem, requestedPct: number, settings: OwnerSettings): PlanItem {
  const pct = safeNumber(requestedPct, 0);
  const maxPct = itemMaxCampaignPct(item, settings);
  const minPrice = itemMinPrice(item, settings);
  const tablePrice = safeNumber(item.tablePrice, 0);
  const limitedPct = Math.min(Math.max(pct, 0), maxPct);
  const next = { ...item, overridePrice: null as number | null, campaignPct: null as number | null };
  if (!tablePrice || !limitedPct) return next;
  if (pct >= maxPct || tablePrice * (1 - limitedPct / 100) <= minPrice + 0.01) {
    next.overridePrice = minPrice;
    next.campaignPct = discountPctFromUnitPrice(tablePrice, minPrice) || null;
    return next;
  }
  next.campaignPct = limitedPct;
  return next;
}

function sortItems(items: PlanItem[]): PlanItem[] {
  return [...items].sort((a, b) => {
    const va = (a.overridePrice ?? a.tablePrice * (1 - (a.campaignPct ?? 0) / 100)) * (a.qty || 1);
    const vb = (b.overridePrice ?? b.tablePrice * (1 - (b.campaignPct ?? 0) / 100)) * (b.qty || 1);
    return vb - va;
  });
}

export function PlanCard({ plan, planIndex, plansCount, ownerSettings, onChange, onRemove, onNotify, badgeLabel, badgeClass }: PlanCardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [totalEditing, setTotalEditing] = useState(false);
  const [totalEditInput, setTotalEditInput] = useState(0);
  const totalInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  function update(fn: (p: Plan) => void) {
    const next = JSON.parse(JSON.stringify(plan)) as Plan;
    fn(next);
    onChange(next);
  }

  function addItem(catalogItem: { name: string; tablePrice: number }) {
    const basePrice = ownerBaseSourcePrice(catalogItem.name, ownerSettings);
    const proc = procedurePolicy(catalogItem.name, ownerSettings);
    const workingPrice = proc?.narrativePriceOverride
      ? roundMoney(proc.narrativePriceOverride)
      : ownerSettings.pricingPolicy.narrativeEnabled
        ? roundNarrativePrice(annualizedNarrativeValue(basePrice, ownerSettings, catalogItem.name), ownerSettings)
        : roundMoney(basePrice);
    update(p => {
      p.items.push({ id: uid(), name: catalogItem.name, tablePrice: workingPrice, baseTablePrice: basePrice, qty: 1, priceVisible: false, campaignPct: null, overridePrice: null, campaignEditing: false, campaignInput: '', priceEditing: false, priceEditInput: '' });
      p.items = sortItems(p.items);
      p.totalOverride = null;
      p.planCampaignPctRequested = 0;
      p.planCampaignPctEffective = 0;
    });
    setSearchQuery('');
    setDropdownOpen(false);
  }

  function removeItem(index: number) {
    update(p => {
      p.items.splice(index, 1);
      p.totalOverride = null;
      p.planCampaignPctRequested = 0;
      p.planCampaignPctEffective = 0;
    });
  }

  function changeQty(index: number, delta: number) {
    update(p => {
      if (delta < 0 && p.items[index].qty <= 1) return;
      p.items[index].qty += delta;
      p.items = sortItems(p.items);
      p.planCampaignPctRequested = 0;
      p.planCampaignPctEffective = 0;
    });
  }

  function applyMaxCampaign(index: number) {
    update(p => {
      const item = p.items[index];
      const maxPct = itemMaxCampaignPct(item, ownerSettings);
      if (maxPct <= 0) { onNotify(`${item.name} já está no preço mínimo.`, 'info'); return; }
      const updated = applyItemCampaignLimitFn(item, maxPct, ownerSettings);
      p.items[index] = { ...updated, priceVisible: true, campaignEditing: false, campaignInput: '' };
      p.items = sortItems(p.items);
      p.totalOverride = null;
      p.planCampaignPctRequested = 0;
      p.planCampaignPctEffective = 0;
    });
    onNotify(`${plan.items[index].name} levado ao preço mínimo.`, 'info');
  }

  function applyCampaignInput(index: number) {
    update(p => {
      const item = p.items[index];
      const pct = parseFloat(item.campaignInput);
      if (isNaN(pct)) { p.items[index].campaignEditing = false; p.items[index].campaignInput = ''; return; }
      const proc = procedurePolicy(item.name, ownerSettings);
      if (!proc.campaignEnabled) {
        onNotify(`${item.name} não aceita campanha.`, 'danger');
        p.items[index].campaignEditing = false; p.items[index].campaignInput = '';
        return;
      }
      const result = applyItemCampaignLimitFn(item, pct, ownerSettings);
      p.items[index] = { ...result, priceVisible: true, campaignEditing: false, campaignInput: '' };
      p.items = sortItems(p.items);
      p.totalOverride = null;
      p.planCampaignPctRequested = 0;
      p.planCampaignPctEffective = 0;
    });
  }

  function applyPriceEdit(index: number) {
    update(p => {
      const item = p.items[index];
      const val = parseFloat(item.priceEditInput);
      const qty = item.qty || 1;
      if (!isNaN(val) && val > 0) {
        const minUnit = itemMinPrice(item, ownerSettings);
        const minTotal = minUnit * qty;
        const adjustedValue = Math.max(val, minTotal);
        if (val < minTotal) onNotify(`${item.name} ajustado ao preço mínimo.`, 'info');
        const unitPrice = adjustedValue / qty;
        const pct = (1 - unitPrice / item.tablePrice) * 100;
        if (pct > 0.01 && pct < 100) {
          p.items[index].overridePrice = unitPrice;
          p.items[index].campaignPct = Math.round(pct * 10) / 10;
        } else {
          p.items[index].overridePrice = null;
          p.items[index].campaignPct = null;
        }
        p.totalOverride = null;
        p.planCampaignPctRequested = 0;
        p.planCampaignPctEffective = 0;
        p.items = sortItems(p.items);
      }
      p.items[index].priceEditing = false;
      p.items[index].priceEditInput = '';
    });
  }

  function startTotalEdit() {
    setTotalEditInput(Math.round(planEffectiveTotal(plan)));
    setTotalEditing(true);
    setTimeout(() => totalInputRef.current?.select(), 50);
  }

  function applyTotalEdit() {
    const val = parseFloat(String(totalEditInput));
    if (!isNaN(val) && val > 0) {
      const tableTotal = planTableTotal(plan.items);
      const minAllowed = planMinimumCashTotal(plan.items, ownerSettings);
      if (val < minAllowed) {
        onNotify('Total abaixo do mínimo protegido pelo dono.', 'danger');
        setTotalEditing(false);
        return;
      }
      update(p => {
        if (val >= tableTotal) {
          p.totalOverride = null;
          p.extraDiscountPct = 0;
          p.planCampaignPctRequested = 0;
          p.planCampaignPctEffective = 0;
        } else {
          p.totalOverride = val;
          p.planCampaignPctRequested = 0;
          p.planCampaignPctEffective = 0;
        }
        p.payment.parceladoOverride = null;
        p.payment.boletoOverride = null;
        p.payment.aVistaOverride = null;
        p.payment.entradaOverride = null;
      });
    }
    setTotalEditing(false);
  }

  const eff = planEffectiveTotal(plan);
  const tableTotal = planTableTotal(plan.items);
  const hasCampaign = planHasCampaign(plan);
  const defaultBadges = ['A', 'B', 'C'];
  const resolvedBadgeLabel = badgeLabel ?? defaultBadges[planIndex] ?? String.fromCharCode(65 + planIndex);
  const resolvedBadgeClass = badgeClass ?? styles[`badge${defaultBadges[planIndex] || 'A'}`];

  function filteredCatalog() {
    const q = searchQuery.toLowerCase().trim();
    return CATALOG
      .map(cat => ({ name: cat.name, items: cat.items.filter(i => !q || i.name.toLowerCase().includes(q)) }))
      .filter(cat => cat.items.length > 0);
  }

  function handleRevealTotal() {
    update(p => { p.totalVisible = true; p.totalRevealed = true; });
  }
  function handleRevealPayment() {
    update(p => { p.paymentVisible = true; p.paymentRevealed = true; });
  }

  return (
    <div className={`${styles.planCol} ${plan.items.length > 0 ? styles.hasItems : ''}`}
      data-plan-id={plan.id}>

      {/* Plan header */}
      <div className={styles.planHeader}>
        <span className={`${styles.planBadge} ${resolvedBadgeClass}`}>
          {resolvedBadgeLabel}
        </span>
        <input className={styles.planNameInput} value={plan.name}
          onChange={e => update(p => { p.name = e.target.value; })} />
      </div>

      {/* Items list */}
      <div className={styles.itemsList}>
        {plan.items.map((item, idx) => {
          const effectivePrice = item.overridePrice !== null ? item.overridePrice
            : item.campaignPct !== null ? item.tablePrice * (1 - item.campaignPct / 100)
            : item.tablePrice;
          const totalForItem = effectivePrice * (item.qty || 1);
          const hasDiscount = (item.campaignPct !== null && item.campaignPct > 0) || item.overridePrice !== null;

          return (
            <div key={item.id} className={`${styles.itemRow} ${hasDiscount ? styles.hasDiscount : ''}`}>
              <div className={styles.itemBody}>
                <div className={styles.itemName}>{item.name}</div>
                <div className={styles.itemControls}>
                  <button className={styles.qtyBtn} onClick={() => changeQty(idx, -1)}>−</button>
                  <span className={styles.qtyVal}>{item.qty}</span>
                  <button className={styles.qtyBtn} onClick={() => changeQty(idx, 1)}>+</button>
                  <button className={`${styles.campaignBtn} ${hasDiscount ? styles.active : ''}`}
                    onClick={() => {
                      if (!item.priceVisible) { update(p => { p.items[idx].priceVisible = true; }); }
                      else if (!item.campaignEditing) {
                        update(p => { p.items[idx].campaignEditing = true; p.items[idx].campaignInput = item.campaignPct !== null ? String(item.campaignPct) : ''; });
                      } else {
                        update(p => { p.items[idx].campaignEditing = false; p.items[idx].campaignInput = ''; });
                      }
                    }}>
                    {hasDiscount ? `${item.campaignPct ?? 0}%` : '›'}
                  </button>
                </div>
                {item.campaignEditing && (
                  <div className={styles.campaignEditor}>
                    <input className={styles.campaignInput} type="number" min="0" max="80"
                      id={`cinp-${item.id}`}
                      value={item.campaignInput}
                      onChange={e => update(p => { p.items[idx].campaignInput = e.target.value; })}
                      onKeyDown={e => { if (e.key === 'Enter') applyCampaignInput(idx); if (e.key === 'Escape') update(p => { p.items[idx].campaignEditing = false; p.items[idx].campaignInput = ''; }); }}
                      placeholder="%" autoFocus />
                    <button onClick={() => applyCampaignInput(idx)}>✓</button>
                    <button onClick={() => applyMaxCampaign(idx)} title={`Ir ao mínimo: ${fmt(itemMinPrice(item, ownerSettings) * (item.qty || 1))}`}>min</button>
                    {hasDiscount && <button onClick={() => update(p => { p.items[idx].overridePrice = null; p.items[idx].campaignPct = null; p.items[idx].campaignEditing = false; p.items[idx].campaignInput = ''; p.totalOverride = null; })}>×</button>}
                  </div>
                )}
              </div>
              <div className={styles.itemPriceArea}>
                {hasDiscount && item.priceVisible && <span className={styles.itemPriceOrig}>{fmt(item.tablePrice * (item.qty || 1))}</span>}
                {item.priceEditing ? (
                  <span className={styles.priceEditWrap}>
                    <input className={styles.priceEditInput} type="number" min="0"
                      id={`pedit-${item.id}`}
                      value={item.priceEditInput}
                      onChange={e => update(p => { p.items[idx].priceEditInput = e.target.value; })}
                      onKeyDown={e => { if (e.key === 'Enter') applyPriceEdit(idx); if (e.key === 'Escape') update(p => { p.items[idx].priceEditing = false; p.items[idx].priceEditInput = ''; }); }} />
                    <button className={styles.priceEditOk} onClick={() => applyPriceEdit(idx)}>✓</button>
                  </span>
                ) : (
                  <span className={`${styles.itemPrice} ${hasDiscount ? styles.discounted : ''} ${item.priceVisible ? '' : styles.hidden}`}
                    onClick={() => {
                      if (!item.priceVisible) { update(p => { p.items[idx].priceVisible = true; }); return; }
                      update(p => { p.items[idx].priceEditInput = String(Math.round(totalForItem)); p.items[idx].priceEditing = true; });
                    }}>
                    {fmt(totalForItem)}
                  </span>
                )}
                <button className={styles.removeItemBtn} onClick={() => removeItem(idx)}>×</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Item search / add */}
      <div className={styles.itemSearch}>
        <input className={styles.searchInput} ref={searchInputRef}
          placeholder="Adicionar tratamento..."
          value={searchQuery}
          onFocus={() => setDropdownOpen(true)}
          onChange={e => { setSearchQuery(e.target.value); setDropdownOpen(true); }} />
        {dropdownOpen && (
          <div className={styles.catalogDropdown}>
            {filteredCatalog().map(cat => (
              <div key={cat.name}>
                <div className={styles.catalogCategory}>{cat.name}</div>
                {cat.items.map(item => (
                  <button key={item.name} className={`${styles.catalogItem} ${plan.items.some(i => i.name === item.name) ? styles.catalogItemAdded : ''}`}
                    onClick={() => { if (!plan.items.some(i => i.name === item.name)) addItem(item); }}>
                    <span>{item.name}</span>
                    <span className={styles.catalogItemPrice}>{fmt(item.tablePrice)}</span>
                  </button>
                ))}
              </div>
            ))}
            {filteredCatalog().length === 0 && <div className={styles.catalogEmpty}>Nenhum resultado</div>}
          </div>
        )}
      </div>
      {dropdownOpen && <div className={styles.dropdownBackdrop} onClick={() => setDropdownOpen(false)} />}

      {/* Total area */}
      {plan.items.length > 0 && (
        <div className={styles.totalArea}>
          {hasCampaign && <span className={styles.totalOrig}>{fmt(tableTotal)}</span>}
          {totalEditing ? (
            <span className={styles.priceEditWrap}>
              <input ref={totalInputRef} className={styles.priceEditInput} type="number" min="0"
                id={`total-edit-${plan.id}`}
                value={totalEditInput}
                onChange={e => setTotalEditInput(parseFloat(e.target.value) || 0)}
                onKeyDown={e => { if (e.key === 'Enter') applyTotalEdit(); if (e.key === 'Escape') setTotalEditing(false); }} />
              <button className={styles.priceEditOk} onClick={applyTotalEdit}>✓</button>
            </span>
          ) : (
            <span className={`${styles.totalValue} ${plan.totalVisible ? '' : styles.hidden}`}
              onClick={() => { if (!plan.totalVisible) handleRevealTotal(); else startTotalEdit(); }}>
              {plan.totalVisible ? fmt(eff) : '● ● ●'}
            </span>
          )}
        </div>
      )}

      {/* Narrative progress / action buttons */}
      {plan.items.length > 0 && (
        <div className={styles.narrativeActions}>
          {!plan.totalRevealed && (
            <button className={styles.narrativeBtn} onClick={handleRevealTotal}>Revelar Total</button>
          )}
          {plan.totalRevealed && !plan.paymentRevealed && (
            <button className={styles.narrativeBtn} onClick={() => update(p => { p.paymentRevealed = true; })}>Abrir Pagamento</button>
          )}
        </div>
      )}

      {/* Payment section */}
      {plan.paymentRevealed && (
        <PaymentSection plan={plan} ownerSettings={ownerSettings} onChange={onChange} onNotify={onNotify} />
      )}

      {/* Payment reveal */}
      {plan.paymentRevealed && plan.paymentVisible && (
        <button className={`${styles.narrativeBtn} ${styles.revealPaymentBtn}`}
          onClick={handleRevealPayment}>
          Revelar Pagamento
        </button>
      )}

      {/* Remove plan */}
      {plansCount > 1 && (
        <button className={styles.removePlanBtn} onClick={onRemove}>Remover este plano</button>
      )}
    </div>
  );
}
