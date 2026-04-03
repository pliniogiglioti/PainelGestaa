import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa } from '../lib/types'
import styles from './PrecificacaoPage.module.css'

interface PrecificacaoPageProps {
  empresa: Empresa
  onTrocarEmpresa: () => void
  onVoltar: () => void
}

type ViewMode = 'home' | 'lista' | 'criar'

type QuestionarioState = {
  cidade: string
  perfil: string
  convenio: string
  ticket: string
  observacoes: string
}

const DENTAL_STARTER_PRICES = [
  {
    categoria: 'Avaliacao e prevencao',
    itens: [
      { nome: 'Consulta de avaliacao', valor: 120 },
      { nome: 'Profilaxia', valor: 180 },
      { nome: 'Aplicacao de fluor', valor: 90 },
    ],
  },
  {
    categoria: 'Dentistica',
    itens: [
      { nome: 'Restauracao em resina 1 face', valor: 180 },
      { nome: 'Restauracao em resina 2 faces', valor: 230 },
      { nome: 'Restauracao em resina 3 faces', valor: 290 },
    ],
  },
  {
    categoria: 'Endodontia',
    itens: [
      { nome: 'Canal unirradicular', valor: 650 },
      { nome: 'Canal birradicular', valor: 850 },
      { nome: 'Canal multirradicular', valor: 1100 },
    ],
  },
  {
    categoria: 'Cirurgia',
    itens: [
      { nome: 'Extracao simples', valor: 220 },
      { nome: 'Extracao de siso', valor: 750 },
      { nome: 'Ulectomia / Ulotomia', valor: 260 },
    ],
  },
  {
    categoria: 'Estetica',
    itens: [
      { nome: 'Clareamento caseiro', valor: 900 },
      { nome: 'Clareamento de consultorio', valor: 1200 },
      { nome: 'Faceta em resina', valor: 850 },
    ],
  },
  {
    categoria: 'Protese',
    itens: [
      { nome: 'Coroa provisoria', valor: 280 },
      { nome: 'Coroa em zirconia', valor: 1650 },
      { nome: 'Protese total', valor: 2800 },
    ],
  },
] as const

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const IconBack = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const IconPlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const IconUpload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const IconTag = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41 13.41 20.6a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
)

const IconSpark = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
  </svg>
)

function Spinner() {
  return <div className={styles.spinner} />
}

export default function PrecificacaoPage({ empresa, onTrocarEmpresa, onVoltar }: PrecificacaoPageProps) {
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [view, setView] = useState<ViewMode>('home')
  const [questionario, setQuestionario] = useState<QuestionarioState>({
    cidade: '',
    perfil: 'intermediaria',
    convenio: 'nao',
    ticket: '',
    observacoes: '',
  })

  useEffect(() => {
    let active = true

    const validarAcesso = async () => {
      setLoading(true)

      const { data: authData } = await supabase.auth.getUser()
      const currentUser = authData.user

      if (!currentUser) {
        if (active) onTrocarEmpresa()
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single()

      const isSystemAdmin = profile?.role === 'admin'

      if (!isSystemAdmin) {
        const { data: membro } = await supabase
          .from('empresa_membros')
          .select('role')
          .eq('empresa_id', empresa.id)
          .eq('user_id', currentUser.id)
          .maybeSingle()

        if (!membro && active) {
          onTrocarEmpresa()
          return
        }

        if (active) {
          setCanManage(membro?.role === 'admin')
        }
      } else if (active) {
        setCanManage(true)
      }

      if (active) {
        setLoading(false)
      }
    }

    void validarAcesso()

    return () => {
      active = false
    }
  }, [empresa.id, onTrocarEmpresa])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <button type="button" className={styles.backBtn} onClick={onVoltar}>
            <IconBack /> Voltar
          </button>
          <h1 className={styles.pageTitle}>Precificacao</h1>
        </div>
        <div className={styles.spinnerWrap}>
          <Spinner />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <button type="button" className={styles.backBtn} onClick={onVoltar}>
          <IconBack /> Voltar
        </button>
        <h1 className={styles.pageTitle}>Precificacao</h1>
        <span className={styles.companyMeta}>
          Empresa: <strong>{empresa.nome}</strong>
        </span>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={onTrocarEmpresa}>
            Trocar empresa
          </button>
          {canManage && view === 'home' && (
            <button type="button" className={styles.btnPrimary} onClick={() => setView('lista')}>
              <IconPlus /> Minha lista de preco
            </button>
          )}
        </div>
      </div>

      {view === 'home' ? (
        <div className={styles.emptyState}>
          <IconTag />
          <p className={styles.emptyTitle}>Minha lista de preco</p>
          <p className={styles.emptyText}>
            Estrutura inicial pronta para importar a lista de precos ou cadastrar precos manualmente.
          </p>
          {canManage ? (
            <button type="button" className={styles.btnPrimary} onClick={() => setView('lista')}>
              <IconPlus /> Abrir minha lista de preco
            </button>
          ) : (
            <p className={styles.emptyHint}>
              Voce pode visualizar a empresa, mas a gestao da lista de precos ficara disponivel para o titular.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.workspace}>
          <div className={styles.workspaceHeader}>
            <div>
              <p className={styles.workspaceEyebrow}>Precificacao</p>
              <h2 className={styles.workspaceTitle}>Minha lista de preco</h2>
            </div>
            <div className={styles.workspaceActions}>
              <button type="button" className={styles.btnSecondary}>
                <IconUpload /> Importar lista
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => setView('criar')}>
                <IconSpark /> Criar precos
              </button>
            </div>
          </div>

          {view === 'lista' ? (
            <div className={styles.blankCanvas} />
          ) : (
            <div className={styles.builderLayout}>
              <section className={styles.pricingPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.panelEyebrow}>Base inicial</p>
                    <h3 className={styles.panelTitle}>Precos odontologicos sugeridos</h3>
                  </div>
                  <button type="button" className={styles.btnSecondary} onClick={() => setView('lista')}>
                    Voltar
                  </button>
                </div>

                <p className={styles.panelText}>
                  Montei uma base inicial para uma clinica odontologica com valores de partida. Depois ajustamos conforme perfil, regiao e posicionamento da sua clinica.
                </p>

                <div className={styles.priceGroups}>
                  {DENTAL_STARTER_PRICES.map(grupo => (
                    <article key={grupo.categoria} className={styles.priceGroupCard}>
                      <h4 className={styles.priceGroupTitle}>{grupo.categoria}</h4>
                      <div className={styles.priceList}>
                        {grupo.itens.map(item => (
                          <div key={item.nome} className={styles.priceItem}>
                            <span className={styles.priceItemName}>{item.nome}</span>
                            <strong className={styles.priceItemValue}>{formatCurrency(item.valor)}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <aside className={styles.questionPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <p className={styles.panelEyebrow}>Perguntas</p>
                    <h3 className={styles.panelTitle}>Personalizar tabela</h3>
                  </div>
                </div>

                <p className={styles.panelText}>
                  Responda essas perguntas para refinarmos os valores-base nos proximos passos.
                </p>

                <div className={styles.questionList}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Cidade / regiao</span>
                    <input
                      className={styles.fieldInput}
                      placeholder="Ex: Presidente Prudente - SP"
                      value={questionario.cidade}
                      onChange={e => setQuestionario(prev => ({ ...prev, cidade: e.target.value }))}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Perfil da clinica</span>
                    <select
                      className={styles.fieldInput}
                      value={questionario.perfil}
                      onChange={e => setQuestionario(prev => ({ ...prev, perfil: e.target.value }))}
                    >
                      <option value="popular">Popular</option>
                      <option value="intermediaria">Intermediaria</option>
                      <option value="premium">Premium</option>
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Atende convenio?</span>
                    <select
                      className={styles.fieldInput}
                      value={questionario.convenio}
                      onChange={e => setQuestionario(prev => ({ ...prev, convenio: e.target.value }))}
                    >
                      <option value="nao">Nao</option>
                      <option value="sim">Sim</option>
                      <option value="misto">Misto</option>
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Ticket medio desejado por paciente</span>
                    <input
                      className={styles.fieldInput}
                      placeholder="Ex: 450"
                      value={questionario.ticket}
                      onChange={e => setQuestionario(prev => ({ ...prev, ticket: e.target.value }))}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Observacoes importantes</span>
                    <textarea
                      className={`${styles.fieldInput} ${styles.fieldTextarea}`}
                      placeholder="Ex: foco em ortodontia, implante, odontologia estetica..."
                      value={questionario.observacoes}
                      onChange={e => setQuestionario(prev => ({ ...prev, observacoes: e.target.value }))}
                    />
                  </label>
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
