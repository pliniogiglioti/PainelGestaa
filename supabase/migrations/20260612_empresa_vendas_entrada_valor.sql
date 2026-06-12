-- =============================================================================
-- Entrada e consulta recente das vendas / propostas
-- =============================================================================

alter table public.empresa_vendas
  add column if not exists entrada_valor numeric(10,2) not null default 0;

create index if not exists empresa_vendas_empresa_created_at_idx
  on public.empresa_vendas(empresa_id, created_at desc);
