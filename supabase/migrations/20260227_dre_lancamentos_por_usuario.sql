-- =============================================================================
-- Migration: DRE por usuário (isolamento de lançamentos)
-- =============================================================================

-- Garante que novos lançamentos sejam vinculados ao usuário autenticado.
ALTER TABLE public.dre_lancamentos
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Ativa RLS para isolar os dados por usuário.
ALTER TABLE public.dre_lancamentos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dre_lancamentos'
      AND policyname = 'Usuario le seus lancamentos DRE'
  ) THEN
    CREATE POLICY "Usuario le seus lancamentos DRE"
      ON public.dre_lancamentos FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dre_lancamentos'
      AND policyname = 'Usuario cria seus lancamentos DRE'
  ) THEN
    CREATE POLICY "Usuario cria seus lancamentos DRE"
      ON public.dre_lancamentos FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dre_lancamentos'
      AND policyname = 'Usuario atualiza seus lancamentos DRE'
  ) THEN
    CREATE POLICY "Usuario atualiza seus lancamentos DRE"
      ON public.dre_lancamentos FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dre_lancamentos'
      AND policyname = 'Usuario remove seus lancamentos DRE'
  ) THEN
    CREATE POLICY "Usuario remove seus lancamentos DRE"
      ON public.dre_lancamentos FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
