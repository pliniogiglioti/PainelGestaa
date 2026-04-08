ALTER TABLE public.empresa_convites
  ADD COLUMN IF NOT EXISTS app_access_ids uuid[] NULL;

COMMENT ON COLUMN public.empresa_convites.app_access_ids IS
  'Apps liberados para o colaborador durante o convite. NULL mantem comportamento legado; array vazia = nenhum app.';

CREATE OR REPLACE FUNCTION public.handle_empresa_convites_pendentes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv RECORD;
  invited_app_ids uuid[] := ARRAY[]::uuid[];
  should_update_app_access boolean := false;
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

    IF conv.app_access_ids IS NOT NULL THEN
      should_update_app_access := true;

      invited_app_ids := ARRAY(
        SELECT DISTINCT app_id
        FROM unnest(invited_app_ids || conv.app_access_ids) AS app_id
      );
    END IF;

    UPDATE public.empresa_convites
    SET used_at = NOW()
    WHERE id = conv.id;
  END LOOP;

  UPDATE public.profiles p
  SET tipo_usuario = 'colaborador',
      app_access_ids = CASE
        WHEN should_update_app_access THEN invited_app_ids
        ELSE p.app_access_ids
      END,
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
