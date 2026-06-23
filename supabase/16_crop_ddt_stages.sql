-- mira - 16 Multi-crop catalog and DDT stages
-- Ejecutar después de 15_greenhouse_crop_details.sql.
-- Base genérica para cultivos, ciclos, etapas DDT, rangos y plantillas.
-- El cultivo incluido aquí es solo el primer dataset del catálogo.

create table if not exists public.crops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  scientific_name text,
  default_cycle_days integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crops_slug_check check (slug = lower(slug) and slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  constraint crops_default_cycle_days_check check (default_cycle_days is null or default_cycle_days > 0)
);

create table if not exists public.crop_stages (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  stage_number integer not null,
  stage_label text not null,
  stage_name text not null,
  ddt_start integer not null,
  ddt_end integer not null,
  duration_days integer not null,
  source_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crop_id, stage_number),
  constraint crop_stages_range_check check (ddt_start >= 0 and ddt_end >= ddt_start),
  constraint crop_stages_duration_check check (duration_days > 0)
);

create table if not exists public.crop_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  crop_id uuid not null references public.crops(id),
  variety text,
  transplant_date date,
  plants_count integer,
  stem_count integer,
  is_grafted boolean,
  status text not null default 'active',
  started_at date,
  ended_at date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade,
  constraint crop_cycles_status_check check (status in ('active', 'closed', 'cancelled')),
  constraint crop_cycles_plants_count_check check (plants_count is null or plants_count >= 0),
  constraint crop_cycles_stem_count_check check (stem_count is null or stem_count in (1, 2)),
  constraint crop_cycles_dates_check check (ended_at is null or started_at is null or ended_at >= started_at)
);

create table if not exists public.nutrient_ranges (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  crop_stage_id uuid references public.crop_stages(id) on delete cascade,
  range_context text not null,
  nutrient text not null,
  unit_label text not null,
  min_value numeric(12,4) not null,
  max_value numeric(12,4) not null,
  display_value text not null,
  sort_order integer not null default 0,
  source_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crop_id, crop_stage_id, range_context, nutrient),
  constraint nutrient_ranges_range_check check (min_value >= 0 and max_value >= min_value)
);

create table if not exists public.activity_templates (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  crop_stage_id uuid references public.crop_stages(id) on delete cascade,
  task_type public.task_type,
  title text not null,
  suggested_ddt_start integer,
  suggested_ddt_end integer,
  priority public.task_priority not null default 'normal',
  instructions text,
  technical_plan jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_templates_ddt_check check (
    suggested_ddt_start is null
    or suggested_ddt_end is null
    or suggested_ddt_end >= suggested_ddt_start
  )
);

create table if not exists public.recommendation_templates (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references public.crops(id) on delete cascade,
  crop_stage_id uuid references public.crop_stages(id) on delete cascade,
  trigger_context text not null,
  trigger_payload jsonb not null default '{}'::jsonb,
  severity public.risk_level not null default 'media',
  recommendation text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.crops (
  id,
  slug,
  name,
  scientific_name,
  default_cycle_days,
  is_active
)
values (
  '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1',
  'jitomate',
  'Jitomate',
  'Solanum lycopersicum',
  182,
  true
)
on conflict (id)
do update set
  slug = excluded.slug,
  name = excluded.name,
  scientific_name = excluded.scientific_name,
  default_cycle_days = excluded.default_cycle_days,
  is_active = excluded.is_active,
  updated_at = now();

do $$ begin
  alter table public.greenhouses
  add column if not exists crop_id uuid default '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid references public.crops(id);
exception when duplicate_object then null;
end $$;

alter table public.greenhouses
add column if not exists crop_variety text;

update public.greenhouses
set crop_id = coalesce(crop_id, '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid),
    crop_variety = coalesce(nullif(trim(crop_variety), ''), nullif(trim(tomato_variety), ''))
where crop_id is null
   or nullif(trim(crop_variety), '') is null;

create or replace function public.sync_greenhouse_crop_defaults()
returns trigger
language plpgsql
as $$
begin
  new.crop_id = coalesce(new.crop_id, '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid);
  new.crop_variety = coalesce(nullif(trim(new.crop_variety), ''), nullif(trim(new.tomato_variety), ''));
  return new;
end;
$$;

drop trigger if exists sync_greenhouse_crop_defaults on public.greenhouses;
create trigger sync_greenhouse_crop_defaults
before insert or update on public.greenhouses
for each row execute function public.sync_greenhouse_crop_defaults();

alter table public.crops enable row level security;
alter table public.crop_stages enable row level security;
alter table public.crop_cycles enable row level security;
alter table public.nutrient_ranges enable row level security;
alter table public.activity_templates enable row level security;
alter table public.recommendation_templates enable row level security;

drop policy if exists "crops_select_authenticated" on public.crops;
create policy "crops_select_authenticated"
on public.crops for select
to authenticated
using (true);

drop policy if exists "crop_stages_select_authenticated" on public.crop_stages;
create policy "crop_stages_select_authenticated"
on public.crop_stages for select
to authenticated
using (true);

drop policy if exists "nutrient_ranges_select_authenticated" on public.nutrient_ranges;
create policy "nutrient_ranges_select_authenticated"
on public.nutrient_ranges for select
to authenticated
using (true);

drop policy if exists "activity_templates_select_authenticated" on public.activity_templates;
create policy "activity_templates_select_authenticated"
on public.activity_templates for select
to authenticated
using (true);

drop policy if exists "recommendation_templates_select_authenticated" on public.recommendation_templates;
create policy "recommendation_templates_select_authenticated"
on public.recommendation_templates for select
to authenticated
using (true);

drop policy if exists "crop_cycles_select_scoped" on public.crop_cycles;
create policy "crop_cycles_select_scoped"
on public.crop_cycles for select
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "crop_cycles_insert_scoped" on public.crop_cycles;
create policy "crop_cycles_insert_scoped"
on public.crop_cycles for insert
to authenticated
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "crop_cycles_update_scoped" on public.crop_cycles;
create policy "crop_cycles_update_scoped"
on public.crop_cycles for update
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id))
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "crop_cycles_delete_owner_admin" on public.crop_cycles;
create policy "crop_cycles_delete_owner_admin"
on public.crop_cycles for delete
to authenticated
using (public.can_manage_company(company_id));

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'crops',
    'crop_stages',
    'crop_cycles',
    'nutrient_ranges',
    'activity_templates',
    'recommendation_templates'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

create index if not exists crop_stages_crop_range_idx
on public.crop_stages(crop_id, ddt_start, ddt_end)
where is_active = true;

create index if not exists crop_cycles_greenhouse_status_idx
on public.crop_cycles(company_id, greenhouse_id, status);

create unique index if not exists crop_cycles_one_active_greenhouse_idx
on public.crop_cycles(company_id, greenhouse_id)
where status = 'active';

create index if not exists nutrient_ranges_crop_stage_idx
on public.nutrient_ranges(crop_id, crop_stage_id, range_context);

create index if not exists activity_templates_crop_stage_idx
on public.activity_templates(crop_id, crop_stage_id)
where is_active = true;

create index if not exists recommendation_templates_crop_stage_idx
on public.recommendation_templates(crop_id, crop_stage_id)
where is_active = true;

with stage_data(stage_number, stage_label, stage_name, ddt_start, ddt_end, duration_days) as (
  values
    (1, 'Etapa I', 'Establecimiento', 5, 21, 16),
    (2, 'Etapa II', 'Crecimiento vegetativo', 22, 42, 21),
    (3, 'Etapa III', 'Floración y cuajado', 43, 77, 35),
    (4, 'Etapa IV', 'Engorde e inicio cosecha', 78, 112, 35),
    (5, 'Etapa V', 'Cosecha', 113, 154, 42),
    (6, 'Etapa VI', 'Cosecha tardía y senescencia', 155, 182, 28)
)
insert into public.crop_stages (
  crop_id,
  stage_number,
  stage_label,
  stage_name,
  ddt_start,
  ddt_end,
  duration_days,
  source_label,
  is_active
)
select
  '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid,
  stage_number,
  stage_label,
  stage_name,
  ddt_start,
  ddt_end,
  duration_days,
  'Imagen WhatsApp 2026-06-22 18:37:45',
  true
from stage_data
on conflict (crop_id, stage_number)
do update set
  stage_label = excluded.stage_label,
  stage_name = excluded.stage_name,
  ddt_start = excluded.ddt_start,
  ddt_end = excluded.ddt_end,
  duration_days = excluded.duration_days,
  source_label = excluded.source_label,
  is_active = excluded.is_active,
  updated_at = now();

with range_data(stage_number, nutrient, min_value, max_value, display_value, sort_order) as (
  values
    (1, 'N', 0.5, 2.2, '0.5 a 2.2', 1),
    (1, 'P2O5', 1, 2.3, '1 a 2.3', 2),
    (1, 'K2O', 2, 3, '2 a 3', 3),
    (1, 'CaO', 1.5, 3, '1.5 a 3', 4),
    (1, 'MgO', 1, 1.6, '1 a 1.6', 5),
    (2, 'N', 2.3, 3.5, '2.3 a 3.5', 1),
    (2, 'P2O5', 1.2, 2.4, '1.2 a 2.4', 2),
    (2, 'K2O', 3.2, 4.5, '3.2 a 4.5', 3),
    (2, 'CaO', 3.2, 4, '3.2 a 4', 4),
    (2, 'MgO', 1.7, 2, '1.7 a 2', 5),
    (3, 'N', 3.8, 5, '3.8 a 5', 1),
    (3, 'P2O5', 1.5, 2.5, '1.5 a 2.5', 2),
    (3, 'K2O', 6, 7.5, '6 a 7.5', 3),
    (3, 'CaO', 4.2, 5.2, '4.2 a 5.2', 4),
    (3, 'MgO', 1.9, 2.3, '1.9 a 2.3', 5),
    (4, 'N', 5.2, 6, '5.2 a 6', 1),
    (4, 'P2O5', 1.8, 2.2, '1.8 a 2.2', 2),
    (4, 'K2O', 8, 10, '8 a 10', 3),
    (4, 'CaO', 4.5, 5.5, '4.5 a 5.5', 4),
    (4, 'MgO', 2, 2.6, '2 a 2.6', 5),
    (5, 'N', 6.2, 9, '6.2 a 9', 1),
    (5, 'P2O5', 1.8, 2.2, '1.8 a 2.2', 2),
    (5, 'K2O', 8.5, 12, '8.5 a 12', 3),
    (5, 'CaO', 4.5, 5.5, '4.5 a 5.5', 4),
    (5, 'MgO', 2.2, 2.6, '2.2 a 2.6', 5),
    (6, 'N', 3, 3, '3', 1),
    (6, 'P2O5', 0.5, 0.5, '0.5', 2),
    (6, 'K2O', 3, 5, '3 a 5', 3),
    (6, 'CaO', 3, 3, '3', 4),
    (6, 'MgO', 1.5, 1.5, '1.5', 5)
)
insert into public.nutrient_ranges (
  crop_id,
  crop_stage_id,
  range_context,
  nutrient,
  unit_label,
  min_value,
  max_value,
  display_value,
  sort_order,
  source_label
)
select
  stage.crop_id,
  stage.id,
  'fertilizer_unit',
  range_data.nutrient,
  'unidad fertilizante',
  range_data.min_value,
  range_data.max_value,
  range_data.display_value,
  range_data.sort_order,
  'Imagen WhatsApp 2026-06-22 18:37:45'
from public.crop_stages stage
join range_data
  on range_data.stage_number = stage.stage_number
where stage.crop_id = '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid
on conflict (crop_id, crop_stage_id, range_context, nutrient)
do update set
  unit_label = excluded.unit_label,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  display_value = excluded.display_value,
  sort_order = excluded.sort_order,
  source_label = excluded.source_label,
  updated_at = now();

insert into public.crop_cycles (
  company_id,
  greenhouse_id,
  crop_id,
  variety,
  transplant_date,
  plants_count,
  stem_count,
  is_grafted,
  status,
  started_at,
  created_by
)
select
  greenhouse.company_id,
  greenhouse.id,
  coalesce(greenhouse.crop_id, '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1'::uuid),
  coalesce(nullif(trim(greenhouse.crop_variety), ''), nullif(trim(greenhouse.tomato_variety), '')),
  greenhouse.transplant_date,
  greenhouse.plants_count,
  greenhouse.stem_count,
  greenhouse.is_grafted,
  'active',
  greenhouse.transplant_date,
  greenhouse.manager_user_id
from public.greenhouses greenhouse
where greenhouse.is_active = true
  and not exists (
    select 1
    from public.crop_cycles cycle
    where cycle.company_id = greenhouse.company_id
      and cycle.greenhouse_id = greenhouse.id
      and cycle.status = 'active'
  );

create or replace function public.get_active_crop_stage(
  target_crop_id uuid,
  target_ddt integer
)
returns table (
  crop_stage_id uuid,
  crop_id uuid,
  stage_number integer,
  stage_label text,
  stage_name text,
  ddt_start integer,
  ddt_end integer,
  duration_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    stage.id,
    stage.crop_id,
    stage.stage_number,
    stage.stage_label,
    stage.stage_name,
    stage.ddt_start,
    stage.ddt_end,
    stage.duration_days
  from public.crop_stages stage
  where stage.crop_id = target_crop_id
    and stage.is_active = true
    and target_ddt between stage.ddt_start and stage.ddt_end
  order by stage.stage_number
  limit 1
$$;

revoke all on function public.get_active_crop_stage(uuid, integer) from public;
grant execute on function public.get_active_crop_stage(uuid, integer) to authenticated;
