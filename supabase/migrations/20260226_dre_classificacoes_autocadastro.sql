-- =============================================================================
-- Migration: Permitir autocadastro de classificações DRE pelo wizard
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dre_classificacoes'
      AND policyname = 'Cadastro autenticado de dre_classificacoes'
  ) THEN
    CREATE POLICY "Cadastro autenticado de dre_classificacoes"
      ON public.dre_classificacoes FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dre_classificacoes'
      AND policyname = 'Atualizacao autenticada de dre_classificacoes'
  ) THEN
    CREATE POLICY "Atualizacao autenticada de dre_classificacoes"
      ON public.dre_classificacoes FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
