import { useState, useCallback, useEffect, useRef } from 'react';
import type { Plan, OwnerSettings } from './types';
import { uid } from './calcEngine';
import { PlanCard } from './PlanCard';
import styles from './Vendas.module.css';

interface SellerWorldProps {
  ownerSettings: OwnerSettings;
  onOpenOwnerWizard: () => void;
}

const BADGE_LABELS = ['A', 'B', 'C'];
const BADGE_CLASSES = [styles.badgeA, styles.badgeB, styles.badgeC];
const PLAN_NAMES = ['Plano A', 'Plano B', 'Plano C'];
const MAX_PLANS = 3;

function makePlan(index: number): Plan {
  return {
    id: uid(),
    name: PLAN_NAMES[index] ?? `Plano ${index + 1}`,
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

export function SellerWorld({ ownerSettings, onOpenOwnerWizard }: SellerWorldProps) {
  const [plans, setPlans] = useState<Plan[]>(() => [makePlan(0)]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
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
    setPlans([makePlan(0)]);
    setPatientName('');
    setProposalTitle('');
  }

  return (
    <div className={styles.workspaceShell}>
      <div className={styles.workspaceStage}>
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
        <button className={styles.sidebarToggle} onClick={() => setSidebarOpen(o => !o)} title={sidebarOpen ? 'Fechar' : 'Abrir painel'}>
          {sidebarOpen ? '›' : '‹'}
        </button>
        <div className={styles.sidebarContent}>
          <div className={styles.sbSection}>
            <div className={styles.sbEyebrow}>Proposta</div>
            <div className={styles.sbFieldLabel}>Nome do paciente</div>
            <input
              className={styles.sbInlineInput}
              type="text"
              placeholder="Nome do paciente"
              value={patientName}
              onChange={e => setPatientName(e.target.value)}
            />
            <div className={styles.sbFieldLabel}>Título (opcional)</div>
            <input
              className={styles.sbInlineInput}
              type="text"
              placeholder="ex: Tratamento completo"
              value={proposalTitle}
              onChange={e => setProposalTitle(e.target.value)}
            />
          </div>

          <div className={styles.sbDivider} />

          <div className={styles.sbSection}>
            <div className={styles.sbEyebrow}>Configurações</div>
            <button className={styles.sbBtn} onClick={onOpenOwnerWizard}>
              Configurar preços e pagamentos
            </button>
          </div>

          <div className={styles.sbDivider} />

          <div className={styles.sbSection}>
            <button className={`${styles.sbBtn} ${styles.sbBtnDanger}`} onClick={clearAll}>
              Limpar proposta
            </button>
          </div>
        </div>

        <div className={styles.sbFooter}>
          <span className={styles.sbVersion}>TOP v9</span>
        </div>
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
