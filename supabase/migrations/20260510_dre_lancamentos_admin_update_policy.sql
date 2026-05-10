-- =============================================================================
-- Migration: Permite UPDATE de dre_lancamentos para admin do sistema
-- =============================================================================
--
-- Problema:
--   - Existe policy para admin global ler todos os lancamentos
--   - Existe policy para admin global remover lancamentos
--   - Mas nao existe policy equivalente para UPDATE
--
-- Efeito no app:
--   - O admin consegue visualizar lancamentos de outros usuarios/empresas
--   - Mas pode falhar ao editar classificacao, grupo ou tipo por RLS
--
-- Solucao:
--   - Adiciona policy explicita de UPDATE para profiles.role = 'admin'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Admin sistema atualiza lancamentos'
  ) THEN
    CREATE POLICY "Admin sistema atualiza lancamentos"
      ON public.dre_lancamentos FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id   = auth.uid()
            AND p.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id   = auth.uid()
            AND p.role = 'admin'
        )
      );
  END IF;
END $$;
