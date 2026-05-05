import { useRef } from 'react';
import type { Plan, OwnerSettings, PaymentMethod, IndicatorTone } from './types';
import {
  fmt, planEffectiveTotal, planHasCampaign, paymentDisplayValue,
  boletoTotalWithInterest, cardFeePct, safeNumber,
  resolveIndicatorTag, normalizeIndicatorColor,
  cashNarrativeStatus, planMinimumCashTotal, sanitizeIndicatorRules,
} from './calcEngine';
import styles from './Vendas.module.css';

interface PaymentSectionProps {
  plan: Plan;
  ownerSettings: OwnerSettings;
  onChange: (updated: Plan) => void;
  onNotify: (msg: string, kind?: 'info' | 'danger') => void;
}

type PaymentTone = 'premium' | 'good' | 'warn' | 'limit' | 'neutral';

function getPaymentStatus(field: string, plan: Plan, settings: OwnerSettings) {
  const rules = sanitizeIndicatorRules(settings.ui?.indicatorRules);
  if (field === 'entrada') {
    const pct = Math.max(0, safeNumber(plan.payment.entradaPct, 0));
    const suggested = Math.max(0, safeNumber(settings.paymentPolicy.minEntradaPct, 0));
    const premiumExtra = Math.max(0, safeNumber(rules.entry?.premiumAboveSuggestedPct, 15));
    if (!pct) return { tone: 'neutral' as PaymentTone, label: 'Sugestão inicial' };
    if (pct < suggested) return { tone: 'warn' as PaymentTone, label: 'Entrada abaixo do ideal' };
    if (pct >= suggested + premiumExtra) return { tone: 'premium' as PaymentTone, label: 'Entrada forte' };
    return { tone: 'good' as PaymentTone, label: 'Boa entrada' };
  }
  if (field === 'parcelado') {
    const inst = Math.max(0, Math.round(plan.payment.parcelas || 0));
    const ideal = Math.max(1, Math.round(safeNumber(settings.paymentPolicy.cardIdealInstallments, 12)));
    const max = Math.max(ideal, Math.round(safeNumber(settings.paymentPolicy.maxCardInstallments, ideal)));
    if (!inst) return { tone: 'neutral' as PaymentTone, label: 'Defina o prazo' };
    if (inst <= Math.ceil(ideal * (safeNumber(rules.card?.premiumUpToIdealPct, 60) / 100))) return { tone: 'premium' as PaymentTone, label: 'Parcela saudável' };
    if (inst <= ideal) return { tone: 'good' as PaymentTone, label: 'Boa condição' };
    if (inst < max) return { tone: 'warn' as PaymentTone, label: 'Condição estendida' };
    return { tone: 'limit' as PaymentTone, label: 'Condição no limite' };
  }
  if (field === 'boleto') {
    const inst = Math.max(0, Math.round(plan.payment.parcelasBoleto || 0));
    const ideal = Math.max(1, Math.round(safeNumber(settings.paymentPolicy.boletoIdealInstallments, 12)));
    const max = Math.max(ideal, Math.round(safeNumber(settings.paymentPolicy.maxBoletoInstallments, ideal)));
    if (!inst) return { tone: 'neutral' as PaymentTone, label: 'Defina o prazo' };
    if (inst <= ideal) return { tone: 'good' as PaymentTone, label: 'Boa alternativa' };
    if (inst < max) return { tone: 'warn' as PaymentTone, label: 'Condição diferenciada' };
    return { tone: 'limit' as PaymentTone, label: 'Última condição' };
  }
  if (field === 'avista' || field === 'debito') {
    const val = paymentDisplayValue(plan, field, settings);
    const reference = planEffectiveTotal(plan);
    const floor = planMinimumCashTotal(plan.items, settings);
    const status = cashNarrativeStatus(val, reference, floor, field === 'debito' ? 'no débito' : 'à vista', rules);
    return { tone: status.tone, label: status.label };
  }
  return { tone: 'neutral' as PaymentTone, label: 'Ativo' };
}

function PaymentRow({ plan, field, onChange, onNotify, ownerSettings, revealed }: {
  plan: Plan; field: string; revealed: boolean;
  ownerSettings: OwnerSettings;
  onChange: (p: Plan) => void;
  onNotify: (msg: string, kind?: 'info' | 'danger') => void;
}) {
  const status = getPaymentStatus(field, plan, ownerSettings);
  const value = paymentDisplayValue(plan, field, ownerSettings);

  function updatePlan(fn: (p: Plan) => void) {
    const next = JSON.parse(JSON.stringify(plan)) as Plan;
    fn(next);
    onChange(next);
  }

  function removeMethod() {
    updatePlan(p => {
      p.shownPayments = p.shownPayments.filter(m => m !== field);
      if (field === 'parcelado') { p.payment.parcelas = 0; p.payment.parceladoOverride = null; }
      if (field === 'boleto') { p.payment.parcelasBoleto = 0; p.payment.boletoOverride = null; }
      if (field === 'avista') { p.payment.descontoAVista = 0; p.payment.aVistaOverride = null; }
    });
  }

  const isEditing = plan.payment.editingField === field;
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    updatePlan(p => {
      p.payment.editInput = Math.round(value);
      p.payment.editingField = field;
    });
    setTimeout(() => inputRef.current?.select(), 50);
  }

  function applyEdit() {
    updatePlan(p => {
      const val = parseFloat(String(p.payment.editInput));
      if (!isNaN(val) && val > 0) {
        const eff = planEffectiveTotal(p);
        if (field === 'avista') {
          const minCash = planMinimumCashTotal(p.items, ownerSettings);
          if (val < minCash) { onNotify('Valor abaixo do mínimo protegido.', 'danger'); }
          else {
            p.payment.aVistaOverride = val;
            p.payment.descontoAVista = Math.round(Math.max(0, (1 - val / eff) * 100) * 10) / 10;
          }
        }
        if (field === 'parcelado') {
          const base = p.shownPayments.includes('entrada') ? eff * (1 - (p.payment.entradaPct || 0) / 100) : eff;
          let parcelas = 1;
          for (let c = 1; c <= ownerSettings.paymentPolicy.maxCardInstallments; c++) {
            const total = base * (1 + cardFeePct(c, ownerSettings) / 100);
            if (total / c <= val) { parcelas = c; break; }
            parcelas = c;
          }
          p.payment.parcelas = Math.min(parcelas, ownerSettings.paymentPolicy.maxCardInstallments);
        }
        if (field === 'boleto') {
          const base = p.shownPayments.includes('entrada') ? eff * (1 - (p.payment.entradaPct || 0) / 100) : eff;
          let parcs = 1;
          for (let c = 1; c <= ownerSettings.paymentPolicy.maxBoletoInstallments; c++) {
            const total = boletoTotalWithInterest(base, c, ownerSettings);
            if (total / c <= val) { parcs = c; break; }
            parcs = c;
          }
          p.payment.parcelasBoleto = Math.min(parcs, ownerSettings.paymentPolicy.maxBoletoInstallments);
        }
      }
      p.payment.editingField = null;
    });
  }

  const hasCampaign = planHasCampaign(plan);

  return (
    <div className={`${styles.paymentRow} ${styles[`paymentRow--${status.tone}`] || ''}`}>
      <div className={styles.prowBody}>
        <div className={styles.prowMain}>
          {field === 'entrada' && (
            <>
              <span className={styles.prowLabel}>Entrada</span>
              <input className={styles.prowInlineInput} type="number" min="0" max="100"
                value={plan.payment.entradaPct}
                onChange={e => {
                  const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                  updatePlan(p => { p.payment.entradaPct = v; p.payment.entradaOverride = null; });
                }} />
              <span className={styles.prowLabel}>%</span>
            </>
          )}
          {field === 'parcelado' && (
            <>
              <span className={styles.prowLabel}>Cartão</span>
              <input className={styles.prowInlineInput} type="number" min="0" max={ownerSettings.paymentPolicy.maxCardInstallments}
                value={plan.payment.parcelas}
                onChange={e => {
                  const v = Math.min(ownerSettings.paymentPolicy.maxCardInstallments, Math.max(0, parseInt(e.target.value) || 0));
                  updatePlan(p => { p.payment.parcelas = v; p.payment.parceladoOverride = null; });
                }} />
              <span className={styles.prowLabel}>x</span>
            </>
          )}
          {field === 'debito' && <span className={styles.prowLabel}>Débito</span>}
          {field === 'avista' && (
            <>
              <span className={styles.prowLabel}>À vista</span>
              <input className={styles.prowInlineInput} type="number" min="0" max="50"
                value={plan.payment.descontoAVista}
                onChange={e => {
                  const v = Math.min(50, Math.max(0, parseFloat(e.target.value) || 0));
                  updatePlan(p => { p.payment.descontoAVista = v; p.payment.aVistaOverride = null; });
                }} />
              <span className={styles.prowLabel}>% desc</span>
            </>
          )}
          {field === 'boleto' && (
            <>
              <span className={styles.prowLabel}>{plan.shownPayments.includes('entrada') ? 'Saldo boleto' : 'Boleto'}</span>
              <input className={styles.prowInlineInput} type="number" min="0" max={ownerSettings.paymentPolicy.maxBoletoInstallments}
                value={plan.payment.parcelasBoleto}
                onChange={e => {
                  const v = Math.min(ownerSettings.paymentPolicy.maxBoletoInstallments, Math.max(0, parseInt(e.target.value) || 0));
                  updatePlan(p => { p.payment.parcelasBoleto = v; p.payment.boletoOverride = null; });
                }} />
              <span className={styles.prowLabel}>x</span>
            </>
          )}
          <span className={styles.prowIndicator}
            style={(() => {
              const tag = resolveIndicatorTag(status.tone as IndicatorTone, ownerSettings);
              const color = normalizeIndicatorColor(tag?.color || '#5f5f5f');
              return { background: color, boxShadow: `0 0 0 1px ${color}44,0 0 14px ${color}33` };
            })()}
            title={status.label}
          />
        </div>
      </div>
      <div className={`${styles.prowValue} ${revealed ? styles.valRevealed : styles.valHidden}`}>
        {hasCampaign && field === 'avista' && (
          <span className={styles.prowOrig}>{fmt(planEffectiveTotal(plan) * (1 - plan.payment.descontoAVista / 100))}</span>
        )}
        {isEditing ? (
          <span className={styles.priceEditWrap} onClick={e => e.stopPropagation()}>
            <input ref={inputRef} className={styles.priceEditInput} type="number" min="0"
              value={plan.payment.editInput}
              onChange={e => updatePlan(p => { p.payment.editInput = parseFloat(e.target.value) || 0; })}
              onKeyDown={e => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') updatePlan(p => { p.payment.editingField = null; }); }} />
            <button className={styles.priceEditOk} onClick={applyEdit}>✓</button>
          </span>
        ) : (
          <span className={styles.priceClickable} onClick={startEdit}>
            {field === 'boleto' && plan.payment.parcelasBoleto > 0 ? fmt(value) :
             field === 'parcelado' && plan.payment.parcelas > 0 ? fmt(value) :
             field === 'boleto' || field === 'parcelado' ? '—' : fmt(value)}
          </span>
        )}
        {(field === 'boleto' || field === 'parcelado') && (
          <span className={styles.prowValueSub}>/mês</span>
        )}
      </div>
      <button className={styles.prowRemove} onClick={removeMethod}>×</button>
    </div>
  );
}

export function PaymentSection({ plan, ownerSettings, onChange, onNotify }: PaymentSectionProps) {
  const revealed = plan.paymentVisible;
  const av = ownerSettings.paymentAvailability;

  function addMethod(method: PaymentMethod) {
    const next = JSON.parse(JSON.stringify(plan)) as Plan;
    if (!next.shownPayments.includes(method)) next.shownPayments.push(method);
    onChange(next);
  }

  function activateCartaNaManga() {
    const next = JSON.parse(JSON.stringify(plan)) as Plan;
    next.cartaNaMangaActive = true;
    onChange(next);
  }

  function deactivateCartaNaManga() {
    const next = JSON.parse(JSON.stringify(plan)) as Plan;
    next.cartaNaMangaActive = false;
    next.shownPayments = next.shownPayments.filter(m => m !== 'boleto');
    next.payment.parcelasBoleto = 0;
    next.payment.boletoOverride = null;
    onChange(next);
  }

  const shown = plan.shownPayments;

  return (
    <div className={styles.paymentSection}>
      {shown.includes('entrada') && (
        <PaymentRow plan={plan} field="entrada"revealed={revealed}
          ownerSettings={ownerSettings} onChange={onChange} onNotify={onNotify} />
      )}
      {shown.includes('parcelado') && (
        <PaymentRow plan={plan} field="parcelado"revealed={revealed}
          ownerSettings={ownerSettings} onChange={onChange} onNotify={onNotify} />
      )}
      {shown.includes('debito') && (
        <PaymentRow plan={plan} field="debito"revealed={revealed}
          ownerSettings={ownerSettings} onChange={onChange} onNotify={onNotify} />
      )}
      {shown.includes('avista') && (
        <PaymentRow plan={plan} field="avista"revealed={revealed}
          ownerSettings={ownerSettings} onChange={onChange} onNotify={onNotify} />
      )}

      {plan.cartaNaMangaActive && (
        <div>
          <div className={styles.cartaTag}>
            opção adicional
            <button className={styles.cartaTagClose} onClick={deactivateCartaNaManga} title="Ocultar">×</button>
          </div>
          {shown.includes('boleto') && (
            <PaymentRow plan={plan} field="boleto"revealed={revealed}
              ownerSettings={ownerSettings} onChange={onChange} onNotify={onNotify} />
          )}
        </div>
      )}

      <div className={styles.paymentMethodsAdd}>
        {av?.entrada !== false && !shown.includes('entrada') && (
          <button className={styles.methodAddBtn} onClick={() => addMethod('entrada')}>+ Entrada</button>
        )}
        {av?.parcelado !== false && !shown.includes('parcelado') && (
          <button className={styles.methodAddBtn} onClick={() => addMethod('parcelado')}>+ Parcelado</button>
        )}
        {av?.avista !== false && !shown.includes('avista') && (
          <button className={styles.methodAddBtn} onClick={() => addMethod('avista')}>+ À vista</button>
        )}
        {av?.debito !== false && !shown.includes('debito') && (
          <button className={styles.methodAddBtn} onClick={() => addMethod('debito')}>+ Débito</button>
        )}
        {!plan.cartaNaMangaActive && (
          <button className={styles.methodAddBtn} onClick={activateCartaNaManga}>Carta na manga</button>
        )}
        {plan.cartaNaMangaActive && av?.boleto !== false && ownerSettings.paymentPolicy.boletoEnabled && !shown.includes('boleto') && (
          <button className={styles.methodAddBtn} onClick={() => addMethod('boleto')}>+ Boleto</button>
        )}
      </div>
    </div>
  );
}
