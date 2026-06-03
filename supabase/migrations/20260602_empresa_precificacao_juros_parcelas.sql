-- Adiciona juros mensal e parcelas máximas na configuração de precificação da empresa
ALTER TABLE public.empresa_precificacao_config
  ADD COLUMN IF NOT EXISTS vendas_juros_mensal_pct NUMERIC NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS vendas_max_parcelas      INTEGER NOT NULL DEFAULT 24;
