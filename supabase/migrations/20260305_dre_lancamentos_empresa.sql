-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Vincular dre_lancamentos à empresa
--
-- • Adiciona coluna empresa_id (nullable para não quebrar dados existentes)
-- • Adiciona política RLS: membros da empresa lêem/escrevem lançamentos dela
-- • Mantém a política de user_id existente (retrocompatibilidade)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Adiciona empresa_id ────────────────────────────────────────────────────

ALTER TABLE public.dre_lancamentos
  ADD COLUMN IF NOT EXISTS empresa_id UUID
  REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dre_lancamentos_empresa_id
  ON public.dre_lancamentos (empresa_id)
  WHERE empresa_id IS NOT NULL;

COMMENT ON COLUMN public.dre_lancamentos.empresa_id IS
  'Empresa à qual este lançamento pertence. NULL = lançamento legado (user_id apenas).';


-- ── 2. RLS: leitura por membros da empresa ────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Membro empresa le lancamentos'
  ) THEN
    CREATE POLICY "Membro empresa le lancamentos"
      ON public.dre_lancamentos FOR SELECT
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


-- ── 3. RLS: inserção por membros da empresa ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Membro empresa insere lancamento'
  ) THEN
    CREATE POLICY "Membro empresa insere lancamento"
      ON public.dre_lancamentos FOR INSERT
      TO authenticated
      WITH CHECK (
        empresa_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.empresa_membros em
          WHERE em.empresa_id = dre_lancamentos.empresa_id
            AND em.user_id    = auth.uid()
        )
      );
  END IF;
END $$;


-- ── 4. RLS: atualização por membros da empresa ────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Membro empresa atualiza lancamento'
  ) THEN
    CREATE POLICY "Membro empresa atualiza lancamento"
      ON public.dre_lancamentos FOR UPDATE
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


-- ── 5. RLS: exclusão por membros admin da empresa ─────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dre_lancamentos'
      AND policyname = 'Admin empresa remove lancamento'
  ) THEN
    CREATE POLICY "Admin empresa remove lancamento"
      ON public.dre_lancamentos FOR DELETE
      TO authenticated
      USING (
        empresa_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.empresa_membros em
          WHERE em.empresa_id = dre_lancamentos.empresa_id
            AND em.user_id    = auth.uid()
            AND em.role       = 'admin'
        )
      );
  END IF;
END $$;
