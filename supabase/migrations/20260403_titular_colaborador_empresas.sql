-- =============================================================================
-- Titular x Colaborador + gestao de colaboradores por empresa
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tipo_usuario TEXT NOT NULL DEFAULT 'titular'
  CHECK (tipo_usuario IN ('titular', 'colaborador'));

UPDATE public.profiles
SET tipo_usuario = 'titular'
WHERE tipo_usuario IS NULL;

DROP POLICY IF EXISTS "Usuario cria empresa" ON public.empresas;
CREATE POLICY "Usuario cria empresa"
  ON public.empresas FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR COALESCE(p.tipo_usuario, 'titular') = 'titular'
        )
    )
  );

CREATE OR REPLACE FUNCTION public.listar_membros_empresa(p_empresa_id UUID)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  tipo_usuario TEXT,
  empresa_role TEXT,
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
    em.created_at
  FROM public.empresa_membros em
  JOIN public.profiles pr ON pr.id = em.user_id
  WHERE em.empresa_id = p_empresa_id
  ORDER BY
    CASE WHEN em.role = 'admin' THEN 0 ELSE 1 END,
    COALESCE(pr.name, pr.email, '') ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.vincular_colaborador_empresa(p_empresa_id UUID, p_email TEXT)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  email TEXT,
  tipo_usuario TEXT,
  empresa_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessao invalida.';
  END IF;

  IF COALESCE(trim(p_email), '') = '' THEN
    RAISE EXCEPTION 'Informe o e-mail do colaborador.';
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

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE lower(trim(profiles.email)) = lower(trim(p_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario nao encontrado. Peca para ele criar a conta primeiro.';
  END IF;

  INSERT INTO public.empresa_membros (empresa_id, user_id, role)
  VALUES (p_empresa_id, v_profile.id, 'membro')
  ON CONFLICT (empresa_id, user_id) DO NOTHING;

  UPDATE public.empresa_membros
  SET role = 'membro'
  WHERE empresa_id = p_empresa_id
    AND user_id = v_profile.id
    AND role <> 'admin';

  UPDATE public.profiles p
  SET tipo_usuario = 'colaborador',
      updated_at = NOW()
  WHERE p.id = v_profile.id
    AND p.role <> 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.empresa_membros em
      WHERE em.user_id = p.id
        AND em.role = 'admin'
    );

  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.email,
    COALESCE(pr.tipo_usuario, 'titular') AS tipo_usuario,
    em.role AS empresa_role
  FROM public.empresa_membros em
  JOIN public.profiles pr ON pr.id = em.user_id
  WHERE em.empresa_id = p_empresa_id
    AND em.user_id = v_profile.id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_colaborador_empresa(p_empresa_id UUID, p_user_id UUID)
RETURNS VOID
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

  DELETE FROM public.empresa_membros
  WHERE empresa_id = p_empresa_id
    AND user_id = p_user_id
    AND role = 'membro';

  UPDATE public.profiles p
  SET tipo_usuario = 'titular',
      updated_at = NOW()
  WHERE p.id = p_user_id
    AND p.role <> 'admin'
    AND NOT EXISTS (
      SELECT 1
      FROM public.empresa_membros em
      WHERE em.user_id = p.id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_membros_empresa(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_colaborador_empresa(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remover_colaborador_empresa(UUID, UUID) TO authenticated;
