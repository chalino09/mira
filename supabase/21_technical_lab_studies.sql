-- mira - 21 Technical lab studies
-- Ejecutar después de 20_nutrition_monitoring_admin_scope.sql.
-- Agrega Laboratorio: estudios técnicos con adjuntos privados, parámetros editables y diagnóstico manual.

create table if not exists public.technical_lab_studies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null references public.greenhouses(id) on delete cascade,
  study_type text not null,
  sample_date date not null,
  lab_name text,
  folio text,
  diagnostic_status text not null default 'sin_clasificar',
  review_status text not null default 'draft',
  summary text,
  diagnosis text,
  recommended_actions text,
  notes text,
  extracted_text text,
  ai_summary text,
  ai_extraction_status text not null default 'not_requested',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  constraint technical_lab_studies_type_check
    check (study_type in ('suelo', 'agua', 'fertilidad', 'pasta_saturada', 'solucion_suelo_avanzada', 'foliar')),
  constraint technical_lab_studies_diagnostic_status_check
    check (diagnostic_status in ('sin_clasificar', 'adecuado', 'atencion', 'critico')),
  constraint technical_lab_studies_review_status_check
    check (review_status in ('draft', 'reviewed', 'approved')),
  constraint technical_lab_studies_ai_status_check
    check (ai_extraction_status in ('not_requested', 'pending', 'completed', 'failed'))
);

create table if not exists public.technical_lab_study_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  study_id uuid not null,
  parameter_group text not null default 'otros',
  parameter_key text,
  parameter_label text not null,
  value_text text not null default '',
  unit text,
  value_secondary_text text,
  secondary_unit text,
  range_min numeric,
  range_max numeric,
  range_text text,
  ideal_level_text text,
  status text not null default 'sin_clasificar',
  source_label text,
  confidence numeric,
  source_page integer,
  observation text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint technical_lab_study_values_study_fk
    foreign key (study_id, company_id)
    references public.technical_lab_studies(id, company_id)
    on delete cascade,
  constraint technical_lab_study_values_status_check
    check (status in ('bajo', 'adecuado', 'alto', 'critico', 'sin_clasificar')),
  constraint technical_lab_study_values_group_check
    check (parameter_group in ('datos_generales', 'aniones', 'cationes', 'micronutrientes', 'relaciones', 'foliar', 'otros')),
  constraint technical_lab_study_values_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists public.technical_lab_study_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  study_id uuid not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null default 0,
  storage_path text not null,
  file_kind text not null default 'otro',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint technical_lab_study_files_study_fk
    foreign key (study_id, company_id)
    references public.technical_lab_studies(id, company_id)
    on delete cascade,
  constraint technical_lab_study_files_kind_check
    check (file_kind in ('pdf', 'imagen', 'otro')),
  unique (storage_path)
);

alter table public.technical_lab_studies enable row level security;
alter table public.technical_lab_study_values enable row level security;
alter table public.technical_lab_study_files enable row level security;

drop policy if exists "technical_lab_studies_select_managerial" on public.technical_lab_studies;
create policy "technical_lab_studies_select_managerial"
on public.technical_lab_studies for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "technical_lab_studies_insert_managerial" on public.technical_lab_studies;
create policy "technical_lab_studies_insert_managerial"
on public.technical_lab_studies for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "technical_lab_studies_update_managerial" on public.technical_lab_studies;
create policy "technical_lab_studies_update_managerial"
on public.technical_lab_studies for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "technical_lab_studies_delete_managerial" on public.technical_lab_studies;
create policy "technical_lab_studies_delete_managerial"
on public.technical_lab_studies for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "technical_lab_study_values_select_managerial" on public.technical_lab_study_values;
create policy "technical_lab_study_values_select_managerial"
on public.technical_lab_study_values for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "technical_lab_study_values_insert_managerial" on public.technical_lab_study_values;
create policy "technical_lab_study_values_insert_managerial"
on public.technical_lab_study_values for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "technical_lab_study_values_update_managerial" on public.technical_lab_study_values;
create policy "technical_lab_study_values_update_managerial"
on public.technical_lab_study_values for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "technical_lab_study_values_delete_managerial" on public.technical_lab_study_values;
create policy "technical_lab_study_values_delete_managerial"
on public.technical_lab_study_values for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "technical_lab_study_files_select_managerial" on public.technical_lab_study_files;
create policy "technical_lab_study_files_select_managerial"
on public.technical_lab_study_files for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "technical_lab_study_files_insert_managerial" on public.technical_lab_study_files;
create policy "technical_lab_study_files_insert_managerial"
on public.technical_lab_study_files for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "technical_lab_study_files_delete_managerial" on public.technical_lab_study_files;
create policy "technical_lab_study_files_delete_managerial"
on public.technical_lab_study_files for delete
to authenticated
using (public.can_manage_company(company_id));

drop trigger if exists set_technical_lab_studies_updated_at on public.technical_lab_studies;
create trigger set_technical_lab_studies_updated_at
before update on public.technical_lab_studies
for each row execute function public.set_updated_at();

drop trigger if exists set_technical_lab_study_values_updated_at on public.technical_lab_study_values;
create trigger set_technical_lab_study_values_updated_at
before update on public.technical_lab_study_values
for each row execute function public.set_updated_at();

create index if not exists technical_lab_studies_greenhouse_date_idx
on public.technical_lab_studies(company_id, greenhouse_id, sample_date desc);

create index if not exists technical_lab_studies_type_idx
on public.technical_lab_studies(company_id, study_type, sample_date desc);

create index if not exists technical_lab_study_values_study_idx
on public.technical_lab_study_values(study_id, sort_order);

create index if not exists technical_lab_study_files_study_idx
on public.technical_lab_study_files(study_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'technical-lab-files',
  'technical-lab-files',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "technical_lab_files_select_managerial" on storage.objects;
create policy "technical_lab_files_select_managerial"
on storage.objects for select
to authenticated
using (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "technical_lab_files_insert_managerial" on storage.objects;
create policy "technical_lab_files_insert_managerial"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "technical_lab_files_update_managerial" on storage.objects;
create policy "technical_lab_files_update_managerial"
on storage.objects for update
to authenticated
using (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "technical_lab_files_delete_managerial" on storage.objects;
create policy "technical_lab_files_delete_managerial"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(((storage.foldername(name))[1])::uuid)
);
