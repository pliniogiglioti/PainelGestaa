alter table public.empresa_precos
  add column if not exists precificacao_calculo jsonb not null default '{}'::jsonb;

comment on column public.empresa_precos.precificacao_calculo is
  'Configuracoes salvas da calculadora de precificacao por produto.';
