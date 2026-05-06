import { useState, useRef, useCallback } from 'react';
import type { OwnerV8Model, OwnerSettings } from '../components/vendas/types';
import {
  loadOwnerV8Model,
  saveOwnerV8Model,
  applyOwnerV8Model,
} from '../components/vendas/ownerModel';
import { SellerWorld } from '../components/vendas/SellerWorld';
import { OwnerWizard } from '../components/vendas/OwnerWizard';
import styles from '../components/vendas/Vendas.module.css';

type Screen = 'launchpad' | 'entry' | 'naming' | 'workspace';

interface VendasPageProps {
  onVoltar: () => void;
}

export default function VendasPage({ onVoltar }: VendasPageProps) {
  const [ownerModel, setOwnerModel] = useState<OwnerV8Model>(() => loadOwnerV8Model());
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings>(() => applyOwnerV8Model(loadOwnerV8Model()));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardFromSeller, setWizardFromSeller] = useState(false);
  const [pageToast, setPageToast] = useState<string | null>(null);
  const pageToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyPage = useCallback((msg: string) => {
    if (pageToastTimerRef.current) clearTimeout(pageToastTimerRef.current);
    setPageToast(msg);
    pageToastTimerRef.current = setTimeout(() => setPageToast(null), 3500);
  }, []);

  const [screen, setScreen] = useState<Screen>('launchpad');
  const [patientName, setPatientName] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [planNameInput, setPlanNameInput] = useState('Plano A');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const planNameInputRef = useRef<HTMLInputElement>(null);

  function handleSaveWizard(model: OwnerV8Model) {
    saveOwnerV8Model(model);
    const settings = applyOwnerV8Model(model);
    setOwnerModel(model);
    setOwnerSettings(settings);
    setWizardOpen(false);
    if (wizardFromSeller) {
      setWizardFromSeller(false);
      setScreen('entry');
    }
  }

  function openOwnerWorld() {
    setWizardFromSeller(false);
    setWizardOpen(true);
  }

  function openSellerWorld() {
    if (!ownerModel.completed) {
      setWizardFromSeller(true);
      setWizardOpen(true);
      notifyPage('Antes de abrir o vendedor, vamos deixar a clínica configurada.');
      return;
    }
    setScreen('entry');
  }

  function startSession() {
    if (!patientName.trim()) return;
    setPlanNameInput('Plano A');
    setScreen('naming');
    setTimeout(() => planNameInputRef.current?.select(), 50);
  }

  function confirmPlanName() {
    setScreen('workspace');
  }

  // ---- Launchpad ----
  if (screen === 'launchpad') {
    return (
      <div className={styles.vendasRoot}>
        <div className={styles.entryOverlay}>
          <div className={styles.launchpadCard}>
            <div className={styles.launchpadKicker}>TOP V9</div>
            <div className={styles.launchpadTitle}>Para onde você quer ir agora?</div>
            <div className={styles.launchpadSubtitle}>
              Escolha o ambiente que faz mais sentido neste momento. Se a clínica ainda não estiver configurada, a TOP te leva direto para o lugar certo.
            </div>

            <div className={styles.launchpadGrid}>
              {/* Mundo do Dono */}
              <div className={`${styles.launchpadChoice} ${styles.launchpadChoicePrimary}`}>
                <div>
                  <div className={styles.launchpadChoiceKicker}>Estratégia da clínica</div>
                  <div className={styles.launchpadChoiceTitle}>Mundo do Dono</div>
                  <div className={styles.launchpadChoiceText}>
                    Defina preços, pagamentos e proteções da equipe antes de colocar a operação para vender.
                  </div>
                </div>
                <div className={styles.launchpadFooter}>
                  <div className={styles.launchpadNote}>
                    {ownerModel.completed
                      ? 'Sua configuração já existe e pode ser revisada a qualquer momento.'
                      : 'Se preferir, a TOP monta uma base inicial e você só ajusta o que quiser.'}
                  </div>
                  <button className={styles.launchpadBtn} onClick={openOwnerWorld}>
                    Abrir Mundo do Dono
                  </button>
                </div>
              </div>

              {/* Mundo do Vendedor */}
              <div className={styles.launchpadChoice}>
                <div>
                  <div className={styles.launchpadChoiceKicker}>Atendimento e proposta</div>
                  <div className={styles.launchpadChoiceTitle}>Mundo do Vendedor</div>
                  <div className={styles.launchpadChoiceText}>
                    Monte a proposta e conduza a negociação com a clínica já configurada do jeito certo.
                  </div>
                </div>
                <div className={styles.launchpadFooter}>
                  <div className={styles.launchpadStatus}>
                    <span
                      className={styles.launchpadStatusDot}
                      style={ownerModel.completed
                        ? { background: '#58d7b5', boxShadow: '0 0 0 1px rgba(88,215,181,0.22), 0 0 14px rgba(88,215,181,0.18)' }
                        : { background: '#f99f35', boxShadow: '0 0 0 1px rgba(249,159,53,0.24), 0 0 14px rgba(249,159,53,0.18)' }}
                    />
                    {ownerModel.completed ? 'Clínica pronta para vender' : 'Primeiro vamos ajustar a clínica'}
                  </div>
                  <button className={styles.launchpadBtnGhost} onClick={openSellerWorld}>
                    Abrir Mundo do Vendedor
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button onClick={onVoltar} style={{ position: 'fixed', top: 16, left: 16, zIndex: 30, padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Voltar
        </button>

        {wizardOpen && (
          <OwnerWizard model={ownerModel} onSave={handleSaveWizard} onClose={() => setWizardOpen(false)} />
        )}
        {pageToast && (
          <div className={styles.pageToast}>
            <div className={styles.pageToastInner}>{pageToast}</div>
          </div>
        )}
      </div>
    );
  }

  // ---- Entry (patient name) ----
  if (screen === 'entry') {
    return (
      <div className={styles.vendasRoot}>
        <div className={styles.entryOverlay}>
          <div className={styles.entryCard}>
            <div className={styles.entryEyebrow}>Novo Atendimento</div>
            <label className={styles.entryFieldLabel}>Nome do paciente</label>
            <input
              className={styles.entryInput}
              type="text"
              placeholder="ex: João Silva"
              value={patientName}
              onChange={e => setPatientName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') titleInputRef.current?.focus(); }}
              autoFocus
            />
            <label className={styles.entryFieldLabel}>
              Título da proposta <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>(opcional)</span>
            </label>
            <input
              ref={titleInputRef}
              className={styles.entryInputSm}
              type="text"
              placeholder="ex: Protocolo Completo"
              value={proposalTitle}
              onChange={e => setProposalTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') startSession(); }}
            />
            <button className={styles.entryBtn} onClick={startSession} disabled={!patientName.trim()}>
              Iniciar
            </button>
            <button
              onClick={() => setScreen('launchpad')}
              style={{ display: 'block', marginTop: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-muted)', cursor: 'pointer', width: '100%' }}
            >
              Voltar
            </button>
            {ownerModel.completed && (
              <button
                onClick={openOwnerWorld}
                style={{ display: 'block', marginTop: 8, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-muted)', cursor: 'pointer', width: '100%' }}
              >
                Revisar Mundo do Dono
              </button>
            )}
          </div>
        </div>

        {wizardOpen && (
          <OwnerWizard model={ownerModel} onSave={handleSaveWizard} onClose={() => setWizardOpen(false)} />
        )}
      </div>
    );
  }

  // ---- Naming (plan name) ----
  if (screen === 'naming') {
    return (
      <div className={styles.vendasRoot}>
        <div className={styles.entryOverlay}>
          <div className={styles.namingCard}>
            <div className={styles.entryEyebrow}>Criar proposta para {patientName}</div>
            <label className={styles.entryFieldLabel}>Nome do plano inicial</label>
            <input
              ref={planNameInputRef}
              className={styles.entryInput}
              type="text"
              placeholder="ex: Plano A"
              value={planNameInput}
              onChange={e => setPlanNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmPlanName(); }}
              autoFocus
            />
            <button className={styles.entryBtn} onClick={confirmPlanName} disabled={!planNameInput.trim()}>
              Começar
            </button>
            <button
              onClick={() => setScreen('entry')}
              style={{ display: 'block', marginTop: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-muted)', cursor: 'pointer', width: '100%' }}
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Workspace ----
  return (
    <div className={`${styles.vendasRoot} ${styles.appWrapper}`}>
      <div className={styles.appHeader}>
        <button onClick={() => setScreen('launchpad')} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-muted)', cursor: 'pointer' }}>
          ←
        </button>
        {patientName && <span className={styles.patientNameDisplay}>{patientName}</span>}
        {proposalTitle && <span className={styles.proposalTitleDisplay}>{proposalTitle}</span>}
        <span style={{ flex: 1 }} />
        <button
          onClick={openOwnerWorld}
          style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          Configurações
        </button>
      </div>

      <SellerWorld
        ownerSettings={ownerSettings}
        initialPlanName={planNameInput.trim() || 'Plano A'}
        onOpenOwnerWizard={openOwnerWorld}
      />

      {wizardOpen && (
        <OwnerWizard model={ownerModel} onSave={handleSaveWizard} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}
