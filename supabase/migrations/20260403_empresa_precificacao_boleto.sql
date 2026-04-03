-- =============================================================================
-- Taxa de boleto na configuracao de vendas
-- =============================================================================

alter table public.empresa_precificacao_config
  add column if not exists taxa_boleto_percent numeric(10,2) not null default 0;
