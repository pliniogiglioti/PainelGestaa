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
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser()
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Verifica se o chamador é admin
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado: apenas admins podem convidar usuários' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Lê o body
    const { email, expires_at } = await req.json()
    if (!email) {
      return new Response(JSON.stringify({ error: 'E-mail é obrigatório' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Insere convite na tabela user_invitations
    const { error: invErr } = await adminClient.from('user_invitations').insert({
      email,
      expires_at: expires_at ?? null,
      invited_by: callerUser.id,
    })

    if (invErr) {
      return new Response(JSON.stringify({ error: invErr.message }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Envia convite via Supabase Auth Admin
    const { error: authErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: siteUrl,
    })

    if (authErr) {
      // Rollback: remove o convite se não conseguiu enviar o e-mail
      await adminClient.from('user_invitations').delete().eq('email', email).is('used_at', null)
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
