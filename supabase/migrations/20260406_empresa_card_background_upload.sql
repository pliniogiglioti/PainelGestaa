-- Imagem de fundo dos cards de empresa + bucket de upload com RLS

alter table public.empresas
  add column if not exists card_background_url text;

comment on column public.empresas.card_background_url is
  'URL publica da imagem de fundo usada no card da empresa.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'empresa-card-backgrounds',
  'empresa-card-backgrounds',
  true,
  5242880,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can view company card backgrounds" on storage.objects;
create policy "Authenticated users can view company card backgrounds"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'empresa-card-backgrounds');

drop policy if exists "Authenticated users can upload company card backgrounds" on storage.objects;
create policy "Authenticated users can upload company card backgrounds"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'empresa-card-backgrounds'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated users can update own company card backgrounds" on storage.objects;
create policy "Authenticated users can update own company card backgrounds"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'empresa-card-backgrounds'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'empresa-card-backgrounds'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated users can delete own company card backgrounds" on storage.objects;
create policy "Authenticated users can delete own company card backgrounds"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'empresa-card-backgrounds'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
