-- mira - 02 Row Level Security
-- Ejecutar después de 01_schema.sql.

create or replace function public.current_user_role(target_company_id uuid)
returns public.member_role
language sql
security definer
stable
set search_path = public
as $$
  select cm.role
  from public.company_members cm
  where cm.company_id = target_company_id
    and cm.user_id = auth.uid()
    and cm.status = 'active'
  limit 1
$$;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  )
$$;

create or replace function public.can_manage_company(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_user_role(target_company_id) in ('owner', 'admin'), false)
$$;

create or replace function public.can_write_company(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.current_user_role(target_company_id) in ('owner', 'admin', 'manager'), false)
$$;

create or replace function public.shares_company_with(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members me
    join public.company_members other_member
      on other_member.company_id = me.company_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and other_member.user_id = target_user_id
      and other_member.status = 'active'
  )
$$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.greenhouses enable row level security;
alter table public.greenhouse_sectors enable row level security;
alter table public.products enable row level security;
alter table public.tasks enable row level security;
alter table public.irrigation_records enable row level security;
alter table public.nutrition_records enable row level security;
alter table public.application_records enable row level security;
alter table public.pest_alerts enable row level security;
alter table public.harvest_records enable row level security;
alter table public.cost_records enable row level security;

drop policy if exists "profiles_select_same_company" on public.profiles;
create policy "profiles_select_same_company"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.shares_company_with(id));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member"
on public.companies for select
to authenticated
using (public.is_company_member(id));

drop policy if exists "companies_insert_authenticated" on public.companies;
create policy "companies_insert_authenticated"
on public.companies for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "companies_update_owner_admin" on public.companies;
create policy "companies_update_owner_admin"
on public.companies for update
to authenticated
using (public.can_manage_company(id))
with check (public.can_manage_company(id));

drop policy if exists "companies_delete_owner_admin" on public.companies;
create policy "companies_delete_owner_admin"
on public.companies for delete
to authenticated
using (public.can_manage_company(id));

drop policy if exists "company_members_select_member" on public.company_members;
create policy "company_members_select_member"
on public.company_members for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "company_members_insert_owner_admin" on public.company_members;
create policy "company_members_insert_owner_admin"
on public.company_members for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "company_members_update_owner_admin" on public.company_members;
create policy "company_members_update_owner_admin"
on public.company_members for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "company_members_delete_owner_admin" on public.company_members;
create policy "company_members_delete_owner_admin"
on public.company_members for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "greenhouses_select_member" on public.greenhouses;
create policy "greenhouses_select_member"
on public.greenhouses for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "greenhouses_insert_writer" on public.greenhouses;
create policy "greenhouses_insert_writer"
on public.greenhouses for insert
to authenticated
with check (public.can_write_company(company_id));

drop policy if exists "greenhouses_update_writer" on public.greenhouses;
create policy "greenhouses_update_writer"
on public.greenhouses for update
to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "greenhouses_delete_owner_admin" on public.greenhouses;
create policy "greenhouses_delete_owner_admin"
on public.greenhouses for delete
to authenticated
using (public.can_manage_company(company_id));

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
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
    execute format('drop policy if exists "%s_select_member" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_select_member" on public.%I for select to authenticated using (public.is_company_member(company_id))',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_insert_writer" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_insert_writer" on public.%I for insert to authenticated with check (public.can_write_company(company_id))',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_update_writer" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_update_writer" on public.%I for update to authenticated using (public.can_write_company(company_id)) with check (public.can_write_company(company_id))',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_delete_owner_admin" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_delete_owner_admin" on public.%I for delete to authenticated using (public.can_manage_company(company_id))',
      table_name,
      table_name
    );
  end loop;
end $$;
