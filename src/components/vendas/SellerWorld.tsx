import { useState, useCallback, useEffect, useRef } from 'react';
import type { Plan, OwnerSettings } from './types';
import { uid } from './calcEngine';
import { PlanCard } from './PlanCard';
import styles from './Vendas.module.css';

interface SellerWorldProps {
  ownerSettings: OwnerSettings;
  onOpenOwnerWizard: () => void;
  onBack?: () => void;
  initialPlanName?: string;
  patientName?: string;
  proposalTitle?: string;
}

const BADGE_LABELS = ['A', 'B', 'C'];
const BADGE_CLASSES = [styles.badgeA, styles.badgeB, styles.badgeC];
const PLAN_NAMES = ['Plano A', 'Plano B', 'Plano C'];
const MAX_PLANS = 3;

function makePlan(index: number, firstName?: string): Plan {
  return {
    id: uid(),
    name: (index === 0 && firstName) ? firstName : (PLAN_NAMES[index] ?? `Plano ${index + 1}`),
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

interface ToastState {
  msg: string;
  kind: 'info' | 'danger';
}

export function SellerWorld({ ownerSettings, onOpenOwnerWizard, onBack, initialPlanName, patientName, proposalTitle }: SellerWorldProps) {
  const [plans, setPlans] = useState<Plan[]>(() => [makePlan(0, initialPlanName)]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [equalizedPlans, setEqualizedPlans] = useState(false);
  const [editPatientName, setEditPatientName] = useState(patientName ?? '');
  const [editProposalTitle, setEditProposalTitle] = useState(proposalTitle ?? '');
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string, kind: 'info' | 'danger' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  function addPlan() {
    if (plans.length >= MAX_PLANS) { notify('Máximo de 3 planos.', 'info'); return; }
    setPlans(prev => [...prev, makePlan(prev.length)]);
  }

  function removePlan(id: string) {
    setPlans(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(p => p.id !== id);
    });
  }

  function updatePlan(id: string, updated: Plan) {
    setPlans(prev => prev.map(p => p.id === id ? updated : p));
  }

  function clearAll() {
    setPlans([makePlan(0, initialPlanName)]);
  }

  return (
    <div className={styles.workspaceShell}>
      <div className={styles.workspaceStage}>
        {(patientName || proposalTitle) && (
          <div className={styles.workspaceHeader}>
            {patientName && <div className={styles.workspaceTitle}>{patientName}</div>}
            {proposalTitle && <div className={styles.workspaceSubtitle}>{proposalTitle}</div>}
          </div>
        )}
        <div className={styles.plansArea}>
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
                value={editPatientName}
                onChange={e => setEditPatientName(e.target.value)}
                placeholder="Nome do paciente" />
              <div className={styles.sbFieldLabel}>Planejamento</div>
              <input className={styles.sbInlineInput} type="text"
                value={editProposalTitle}
                onChange={e => setEditProposalTitle(e.target.value)}
                placeholder="Opcional" />
            </div>

            <div className={styles.sbDivider} />

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

            <button className={`${styles.sbBtn} ${styles.sbBtnDanger}`} onClick={clearAll}>
              Novo atendimento
            </button>

            <div className={styles.sbFooter}>
              <div className={styles.sbThemeSwitch}>
                <button className={styles.sbThemeOption}>Preto</button>
                <button className={styles.sbThemeOption}>Claro</button>
              </div>
              <span className={styles.sbVersion}>v10</span>
            </div>

          </div>
        )}
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
