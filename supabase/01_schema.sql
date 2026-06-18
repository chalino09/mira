-- mira - 01 Schema
-- Ejecutar primero en Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'manager');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.member_status as enum ('invited', 'active', 'disabled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.crop_stage as enum ('vegetativo', 'floracion', 'cuajado', 'produccion', 'descanso');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.risk_level as enum ('baja', 'media', 'alta');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('pendiente', 'en_progreso', 'completada', 'cancelada');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_type as enum (
    'riego',
    'fertilizacion',
    'aplicacion_foliar',
    'revision_plagas',
    'poda',
    'tutoreo',
    'deshoje',
    'cosecha',
    'limpieza',
    'mantenimiento'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.application_category as enum (
    'bioestimulante',
    'fungicida',
    'insecticida',
    'fertilizante',
    'microorganismos',
    'corrector'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nutrition_method as enum ('fertirriego', 'foliar', 'drench');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.nutrition_objective as enum ('raiz', 'floracion', 'cuajado', 'engorde', 'calidad');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.cost_category as enum (
    'mano_obra',
    'fertilizantes',
    'agroinsumos',
    'agua',
    'energia',
    'plasticos',
    'mantenimiento',
    'transporte'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  address text,
  logo_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role public.member_role not null default 'manager',
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_members_user_or_invite check (user_id is not null or invited_email is not null),
  constraint company_members_unique_user unique (company_id, user_id),
  constraint company_members_unique_invite unique (company_id, invited_email)
);

create table if not exists public.greenhouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  location text,
  surface_m2 numeric(12,2),
  tomato_variety text,
  transplant_date date,
  plants_count integer not null default 0,
  beds_count integer,
  crop_stage public.crop_stage not null default 'vegetativo',
  manager_user_id uuid references auth.users(id),
  health_status public.risk_level not null default 'baja',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create table if not exists public.greenhouse_sectors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  name text not null,
  sector_type text not null default 'cama',
  order_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category public.application_category,
  composition text,
  default_dose text,
  safety_interval text,
  reentry_interval text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  sector_id uuid references public.greenhouse_sectors(id) on delete set null,
  type public.task_type not null,
  title text not null,
  scheduled_date date not null,
  scheduled_time time,
  status public.task_status not null default 'pendiente',
  responsible_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

create table if not exists public.irrigation_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  sector_id uuid references public.greenhouse_sectors(id) on delete set null,
  occurred_at date not null,
  duration_min integer not null,
  estimated_liters numeric(12,2) not null,
  ph numeric(4,2),
  ec numeric(5,2),
  notes text,
  responsible_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

create table if not exists public.nutrition_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  dose text not null,
  method public.nutrition_method not null,
  ph numeric(4,2),
  ec numeric(5,2),
  occurred_at date not null,
  crop_stage public.crop_stage,
  objective public.nutrition_objective,
  notes text,
  responsible_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

create table if not exists public.application_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  product_id uuid references public.products(id) on delete set null,
  category public.application_category not null,
  product_name text not null,
  composition text,
  dose text not null,
  applied_area text,
  safety_interval text,
  reentry_interval text,
  occurred_at date not null,
  notes text,
  responsible_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

create table if not exists public.pest_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  problem text not null,
  severity public.risk_level not null default 'baja',
  affected_zone text,
  detected_at date not null,
  action_taken text,
  follow_up text,
  photo_url text,
  is_resolved boolean not null default false,
  responsible_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

create table if not exists public.harvest_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  occurred_at date not null,
  kilograms numeric(12,2) not null,
  first_quality_kg numeric(12,2) not null default 0,
  second_quality_kg numeric(12,2) not null default 0,
  discard_kg numeric(12,2) not null default 0,
  estimated_price numeric(12,2),
  destination text,
  notes text,
  responsible_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

create table if not exists public.cost_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid,
  category public.cost_category not null,
  amount numeric(12,2) not null,
  occurred_at date not null,
  supplier text,
  invoice_reference text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete set null
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.company_members (company_id, user_id, role, status)
    values (new.id, new.created_by, 'owner', 'active')
    on conflict (company_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_company_created on public.companies;
create trigger on_company_created
after insert on public.companies
for each row execute function public.handle_new_company();

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'companies',
    'company_members',
    'greenhouses',
    'greenhouse_sectors',
    'products',
    'tasks',
    'irrigation_records',
    'nutrition_records',
    'application_records',
    'pest_alerts',
    'harvest_records',
    'cost_records'
  ] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

create index if not exists company_members_company_id_idx on public.company_members(company_id);
create index if not exists company_members_user_id_idx on public.company_members(user_id);
create index if not exists greenhouses_company_id_idx on public.greenhouses(company_id);
create index if not exists tasks_company_date_idx on public.tasks(company_id, scheduled_date);
create index if not exists irrigation_company_date_idx on public.irrigation_records(company_id, occurred_at);
create index if not exists nutrition_company_date_idx on public.nutrition_records(company_id, occurred_at);
create index if not exists applications_company_date_idx on public.application_records(company_id, occurred_at);
create index if not exists pest_company_date_idx on public.pest_alerts(company_id, detected_at);
create index if not exists harvest_company_date_idx on public.harvest_records(company_id, occurred_at);
create index if not exists costs_company_date_idx on public.cost_records(company_id, occurred_at);
