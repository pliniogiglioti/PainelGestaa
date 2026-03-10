-- =============================================================================
-- Migration: Histórico de Classificações por Empresa
--
-- Armazena a memória de classificações já feitas (manualmente ou pela IA
-- confirmadas pelo usuário) para que uploads futuros possam reutilizá-las
-- antes mesmo de chamar a IA — reduzindo "Não Identificados" ao longo do tempo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dre_classificacao_historico (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  descricao_normalizada TEXT        NOT NULL,
  classificacao         TEXT        NOT NULL,
  grupo                 TEXT        NOT NULL,
  tipo                  TEXT        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  frequencia            INTEGER     NOT NULL DEFAULT 1,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, descricao_normalizada)
);

COMMENT ON TABLE public.dre_classificacao_historico IS
  'Memória de classificações por empresa. Alimentada a cada importação confirmada.
   Na próxima importação, correspondências exatas são usadas diretamente sem chamar a IA.';

CREATE INDEX IF NOT EXISTS idx_clf_hist_empresa
  ON public.dre_classificacao_historico (empresa_id);

ALTER TABLE public.dre_classificacao_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membro gerencia histórico da empresa" ON public.dre_classificacao_historico;
CREATE POLICY "Membro gerencia histórico da empresa"
  ON public.dre_classificacao_historico FOR ALL
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.empresa_membros WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM public.empresa_membros WHERE user_id = auth.uid()
    )
  );
