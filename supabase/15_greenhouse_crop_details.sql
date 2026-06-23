-- mira - 15 Greenhouse crop details
-- Ejecutar después de 14_greenhouse_budget.sql.
-- Datos opcionales de manejo de plantas por invernadero/ciclo.

alter table public.greenhouses
add column if not exists stem_count integer,
add column if not exists is_grafted boolean;

do $$ begin
  alter table public.greenhouses
  add constraint greenhouses_stem_count_check
  check (stem_count is null or stem_count in (1, 2));
exception when duplicate_object then null;
end $$;

create or replace function public.create_initial_workspace_with_coordinates(
  full_name text,
  company_name text,
  greenhouse_name text,
  greenhouse_location text default null,
  tomato_variety text default null,
  initial_crop_stage public.crop_stage default 'produccion',
  initial_transplant_date date default null,
  initial_surface_m2 numeric default null,
  initial_plants_count integer default 0,
  initial_beds_count integer default 0,
  initial_latitude numeric default null,
  initial_longitude numeric default null,
  initial_location_accuracy_m numeric default null,
  initial_budget_amount numeric default null,
  initial_stem_count integer default null,
  initial_is_grafted boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_company_id uuid;
  new_greenhouse_id uuid;
  clean_full_name text := nullif(trim(full_name), '');
  clean_company_name text := nullif(trim(company_name), '');
  clean_greenhouse_name text := nullif(trim(greenhouse_name), '');
  clean_location text := nullif(trim(greenhouse_location), '');
  clean_variety text := nullif(trim(tomato_variety), '');
  normalized_surface numeric := initial_surface_m2;
  normalized_budget numeric := initial_budget_amount;
  normalized_plants integer := coalesce(initial_plants_count, 0);
  normalized_beds integer := coalesce(initial_beds_count, 0);
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if clean_full_name is null then
    raise exception 'full_name_required';
  end if;

  if clean_company_name is null then
    raise exception 'company_name_required';
  end if;

  if clean_greenhouse_name is null then
    raise exception 'greenhouse_name_required';
  end if;

  if clean_location is null then
    raise exception 'precise_location_required';
  end if;

  if clean_variety is null then
    raise exception 'tomato_variety_required';
  end if;

  if initial_latitude is null or initial_longitude is null then
    raise exception 'precise_location_required';
  end if;

  if initial_latitude < -90 or initial_latitude > 90 then
    raise exception 'latitude_invalid';
  end if;

  if initial_longitude < -180 or initial_longitude > 180 then
    raise exception 'longitude_invalid';
  end if;

  if initial_location_accuracy_m is not null and initial_location_accuracy_m < 0 then
    raise exception 'location_accuracy_invalid';
  end if;

  if length(clean_full_name) > 120 then
    raise exception 'full_name_too_long';
  end if;

  if length(clean_company_name) > 140 then
    raise exception 'company_name_too_long';
  end if;

  if length(clean_greenhouse_name) > 120 then
    raise exception 'greenhouse_name_too_long';
  end if;

  if length(clean_location) > 180 then
    raise exception 'location_too_long';
  end if;

  if normalized_surface is not null and normalized_surface < 0 then
    raise exception 'surface_m2_invalid';
  end if;

  if normalized_budget is not null and normalized_budget < 0 then
    raise exception 'budget_amount_invalid';
  end if;

  if normalized_plants < 0 then
    raise exception 'plants_count_invalid';
  end if;

  if normalized_beds < 0 then
    raise exception 'beds_count_invalid';
  end if;

  if initial_transplant_date is not null and initial_transplant_date > current_date then
    raise exception 'transplant_date_invalid';
  end if;

  if initial_stem_count is not null and initial_stem_count not in (1, 2) then
    raise exception 'stem_count_invalid';
  end if;

  insert into public.profiles (id, full_name, email)
  values (
    current_user_id,
    clean_full_name,
    (select email from auth.users where id = current_user_id)
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        updated_at = now();

  insert into public.companies (name, legal_name, created_by)
  values (
    clean_company_name,
    clean_company_name,
    current_user_id
  )
  returning id into new_company_id;

  insert into public.company_members (company_id, user_id, role, status)
  values (new_company_id, current_user_id, 'owner', 'active')
  on conflict (company_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now();

  insert into public.greenhouses (
    company_id,
    name,
    location,
    latitude,
    longitude,
    location_accuracy_m,
    surface_m2,
    budget_amount,
    tomato_variety,
    transplant_date,
    crop_stage,
    manager_user_id,
    plants_count,
    stem_count,
    is_grafted,
    beds_count,
    health_status
  )
  values (
    new_company_id,
    clean_greenhouse_name,
    clean_location,
    initial_latitude,
    initial_longitude,
    initial_location_accuracy_m,
    normalized_surface,
    normalized_budget,
    clean_variety,
    initial_transplant_date,
    initial_crop_stage,
    current_user_id,
    normalized_plants,
    initial_stem_count,
    initial_is_grafted,
    normalized_beds,
    'baja'
  )
  returning id into new_greenhouse_id;

  return jsonb_build_object(
    'company_id', new_company_id,
    'greenhouse_id', new_greenhouse_id
  );
end;
$$;

revoke all on function public.create_initial_workspace_with_coordinates(
  text,
  text,
  text,
  text,
  text,
  public.crop_stage,
  date,
  numeric,
  integer,
  integer,
  numeric,
  numeric,
  numeric,
  numeric,
  integer,
  boolean
) from public;

grant execute on function public.create_initial_workspace_with_coordinates(
  text,
  text,
  text,
  text,
  text,
  public.crop_stage,
  date,
  numeric,
  integer,
  integer,
  numeric,
  numeric,
  numeric,
  numeric,
  integer,
  boolean
) to authenticated;
