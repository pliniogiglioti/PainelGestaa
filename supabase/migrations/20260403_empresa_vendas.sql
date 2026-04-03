-- =============================================================================
-- Vendas / propostas da precificacao por empresa
-- =============================================================================

create table if not exists public.empresa_vendas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid references public.empresas(id) on delete cascade not null,
  cliente_nome  text not null,
  observacoes   text,
  max_parcelas  integer not null default 1,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.empresa_venda_itens (
  id                 uuid primary key default gen_random_uuid(),
  venda_id           uuid references public.empresa_vendas(id) on delete cascade not null,
  empresa_preco_id   uuid references public.empresa_precos(id) on delete set null,
  descricao          text not null,
  preco_unitario     numeric(10,2) not null default 0,
  quantidade         integer not null default 1,
  created_at         timestamptz not null default now()
);

create index if not exists empresa_vendas_empresa_id_idx
  on public.empresa_vendas(empresa_id);

create index if not exists empresa_venda_itens_venda_id_idx
  on public.empresa_venda_itens(venda_id);

alter table public.empresa_vendas enable row level security;
alter table public.empresa_venda_itens enable row level security;

drop policy if exists "members can view empresa vendas" on public.empresa_vendas;
create policy "members can view empresa vendas"
  on public.empresa_vendas
  for select
  using (public.is_empresa_member(empresa_id));

drop policy if exists "admins can manage empresa vendas" on public.empresa_vendas;
create policy "admins can manage empresa vendas"
  on public.empresa_vendas
  for all
  using (public.is_empresa_admin(empresa_id))
  with check (public.is_empresa_admin(empresa_id));

drop policy if exists "members can view empresa venda itens" on public.empresa_venda_itens;
create policy "members can view empresa venda itens"
  on public.empresa_venda_itens
  for select
  using (
    exists (
      select 1
      from public.empresa_vendas ev
      where ev.id = venda_id
        and public.is_empresa_member(ev.empresa_id)
    )
  );

drop policy if exists "admins can manage empresa venda itens" on public.empresa_venda_itens;
create policy "admins can manage empresa venda itens"
  on public.empresa_venda_itens
  for all
  using (
    exists (
      select 1
      from public.empresa_vendas ev
      where ev.id = venda_id
        and public.is_empresa_admin(ev.empresa_id)
    )
  )
  with check (
    exists (
      select 1
      from public.empresa_vendas ev
      where ev.id = venda_id
        and public.is_empresa_admin(ev.empresa_id)
    )
  );
