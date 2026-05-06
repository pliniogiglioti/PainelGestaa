-- Formas de envio cadastráveis por empresa, usadas no Novo Envio do Lab Control.
create table if not exists public.lab_formas_envio (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid references public.empresas(id) on delete cascade not null,
  nome       text not null,
  ativo      boolean default true,
  created_at timestamptz default now()
);

create index if not exists lab_formas_envio_empresa_id_idx
  on public.lab_formas_envio(empresa_id);

create unique index if not exists lab_formas_envio_empresa_nome_idx
  on public.lab_formas_envio(empresa_id, nome);

alter table public.lab_formas_envio enable row level security;

drop policy if exists "lab_formas_envio_member" on public.lab_formas_envio;

create policy "lab_formas_envio_member"
  on public.lab_formas_envio
  using (is_empresa_member(empresa_id))
  with check (is_empresa_member(empresa_id));

insert into public.lab_formas_envio (empresa_id, nome)
select empresas.id, formas.nome
from public.empresas
cross join (
  values
    ('Motoboy'),
    ('WhatsApp'),
    ('E-mail'),
    ('Retirada pelo laboratório'),
    ('Outro')
) as formas(nome)
on conflict (empresa_id, nome) do nothing;
