-- =============================================================================
-- Migration: Renomeia "Royalties e Assistência Técnica" → "Royalties"
--            e corrige lançamentos que ficaram com grupo errado.
-- =============================================================================

-- 1. Renomeia no catálogo de classificações (caso ainda exista o nome antigo)
UPDATE public.dre_classificacoes
   SET nome = 'Royalties'
 WHERE nome = 'Royalties e Assistência Técnica';

-- 2. Renomeia nos lançamentos existentes
UPDATE public.dre_lancamentos
   SET classificacao = 'Royalties'
 WHERE classificacao = 'Royalties e Assistência Técnica';

-- 3. Corrige grupo errado para Royalties
UPDATE public.dre_lancamentos
   SET grupo = 'Despesas Operacionais'
 WHERE classificacao = 'Royalties'
   AND grupo != 'Despesas Operacionais';

-- 4. Corrige grupo errado para Fundo Nacional de Marketing
UPDATE public.dre_lancamentos
   SET grupo = 'Despesas Operacionais'
 WHERE classificacao = 'Fundo Nacional de Marketing'
   AND grupo != 'Despesas Operacionais';

-- 5. Corrige histórico de classificação (se houver)
UPDATE public.dre_classificacao_historico
   SET classificacao = 'Royalties',
       grupo         = 'Despesas Operacionais'
 WHERE classificacao = 'Royalties e Assistência Técnica';
