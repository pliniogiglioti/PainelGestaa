DROP FUNCTION IF EXISTS public.listar_membros_empresa(UUID);

CREATE OR REPLACE FUNCTION public.listar_membros_empresa(p_empresa_id UUID)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  tipo_usuario TEXT,
  empresa_role TEXT,
  ativo BOOLEAN,
  app_access_ids UUID[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.empresa_membros em
    WHERE em.empresa_id = p_empresa_id
      AND em.user_id = auth.uid()
      AND em.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.email,
    COALESCE(pr.tipo_usuario, 'titular') AS tipo_usuario,
    em.role AS empresa_role,
    pr.ativo,
    pr.app_access_ids,
    em.created_at
  FROM public.empresa_membros em
  JOIN public.profiles pr ON pr.id = em.user_id
  WHERE em.empresa_id = p_empresa_id
  ORDER BY
    CASE WHEN em.role = 'admin' THEN 0 ELSE 1 END,
    COALESCE(pr.name, pr.email, '') ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_acesso_colaborador_empresa(
  p_empresa_id UUID,
  p_user_id UUID,
  p_app_access_ids UUID[],
  p_ativo BOOLEAN
)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  tipo_usuario TEXT,
  empresa_role TEXT,
  ativo BOOLEAN,
  app_access_ids UUID[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.empresa_membros em
    WHERE em.empresa_id = p_empresa_id
      AND em.user_id = auth.uid()
      AND em.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT em.role
  INTO target_role
  FROM public.empresa_membros em
  WHERE em.empresa_id = p_empresa_id
    AND em.user_id = p_user_id
  LIMIT 1;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'Colaborador nao encontrado nesta empresa.';
  END IF;

  IF target_role = 'admin' THEN
    RAISE EXCEPTION 'Nao e permitido alterar o titular da empresa por este fluxo.';
  END IF;

  UPDATE public.profiles
  SET app_access_ids = COALESCE(p_app_access_ids, ARRAY[]::uuid[]),
      ativo = COALESCE(p_ativo, ativo),
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.email,
    COALESCE(pr.tipo_usuario, 'titular') AS tipo_usuario,
    em.role AS empresa_role,
    pr.ativo,
    pr.app_access_ids,
    em.created_at
  FROM public.empresa_membros em
  JOIN public.profiles pr ON pr.id = em.user_id
  WHERE em.empresa_id = p_empresa_id
    AND em.user_id = p_user_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_membros_empresa(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_acesso_colaborador_empresa(UUID, UUID, UUID[], BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_convites_pendentes_empresa(p_empresa_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  app_access_ids UUID[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.empresa_membros em
    WHERE em.empresa_id = p_empresa_id
      AND em.user_id = auth.uid()
      AND em.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  RETURN QUERY
  SELECT
    ec.id,
    ec.email,
    ec.app_access_ids,
    ec.created_at
  FROM public.empresa_convites ec
  WHERE ec.empresa_id = p_empresa_id
    AND ec.used_at IS NULL
  ORDER BY ec.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_convites_pendentes_empresa(UUID) TO authenticated;
