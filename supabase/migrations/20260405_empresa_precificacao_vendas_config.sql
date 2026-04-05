alter table public.empresa_precificacao_config
  add column if not exists vendas_max_cartao integer not null default 12,
  add column if not exists vendas_max_boleto integer not null default 1,
  add column if not exists vendas_max_pix integer not null default 1,
  add column if not exists vendas_max_carne integer not null default 1,
  add column if not exists vendas_tempo_apresentacao_segundos integer not null default 0,
  add column if not exists vendas_oferta_valida_minutos integer not null default 15,
  add column if not exists vendas_exibir_campanha_promocional boolean not null default false;

comment on column public.empresa_precificacao_config.vendas_max_cartao is
  'Quantidade maxima de parcelas exibidas no cartao no modo apresentacao.';

comment on column public.empresa_precificacao_config.vendas_max_boleto is
  'Quantidade maxima de parcelas exibidas no boleto no modo apresentacao.';

comment on column public.empresa_precificacao_config.vendas_max_pix is
  'Quantidade maxima de divisoes exibidas no PIX no modo apresentacao.';

comment on column public.empresa_precificacao_config.vendas_max_carne is
  'Quantidade maxima de parcelas exibidas no carne no modo apresentacao.';

comment on column public.empresa_precificacao_config.vendas_tempo_apresentacao_segundos is
  'Tempo em segundos para liberar a exibicao dos meios de pagamento no modo apresentacao.';

comment on column public.empresa_precificacao_config.vendas_oferta_valida_minutos is
  'Tempo padrao, em minutos, da oferta valida exibida com contagem regressiva no modo apresentacao.';

comment on column public.empresa_precificacao_config.vendas_exibir_campanha_promocional is
  'Define se a campanha promocional deve aparecer antes do preco final no modo apresentacao.';
