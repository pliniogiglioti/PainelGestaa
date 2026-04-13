alter table public.lab_envios
  alter column status set default 'Pré-envio';

comment on column public.lab_envios.status is
  'Status do envio no kanban do laboratório. Padrão atualizado para Pré-envio.';
