-- mira - 24 Weather snapshots
-- Ejecutar después de 23_multi_crop_foundation.sql.
-- Guarda como máximo una lectura climática cada 90 minutos por área desde la app.

create table if not exists public.weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  provider text not null default 'open-meteo',
  source_name text not null,
  recorded_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  temperature_c numeric(6,2),
  relative_humidity_percent numeric(5,2),
  today_min_temperature_c numeric(6,2),
  today_max_temperature_c numeric(6,2),
  precipitation_mm numeric(8,2),
  precipitation_probability_percent numeric(5,2),
  risk_label text,
  risk_tone text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade,
  constraint weather_snapshots_provider_check
    check (length(trim(provider)) > 0),
  constraint weather_snapshots_source_name_check
    check (length(trim(source_name)) > 0),
  constraint weather_snapshots_latitude_check
    check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint weather_snapshots_longitude_check
    check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint weather_snapshots_humidity_check
    check (relative_humidity_percent is null or (relative_humidity_percent >= 0 and relative_humidity_percent <= 100)),
  constraint weather_snapshots_precipitation_check
    check (precipitation_mm is null or precipitation_mm >= 0),
  constraint weather_snapshots_probability_check
    check (precipitation_probability_percent is null or (precipitation_probability_percent >= 0 and precipitation_probability_percent <= 100)),
  constraint weather_snapshots_risk_tone_check
    check (risk_tone is null or risk_tone in ('green', 'amber', 'red', 'muted'))
);

alter table public.weather_snapshots enable row level security;

drop policy if exists "weather_snapshots_select_scoped" on public.weather_snapshots;
create policy "weather_snapshots_select_scoped"
on public.weather_snapshots for select
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "weather_snapshots_insert_scoped" on public.weather_snapshots;
create policy "weather_snapshots_insert_scoped"
on public.weather_snapshots for insert
to authenticated
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "weather_snapshots_update_owner_admin" on public.weather_snapshots;
create policy "weather_snapshots_update_owner_admin"
on public.weather_snapshots for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "weather_snapshots_delete_owner_admin" on public.weather_snapshots;
create policy "weather_snapshots_delete_owner_admin"
on public.weather_snapshots for delete
to authenticated
using (public.can_manage_company(company_id));

drop trigger if exists set_weather_snapshots_updated_at on public.weather_snapshots;
create trigger set_weather_snapshots_updated_at
before update on public.weather_snapshots
for each row execute function public.set_updated_at();

create or replace function public.record_weather_snapshot_if_due(
  target_company_id uuid,
  target_greenhouse_id uuid,
  target_provider text,
  target_source_name text,
  target_latitude numeric default null,
  target_longitude numeric default null,
  target_temperature_c numeric default null,
  target_relative_humidity_percent numeric default null,
  target_today_min_temperature_c numeric default null,
  target_today_max_temperature_c numeric default null,
  target_precipitation_mm numeric default null,
  target_precipitation_probability_percent numeric default null,
  target_risk_label text default null,
  target_risk_tone text default null,
  target_raw_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_snapshot_id uuid;
  last_recorded_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.can_access_greenhouse(target_company_id, target_greenhouse_id) then
    raise exception 'not_authorized';
  end if;

  if not exists (
    select 1
    from public.greenhouses greenhouse
    where greenhouse.id = target_greenhouse_id
      and greenhouse.company_id = target_company_id
      and greenhouse.is_active = true
  ) then
    raise exception 'greenhouse_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_greenhouse_id::text, 0));

  select snapshot.recorded_at
  into last_recorded_at
  from public.weather_snapshots snapshot
  where snapshot.company_id = target_company_id
    and snapshot.greenhouse_id = target_greenhouse_id
  order by snapshot.recorded_at desc
  limit 1;

  if last_recorded_at is not null and last_recorded_at > now() - interval '90 minutes' then
    return null;
  end if;

  insert into public.weather_snapshots (
    company_id,
    greenhouse_id,
    provider,
    source_name,
    latitude,
    longitude,
    temperature_c,
    relative_humidity_percent,
    today_min_temperature_c,
    today_max_temperature_c,
    precipitation_mm,
    precipitation_probability_percent,
    risk_label,
    risk_tone,
    raw_payload,
    created_by
  )
  values (
    target_company_id,
    target_greenhouse_id,
    coalesce(nullif(trim(target_provider), ''), 'open-meteo'),
    coalesce(nullif(trim(target_source_name), ''), 'Open-Meteo'),
    target_latitude,
    target_longitude,
    target_temperature_c,
    target_relative_humidity_percent,
    target_today_min_temperature_c,
    target_today_max_temperature_c,
    target_precipitation_mm,
    target_precipitation_probability_percent,
    nullif(trim(target_risk_label), ''),
    target_risk_tone,
    coalesce(target_raw_payload, '{}'::jsonb),
    auth.uid()
  )
  returning id into new_snapshot_id;

  return new_snapshot_id;
end;
$$;

revoke all on function public.record_weather_snapshot_if_due(
  uuid,
  uuid,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  jsonb
) from public;

grant execute on function public.record_weather_snapshot_if_due(
  uuid,
  uuid,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  jsonb
) to authenticated;

create index if not exists weather_snapshots_greenhouse_recorded_idx
on public.weather_snapshots(company_id, greenhouse_id, recorded_at desc);

create index if not exists weather_snapshots_provider_recorded_idx
on public.weather_snapshots(provider, recorded_at desc);
