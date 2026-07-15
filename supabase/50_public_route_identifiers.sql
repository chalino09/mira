-- mira - 50 Public route identifiers
-- Ejecutar después de 49_formatted_numeric_costs.sql.
-- Agrega identificadores estables, seguros para URLs compartibles.

create or replace function public.route_slug(value text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(translate(coalesce(value, ''), 'áéíóúüñ', 'aeiouun')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'empresa'
  );
$$;

alter table public.companies
add column if not exists slug text;

with numbered_companies as (
  select
    id,
    public.route_slug(name) as base_slug,
    row_number() over (partition by public.route_slug(name) order by created_at, id) as duplicate_number
  from public.companies
)
update public.companies company
set slug = case
  when numbered_companies.duplicate_number = 1 then numbered_companies.base_slug
  else numbered_companies.base_slug || '-' || replace(left(company.id::text, 8), '-', '')
end
from numbered_companies
where company.id = numbered_companies.id
  and (company.slug is null or company.slug = '');

alter table public.companies
alter column slug set not null;

create unique index if not exists companies_slug_unique_idx
on public.companies(slug);

create or replace function public.assign_company_route_slug()
returns trigger
language plpgsql
as $$
declare
  base_slug text;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    new.slug := public.route_slug(new.slug);
    return new;
  end if;

  base_slug := public.route_slug(new.name);
  new.slug := base_slug;
  if exists (select 1 from public.companies where slug = base_slug and id is distinct from new.id) then
    new.slug := base_slug || '-' || replace(left(new.id::text, 8), '-', '');
  end if;
  return new;
end;
$$;

drop trigger if exists set_company_route_slug on public.companies;
create trigger set_company_route_slug
before insert on public.companies
for each row execute function public.assign_company_route_slug();

alter table public.greenhouses
add column if not exists public_id text;

alter table public.pest_alerts
add column if not exists public_id text;

alter table public.harvest_records
add column if not exists public_id text;

update public.greenhouses
set public_id = 'gh-' || replace(id::text, '-', '')
where public_id is null or public_id = '';

update public.pest_alerts
set public_id = 'pest-' || replace(id::text, '-', '')
where public_id is null or public_id = '';

update public.harvest_records
set public_id = 'lot-' || replace(id::text, '-', '')
where public_id is null or public_id = '';

alter table public.greenhouses alter column public_id set not null;
alter table public.pest_alerts alter column public_id set not null;
alter table public.harvest_records alter column public_id set not null;

create unique index if not exists greenhouses_company_public_id_unique_idx
on public.greenhouses(company_id, public_id);

create unique index if not exists pest_alerts_company_public_id_unique_idx
on public.pest_alerts(company_id, public_id);

create unique index if not exists harvest_records_company_public_id_unique_idx
on public.harvest_records(company_id, public_id);

create or replace function public.assign_route_public_id()
returns trigger
language plpgsql
as $$
declare
  prefix text;
begin
  if new.public_id is not null and btrim(new.public_id) <> '' then
    return new;
  end if;

  prefix := case tg_table_name
    when 'greenhouses' then 'gh'
    when 'pest_alerts' then 'pest'
    when 'harvest_records' then 'lot'
  end;
  new.public_id := prefix || '-' || replace(new.id::text, '-', '');
  return new;
end;
$$;

drop trigger if exists set_greenhouse_public_id on public.greenhouses;
create trigger set_greenhouse_public_id
before insert on public.greenhouses
for each row execute function public.assign_route_public_id();

drop trigger if exists set_pest_alert_public_id on public.pest_alerts;
create trigger set_pest_alert_public_id
before insert on public.pest_alerts
for each row execute function public.assign_route_public_id();

drop trigger if exists set_harvest_record_public_id on public.harvest_records;
create trigger set_harvest_record_public_id
before insert on public.harvest_records
for each row execute function public.assign_route_public_id();
