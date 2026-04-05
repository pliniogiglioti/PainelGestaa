alter table public.empresa_precos
  add column if not exists categoria text;

comment on column public.empresa_precos.categoria is
  'Categoria odontologica do produto ou servico cadastrado na lista de precificacao.';

alter table public.empresa_precos
  drop constraint if exists empresa_precos_categoria_not_blank;

alter table public.empresa_precos
  add constraint empresa_precos_categoria_not_blank
  check (categoria is null or length(btrim(categoria)) > 0);

create index if not exists empresa_precos_empresa_id_categoria_idx
  on public.empresa_precos(empresa_id, categoria);
