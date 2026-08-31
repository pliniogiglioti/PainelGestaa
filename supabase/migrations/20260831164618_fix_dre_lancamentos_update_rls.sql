-- Corrige RLS de edicao dos lancamentos DRE.
--
-- O front edita classificacao/tipo/grupo de dre_lancamentos. Em RLS, UPDATE
-- precisa passar pela policy de SELECT da linha existente e pela policy de
-- UPDATE da linha resultante. Estas policies deixam isso explicito para:
-- - o dono da empresa em public.empresas.created_by;
-- - membros da empresa do lancamento;
-- - admins globais em public.profiles.

alter table public.dre_lancamentos enable row level security;

drop policy if exists "Dono empresa le lancamentos DRE" on public.dre_lancamentos;
create policy "Dono empresa le lancamentos DRE"
  on public.dre_lancamentos
  for select
  to authenticated
  using (
    empresa_id is not null
    and exists (
      select 1
      from public.empresas e
      where e.id = dre_lancamentos.empresa_id
        and e.created_by = (select auth.uid())
    )
  );

drop policy if exists "Dono empresa atualiza lancamentos DRE" on public.dre_lancamentos;
create policy "Dono empresa atualiza lancamentos DRE"
  on public.dre_lancamentos
  for update
  to authenticated
  using (
    empresa_id is not null
    and exists (
      select 1
      from public.empresas e
      where e.id = dre_lancamentos.empresa_id
        and e.created_by = (select auth.uid())
    )
  )
  with check (
    empresa_id is not null
    and exists (
      select 1
      from public.empresas e
      where e.id = dre_lancamentos.empresa_id
        and e.created_by = (select auth.uid())
    )
  );

drop policy if exists "Membro empresa atualiza lancamento" on public.dre_lancamentos;
create policy "Membro empresa atualiza lancamento"
  on public.dre_lancamentos
  for update
  to authenticated
  using (
    empresa_id is not null
    and exists (
      select 1
      from public.empresa_membros em
      where em.empresa_id = dre_lancamentos.empresa_id
        and em.user_id = (select auth.uid())
    )
  )
  with check (
    empresa_id is not null
    and exists (
      select 1
      from public.empresa_membros em
      where em.empresa_id = dre_lancamentos.empresa_id
        and em.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admin le todos lancamentos DRE" on public.dre_lancamentos;
create policy "Admin le todos lancamentos DRE"
  on public.dre_lancamentos
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

drop policy if exists "Admin sistema atualiza lancamentos" on public.dre_lancamentos;
create policy "Admin sistema atualiza lancamentos"
  on public.dre_lancamentos
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
