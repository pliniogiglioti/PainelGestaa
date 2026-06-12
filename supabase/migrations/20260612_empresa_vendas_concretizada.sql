-- =============================================================================
-- Status de concretizacao das vendas / propostas
-- =============================================================================

alter table public.empresa_vendas
  add column if not exists concretizada boolean not null default true;

alter table public.empresa_vendas
  add column if not exists vendedor_id uuid references public.profiles(id) default auth.uid();

create index if not exists empresa_vendas_empresa_vendedor_created_at_idx
  on public.empresa_vendas(empresa_id, vendedor_id, created_at desc);

drop policy if exists "members can view empresa vendas" on public.empresa_vendas;
create policy "members can view empresa vendas"
  on public.empresa_vendas
  for select
  using (
    public.is_empresa_admin(empresa_id)
    or vendedor_id = auth.uid()
  );

drop policy if exists "admins can manage empresa vendas" on public.empresa_vendas;
drop policy if exists "members can manage own empresa vendas" on public.empresa_vendas;
create policy "members can manage own empresa vendas"
  on public.empresa_vendas
  for all
  using (
    public.is_empresa_admin(empresa_id)
    or vendedor_id = auth.uid()
  )
  with check (
    public.is_empresa_admin(empresa_id)
    or (
      public.is_empresa_member(empresa_id)
      and vendedor_id = auth.uid()
    )
  );

drop policy if exists "members can view empresa venda itens" on public.empresa_venda_itens;
create policy "members can view empresa venda itens"
  on public.empresa_venda_itens
  for select
  using (
    exists (
      select 1
      from public.empresa_vendas ev
      where ev.id = venda_id
        and (
          public.is_empresa_admin(ev.empresa_id)
          or ev.vendedor_id = auth.uid()
        )
    )
  );

drop policy if exists "admins can manage empresa venda itens" on public.empresa_venda_itens;
drop policy if exists "members can manage own empresa venda itens" on public.empresa_venda_itens;
create policy "members can manage own empresa venda itens"
  on public.empresa_venda_itens
  for all
  using (
    exists (
      select 1
      from public.empresa_vendas ev
      where ev.id = venda_id
        and (
          public.is_empresa_admin(ev.empresa_id)
          or ev.vendedor_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.empresa_vendas ev
      where ev.id = venda_id
        and (
          public.is_empresa_admin(ev.empresa_id)
          or ev.vendedor_id = auth.uid()
        )
    )
  );
