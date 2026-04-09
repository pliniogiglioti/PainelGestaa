alter table public.lab_precos add column if not exists prazo_producao_dias integer null;

comment on column public.lab_precos.prazo_producao_dias is 'Prazo de produção em dias úteis para este serviço. Null = sem prazo definido.';
