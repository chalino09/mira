-- mira - 35 Internal operational staff
-- Ejecutar despues de 34_pest_alert_followup_history.sql.
-- Agrega encargados internos sin cuenta Auth para planeacion operativa por empresa.

create table if not exists public.company_staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  phone text,
  role public.member_role not null default 'manager',
  status text not null default 'active' check (status in ('active', 'disabled')),
  linked_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create unique index if not exists company_staff_company_name_idx
on public.company_staff(company_id, lower(trim(full_name)))
where status = 'active';

create unique index if not exists company_staff_company_linked_user_idx
on public.company_staff(company_id, linked_user_id)
where linked_user_id is not null;

drop trigger if exists set_company_staff_updated_at on public.company_staff;
create trigger set_company_staff_updated_at
before update on public.company_staff
for each row execute function public.set_updated_at();

alter table public.greenhouses
add column if not exists manager_staff_id uuid;

do $$ begin
  alter table public.greenhouses
  add constraint greenhouses_manager_staff_company_fk
  foreign key (manager_staff_id, company_id)
  references public.company_staff(id, company_id);
exception when duplicate_object then null;
end $$;

create table if not exists public.task_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null,
  staff_id uuid not null,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (task_id, staff_id),
  foreign key (task_id, company_id)
    references public.tasks(id, company_id)
    on delete cascade,
  foreign key (staff_id, company_id)
    references public.company_staff(id, company_id)
);

alter table public.task_materials
add column if not exists composition text;

alter table public.company_staff enable row level security;
alter table public.task_staff_assignments enable row level security;

drop policy if exists "company_staff_select_member" on public.company_staff;
create policy "company_staff_select_member"
on public.company_staff for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "company_staff_insert_managerial" on public.company_staff;
create policy "company_staff_insert_managerial"
on public.company_staff for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "company_staff_update_managerial" on public.company_staff;
create policy "company_staff_update_managerial"
on public.company_staff for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "company_staff_delete_managerial" on public.company_staff;
create policy "company_staff_delete_managerial"
on public.company_staff for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "task_staff_assignments_select_operational" on public.task_staff_assignments;
create policy "task_staff_assignments_select_operational"
on public.task_staff_assignments for select
to authenticated
using (public.can_manage_company(company_id) or public.can_view_operational_task(task_id));

drop policy if exists "task_staff_assignments_insert_managerial" on public.task_staff_assignments;
create policy "task_staff_assignments_insert_managerial"
on public.task_staff_assignments for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "task_staff_assignments_update_managerial" on public.task_staff_assignments;
create policy "task_staff_assignments_update_managerial"
on public.task_staff_assignments for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "task_staff_assignments_delete_managerial" on public.task_staff_assignments;
create policy "task_staff_assignments_delete_managerial"
on public.task_staff_assignments for delete
to authenticated
using (public.can_manage_company(company_id));

create or replace function public.create_operational_task_with_staff(
  target_company_id uuid,
  target_week_start date,
  target_greenhouse_id uuid,
  target_type public.task_type,
  target_title text,
  target_scheduled_date date,
  target_scheduled_time time default null,
  target_priority public.task_priority default 'normal',
  target_instructions text default null,
  target_execution_mode public.execution_mode default 'crew',
  target_crew_size integer default null,
  target_assignee_ids uuid[] default array[]::uuid[],
  target_staff_assignee_ids uuid[] default array[]::uuid[],
  target_materials jsonb default '[]'::jsonb,
  target_technical_plan jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan_id uuid;
  new_task_id uuid;
begin
  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if nullif(trim(target_title), '') is null then
    raise exception 'task_title_required';
  end if;

  if target_scheduled_date < target_week_start
    or target_scheduled_date > target_week_start + 6 then
    raise exception 'task_outside_week';
  end if;

  if target_crew_size is not null and target_crew_size < 0 then
    raise exception 'crew_size_invalid';
  end if;

  if coalesce(cardinality(target_assignee_ids), 0) = 0
    and coalesce(cardinality(target_staff_assignee_ids), 0) = 0 then
    raise exception 'assignee_required';
  end if;

  if exists (
    select 1
    from unnest(target_assignee_ids) requested_user_id
    where not exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = requested_user_id
        and member.role = 'manager'
        and member.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  if exists (
    select 1
    from unnest(target_staff_assignee_ids) requested_staff_id
    where not exists (
      select 1
      from public.company_staff staff
      where staff.company_id = target_company_id
        and staff.id = requested_staff_id
        and staff.role = 'manager'
        and staff.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  insert into public.weekly_plans (company_id, week_start, title, created_by)
  values (
    target_company_id,
    target_week_start,
    'Semana ' || to_char(target_week_start, 'IYYY-IW'),
    auth.uid()
  )
  on conflict (company_id, week_start) do update
    set updated_at = now()
  returning id into target_plan_id;

  insert into public.tasks (
    company_id,
    greenhouse_id,
    weekly_plan_id,
    type,
    title,
    scheduled_date,
    scheduled_time,
    status,
    priority,
    instructions,
    execution_mode,
    crew_size,
    responsible_user_id,
    created_by,
    technical_plan
  )
  values (
    target_company_id,
    target_greenhouse_id,
    target_plan_id,
    target_type,
    trim(target_title),
    target_scheduled_date,
    target_scheduled_time,
    'pendiente',
    target_priority,
    nullif(trim(target_instructions), ''),
    target_execution_mode,
    target_crew_size,
    case when coalesce(cardinality(target_assignee_ids), 0) > 0 then target_assignee_ids[1] else null end,
    auth.uid(),
    coalesce(target_technical_plan, '{}'::jsonb)
  )
  returning id into new_task_id;

  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  select target_company_id, new_task_id, assignee_id, auth.uid()
  from unnest(target_assignee_ids) assignee_id;

  insert into public.task_staff_assignments (company_id, task_id, staff_id, assigned_by)
  select target_company_id, new_task_id, staff_id, auth.uid()
  from unnest(target_staff_assignee_ids) staff_id;

  insert into public.task_materials (
    company_id,
    task_id,
    product_id,
    product_name,
    composition,
    dose,
    unit,
    mixing_order,
    notes
  )
  select
    target_company_id,
    new_task_id,
    product.id,
    trim(coalesce(nullif(material->>'productName', ''), product.name)),
    coalesce(nullif(trim(material->>'composition'), ''), product.composition),
    nullif(trim(material->>'dose'), ''),
    nullif(trim(material->>'unit'), ''),
    coalesce((material->>'mixingOrder')::integer, material_index::integer),
    nullif(trim(material->>'notes'), '')
  from jsonb_array_elements(target_materials) with ordinality as items(material, material_index)
  left join public.products product
    on product.id = nullif(material->>'productId', '')::uuid
    and product.company_id = target_company_id
  where nullif(trim(coalesce(nullif(material->>'productName', ''), product.name)), '') is not null;

  insert into public.task_updates (
    company_id,
    task_id,
    actor_user_id,
    update_type,
    metadata
  )
  values (
    target_company_id,
    new_task_id,
    auth.uid(),
    'created',
    jsonb_build_object(
      'assignee_count', cardinality(target_assignee_ids),
      'staff_assignee_count', cardinality(target_staff_assignee_ids)
    )
  );

  return new_task_id;
end;
$$;

create or replace function public.update_operational_task_with_staff(
  target_task_id uuid,
  target_greenhouse_id uuid,
  target_type public.task_type,
  target_title text,
  target_scheduled_date date,
  target_scheduled_time time default null,
  target_priority public.task_priority default 'normal',
  target_instructions text default null,
  target_execution_mode public.execution_mode default 'crew',
  target_crew_size integer default null,
  target_assignee_ids uuid[] default array[]::uuid[],
  target_staff_assignee_ids uuid[] default array[]::uuid[],
  target_materials jsonb default '[]'::jsonb,
  target_technical_plan jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_plan_id uuid;
  target_week_start date;
  plan_is_published boolean := false;
begin
  select task.company_id, task.weekly_plan_id, plan.week_start, plan.status = 'published'
  into target_company_id, target_plan_id, target_week_start, plan_is_published
  from public.tasks task
  left join public.weekly_plans plan on plan.id = task.weekly_plan_id
  where task.id = target_task_id;

  if target_company_id is null then
    raise exception 'task_not_found';
  end if;

  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if nullif(trim(target_title), '') is null then
    raise exception 'task_title_required';
  end if;

  if target_week_start is not null
    and (target_scheduled_date < target_week_start or target_scheduled_date > target_week_start + 6) then
    raise exception 'task_outside_week';
  end if;

  if target_crew_size is not null and target_crew_size < 0 then
    raise exception 'crew_size_invalid';
  end if;

  if coalesce(cardinality(target_assignee_ids), 0) = 0
    and coalesce(cardinality(target_staff_assignee_ids), 0) = 0 then
    raise exception 'assignee_required';
  end if;

  if exists (
    select 1
    from unnest(target_assignee_ids) requested_user_id
    where not exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = requested_user_id
        and member.role = 'manager'
        and member.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  if exists (
    select 1
    from unnest(target_staff_assignee_ids) requested_staff_id
    where not exists (
      select 1
      from public.company_staff staff
      where staff.company_id = target_company_id
        and staff.id = requested_staff_id
        and staff.role = 'manager'
        and staff.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  update public.tasks
  set greenhouse_id = target_greenhouse_id,
      type = target_type,
      title = trim(target_title),
      scheduled_date = target_scheduled_date,
      scheduled_time = target_scheduled_time,
      priority = target_priority,
      instructions = nullif(trim(target_instructions), ''),
      execution_mode = target_execution_mode,
      crew_size = target_crew_size,
      responsible_user_id = case when coalesce(cardinality(target_assignee_ids), 0) > 0 then target_assignee_ids[1] else null end,
      technical_plan = coalesce(target_technical_plan, '{}'::jsonb),
      updated_at = now()
  where id = target_task_id;

  delete from public.task_assignments where task_id = target_task_id;
  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  select target_company_id, target_task_id, assignee_id, auth.uid()
  from unnest(target_assignee_ids) assignee_id;

  delete from public.task_staff_assignments where task_id = target_task_id;
  insert into public.task_staff_assignments (company_id, task_id, staff_id, assigned_by)
  select target_company_id, target_task_id, staff_id, auth.uid()
  from unnest(target_staff_assignee_ids) staff_id;

  delete from public.task_materials where task_id = target_task_id;
  insert into public.task_materials (
    company_id,
    task_id,
    product_id,
    product_name,
    composition,
    dose,
    unit,
    mixing_order,
    notes
  )
  select
    target_company_id,
    target_task_id,
    product.id,
    trim(coalesce(nullif(material->>'productName', ''), product.name)),
    coalesce(nullif(trim(material->>'composition'), ''), product.composition),
    nullif(trim(material->>'dose'), ''),
    nullif(trim(material->>'unit'), ''),
    coalesce((material->>'mixingOrder')::integer, material_index::integer),
    nullif(trim(material->>'notes'), '')
  from jsonb_array_elements(target_materials) with ordinality as items(material, material_index)
  left join public.products product
    on product.id = nullif(material->>'productId', '')::uuid
    and product.company_id = target_company_id
  where nullif(trim(coalesce(nullif(material->>'productName', ''), product.name)), '') is not null;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note)
  values (target_company_id, target_task_id, auth.uid(), 'comment', 'Actividad actualizada');

  if plan_is_published then
    insert into public.notification_outbox (
      company_id,
      user_id,
      task_id,
      weekly_plan_id,
      channel,
      event_type,
      payload
    )
    select
      assignment.company_id,
      assignment.user_id,
      target_task_id,
      target_plan_id,
      'telegram',
      'task_updated',
      jsonb_build_object('task_id', target_task_id)
    from public.task_assignments assignment
    where assignment.task_id = target_task_id;
  end if;
end;
$$;

revoke all on function public.create_operational_task_with_staff(
  uuid,
  date,
  uuid,
  public.task_type,
  text,
  date,
  time,
  public.task_priority,
  text,
  public.execution_mode,
  integer,
  uuid[],
  uuid[],
  jsonb,
  jsonb
) from public;
revoke all on function public.update_operational_task_with_staff(
  uuid,
  uuid,
  public.task_type,
  text,
  date,
  time,
  public.task_priority,
  text,
  public.execution_mode,
  integer,
  uuid[],
  uuid[],
  jsonb,
  jsonb
) from public;

grant execute on function public.create_operational_task_with_staff(
  uuid,
  date,
  uuid,
  public.task_type,
  text,
  date,
  time,
  public.task_priority,
  text,
  public.execution_mode,
  integer,
  uuid[],
  uuid[],
  jsonb,
  jsonb
) to authenticated;
grant execute on function public.update_operational_task_with_staff(
  uuid,
  uuid,
  public.task_type,
  text,
  date,
  time,
  public.task_priority,
  text,
  public.execution_mode,
  integer,
  uuid[],
  uuid[],
  jsonb,
  jsonb
) to authenticated;

create index if not exists company_staff_company_status_idx
on public.company_staff(company_id, status, full_name);

create index if not exists greenhouses_manager_staff_id_idx
on public.greenhouses(manager_staff_id);

create index if not exists task_staff_assignments_task_idx
on public.task_staff_assignments(task_id, staff_id);

create index if not exists task_staff_assignments_staff_idx
on public.task_staff_assignments(staff_id, task_id);
