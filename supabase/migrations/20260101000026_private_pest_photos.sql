-- mira - 26 Private pest photos
-- Ejecutar después de 25_mira_copilot.sql.
-- Convierte las evidencias sanitarias a almacenamiento privado. photo_url queda
-- como legado temporal; las cargas nuevas deben guardar photo_storage_path.

alter table public.pest_alerts
add column if not exists photo_storage_path text;

update public.pest_alerts
set photo_storage_path = split_part(photo_url, '/storage/v1/object/public/pest-photos/', 2)
where photo_storage_path is null
  and photo_url like '%/storage/v1/object/public/pest-photos/%';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pest-photos',
  'pest-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pest_photos_select_member" on storage.objects;
create policy "pest_photos_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'pest-photos'
  and public.is_company_member(
    case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists "pest_photos_insert_writer" on storage.objects;
create policy "pest_photos_insert_writer"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pest-photos'
  and public.can_write_company(
    case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);

drop policy if exists "pest_photos_update_writer" on storage.objects;
create policy "pest_photos_update_writer"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pest-photos'
  and public.can_write_company(
    case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
)
with check (
  bucket_id = 'pest-photos'
  and public.can_write_company(
    case
      when ((storage.foldername(name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);
