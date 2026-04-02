import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface TermosPageProps {
  userId:   string
  userName: string
  onAceitar: () => void
}

export default function TermosPage({ userId, userName, onAceitar }: TermosPageProps) {
  const [lido,       setLido]       = useState(false)
  const [aceito,     setAceito]     = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [erro,       setErro]       = useState('')
  const [aceitoEm,   setAceitoEm]   = useState<string | null>(null) // data do aceite já registrado
  const scrollRef = useRef<HTMLDivElement>(null)

  // Busca aceite existente para exibir data/nome
  useEffect(() => {
    supabase
      .from('termos_aceite')
      .select('accepted_at')
      .eq('user_id', userId)
      .eq('app', 'dfc-clinicscale')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.accepted_at) setAceitoEm(data.accepted_at)
      })
  }, [userId])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
      if (nearBottom) setLido(true)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const handleAceitar = async () => {
    if (aceitoEm) { onAceitar(); return }
    if (!aceito) return
    setLoading(true)
    setErro('')
    const { error } = await supabase.from('termos_aceite').insert({
      user_id:    userId,
      version:    '1.0',
      app:        'dfc-clinicscale',
      user_agent: navigator.userAgent,
    })
    if (error && error.code !== '23505') {
      setErro('Erro ao registrar aceite. Tente novamente.')
      setLoading(false)
      return
    }
    setLoading(false)
    onAceitar()
  }

  const formatarData = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day:    '2-digit',
      month:  '2-digit',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }) + ' (horário de Brasília)'
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080808',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 16px 0',
    }}>
      {/* Cabeçalho */}
      <div style={{ width: '100%', maxWidth: 800, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, #c9a22a, #a07c1a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f0f0f0', letterSpacing: '-0.3px' }}>
              Termos de Uso e Política de Privacidade
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
              DFC ClinicScale — Versão 1.0 · Vigência: Abril de 2026
            </p>
          </div>
        </div>
        {aceitoEm ? (
          <div style={{
            background: '#0d1a0d',
            border: '1px solid #2e7d3260',
            borderLeft: '3px solid #4caf50',
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: 13,
            color: '#81c784',
            lineHeight: 1.6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div>
              <strong style={{ color: '#a5d6a7' }}>Termos aceitos</strong>
              <br />
              Assinado por <strong style={{ color: '#a5d6a7' }}>{userName}</strong> em{' '}
              <strong style={{ color: '#a5d6a7' }}>{formatarData(aceitoEm)}</strong>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#1a1506',
            border: '1px solid #c9a22a40',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 13,
            color: '#c9a22a',
            lineHeight: 1.5,
          }}>
            Leia os termos abaixo por completo antes de prosseguir. Role até o fim para habilitar o botão de aceite.
          </div>
        )}
      </div>

      {/* Corpo com scroll */}
      <div
        ref={scrollRef}
        style={{
          width: '100%',
          maxWidth: 800,
          flex: 1,
          overflowY: 'auto',
          maxHeight: 'calc(100vh - 260px)',
          background: '#111',
          border: '1px solid #222',
          borderRadius: 12,
          padding: '28px 32px',
          color: '#d0d0d0',
          fontSize: 14,
          lineHeight: 1.75,
        }}
      >
        <TermosConteudo />
      </div>

      {/* Rodapé fixo */}
      <div style={{
        width: '100%',
        maxWidth: 800,
        padding: '20px 0 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          cursor: aceitoEm ? 'default' : lido ? 'pointer' : 'not-allowed',
          opacity: aceitoEm || lido ? 1 : 0.45,
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={aceitoEm ? true : aceito}
            disabled={aceitoEm ? true : !lido}
            onChange={e => setAceito(e.target.checked)}
            style={{ marginTop: 3, accentColor: '#c9a22a', width: 16, height: 16, flexShrink: 0, cursor: 'inherit' }}
          />
          <span style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>
            Li e compreendi integralmente os Termos de Uso e a Política de Privacidade, incluindo o
            consentimento expresso para acesso simultâneo da GESTA (Seção 4) e as consequências
            da revogação (Seção 4.7). Concordo com todas as disposições.
          </span>
        </label>

        {erro && (
          <p style={{ margin: 0, fontSize: 13, color: '#e05c5c' }}>{erro}</p>
        )}

        <button
          onClick={handleAceitar}
          disabled={aceitoEm ? false : (!aceito || loading)}
          style={{
            width: '100%',
            padding: '14px 0',
            borderRadius: 8,
            border: 'none',
            background: (aceitoEm || (aceito && !loading))
              ? 'linear-gradient(135deg, #c9a22a, #a07c1a)'
              : '#1e1e1e',
            color: (aceitoEm || (aceito && !loading)) ? '#fff' : '#555',
            fontSize: 15,
            fontWeight: 600,
            cursor: (aceitoEm || (aceito && !loading)) ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
            letterSpacing: '0.2px',
          }}
        >
          {loading ? 'Registrando aceite...' : aceitoEm ? 'Acessar a Plataforma' : 'Aceitar e Acessar a Plataforma'}
        </button>

        {!lido && !aceitoEm && (
          <p style={{ margin: 0, fontSize: 12, color: '#555', textAlign: 'center' }}>
            Role até o fim do documento para habilitar o aceite.
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Conteúdo dos termos ─────────────────────────────────────────────────────

function S({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 12px', color: '#bbb' }}>{children}</p>
}

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      margin: '32px 0 16px',
      fontSize: 16,
      fontWeight: 700,
      color: '#c9a22a',
      borderBottom: '1px solid #222',
      paddingBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}>{children}</h2>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      margin: '24px 0 10px',
      fontSize: 14,
      fontWeight: 600,
      color: '#e0e0e0',
    }}>{children}</h3>
  )
}

function Destaque({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#1a1506',
      border: '1px solid #c9a22a50',
      borderLeft: '3px solid #c9a22a',
      borderRadius: 6,
      padding: '12px 16px',
      margin: '16px 0',
      color: '#d4b84a',
      fontSize: 13,
      lineHeight: 1.6,
    }}>{children}</div>
  )
}

function TermosConteudo() {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f0f0f0', marginBottom: 4 }}>
          DFC CLINICSCALE
        </div>
        <div style={{ fontSize: 13, color: '#666' }}>
          Versão: 1.0 &nbsp;|&nbsp; Vigência: Abril de 2026 &nbsp;|&nbsp; Atualização: Abril de 2026
        </div>
      </div>

      <H1>Parte I – Termos de Uso</H1>

      <H2>1. Das Partes e da Aceitação</H2>
      <S>1.1. Estes Termos de Uso e Política de Privacidade ("Termos") regulam o acesso e uso da plataforma DFC ClinicScale e estabelecem os direitos e obrigações entre:</S>
      <S><strong style={{ color: '#e0e0e0' }}>OPERADORA DA PLATAFORMA:</strong><br />
      GESTA CONSULTORIA INTEGRADA LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 60.619.849/0001-70, estabelecida sito à Rua Orfanato, nº 411, Apartamento 84, Torre A, Bairro Vila Prudente, São Paulo/SP, CEP 03131-010, doravante denominada "GESTA";</S>
      <S><strong style={{ color: '#e0e0e0' }}>USUÁRIO:</strong><br />
      Pessoa física ou jurídica, proprietária ou gestora de clínica odontológica, devidamente identificada no momento do cadastro, cliente de produto ou serviço da GESTA, doravante denominado "USUÁRIO".</S>
      <S>1.2. Ao acessar, cadastrar-se ou utilizar qualquer funcionalidade da plataforma DFC ClinicScale, o USUÁRIO declara, de forma livre, informada e inequívoca, nos termos do art. 5º, XII, da Lei nº 13.709/2018 (LGPD) e do art. 7º, IX, da Lei nº 12.965/2014 (Marco Civil da Internet):</S>
      <S>a) ter lido e compreendido integralmente estes Termos;<br />
      b) concordar com todas as disposições aqui estabelecidas;<br />
      c) possuir capacidade jurídica plena para firmar este instrumento;<br />
      d) estar ciente de que a GESTA terá acesso simultâneo, irrestrito e em tempo real a todos os dados por ele inseridos na plataforma, conforme a Seção 4 destes Termos.</S>
      <S>1.3. Caso o USUÁRIO não concorde com qualquer disposição destes Termos, deverá abster-se de utilizar a plataforma.</S>

      <H2>2. Do Objeto e da Plataforma</H2>
      <S>2.1. A plataforma DFC ClinicScale é uma ferramenta digital disponibilizada pela GESTA com a finalidade de possibilitar ao USUÁRIO o registro, a organização e o acompanhamento do Demonstrativo de Fluxo de Caixa (DFC) de sua clínica odontológica, incluindo lançamentos de receitas, despesas e demais movimentações financeiras.</S>
      <S>2.2. O acesso à plataforma é concedido ao USUÁRIO a título gratuito, como benefício vinculado à contratação de produto ou serviço da GESTA, e permanece vigente enquanto o vínculo contratual estiver ativo.</S>
      <S>2.3. O acesso à plataforma é personalíssimo e intransferível. Não é possível ceder, sublicenciar ou compartilhar o acesso com terceiros não vinculados à clínica do USUÁRIO.</S>
      <S>2.4. A GESTA reserva-se o direito de modificar, suspender, aprimorar ou descontinuar funcionalidades da plataforma, com comunicação prévia ao USUÁRIO sempre que a modificação impactar materialmente seu uso.</S>
      <S>2.5. A plataforma DFC ClinicScale é uma ferramenta de apoio à gestão financeira gerencial. As informações nela registradas não substituem a contabilidade oficial, o sistema fiscal da clínica ou o trabalho do contador responsável.</S>

      <H2>3. Do Cadastro e Acesso</H2>
      <S>3.1. O acesso à plataforma exige cadastro prévio com informações verdadeiras, completas e atualizadas.</S>
      <S>3.2. O USUÁRIO é o único responsável pela veracidade, completude e consistência das informações inseridas na plataforma, incluindo todos os lançamentos financeiros, entradas, saídas e demais dados da clínica. A GESTA não verifica nem valida a veracidade dos dados inseridos.</S>
      <S>3.3. O USUÁRIO é responsável pela confidencialidade de suas credenciais de acesso (login e senha) e por todas as atividades realizadas em sua conta. Em caso de suspeita de acesso não autorizado, deve comunicar imediatamente a GESTA pelo suporte@gestaa.com.br ou pelo WhatsApp com o time de Customer Success da GESTA.</S>
      <S>3.4. São vedados ao USUÁRIO:<br />
      a) Compartilhar credenciais de acesso com terceiros não autorizados;<br />
      b) Utilizar a plataforma para finalidades diversas das previstas nestes Termos;<br />
      c) Tentar acessar dados de outros usuários ou áreas restritas da plataforma;<br />
      d) Inserir dados de terceiros sem autorização prévia dos respectivos titulares.</S>

      <H2>4. Do Acesso Simultâneo e Irrestrito da GESTA aos Dados do Usuário</H2>
      <Destaque>
        <strong>CLÁUSULA DE CONSENTIMENTO EXPRESSO E ESPECÍFICO</strong><br />
        Destacada das demais cláusulas nos termos do art. 8º, §1º, da Lei nº 13.709/2018 – LGPD.<br />
        <strong>Leia com atenção antes de aceitar.</strong>
      </Destaque>
      <S>4.1. NATUREZA DO ACESSO: O USUÁRIO está ciente e consente expressamente que a arquitetura da plataforma DFC ClinicScale foi concebida para que a GESTA tenha acesso simultâneo, irrestrito e em tempo real a todos os dados, lançamentos e registros inseridos pelo USUÁRIO. Este acesso é um elemento constitutivo e indissociável do serviço.</S>
      <S>4.2. CONSENTIMENTO EXPRESSO: Ao aceitar estes Termos, o USUÁRIO consente expressamente, de forma livre, informada e inequívoca, nos termos do art. 7º, I, c/c art. 8º, caput e §1º, da Lei nº 13.709/2018, que a equipe da GESTA — incluindo sócios, consultores, analistas e colaboradores envolvidos na prestação de serviços ao USUÁRIO — tenha acesso irrestrito e em tempo real à plataforma e a todos os dados nela inseridos, para as finalidades específicas descritas no item 4.3.</S>
      <S>4.3. FINALIDADES ESPECÍFICAS DO ACESSO (art. 8º, §4º, LGPD):<br />
      a) Prestar os serviços de consultoria financeira e de gestão contratados pelo USUÁRIO junto à GESTA;<br />
      b) Conduzir acompanhamentos, mentorias e análises com base na realidade financeira real da clínica;<br />
      c) Identificar inconsistências, erros de preenchimento ou alertas financeiros relevantes;<br />
      d) Produzir relatórios, painéis e análises de desempenho no contexto dos serviços contratados;<br />
      e) Aprimorar continuamente as funcionalidades da plataforma, utilizando dados anonimizados sempre que possível;<br />
      f) Cumprir obrigações legais e contratuais da GESTA.</S>
      <S>4.4. BASE LEGAL: O acesso descrito nesta Seção tem fundamento no consentimento expresso do titular (art. 7º, I, LGPD) e na execução do contrato de prestação de serviços firmado entre as partes (art. 7º, V, LGPD).</S>
      <S>4.5. PESSOAL AUTORIZADO: O acesso é restrito a colaboradores e prestadores de serviço da GESTA que atuem diretamente na prestação de serviços ao USUÁRIO, todos sujeitos a dever contratual de confidencialidade.</S>
      <S>4.6. VEDAÇÃO DE COMPARTILHAMENTO EXTERNO: A GESTA não venderá, cederá, compartilhará ou divulgará os dados financeiros do USUÁRIO a terceiros não relacionados à prestação dos serviços contratados, salvo: (a) mediante consentimento específico e expresso do USUÁRIO; (b) por obrigação legal; ou (c) por ordem judicial ou de autoridade administrativa competente.</S>
      <S>4.7. REVOGAÇÃO DO CONSENTIMENTO: O USUÁRIO pode revogar o consentimento previsto nesta Seção a qualquer momento, sem custo, mediante comunicação à GESTA pelo suporte@gestaa.com.br ou pelo WhatsApp com o time de Customer Success da GESTA, nos termos do art. 8º, §5º, da LGPD.</S>
      <S>Como o acesso simultâneo da GESTA é condição essencial e indissociável da plataforma, a revogação implica o encerramento imediato e completo do acesso do USUÁRIO à plataforma DFC ClinicScale. A revogação não gera direito a reembolso de valores já pagos ou compensação de qualquer natureza.</S>

      <H2>5. Das Obrigações do Usuário</H2>
      <S>5.1. São obrigações do USUÁRIO:<br />
      a) Inserir na plataforma apenas informações verdadeiras, lícitas e relativas à sua própria clínica;<br />
      b) Manter os lançamentos atualizados para viabilizar o acompanhamento pela GESTA;<br />
      c) Utilizar a plataforma exclusivamente para os fins previstos nestes Termos;<br />
      d) Manter suas credenciais de acesso em sigilo;<br />
      e) Comunicar imediatamente à GESTA qualquer suspeita de uso indevido ou acesso não autorizado à sua conta;<br />
      f) Não utilizar a plataforma para armazenar ou transmitir dados de terceiros sem autorização;<br />
      g) Informar à GESTA qualquer alteração relevante que impacte a interpretação dos dados inseridos.</S>

      <H2>6. Da Limitação de Responsabilidade da GESTA</H2>
      <S>6.1. A GESTA não é responsável por:<br />
      a) Decisões financeiras, gerenciais ou clínicas tomadas pelo USUÁRIO com base nos dados ou análises gerados a partir da plataforma;<br />
      b) Consequências decorrentes de lançamentos incorretos, incompletos ou desatualizados inseridos pelo próprio USUÁRIO;<br />
      c) Danos decorrentes do uso indevido das credenciais de acesso pelo USUÁRIO ou por terceiros a quem o USUÁRIO as forneceu;<br />
      d) Interrupções temporárias por manutenção, falhas de infraestrutura de terceiros ou caso fortuito e força maior (art. 393, Código Civil);<br />
      e) Divergências entre os dados inseridos na plataforma e a contabilidade fiscal oficial da clínica.</S>
      <S>6.2. A plataforma DFC ClinicScale não substitui sistema de gestão contábil, ERP ou qualquer software de uso obrigatório para fins fiscais ou tributários.</S>
      <S>6.3. Quando o USUÁRIO for caracterizado como consumidor (Lei nº 8.078/1990, CDC), a responsabilidade total da GESTA fica limitada ao valor efetivamente pago pelo USUÁRIO pelos serviços contratados nos últimos 3 (três) meses anteriores ao evento gerador do dano (art. 51, I, CDC).</S>
      <S>6.4. A GESTA responde por danos decorrentes de tratamento de dados em desconformidade com a LGPD, salvo nas hipóteses excludentes do art. 43 da Lei nº 13.709/2018.</S>

      <H2>7. Da Vigência e do Encerramento</H2>
      <S>7.1. Estes Termos entram em vigor na data do aceite eletrônico pelo USUÁRIO e permanecem vigentes enquanto durar o acesso à plataforma.</S>
      <S>7.2. O acesso à plataforma é encerrado nas seguintes hipóteses:<br />
      a) Encerramento ou vencimento do vínculo contratual com a GESTA, sem renovação;<br />
      b) Inadimplemento contratual do USUÁRIO;<br />
      c) Solicitação expressa do USUÁRIO pelo suporte@gestaa.com.br ou pelo WhatsApp com o time de Customer Success da GESTA;<br />
      d) Revogação do consentimento previsto na Seção 4.7;<br />
      e) Descumprimento de qualquer obrigação prevista nestes Termos.</S>
      <S>7.3. Após o encerramento do acesso, os dados inseridos serão retidos pelos prazos legais da Seção 11 e, em seguida, eliminados de forma segura.</S>
      <S>7.4. A GESTA pode suspender ou encerrar o acesso do USUÁRIO, mediante notificação prévia de 15 (quinze) dias sempre que possível, em caso de uso ilícito ou fraudulento, ou com 30 (trinta) dias de antecedência em caso de encerramento da plataforma.</S>

      <H2>8. Das Alterações dos Termos</H2>
      <S>8.1. A GESTA pode alterar estes Termos a qualquer tempo. Alterações materiais serão comunicadas ao USUÁRIO por e-mail ou aviso na plataforma com antecedência mínima de 15 (quinze) dias.</S>
      <S>8.2. O uso continuado da plataforma após a publicação das alterações constitui aceite tácito dos novos Termos.</S>
      <S>8.3. Caso o USUÁRIO não concorde com as alterações, poderá solicitar o encerramento do acesso nos termos da Seção 7.2.</S>

      <H1>Parte II – Política de Privacidade</H1>

      <H2>9. Da Coleta e do Tratamento de Dados Pessoais</H2>
      <S>9.1. FUNDAMENTO LEGAL: Todo tratamento de dados pessoais realizado pela GESTA está em conformidade com a Lei nº 13.709/2018 (LGPD), a Lei nº 12.965/2014 (Marco Civil da Internet), o Código Civil (Lei nº 10.406/2002) e demais normas aplicáveis.</S>
      <S>9.2. A GESTA atua como Controladora dos dados pessoais do USUÁRIO (art. 5º, VI, LGPD), sendo responsável pelas decisões sobre o tratamento dos dados.</S>
      <S>9.3. DADOS COLETADOS E BASES LEGAIS:</S>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Categoria de Dado', 'Exemplos', 'Base Legal (LGPD)'].map(h => (
                <th key={h} style={{ padding: '8px 12px', background: '#1a1a1a', color: '#c9a22a', textAlign: 'left', border: '1px solid #2a2a2a', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Dados de identificação', 'Nome, CPF/CNPJ, e-mail, telefone, nome da clínica', 'Art. 7º, V – execução de contrato'],
              ['Dados financeiros da clínica', 'Receitas, despesas, saldos, lançamentos de DFC', 'Art. 7º, V e I – contrato + consentimento expresso'],
              ['Dados de acesso e navegação', 'IP, data/hora, dispositivo, cookies de sessão', 'Art. 7º, IX – legítimo interesse + art. 15, Marco Civil'],
              ['Dados de uso da plataforma', 'Funcionalidades acessadas, frequência (anonimizados)', 'Art. 7º, IX – legítimo interesse'],
              ['Dados de comunicação', 'E-mails e mensagens de suporte', 'Art. 7º, V e II – contrato e obrigação legal'],
            ].map(([cat, ex, base], i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#141414' : '#111' }}>
                <td style={{ padding: '8px 12px', border: '1px solid #222', color: '#d0d0d0' }}>{cat}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #222', color: '#aaa' }}>{ex}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #222', color: '#aaa' }}>{base}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <S>9.4. A GESTA não coleta dados pessoais sensíveis (art. 5º, II, LGPD), salvo mediante consentimento específico e destacado do USUÁRIO (art. 11, I, LGPD).</S>

      <H2>10. Da Finalidade do Tratamento</H2>
      <S>10.1. Os dados pessoais e financeiros do USUÁRIO são tratados exclusivamente para (art. 6º, I, LGPD):<br />
      a) Permitir o acesso e uso da plataforma DFC ClinicScale;<br />
      b) Prestar os serviços de consultoria e gestão contratados pelo USUÁRIO junto à GESTA;<br />
      c) Conduzir acompanhamentos e diagnósticos financeiros pelo time da GESTA;<br />
      d) Suporte técnico e atendimento ao USUÁRIO;<br />
      e) Comunicação sobre atualizações e melhorias da plataforma;<br />
      f) Cumprimento de obrigações legais e regulatórias da GESTA;<br />
      g) Aprimoramento da plataforma, com dados anonimizados sempre que possível.</S>
      <S>10.2. O tratamento para finalidades diversas das declaradas exigirá novo consentimento específico do USUÁRIO.</S>

      <H2>11. Da Retenção e Eliminação dos Dados</H2>
      <S>11.1. Após o encerramento do vínculo contratual, os dados serão retidos pelos prazos abaixo:</S>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Categoria de Dado', 'Prazo de Retenção', 'Fundamento'].map(h => (
                <th key={h} style={{ padding: '8px 12px', background: '#1a1a1a', color: '#c9a22a', textAlign: 'left', border: '1px solid #2a2a2a', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Dados de cadastro e contrato', '5 (cinco) anos', 'Art. 206, §5º, I, Código Civil (prescrição)'],
              ['Dados financeiros inseridos', '5 (cinco) anos', 'Legislação fiscal e tributária vigente'],
              ['Registros de acesso', '6 (seis) meses', 'Art. 15, Lei nº 12.965/2014 – Marco Civil'],
              ['Dados de comunicação e suporte', '2 (dois) anos', 'Legítimo interesse da GESTA'],
            ].map(([cat, prazo, fund], i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#141414' : '#111' }}>
                <td style={{ padding: '8px 12px', border: '1px solid #222', color: '#d0d0d0' }}>{cat}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #222', color: '#aaa' }}>{prazo}</td>
                <td style={{ padding: '8px 12px', border: '1px solid #222', color: '#aaa' }}>{fund}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <S>11.2. Após os prazos acima, os dados serão eliminados de forma segura, salvo se a manutenção for exigida por determinação legal, judicial ou regulatória.</S>

      <H2>12. Da Segurança dos Dados</H2>
      <S>12.1. A GESTA adota medidas técnicas e organizacionais proporcionais ao risco do tratamento, incluindo controle de acesso por perfil, criptografia em trânsito e em repouso, e monitoramento de acessos.</S>
      <S>12.2. Em caso de incidente de segurança relevante, a GESTA comunicará a Autoridade Nacional de Proteção de Dados (ANPD) e o USUÁRIO no prazo legal (art. 48, LGPD).</S>
      <S>12.3. A GESTA não garante segurança absoluta contra ataques cibernéticos sofisticados ou falhas de infraestrutura de terceiros alheias ao seu controle.</S>

      <H2>13. Dos Direitos do Titular dos Dados</H2>
      <S>13.1. O USUÁRIO tem os seguintes direitos, exercíveis gratuitamente (arts. 17 a 22, LGPD):<br />
      a) Confirmação da existência de tratamento;<br />
      b) Acesso aos dados pessoais tratados;<br />
      c) Correção de dados incompletos, inexatos ou desatualizados;<br />
      d) Anonimização, bloqueio ou eliminação de dados tratados em desconformidade com a LGPD;<br />
      e) Portabilidade dos dados a outro fornecedor, quando tecnicamente viável;<br />
      f) Eliminação dos dados tratados com base no consentimento, respeitados os prazos legais;<br />
      g) Informação sobre entidades com as quais a GESTA compartilhou dados;<br />
      h) Revogação do consentimento a qualquer momento, com as consequências previstas na Seção 4.7;<br />
      i) Revisão de decisões automatizadas, quando aplicável.</S>
      <S>13.2. Para exercer qualquer direito acima, o USUÁRIO deve contatar a GESTA pelo <strong style={{ color: '#c9a22a' }}>suporte@gestaa.com.br</strong> ou pelo WhatsApp com o time de Customer Success da GESTA. A GESTA responderá no prazo de até 15 (quinze) dias úteis, prorrogável por igual período mediante justificativa.</S>

      <H2>14. Do Aceite Eletrônico e do Log de Confirmação</H2>
      <S>14.1. O aceite destes Termos é realizado de forma eletrônica, por ação afirmativa do USUÁRIO (clique em botão ou marcação de checkbox), com plena validade jurídica nos termos:<br />
      – Art. 10, §2º, da MP nº 2.200-2/2001;<br />
      – Lei nº 14.620/2023 — validade de assinaturas eletrônicas sem certificação digital;<br />
      – Arts. 427 a 435 do Código Civil — formação do contrato pelo aceite.</S>
      <S>14.2. A GESTA registra o log de aceite contendo: data/hora, identificação do USUÁRIO (e-mail ou CPF/CNPJ), IP de acesso e versão do documento aceito.</S>
      <S>14.3. Os registros de acesso são mantidos pelo prazo mínimo de 6 (seis) meses (art. 15, Lei nº 12.965/2014), em ambiente seguro.</S>

      <H2>15. Do Foro e da Lei Aplicável</H2>
      <S>15.1. Estes Termos são regidos pelas leis da República Federativa do Brasil.</S>
      <S>15.2. Fica eleito o Foro da Comarca da Cidade de São Paulo, Estado de São Paulo, com exclusão de qualquer outro, por mais privilegiado que seja (art. 63, Código Civil).</S>
      <S>15.3. As partes comprometem-se a buscar, previamente ao acionamento judicial, a resolução amigável de eventuais conflitos.</S>

      <H2>16. Das Disposições Gerais</H2>
      <S>16.1. Estes Termos constituem o acordo integral entre as partes sobre o uso da plataforma DFC ClinicScale.</S>
      <S>16.2. Estes Termos não criam vínculo empregatício, societário ou de natureza distinta da relação contratual vigente entre as partes.</S>
      <S>16.3. A invalidade de qualquer cláusula não afetará a validade das demais (art. 184, Código Civil).</S>
      <S>16.4. A omissão ou tolerância da GESTA no exercício de qualquer direito não constituirá renúncia.</S>
      <S>16.5. Estes Termos são regidos pelo Código Civil (Lei nº 10.406/2002), especialmente pelos princípios da boa-fé objetiva (art. 422) e da função social do contrato (art. 421).</S>

      <div style={{
        marginTop: 40,
        padding: '20px 24px',
        background: '#141414',
        border: '1px solid #222',
        borderRadius: 8,
        textAlign: 'center',
      }}>
        <div style={{ fontWeight: 700, color: '#e0e0e0', marginBottom: 4 }}>GESTA CONSULTORIA INTEGRADA LTDA</div>
        <div style={{ fontSize: 13, color: '#666' }}>
          CNPJ: 60.619.849/0001-70 &nbsp;|&nbsp; São Paulo/SP &nbsp;|&nbsp; suporte@gestaa.com.br
        </div>
        <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>Versão 1.0 – vigente desde Abril de 2026</div>
      </div>
    </div>
  )
}
