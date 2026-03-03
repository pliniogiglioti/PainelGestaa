-- =============================================================================
-- Migration: Acesso admin — ver lançamentos de qualquer usuário
-- =============================================================================

-- ── 1. Admin pode ler TODOS os lançamentos DRE ─────────────────────────────
-- As políticas de SELECT são combinadas com OR, então esta complementa
-- a política existente "Usuario le seus lancamentos DRE".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Admin le todos lancamentos DRE'
  ) THEN
    CREATE POLICY "Admin le todos lancamentos DRE"
      ON public.dre_lancamentos FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- ── 2. Admin pode ler TODOS os profiles (para listar usuários) ─────────────
-- Garante primeiro que RLS está ativo na tabela profiles.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Política básica: cada usuário lê o próprio perfil
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Usuario le proprio profile'
  ) THEN
    CREATE POLICY "Usuario le proprio profile"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (id = auth.uid());
  END IF;

  -- Política admin: admin lê todos os perfis
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Admin le todos profiles'
  ) THEN
    CREATE POLICY "Admin le todos profiles"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles AS p
          WHERE p.id = auth.uid() AND p.role = 'admin'
        )
      );
  END IF;
END $$;
