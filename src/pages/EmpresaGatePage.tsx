import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa } from '../lib/types'
import styles from './EmpresaGatePage.module.css'

interface Props {
  /** Chamado quando o usuário seleciona (ou cria e seleciona) uma empresa */
  onSelecionar: (empresa: Empresa) => void
  /** Voltar para a home */
  onVoltar: () => void
}

export default function EmpresaGatePage({ onSelecionar, onVoltar }: Props) {
  const [empresas, setEmpresas]     = useState<Empresa[]>([])
  const [loading, setLoading]       = useState(true)
  const [criando, setCriando]       = useState(false)
  const [nome, setNome]             = useState('')
  const [cnpj, setCnpj]             = useState('')
  const [salvando, setSalvando]     = useState(false)
  const [erro, setErro]             = useState('')
  const [hoveredId, setHoveredId]   = useState<string | null>(null)

  useEffect(() => {
    carregarEmpresas()
  }, [])

  async function carregarEmpresas() {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Verifica se é admin do sistema (enxerga todas as empresas)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    let empresasData: Empresa[] = []

    if (isAdmin) {
      const { data } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativo', true)
        .order('created_at')
      empresasData = data ?? []
    } else {
      // Usuário comum: só enxerga empresas onde é membro
      const { data: membros } = await supabase
        .from('empresa_membros')
        .select('empresa_id')
        .eq('user_id', user.id)

      const ids = (membros ?? []).map(m => m.empresa_id)

      if (ids.length > 0) {
        const { data } = await supabase
          .from('empresas')
          .select('*')
          .in('id', ids)
          .eq('ativo', true)
          .order('created_at')
        empresasData = data ?? []
      }
    }

    setEmpresas(empresasData)
    setLoading(false)
  }

  async function handleCriarEmpresa(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) { setErro('Informe o nome da empresa.'); return }
    setSalvando(true)
    setErro('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setErro('Sessão expirada. Faça login novamente.'); setSalvando(false); return }

    const { data, error } = await supabase
      .from('empresas')
      .insert({
        nome:       nome.trim(),
        cnpj:       cnpj.trim() || null,
        created_by: session.user.id,
      })
      .select()
      .single()

    if (error || !data) {
      setErro(error?.message ?? 'Erro ao criar empresa.')
      setSalvando(false)
      return
    }

    // O trigger já vincula o criador como admin — seleciona direto
    onSelecionar(data as Empresa)
  }

  const inicialEmpresa = (nome: string) =>
    nome.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')

  if (loading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.btnVoltar} onClick={onVoltar}>
          ← Voltar
        </button>
        <h1 className={styles.titulo}>
          {empresas.length === 0 ? 'Criar sua primeira empresa' : 'Selecionar empresa'}
        </h1>
        <p className={styles.subtitulo}>
          {empresas.length === 0
            ? 'Para usar a Análise DRE, você precisa criar uma empresa.'
            : 'Escolha a empresa que deseja analisar ou crie uma nova.'}
        </p>
      </header>

      {/* Grade de cards */}
      <div className={styles.grade}>

        {/* Cards das empresas existentes */}
        {empresas.map(emp => (
          <div
            key={emp.id}
            className={styles.card}
            onMouseEnter={() => setHoveredId(emp.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className={`${styles.overlay} ${hoveredId === emp.id ? styles.overlayHovered : ''}`} />
            <div className={styles.cardContent}>
              <span className={styles.cardLabel}>EMPRESA</span>
              <div className={styles.cardInitiais}>{inicialEmpresa(emp.nome)}</div>
              <h3 className={styles.cardNome}>{emp.nome}</h3>
              {emp.cnpj && <p className={styles.cardCnpj}>{emp.cnpj}</p>}
              <div className={`${styles.cardExpandable} ${hoveredId === emp.id ? styles.cardExpandableOpen : ''}`}>
                <button
                  className={styles.btnSelecionar}
                  onClick={() => onSelecionar(emp)}
                >
                  Acessar DRE
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Card "Criar empresa" */}
        {!criando && (
          <div
            className={`${styles.card} ${styles.cardNova}`}
            onMouseEnter={() => setHoveredId('__nova')}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => setCriando(true)}
          >
            <div className={`${styles.overlay} ${hoveredId === '__nova' ? styles.overlayHovered : ''}`} />
            <div className={styles.cardContent}>
              <div className={styles.iconPlus}>+</div>
              <p className={styles.cardLabelNova}>Criar empresa</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de criação */}
      {criando && (
        <div className={styles.modalBackdrop} onClick={() => { if (!salvando) setCriando(false) }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitulo}>Nova empresa</h2>
            <form onSubmit={handleCriarEmpresa} className={styles.form}>
              <label className={styles.label}>
                Nome da empresa *
                <input
                  className={styles.input}
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Clínica Sorriso Ltda"
                  autoFocus
                  disabled={salvando}
                />
              </label>
              <label className={styles.label}>
                CNPJ <span className={styles.opcional}>(opcional)</span>
                <input
                  className={styles.input}
                  value={cnpj}
                  onChange={e => setCnpj(e.target.value)}
                  placeholder="00.000.000/0000-00"
                  disabled={salvando}
                />
              </label>
              {erro && <p className={styles.erro}>{erro}</p>}
              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.btnCancelar}
                  onClick={() => { setCriando(false); setErro('') }}
                  disabled={salvando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.btnCriar}
                  disabled={salvando}
                >
                  {salvando ? 'Criando…' : 'Criar empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
