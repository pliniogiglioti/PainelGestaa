-- =============================================================================
-- Precificacao por empresa
-- =============================================================================

create table if not exists public.empresa_precos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid references public.empresas(id) on delete cascade not null,
  nome_produto  text not null,
  preco         numeric(10,2) not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists empresa_precos_empresa_id_idx
  on public.empresa_precos(empresa_id);

alter table public.empresa_precos enable row level security;

drop policy if exists "members can view empresa precos" on public.empresa_precos;
create policy "members can view empresa precos"
  on public.empresa_precos
  for select
  using (public.is_empresa_member(empresa_id));

drop policy if exists "admins can manage empresa precos" on public.empresa_precos;
create policy "admins can manage empresa precos"
  on public.empresa_precos
  for all
  using (public.is_empresa_admin(empresa_id))
  with check (public.is_empresa_admin(empresa_id));
