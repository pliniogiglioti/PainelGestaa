-- Auditoria de exclusao de lancamentos DRE.
--
-- Toda linha apagada de dre_lancamentos (exclusao individual, "Excluir periodo"
-- ou exclusao da empresa) e copiada para dre_lancamentos_excluidos com quem
-- apagou e quando. Permite responder "o que sumiu" e restaurar os dados.
-- Sem FK para empresas/lancamentos de proposito: o registro sobrevive a exclusao.

create table if not exists public.dre_lancamentos_excluidos (
  id              uuid primary key,
  empresa_id      uuid,
  user_id         uuid,
  descricao       text,
  valor           numeric,
  tipo            text,
  classificacao   text,
  grupo           text,
  data_lancamento date,
  created_at      timestamptz,
  updated_at      timestamptz,
  excluido_por    uuid,
  excluido_em     timestamptz not null default now()
);

comment on table public.dre_lancamentos_excluidos is
  'Copia dos lancamentos DRE excluidos (auditoria/restauracao). Alimentada por trigger.';

create index if not exists dre_lancamentos_excluidos_empresa_idx
  on public.dre_lancamentos_excluidos (empresa_id, excluido_em desc);

create or replace function public.registrar_exclusao_dre_lancamentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.dre_lancamentos_excluidos (
    id, empresa_id, user_id, descricao, valor, tipo, classificacao, grupo,
    data_lancamento, created_at, updated_at, excluido_por
  )
  select
    o.id, o.empresa_id, o.user_id, o.descricao, o.valor, o.tipo, o.classificacao, o.grupo,
    o.data_lancamento, o.created_at, o.updated_at, auth.uid()
  from old_rows o
  on conflict (id) do update
    set excluido_por = excluded.excluido_por,
        excluido_em  = now();
  return null;
end;
$$;

revoke all on function public.registrar_exclusao_dre_lancamentos() from public, anon, authenticated;

drop trigger if exists trg_registrar_exclusao_dre_lancamentos on public.dre_lancamentos;
create trigger trg_registrar_exclusao_dre_lancamentos
  after delete on public.dre_lancamentos
  referencing old table as old_rows
  for each statement
  execute function public.registrar_exclusao_dre_lancamentos();

alter table public.dre_lancamentos_excluidos enable row level security;

-- Somente admins globais consultam. Ninguem insere/altera/apaga via API
-- (o trigger roda como security definer).
drop policy if exists "Admin le lancamentos excluidos" on public.dre_lancamentos_excluidos;
create policy "Admin le lancamentos excluidos"
  on public.dre_lancamentos_excluidos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
