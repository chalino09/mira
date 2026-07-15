-- mira - 46 Work evidence
-- Ejecutar después de 45_inventory_product_intake.sql.
-- Evidencia privada ligada al Work; las alertas operativas se derivan de su estado y fechas.

create table if not exists public.work_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_id uuid not null references public.tasks(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint work_evidence_storage_path_company check (storage_path like company_id::text || '/%')
);

create index if not exists work_evidence_work_created_idx
on public.work_evidence(work_id, created_at desc);

alter table public.work_evidence enable row level security;

drop policy if exists "work_evidence_select_company_member" on public.work_evidence;
create policy "work_evidence_select_company_member"
on public.work_evidence for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "work_evidence_insert_work_operator" on public.work_evidence;
create policy "work_evidence_insert_work_operator"
on public.work_evidence for insert
to authenticated
with check (
  public.can_operate_work(work_id)
  and exists (
    select 1 from public.tasks work
    where work.id = work_id and work.company_id = company_id
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-evidence',
  'work-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "work_evidence_select_company_member" on storage.objects;
create policy "work_evidence_select_company_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'work-evidence'
  and public.is_company_member(public.storage_object_company_id(name))
);

drop policy if exists "work_evidence_insert_work_operator" on storage.objects;
create policy "work_evidence_insert_work_operator"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'work-evidence'
  and public.can_write_company(public.storage_object_company_id(name))
);
