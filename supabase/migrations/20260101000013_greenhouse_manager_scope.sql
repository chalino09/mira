-- mira - 13 Greenhouse manager scope
-- Ejecutar después de 12_operation_technical_records.sql.
-- Limita a cada manager operativo al invernadero asignado en greenhouses.manager_user_id.

create or replace function public.can_access_greenhouse(
  target_company_id uuid,
  target_greenhouse_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.can_manage_company(target_company_id), false)
    or exists (
      select 1
      from public.greenhouses greenhouse
      where greenhouse.company_id = target_company_id
        and greenhouse.id = target_greenhouse_id
        and greenhouse.manager_user_id = auth.uid()
        and greenhouse.is_active = true
    )
$$;

create or replace function public.is_task_assignee(target_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.task_assignments assignment
    where assignment.task_id = target_task_id
      and assignment.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.tasks task
    join public.greenhouses greenhouse
      on greenhouse.id = task.greenhouse_id
     and greenhouse.company_id = task.company_id
    where task.id = target_task_id
      and greenhouse.manager_user_id = auth.uid()
      and greenhouse.is_active = true
  )
$$;

create or replace function public.can_view_operational_task(target_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks task
    where task.id = target_task_id
      and (
        public.can_manage_company(task.company_id)
        or task.responsible_user_id = auth.uid()
        or public.is_task_assignee(task.id)
        or public.can_access_greenhouse(task.company_id, task.greenhouse_id)
      )
  )
$$;

drop policy if exists "greenhouses_select_member" on public.greenhouses;
drop policy if exists "greenhouses_select_scoped" on public.greenhouses;
create policy "greenhouses_select_scoped"
on public.greenhouses for select
to authenticated
using (
  public.can_manage_company(company_id)
  or manager_user_id = auth.uid()
);

drop policy if exists "greenhouse_sectors_select_member" on public.greenhouse_sectors;
drop policy if exists "greenhouse_sectors_select_scoped" on public.greenhouse_sectors;
create policy "greenhouse_sectors_select_scoped"
on public.greenhouse_sectors for select
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "greenhouse_sectors_insert_writer" on public.greenhouse_sectors;
drop policy if exists "greenhouse_sectors_insert_scoped" on public.greenhouse_sectors;
create policy "greenhouse_sectors_insert_scoped"
on public.greenhouse_sectors for insert
to authenticated
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "greenhouse_sectors_update_writer" on public.greenhouse_sectors;
drop policy if exists "greenhouse_sectors_update_scoped" on public.greenhouse_sectors;
create policy "greenhouse_sectors_update_scoped"
on public.greenhouse_sectors for update
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id))
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "greenhouse_sectors_delete_owner_admin" on public.greenhouse_sectors;
create policy "greenhouse_sectors_delete_owner_admin"
on public.greenhouse_sectors for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "task_assignments_select_operational" on public.task_assignments;
create policy "task_assignments_select_operational"
on public.task_assignments for select
to authenticated
using (public.can_manage_company(company_id) or public.can_view_operational_task(task_id));

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'irrigation_records',
    'nutrition_records',
    'application_records',
    'pest_alerts',
    'harvest_records'
  ] loop
    execute format('drop policy if exists "%s_select_member" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s_select_scoped" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_select_scoped" on public.%I for select to authenticated using (public.can_access_greenhouse(company_id, greenhouse_id))',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_insert_writer" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s_insert_scoped" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_insert_scoped" on public.%I for insert to authenticated with check (public.can_access_greenhouse(company_id, greenhouse_id))',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s_update_writer" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s_update_scoped" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s_update_scoped" on public.%I for update to authenticated using (public.can_access_greenhouse(company_id, greenhouse_id)) with check (public.can_access_greenhouse(company_id, greenhouse_id))',
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

create index if not exists greenhouses_manager_user_id_idx
on public.greenhouses(manager_user_id);
