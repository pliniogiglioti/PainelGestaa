-- =============================================================================
-- Migration: Política de DELETE para empresas
--
-- Permite que admins da empresa e admins do sistema excluam empresas.
-- Nota: dre_lancamentos tem ON DELETE SET NULL no empresa_id, portanto
-- os lançamentos devem ser excluídos explicitamente no app antes de
-- excluir a empresa.
-- =============================================================================

-- Política de DELETE para empresa admin e admin do sistema
DROP POLICY IF EXISTS "Admin deleta empresa" ON public.empresas;
CREATE POLICY "Admin deleta empresa"
  ON public.empresas FOR DELETE
  TO authenticated
  USING (
    -- Admin da própria empresa
    EXISTS (
      SELECT 1 FROM public.empresa_membros em
      WHERE em.empresa_id = id
        AND em.user_id    = auth.uid()
        AND em.role       = 'admin'
    )
    OR
    -- Admin do sistema
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role = 'admin'
    )
  );

-- Política de DELETE em dre_lancamentos para admin do sistema
-- (a política "Admin empresa remove lancamento" já cobre admins da empresa)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Admin sistema remove lancamentos'
  ) THEN
    CREATE POLICY "Admin sistema remove lancamentos"
      ON public.dre_lancamentos FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id   = auth.uid()
            AND p.role = 'admin'
        )
      );
  END IF;
END $$;
