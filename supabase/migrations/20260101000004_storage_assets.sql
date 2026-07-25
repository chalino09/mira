-- mira - 04 Storage assets
-- Ejecutar después de 01_schema.sql, 02_rls_policies.sql y 03_onboarding_rpc.sql.
-- Agrega logo de empresa y evidencias fotográficas para plagas/enfermedades.

alter table public.companies
add column if not exists logo_url text;

alter table public.pest_alerts
add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pest-photos',
  'pest-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company_assets_select_member" on storage.objects;
create policy "company_assets_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'company-assets'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "company_assets_insert_writer" on storage.objects;
create policy "company_assets_insert_writer"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and public.can_write_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "company_assets_update_writer" on storage.objects;
create policy "company_assets_update_writer"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-assets'
  and public.can_write_company(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'company-assets'
  and public.can_write_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "pest_photos_select_member" on storage.objects;
create policy "pest_photos_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'pest-photos'
  and public.is_company_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "pest_photos_insert_writer" on storage.objects;
create policy "pest_photos_insert_writer"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pest-photos'
  and public.can_write_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "pest_photos_update_writer" on storage.objects;
create policy "pest_photos_update_writer"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pest-photos'
  and public.can_write_company(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'pest-photos'
  and public.can_write_company(((storage.foldername(name))[1])::uuid)
);
