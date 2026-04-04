-- =============================================================================
-- Lab control enhancements
-- =============================================================================

alter table public.labs
  add column if not exists dia_fechamento integer,
  add column if not exists feriados jsonb not null default '[]'::jsonb;

alter table public.lab_envios
  add column if not exists data_consulta date,
  add column if not exists etapas jsonb not null default '[]'::jsonb,
  add column if not exists pago boolean not null default false,
  add column if not exists data_pagamento date;
