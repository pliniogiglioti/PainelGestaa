-- =============================================================================
-- Correção de segurança (advisors do Supabase, verificado via MCP):
-- RLS estava desabilitada em produção em `profiles`, `empresas`,
-- `user_invitations` e `forum_categories`; três policies de `empresas`
-- tinham um bug de correlação que as tornava inertes; funções SECURITY
-- DEFINER sensíveis eram executáveis por `anon`/`PUBLIC` sem necessidade;
-- várias funções tinham search_path mutável. Todos os itens abaixo já
-- foram aplicados diretamente no banco via MCP — este arquivo documenta a
-- correção no histórico de migrations do repositório.
-- =============================================================================

-- ── Helper: is_admin() ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── profiles ─────────────────────────────────────────────────────────────
-- RLS estava DESABILITADA (advisor: rls_disabled_in_public) — expunha
-- leitura/escrita de TODOS os perfis a qualquer usuário autenticado. As
-- policies "Usuário vê só o próprio perfil" e "...atualiza..." (já
-- existentes) cobrem o caso individual; faltavam INSERT e a visão/gestão de
-- admin sobre outros usuários (usada em AdminSettingsPage.tsx).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin le todos profiles"        ON public.profiles;
DROP POLICY IF EXISTS "Usuario insere proprio profile"  ON public.profiles;
DROP POLICY IF EXISTS "Admin atualiza todos profiles"   ON public.profiles;

CREATE POLICY "Admin le todos profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Usuario insere proprio profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admin atualiza todos profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Defesa em profundidade: a policy de UPDATE próprio (USING auth.uid()=id,
-- sem WITH CHECK dedicado) permitia que qualquer usuário fizesse
-- UPDATE ... SET role='admin' em si mesmo — escalonamento de privilégio
-- direto via supabase-js. Este trigger bloqueia alteração de colunas
-- sensíveis por quem não for admin.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role           IS DISTINCT FROM OLD.role
     OR NEW.ativo           IS DISTINCT FROM OLD.ativo
     OR NEW.expires_at      IS DISTINCT FROM OLD.expires_at
     OR NEW.app_access_ids  IS DISTINCT FROM OLD.app_access_ids THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar role, ativo, expires_at ou app_access_ids.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ── empresas ─────────────────────────────────────────────────────────────
-- RLS estava DESABILITADA. Além disso, três policies existentes tinham um
-- bug de correlação: `em.empresa_id = em.id` compara duas colunas da MESMA
-- linha de empresa_membros entre si, nunca referenciando a linha de
-- `empresas` sendo acessada — na prática nunca concediam acesso (só
-- "funcionavam" por acidente enquanto RLS estava desligada, que era o único
-- motivo de donos/membros comuns conseguirem ver a própria empresa).
-- Reescritas para correlacionar corretamente, reaproveitando os helpers já
-- usados em outras tabelas (is_empresa_member/is_empresa_admin).
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membro enxerga empresa"          ON public.empresas;
DROP POLICY IF EXISTS "Admin empresa pode atualizar"    ON public.empresas;
DROP POLICY IF EXISTS "Admin deleta empresa"            ON public.empresas;

CREATE POLICY "Membro enxerga empresa" ON public.empresas
  FOR SELECT TO authenticated
  USING (public.is_empresa_member(id));

CREATE POLICY "Admin empresa pode atualizar" ON public.empresas
  FOR UPDATE TO authenticated
  USING (public.is_empresa_admin(id))
  WITH CHECK (public.is_empresa_admin(id));

CREATE POLICY "Admin deleta empresa" ON public.empresas
  FOR DELETE TO authenticated
  USING (public.is_empresa_admin(id));

-- ── user_invitations ─────────────────────────────────────────────────────
-- Nunca teve RLS habilitada. Só é acessada pela Edge Function `invite-user`
-- (service role, ignora RLS) — habilitar sem nenhuma policy bloqueia todo
-- acesso direto via API/client e mantém a function funcionando normalmente.
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- ── forum_categories ─────────────────────────────────────────────────────
-- RLS estava DESABILITADA e sem nenhuma policy (forum_topics/forum_replies
-- já tinham RLS + policies corretas — não foram tocadas). Pelo uso em
-- DashboardPage.tsx, categorias são só leitura para qualquer autenticado.
ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticado le categorias" ON public.forum_categories;
CREATE POLICY "Autenticado le categorias" ON public.forum_categories
  FOR SELECT TO authenticated
  USING (true);

-- ── search_path mutável (advisor: function_search_path_mutable) ──────────
ALTER FUNCTION public.is_empresa_member(uuid)      SET search_path = public;
ALTER FUNCTION public.is_empresa_admin(uuid)        SET search_path = public;
ALTER FUNCTION public.set_updated_at()              SET search_path = public;
ALTER FUNCTION public.handle_user_invitation()      SET search_path = public;
ALTER FUNCTION public.propagate_grupo_rename()      SET search_path = public;
ALTER FUNCTION public.handle_new_user()             SET search_path = public;
ALTER FUNCTION public.increment_topic_views(uuid)   SET search_path = public;

-- ── EXECUTE por anon/PUBLIC em funções sensíveis ──────────────────────────
-- As funções já validam auth.uid()/permissão internamente (não são
-- exploráveis por usuário anônimo), mas não há motivo para o grant existir.
-- Supabase concede EXECUTE a anon/authenticated automaticamente para toda
-- função nova via default privileges — por isso revoga tanto de PUBLIC
-- (grants antigos) quanto explicitamente de anon (grants novos), e reconcede
-- a authenticated, que é quem de fato usa essas funções.
REVOKE EXECUTE ON FUNCTION public.remover_colaborador_empresa(uuid, uuid)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vincular_colaborador_empresa(uuid, text)             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atualizar_acesso_colaborador_empresa(uuid, uuid, uuid[], boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listar_membros_empresa(uuid)                         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listar_convites_pendentes_empresa(uuid)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_empresa_admin(uuid)                               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_empresa_member(uuid)                              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin()                                          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin()                                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns()                FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns()                FROM authenticated;

GRANT EXECUTE ON FUNCTION public.remover_colaborador_empresa(uuid, uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_colaborador_empresa(uuid, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_acesso_colaborador_empresa(uuid, uuid, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_membros_empresa(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_convites_pendentes_empresa(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_empresa_admin(uuid)                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_empresa_member(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                                          TO authenticated;
