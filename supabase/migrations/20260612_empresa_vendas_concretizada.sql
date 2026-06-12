-- =============================================================================
-- Status de concretizacao das vendas / propostas
-- =============================================================================

alter table public.empresa_vendas
  add column if not exists concretizada boolean not null default true;
