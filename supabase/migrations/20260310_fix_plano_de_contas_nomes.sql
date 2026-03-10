-- =============================================================================
-- Migration: Corrige nomes das classificações para bater exatamente com
--            public/ia/plano_de_contas_dre.md
--
-- Problemas encontrados:
--   1. Tarifa de Cartão usava nomes curtos; MD define nomes completos com
--      "Meios de Pagamento -" e sufixos exatos.
--   2. Impostos tinha DOIS registros (Simples Nacional + Lucro Presumido);
--      MD define APENAS um: "Impostos sobre Receitas - Presumido e Simples Nacional"
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Migra lançamentos existentes para os novos nomes (antes de renomear)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.dre_lancamentos
   SET classificacao = 'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas'
 WHERE classificacao = 'Tarifa de Cartão / Aluguel de POS';

UPDATE public.dre_lancamentos
   SET classificacao = 'Tarifa de Cartão / Meios de Pagamento - Antecipação'
 WHERE classificacao = 'Tarifa de Cartão / Antecipação';

UPDATE public.dre_lancamentos
   SET classificacao = 'Tarifa de Cartão / Meios de Pagamento - Padrão'
 WHERE classificacao = 'Tarifa de Cartão / Padrão';

UPDATE public.dre_lancamentos
   SET classificacao = 'Impostos sobre Receitas - Presumido e Simples Nacional'
 WHERE classificacao IN (
   'Impostos sobre Receitas - Simples Nacional',
   'Impostos sobre Receitas - Lucro Presumido'
 );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Renomeia as classificações no catálogo
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.dre_classificacoes
   SET nome = 'Tarifa de Cartão / Meios de Pagamento - Aluguel de POS / Outras Taxas'
 WHERE nome = 'Tarifa de Cartão / Aluguel de POS';

UPDATE public.dre_classificacoes
   SET nome = 'Tarifa de Cartão / Meios de Pagamento - Antecipação'
 WHERE nome = 'Tarifa de Cartão / Antecipação';

UPDATE public.dre_classificacoes
   SET nome = 'Tarifa de Cartão / Meios de Pagamento - Padrão'
 WHERE nome = 'Tarifa de Cartão / Padrão';

UPDATE public.dre_classificacoes
   SET nome = 'Impostos sobre Receitas - Presumido e Simples Nacional'
 WHERE nome = 'Impostos sobre Receitas - Simples Nacional';

-- Remove o item extra que não consta no plano de contas
DELETE FROM public.dre_classificacoes
 WHERE nome = 'Impostos sobre Receitas - Lucro Presumido';
