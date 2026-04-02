-- Tabela de aceite de termos por usuário e app
-- Cada app tem sua própria entrada (campo `app`), permitindo termos por produto

create table if not exists termos_aceite (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  version     text        not null default '1.0',
  app         text        not null default 'dfc-clinicscale',
  accepted_at timestamptz not null default now(),
  ip_address  text,
  user_agent  text,
  unique (user_id, app, version)
);

alter table termos_aceite enable row level security;

-- Usuário pode registrar seu próprio aceite
create policy "insert own aceite"
  on termos_aceite for insert
  with check (auth.uid() = user_id);

-- Usuário pode consultar seu próprio aceite
create policy "select own aceite"
  on termos_aceite for select
  using (auth.uid() = user_id);

-- Admin pode consultar todos os aceites
create policy "admin select all"
  on termos_aceite for select
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
