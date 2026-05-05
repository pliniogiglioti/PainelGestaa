import React, { useState, useCallback } from 'react';
import type { OwnerV8Model } from './types';
import {
  OWNER_V8_SECTIONS,
  hydrateOwnerV8Model,
  ownerV8SuggestedGorduraPct,
  createOwnerV8FallbackSnapshot,
} from './ownerModel';
import { safeNumber, clamp } from './calcEngine';
import styles from './Vendas.module.css';

interface OwnerWizardProps {
  model: OwnerV8Model;
  onSave: (model: OwnerV8Model) => void;
  onClose: () => void;
}

function Section({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.ownerSection} style={{ display: active ? 'flex' : 'none' }}>
      <div className={styles.ownerCard}>{children}</div>
    </div>
  );
}

export function OwnerWizard({ model, onSave, onClose }: OwnerWizardProps) {
  const [draft, setDraft] = useState<OwnerV8Model>(() => hydrateOwnerV8Model(model));
  const [section, setSection] = useState(model.currentSection ?? 0);

  const totalSections = OWNER_V8_SECTIONS.length;

  const update = useCallback((fn: (m: OwnerV8Model) => void) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as OwnerV8Model;
      fn(next);
      return next;
    });
  }, []);

  function goNext() { if (section < totalSections - 1) setSection(s => s + 1); }
  function goBack() { if (section > 0) setSection(s => s - 1); }

  function save() {
    const final = hydrateOwnerV8Model({ ...draft, currentSection: totalSections - 1, completed: true });
    onSave(final);
  }

  const suggestedGordura = ownerV8SuggestedGorduraPct(draft);

  // ---- Section content ----

  const sec0 = section === 0;
  const sec1 = section === 1;
  const sec2 = section === 2;
  const sec3 = section === 3;
  const sec4 = section === 4;
  const sec5 = section === 5;
  const sec6 = section === 6;
  const sec7 = section === 7;

  return (
    <div className={styles.ownerOverlay}>
      {/* Topbar */}
      <div className={styles.ownerTopbar}>
        <span className={styles.ownerTopbarTitle}>Configurações da Clínica</span>
        <button className={styles.ownerCloseBtn} onClick={onClose}>×</button>
      </div>

      {/* Progress dots */}
      <div className={styles.ownerProgress}>
        {OWNER_V8_SECTIONS.map((s, i) => (
          <div
            key={s.key}
            className={`${styles.ownerProgressDot} ${i === section ? styles.active : i < section ? styles.completed : ''}`}
            onClick={() => setSection(i)}
            title={s.label}
          />
        ))}
      </div>

      {/* Sections track */}
      <div className={styles.ownerSectionsTrack}>

        {/* 0 — Welcome */}
        <Section active={sec0}>
          <div className={styles.ownerEyebrow}>TOP v9</div>
          <div className={styles.ownerQuestion}>Configure sua clínica</div>
          <div className={styles.ownerHelper}>
            Em poucos passos você define os preços de tabela, condições de pagamento e parâmetros de negociação.
            Isso permite que o sistema calcule automaticamente os valores ideais para cada forma de pagamento.
          </div>
          <div className={styles.ownerSectionFooter}>
            <span />
            <button className={styles.ownerBtnPrimary} onClick={goNext}>Começar</button>
          </div>
        </Section>

        {/* 1 — Identity */}
        <Section active={sec1}>
          <div className={styles.ownerEyebrow}>Passo 1 de {totalSections - 2}</div>
          <div className={styles.ownerQuestion}>Sua clínica</div>
          <div className={styles.ownerField}>
            <label className={styles.ownerLabel}>Tipo</label>
            <select className={styles.ownerSelect}
              value={draft.identity.scopeType}
              onChange={e => update(m => { m.identity.scopeType = e.target.value as 'clinica' | 'unidade'; })}>
              <option value="unidade">Unidade</option>
              <option value="clinica">Clínica</option>
            </select>
          </div>
          <div className={styles.ownerField}>
            <label className={styles.ownerLabel}>Nome</label>
            <input className={styles.ownerInput} type="text" placeholder="ex: Clínica Sorriso"
              value={draft.identity.scopeName}
              onChange={e => update(m => { m.identity.scopeName = e.target.value; })} />
          </div>
          <div className={styles.ownerSectionFooter}>
            <button className={styles.ownerBtn} onClick={goBack}>Voltar</button>
            <button className={styles.ownerBtnPrimary} onClick={goNext}>Próximo</button>
          </div>
        </Section>

        {/* 2 — Minimums */}
        <Section active={sec2}>
          <div className={styles.ownerEyebrow}>Passo 2 de {totalSections - 2}</div>
          <div className={styles.ownerQuestion}>Preços mínimos</div>
          <div className={styles.ownerHelper}>
            Os preços mínimos protegem sua margem: o sistema nunca deixará uma negociação ir abaixo deles.
            Use os valores sugeridos pelo catálogo ou importe uma tabela própria.
          </div>
          <div className={styles.ownerPillRow}>
            <button
              className={`${styles.ownerPill} ${draft.externalMinimumSnapshot.source === 'accepted-suggested' || draft.externalMinimumSnapshot.source === 'manual-defaults' ? styles.active : ''}`}
              onClick={() => update(m => { m.externalMinimumSnapshot = createOwnerV8FallbackSnapshot('accepted-suggested'); })}>
              Usar sugeridos
            </button>
            <button
              className={`${styles.ownerPill} ${draft.externalMinimumSnapshot.source === 'legacy-v7' || draft.externalMinimumSnapshot.source === '' ? styles.active : ''}`}
              onClick={() => update(m => { m.externalMinimumSnapshot = createOwnerV8FallbackSnapshot('manual-defaults'); })}>
              Manter atuais
            </button>
          </div>
          {draft.externalMinimumSnapshot.items.length > 0 && (
            <div className={styles.ownerCallout}>
              {draft.externalMinimumSnapshot.items.length} procedimentos com preço mínimo definido.
            </div>
          )}
          <div className={styles.ownerSectionFooter}>
            <button className={styles.ownerBtn} onClick={goBack}>Voltar</button>
            <button className={styles.ownerBtnPrimary} onClick={goNext}>Próximo</button>
          </div>
        </Section>

        {/* 3 — Last chance */}
        <Section active={sec3}>
          <div className={styles.ownerEyebrow}>Passo 3 de {totalSections - 2}</div>
          <div className={styles.ownerQuestion}>Última condição</div>
          <div className={styles.ownerHelper}>
            Define a condição máxima de parcelamento e juros. É usada para calcular quanto os preços de tabela precisam absorver de encargos.
          </div>
          <div className={styles.ownerGrid}>
            <div className={styles.ownerField}>
              <label className={styles.ownerLabel}>Juros mensais (%)</label>
              <input className={styles.ownerInput} type="number" min="0" max="10" step="0.1"
                value={draft.lastChanceCondition.monthlyInterestPct}
                onChange={e => update(m => {
                  m.lastChanceCondition.monthlyInterestPct = clamp(safeNumber(e.target.value, 1.5), 0, 10);
                })} />
            </div>
            <div className={styles.ownerField}>
              <label className={styles.ownerLabel}>Máx. parcelas</label>
              <input className={styles.ownerInput} type="number" min="1" max="60" step="1"
                value={draft.lastChanceCondition.maxInstallments}
                onChange={e => update(m => {
                  m.lastChanceCondition.maxInstallments = clamp(Math.round(safeNumber(e.target.value, 24)), 1, 60);
                })} />
            </div>
          </div>
          <div className={styles.ownerCallout}>
            Gordura sugerida na tabela: <strong>{suggestedGordura.toFixed(1)}%</strong> para cobrir {draft.lastChanceCondition.maxInstallments}x de {draft.lastChanceCondition.monthlyInterestPct}% a.m.
          </div>
          <div className={styles.ownerSectionFooter}>
            <button className={styles.ownerBtn} onClick={goBack}>Voltar</button>
            <button className={styles.ownerBtnPrimary} onClick={goNext}>Próximo</button>
          </div>
        </Section>

        {/* 4 — Table strategy */}
        <Section active={sec4}>
          <div className={styles.ownerEyebrow}>Passo 4 de {totalSections - 2}</div>
          <div className={styles.ownerQuestion}>Tabela e preços</div>
          <div className={styles.ownerHelper}>
            Escolha como calcular os preços de tabela (referência para o vendedor).
          </div>
          <div className={styles.ownerPillRow}>
            {(['suggested', 'globalPct'] as const).map(mode => (
              <button key={mode}
                className={`${styles.ownerPill} ${draft.tableStrategy.mode === mode ? styles.active : ''}`}
                onClick={() => update(m => { m.tableStrategy.mode = mode; })}>
                {mode === 'suggested' ? 'Sugerido pelo catálogo' : 'Gordura global (%)'}
              </button>
            ))}
          </div>
          {draft.tableStrategy.mode === 'globalPct' && (
            <div className={styles.ownerField}>
              <label className={styles.ownerLabel}>Gordura global (%)</label>
              <input className={styles.ownerInput} type="number" min="0" max="300" step="1"
                value={draft.tableStrategy.globalGorduraPct}
                onChange={e => update(m => {
                  m.tableStrategy.globalGorduraPct = clamp(safeNumber(e.target.value, 25), 0, 300);
                })} />
              <span className={styles.ownerNote}>
                Aplica {draft.tableStrategy.globalGorduraPct}% sobre o preço mínimo de cada procedimento.
              </span>
            </div>
          )}
          {draft.tableStrategy.mode === 'suggested' && (
            <div className={styles.ownerNote}>
              Os preços de tabela seguirão os valores sugeridos do catálogo para cada procedimento.
            </div>
          )}
          <div className={styles.ownerSectionFooter}>
            <button className={styles.ownerBtn} onClick={goBack}>Voltar</button>
            <button className={styles.ownerBtnPrimary} onClick={goNext}>Próximo</button>
          </div>
        </Section>

        {/* 5 — Payments */}
        <Section active={sec5}>
          <div className={styles.ownerEyebrow}>Passo 5 de {totalSections - 2}</div>
          <div className={styles.ownerQuestion}>Formas de pagamento</div>
          <div className={styles.ownerHelper}>
            Quais formas de pagamento sua clínica aceita? O vendedor só poderá usar as formas ativas.
          </div>
          <div className={styles.ownerToggleGrid}>
            {(['avista', 'entrada', 'parcelado', 'debito', 'boleto'] as const).map(method => {
              const labels: Record<string, string> = { avista: 'À vista', entrada: 'Entrada', parcelado: 'Cartão parcelado', debito: 'Débito', boleto: 'Boleto' };
              return (
                <label key={method} className={styles.ownerToggle}>
                  <input type="checkbox"
                    checked={Boolean(draft.payments[method])}
                    onChange={e => update(m => { m.payments[method] = e.target.checked; })} />
                  {labels[method]}
                </label>
              );
            })}
          </div>
          <div className={styles.ownerSectionFooter}>
            <button className={styles.ownerBtn} onClick={goBack}>Voltar</button>
            <button className={styles.ownerBtnPrimary} onClick={goNext}>Próximo</button>
          </div>
        </Section>

        {/* 6 — Card terms */}
        <Section active={sec6}>
          <div className={styles.ownerEyebrow}>Passo 6 de {totalSections - 2}</div>
          <div className={styles.ownerQuestion}>Cartão e juros</div>
          <div className={styles.ownerGrid}>
            <div className={styles.ownerField}>
              <label className={styles.ownerLabel}>Taxa plana (%)</label>
              <input className={styles.ownerInput} type="number" min="0" max="40" step="0.1"
                value={draft.cardTerms.flatRatePct}
                onChange={e => update(m => {
                  m.cardTerms.flatRatePct = clamp(safeNumber(e.target.value, 3.9), 0, 40);
                  m.cardTerms.useDefaultRateTable = false;
                })} />
            </div>
            <div className={styles.ownerField}>
              <label className={styles.ownerLabel}>Cobrar juros a partir de (x)</label>
              <input className={styles.ownerInput} type="number" min="1" max="36" step="1"
                value={draft.cardTerms.chargeInterestFromInstallments}
                onChange={e => update(m => {
                  m.cardTerms.chargeInterestFromInstallments = clamp(Math.round(safeNumber(e.target.value, 1)), 1, 36);
                })} />
            </div>
          </div>
          <label className={styles.ownerToggle}>
            <input type="checkbox"
              checked={Boolean(draft.cardTerms.useDefaultRateTable)}
              onChange={e => update(m => { m.cardTerms.useDefaultRateTable = e.target.checked; })} />
            Usar tabela padrão de taxas por prazo
          </label>
          <label className={styles.ownerToggle}>
            <input type="checkbox"
              checked={Boolean(draft.cardTerms.noInterestEnabled)}
              onChange={e => update(m => { m.cardTerms.noInterestEnabled = e.target.checked; })} />
            Parcelamento sem juros
          </label>
          {draft.cardTerms.noInterestEnabled && (
            <div className={styles.ownerField}>
              <label className={styles.ownerLabel}>Sem juros até (parcelas)</label>
              <input className={styles.ownerInput} type="number" min="1" max="36" step="1"
                value={draft.cardTerms.noInterestUpToInstallments}
                onChange={e => update(m => {
                  m.cardTerms.noInterestUpToInstallments = clamp(Math.round(safeNumber(e.target.value, 0)), 0, 36);
                })} />
            </div>
          )}
          <div className={styles.ownerSectionFooter}>
            <button className={styles.ownerBtn} onClick={goBack}>Voltar</button>
            <button className={styles.ownerBtnPrimary} onClick={goNext}>Próximo</button>
          </div>
        </Section>

        {/* 7 — Review */}
        <Section active={sec7}>
          <div className={styles.ownerEyebrow}>Pronto</div>
          <div className={styles.ownerQuestion}>Configuração concluída</div>
          <div className={styles.ownerSummaryGrid}>
            <div className={styles.ownerSummaryCard}>
              <div className={styles.ownerSummaryLabel}>Clínica</div>
              <strong>{draft.identity.scopeName || '—'}</strong>
              <span>{draft.identity.scopeType === 'clinica' ? 'Clínica' : 'Unidade'}</span>
            </div>
            <div className={styles.ownerSummaryCard}>
              <div className={styles.ownerSummaryLabel}>Última condição</div>
              <strong>{draft.lastChanceCondition.maxInstallments}x</strong>
              <span>{draft.lastChanceCondition.monthlyInterestPct}% a.m.</span>
            </div>
            <div className={styles.ownerSummaryCard}>
              <div className={styles.ownerSummaryLabel}>Tabela</div>
              <strong>{draft.tableStrategy.mode === 'suggested' ? 'Sugerida' : `+${draft.tableStrategy.globalGorduraPct}%`}</strong>
              <span>sobre preço mínimo</span>
            </div>
            <div className={styles.ownerSummaryCard}>
              <div className={styles.ownerSummaryLabel}>Pagamentos</div>
              <strong>{Object.values(draft.payments).filter(Boolean).length} ativos</strong>
              <span>{draft.payments.boleto ? 'inclui boleto' : 'sem boleto'}</span>
            </div>
          </div>
          <div className={styles.ownerSectionFooter}>
            <button className={styles.ownerBtn} onClick={goBack}>Voltar</button>
            <button className={styles.ownerBtnPrimary} onClick={save}>Salvar configurações</button>
          </div>
        </Section>

      </div>
    </div>
  );
}
