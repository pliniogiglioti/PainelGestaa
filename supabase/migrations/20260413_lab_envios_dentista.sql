alter table public.lab_envios
  add column if not exists dentista_nome text;

comment on column public.lab_envios.dentista_nome is
  'Nome do dentista responsável pelo caso.';
