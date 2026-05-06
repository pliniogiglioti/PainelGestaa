import { useState, useCallback, useMemo } from 'react';
import type { OwnerV8Model } from './types';
import {
  OWNER_V8_SECTIONS,
  hydrateOwnerV8Model,
  defaultOwnerV8Model,
  ownerV8SuggestedGorduraPct,
  createOwnerV8FallbackSnapshot,
  EXTERNAL_MINIMUM_STORAGE_KEY,
} from './ownerModel';
import {
  safeNumber,
  clamp,
  roundMoney,
  defaultCatalogMinPrice,
  sanitizeIndicatorTags,
  sanitizeIndicatorRules,
  sanitizeIndicatorRoleLabels,
  defaultIndicatorRules,
} from './calcEngine';
import { FLAT_CATALOG } from './catalog';
import styles from './Vendas.module.css';

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const INDICATOR_ROLE_KEYS = ['premium', 'good', 'warn', 'limit', 'neutral', 'legend'] as const;
type IndicatorRoleKey = (typeof INDICATOR_ROLE_KEYS)[number];
type IndicatorPresetKey = 'conservative' | 'balanced' | 'aggressive';

const INDICATOR_PRESETS: Record<IndicatorPresetKey, {
  label: string;
  description: string;
  rules: OwnerV8Model['indicatorRules'];
}> = {
  conservative: {
    label: 'Conservador',
    description: 'A V10 chama de flexível e limite mais cedo. Bom para operação mais protegida.',
    rules: {
      cash: { limitMaxPct: 15, warnMaxPct: 40, goodMaxPct: 78 },
      entry: { premiumAboveSuggestedPct: 20 },
      card: { premiumUpToIdealPct: 45, goodUpToIdealPct: 95 },
      boleto: { premiumUpToIdealPct: 0, goodUpToIdealPct: 85 },
    },
  },
  balanced: {
    label: 'Equilibrado',
    description: 'Faixa padrão da V10. Boa leitura para a maioria das clínicas.',
    rules: defaultIndicatorRules(),
  },
  aggressive: {
    label: 'Agressivo',
    description: 'Segura o premium por mais tempo e aceita leituras comerciais mais abertas.',
    rules: {
      cash: { limitMaxPct: 5, warnMaxPct: 25, goodMaxPct: 55 },
      entry: { premiumAboveSuggestedPct: 8 },
      card: { premiumUpToIdealPct: 75, goodUpToIdealPct: 120 },
      boleto: { premiumUpToIdealPct: 20, goodUpToIdealPct: 110 },
    },
  },
};

function createIndicatorTagId() {
  return `tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface OwnerWizardProps {
  model: OwnerV8Model;
  onSave: (model: OwnerV8Model) => void;
  onClose: () => void;
}

export function OwnerWizard({ model, onSave, onClose }: OwnerWizardProps) {
  const [draft, setDraft] = useState<OwnerV8Model>(() => hydrateOwnerV8Model(model));
  const [section, setSection] = useState(model.currentSection ?? 0);
  const [importedBadge, setImportedBadge] = useState('');
  const [externalWarning, setExternalWarning] = useState('');
  const [semaforoAdvancedOpen, setSemaforoAdvancedOpen] = useState(false);

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
    base.externalMinimumSnapshot = createOwnerV8FallbackSnapshot('accepted-suggested');
    setDraft(hydrateOwnerV8Model(base));
    setSection(totalSections - 1);
  }

  function save() {
    const final = hydrateOwnerV8Model({ ...draft, currentSection: totalSections - 1, completed: true });
    onSave(final);
  }

  const suggestedGordura = ownerV8SuggestedGorduraPct(draft);
  const currentLabel = OWNER_V8_SECTIONS[section]?.label ?? '';

  const procedureRows = useMemo(() => {
    const snapshotMap = new Map(draft.externalMinimumSnapshot.items.map(i => [i.name, i]));
    return FLAT_CATALOG.map(proc => ({
      name: proc.name,
      category: proc.category,
      minPrice: snapshotMap.get(proc.name)?.minPrice ?? defaultCatalogMinPrice(proc),
    }));
  }, [draft.externalMinimumSnapshot]);

  const hasMinimums = draft.externalMinimumSnapshot.items.length > 0;

  function suggestedTableValue(procName: string): number {
    const row = procedureRows.find(r => r.name === procName);
    const minPrice = row?.minPrice ?? 0;
    const interest = safeNumber(draft.lastChanceCondition.monthlyInterestPct, 0) / 100;
    const installments = Math.max(1, Math.round(safeNumber(draft.lastChanceCondition.maxInstallments, 1)));
    return roundMoney(minPrice * Math.pow(1 + interest, installments));
  }

  function procedureRowState(procName: string) {
    const row = procedureRows.find(r => r.name === procName);
    const minPrice = row?.minPrice ?? 0;
    const ps = draft.tableStrategy.perProcedure[procName] || { inputMode: 'auto', gorduraPct: null, tableAbsolute: null };
    let preview = suggestedTableValue(procName);
    if (draft.tableStrategy.mode === 'globalPct') {
      preview = roundMoney(minPrice * (1 + safeNumber(draft.tableStrategy.globalGorduraPct, 0) / 100));
    } else if (draft.tableStrategy.mode === 'perProcedure') {
      if (ps.inputMode === 'pct') preview = roundMoney(minPrice * (1 + safeNumber(ps.gorduraPct, 0) / 100));
      else if (ps.inputMode === 'absolute') preview = roundMoney(Math.max(minPrice, safeNumber(ps.tableAbsolute, minPrice)));
    }
    const delta = roundMoney(preview - minPrice);
    const pct = minPrice > 0 ? Math.round((delta / minPrice) * 1000) / 10 : 0;
    return { minPrice, preview, delta, pct };
  }

  function updateMinimum(procName: string, value: string) {
    const newPrice = roundMoney(Math.max(0, safeNumber(value, 0)));
    update(m => {
      const existing = m.externalMinimumSnapshot.items.find(i => i.name === procName);
      if (existing) existing.minPrice = newPrice;
    });
  }

  function useFallbackMinimums() {
    update(m => { m.externalMinimumSnapshot = createOwnerV8FallbackSnapshot('manual-defaults'); });
    setImportedBadge('Mínimos padrão do catálogo carregados.');
    setTimeout(() => setImportedBadge(''), 3500);
  }

  function importExternalSnapshot() {
    setExternalWarning('');
    try {
      const raw = localStorage.getItem(EXTERNAL_MINIMUM_STORAGE_KEY);
      if (!raw) { setExternalWarning('Nenhum dado externo encontrado no localStorage.'); return; }
      const parsed = JSON.parse(raw);
      if (parsed.version !== 1) { setExternalWarning('Versão do contrato incompatível. Atualize o TOP V10.'); return; }
      const items = (parsed.items || [])
        .filter((i: any) => FLAT_CATALOG.some(p => p.name === i.name))
        .map((i: any) => ({
          name: i.name,
          category: i.category || '',
          minPrice: roundMoney(Math.max(0, safeNumber(i.minPrice, 0))),
          updatedAt: i.updatedAt || parsed.exportedAt,
        }));
      const unknown = (parsed.items || []).filter((i: any) => !FLAT_CATALOG.some(p => p.name === i.name));
      update(m => {
        m.externalMinimumSnapshot = { importedAt: parsed.exportedAt, source: parsed.source, items };
      });
      setImportedBadge(unknown.length
        ? `${unknown.length} procedimento(s) ignorados (não reconhecidos no catálogo).`
        : `${items.length} procedimentos importados com sucesso.`);
      setTimeout(() => setImportedBadge(''), 4000);
    } catch { setExternalWarning('Erro ao ler dados externos.'); }
  }

  const exampleMinPrice = procedureRows[0]?.minPrice ?? 0;
  const exampleSuggested = procedureRows.length > 0 ? suggestedTableValue(procedureRows[0].name) : 0;
  const indicatorRoleLabels = useMemo(
    () => sanitizeIndicatorRoleLabels(draft.indicatorRoleLabels),
    [draft.indicatorRoleLabels],
  );
  const indicatorRules = useMemo(
    () => sanitizeIndicatorRules(draft.indicatorRules),
    [draft.indicatorRules],
  );
  const indicatorRoleOptions = useMemo(
    () => INDICATOR_ROLE_KEYS.map(role => ({ value: role, label: indicatorRoleLabels[role] })),
    [indicatorRoleLabels],
  );
  const indicatorPresetKey = useMemo(() => {
    const current = JSON.stringify(indicatorRules);
    for (const presetKey of Object.keys(INDICATOR_PRESETS) as IndicatorPresetKey[]) {
      if (JSON.stringify(sanitizeIndicatorRules(INDICATOR_PRESETS[presetKey].rules)) === current) {
        return presetKey;
      }
    }
    return 'custom';
  }, [indicatorRules]);
  const indicatorPresetDescription = indicatorPresetKey === 'custom'
    ? 'Personalizado. Você ajustou o semáforo do seu jeito e a V10 vai respeitar essas faixas em todo o vendedor.'
    : INDICATOR_PRESETS[indicatorPresetKey].description;

  function normalizeIndicatorConfig(m: OwnerV8Model) {
    m.indicatorTags = sanitizeIndicatorTags(m.indicatorTags);
    m.indicatorRoleLabels = sanitizeIndicatorRoleLabels(m.indicatorRoleLabels);
    m.indicatorRules = sanitizeIndicatorRules(m.indicatorRules);
  }

  function commitIndicatorConfig() {
    update(m => {
      normalizeIndicatorConfig(m);
    });
  }

  function indicatorRoleSemanticLabel(role: IndicatorRoleKey) {
    return String(indicatorRoleLabels[role] || role)
      .trim()
      .replace(/^Usa no\s+/i, '')
      .replace(/^Usa na\s+/i, '')
      .replace(/^Usa em\s+/i, '')
      .replace(/^Só\s+/i, 'somente ')
      .trim();
  }

  function semaforoCashSummary() {
    return `Até ${Math.round(indicatorRules.cash.limitMaxPct)}% da margem: ${indicatorRoleSemanticLabel('limit')}. Até ${Math.round(indicatorRules.cash.warnMaxPct)}%: ${indicatorRoleSemanticLabel('warn')}. Até ${Math.round(indicatorRules.cash.goodMaxPct)}%: ${indicatorRoleSemanticLabel('good')}. Acima disso: ${indicatorRoleSemanticLabel('premium')}.`;
  }

  function semaforoEntrySummary() {
    return `Sem entrada definida: ${indicatorRoleSemanticLabel('neutral')}. Abaixo da entrada sugerida: ${indicatorRoleSemanticLabel('warn')}. Da sugerida até +${Math.round(indicatorRules.entry.premiumAboveSuggestedPct)} pontos: ${indicatorRoleSemanticLabel('good')}. Acima disso: ${indicatorRoleSemanticLabel('premium')}.`;
  }

  function semaforoCardSummary(kind: 'card' | 'boleto') {
    const current = kind === 'boleto' ? indicatorRules.boleto : indicatorRules.card;
    return `Até ${Math.round(current.premiumUpToIdealPct)}% da faixa ideal: ${indicatorRoleSemanticLabel('premium')}. Até ${Math.round(current.goodUpToIdealPct)}% da faixa ideal: ${indicatorRoleSemanticLabel('good')}. Acima disso e antes do máximo: ${indicatorRoleSemanticLabel('warn')}. No máximo: ${indicatorRoleSemanticLabel('limit')}.`;
  }

  function applyIndicatorPreset(presetKey: IndicatorPresetKey) {
    update(m => {
      m.indicatorRules = sanitizeIndicatorRules(INDICATOR_PRESETS[presetKey].rules);
      normalizeIndicatorConfig(m);
    });
    setSemaforoAdvancedOpen(false);
  }

  function addIndicatorTag() {
    update(m => {
      m.indicatorTags.push({
        id: createIndicatorTagId(),
        label: `Nova tag ${m.indicatorTags.length + 1}`,
        color: '#8f8f8f',
        mapsTo: 'legend',
      });
      normalizeIndicatorConfig(m);
    });
  }

  function removeIndicatorTag(index: number) {
    update(m => {
      m.indicatorTags.splice(index, 1);
      normalizeIndicatorConfig(m);
    });
  }

  function moveIndicatorTag(index: number, direction: number) {
    update(m => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= m.indicatorTags.length) return;
      const [tag] = m.indicatorTags.splice(index, 1);
      m.indicatorTags.splice(nextIndex, 0, tag);
      normalizeIndicatorConfig(m);
    });
  }

  return (
    <div className={styles.ownerOverlay}>

      {/* Topbar */}
      <div className={styles.ownerTopbar}>
        <div className={styles.ownerTopbarLeft}>
          <div className={styles.ownerTopbarKicker}>TOP V10 · CONFIGURAÇÃO DA CLÍNICA</div>
          <div className={styles.ownerTopbarTitle}>Deixe sua clínica pronta para vender.</div>
          <div className={styles.ownerTopbarSubtitle}>
            Em poucos passos, você organiza preços, pagamentos e limites para vender com segurança e clareza.
          </div>
        </div>
        <div className={styles.ownerTopActions}>
          <button className={styles.ownerV8Btn} onClick={useFallbackMinimums}>Atualizar importação</button>
          {model.completed && (
            <button className={styles.ownerV8BtnPrimary} onClick={onClose}>Ir para o vendedor</button>
          )}
          <button className={styles.ownerV8Btn} onClick={onClose}>Fechar</button>
        </div>
      </div>

      {/* Progress */}
      <div className={styles.ownerProgress}>
        <div className={styles.ownerProgressLabel}>{section + 1} de {totalSections} — {currentLabel}</div>
        <div className={styles.ownerProgressDots}>
          {OWNER_V8_SECTIONS.map((s, i) => (
            <div key={s.key}
              className={`${styles.ownerProgressDot}${i === section ? ' ' + styles.ownerProgressDotActive : ''}`}
              onClick={() => setSection(i)} title={s.label} />
          ))}
        </div>
      </div>

      {/* Stage */}
      <div className={styles.ownerStage}>
        <button className={`${styles.ownerArrow} ${styles.ownerArrowLeft}`} onClick={goBack} disabled={section === 0}>‹</button>

        <div className={styles.ownerSections}>
          <div className={styles.ownerSectionsTrack} style={{ transform: `translateX(-${section * 100}%)` }}>

            {/* §0 — Boas-vindas */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Boas-vindas</div>
                <div className={styles.ownerQuestion}>Quer começar com uma configuração pronta e depois só refinar?</div>
                <div className={styles.ownerHelper}>A V10 pode montar uma base inicial para você revisar no final, ou você pode decidir tudo passo a passo.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 8 }}>
                  <div className={styles.ownerChoice}>
                    <div className={styles.ownerImportTitle}>Configuração express</div>
                    <div className={styles.ownerNote} style={{ marginTop: 0 }}>Usa 24x, 1,5% ao mês, boleto desligado e mínimos padrão de 90% da tabela para você sair com uma base pronta.</div>
                    <div className={styles.ownerSectionFooter} style={{ marginTop: 16 }}>
                      <button className={styles.ownerV8BtnPrimary} onClick={acceptSuggested}>Aceitar tudo sugerido</button>
                    </div>
                  </div>
                  <div className={styles.ownerChoice}>
                    <div className={styles.ownerImportTitle}>Configurar agora</div>
                    <div className={styles.ownerNote} style={{ marginTop: 0 }}>Você responde 6 perguntas curtas e deixa a operação do seu jeito.</div>
                    <div className={styles.ownerSectionFooter} style={{ marginTop: 16 }}>
                      <button className={styles.ownerV8Btn} onClick={goNext}>Começar configuração</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* §1 — Sua Clínica */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Sua Clínica</div>
                <div className={styles.ownerQuestion}>Como essa unidade deve aparecer para o vendedor?</div>
                <div className={styles.ownerHelper}>Esse nome identifica as regras ativas da clínica ou unidade no mundo do vendedor.</div>
                <div className={styles.ownerGrid}>
                  <div className={styles.ownerField}>
                    <label>Tipo de escopo</label>
                    <select className={styles.ownerSelect} value={draft.identity.scopeType}
                      onChange={e => update(m => { m.identity.scopeType = e.target.value as 'clinica' | 'unidade'; })}>
                      <option value="unidade">Unidade</option>
                      <option value="clinica">Clínica</option>
                    </select>
                  </div>
                  <div className={styles.ownerField}>
                    <label>Nome da clínica ou unidade</label>
                    <input className={styles.ownerInput} type="text" placeholder="Ex: Clínica Centro"
                      value={draft.identity.scopeName}
                      onChange={e => update(m => { m.identity.scopeName = e.target.value; })} />
                    <div className={styles.ownerNote}>O vendedor verá esse escopo como regra ativa.</div>
                  </div>
                </div>
                <div className={styles.ownerSectionFooter}>
                  <div className={styles.ownerCallout}>Quanto mais simples o nome, mais fácil para a equipe confiar que está usando a regra certa.</div>
                  <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Continuar</button>
                </div>
              </div>
            </div>

            {/* §2 — Preços Mínimos */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Preços Mínimos</div>
                <div className={styles.ownerQuestion}>Quais são os seus mínimos à vista?</div>
                <div className={styles.ownerHelper}>Você pode importar do sistema externo ou usar a tabela base como ponto de partida. Depois, se quiser, ajusta tudo manualmente.</div>

                <div className={styles.ownerTableCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <div className={styles.ownerImportTitle}>Sistema externo de mínimos</div>
                      <div className={styles.ownerNote} style={{ marginTop: 0 }}>Contrato: <code>clinicscale:external-minimum-prices:v1</code></div>
                    </div>
                    <div className={styles.ownerTopActions}>
                      <button className={styles.ownerV8Btn} onClick={() => window.open('minimo-demo.html', 'top-v10-minimo-demo')}>Abrir stub</button>
                      <button className={styles.ownerV8BtnPrimary} onClick={importExternalSnapshot}>Importar</button>
                      <button className={styles.ownerV8Btn} onClick={useFallbackMinimums}>Usar defaults</button>
                    </div>
                  </div>
                  {externalWarning && <div className={styles.ownerNote} style={{ marginTop: 8 }}>{externalWarning}</div>}
                  {importedBadge && <div className={styles.ownerNote} style={{ marginTop: 8 }}>{importedBadge}</div>}
                </div>

                <div className={styles.ownerTableCard} style={{ marginTop: 12 }}>
                  <div className={styles.ownerImportTitle}>Tabela manual de conferência</div>
                  <div className={styles.ownerNote} style={{ marginTop: 0 }}>Mesmo depois de importar, você pode corrigir qualquer mínimo antes de ativar.</div>
                  {hasMinimums ? (
                    <div className={styles.ownerTableWrap} style={{ marginTop: 14 }}>
                      <table className={styles.ownerTable}>
                        <thead><tr><th>Tratamento</th><th>Categoria</th><th>Mínimo à vista</th></tr></thead>
                        <tbody>
                          {procedureRows.map(proc => (
                            <tr key={proc.name}>
                              <td><strong>{proc.name}</strong></td>
                              <td>{proc.category}</td>
                              <td>
                                <input className={styles.ownerInlineInput} type="number" min="0" step="10"
                                  defaultValue={proc.minPrice}
                                  onBlur={e => updateMinimum(proc.name, e.target.value)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.ownerNote} style={{ marginTop: 12 }}>Escolha importar do sistema externo ou usar os defaults para começar a preencher.</div>
                  )}
                </div>

                <div className={styles.ownerSectionFooter}>
                  <div className={styles.ownerCallout}>Aqui nasce o piso absoluto da sua operação. O vendedor nunca deve descer abaixo dele.</div>
                  <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Continuar</button>
                </div>
              </div>
            </div>

            {/* §3 — Última Condição */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Última Condição</div>
                <div className={styles.ownerQuestion}>Qual é a condição final que você aceita aprovar sem expor juros?</div>
                <div className={styles.ownerHelper}>Esses dois números alimentam a construção da vitrine. Pense no parcelamento mais longo que ainda faz sentido para a sua operação.</div>
                <div className={styles.ownerGrid}>
                  <div className={styles.ownerField}>
                    <label>Juros mensal (%)</label>
                    <input className={styles.ownerInput} type="number" min="0" max="10" step="0.1"
                      value={draft.lastChanceCondition.monthlyInterestPct}
                      onChange={e => update(m => { m.lastChanceCondition.monthlyInterestPct = clamp(safeNumber(e.target.value, 1.5), 0, 10); })} />
                    <div className={styles.ownerNote}>Ex.: 1,5% ao mês.</div>
                  </div>
                  <div className={styles.ownerField}>
                    <label>Parcelas máximas</label>
                    <input className={styles.ownerInput} type="number" min="1" max="60" step="1"
                      value={draft.lastChanceCondition.maxInstallments}
                      onChange={e => update(m => { m.lastChanceCondition.maxInstallments = clamp(Math.round(safeNumber(e.target.value, 24)), 1, 60); })} />
                    <div className={styles.ownerNote}>Ex.: 24x.</div>
                  </div>
                </div>
                <div className={styles.ownerPreviewKpi}>
                  <div><span>Gordura sugerida</span><strong>{suggestedGordura.toFixed(1)}%</strong></div>
                  <div><span>Exemplo de mínimo</span><strong>{fmt(exampleMinPrice)}</strong></div>
                  <div><span>Tabela sugerida</span><strong>{fmt(exampleSuggested)}</strong></div>
                </div>
                <div className={styles.ownerSectionFooter}>
                  <div className={styles.ownerCallout}>A V10 usa essa condição como referência de narrativa. O motor da V7 continua protegendo o resto por baixo.</div>
                  <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Continuar</button>
                </div>
              </div>
            </div>

            {/* §4 — Tabela e Preços */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Tabela e Preços</div>
                <div className={styles.ownerQuestion}>Como você quer montar a vitrine que o vendedor vai apresentar?</div>
                <div className={styles.ownerHelper}>Você pode usar o sugerido pela V10, aplicar um percentual global ou ajustar por procedimento.</div>
                <div className={styles.ownerPillRow} style={{ marginBottom: 16 }}>
                  {(['suggested', 'globalPct', 'perProcedure'] as const).map(mode => (
                    <button key={mode}
                      className={`${styles.ownerPill}${draft.tableStrategy.mode === mode ? ' ' + styles.ownerPillActive : ''}`}
                      onClick={() => update(m => { m.tableStrategy.mode = mode; })}>
                      {mode === 'suggested' ? 'Usar sugerido' : mode === 'globalPct' ? 'Percentual global' : 'Ajuste por procedimento'}
                    </button>
                  ))}
                </div>

                {draft.tableStrategy.mode === 'globalPct' && (
                  <div className={styles.ownerGrid} style={{ marginBottom: 16 }}>
                    <div className={styles.ownerField}>
                      <label>Gordura global (%)</label>
                      <input className={styles.ownerInput} type="number" min="0" max="300" step="0.1"
                        value={draft.tableStrategy.globalGorduraPct}
                        onChange={e => update(m => { m.tableStrategy.globalGorduraPct = clamp(safeNumber(e.target.value, 25), 0, 300); })} />
                      <div className={styles.ownerNote}>Aplica o mesmo percentual de vitrine em todos os procedimentos.</div>
                    </div>
                  </div>
                )}

                {hasMinimums && (
                  <div className={styles.ownerTableWrap} style={{ marginTop: 14 }}>
                    <table className={styles.ownerTable}>
                      <thead>
                        <tr>
                          <th>Tratamento</th>
                          <th>Mínimo</th>
                          <th>Sugerido</th>
                          {draft.tableStrategy.mode === 'perProcedure' && <><th>Modo</th><th>Entrada</th></>}
                          <th>Tabela final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {procedureRows.map(proc => {
                          const state = procedureRowState(proc.name);
                          const ps = draft.tableStrategy.perProcedure[proc.name] || { inputMode: 'auto', gorduraPct: null, tableAbsolute: null };
                          return (
                            <tr key={proc.name}>
                              <td><strong>{proc.name}</strong></td>
                              <td>{fmt(state.minPrice)}</td>
                              <td>{fmt(suggestedTableValue(proc.name))}</td>
                              {draft.tableStrategy.mode === 'perProcedure' && (
                                <td>
                                  <select className={styles.ownerInlineSelect} value={ps.inputMode}
                                    onChange={e => update(m => { m.tableStrategy.perProcedure[proc.name].inputMode = e.target.value as any; })}>
                                    <option value="auto">Automático</option>
                                    <option value="pct">Percentual</option>
                                    <option value="absolute">Valor em R$</option>
                                  </select>
                                </td>
                              )}
                              {draft.tableStrategy.mode === 'perProcedure' && (
                                <td>
                                  {ps.inputMode === 'pct' && (
                                    <input className={styles.ownerInlineInput} type="number" min="0" max="300" step="0.1"
                                      value={ps.gorduraPct ?? ''}
                                      onChange={e => update(m => { m.tableStrategy.perProcedure[proc.name].gorduraPct = safeNumber(e.target.value, 0); })} />
                                  )}
                                  {ps.inputMode === 'absolute' && (
                                    <input className={styles.ownerInlineInput} type="number" min="0" step="10"
                                      value={ps.tableAbsolute ?? ''}
                                      onChange={e => update(m => { m.tableStrategy.perProcedure[proc.name].tableAbsolute = roundMoney(safeNumber(e.target.value, 0)); })} />
                                  )}
                                  {ps.inputMode === 'auto' && (
                                    <span className={styles.ownerNote} style={{ margin: 0 }}>Segue o sugerido</span>
                                  )}
                                </td>
                              )}
                              <td>
                                <strong>{fmt(state.preview)}</strong>
                                <div className={styles.ownerNote}>Diferença: {fmt(state.delta)} · {state.pct}%</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {!hasMinimums && (
                  <div className={styles.ownerCallout} style={{ marginTop: 14 }}>
                    Carregue os mínimos na etapa anterior para ver a prévia dos preços de vitrine.
                  </div>
                )}

                <div className={styles.ownerSectionFooter}>
                  <div className={styles.ownerCallout}>A V10 vai transformar essa decisão no preço de vitrine que o vendedor enxerga.</div>
                  <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Continuar</button>
                </div>
              </div>
            </div>

            {/* §5 — Formas de Pagamento */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Formas de Pagamento</div>
                <div className={styles.ownerQuestion}>Quais condições o vendedor pode oferecer sem te pedir autorização?</div>
                <div className={styles.ownerHelper}>A regra é simples: o vendedor só opera dentro do que você liberar aqui.</div>
                <div className={styles.ownerToggleGrid}>
                  {(['avista', 'entrada', 'parcelado', 'debito', 'boleto'] as const).map(method => {
                    const labels: Record<string, string> = {
                      avista: 'À vista', entrada: 'Entrada', parcelado: 'Cartão parcelado',
                      debito: 'Débito', boleto: 'Boleto',
                    };
                    return (
                      <label key={method} className={styles.ownerToggle}>
                        <input type="checkbox" checked={Boolean(draft.payments[method])}
                          onChange={e => update(m => { m.payments[method] = e.target.checked; })} />
                        <span>{labels[method]}</span>
                      </label>
                    );
                  })}
                </div>

                <div className={styles.ownerTableCard} style={{ marginTop: 18 }}>
                  <div className={styles.ownerImportTitle}>Indicadores da equipe</div>
                  <div className={styles.ownerNote} style={{ marginTop: 0 }}>
                    Edite os nomes, cores, ordem e quais indicadores o sistema usa. Você também pode criar tags extras só para treinamento.
                  </div>
                  <div className={styles.ownerIndicatorEditor}>
                    {draft.indicatorTags.map((tag, index) => (
                      <div key={tag.id} className={styles.ownerIndicatorEditorRow}>
                        <button
                          className={styles.ownerIndicatorEditorMove}
                          type="button"
                          title="Mover para cima"
                          onClick={() => moveIndicatorTag(index, -1)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          className={styles.ownerIndicatorEditorMove}
                          type="button"
                          title="Mover para baixo"
                          onClick={() => moveIndicatorTag(index, 1)}
                          disabled={index === draft.indicatorTags.length - 1}
                        >
                          ↓
                        </button>
                        <input
                          className={styles.ownerInlineInput}
                          type="text"
                          value={tag.label}
                          placeholder="Nome da tag"
                          onChange={e => update(m => { m.indicatorTags[index].label = e.target.value; })}
                          onBlur={commitIndicatorConfig}
                        />
                        <input
                          className={styles.ownerIndicatorEditorColor}
                          type="color"
                          value={tag.color}
                          onChange={e => update(m => {
                            m.indicatorTags[index].color = e.target.value;
                            normalizeIndicatorConfig(m);
                          })}
                        />
                        <select
                          className={styles.ownerInlineSelect}
                          value={tag.mapsTo}
                          onChange={e => update(m => {
                            m.indicatorTags[index].mapsTo = e.target.value as IndicatorRoleKey;
                            normalizeIndicatorConfig(m);
                          })}
                        >
                          {indicatorRoleOptions.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <button
                          className={styles.ownerIndicatorEditorRemove}
                          type="button"
                          title="Remover tag"
                          onClick={() => removeIndicatorTag(index)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button className={styles.ownerV8Btn} type="button" onClick={addIndicatorTag}>
                      + Adicionar tag
                    </button>
                  </div>

                  <div className={styles.ownerImportTitle} style={{ marginTop: 22 }}>Textos das condicionais</div>
                  <div className={styles.ownerNote} style={{ marginTop: 0 }}>
                    Esses nomes aparecem no seletor de condição e também na leitura interna da equipe.
                  </div>
                  <div className={styles.ownerGrid} style={{ marginTop: 14 }}>
                    <div className={styles.ownerField}>
                      <label>Premium</label>
                      <input
                        className={styles.ownerInput}
                        type="text"
                        value={draft.indicatorRoleLabels.premium}
                        onChange={e => update(m => { m.indicatorRoleLabels.premium = e.target.value; })}
                        onBlur={commitIndicatorConfig}
                      />
                    </div>
                    <div className={styles.ownerField}>
                      <label>Equilibrado</label>
                      <input
                        className={styles.ownerInput}
                        type="text"
                        value={draft.indicatorRoleLabels.good}
                        onChange={e => update(m => { m.indicatorRoleLabels.good = e.target.value; })}
                        onBlur={commitIndicatorConfig}
                      />
                    </div>
                    <div className={styles.ownerField}>
                      <label>Flexível</label>
                      <input
                        className={styles.ownerInput}
                        type="text"
                        value={draft.indicatorRoleLabels.warn}
                        onChange={e => update(m => { m.indicatorRoleLabels.warn = e.target.value; })}
                        onBlur={commitIndicatorConfig}
                      />
                    </div>
                    <div className={styles.ownerField}>
                      <label>Limite</label>
                      <input
                        className={styles.ownerInput}
                        type="text"
                        value={draft.indicatorRoleLabels.limit}
                        onChange={e => update(m => { m.indicatorRoleLabels.limit = e.target.value; })}
                        onBlur={commitIndicatorConfig}
                      />
                    </div>
                    <div className={styles.ownerField}>
                      <label>Neutro</label>
                      <input
                        className={styles.ownerInput}
                        type="text"
                        value={draft.indicatorRoleLabels.neutral}
                        onChange={e => update(m => { m.indicatorRoleLabels.neutral = e.target.value; })}
                        onBlur={commitIndicatorConfig}
                      />
                    </div>
                    <div className={styles.ownerField}>
                      <label>Só legenda</label>
                      <input
                        className={styles.ownerInput}
                        type="text"
                        value={draft.indicatorRoleLabels.legend}
                        onChange={e => update(m => { m.indicatorRoleLabels.legend = e.target.value; })}
                        onBlur={commitIndicatorConfig}
                      />
                    </div>
                  </div>

                  <div className={styles.ownerImportTitle} style={{ marginTop: 22 }}>Semáforo comercial</div>
                  <div className={styles.ownerNote} style={{ marginTop: 0 }}>
                    Essa régua decide quando a equipe enxerga uma condição como premium, equilibrada, flexível ou no limite. Você pode escolher um perfil pronto e só ajustar se quiser.
                  </div>

                  <div className={styles.ownerPillRow} style={{ marginTop: 14 }}>
                    {(Object.keys(INDICATOR_PRESETS) as IndicatorPresetKey[]).map(presetKey => (
                      <button
                        key={presetKey}
                        type="button"
                        className={`${styles.ownerPill}${indicatorPresetKey === presetKey ? ` ${styles.ownerPillActive}` : ''}`}
                        onClick={() => applyIndicatorPreset(presetKey)}
                      >
                        {INDICATOR_PRESETS[presetKey].label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`${styles.ownerPill}${indicatorPresetKey === 'custom' ? ` ${styles.ownerPillActive}` : ''}`}
                      disabled
                    >
                      Personalizado
                    </button>
                  </div>

                  <div className={styles.ownerCallout} style={{ marginTop: 14 }}>{indicatorPresetDescription}</div>

                  <div className={styles.ownerImportTitle} style={{ marginTop: 22 }}>Leitura rápida do semáforo</div>
                  <div className={styles.ownerNote} style={{ marginTop: 0 }}>
                    Aqui está a regra já traduzida em português simples, sem precisar interpretar número por número.
                  </div>
                  <div className={styles.ownerSummaryGrid} style={{ marginTop: 14 }}>
                    <div className={styles.ownerSummaryCard}>
                      <div className={styles.ownerSummaryLabel}>À vista e débito</div>
                      <strong>Distância até o mínimo</strong>
                      <span>{semaforoCashSummary()}</span>
                    </div>
                    <div className={styles.ownerSummaryCard}>
                      <div className={styles.ownerSummaryLabel}>Entrada</div>
                      <strong>Comparada ao sugerido</strong>
                      <span>{semaforoEntrySummary()}</span>
                    </div>
                    <div className={styles.ownerSummaryCard}>
                      <div className={styles.ownerSummaryLabel}>Cartão</div>
                      <strong>Comparado à faixa ideal</strong>
                      <span>{semaforoCardSummary('card')}</span>
                    </div>
                    <div className={styles.ownerSummaryCard}>
                      <div className={styles.ownerSummaryLabel}>Boleto</div>
                      <strong>Comparado à faixa ideal</strong>
                      <span>{semaforoCardSummary('boleto')}</span>
                    </div>
                  </div>

                  <div className={styles.ownerTopActions} style={{ marginTop: 18 }}>
                    <button className={styles.ownerV8Btn} type="button" onClick={() => setSemaforoAdvancedOpen(open => !open)}>
                      {semaforoAdvancedOpen ? 'Fechar ajuste fino' : 'Abrir ajuste fino'}
                    </button>
                  </div>

                  {semaforoAdvancedOpen && (
                    <>
                      <div className={styles.ownerImportTitle} style={{ marginTop: 22 }}>Ajuste fino do semáforo</div>
                      <div className={styles.ownerNote} style={{ marginTop: 0 }}>
                        Use essa parte só se você quiser refinar exatamente onde cada faixa começa.
                      </div>

                      <div className={styles.ownerGrid} style={{ marginTop: 14 }}>
                        <div className={styles.ownerField}>
                          <label>À vista / débito · limite até (%)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={draft.indicatorRules.cash.limitMaxPct}
                            onChange={e => update(m => {
                              m.indicatorRules.cash.limitMaxPct = safeNumber(e.target.value, indicatorRules.cash.limitMaxPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Muito perto do piso já entra no limite.</div>
                        </div>
                        <div className={styles.ownerField}>
                          <label>À vista / débito · flexível até (%)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={draft.indicatorRules.cash.warnMaxPct}
                            onChange={e => update(m => {
                              m.indicatorRules.cash.warnMaxPct = safeNumber(e.target.value, indicatorRules.cash.warnMaxPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Até aqui a leitura entra como mais flexível.</div>
                        </div>
                        <div className={styles.ownerField}>
                          <label>À vista / débito · equilibrado até (%)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={draft.indicatorRules.cash.goodMaxPct}
                            onChange={e => update(m => {
                              m.indicatorRules.cash.goodMaxPct = safeNumber(e.target.value, indicatorRules.cash.goodMaxPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Acima disso a condição vira premium.</div>
                        </div>

                        <div className={styles.ownerField}>
                          <label>Entrada · premium acima do sugerido (+pts)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={draft.indicatorRules.entry.premiumAboveSuggestedPct}
                            onChange={e => update(m => {
                              m.indicatorRules.entry.premiumAboveSuggestedPct = safeNumber(e.target.value, indicatorRules.entry.premiumAboveSuggestedPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Quantos pontos acima da entrada mínima fazem a entrada virar premium.</div>
                        </div>

                        <div className={styles.ownerField}>
                          <label>Cartão · premium até (% da faixa ideal)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="300"
                            step="1"
                            value={draft.indicatorRules.card.premiumUpToIdealPct}
                            onChange={e => update(m => {
                              m.indicatorRules.card.premiumUpToIdealPct = safeNumber(e.target.value, indicatorRules.card.premiumUpToIdealPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Quanto do prazo ideal ainda conta como premium.</div>
                        </div>
                        <div className={styles.ownerField}>
                          <label>Cartão · equilibrado até (% da faixa ideal)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="300"
                            step="1"
                            value={draft.indicatorRules.card.goodUpToIdealPct}
                            onChange={e => update(m => {
                              m.indicatorRules.card.goodUpToIdealPct = safeNumber(e.target.value, indicatorRules.card.goodUpToIdealPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Acima disso, antes do máximo, vira flexível.</div>
                        </div>

                        <div className={styles.ownerField}>
                          <label>Boleto · premium até (% da faixa ideal)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="300"
                            step="1"
                            value={draft.indicatorRules.boleto.premiumUpToIdealPct}
                            onChange={e => update(m => {
                              m.indicatorRules.boleto.premiumUpToIdealPct = safeNumber(e.target.value, indicatorRules.boleto.premiumUpToIdealPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Se ficar em zero, o boleto não usa premium.</div>
                        </div>
                        <div className={styles.ownerField}>
                          <label>Boleto · equilibrado até (% da faixa ideal)</label>
                          <input
                            className={styles.ownerInput}
                            type="number"
                            min="0"
                            max="300"
                            step="1"
                            value={draft.indicatorRules.boleto.goodUpToIdealPct}
                            onChange={e => update(m => {
                              m.indicatorRules.boleto.goodUpToIdealPct = safeNumber(e.target.value, indicatorRules.boleto.goodUpToIdealPct);
                              normalizeIndicatorConfig(m);
                            })}
                          />
                          <div className={styles.ownerNote}>Acima disso, antes do máximo, vira flexível.</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className={styles.ownerSectionFooter}>
                  <div className={styles.ownerCallout}>Se quiser manter o boleto como carta na manga, deixe ligado só quando realmente fizer sentido para a operação.</div>
                  <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Continuar</button>
                </div>
              </div>
            </div>

            {/* §6 — Cartão e Juros */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Cartão e Juros</div>
                <div className={styles.ownerQuestion}>Como cartão e boleto devem se comportar quando o vendedor parcelar?</div>
                <div className={styles.ownerHelper}>Aqui você decide se existe faixa sem juros, quando começa a cobrar taxa no cartão e como o boleto deve se comportar.</div>

                <div className={styles.ownerGrid}>
                  <div className={styles.ownerField}>
                    <label>Parcelamento sem juros</label>
                    <select className={styles.ownerSelect}
                      value={draft.cardTerms.noInterestEnabled ? 'true' : 'false'}
                      onChange={e => update(m => { m.cardTerms.noInterestEnabled = e.target.value === 'true'; })}>
                      <option value="true">Ligado</option>
                      <option value="false">Desligado</option>
                    </select>
                    <div className={styles.ownerNote}>Se estiver ligado, a V10 zera a taxa até a faixa que você definir.</div>
                  </div>
                  {draft.cardTerms.noInterestEnabled && (
                    <div className={styles.ownerField}>
                      <label>Sem juros até</label>
                      <input className={styles.ownerInput} type="number" min="1" max="36" step="1"
                        value={draft.cardTerms.noInterestUpToInstallments}
                        onChange={e => update(m => { m.cardTerms.noInterestUpToInstallments = clamp(Math.round(safeNumber(e.target.value, 0)), 0, 36); })} />
                      <div className={styles.ownerNote}>Ex.: 3 significa 1x, 2x e 3x sem juros.</div>
                    </div>
                  )}
                  <div className={styles.ownerField}>
                    <label>Cobrar taxa a partir de</label>
                    <input className={styles.ownerInput} type="number" min="1" max="36" step="1"
                      value={draft.cardTerms.chargeInterestFromInstallments}
                      onChange={e => update(m => { m.cardTerms.chargeInterestFromInstallments = clamp(Math.round(safeNumber(e.target.value, 1)), 1, 36); })} />
                    <div className={styles.ownerNote}>A partir daqui a V10 passa a aplicar taxa no saldo parcelado.</div>
                  </div>
                </div>

                <div className={styles.ownerGrid} style={{ marginTop: 18 }}>
                  <div className={styles.ownerField}>
                    <label>Taxa do cartão</label>
                    <select className={styles.ownerSelect}
                      value={draft.cardTerms.useDefaultRateTable ? 'true' : 'false'}
                      onChange={e => update(m => { m.cardTerms.useDefaultRateTable = e.target.value === 'true'; })}>
                      <option value="true">Usar tabela padrão da V10</option>
                      <option value="false">Usar taxa fixa</option>
                    </select>
                    <div className={styles.ownerNote}>A tabela padrão varia por número de parcelas. A taxa fixa usa o mesmo percentual em toda faixa com juros.</div>
                  </div>
                  {!draft.cardTerms.useDefaultRateTable && (
                    <div className={styles.ownerField}>
                      <label>Taxa fixa do cartão (%)</label>
                      <input className={styles.ownerInput} type="number" min="0" max="40" step="0.1"
                        value={draft.cardTerms.flatRatePct}
                        onChange={e => update(m => { m.cardTerms.flatRatePct = clamp(safeNumber(e.target.value, 3.9), 0, 40); })} />
                      <div className={styles.ownerNote}>Ex.: 3,9% em toda parcela que já tiver juros.</div>
                    </div>
                  )}
                </div>

                <div className={styles.ownerGrid} style={{ marginTop: 18 }}>
                  <div className={styles.ownerField}>
                    <label>Antecipação</label>
                    <select className={styles.ownerSelect}
                      value={draft.cardTerms.anticipationEnabled ? 'true' : 'false'}
                      onChange={e => update(m => { m.cardTerms.anticipationEnabled = e.target.value === 'true'; })}>
                      <option value="false">Desligada</option>
                      <option value="true">Ligada</option>
                    </select>
                    <div className={styles.ownerNote}>Quando ligada, soma um extra ao cartão a partir da faixa que você escolher.</div>
                  </div>
                  {draft.cardTerms.anticipationEnabled && (<>
                    <div className={styles.ownerField}>
                      <label>Taxa de antecipação (%)</label>
                      <input className={styles.ownerInput} type="number" min="0" max="10" step="0.1"
                        value={draft.cardTerms.anticipationPct}
                        onChange={e => update(m => { m.cardTerms.anticipationPct = clamp(safeNumber(e.target.value, 0.6), 0, 10); })} />
                      <div className={styles.ownerNote}>Ex.: 0,6%.</div>
                    </div>
                    <div className={styles.ownerField}>
                      <label>Aplicar antecipação a partir de</label>
                      <input className={styles.ownerInput} type="number" min="1" max="36" step="1"
                        value={draft.cardTerms.anticipationFromInstallments}
                        onChange={e => update(m => { m.cardTerms.anticipationFromInstallments = clamp(Math.round(safeNumber(e.target.value, 2)), 1, 36); })} />
                      <div className={styles.ownerNote}>Ex.: a partir de 2x.</div>
                    </div>
                  </>)}
                </div>

                <div className={styles.ownerTableCard} style={{ marginTop: 18 }}>
                  <div className={styles.ownerImportTitle}>Boleto</div>
                  <div className={styles.ownerNote} style={{ marginTop: 0 }}>Use a mesma lógica: você pode ter uma faixa sem juros e depois começar a cobrar juros ao mês.</div>
                  <div className={styles.ownerGrid} style={{ marginTop: 14 }}>
                    <div className={styles.ownerField}>
                      <label>Boleto sem juros</label>
                      <select className={styles.ownerSelect}
                        value={draft.boletoTerms.noInterestEnabled ? 'true' : 'false'}
                        onChange={e => update(m => { m.boletoTerms.noInterestEnabled = e.target.value === 'true'; })}>
                        <option value="true">Ligado</option>
                        <option value="false">Desligado</option>
                      </select>
                      <div className={styles.ownerNote}>Se estiver ligado, o boleto não recebe juros até a faixa definida.</div>
                    </div>
                    {draft.boletoTerms.noInterestEnabled && (
                      <div className={styles.ownerField}>
                        <label>Sem juros até</label>
                        <input className={styles.ownerInput} type="number" min="1" max="60" step="1"
                          value={draft.boletoTerms.noInterestUpToInstallments}
                          onChange={e => update(m => { m.boletoTerms.noInterestUpToInstallments = clamp(Math.round(safeNumber(e.target.value, 0)), 0, 60); })} />
                        <div className={styles.ownerNote}>Ex.: 3 significa até 3x sem juros no boleto.</div>
                      </div>
                    )}
                    <div className={styles.ownerField}>
                      <label>Cobrar juros a partir de</label>
                      <input className={styles.ownerInput} type="number" min="1" max="60" step="1"
                        value={draft.boletoTerms.chargeInterestFromInstallments}
                        onChange={e => update(m => { m.boletoTerms.chargeInterestFromInstallments = clamp(Math.round(safeNumber(e.target.value, 1)), 1, 60); })} />
                      <div className={styles.ownerNote}>A partir daqui a V10 passa a aplicar juros no boleto.</div>
                    </div>
                    <div className={styles.ownerField}>
                      <label>Juros do boleto (% ao mês)</label>
                      <input className={styles.ownerInput} type="number" min="0" max="10" step="0.1"
                        value={draft.boletoTerms.monthlyInterestPct}
                        onChange={e => update(m => { m.boletoTerms.monthlyInterestPct = clamp(safeNumber(e.target.value, 1.5), 0, 10); })} />
                      <div className={styles.ownerNote}>Ex.: 1,5% ao mês.</div>
                    </div>
                  </div>
                </div>

                <div className={styles.ownerSectionFooter}>
                  <div className={styles.ownerCallout}>Configure as taxas conforme sua maquininha. O motor usa isso para calcular o total que o cliente paga.</div>
                  <button className={styles.ownerV8BtnPrimary} onClick={goNext}>Ir para revisão</button>
                </div>
              </div>
            </div>

            {/* §7 — Pronto */}
            <div className={styles.ownerSection}>
              <div className={styles.ownerCard}>
                <div className={styles.ownerEyebrow}>Pronto</div>
                {draft.completed && (
                  <div className={styles.ownerStatusBanner}>Configuração já ativada. Você pode revisar tudo aqui e reaplicar quando quiser.</div>
                )}
                <div className={styles.ownerQuestion}>Quer ativar essa configuração agora no vendedor?</div>
                <div className={styles.ownerHelper}>Quando você ativar, a V10 converte este modelo para ownerSettings compatível com o motor da V7 e sincroniza tudo no vendedor.</div>
                <div className={styles.ownerSummaryGrid}>
                  <div className={styles.ownerSummaryCard}>
                    <div className={styles.ownerSummaryLabel}>Clínica</div>
                    <strong>{draft.identity.scopeName || '—'}</strong>
                    <span>{draft.identity.scopeType === 'clinica' ? 'Regra da clínica inteira' : 'Regra por unidade'}</span>
                  </div>
                  <div className={styles.ownerSummaryCard}>
                    <div className={styles.ownerSummaryLabel}>Mínimos</div>
                    <strong>{draft.externalMinimumSnapshot.items.length || 0}</strong>
                    <span>{draft.externalMinimumSnapshot.source ? 'Fonte: ' + draft.externalMinimumSnapshot.source : 'Ainda não importado'}</span>
                  </div>
                  <div className={styles.ownerSummaryCard}>
                    <div className={styles.ownerSummaryLabel}>Última condição</div>
                    <strong>{draft.lastChanceCondition.maxInstallments}x</strong>
                    <span>{draft.lastChanceCondition.monthlyInterestPct}% ao mês</span>
                  </div>
                  <div className={styles.ownerSummaryCard}>
                    <div className={styles.ownerSummaryLabel}>Tabela</div>
                    <strong>{draft.tableStrategy.mode === 'suggested' ? 'Sugerida' : draft.tableStrategy.mode === 'globalPct' ? 'Percentual global' : 'Por procedimento'}</strong>
                    <span>{draft.tableStrategy.mode === 'globalPct' ? `${draft.tableStrategy.globalGorduraPct}% aplicado em todos` : 'Narrativa pronta para o vendedor'}</span>
                  </div>
                  <div className={styles.ownerSummaryCard}>
                    <div className={styles.ownerSummaryLabel}>Pagamentos</div>
                    <strong>{Object.values(draft.payments).filter(Boolean).length}</strong>
                    <span>formas liberadas para o vendedor</span>
                  </div>
                  <div className={styles.ownerSummaryCard}>
                    <div className={styles.ownerSummaryLabel}>Cartão</div>
                    <strong>{draft.cardTerms.noInterestEnabled ? `Sem juros até ${draft.cardTerms.noInterestUpToInstallments}x` : 'Sem juros desligado'}</strong>
                    <span>{draft.cardTerms.useDefaultRateTable ? 'Usando tabela padrão da V10' : `Taxa fixa de ${draft.cardTerms.flatRatePct}%`}</span>
                  </div>
                  <div className={styles.ownerSummaryCard}>
                    <div className={styles.ownerSummaryLabel}>Boleto</div>
                    <strong>{draft.boletoTerms.noInterestEnabled ? `Sem juros até ${draft.boletoTerms.noInterestUpToInstallments}x` : 'Sem juros desligado'}</strong>
                    <span>{draft.boletoTerms.monthlyInterestPct}% ao mês a partir de {draft.boletoTerms.chargeInterestFromInstallments}x</span>
                  </div>
                </div>
                <div className={styles.ownerSectionFooter}>
                  <button className={styles.ownerV8BtnPrimary} onClick={save}>
                    {draft.completed ? 'Reaplicar configuração' : 'Ativar configuração'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        <button className={`${styles.ownerArrow} ${styles.ownerArrowRight}`} onClick={goNext} disabled={section === totalSections - 1}>›</button>
      </div>

    </div>
  );
}
