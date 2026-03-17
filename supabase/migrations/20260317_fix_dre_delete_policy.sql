-- =============================================================================
-- Migration: Corrige política de DELETE em dre_lancamentos
--
-- Problema: a policy antiga "Admin empresa remove lancamento" exige role='admin'
-- em empresa_membros. Usuários comuns só podiam deletar os próprios registros
-- (user_id = auth.uid()), então "Excluir período" deixava os registros de
-- outros usuários para trás silenciosamente.
--
-- Solução:
--   1. Qualquer membro da empresa pode deletar lançamentos da empresa
--   2. Admin global (profiles.role = 'admin') pode deletar qualquer lançamento
-- =============================================================================

-- 1. Remove a policy restrita (só admin da empresa)
DROP POLICY IF EXISTS "Admin empresa remove lancamento" ON public.dre_lancamentos;

-- 2. Qualquer membro da empresa pode deletar lançamentos dela
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Membro empresa remove lancamento'
  ) THEN
    CREATE POLICY "Membro empresa remove lancamento"
      ON public.dre_lancamentos FOR DELETE
      TO authenticated
      USING (
        empresa_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.empresa_membros em
          WHERE em.empresa_id = dre_lancamentos.empresa_id
            AND em.user_id    = auth.uid()
        )
      );
  END IF;
END $$;

-- 3. Admin global pode deletar qualquer lançamento
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Admin global remove lancamento'
  ) THEN
    CREATE POLICY "Admin global remove lancamento"
      ON public.dre_lancamentos FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;
