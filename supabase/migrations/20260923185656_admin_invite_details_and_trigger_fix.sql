-- Dados iniciais definidos pelo admin no modal de convite.
alter table public.user_invitations
  add column if not exists role text not null default 'user',
  add column if not exists tipo_usuario text not null default 'titular',
  add column if not exists ativo boolean not null default true,
  add column if not exists app_access_ids uuid[] default null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_invitations'::regclass
      and conname = 'user_invitations_role_check'
  ) then
    alter table public.user_invitations
      add constraint user_invitations_role_check
      check (role in ('user', 'editor', 'admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_invitations'::regclass
      and conname = 'user_invitations_tipo_usuario_check'
  ) then
    alter table public.user_invitations
      add constraint user_invitations_tipo_usuario_check
      check (tipo_usuario in ('titular', 'colaborador'));
  end if;
end;
$$;

-- O trigger de proteção continua bloqueando alterações privilegiadas feitas
-- pelo Data API. Durante a criação da conta, porém, o Auth executa os triggers
-- como supabase_auth_admin e precisa aplicar os dados do convite.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() or session_user = 'supabase_auth_admin' then
    return new;
  end if;

  if new.role          is distinct from old.role
     or new.ativo          is distinct from old.ativo
     or new.expires_at     is distinct from old.expires_at
     or new.app_access_ids is distinct from old.app_access_ids then
    raise exception 'Apenas administradores podem alterar role, ativo, expires_at ou app_access_ids.';
  end if;

  return new;
end;
$$;

-- Aplica ao profile todas as propriedades escolhidas no modal. Esta função é
-- executada pelo trigger AFTER INSERT de profiles, dentro da transação do Auth.
create or replace function public.handle_user_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation record;
begin
  select invitation_row.*
    into invitation
    from public.user_invitations invitation_row
   where lower(invitation_row.email) = lower(new.email)
     and invitation_row.used_at is null
   order by invitation_row.created_at desc
   limit 1;

  if found then
    update public.profiles
       set role = invitation.role,
           tipo_usuario = invitation.tipo_usuario,
           ativo = invitation.ativo,
           expires_at = invitation.expires_at,
           app_access_ids = case
             when invitation.role = 'admin' then null
             else invitation.app_access_ids
           end,
           updated_at = now()
     where id = new.id;

    update public.user_invitations
       set used_at = now()
     where id = invitation.id;
  end if;

  return new;
end;
$$;

-- Funções de trigger não são endpoints RPC e não devem ser executáveis pelos
-- papéis expostos pela API. Os triggers continuam podendo chamá-las.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_invitation() from public, anon, authenticated;
revoke execute on function public.handle_empresa_convites_pendentes() from public, anon, authenticated;
revoke execute on function public.protect_profile_privileged_columns() from public, anon, authenticated;
