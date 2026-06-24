-- mira - 17 Nutrition monitoring
-- Ejecutar después de 16_crop_ddt_stages.sql.
-- Monitoreo nutrimental multi-cultivo. Dataset inicial: Excel de jitomate.

create table if not exists public.nutrition_reference_ranges (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  sample_type text not null,
  analyte_key text not null,
  analyte_label text not null,
  input_unit text not null,
  diagnostic_unit text not null,
  ddt_min integer,
  ddt_max integer,
  min_value numeric(12,4) not null,
  max_value numeric(12,4) not null,
  sort_order integer not null default 0,
  source_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_reference_ranges_sample_type_check
    check (sample_type in ('petiole_cell_extract', 'soil_solution')),
  constraint nutrition_reference_ranges_ddt_check
    check (ddt_min is null or ddt_max is null or ddt_max >= ddt_min),
  constraint nutrition_reference_ranges_value_check
    check (min_value >= 0 and max_value >= min_value)
);

create table if not exists public.nutrition_observation_rules (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  observation_context text not null,
  petiole_status text not null,
  soil_status text not null,
  observation_text text not null,
  source_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crop_id, observation_context, petiole_status, soil_status),
  constraint nutrition_observation_rules_context_check
    check (observation_context in ('general', 'sodium', 'ph', 'ec')),
  constraint nutrition_observation_rules_petiole_status_check
    check (petiole_status in ('Bajo', 'Adecuado', 'Alto')),
  constraint nutrition_observation_rules_soil_status_check
    check (soil_status in ('Bajo', 'Adecuado', 'Alto'))
);

create table if not exists public.nutrition_monitoring_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  crop_id uuid not null references public.crops(id),
  crop_cycle_id uuid references public.crop_cycles(id) on delete set null,
  sample_date date not null,
  sample_time time,
  ddt integer not null,
  notes text,
  source_label text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade,
  constraint nutrition_monitoring_events_ddt_check check (ddt >= 0)
);

create table if not exists public.nutrition_monitoring_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null,
  sample_type text not null,
  analyte_key text not null,
  analyte_label text not null,
  raw_value numeric(12,4) not null,
  raw_unit text not null,
  diagnostic_value numeric(12,4) not null,
  diagnostic_unit text not null,
  range_min numeric(12,4),
  range_max numeric(12,4),
  diagnostic_status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, sample_type, analyte_key),
  foreign key (event_id, company_id)
    references public.nutrition_monitoring_events(id, company_id)
    on delete cascade,
  constraint nutrition_monitoring_values_sample_type_check
    check (sample_type in ('petiole_cell_extract', 'soil_solution')),
  constraint nutrition_monitoring_values_status_check
    check (diagnostic_status in ('Bajo', 'Adecuado', 'Alto'))
);

create table if not exists public.nutrition_monitoring_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null,
  analyte_key text not null,
  analyte_label text not null,
  observation_context text not null,
  petiole_status text not null,
  soil_status text not null,
  observation_text text not null,
  recommendation_text text,
  severity public.risk_level not null default 'media',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, analyte_key),
  foreign key (event_id, company_id)
    references public.nutrition_monitoring_events(id, company_id)
    on delete cascade,
  constraint nutrition_monitoring_observations_context_check
    check (observation_context in ('general', 'sodium', 'ph', 'ec')),
  constraint nutrition_monitoring_observations_petiole_status_check
    check (petiole_status in ('Bajo', 'Adecuado', 'Alto')),
  constraint nutrition_monitoring_observations_soil_status_check
    check (soil_status in ('Bajo', 'Adecuado', 'Alto'))
);

alter table public.nutrition_reference_ranges enable row level security;
alter table public.nutrition_observation_rules enable row level security;
alter table public.nutrition_monitoring_events enable row level security;
alter table public.nutrition_monitoring_values enable row level security;
alter table public.nutrition_monitoring_observations enable row level security;

drop policy if exists "nutrition_reference_ranges_select_authenticated" on public.nutrition_reference_ranges;
create policy "nutrition_reference_ranges_select_authenticated"
on public.nutrition_reference_ranges for select
to authenticated
using (true);

drop policy if exists "nutrition_observation_rules_select_authenticated" on public.nutrition_observation_rules;
create policy "nutrition_observation_rules_select_authenticated"
on public.nutrition_observation_rules for select
to authenticated
using (true);

drop policy if exists "nutrition_monitoring_events_select_scoped" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_select_scoped"
on public.nutrition_monitoring_events for select
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "nutrition_monitoring_events_insert_scoped" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_insert_scoped"
on public.nutrition_monitoring_events for insert
to authenticated
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "nutrition_monitoring_events_update_scoped" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_update_scoped"
on public.nutrition_monitoring_events for update
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id))
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "nutrition_monitoring_events_delete_owner_admin" on public.nutrition_monitoring_events;
create policy "nutrition_monitoring_events_delete_owner_admin"
on public.nutrition_monitoring_events for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "nutrition_monitoring_values_select_scoped" on public.nutrition_monitoring_values;
create policy "nutrition_monitoring_values_select_scoped"
on public.nutrition_monitoring_values for select
to authenticated
using (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_values.event_id
      and event.company_id = public.nutrition_monitoring_values.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
);

drop policy if exists "nutrition_monitoring_values_insert_scoped" on public.nutrition_monitoring_values;
create policy "nutrition_monitoring_values_insert_scoped"
on public.nutrition_monitoring_values for insert
to authenticated
with check (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_values.event_id
      and event.company_id = public.nutrition_monitoring_values.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
);

drop policy if exists "nutrition_monitoring_values_update_scoped" on public.nutrition_monitoring_values;
create policy "nutrition_monitoring_values_update_scoped"
on public.nutrition_monitoring_values for update
to authenticated
using (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_values.event_id
      and event.company_id = public.nutrition_monitoring_values.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
)
with check (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_values.event_id
      and event.company_id = public.nutrition_monitoring_values.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
);

drop policy if exists "nutrition_monitoring_observations_select_scoped" on public.nutrition_monitoring_observations;
create policy "nutrition_monitoring_observations_select_scoped"
on public.nutrition_monitoring_observations for select
to authenticated
using (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_observations.event_id
      and event.company_id = public.nutrition_monitoring_observations.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
);

drop policy if exists "nutrition_monitoring_observations_insert_scoped" on public.nutrition_monitoring_observations;
create policy "nutrition_monitoring_observations_insert_scoped"
on public.nutrition_monitoring_observations for insert
to authenticated
with check (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_observations.event_id
      and event.company_id = public.nutrition_monitoring_observations.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
);

drop policy if exists "nutrition_monitoring_observations_update_scoped" on public.nutrition_monitoring_observations;
create policy "nutrition_monitoring_observations_update_scoped"
on public.nutrition_monitoring_observations for update
to authenticated
using (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_observations.event_id
      and event.company_id = public.nutrition_monitoring_observations.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
)
with check (
  exists (
    select 1
    from public.nutrition_monitoring_events event
    where event.id = public.nutrition_monitoring_observations.event_id
      and event.company_id = public.nutrition_monitoring_observations.company_id
      and public.can_access_greenhouse(event.company_id, event.greenhouse_id)
  )
);

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'nutrition_reference_ranges',
    'nutrition_observation_rules',
    'nutrition_monitoring_events',
    'nutrition_monitoring_values',
    'nutrition_monitoring_observations'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

create index if not exists nutrition_reference_ranges_lookup_idx
on public.nutrition_reference_ranges(crop_id, sample_type, analyte_key, ddt_min, ddt_max);

create index if not exists nutrition_monitoring_events_greenhouse_date_idx
on public.nutrition_monitoring_events(company_id, greenhouse_id, sample_date desc);

create index if not exists nutrition_monitoring_values_event_idx
on public.nutrition_monitoring_values(event_id);

create index if not exists nutrition_monitoring_observations_event_idx
on public.nutrition_monitoring_observations(event_id);

delete from public.nutrition_reference_ranges
where crop_id = '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid
  and source_label = 'Monitoreo nutrimental jitomate Excel';

insert into public.nutrition_reference_ranges (
  crop_id,
  sample_type,
  analyte_key,
  analyte_label,
  input_unit,
  diagnostic_unit,
  ddt_min,
  ddt_max,
  min_value,
  max_value,
  sort_order,
  source_label
)
values
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'n_no3', 'N-NO3- / NO3-', 'ppm NO3-', 'ppm N-NO3-', 0, 45, 600, 800, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'n_no3', 'N-NO3- / NO3-', 'ppm NO3-', 'ppm N-NO3-', 46, 75, 600, 800, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'n_no3', 'N-NO3- / NO3-', 'ppm NO3-', 'ppm N-NO3-', 76, 90, 600, 900, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'n_no3', 'N-NO3- / NO3-', 'ppm NO3-', 'ppm N-NO3-', 91, 120, 600, 900, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'n_no3', 'N-NO3- / NO3-', 'ppm NO3-', 'ppm N-NO3-', 121, null, 600, 900, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'p_po4', 'P-PO4', 'ppm', 'ppm', 0, 45, 200, 400, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'p_po4', 'P-PO4', 'ppm', 'ppm', 46, 75, 200, 400, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'p_po4', 'P-PO4', 'ppm', 'ppm', 76, 90, 200, 400, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'p_po4', 'P-PO4', 'ppm', 'ppm', 91, 120, 200, 400, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'p_po4', 'P-PO4', 'ppm', 'ppm', 121, null, 200, 400, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'k', 'K+', 'ppm', 'ppm', 0, 45, 3000, 4000, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'k', 'K+', 'ppm', 'ppm', 46, 75, 3500, 4500, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'k', 'K+', 'ppm', 'ppm', 76, 90, 3500, 5000, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'k', 'K+', 'ppm', 'ppm', 91, 120, 3500, 5000, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'k', 'K+', 'ppm', 'ppm', 121, null, 3500, 5000, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'ca', 'Ca2+', 'ppm', 'ppm', 0, 45, 100, 200, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'ca', 'Ca2+', 'ppm', 'ppm', 46, 75, 200, 250, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'ca', 'Ca2+', 'ppm', 'ppm', 76, 90, 250, 400, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'ca', 'Ca2+', 'ppm', 'ppm', 91, 120, 400, 600, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'ca', 'Ca2+', 'ppm', 'ppm', 121, null, 400, 600, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'mg', 'Mg2+ estimado', 'ppm estimado', 'ppm', 0, 45, 400, 800, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'mg', 'Mg2+ estimado', 'ppm estimado', 'ppm', 46, 75, 400, 800, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'mg', 'Mg2+ estimado', 'ppm estimado', 'ppm', 76, 90, 400, 800, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'mg', 'Mg2+ estimado', 'ppm estimado', 'ppm', 91, 120, 400, 800, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'mg', 'Mg2+ estimado', 'ppm estimado', 'ppm', 121, null, 400, 800, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'na', 'Na+', 'ppm', 'ppm', 0, 45, 0, 150, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'na', 'Na+', 'ppm', 'ppm', 46, 75, 0, 150, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'na', 'Na+', 'ppm', 'ppm', 76, 90, 0, 150, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'na', 'Na+', 'ppm', 'ppm', 91, 120, 0, 150, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'na', 'Na+', 'ppm', 'ppm', 121, null, 0, 150, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'ph', 'pH', 'adim.', 'adim.', null, null, 5.9, 6.3, 7, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'petiole_cell_extract', 'ec', 'CE', 'mS/cm', 'mS/cm', null, null, 14, 17, 8, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'n_no3', 'NO3-', 'ppm NO3-', 'meq/L', 0, 45, 7, 12, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'n_no3', 'NO3-', 'ppm NO3-', 'meq/L', 46, 75, 7, 12, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'n_no3', 'NO3-', 'ppm NO3-', 'meq/L', 76, 90, 7, 12, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'n_no3', 'NO3-', 'ppm NO3-', 'meq/L', 91, 120, 7, 12, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'n_no3', 'NO3-', 'ppm NO3-', 'meq/L', 121, null, 7, 12, 1, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'p_po4', 'P-PO4', 'ppm', 'ppm', 0, 45, 2, 3, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'p_po4', 'P-PO4', 'ppm', 'ppm', 46, 75, 2, 3, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'p_po4', 'P-PO4', 'ppm', 'ppm', 76, 90, 2, 3, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'p_po4', 'P-PO4', 'ppm', 'ppm', 91, 120, 2, 3, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'p_po4', 'P-PO4', 'ppm', 'ppm', 121, null, 2, 3, 2, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'k', 'K+', 'ppm', 'meq/L', 0, 45, 3.5, 5, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'k', 'K+', 'ppm', 'meq/L', 46, 75, 3.5, 5, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'k', 'K+', 'ppm', 'meq/L', 76, 90, 3.5, 5, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'k', 'K+', 'ppm', 'meq/L', 91, 120, 3.5, 5, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'k', 'K+', 'ppm', 'meq/L', 121, null, 3.5, 5, 3, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'ca', 'Ca2+', 'ppm', 'meq/L', 0, 45, 8, 10, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'ca', 'Ca2+', 'ppm', 'meq/L', 46, 75, 8, 10, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'ca', 'Ca2+', 'ppm', 'meq/L', 76, 90, 8, 10, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'ca', 'Ca2+', 'ppm', 'meq/L', 91, 120, 8, 10, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'ca', 'Ca2+', 'ppm', 'meq/L', 121, null, 8, 10, 4, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'mg', 'Mg2+ estimado', 'ppm estimado', 'meq/L', 0, 45, 3, 5, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'mg', 'Mg2+ estimado', 'ppm estimado', 'meq/L', 46, 75, 3, 5, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'mg', 'Mg2+ estimado', 'ppm estimado', 'meq/L', 76, 90, 3, 5, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'mg', 'Mg2+ estimado', 'ppm estimado', 'meq/L', 91, 120, 3, 5, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'mg', 'Mg2+ estimado', 'ppm estimado', 'meq/L', 121, null, 3, 5, 5, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'na', 'Na+', 'ppm', 'meq/L', 0, 45, 0, 5, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'na', 'Na+', 'ppm', 'meq/L', 46, 75, 0, 5, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'na', 'Na+', 'ppm', 'meq/L', 76, 90, 0, 5, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'na', 'Na+', 'ppm', 'meq/L', 91, 120, 0, 5, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'na', 'Na+', 'ppm', 'meq/L', 121, null, 0, 5, 6, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'ph', 'pH', 'adim.', 'adim.', null, null, 5, 6, 7, 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'soil_solution', 'ec', 'CE', 'mS/cm', 'mS/cm', null, null, 2, 2.5, 8, 'Monitoreo nutrimental jitomate Excel');

delete from public.nutrition_observation_rules
where crop_id = '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid
  and source_label = 'Monitoreo nutrimental jitomate Excel';

insert into public.nutrition_observation_rules (
  crop_id,
  observation_context,
  petiole_status,
  soil_status,
  observation_text,
  source_label
)
values
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Bajo', 'Adecuado', 'Posible bloqueo del nutrimento en el suelo o clima desfavorable', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Bajo', 'Alto', 'Posible bloqueo del nutrimento en el suelo o clima desfavorable', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Adecuado', 'Bajo', 'El cultivo demanda más a este nutrimento (aumentar la dosis)', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Alto', 'Bajo', 'El cultivo demanda más a este nutrimento (aumentar la dosis)', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Adecuado', 'Adecuado', 'Continuar con el programa de nutrición para este elemento', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Alto', 'Alto', 'Continuar con el programa de nutrición para este elemento', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Adecuado', 'Alto', 'Continuar con el programa de nutrición para este elemento', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Alto', 'Adecuado', 'Continuar con el programa de nutrición para este elemento', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'general', 'Bajo', 'Bajo', 'Aumentar la dosis de fertilización para este nutrimento', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Bajo', 'Adecuado', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Bajo', 'Alto', 'Aumentar dosis de Ca, Mg o K de acuerdo al balance óptimo de cariones', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Adecuado', 'Bajo', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Alto', 'Bajo', 'Aplicacar foliarmente bioestimulantes para estrés salino', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Adecuado', 'Adecuado', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Alto', 'Alto', 'Aplicacar bioestimulantes para estrés salino  y aumentar dosis de Ca, Mg o K de acuerdo al balance óptimo de cationes', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Adecuado', 'Alto', 'Aumentar dosis de Ca, Mg o K de acuerdo al balance óptimo de cationes', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Alto', 'Adecuado', 'Aplicacar foliarmente bioestimulantes para estrés salino', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'sodium', 'Bajo', 'Bajo', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Bajo', 'Adecuado', 'Suceptibilidad del cultivo a hongos o posible desbalance de cationes', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Bajo', 'Alto', 'Suceptibilidad del cultivo a hongos o posible desbalance de cationes. Aplicacar ácido en el riego según concentración de HCO3-', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Adecuado', 'Bajo', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Alto', 'Bajo', 'Suceptibilidad del cultivo a mosca blanca, ácaros o posible desbalance de aniones', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Adecuado', 'Adecuado', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Alto', 'Alto', 'Suceptibilidad del cultivo a mosca blanca, ácaros o posible desbalance de aniones. Aplicacar ácido en el riego según concentración de HCO3-', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Adecuado', 'Alto', 'Aplicacar ácido en el riego según concentración de HCO3-', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Alto', 'Adecuado', 'Suceptibilidad del cultivo a mosca blanca, ácaros o posible desbalance de aniones', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ph', 'Bajo', 'Bajo', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Bajo', 'Adecuado', 'Las condiciones ambientales o fitosanitarias pueden  afectar la absorción nutrimental o verificar el estado hídrico del suelo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Bajo', 'Alto', 'Las condiciones ambientales o fitosanitarias pueden afectar la absorción nutrimental, disminuir la dosis de fertilización o verificar el estado hídrico del suelo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Adecuado', 'Bajo', 'Continuar con el programa nutricional del cultivo o aumentar la dosis de fertilización', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Alto', 'Bajo', 'Es necesario aumentar la dosis de fertilización y verificar el estado hídrico de la planta', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Adecuado', 'Adecuado', 'Continuar con el programa nutricional del cultivo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Alto', 'Alto', 'Es necesario disminuir la dosis de fertilización y verificar el estado hídrico de la planta y el  suelo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Adecuado', 'Alto', 'Es necesario disminuir la dosis de fertilización o verificar el estado hídrico del  suelo', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Alto', 'Adecuado', 'Es necesario disminuir la dosis de fertilización y verificar el estado hídrico de la planta', 'Monitoreo nutrimental jitomate Excel'),
  ('7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1', 'ec', 'Bajo', 'Bajo', 'Las condiciones ambientales o fitosanitarias pueden afectar la absorción nutrimental o aumenta la dosis de fertilización', 'Monitoreo nutrimental jitomate Excel');
