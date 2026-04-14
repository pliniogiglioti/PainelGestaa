-- ── Lab Spec V1.0 — Todos os novos recursos ───────────────────────────────

-- 1. Dentistas por empresa
create table if not exists public.lab_dentistas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid references public.empresas(id) on delete cascade not null,
  nome          text not null,
  especialidade text,
  ativo         boolean default true,
  created_at    timestamptz default now()
);
create index if not exists lab_dentistas_empresa_id_idx on public.lab_dentistas(empresa_id);
alter table public.lab_dentistas enable row level security;
create policy "lab_dentistas_member" on public.lab_dentistas
  using (is_empresa_member(empresa_id))
  with check (is_empresa_member(empresa_id));

-- 2. Etiquetas por empresa
create table if not exists public.lab_etiquetas (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade not null,
  nome       text not null,
  cor        text not null default '#6366f1',
  ativo      boolean default true,
  created_at timestamptz default now()
);
create index if not exists lab_etiquetas_empresa_id_idx on public.lab_etiquetas(empresa_id);
alter table public.lab_etiquetas enable row level security;
create policy "lab_etiquetas_member" on public.lab_etiquetas
  using (is_empresa_member(empresa_id))
  with check (is_empresa_member(empresa_id));

-- 3. Junção envio ↔ etiqueta
create table if not exists public.lab_envio_etiquetas (
  envio_id    uuid references public.lab_envios(id) on delete cascade not null,
  etiqueta_id uuid references public.lab_etiquetas(id) on delete cascade not null,
  primary key (envio_id, etiqueta_id)
);
alter table public.lab_envio_etiquetas enable row level security;
create policy "lab_envio_etiquetas_member" on public.lab_envio_etiquetas
  using (
    exists (
      select 1 from public.lab_envios e
      where e.id = envio_id and is_empresa_member(e.empresa_id)
    )
  )
  with check (
    exists (
      select 1 from public.lab_envios e
      where e.id = envio_id and is_empresa_member(e.empresa_id)
    )
  );

-- 4. Tipos de serviço por empresa + classificação
create table if not exists public.lab_tipos_servico (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid references public.empresas(id) on delete cascade not null,
  nome           text not null,
  classificacao  text not null default 'Removível',
  ativo          boolean default true,
  created_at     timestamptz default now()
);
create index if not exists lab_tipos_servico_empresa_id_idx on public.lab_tipos_servico(empresa_id);
alter table public.lab_tipos_servico enable row level security;
create policy "lab_tipos_servico_member" on public.lab_tipos_servico
  using (is_empresa_member(empresa_id))
  with check (is_empresa_member(empresa_id));

-- 5. Histórico auditável de envios
create table if not exists public.lab_historico (
  id              uuid primary key default gen_random_uuid(),
  envio_id        uuid references public.lab_envios(id) on delete cascade not null,
  empresa_id      uuid references public.empresas(id) on delete cascade not null,
  user_id         uuid references public.profiles(id) not null,
  tipo_acao       text not null,
  detalhe         text,
  created_at      timestamptz default now()
);
create index if not exists lab_historico_envio_id_idx  on public.lab_historico(envio_id);
create index if not exists lab_historico_empresa_id_idx on public.lab_historico(empresa_id);
alter table public.lab_historico enable row level security;
create policy "lab_historico_member" on public.lab_historico
  using (is_empresa_member(empresa_id))
  with check (is_empresa_member(empresa_id));

-- 6. Anexos de envios (Storage)
create table if not exists public.lab_anexos (
  id           uuid primary key default gen_random_uuid(),
  envio_id     uuid references public.lab_envios(id) on delete cascade not null,
  empresa_id   uuid references public.empresas(id) on delete cascade not null,
  user_id      uuid references public.profiles(id) not null,
  nome_arquivo text not null,
  storage_path text not null,
  tipo_mime    text,
  tamanho_bytes bigint,
  created_at   timestamptz default now()
);
create index if not exists lab_anexos_envio_id_idx on public.lab_anexos(envio_id);
alter table public.lab_anexos enable row level security;
create policy "lab_anexos_member" on public.lab_anexos
  using (is_empresa_member(empresa_id))
  with check (is_empresa_member(empresa_id));

-- 7. Novos campos em lab_envios
alter table public.lab_envios
  add column if not exists arquivado_em           timestamptz,
  add column if not exists forma_envio            text,
  add column if not exists retirado_por           text,
  add column if not exists data_recebimento       date,
  add column if not exists forma_recebimento      text,
  add column if not exists retirado_por_recebimento text,
  add column if not exists conferencia_ok         boolean default false,
  add column if not exists anotacao_recebimento   text,
  add column if not exists desconto               numeric(10,2),
  add column if not exists observacao_financeira  text,
  add column if not exists classificacao_protese  text,
  add column if not exists categoria_peca         text;

comment on column public.lab_envios.arquivado_em          is 'Preenchido ao arquivar — null = ativo.';
comment on column public.lab_envios.forma_envio           is 'Motoboy, WhatsApp, E-mail, Retirada pelo laboratório, Outro.';
comment on column public.lab_envios.classificacao_protese is 'Removível, Fixa, Sobre Implante, Ortodôntico, Clínico.';
comment on column public.lab_envios.categoria_peca        is 'Categoria derivada do tipo de serviço para a visão Peças na Clínica.';
