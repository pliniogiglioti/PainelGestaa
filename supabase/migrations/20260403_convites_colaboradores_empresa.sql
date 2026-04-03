-- =============================================================================
-- Convites pendentes de colaboradores por empresa
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.empresa_convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_empresa_convites_empresa_id
  ON public.empresa_convites (empresa_id);

CREATE INDEX IF NOT EXISTS idx_empresa_convites_email
  ON public.empresa_convites (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresa_convites_pendentes
  ON public.empresa_convites (empresa_id, lower(email))
  WHERE used_at IS NULL;

ALTER TABLE public.empresa_convites ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_empresa_convites_pendentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv RECORD;
BEGIN
  FOR conv IN
    SELECT *
    FROM public.empresa_convites
    WHERE lower(email) = lower(NEW.email)
      AND used_at IS NULL
  LOOP
    INSERT INTO public.empresa_membros (empresa_id, user_id, role)
    VALUES (conv.empresa_id, NEW.id, 'membro')
    ON CONFLICT (empresa_id, user_id) DO NOTHING;

    UPDATE public.empresa_membros
    SET role = 'membro'
    WHERE empresa_id = conv.empresa_id
      AND user_id = NEW.id
      AND role <> 'admin';

    UPDATE public.empresa_convites
    SET used_at = NOW()
    WHERE id = conv.id;
  END LOOP;

  UPDATE public.profiles p
  SET tipo_usuario = 'colaborador',
      updated_at = NOW()
  WHERE p.id = NEW.id
    AND p.role <> 'admin'
    AND EXISTS (
      SELECT 1
      FROM public.empresa_membros em
      WHERE em.user_id = p.id
        AND em.role = 'membro'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.empresa_membros em
      WHERE em.user_id = p.id
        AND em.role = 'admin'
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_company_collaborator_invited_user_created ON public.profiles;
CREATE TRIGGER on_company_collaborator_invited_user_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_empresa_convites_pendentes();
