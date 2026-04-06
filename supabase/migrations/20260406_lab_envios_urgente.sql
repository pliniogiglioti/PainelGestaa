alter table public.lab_envios
  add column if not exists urgente boolean not null default false;

comment on column public.lab_envios.urgente is
  'Indica que o envio deve ser tratado com prioridade/urgencia.';
