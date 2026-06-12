import { useState, useRef, useCallback, useEffect } from 'react';
import type { OwnerV8Model, OwnerSettings, Plan } from '../components/vendas/types';
import type { Empresa, EmpresaPreco } from '../lib/types';
import { supabase } from '../lib/supabase';
import {
  loadOwnerV8Model,
  saveOwnerV8Model,
  loadOwnerV8ModelFromDB,
  saveOwnerV8ModelToDB,
  applyOwnerV8Model,
} from '../components/vendas/ownerModel';
import { fmt, planEffectiveTotal } from '../components/vendas/calcEngine';
import { SellerWorld, PLAN_NAME_SUGGESTIONS } from '../components/vendas/SellerWorld';
import { OwnerWizard } from '../components/vendas/OwnerWizard';
import styles from '../components/vendas/Vendas.module.css';

type Screen = 'launchpad' | 'entry' | 'naming' | 'workspace';
const SELLER_SESSION_STORAGE_KEY = 'av-v13';

interface SavedSellerSession {
  patientName: string;
  proposalTitle: string;
  started: boolean;
  plans: Plan[];
}

interface SavedSaleItem {
  id: string;
  venda_id: string;
  descricao: string;
  preco_unitario: number;
  quantidade: number;
}

interface SavedSale {
  id: string;
  cliente_nome: string;
  observacoes: string | null;
  entrada_valor: number;
  max_parcelas: number;
  created_at: string;
  empresa_venda_itens?: SavedSaleItem[];
}

function loadSavedSellerSession(): SavedSellerSession | null {
  try {
    const raw = localStorage.getItem(SELLER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedSellerSession>;
    if (!data.patientName || !Array.isArray(data.plans) || data.plans.length === 0) return null;
    return {
      patientName: data.patientName,
      proposalTitle: data.proposalTitle || '',
      started: true,
      plans: data.plans,
    };
  } catch {
    return null;
  }
}

function sanitizePlansForStorage(plans: Plan[]): Plan[] {
  return plans.map(plan => ({
    ...plan,
    dropdownOpen: false,
    searchQuery: '',
    programmedInfoOpen: false,
    items: plan.items.map(item => ({
      ...item,
      campaignEditing: false,
      campaignInput: '',
      priceEditing: false,
      priceEditInput: '',
    })),
    payment: {
      ...plan.payment,
      entradaEditing: false,
      entradaEditInput: 0,
      editingField: null,
      editInput: 0,
    },
  }));
}

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
  onTrocarEmpresa: () => void;
  onVoltar: () => void;
}

function VendasSetup({ empresa, onConcluir, onTrocarEmpresa, onVoltar }: SimpleSetupProps) {
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
        </div>
      </div>

      <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 110, display: 'flex', gap: 10 }}>
        <button onClick={onVoltar} style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Voltar
        </button>
        <button onClick={onTrocarEmpresa} style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          {empresa.nome}
        </button>
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
  const [sales, setSales] = useState<SavedSale[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);

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

  const fetchSales = useCallback(async () => {
    setLoadingSales(true);
    const { data: vendas, error } = await supabase
      .from('empresa_vendas')
      .select('id, cliente_nome, observacoes, entrada_valor, max_parcelas, created_at')
      .eq('empresa_id', empresa.id)
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(6);

    if (!error) {
      const vendaIds = (vendas || []).map(venda => venda.id);
      let itens: SavedSaleItem[] = [];
      if (vendaIds.length > 0) {
        const { data: itensData } = await supabase
          .from('empresa_venda_itens')
          .select('id, venda_id, descricao, preco_unitario, quantidade')
          .in('venda_id', vendaIds);
        itens = (itensData || []) as SavedSaleItem[];
      }

      setSales((vendas || []).map(venda => ({
        ...venda,
        empresa_venda_itens: itens.filter(item => item.venda_id === venda.id),
      })));
    }
    setLoadingSales(false);
  }, [empresa.id]);

  useEffect(() => {
    void fetchSales();
  }, [fetchSales]);

  const notifyPage = useCallback((msg: string) => {
    if (pageToastTimerRef.current) clearTimeout(pageToastTimerRef.current);
    setPageToast(msg);
    pageToastTimerRef.current = setTimeout(() => setPageToast(null), 3500);
  }, []);

  const [savedSession, setSavedSession] = useState<SavedSellerSession | null>(() => loadSavedSellerSession());
  const [screen, setScreen] = useState<Screen>(() => savedSession ? 'entry' : 'launchpad');
  const [patientName, setPatientName] = useState(() => savedSession?.patientName || '');
  const [proposalTitle, setProposalTitle] = useState(() => savedSession?.proposalTitle || '');
  const [planNameInput, setPlanNameInput] = useState('');
  const [sessionPlans, setSessionPlans] = useState<Plan[] | null>(() => savedSession?.plans || null);

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
    setSessionPlans(null);
    setSavedSession(null);
    localStorage.removeItem(SELLER_SESSION_STORAGE_KEY);
    setScreen('naming');
    setTimeout(() => planNameInputRef.current?.select(), 50);
  }

  function confirmPlanName() {
    if (!planNameInput.trim()) setPlanNameInput('Diamante');
    setSessionPlans(null);
    setScreen('workspace');
  }

  function startNewAttendance() {
    if (!window.confirm('Iniciar novo atendimento?')) return;
    localStorage.removeItem(SELLER_SESSION_STORAGE_KEY);
    setSavedSession(null);
    setSessionPlans(null);
    setPatientName('');
    setProposalTitle('');
    setPlanNameInput('');
    setScreen('launchpad');
  }

  function clearSavedSession() {
    localStorage.removeItem(SELLER_SESSION_STORAGE_KEY);
    setSavedSession(null);
    setSessionPlans(null);
    setPatientName('');
    setProposalTitle('');
  }

  function resumeSavedSession() {
    if (!savedSession) return;
    setPatientName(savedSession.patientName);
    setProposalTitle(savedSession.proposalTitle);
    setSessionPlans(savedSession.plans);
    setPlanNameInput(savedSession.plans[0]?.name?.replace(/^Plano\s+/i, '') || 'Diamante');
    setSavedSession(null);
    setScreen('workspace');
  }

  const handlePlansChange = useCallback((plans: Plan[]) => {
    setSessionPlans(plans);
  }, []);

  useEffect(() => {
    if (screen !== 'workspace' || !patientName.trim() || !sessionPlans?.length) return;
    try {
      localStorage.setItem(SELLER_SESSION_STORAGE_KEY, JSON.stringify({
        patientName,
        proposalTitle,
        started: true,
        plans: sanitizePlansForStorage(sessionPlans),
      }));
    } catch {
      // Ignore storage errors in restricted browser contexts.
    }
  }, [patientName, proposalTitle, screen, sessionPlans]);

  function saleTotal(sale: SavedSale) {
    return (sale.empresa_venda_itens || []).reduce(
      (sum, item) => sum + Number(item.preco_unitario || 0) * Number(item.quantidade || 1),
      0
    );
  }

  async function saveSaleToDatabase(plansToSave: Plan[]) {
    const plansWithItems = plansToSave.filter(plan => plan.items.length > 0);
    if (!patientName.trim()) throw new Error('Informe o nome do paciente antes de salvar.');
    if (plansWithItems.length === 0) throw new Error('Adicione ao menos um tratamento antes de salvar.');

    const maxInstallments = Math.max(1, ...plansWithItems.map(plan => Number(plan.payment.parcelas || 1)));
    const entradaValor = plansWithItems.reduce((sum, plan) => {
      if (plan.payment.entradaOverride != null) return sum + Number(plan.payment.entradaOverride || 0);
      const total = planEffectiveTotal(plan);
      return sum + total * (Number(plan.payment.entradaPct || 0) / 100);
    }, 0);

    const { data: venda, error: vendaError } = await supabase
      .from('empresa_vendas')
      .insert({
        empresa_id: empresa.id,
        cliente_nome: patientName.trim(),
        observacoes: proposalTitle.trim() || null,
        entrada_valor: Math.round(entradaValor * 100) / 100,
        max_parcelas: maxInstallments,
      })
      .select('id')
      .single();

    if (vendaError || !venda) {
      throw new Error(vendaError?.message || 'Nao foi possivel salvar a venda.');
    }

    const items = plansWithItems.flatMap(plan => plan.items.map(item => {
      const unitPrice = item.overridePrice !== null
        ? item.overridePrice
        : item.campaignPct !== null
          ? item.tablePrice * (1 - item.campaignPct / 100)
          : item.tablePrice;

      return {
        venda_id: venda.id,
        empresa_preco_id: null,
        descricao: `${plan.name}: ${item.name}`,
        preco_unitario: Math.round(unitPrice * 100) / 100,
        quantidade: item.qty || 1,
      };
    }));

    const { error: itensError } = await supabase
      .from('empresa_venda_itens')
      .insert(items);

    if (itensError) throw new Error(itensError.message);

    await fetchSales();
    notifyPage('Venda salva no banco de dados.');
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
        onTrocarEmpresa={onTrocarEmpresa}
        onVoltar={onVoltar}
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

              <div className={styles.launchpadChoice}>
                <div>
                  <div className={styles.launchpadChoiceKicker}>Histórico</div>
                  <div className={styles.launchpadChoiceTitle}>Vendas feitas</div>
                  <div className={styles.launchpadChoiceText}>
                    Consulte as últimas propostas salvas no banco de dados.
                  </div>
                </div>
                <div className={styles.salesList}>
                  {loadingSales && <div className={styles.salesEmpty}>Carregando vendas...</div>}
                  {!loadingSales && sales.length === 0 && <div className={styles.salesEmpty}>Nenhuma venda salva ainda.</div>}
                  {!loadingSales && sales.slice(0, 3).map(sale => (
                    <div className={styles.saleRow} key={sale.id}>
                      <div>
                        <div className={styles.saleName}>{sale.cliente_nome}</div>
                        <div className={styles.saleMeta}>
                          {new Date(sale.created_at).toLocaleDateString('pt-BR')} · {sale.empresa_venda_itens?.length || 0} itens
                        </div>
                      </div>
                      <div className={styles.saleTotal}>{fmt(saleTotal(sale))}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: 'fixed', top: 16, left: 16, zIndex: 110, display: 'flex', gap: 10 }}>
          <button onClick={onVoltar} style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            ← Voltar
          </button>
          <button onClick={onTrocarEmpresa} style={{ padding: '6px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {empresa.nome}
          </button>
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
            {savedSession && (
              <div className={styles.resumeBanner}>
                <div className={styles.resumeText}>
                  Continuar com <span className={styles.resumeName}>{savedSession.patientName}</span>?
                </div>
                <div className={styles.resumeBtns}>
                  <button className={styles.resumeBtn} onClick={clearSavedSession}>Novo</button>
                  <button className={`${styles.resumeBtn} ${styles.resumeBtnOk}`} onClick={resumeSavedSession}>Continuar</button>
                </div>
              </div>
            )}
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
            <div className={styles.entryActions}>
            <button className={styles.entryBtn} onClick={startSession} disabled={!patientName.trim()}>
              Iniciar
            </button>
            <button
              className={styles.entryGhostBtn}
              onClick={() => setScreen('launchpad')}
            >
              Voltar
            </button>
            {ownerModel.completed && (
              <button
                className={styles.entryGhostBtn}
                onClick={openOwnerWorld}
              >
                Revisar Mundo do Dono
              </button>
            )}
            </div>
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
        initialPlanName={`Plano ${planNameInput.trim() || 'Diamante'}`}
        initialPlans={sessionPlans}
        onPlansChange={handlePlansChange}
        onSaveSale={saveSaleToDatabase}
        patientName={patientName}
        proposalTitle={proposalTitle}
        onPatientNameChange={setPatientName}
        onProposalTitleChange={setProposalTitle}
        onOpenOwnerWizard={openOwnerWorld}
        onBack={() => setScreen('launchpad')}
        onNewSession={startNewAttendance}
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
