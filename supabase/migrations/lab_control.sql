-- ── Lab Control: Controle de Laboratórios Odontológicos ────────────────────
-- Execute este script no SQL Editor do Supabase

-- 1. Laboratórios por empresa
create table if not exists labs (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid references empresas(id) on delete cascade not null,
  nome             text not null,
  cnpj             text,
  telefone         text,
  email            text,
  endereco         text,
  prazo_medio_dias integer default 7,
  observacoes      text,
  ativo            boolean default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- 2. Lista de preços por laboratório
create table if not exists lab_precos (
  id            uuid primary key default gen_random_uuid(),
  lab_id        uuid references labs(id) on delete cascade not null,
  nome_servico  text not null,
  preco         numeric(10,2) not null default 0,
  ativo         boolean default true,
  created_at    timestamptz default now()
);

-- 3. Colunas do Kanban por empresa (configuráveis)
create table if not exists lab_kanban_colunas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references empresas(id) on delete cascade not null,
  nome        text not null,
  ordem       integer not null default 0,
  cor         text default '#6366f1',
  created_at  timestamptz default now()
);

-- 4. Envios de trabalho ao laboratório
create table if not exists lab_envios (
  id                      uuid primary key default gen_random_uuid(),
  lab_id                  uuid references labs(id) on delete cascade not null,
  empresa_id              uuid references empresas(id) on delete cascade not null,
  user_id                 uuid references profiles(id) not null,
  paciente_nome           text not null,
  tipo_trabalho           text not null,
  preco_servico           numeric(10,2),
  dentes                  text,
  cor                     text,
  observacoes             text,
  status                  text not null default 'Enviado',
  data_envio              date not null default current_date,
  data_entrega_prometida  date,
  data_entrega_real       date,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ── Índices ──────────────────────────────────────────────────────────────────
create index if not exists labs_empresa_id_idx           on labs(empresa_id);
create index if not exists lab_precos_lab_id_idx         on lab_precos(lab_id);
create index if not exists lab_kanban_colunas_empresa_idx on lab_kanban_colunas(empresa_id);
create index if not exists lab_envios_lab_id_idx         on lab_envios(lab_id);
create index if not exists lab_envios_empresa_id_idx     on lab_envios(empresa_id);
create index if not exists lab_envios_status_idx         on lab_envios(status);

-- ── RLS (Row Level Security) ──────────────────────────────────────────────────
alter table labs               enable row level security;
alter table lab_precos         enable row level security;
alter table lab_kanban_colunas enable row level security;
alter table lab_envios         enable row level security;

-- Helper function: verifica se user é membro da empresa
create or replace function is_empresa_member(eid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from empresa_membros
    where empresa_id = eid and user_id = auth.uid()
  );
$$;

-- Helper function: verifica se user é admin da empresa
create or replace function is_empresa_admin(eid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from empresa_membros
    where empresa_id = eid and user_id = auth.uid() and role = 'admin'
  ) or exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Policies: labs
create policy "members can view labs"
  on labs for select using (is_empresa_member(empresa_id));

create policy "admins can insert labs"
  on labs for insert with check (is_empresa_admin(empresa_id));

create policy "admins can update labs"
  on labs for update using (is_empresa_admin(empresa_id));

create policy "admins can delete labs"
  on labs for delete using (is_empresa_admin(empresa_id));

-- Policies: lab_precos
create policy "members can view precos"
  on lab_precos for select using (
    exists (select 1 from labs where labs.id = lab_precos.lab_id and is_empresa_member(labs.empresa_id))
  );

create policy "admins can manage precos"
  on lab_precos for all using (
    exists (select 1 from labs where labs.id = lab_precos.lab_id and is_empresa_admin(labs.empresa_id))
  );

-- Policies: lab_kanban_colunas
create policy "members can view colunas"
  on lab_kanban_colunas for select using (is_empresa_member(empresa_id));

create policy "admins can manage colunas"
  on lab_kanban_colunas for all using (is_empresa_admin(empresa_id));

-- Policies: lab_envios
create policy "members can view envios"
  on lab_envios for select using (is_empresa_member(empresa_id));

create policy "members can insert envios"
  on lab_envios for insert with check (is_empresa_member(empresa_id) and user_id = auth.uid());

create policy "members can update envios"
  on lab_envios for update using (is_empresa_member(empresa_id));

create policy "admins can delete envios"
  on lab_envios for delete using (is_empresa_admin(empresa_id));
