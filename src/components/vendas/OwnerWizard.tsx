import { useState, useCallback } from 'react';
import type { OwnerV8Model } from './types';
import {
  OWNER_V8_SECTIONS,
  hydrateOwnerV8Model,
  defaultOwnerV8Model,
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

  function acceptSuggested() {
    const base = defaultOwnerV8Model();
    const final = hydrateOwnerV8Model({ ...base, currentSection: totalSections - 1, completed: true });
    onSave(final);
  }

  function save() {
    const final = hydrateOwnerV8Model({ ...draft, currentSection: totalSections - 1, completed: true });
    onSave(final);
  }

  const suggestedGordura = ownerV8SuggestedGorduraPct(draft);
  const currentLabel = OWNER_V8_SECTIONS[section]?.label ?? '';

  return (
    <div className={styles.ownerOverlay}>

      {/* Topbar */}
      <div className={styles.ownerTopbar}>
        <div className={styles.ownerTopbarLeft}>
          <div className={styles.ownerTopbarKicker}>TOP V9 · CONFIGURAÇÃO DA CLÍNICA</div>
          <div className={styles.ownerTopbarTitle}>Deixe sua clínica pronta para vender.</div>
          <div className={styles.ownerTopbarSubtitle}>
            Configure preços, formas de pagamento e regras de negociação em poucos minutos.
          </div>
        </div>
        <div className={styles.ownerTopActions}>
          {model.completed && (
            <button className={styles.ownerV8BtnPrimary} onClick={onClose}>
              Ir para o vendedor
            </button>
          )}
          <button className={styles.ownerV8Btn} onClick={onClose}>Fechar</button>
        </div>
      </div>

      {/* Progress */}
      <div className={styles.ownerProgress}>
        <div className={styles.ownerProgressLabel}>
          {section + 1} de {totalSections} — {currentLabel}
        </div>
        <div className={styles.ownerProgressDots}>
          {OWNER_V8_SECTIONS.map((s, i) => (
            <div
              key={s.key}
              className={`${styles.ownerProgressDot}${i === section ? ' ' + styles.ownerProgressDotActive : ''}`}
              onClick={() => setSection(i)}
              title={s.label}
            />
          ))}
        </div>
      </div>

      {/* Stage */}
      <div className={styles.ownerStage}>
        <button
          className={`${styles.ownerArrow} ${styles.ownerArrowLeft}`}
          onClick={goBack}
          disabled={section === 0}
        >‹</button>

        <div className={styles.ownerSections}>
          <div className={styles.ownerSectionsTrack} style={{ transform: `translateX(-${section * 100}%)` }}>

          {/* 0 — Boas-vindas */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
              <div className={styles.ownerEyebrow}>TOP V9</div>
              <div className={styles.ownerQuestion}>Deixe sua clínica pronta para vender.</div>
              <div className={styles.ownerHelper}>
                Em poucos passos você define os preços de tabela, condições de pagamento e parâmetros de negociação. Prefere começar com valores já otimizados pelo catálogo?
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 8 }}>
                <div className={styles.ownerChoice}>
                  <div className={styles.ownerEyebrow}>Mais rápido</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Configuração express</div>
                  <div className={styles.ownerNote} style={{ marginBottom: 16 }}>
                    A TOP preenche tudo com valores sugeridos e otimizados para clínicas odontológicas. Você pode revisar e ajustar depois.
                  </div>
                  <button className={styles.ownerV8BtnPrimary} onClick={acceptSuggested}>
                    Aceitar tudo sugerido
                  </button>
                </div>
                <div className={styles.ownerChoice}>
                  <div className={styles.ownerEyebrow}>Mais controle</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Configurar agora</div>
                  <div className={styles.ownerNote} style={{ marginBottom: 16 }}>
                    Passe pelos 7 passos e defina cada detalhe conforme a realidade da sua clínica.
                  </div>
                  <button className={styles.ownerV8Btn} onClick={goNext}>
                    Começar configuração
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 1 — Sua Clínica */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
              <div className={styles.ownerEyebrow}>Passo 1 de {totalSections - 2}</div>
              <div className={styles.ownerQuestion}>Sua clínica</div>
              <div className={styles.ownerGrid}>
                <div className={styles.ownerField}>
                  <label>Tipo</label>
                  <select
                    className={styles.ownerSelect}
                    value={draft.identity.scopeType}
                    onChange={e => update(m => { m.identity.scopeType = e.target.value as 'clinica' | 'unidade'; })}
                  >
                    <option value="unidade">Unidade</option>
                    <option value="clinica">Clínica</option>
                  </select>
                </div>
                <div className={styles.ownerField}>
                  <label>Nome</label>
                  <input
                    className={styles.ownerInput}
                    type="text"
                    placeholder="ex: Clínica Sorriso"
                    value={draft.identity.scopeName}
                    onChange={e => update(m => { m.identity.scopeName = e.target.value; })}
                  />
                </div>
              </div>
              <div className={styles.ownerSectionFooter}>
                <button className={styles.ownerV8Btn} onClick={goBack}>Voltar</button>
                <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Próximo</button>
              </div>
            </div>
          </div>

          {/* 2 — Preços Mínimos */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
              <div className={styles.ownerEyebrow}>Passo 2 de {totalSections - 2}</div>
              <div className={styles.ownerQuestion}>Preços mínimos</div>
              <div className={styles.ownerHelper}>
                Os preços mínimos protegem sua margem: o sistema nunca deixará uma negociação ir abaixo deles. Use os valores sugeridos pelo catálogo ou importe uma tabela própria.
              </div>
              <div className={styles.ownerPillRow}>
                <button
                  className={`${styles.ownerPill}${(draft.externalMinimumSnapshot.source === 'accepted-suggested' || draft.externalMinimumSnapshot.source === 'manual-defaults') ? ' ' + styles.ownerPillActive : ''}`}
                  onClick={() => update(m => { m.externalMinimumSnapshot = createOwnerV8FallbackSnapshot('accepted-suggested'); })}
                >
                  Usar sugeridos
                </button>
                <button
                  className={`${styles.ownerPill}${(draft.externalMinimumSnapshot.source === 'legacy-v7' || draft.externalMinimumSnapshot.source === '') ? ' ' + styles.ownerPillActive : ''}`}
                  onClick={() => update(m => { m.externalMinimumSnapshot = createOwnerV8FallbackSnapshot('manual-defaults'); })}
                >
                  Manter atuais
                </button>
              </div>
              {draft.externalMinimumSnapshot.items.length > 0 && (
                <div className={styles.ownerCallout}>
                  {draft.externalMinimumSnapshot.items.length} procedimentos com preço mínimo definido.
                </div>
              )}
              <div className={styles.ownerSectionFooter}>
                <button className={styles.ownerV8Btn} onClick={goBack}>Voltar</button>
                <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Próximo</button>
              </div>
            </div>
          </div>

          {/* 3 — Última Condição */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
              <div className={styles.ownerEyebrow}>Passo 3 de {totalSections - 2}</div>
              <div className={styles.ownerQuestion}>Última condição</div>
              <div className={styles.ownerHelper}>
                Define a condição máxima de parcelamento e juros. É usada para calcular quanto os preços de tabela precisam absorver de encargos.
              </div>
              <div className={styles.ownerGrid}>
                <div className={styles.ownerField}>
                  <label>Juros mensais (%)</label>
                  <input
                    className={styles.ownerInput}
                    type="number" min="0" max="10" step="0.1"
                    value={draft.lastChanceCondition.monthlyInterestPct}
                    onChange={e => update(m => {
                      m.lastChanceCondition.monthlyInterestPct = clamp(safeNumber(e.target.value, 1.5), 0, 10);
                    })}
                  />
                </div>
                <div className={styles.ownerField}>
                  <label>Máx. parcelas</label>
                  <input
                    className={styles.ownerInput}
                    type="number" min="1" max="60" step="1"
                    value={draft.lastChanceCondition.maxInstallments}
                    onChange={e => update(m => {
                      m.lastChanceCondition.maxInstallments = clamp(Math.round(safeNumber(e.target.value, 24)), 1, 60);
                    })}
                  />
                </div>
              </div>
              <div className={styles.ownerCallout}>
                Gordura sugerida na tabela: <strong>{suggestedGordura.toFixed(1)}%</strong> para cobrir {draft.lastChanceCondition.maxInstallments}x de {draft.lastChanceCondition.monthlyInterestPct}% a.m.
              </div>
              <div className={styles.ownerSectionFooter}>
                <button className={styles.ownerV8Btn} onClick={goBack}>Voltar</button>
                <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Próximo</button>
              </div>
            </div>
          </div>

          {/* 4 — Tabela e Preços */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
              <div className={styles.ownerEyebrow}>Passo 4 de {totalSections - 2}</div>
              <div className={styles.ownerQuestion}>Tabela e preços</div>
              <div className={styles.ownerHelper}>
                Escolha como calcular os preços de tabela (referência para o vendedor).
              </div>
              <div className={styles.ownerPillRow}>
                {(['suggested', 'globalPct'] as const).map(mode => (
                  <button
                    key={mode}
                    className={`${styles.ownerPill}${draft.tableStrategy.mode === mode ? ' ' + styles.ownerPillActive : ''}`}
                    onClick={() => update(m => { m.tableStrategy.mode = mode; })}
                  >
                    {mode === 'suggested' ? 'Sugerido pelo catálogo' : 'Gordura global (%)'}
                  </button>
                ))}
              </div>
              {draft.tableStrategy.mode === 'globalPct' && (
                <div className={styles.ownerField}>
                  <label>Gordura global (%)</label>
                  <input
                    className={styles.ownerInput}
                    type="number" min="0" max="300" step="1"
                    value={draft.tableStrategy.globalGorduraPct}
                    onChange={e => update(m => {
                      m.tableStrategy.globalGorduraPct = clamp(safeNumber(e.target.value, 25), 0, 300);
                    })}
                  />
                  <div className={styles.ownerNote}>
                    Aplica {draft.tableStrategy.globalGorduraPct}% sobre o preço mínimo de cada procedimento.
                  </div>
                </div>
              )}
              {draft.tableStrategy.mode === 'suggested' && (
                <div className={styles.ownerNote}>
                  Os preços de tabela seguirão os valores sugeridos do catálogo para cada procedimento.
                </div>
              )}
              <div className={styles.ownerSectionFooter}>
                <button className={styles.ownerV8Btn} onClick={goBack}>Voltar</button>
                <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Próximo</button>
              </div>
            </div>
          </div>

          {/* 5 — Pagamentos */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
              <div className={styles.ownerEyebrow}>Passo 5 de {totalSections - 2}</div>
              <div className={styles.ownerQuestion}>Formas de pagamento</div>
              <div className={styles.ownerHelper}>
                Quais formas de pagamento sua clínica aceita? O vendedor só poderá usar as formas ativas.
              </div>
              <div className={styles.ownerToggleGrid}>
                {(['avista', 'entrada', 'parcelado', 'debito', 'boleto'] as const).map(method => {
                  const labels: Record<string, string> = {
                    avista: 'À vista', entrada: 'Entrada', parcelado: 'Cartão parcelado',
                    debito: 'Débito', boleto: 'Boleto',
                  };
                  return (
                    <label key={method} className={styles.ownerToggle}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.payments[method])}
                        onChange={e => update(m => { m.payments[method] = e.target.checked; })}
                      />
                      {labels[method]}
                    </label>
                  );
                })}
              </div>
              <div className={styles.ownerSectionFooter}>
                <button className={styles.ownerV8Btn} onClick={goBack}>Voltar</button>
                <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Próximo</button>
              </div>
            </div>
          </div>

          {/* 6 — Cartão e Juros */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
              <div className={styles.ownerEyebrow}>Passo 6 de {totalSections - 2}</div>
              <div className={styles.ownerQuestion}>Cartão e juros</div>
              <div className={styles.ownerGrid}>
                <div className={styles.ownerField}>
                  <label>Taxa plana (%)</label>
                  <input
                    className={styles.ownerInput}
                    type="number" min="0" max="40" step="0.1"
                    value={draft.cardTerms.flatRatePct}
                    onChange={e => update(m => {
                      m.cardTerms.flatRatePct = clamp(safeNumber(e.target.value, 3.9), 0, 40);
                      m.cardTerms.useDefaultRateTable = false;
                    })}
                  />
                </div>
                <div className={styles.ownerField}>
                  <label>Cobrar juros a partir de (x)</label>
                  <input
                    className={styles.ownerInput}
                    type="number" min="1" max="36" step="1"
                    value={draft.cardTerms.chargeInterestFromInstallments}
                    onChange={e => update(m => {
                      m.cardTerms.chargeInterestFromInstallments = clamp(Math.round(safeNumber(e.target.value, 1)), 1, 36);
                    })}
                  />
                </div>
              </div>
              <div className={styles.ownerToggleGrid} style={{ marginTop: 14 }}>
                <label className={styles.ownerToggle}>
                  <input
                    type="checkbox"
                    checked={Boolean(draft.cardTerms.useDefaultRateTable)}
                    onChange={e => update(m => { m.cardTerms.useDefaultRateTable = e.target.checked; })}
                  />
                  Usar tabela padrão de taxas por prazo
                </label>
                <label className={styles.ownerToggle}>
                  <input
                    type="checkbox"
                    checked={Boolean(draft.cardTerms.noInterestEnabled)}
                    onChange={e => update(m => { m.cardTerms.noInterestEnabled = e.target.checked; })}
                  />
                  Parcelamento sem juros
                </label>
              </div>
              {draft.cardTerms.noInterestEnabled && (
                <div className={styles.ownerField} style={{ marginTop: 14 }}>
                  <label>Sem juros até (parcelas)</label>
                  <input
                    className={styles.ownerInput}
                    type="number" min="1" max="36" step="1"
                    value={draft.cardTerms.noInterestUpToInstallments}
                    onChange={e => update(m => {
                      m.cardTerms.noInterestUpToInstallments = clamp(Math.round(safeNumber(e.target.value, 0)), 0, 36);
                    })}
                  />
                </div>
              )}
              <div className={styles.ownerSectionFooter}>
                <button className={styles.ownerV8Btn} onClick={goBack}>Voltar</button>
                <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Próximo</button>
              </div>
            </div>
          </div>

          {/* 7 — Pronto */}
          <div className={styles.ownerSection}>
            <div className={styles.ownerCard}>
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
                <button className={styles.ownerV8Btn} onClick={goBack}>Voltar</button>
                <button className={styles.ownerV8BtnPrimary} onClick={save}>Salvar configurações</button>
              </div>
            </div>
          </div>

          </div>
        </div>

        <button
          className={`${styles.ownerArrow} ${styles.ownerArrowRight}`}
          onClick={goNext}
          disabled={section === totalSections - 1}
        >›</button>
      </div>

    </div>
  );
}
