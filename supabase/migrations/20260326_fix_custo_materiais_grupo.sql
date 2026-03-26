-- =============================================================================
-- Migration: Corrige grupo de "Custo de Materiais e Insumos"
--            de "Despesas Administrativas" → "Despesas Operacionais"
-- =============================================================================

-- 1. Corrige lançamentos com grupo errado
UPDATE public.dre_lancamentos
   SET grupo = 'Despesas Operacionais'
 WHERE classificacao = 'Custo de Materiais e Insumos'
   AND grupo != 'Despesas Operacionais';

-- 2. Corrige histórico de classificação (se houver)
UPDATE public.dre_classificacao_historico
   SET grupo = 'Despesas Operacionais'
 WHERE classificacao = 'Custo de Materiais e Insumos'
   AND grupo != 'Despesas Operacionais';
