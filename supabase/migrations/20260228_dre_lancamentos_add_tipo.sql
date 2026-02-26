-- Garantir persistência explícita de tipo (receita/despesa) em cada lançamento DRE

ALTER TABLE public.dre_lancamentos
  ADD COLUMN IF NOT EXISTS tipo TEXT;

-- Backfill usando classificação cadastrada
UPDATE public.dre_lancamentos l
SET tipo = c.tipo
FROM public.dre_classificacoes c
WHERE l.tipo IS NULL
  AND lower(trim(l.classificacao)) = lower(trim(c.nome));

-- Backfill de segurança para legado
UPDATE public.dre_lancamentos
SET tipo = CASE
  WHEN lower(trim(classificacao)) = 'receita' THEN 'receita'
  ELSE 'despesa'
END
WHERE tipo IS NULL;

ALTER TABLE public.dre_lancamentos
  ALTER COLUMN tipo SET DEFAULT 'despesa';

ALTER TABLE public.dre_lancamentos
  ALTER COLUMN tipo SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dre_lancamentos_tipo_check'
      AND conrelid = 'public.dre_lancamentos'::regclass
  ) THEN
    ALTER TABLE public.dre_lancamentos
      ADD CONSTRAINT dre_lancamentos_tipo_check
      CHECK (tipo IN ('receita', 'despesa'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dre_lancamentos_tipo
  ON public.dre_lancamentos (tipo);
