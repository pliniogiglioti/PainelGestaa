-- =============================================================================
-- User Invitations: convite de usuários pelo admin
-- =============================================================================

-- Adiciona coluna expires_at na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

-- Tabela de convites pendentes
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ,
  invited_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  used_at     TIMESTAMPTZ DEFAULT NULL
);

-- Trigger: ao inserir novo profile (após signup do usuário convidado),
-- se houver convite pendente com o mesmo e-mail,
-- atualiza o profile com role='user' e expires_at do convite.
CREATE OR REPLACE FUNCTION public.handle_user_invitation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv
    FROM public.user_invitations
   WHERE email = NEW.email
     AND used_at IS NULL
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.profiles
       SET role       = 'user',
           expires_at = inv.expires_at,
           updated_at = NOW()
     WHERE id = NEW.id;

    UPDATE public.user_invitations
       SET used_at = NOW()
     WHERE id = inv.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invited_user_created ON public.profiles;
CREATE TRIGGER on_invited_user_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_invitation();
