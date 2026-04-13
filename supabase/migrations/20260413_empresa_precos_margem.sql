alter table public.empresa_precos
  add column if not exists margem_percent numeric;

comment on column public.empresa_precos.margem_percent is
  'Margem percentual do preco, usada para destacar itens abaixo da meta de 50%.';
