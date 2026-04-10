// Supabase Edge Function: invite-user
// Cria um convite para um novo usuário:
//  1. Insere em user_invitations (email, expires_at, invited_by)
//  2. Chama admin.inviteUserByEmail → Supabase envia e-mail com link de cadastro

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const siteUrl         = Deno.env.get('SITE_URL') ?? supabaseUrl

    // Cliente com service role para operações admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verifica autenticação do chamador
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Não autorizado' }, 401)
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerUser) {
      return jsonResponse({ error: 'Não autorizado' }, 401)
    }

    // Verifica se o chamador é admin
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (profile?.role !== 'admin') {
      return jsonResponse({ error: 'Acesso negado: apenas admins podem convidar usuários' }, 403)
    }

    // Lê o body
    const { email, expires_at } = await req.json()
    const normalizedEmail = String(email ?? '').trim().toLowerCase()
    if (!normalizedEmail) {
      return jsonResponse({ error: 'E-mail é obrigatório' }, 400)
    }

    // Insere convite na tabela user_invitations
    const { error: invErr } = await adminClient.from('user_invitations').insert({
      email: normalizedEmail,
      expires_at: expires_at ?? null,
      invited_by: callerUser.id,
    })

    if (invErr) {
      return jsonResponse({ error: invErr.message }, 500)
    }

    // Envia convite via Supabase Auth Admin
    const { error: authErr } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: siteUrl,
    })

    if (authErr) {
      console.error('invite-user auth invite error', authErr)
      // Rollback: remove o convite se não conseguiu enviar o e-mail
      await adminClient.from('user_invitations').delete().ilike('email', normalizedEmail).is('used_at', null)
      return jsonResponse({ error: authErr.message }, 500)
    }

    return jsonResponse({ ok: true })
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500)
  }
})
