-- =============================================================================
-- Entrada nas vendas / propostas
-- =============================================================================

alter table public.empresa_vendas
  add column if not exists entrada_valor numeric(10,2) not null default 0;
