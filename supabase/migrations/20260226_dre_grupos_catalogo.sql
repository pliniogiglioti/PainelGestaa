-- =============================================================================
-- Migration: Catálogo de grupos DRE (com cadastro automático via wizard)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dre_grupos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL,
  tipo        TEXT        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nome, tipo)
);

COMMENT ON TABLE public.dre_grupos IS
  'Catálogo de grupos/categorias para lançamentos DRE.';

CREATE INDEX IF NOT EXISTS idx_dre_grupos_tipo_nome
  ON public.dre_grupos (tipo, nome);

ALTER TABLE public.dre_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura autenticada de dre_grupos"
  ON public.dre_grupos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Cadastro autenticado de dre_grupos"
  ON public.dre_grupos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Atualizacao autenticada de dre_grupos"
  ON public.dre_grupos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
