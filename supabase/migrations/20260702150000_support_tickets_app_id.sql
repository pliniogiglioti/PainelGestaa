alter table public.support_tickets
  add column app_id uuid references public.apps(id) on delete set null;

create index support_tickets_app_id_idx on public.support_tickets (app_id);
