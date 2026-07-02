import { useRef, useState, useEffect } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Plan, PlanItem, OwnerSettings } from './types';
import {
  fmt, planTableTotal, planEffectiveTotal, planHasCampaign,
  itemMinPrice, itemMaxCampaignPct,
  uid, safeNumber, roundMoney, discountPctFromUnitPrice,
  planMinimumCashTotal, ownerBaseSourcePrice, annualizedNarrativeValue, roundNarrativePrice,
  procedurePolicy,
} from './calcEngine';
import { PaymentSection } from './PaymentSection';
import { InfoTip } from './InfoTip';
import styles from './Vendas.module.css';

interface SaleCatalogItem {
  id: string;
  name: string;
  category: string;
  tablePrice: number;
}

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
  isWinner?: boolean;
  isLoser?: boolean;
  onToggleWinner?: () => void;
  isDragging?: boolean;
  dragStyle?: CSSProperties;
  onCardPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onActivate?: () => void;
  focusClass?: string;
  catalogItems: SaleCatalogItem[];
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

export function PlanCard({ plan, planIndex, plansCount, ownerSettings, onChange, onRemove, onNotify, badgeLabel, badgeClass, isWinner, isLoser, onToggleWinner, isDragging, dragStyle, onCardPointerDown, onActivate, focusClass, catalogItems }: PlanCardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const [totalEditing, setTotalEditing] = useState(false);
  const [totalEditInput, setTotalEditInput] = useState(0);
  const totalInputRef = useRef<HTMLInputElement>(null);
  const itemPriceInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemSearchRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dropdownOpen && itemSearchRef.current) {
      setDropdownRect(itemSearchRef.current.getBoundingClientRect());
    }
  }, [dropdownOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (itemSearchRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      closeDropdown();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDropdown();
    }

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  function update(fn: (p: Plan) => void) {
    const next = JSON.parse(JSON.stringify(plan)) as Plan;
    fn(next);
    onChange(next);
  }

  function closeDropdown() {
    setDropdownOpen(false);
    setSearchQuery('');
  }

  function addItem(catalogItem: SaleCatalogItem) {
    const proc = procedurePolicy(catalogItem.name, ownerSettings);
    const basePrice = proc ? ownerBaseSourcePrice(catalogItem.name, ownerSettings) : catalogItem.tablePrice;
    const workingPrice = proc?.narrativePriceOverride
      ? roundMoney(proc.narrativePriceOverride)
      : ownerSettings.pricingPolicy.narrativeEnabled
        ? roundNarrativePrice(annualizedNarrativeValue(basePrice, ownerSettings, catalogItem.name), ownerSettings)
        : roundMoney(basePrice);
    update(p => {
      p.items.push({ id: uid(), empresaPrecoId: catalogItem.id, name: catalogItem.name, tablePrice: workingPrice, baseTablePrice: basePrice, qty: 1, priceVisible: true, campaignPct: null, overridePrice: null, campaignEditing: false, campaignInput: '', priceEditing: false, priceEditInput: '' });
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
      if (p.items.length === 0) {
        p.totalRevealed = false;
        p.totalVisible = false;
        p.paymentRevealed = false;
        p.paymentVisible = false;
        p.cartaNaMangaActive = false;
        p.extraDiscountPct = 0;
        p.shownPayments = [];
        p.payment.entradaPct = 0;
        p.payment.parcelas = 0;
        p.payment.descontoAVista = 0;
        p.payment.parcelasBoleto = 0;
        p.payment.entradaOverride = null;
        p.payment.aVistaOverride = null;
        p.payment.parceladoOverride = null;
        p.payment.boletoOverride = null;
        p.payment.debitoOverride = null;
        p.payment.editingField = null;
      }
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
        const pct = item.tablePrice > 0 ? (1 - unitPrice / item.tablePrice) * 100 : 0;
        if (Math.abs(unitPrice - item.tablePrice) < 0.01) {
          p.items[index].overridePrice = null;
          p.items[index].campaignPct = null;
        } else {
          p.items[index].overridePrice = unitPrice;
          p.items[index].campaignPct = pct > 0.01 && pct < 100
            ? Math.round(pct * 10) / 10
            : null;
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
        if (Math.abs(val - tableTotal) < 0.01) {
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
    const grouped = catalogItems.reduce<Record<string, SaleCatalogItem[]>>((acc, item) => {
      const key = item.category || 'Produtos';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([name, items]) => ({ name, items: items.filter(i => !q || i.name.toLowerCase().includes(q)) }))
      .filter(cat => cat.items.length > 0);
  }

  return (
    <div className={`${styles.planCol} ${focusClass || ''} ${plan.items.length > 0 ? styles.hasItems : ''} ${isWinner ? styles.planWinner : ''} ${isLoser ? styles.planLoser : ''} ${isDragging ? styles.isDragging : ''}`}
      data-plan-id={plan.id}
      style={dragStyle}
      onPointerDown={onCardPointerDown}
      onFocus={onActivate}
      onClick={onActivate}>

      {/* Plan header */}
      <div className={styles.planHeader}>
        <input className={styles.planNameInput} value={plan.name}
          onChange={e => update(p => { p.name = e.target.value; })} />
        {plansCount > 1 && <span className={styles.planChosenLabel}>Escolhido</span>}
        <span className={`${styles.planBadge} ${resolvedBadgeClass} ${plansCount > 1 ? styles.badgeSelectable : ''} ${isWinner ? styles.badgeWinner : ''}`}
          data-no-drag
          onClick={plansCount > 1 ? onToggleWinner : undefined}
          title={plansCount > 1 ? (isWinner ? 'Clique para desfazer a escolha' : 'Clique para marcar este plano como escolhido') : undefined}>
          {resolvedBadgeLabel}
        </span>
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
                <span className={styles.itemName}>{item.name}</span>
                <div className={`${styles.itemControls} ${(item.qty > 1) ? styles.qtyActive : ''}`}>
                  <button className={styles.qtyBtn} onClick={() => changeQty(idx, -1)}>−</button>
                  <span className={styles.qtyVal}>{item.qty}</span>
                  <button className={styles.qtyBtn} onClick={() => changeQty(idx, 1)}>+</button>
                </div>
                <div className={styles.itemPriceArea}>
                  {hasDiscount && item.priceVisible && <span className={styles.itemPriceOrig}>{fmt(item.tablePrice * (item.qty || 1))}</span>}
                  {item.priceEditing ? (
                    <span className={styles.priceEditWrap}>
                      <input ref={itemPriceInputRef} className={styles.priceEditInput} type="number" min="0" step="0.01" autoFocus
                        id={`pedit-${item.id}`}
                        value={item.priceEditInput}
                        onChange={e => update(p => { p.items[idx].priceEditInput = e.target.value; })}
                        onKeyDown={e => { if (e.key === 'Enter') applyPriceEdit(idx); if (e.key === 'Escape') update(p => { p.items[idx].priceEditing = false; p.items[idx].priceEditInput = ''; }); }} />
                      <button className={styles.priceEditOk} onClick={() => applyPriceEdit(idx)}>✓</button>
                    </span>
                  ) : (
                    <span data-no-drag className={`${styles.itemPrice} ${hasDiscount ? styles.discounted : ''}`}
                      onClick={() => {
                        update(p => { p.items[idx].priceEditInput = String(roundMoney(totalForItem)); p.items[idx].priceEditing = true; });
                        setTimeout(() => itemPriceInputRef.current?.select(), 50);
                      }}>
                      {fmt(totalForItem)}
                    </span>
                  )}
                </div>
                <button
                  className={`${styles.itemChevron} ${hasDiscount ? styles.hasDiscount : ''}`}
                  onClick={() => {
                    if (!item.priceVisible) { update(p => { p.items[idx].priceVisible = true; }); }
                    else if (!item.campaignEditing) {
                      update(p => { p.items[idx].campaignEditing = true; p.items[idx].campaignInput = item.campaignPct !== null ? String(item.campaignPct) : ''; });
                    } else {
                      update(p => { p.items[idx].campaignEditing = false; p.items[idx].campaignInput = ''; });
                    }
                  }}>›</button>
                <button className={styles.removeItemBtn} onClick={() => removeItem(idx)}>×</button>
              </div>
              {item.campaignEditing && (
                <div className={styles.campaignEditor}>
                  <span className={styles.campaignEditorLabel}>Camp.</span>
                  <input className={styles.campaignInput} type="number" min="1" max="99"
                    id={`cinp-${item.id}`}
                    value={item.campaignInput}
                    onChange={e => update(p => { p.items[idx].campaignInput = e.target.value; })}
                    onKeyDown={e => { if (e.key === 'Enter') applyCampaignInput(idx); if (e.key === 'Escape') update(p => { p.items[idx].campaignEditing = false; p.items[idx].campaignInput = ''; }); }}
                    placeholder="0" autoFocus />
                  <span className={styles.campaignEditorPct}>%</span>
                  <button className={styles.campaignEditorApply} onClick={() => applyCampaignInput(idx)}>Aplicar</button>
                  {itemMaxCampaignPct(item, ownerSettings) > 0 && (
                    <button className={styles.campaignEditorMax} onClick={() => applyMaxCampaign(idx)} title={`Ir ao mínimo: ${fmt(itemMinPrice(item, ownerSettings) * (item.qty || 1))}`}>Máx.</button>
                  )}
                  <button className={styles.campaignEditorCancel} onClick={() => update(p => { p.items[idx].campaignEditing = false; p.items[idx].campaignInput = ''; })}>Fechar</button>
                  {hasDiscount && <button className={styles.campaignEditorRemove} onClick={() => update(p => { p.items[idx].overridePrice = null; p.items[idx].campaignPct = null; p.items[idx].campaignEditing = false; p.items[idx].campaignInput = ''; p.totalOverride = null; })}>Remover</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Item search / add */}
      <div className={styles.itemSearch} ref={itemSearchRef}>
        <input className={styles.searchInput} ref={searchInputRef}
          placeholder="+ Adicionar tratamento"
          value={searchQuery}
          onFocus={() => setDropdownOpen(true)}
          onChange={e => { setSearchQuery(e.target.value); setDropdownOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeDropdown();
              searchInputRef.current?.blur();
            }
          }} />
      </div>

      {dropdownOpen && createPortal(
        <>
          <div className={styles.dropdownBackdrop} onClick={closeDropdown} />
          <div
            ref={dropdownRef}
            className={styles.catalogDropdown}
            style={dropdownRect ? {
              position: 'fixed',
              top: dropdownRect.bottom + 6,
              left: dropdownRect.left,
              width: dropdownRect.width,
            } : undefined}
          >
            {filteredCatalog().map(cat => (
              <div key={cat.name}>
                <div className={styles.catalogCategory}>{cat.name}</div>
                {cat.items.map(item => (
                  <button key={item.id} className={`${styles.catalogItem} ${plan.items.some(i => i.empresaPrecoId === item.id) ? styles.catalogItemAdded : ''}`}
                    onClick={() => { if (!plan.items.some(i => i.empresaPrecoId === item.id)) { addItem(item); setDropdownOpen(false); setSearchQuery(''); } }}>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {filteredCatalog().length === 0 && <div className={styles.catalogEmpty}>Nenhum resultado</div>}
          </div>
        </>,
        document.body
      )}

      {/* Total area */}
      {plan.totalRevealed && plan.items.length > 0 && (
        <div className={styles.totalArea}>
          <hr className={styles.sectionDivider} />
          <div className={`${styles.totalRow} ${plan.totalVisible ? styles.valRevealed : styles.valHidden}`}>
            <span className={styles.totalLabel}>
              Total <InfoTip text="Clique no valor para ajustar o total da proposta. O sistema não deixa passar do mínimo protegido pelo dono." />
            </span>
            <div className={`${styles.totalValueWrap} ${plan.totalVisible ? styles.valRevealed : styles.valHidden}`}>
              {hasCampaign && <span className={styles.totalOrig}>{fmt(tableTotal)}</span>}
              {totalEditing ? (
                <span className={styles.priceEditWrap}>
                  <input ref={totalInputRef} className={styles.priceEditInput} type="number" min="0" step="0.01"
                    id={`total-edit-${plan.id}`}
                    value={totalEditInput > 0 ? totalEditInput : ''}
                    placeholder="0"
                    onChange={e => setTotalEditInput(parseFloat(e.target.value) || 0)}
                    onKeyDown={e => { if (e.key === 'Enter') applyTotalEdit(); if (e.key === 'Escape') setTotalEditing(false); }} />
                  <button className={styles.priceEditOk} onClick={applyTotalEdit}>✓</button>
                </span>
              ) : (
                <span data-no-drag className={styles.totalValue}
                  onClick={() => { if (plan.totalVisible) startTotalEdit(); }}>
                  {fmt(eff)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment section */}
      {plan.paymentRevealed && plan.items.length > 0 && (
        <PaymentSection plan={plan} ownerSettings={ownerSettings} onChange={onChange} onNotify={onNotify} />
      )}

      {/* Remove plan */}
      {plansCount > 1 && (
        <button className={styles.removePlanBtn} onClick={onRemove}>Remover este plano</button>
      )}
    </div>
  );
}
