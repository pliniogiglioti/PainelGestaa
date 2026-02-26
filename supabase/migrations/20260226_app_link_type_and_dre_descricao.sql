-- =============================================================================
-- Migration: App link_type + DRE descricao + GroqCloud edge function support
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ── 1. Tabela apps: adicionar coluna link_type ────────────────────────────
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS link_type TEXT
    CHECK (link_type IN ('interno', 'externo'));

COMMENT ON COLUMN public.apps.link_type IS
  'Tipo do link do app: ''interno'' (rota interna do painel) ou ''externo'' (URL externa).';

-- Preencher link_type para registros existentes que já tenham links
UPDATE public.apps
SET link_type = CASE
  WHEN external_link IS NOT NULL AND external_link != '' THEN 'externo'
  WHEN internal_link IS NOT NULL AND internal_link != '' THEN 'interno'
  ELSE NULL
END
WHERE link_type IS NULL;


-- ── 2. Tabela dre_lancamentos: adicionar coluna descricao ─────────────────
ALTER TABLE public.dre_lancamentos
  ADD COLUMN IF NOT EXISTS descricao TEXT;

COMMENT ON COLUMN public.dre_lancamentos.descricao IS
  'Descrição livre do lançamento (ex: "Compra de material de escritório").';


-- ── 3. RLS: garantir que a edge function possa ler dre_lancamentos ─────────
-- A edge function usa a service_role key internamente (chamada pelo frontend
-- via supabase.functions.invoke, autenticada com o JWT do usuário logado).
-- Não é necessária nenhuma policy adicional além das já existentes.
-- Se ainda não houver RLS em dre_lancamentos, habilite e configure:
--
-- ALTER TABLE public.dre_lancamentos ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Usuário vê seus próprios lançamentos"
--   ON public.dre_lancamentos FOR SELECT
--   USING (auth.uid() = user_id);
--
-- CREATE POLICY "Usuário insere seus próprios lançamentos"
--   ON public.dre_lancamentos FOR INSERT
--   WITH CHECK (auth.uid() = user_id);


-- ── 4. Índices úteis ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_apps_link_type
  ON public.apps (link_type);

CREATE INDEX IF NOT EXISTS idx_dre_lancamentos_grupo
  ON public.dre_lancamentos (grupo);


-- =============================================================================
-- INSTRUÇÕES PARA CONFIGURAR A EDGE FUNCTION dre-ai-classify
-- =============================================================================
--
-- 1. No terminal do projeto, instale o Supabase CLI se ainda não tiver:
--    npm install -g supabase
--
-- 2. Faça login e link ao projeto:
--    supabase login
--    supabase link --project-ref <SEU_PROJECT_REF>
--
-- 3. Faça deploy da edge function:
--    supabase functions deploy dre-ai-classify
--
-- 4. Configure o secret da GroqCloud no dashboard do Supabase:
--    Supabase Dashboard → Edge Functions → dre-ai-classify → Secrets
--    Adicione: GROQ_API_KEY = gsk_XXXXXXXXXXXXXXXXXXXXXXXX
--
--    Ou via CLI:
--    supabase secrets set GROQ_API_KEY=gsk_XXXXXXXXXXXXXXXXXXXXXXXX
--
-- 5. A função ficará disponível em:
--    https://<SEU_PROJECT_REF>.supabase.co/functions/v1/dre-ai-classify
--
-- =============================================================================
