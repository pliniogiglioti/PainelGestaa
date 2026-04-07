alter table public.profiles
  add column if not exists app_access_ids uuid[] null;

comment on column public.profiles.app_access_ids is
  'Lista opcional de apps liberados para o usuario. NULL = acesso a todos os apps cadastrados.';
