-- =============================================================================
-- Migration: Remover constraint de enum em dre_lancamentos.classificacao
-- Permite armazenar valores descritivos como "Receita sobre Serviço"
-- Execute no Supabase SQL Editor
-- =============================================================================

-- Remove o check constraint (nome pode variar — o comando abaixo descobre e remove)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.dre_lancamentos'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%classificacao%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dre_lancamentos DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Constraint % removido.', constraint_name;
  ELSE
    RAISE NOTICE 'Nenhum constraint de classificacao encontrado (já pode estar livre).';
  END IF;
END $$;

-- Garantir que a coluna é TEXT (sem tamanho fixo)
ALTER TABLE public.dre_lancamentos
  ALTER COLUMN classificacao TYPE TEXT;

-- =============================================================================
-- ORDEM DE EXECUÇÃO DAS MIGRAÇÕES:
-- 1. 20260226_app_link_type_and_dre_descricao.sql
-- 2. 20260226_admin_settings_and_dre_classificacoes.sql
-- 3. 20260226_classificacao_to_text.sql  ← este arquivo
-- =============================================================================
