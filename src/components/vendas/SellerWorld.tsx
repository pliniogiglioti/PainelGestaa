import { useState, useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react';
import type { Plan, OwnerSettings } from './types';
import { uid } from './calcEngine';
import { PlanCard } from './PlanCard';
import styles from './Vendas.module.css';

interface SellerWorldProps {
  ownerSettings: OwnerSettings;
  onOpenOwnerWizard: () => void;
  onBack?: () => void;
  onNewSession?: () => void;
  initialPlanName?: string;
  initialPlans?: Plan[] | null;
  onPlansChange?: (plans: Plan[]) => void;
  onSaveSale?: (plans: Plan[]) => Promise<void>;
  patientName?: string;
  proposalTitle?: string;
  onPatientNameChange?: (value: string) => void;
  onProposalTitleChange?: (value: string) => void;
}

const BADGE_LABELS = ['A', 'B', 'C'];
const BADGE_CLASSES = [styles.badgeA, styles.badgeB, styles.badgeC];
const MAX_PLANS = 3;

export const PLAN_NAME_SUGGESTIONS = [
  'Diamante', 'Ouro', 'Prata',
  'Premium', 'Essencial', 'Básico',
  'Prime', 'Médio', 'Básico',
];

function nextPlanName(baseName: string | undefined, offset: number): string {
  const baseIndex = baseName ? PLAN_NAME_SUGGESTIONS.indexOf(baseName) : -1;
  return PLAN_NAME_SUGGESTIONS[(baseIndex >= 0 ? baseIndex : 0) + offset] ?? `Plano ${offset + 1}`;
}

function makePlan(index: number, firstName?: string, baseName?: string): Plan {
  return {
    id: uid(),
    name: (index === 0 && firstName) ? firstName : nextPlanName(baseName, index),
    items: [],
    totalRevealed: false,
    totalVisible: false,
    totalEditing: false,
    totalEditInput: 0,
    totalOverride: null,
    paymentRevealed: false,
    paymentVisible: false,
    cartaNaMangaActive: false,
    extraDiscountPct: 0,
    planCampaignPctRequested: 0,
    planCampaignPctEffective: 0,
    shownPayments: ['parcelado', 'avista'],
    programmedInfoOpen: false,
    redoStack: [],
    searchQuery: '',
    dropdownOpen: false,
    payment: {
      entradaPct: 0,
      parcelas: 12,
      descontoAVista: 0,
      parcelasBoleto: 0,
      entradaEditing: false,
      entradaEditInput: 0,
      entradaOverride: null,
      aVistaOverride: null,
      parceladoOverride: null,
      boletoOverride: null,
      debitoOverride: null,
      editingField: null,
      editInput: 0,
    },
  };
}

function hydratePlan(input: Partial<Plan> | undefined, fallbackName?: string): Plan {
  const base = makePlan(0, fallbackName);
  const payment = { ...base.payment, ...(input?.payment || {}) };
  const items = Array.isArray(input?.items)
    ? input.items.map(item => ({
        ...item,
        campaignEditing: false,
        campaignInput: '',
        priceEditing: false,
        priceEditInput: '',
      }))
    : [];

  return {
    ...base,
    ...input,
    items,
    payment,
    dropdownOpen: false,
    searchQuery: '',
    programmedInfoOpen: false,
  };
}

interface ToastState {
  msg: string;
  kind: 'info' | 'danger';
}

type ColorMode = 'dark' | 'light';
const THEME_STORAGE_KEY = 'top-v10-theme';

export function SellerWorld({ ownerSettings, onOpenOwnerWizard, onBack, onNewSession, initialPlanName, initialPlans, onPlansChange, onSaveSale, patientName, proposalTitle, onPatientNameChange, onProposalTitleChange }: SellerWorldProps) {
  const [plans, setPlans] = useState<Plan[]>(() => (
    initialPlans?.length
      ? initialPlans.map(plan => hydratePlan(plan, initialPlanName))
      : [makePlan(0, initialPlanName)]
  ));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [equalizedPlans, setEqualizedPlans] = useState(false);
  const [winnerPlanId, setWinnerPlanId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plansAreaRef = useRef<HTMLDivElement>(null);
  const [draggingPlanId, setDraggingPlanId] = useState<string | null>(null);
  const [dragTransform, setDragTransform] = useState({ x: 0, y: 0, rotation: 0 });
  const [contentScale, setContentScaleState] = useState(1);
  const [savingSale, setSavingSale] = useState(false);
  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      return savedTheme === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const notify = useCallback((msg: string, kind: 'info' | 'danger' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  useEffect(() => {
    onPlansChange?.(plans);
  }, [onPlansChange, plans]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', colorMode === 'light');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, colorMode);
    } catch {
      // localStorage may be unavailable in private or restricted browser contexts.
    }

    return () => {
      document.documentElement.classList.remove('light');
    };
  }, [colorMode]);

  function setColorMode(mode: ColorMode) {
    setColorModeState(mode);
  }

  function addPlan() {
    if (plans.length >= MAX_PLANS) { notify('Máximo de 3 planos.', 'info'); return; }
    setPlans(prev => [...prev, makePlan(prev.length, undefined, prev[0]?.name)]);
  }

  function removePlan(id: string) {
    setPlans(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(p => p.id !== id);
    });
    setWinnerPlanId(prev => prev === id ? null : prev);
  }

  function toggleWinner(id: string) {
    setWinnerPlanId(prev => prev === id ? null : id);
  }

  function handlePlanPointerDown(planId: string, event: ReactPointerEvent<HTMLDivElement>) {
    const interactiveSelector = 'input, button, textarea, select, a, label, [data-no-drag]';
    if ((event.target as HTMLElement).closest(interactiveSelector)) return;
    if (event.button !== 0) return;
    const container = plansAreaRef.current;
    if (!container) return;

    event.preventDefault();
    const cardEl = event.currentTarget;
    cardEl.setPointerCapture(event.pointerId);

    const state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      targetIndex: plans.findIndex(p => p.id === planId),
      moved: false,
    };
    setDraggingPlanId(planId);
    setDragTransform({ x: 0, y: -6, rotation: 0 });

    const resolveTargetIndex = (pointerX: number) => {
      const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-plan-id]'))
        .filter(card => card.dataset.planId !== planId);
      let targetIndex = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (pointerX < rect.left + rect.width / 2) { targetIndex = i; break; }
      }
      return targetIndex;
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== state.pointerId) return;
      const deltaX = moveEvent.clientX - state.startX;
      const deltaY = moveEvent.clientY - state.startY;
      if (!state.moved && Math.abs(deltaX) + Math.abs(deltaY) < 10) return;
      moveEvent.preventDefault();
      state.moved = true;
      state.targetIndex = resolveTargetIndex(moveEvent.clientX);
      setDragTransform({ x: deltaX, y: deltaY - 8, rotation: Math.max(-5, Math.min(5, deltaX / 26)) });
    };

    const stopDragging = () => {
      if (state.moved) {
        setPlans(prev => {
          const currentIndex = prev.findIndex(p => p.id === planId);
          const nextIndex = state.targetIndex;
          if (currentIndex < 0 || nextIndex < 0 || currentIndex === nextIndex) return prev;
          const next = [...prev];
          const [movedPlan] = next.splice(currentIndex, 1);
          next.splice(nextIndex, 0, movedPlan);
          return next;
        });
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      cardEl.releasePointerCapture(event.pointerId);
      setDraggingPlanId(null);
      setDragTransform({ x: 0, y: 0, rotation: 0 });
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', stopDragging, { once: true });
    window.addEventListener('pointercancel', stopDragging, { once: true });
  }

  function updatePlan(id: string, updated: Plan) {
    setPlans(prev => prev.map(p => p.id === id ? updated : p));
  }

  function clearAll() {
    setPlans([makePlan(0, initialPlanName)]);
    setWinnerPlanId(null);
  }

  function setContentScale(nextScale: number) {
    const rounded = Math.round(Math.min(1.35, Math.max(0.72, nextScale)) * 100) / 100;
    setContentScaleState(rounded);
  }

  function fitZoom() {
    setContentScale(1);
  }

  function zoomIn() {
    setContentScale(contentScale + 0.05);
  }

  function zoomOut() {
    const floor = equalizedPlans && plans.length > 1 ? 0.72 : 1;
    setContentScale(Math.max(floor, contentScale - 0.05));
  }

  function revelarTotal() {
    setPlans(prev => prev.map(p => p.items.length > 0 ? { ...p, totalRevealed: true } : p));
  }

  function mostrarTotal() {
    setPlans(prev => prev.map(p => p.totalRevealed ? { ...p, totalVisible: true } : p));
  }

  async function saveSale() {
    if (!onSaveSale) return;
    try {
      setSavingSale(true);
      await onSaveSale(plans);
      notify('Venda salva no banco de dados.', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel salvar a venda.';
      notify(message, 'danger');
    } finally {
      setSavingSale(false);
    }
  }

  const activePlans = plans.filter(p => p.items.length > 0);
  const showRevelarTotal = activePlans.length > 0 && activePlans.some(p => !p.totalRevealed);
  const showMostrarTotal = !showRevelarTotal && activePlans.length > 0 && activePlans.some(p => !p.totalVisible);

  const maxItems = Math.max(0, ...plans.map(p => p.items.length));
  const densityClass =
    maxItems <= 2 ? styles.densitySpacious :
    maxItems <= 5 ? styles.densityNormal :
    maxItems <= 9 ? styles.densityCompact :
    styles.densityDense;

  return (
    <div className={styles.workspaceShell}>
      <div className={styles.workspaceStage} style={{ '--content-scale': contentScale } as CSSProperties}>
        {(patientName || proposalTitle) && (
          <div className={styles.workspaceHeader}>
            {patientName && <div className={styles.workspaceTitle}>{patientName}</div>}
            {proposalTitle && <div className={styles.workspaceSubtitle}>{proposalTitle}</div>}
          </div>
        )}
        <div ref={plansAreaRef} className={`${styles.plansArea} ${densityClass} ${equalizedPlans && plans.length > 1 ? styles.isEqualized : ''} ${draggingPlanId ? styles.isCardDragging : ''}`}>
          {plans.map((plan, idx) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              planIndex={idx}
              plansCount={plans.length}
              ownerSettings={ownerSettings}
              onChange={updated => updatePlan(plan.id, updated)}
              onRemove={() => removePlan(plan.id)}
              onNotify={notify}
              badgeLabel={BADGE_LABELS[idx] ?? String(idx + 1)}
              badgeClass={BADGE_CLASSES[idx] ?? styles.badgeA}
              isDragging={draggingPlanId === plan.id}
              dragStyle={draggingPlanId === plan.id ? { transform: `translate3d(${dragTransform.x}px, ${dragTransform.y}px, 0) rotate(${dragTransform.rotation}deg)` } : undefined}
              onCardPointerDown={e => handlePlanPointerDown(plan.id, e)}
              isWinner={winnerPlanId === plan.id}
              isLoser={winnerPlanId !== null && winnerPlanId !== plan.id}
              onToggleWinner={() => toggleWinner(plan.id)}
            />
          ))}
          {plans.length < MAX_PLANS && (
            <button className={styles.addPlanBtn} onClick={addPlan} title="Adicionar plano">+</button>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>

        {/* Toggle strip — sempre visível */}
        <button className={styles.sidebarToggle} onClick={() => setSidebarOpen(o => !o)}
          title={sidebarOpen ? 'Ocultar painel' : 'Mostrar painel'}>
          {sidebarOpen ? '›' : '‹'}
        </button>

        {/* Conteúdo — só visível quando aberto */}
        {sidebarOpen && (
          <div className={styles.sidebarContent}>

            {/* Editar atendimento */}
            <div className={styles.sbSection}>
              <div className={styles.sbEyebrow}>Editar atendimento</div>
              <div className={styles.sbFieldLabel}>Paciente</div>
              <input className={styles.sbInlineInput} type="text"
                value={patientName ?? ''}
                onChange={e => onPatientNameChange?.(e.target.value)}
                placeholder="Nome do paciente" />
              <div className={styles.sbFieldLabel}>Planejamento</div>
              <input className={styles.sbInlineInput} type="text"
                value={proposalTitle ?? ''}
                onChange={e => onProposalTitleChange?.(e.target.value)}
                placeholder="Opcional" />
            </div>

            <div className={styles.sbDivider} />

            {/* Ação narrativa principal */}
            {(showRevelarTotal || showMostrarTotal) && (
              <>
                <div className={styles.sbSection}>
                  <button className={`${styles.sbBtn} ${styles.sbBtnPrimary}`}
                    onClick={showRevelarTotal ? revelarTotal : mostrarTotal}>
                    {showRevelarTotal ? 'Revelar Total' : 'Mostrar'}
                  </button>
                </div>
                <div className={styles.sbDivider} />
              </>
            )}

            {/* Ações secundárias */}
            <div className={styles.sbSection}>
              <button className={styles.sbBtn} onClick={onOpenOwnerWizard}>Voltar ao Dono</button>
              {plans.length < MAX_PLANS && (
                <button className={styles.sbBtn} onClick={addPlan}>+ Comparação</button>
              )}
              {plans.length > 1 && (
                <button className={`${styles.sbBtn} ${equalizedPlans ? styles.sbBtnActive : ''}`}
                  onClick={() => setEqualizedPlans(e => !e)}>
                  ⊟ Equalizar
                </button>
              )}
              {onBack && (
                <button className={styles.sbBtn} onClick={onBack}>‹ Voltar</button>
              )}
            </div>

            <div className={styles.sbDivider} />

            {/* Escopo ativo */}
            <div className={styles.sbSection}>
              <div className={styles.sbEyebrow}>Escopo ativo</div>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                {ownerSettings.scopeName || '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>O vendedor segue automaticamente essas regras.</div>
            </div>

            <div className={styles.sbDivider} />

            <button className={`${styles.sbBtn} ${styles.sbBtnDanger}`}
              onClick={() => (onNewSession ? onNewSession() : clearAll())}>
              Novo atendimento
            </button>

            {onSaveSale && (
              <button
                className={`${styles.sbBtn} ${styles.sbBtnPrimary}`}
                onClick={saveSale}
                disabled={savingSale || activePlans.length === 0}
              >
                {savingSale ? 'Salvando...' : 'Salvar venda'}
              </button>
            )}

            <div className={styles.sbFooter}>
              <div className={styles.sbThemeSwitch}>
                <button
                  className={`${styles.sbThemeOption} ${colorMode === 'dark' ? styles.sbThemeOptionActive : ''}`}
                  onClick={() => setColorMode('dark')}
                  type="button"
                >
                  Preto
                </button>
                <button
                  className={`${styles.sbThemeOption} ${colorMode === 'light' ? styles.sbThemeOptionActive : ''}`}
                  onClick={() => setColorMode('light')}
                  type="button"
                >
                  Claro
                </button>
              </div>
              <span className={styles.sbVersion}>v10</span>
            </div>

          </div>
        )}
      </div>

      {/* Zoom da tela */}
      <div className={`${styles.canvasZoom} ${sidebarOpen ? styles.canvasZoomSidebarOpen : ''}`}
        aria-label="Zoom da tela">
        <button className={styles.canvasZoomBtn} onClick={zoomOut} title="Diminuir zoom">−</button>
        <div className={styles.canvasZoomReadout}>{Math.round(contentScale * 100)}%</div>
        <button className={`${styles.canvasZoomBtn} ${styles.canvasZoomFit}`} onClick={fitZoom} title="Voltar ao padrão">Fit</button>
        <button className={styles.canvasZoomBtn} onClick={zoomIn} title="Aumentar zoom">+</button>
      </div>

      {/* Policy toast */}
      {toast && (
        <div className={styles.policyToast}>
          <div className={`${styles.policyToastInner} ${toast.kind === 'danger' ? styles.policyToastDanger : styles.policyToastInfo}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
