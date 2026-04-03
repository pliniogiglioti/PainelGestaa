-- =============================================================================
-- Configuracao geral da precificacao por empresa
-- =============================================================================

create table if not exists public.empresa_precificacao_config (
  empresa_id                    uuid primary key references public.empresas(id) on delete cascade,
  royalties_percent             numeric(10,2) not null default 0,
  custo_profissionais_percent   numeric(10,2) not null default 0,
  impostos_percent              numeric(10,2) not null default 0,
  comissoes_percent             numeric(10,2) not null default 0,
  taxa_maquina_percent          numeric(10,2) not null default 0,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

alter table public.empresa_precificacao_config enable row level security;

drop policy if exists "members can view empresa precificacao config" on public.empresa_precificacao_config;
create policy "members can view empresa precificacao config"
  on public.empresa_precificacao_config
  for select
  using (public.is_empresa_member(empresa_id));

drop policy if exists "admins can manage empresa precificacao config" on public.empresa_precificacao_config;
create policy "admins can manage empresa precificacao config"
  on public.empresa_precificacao_config
  for all
  using (public.is_empresa_admin(empresa_id))
  with check (public.is_empresa_admin(empresa_id));
