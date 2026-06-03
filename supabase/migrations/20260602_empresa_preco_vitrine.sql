-- Tabela de preços de vitrine por empresa: liga empresa_precos ao preço usado na venda
CREATE TABLE IF NOT EXISTS public.empresa_preco_vitrine (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  empresa_preco_id UUID        NOT NULL REFERENCES public.empresa_precos(id) ON DELETE CASCADE,
  preco_minimo     NUMERIC     NOT NULL DEFAULT 0,
  preco_vitrine    NUMERIC     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, empresa_preco_id)
);

ALTER TABLE public.empresa_preco_vitrine ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membro gerencia vitrine da empresa"
  ON public.empresa_preco_vitrine FOR ALL
  TO authenticated
  USING (
    empresa_id IN (SELECT empresa_id FROM public.empresa_membros WHERE user_id = auth.uid())
  )
  WITH CHECK (
    empresa_id IN (SELECT empresa_id FROM public.empresa_membros WHERE user_id = auth.uid())
  );
