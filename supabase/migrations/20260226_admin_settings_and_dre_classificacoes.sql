-- =============================================================================
-- Migration: Admin settings panel + DRE classifications
-- Execute no Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ── 1. Tabela de configurações (chave-valor) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes (
  chave       TEXT PRIMARY KEY,
  valor       TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.configuracoes IS
  'Configurações globais do sistema (modelo IA, etc).';

-- Valor padrão: modelo GroqCloud
INSERT INTO public.configuracoes (chave, valor)
VALUES ('modelo_groq', 'llama-3.3-70b-versatile')
ON CONFLICT (chave) DO NOTHING;


-- ── 2. Tabela de classificações DRE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dre_classificacoes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL UNIQUE,
  tipo        TEXT        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dre_classificacoes IS
  'Classificações detalhadas de lançamentos DRE, gerenciadas pelo admin.';

-- Classificações padrão
INSERT INTO public.dre_classificacoes (nome, tipo) VALUES
  ('Receita sobre Serviço',      'receita'),
  ('Receita de Produtos',        'receita'),
  ('Receita Financeira',         'receita'),
  ('Outras Receitas',            'receita'),
  ('Despesa com Pessoal',        'despesa'),
  ('Despesa com Fornecedor',     'despesa'),
  ('Despesa com Aluguel',        'despesa'),
  ('Despesa com Marketing',      'despesa'),
  ('Despesa com Impostos',       'despesa'),
  ('Despesa com Infraestrutura', 'despesa'),
  ('Outras Despesas',            'despesa')
ON CONFLICT (nome) DO NOTHING;


-- ── 3. RLS: apenas admins editam configurações e classificações ────────────
ALTER TABLE public.configuracoes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dre_classificacoes ENABLE ROW LEVEL SECURITY;

-- Leitura pública (usuários autenticados podem ler para o wizard DRE)
CREATE POLICY "Leitura autenticada de configuracoes"
  ON public.configuracoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Leitura autenticada de dre_classificacoes"
  ON public.dre_classificacoes FOR SELECT
  TO authenticated
  USING (true);

-- Escrita restrita a admins (role = 'admin' na tabela profiles)
CREATE POLICY "Admin pode modificar configuracoes"
  ON public.configuracoes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin pode modificar dre_classificacoes"
  ON public.dre_classificacoes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- ── 4. Marcar um usuário como admin ──────────────────────────────────────
-- Execute este comando substituindo pelo email do admin:
--
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE email = 'seu-email@exemplo.com';


-- =============================================================================
-- RESUMO DAS MIGRAÇÕES DESTE PROJETO (execute tudo em ordem)
-- =============================================================================
--
-- 1. supabase/migrations/20260226_app_link_type_and_dre_descricao.sql
--    • ALTER TABLE apps ADD COLUMN link_type
--    • ALTER TABLE dre_lancamentos ADD COLUMN descricao
--
-- 2. supabase/migrations/20260226_admin_settings_and_dre_classificacoes.sql  ← este arquivo
--    • CREATE TABLE configuracoes
--    • CREATE TABLE dre_classificacoes (com dados padrão)
--    • RLS policies
--
-- =============================================================================
