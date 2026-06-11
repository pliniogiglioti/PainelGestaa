import { useState, useRef, useCallback, useEffect } from 'react';
import type { OwnerV8Model, OwnerSettings } from '../components/vendas/types';
import type { Empresa, EmpresaPreco } from '../lib/types';
import { supabase } from '../lib/supabase';
import {
  loadOwnerV8Model,
  saveOwnerV8Model,
  loadOwnerV8ModelFromDB,
  saveOwnerV8ModelToDB,
  applyOwnerV8Model,
} from '../components/vendas/ownerModel';
import { SellerWorld, PLAN_NAME_SUGGESTIONS } from '../components/vendas/SellerWorld';
import { OwnerWizard } from '../components/vendas/OwnerWizard';
import styles from '../components/vendas/Vendas.module.css';

type Screen = 'launchpad' | 'entry' | 'naming' | 'workspace';

interface VendasPageProps {
  empresa: Empresa;
  onTrocarEmpresa: () => void;
  onVoltar: () => void;
}

// ---- Cadastro simples de serviços ----

function parsePriceInput(value: string): number {
  const cleaned = value.replace(/[^\d,\.]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

interface SimpleSetupProps {
  empresa: Empresa;
  onConcluir: (precos: EmpresaPreco[]) => void;
}

function VendasSetup({ empresa, onConcluir }: SimpleSetupProps) {
  const [items, setItems] = useState<EmpresaPreco[]>([]);
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  function handlePrecoInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d]/g, '');
    if (!raw) { setPreco(''); return; }
    const num = parseInt(raw, 10) / 100;
    setPreco(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }

  async function handleAdd() {
    setErro('');
    if (!nome.trim()) { setErro('Informe o nome do serviço.'); return; }
    const precoNum = parsePriceInput(preco);
    if (precoNum <= 0) { setErro('Informe um preço válido.'); return; }

    setSaving(true);
    const { data, error } = await supabase
      .from('empresa_precos')
      .insert({
        empresa_id: empresa.id,
        nome_produto: nome.trim(),
        preco: precoNum,
        categoria: null,
        ativo: true,
        precificacao_calculo: {},
      })
      .select()
      .single();
    setSaving(false);

    if (error || !data) {
      setErro('Erro ao salvar. Tente novamente.');
      return;
    }

    setItems(prev => [...prev, data as EmpresaPreco]);
    setNome('');
    setPreco('');
    setTimeout(() => nomeRef.current?.focus(), 50);
  }

  async function handleRemove(id: string) {
    await supabase.from('empresa_precos').update({ ativo: false }).eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  return (
    <div className={styles.vendasRoot}>
      <div className={styles.entryOverlay}>
        <div className={styles.launchpadCard} style={{ maxWidth: 520 }}>
          <div className={styles.launchpadKicker}>{empresa.nome}</div>
          <div className={styles.launchpadTitle} style={{ fontSize: 28, marginBottom: 8 }}>
            Cadastre os serviços da clínica
          </div>
          <div className={styles.launchpadSubtitle} style={{ fontSize: 14, marginBottom: 24 }}>
            Esses preços serão usados como mínimos à vista nas Configurações. Adicione pelo menos um serviço para continuar.
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <input
              ref={nomeRef}
              className={styles.entryInput}
              style={{ flex: 1, fontSize: 15, marginBottom: 0 }}
              placeholder="Nome do serviço"
              value={nome}
              autoFocus
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <input
              className={styles.entryInput}
              style={{ width: 130, fontSize: 15, marginBottom: 0, textAlign: 'right' }}
              placeholder="R$ 0,00"
              value={preco}
              onChange={handlePrecoInput}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button
              className={styles.entryBtn}
              style={{ padding: '10px 20px', fontSize: 13 }}
              onClick={handleAdd}
              disabled={saving}
            >
              {saving ? '...' : 'Adicionar'}
            </button>
          </div>

          {erro && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{erro}</div>}

          {items.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600 }}>Serviço</th>
                    <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600 }}>Preço</th>
                    <th style={{ width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0' }}>{item.nome_produto}</td>
                      <td style={{ textAlign: 'right', padding: '8px 0', color: 'var(--accent)' }}>
                        {item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 0' }}>
                        <button
                          onClick={() => handleRemove(item.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            className={styles.entryBtn}
            style={{ width: '100%', marginTop: items.length === 0 ? 16 : 0, opacity: items.length === 0 ? 0.4 : 1 }}
            disabled={items.length === 0}
            onClick={() => onConcluir(items)}
          >
            Continuar
          </button>

          <button
            onClick={() => {/* volta pro gate */ window.history.back(); }}
            style={{ display: 'block', marginTop: 10, width: '100%', background: 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 20px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            Trocar empresa
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- VendasPage principal ----

export default function VendasPage({ empresa, onTrocarEmpresa, onVoltar }: VendasPageProps) {
  const [ownerModel, setOwnerModel] = useState<OwnerV8Model>(() => loadOwnerV8Model());
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings>(() => applyOwnerV8Model(loadOwnerV8Model()));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardFromSeller, setWizardFromSeller] = useState(false);
  const [pageToast, setPageToast] = useState<string | null>(null);
  const pageToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [empresaPrecos, setEmpresaPrecos] = useState<EmpresaPreco[] | null>(null);
  const [loadingPrecos, setLoadingPrecos] = useState(true);
  const [loadingOwnerModel, setLoadingOwnerModel] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from('empresa_precos')
      .select('*')
      .eq('empresa_id', empresa.id)
      .eq('ativo', true)
      .order('nome_produto', { ascending: true })
      .then(({ data }) => {
        if (active) {
          setEmpresaPrecos(data ?? []);
          setLoadingPrecos(false);
        }
      });
    return () => { active = false; };
  }, [empresa.id]);

  useEffect(() => {
    let active = true;
    setLoadingOwnerModel(true);
    loadOwnerV8ModelFromDB(empresa.id).then(model => {
      if (!active) return;
      if (model) {
        setOwnerModel(model);
        setOwnerSettings(applyOwnerV8Model(model));
      }
      setLoadingOwnerModel(false);
    });
    return () => { active = false; };
  }, [empresa.id]);

  const notifyPage = useCallback((msg: string) => {
    if (pageToastTimerRef.current) clearTimeout(pageToastTimerRef.current);
    setPageToast(msg);
    pageToastTimerRef.current = setTimeout(() => setPageToast(null), 3500);
  }, []);

  const [screen, setScreen] = useState<Screen>('launchpad');
  const [patientName, setPatientName] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [planNameInput, setPlanNameInput] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const planNameInputRef = useRef<HTMLInputElement>(null);

  function handleSaveWizard(model: OwnerV8Model) {
    saveOwnerV8Model(model);
    saveOwnerV8ModelToDB(empresa.id, model);
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
    setPlanNameInput('Diamante');
    setScreen('naming');
    setTimeout(() => planNameInputRef.current?.select(), 50);
  }

  function confirmPlanName() {
    if (!planNameInput.trim()) setPlanNameInput('Diamante');
    setScreen('workspace');
  }

  if (loadingPrecos || loadingOwnerModel) {
    return (
      <div className={styles.vendasRoot}>
        <div className={styles.entryOverlay}>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando...</div>
        </div>
      </div>
    );
  }

  if (empresaPrecos !== null && empresaPrecos.length === 0) {
    return (
      <VendasSetup
        empresa={empresa}
        onConcluir={precos => setEmpresaPrecos(precos)}
      />
    );
  }

  // ---- Launchpad ----
  if (screen === 'launchpad') {
    return (
      <div className={styles.vendasRoot}>
        <div className={styles.entryOverlay}>
          <div className={styles.launchpadCard}>
            <div className={styles.launchpadKicker}>{empresa.nome}</div>
            <div className={styles.launchpadTitle}>Para onde você quer ir agora?</div>
            <div className={styles.launchpadSubtitle}>
              Escolha o ambiente que faz mais sentido neste momento.
            </div>

            <div className={styles.launchpadGrid}>
              {/* Mundo do Dono */}
              <div className={`${styles.launchpadChoice} ${styles.launchpadChoicePrimary}`}>
                <div>
                  <div className={styles.launchpadChoiceKicker}>Estratégia</div>
                  <div className={styles.launchpadChoiceTitle}>Configurações</div>
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
                    Abrir Configurações
                  </button>
                </div>
              </div>

              {/* Mundo do Vendedor */}
              <div className={styles.launchpadChoice}>
                <div>
                  <div className={styles.launchpadChoiceKicker}>Proposta</div>
                  <div className={styles.launchpadChoiceTitle}>Vender</div>
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
                    {ownerModel.completed ? 'Configurações prontas' : 'Configure antes de vender'}
                  </div>
                  <button className={styles.launchpadBtnGhost} onClick={openSellerWorld}>
                    Começar a Vender
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button onClick={onVoltar} style={{ position: 'fixed', top: 16, left: 16, zIndex: 30, padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Voltar
        </button>
        <button onClick={onTrocarEmpresa} style={{ position: 'fixed', top: 16, left: 100, zIndex: 30, padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {empresa.nome}
        </button>

        {wizardOpen && (
          <OwnerWizard
            model={ownerModel}
            onSave={handleSaveWizard}
            onClose={() => setWizardOpen(false)}
            empresaPrecos={empresaPrecos ?? []}
            empresaId={empresa.id}
          />
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
                Revisar Configurações
              </button>
            )}
          </div>
        </div>

        {wizardOpen && (
          <OwnerWizard
            model={ownerModel}
            onSave={handleSaveWizard}
            onClose={() => setWizardOpen(false)}
            empresaPrecos={empresaPrecos ?? []}
            empresaId={empresa.id}
          />
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
            <div className={styles.namingStep}>Passo 2 de 3</div>
            <div className={styles.namingPatient}>
              {patientName}{proposalTitle ? ` · ${proposalTitle}` : ''}
            </div>

            <div className={styles.namingLabel}>Como vamos chamar o plano principal?</div>
            <div className={styles.namingPrefix}>Plano</div>
            <input
              ref={planNameInputRef}
              className={styles.namingInput}
              type="text"
              placeholder="Diamante"
              value={planNameInput}
              onChange={e => setPlanNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmPlanName(); }}
              autoFocus
            />

            <div className={styles.namingSuggestions}>
              {PLAN_NAME_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  className={`${styles.namingChip}${planNameInput === s ? ' ' + styles.namingChipActive : ''}`}
                  onClick={() => setPlanNameInput(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button className={styles.entryBtn} onClick={confirmPlanName}>
                Começar →
              </button>
              <button
                onClick={() => setScreen('entry')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}
              >
                ‹ Voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Workspace ----
  return (
    <div className={`${styles.vendasRoot} ${styles.appWrapper}`}>
      <SellerWorld
        ownerSettings={ownerSettings}
        initialPlanName={planNameInput.trim() || 'Diamante'}
        patientName={patientName}
        proposalTitle={proposalTitle}
        onPatientNameChange={setPatientName}
        onProposalTitleChange={setProposalTitle}
        onOpenOwnerWizard={openOwnerWorld}
        onBack={() => setScreen('launchpad')}
      />

      {wizardOpen && (
        <OwnerWizard
          model={ownerModel}
          onSave={handleSaveWizard}
          onClose={() => setWizardOpen(false)}
          empresaPrecos={empresaPrecos ?? []}
          empresaId={empresa.id}
        />
      )}
    </div>
  );
}
