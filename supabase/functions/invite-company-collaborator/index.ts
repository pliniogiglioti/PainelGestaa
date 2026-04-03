import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.15'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const smtpHost = Deno.env.get('SMTP_HOST') ?? 'mail.gestaa.com.br'
const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '465')
const smtpUser = Deno.env.get('SMTP_USER') ?? 'painel@gestaa.com.br'
const smtpPass = Deno.env.get('SENHA_SMTP') ?? ''
const smtpFromEmail = Deno.env.get('SMTP_FROM_EMAIL') ?? 'painel@gestaa.com.br'
const smtpFromName = Deno.env.get('SMTP_FROM_NAME') ?? 'Painel Gesta'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function buildInviteEmailHtml({
  empresaNome,
  inviterName,
  actionLink,
}: {
  empresaNome: string
  inviterName: string
  actionLink: string
}) {
  return `
    <div style="font-family: Arial, sans-serif; background:#0b0b0b; color:#f5f5f5; padding:32px;">
      <div style="max-width:600px; margin:0 auto; background:#151515; border:1px solid #2a2a2a; border-radius:16px; padding:32px;">
        <p style="margin:0 0 8px; font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#c9a22a;">Painel Gesta</p>
        <h1 style="margin:0 0 16px; font-size:28px; line-height:1.15;">Voce recebeu um convite</h1>
        <p style="margin:0 0 12px; font-size:15px; line-height:1.6; color:#d0d0d0;">
          ${inviterName} convidou voce para acessar a empresa <strong style="color:#ffffff;">${empresaNome}</strong> no Painel Gesta.
        </p>
        <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#d0d0d0;">
          Clique no botao abaixo para concluir seu cadastro e ativar o acesso.
        </p>
        <a href="${actionLink}" style="display:inline-block; background:#c9a22a; color:#111111; text-decoration:none; font-weight:700; padding:14px 22px; border-radius:12px;">
          Concluir cadastro
        </a>
        <p style="margin:24px 0 0; font-size:13px; line-height:1.6; color:#9a9a9a;">
          Se o botao nao abrir, use este link:<br />
          <a href="${actionLink}" style="color:#f0d27a; word-break:break-all;">${actionLink}</a>
        </p>
      </div>
    </div>
  `
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://painel.gestaa.com.br'

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Nao autorizado.' }, 401)
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: callerUser }, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !callerUser) {
      return jsonResponse({ error: 'Nao autorizado.' }, 401)
    }

    const { email, empresa_id } = await req.json()
    const normalizedEmail = String(email ?? '').trim().toLowerCase()
    const empresaId = String(empresa_id ?? '').trim()

    if (!normalizedEmail) {
      return jsonResponse({ error: 'Informe o e-mail do colaborador.' }, 400)
    }

    if (!empresaId) {
      return jsonResponse({ error: 'Empresa nao informada.' }, 400)
    }

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('id, role, name, email')
      .eq('id', callerUser.id)
      .single()

    const isSystemAdmin = callerProfile?.role === 'admin'

    if (!isSystemAdmin) {
      const { data: membroAdmin } = await adminClient
        .from('empresa_membros')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('user_id', callerUser.id)
        .eq('role', 'admin')
        .maybeSingle()

      if (!membroAdmin) {
        return jsonResponse({ error: 'Acesso negado: apenas titulares podem adicionar colaboradores.' }, 403)
      }
    }

    const { data: empresa } = await adminClient
      .from('empresas')
      .select('id, nome, created_by')
      .eq('id', empresaId)
      .maybeSingle()

    if (!empresa) {
      return jsonResponse({ error: 'Empresa nao encontrada.' }, 404)
    }

    const { data: existingProfiles } = await adminClient
      .from('profiles')
      .select('id, role, tipo_usuario, email')
      .ilike('email', normalizedEmail)
      .limit(1)

    const existingProfile = existingProfiles?.[0]

    if (existingProfile) {
      const { data: existingMembership } = await adminClient
        .from('empresa_membros')
        .select('id, role')
        .eq('empresa_id', empresaId)
        .eq('user_id', existingProfile.id)
        .maybeSingle()

      if (!existingMembership) {
        const { error: insertMembershipError } = await adminClient
          .from('empresa_membros')
          .insert({
            empresa_id: empresaId,
            user_id: existingProfile.id,
            role: 'membro',
          })

        if (insertMembershipError) {
          return jsonResponse({ error: insertMembershipError.message }, 500)
        }
      } else if (existingMembership.role !== 'admin') {
        const { error: updateMembershipError } = await adminClient
          .from('empresa_membros')
          .update({ role: 'membro' })
          .eq('id', existingMembership.id)

        if (updateMembershipError) {
          return jsonResponse({ error: updateMembershipError.message }, 500)
        }
      }

      const { count: adminMembershipCount } = await adminClient
        .from('empresa_membros')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', existingProfile.id)
        .eq('role', 'admin')

      if (existingProfile.role !== 'admin' && (adminMembershipCount ?? 0) === 0) {
        await adminClient
          .from('profiles')
          .update({ tipo_usuario: 'colaborador', updated_at: new Date().toISOString() })
          .eq('id', existingProfile.id)
      }

      return jsonResponse({ ok: true, mode: 'linked' })
    }

    const inviterName = callerProfile?.name?.trim() || callerProfile?.email?.trim() || 'Um titular'

    await adminClient
      .from('empresa_convites')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('email', normalizedEmail)
      .is('used_at', null)

    const { error: insertInviteError } = await adminClient
      .from('empresa_convites')
      .insert({
        empresa_id: empresaId,
        email: normalizedEmail,
        invited_by: callerUser.id,
      })

    if (insertInviteError) {
      return jsonResponse({ error: insertInviteError.message }, 500)
    }

    const { data: generatedInvite, error: generateInviteError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo: siteUrl },
    })

    if (generateInviteError || !generatedInvite?.properties?.action_link) {
      await adminClient
        .from('empresa_convites')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('email', normalizedEmail)
        .is('used_at', null)
      return jsonResponse({ error: generateInviteError?.message ?? 'Nao foi possivel gerar o link do convite.' }, 500)
    }

    if (!smtpPass) {
      return jsonResponse({ error: 'Secret SENHA_SMTP nao configurado.' }, 500)
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    try {
      await transporter.sendMail({
        from: `"${smtpFromName}" <${smtpFromEmail}>`,
        to: normalizedEmail,
        subject: `Convite para acessar ${empresa.nome} no Painel Gesta`,
        html: buildInviteEmailHtml({
          empresaNome: empresa.nome,
          inviterName,
          actionLink: generatedInvite.properties.action_link,
        }),
      })
    } catch (smtpError) {
      await adminClient
        .from('empresa_convites')
        .delete()
        .eq('empresa_id', empresaId)
        .eq('email', normalizedEmail)
        .is('used_at', null)

      return jsonResponse({ error: smtpError instanceof Error ? smtpError.message : 'Nao foi possivel enviar o e-mail.' }, 500)
    }

    return jsonResponse({ ok: true, mode: 'invited' })
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500)
  }
})
