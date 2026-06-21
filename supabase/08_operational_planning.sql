-- mira - 08 Operational planning
-- Ejecutar después de 07_greenhouse_coordinates.sql.
-- Agrega planeación semanal, asignaciones múltiples, materiales, trazabilidad y cola de notificaciones.

do $$ begin
  create type public.weekly_plan_status as enum ('draft', 'published', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'normal', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.execution_mode as enum ('manager', 'crew', 'both');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_update_type as enum (
    'created',
    'assigned',
    'published',
    'acknowledged',
    'started',
    'blocked',
    'completed',
    'cancelled',
    'comment',
    'question',
    'answer'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_channel as enum ('telegram', 'whatsapp');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

alter type public.task_status add value if not exists 'bloqueada' before 'completada';
alter type public.task_type add value if not exists 'fertirriego' after 'riego';
alter type public.task_type add value if not exists 'otro';

create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  week_start date not null,
  title text,
  status public.weekly_plan_status not null default 'draft',
  notes text,
  created_by uuid references auth.users(id),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, week_start),
  unique (id, company_id)
);

alter table public.tasks
add column if not exists weekly_plan_id uuid,
add column if not exists priority public.task_priority not null default 'normal',
add column if not exists instructions text,
add column if not exists execution_mode public.execution_mode not null default 'crew',
add column if not exists crew_size integer,
add column if not exists blocked_reason text,
add column if not exists started_at timestamptz,
add column if not exists completed_at timestamptz;

do $$ begin
  alter table public.tasks
  add constraint tasks_id_company_unique unique (id, company_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
  add constraint tasks_weekly_plan_company_fk
  foreign key (weekly_plan_id, company_id)
  references public.weekly_plans(id, company_id)
  on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
  add constraint tasks_crew_size_check check (crew_size is null or crew_size >= 0);
exception when duplicate_object then null;
end $$;

create table if not exists public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, user_id),
  foreign key (task_id, company_id)
    references public.tasks(id, company_id)
    on delete cascade
);

create table if not exists public.task_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  dose text,
  unit text,
  mixing_order integer,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (task_id, company_id)
    references public.tasks(id, company_id)
    on delete cascade
);

create table if not exists public.task_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null,
  actor_user_id uuid references auth.users(id),
  update_type public.task_update_type not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (task_id, company_id)
    references public.tasks(id, company_id)
    on delete cascade
);

create table if not exists public.notification_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel public.notification_channel not null,
  external_chat_id text,
  verification_code_hash text,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, channel)
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  weekly_plan_id uuid references public.weekly_plans(id) on delete cascade,
  channel public.notification_channel not null default 'telegram',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  status public.notification_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

drop trigger if exists set_weekly_plans_updated_at on public.weekly_plans;
create trigger set_weekly_plans_updated_at
before update on public.weekly_plans
for each row execute function public.set_updated_at();

drop trigger if exists set_notification_connections_updated_at on public.notification_connections;
create trigger set_notification_connections_updated_at
before update on public.notification_connections
for each row execute function public.set_updated_at();

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
      )
  )
$$;

alter table public.weekly_plans enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_materials enable row level security;
alter table public.task_updates enable row level security;
alter table public.notification_connections enable row level security;
alter table public.notification_outbox enable row level security;

drop policy if exists "tasks_select_member" on public.tasks;
drop policy if exists "tasks_insert_writer" on public.tasks;
drop policy if exists "tasks_update_writer" on public.tasks;
drop policy if exists "tasks_delete_owner_admin" on public.tasks;

create policy "tasks_select_operational"
on public.tasks for select
to authenticated
using (
  public.can_manage_company(company_id)
  or responsible_user_id = auth.uid()
  or public.is_task_assignee(id)
);

create policy "tasks_insert_managerial"
on public.tasks for insert
to authenticated
with check (public.can_manage_company(company_id));

create policy "tasks_update_managerial"
on public.tasks for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

create policy "tasks_delete_managerial"
on public.tasks for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "weekly_plans_select_operational" on public.weekly_plans;
create policy "weekly_plans_select_operational"
on public.weekly_plans for select
to authenticated
using (
  public.can_manage_company(company_id)
  or exists (
    select 1
    from public.tasks task
    where task.weekly_plan_id = weekly_plans.id
      and (
        task.responsible_user_id = auth.uid()
        or public.is_task_assignee(task.id)
      )
  )
);

drop policy if exists "weekly_plans_write_managerial" on public.weekly_plans;
create policy "weekly_plans_write_managerial"
on public.weekly_plans for all
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "task_assignments_select_operational" on public.task_assignments;
create policy "task_assignments_select_operational"
on public.task_assignments for select
to authenticated
using (public.can_manage_company(company_id) or user_id = auth.uid());

drop policy if exists "task_assignments_write_managerial" on public.task_assignments;
create policy "task_assignments_write_managerial"
on public.task_assignments for all
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "task_materials_select_operational" on public.task_materials;
create policy "task_materials_select_operational"
on public.task_materials for select
to authenticated
using (public.can_view_operational_task(task_id));

drop policy if exists "task_materials_write_managerial" on public.task_materials;
create policy "task_materials_write_managerial"
on public.task_materials for all
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "task_updates_select_operational" on public.task_updates;
create policy "task_updates_select_operational"
on public.task_updates for select
to authenticated
using (public.can_view_operational_task(task_id));

drop policy if exists "task_updates_insert_managerial" on public.task_updates;
create policy "task_updates_insert_managerial"
on public.task_updates for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "notification_connections_select_own" on public.notification_connections;
create policy "notification_connections_select_own"
on public.notification_connections for select
to authenticated
using (user_id = auth.uid() or public.can_manage_company(company_id));

drop policy if exists "notification_connections_write_own" on public.notification_connections;
create policy "notification_connections_write_own"
on public.notification_connections for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and public.is_company_member(company_id));

drop policy if exists "notification_outbox_select_operational" on public.notification_outbox;
create policy "notification_outbox_select_operational"
on public.notification_outbox for select
to authenticated
using (user_id = auth.uid() or public.can_manage_company(company_id));

create or replace function public.acknowledge_operational_task(target_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_responsible_user_id uuid;
begin
  select company_id, responsible_user_id into target_company_id, target_responsible_user_id
  from public.tasks
  where id = target_task_id;

  if target_company_id is null then
    raise exception 'task_not_found';
  end if;

  if not public.can_manage_company(target_company_id)
    and not public.is_task_assignee(target_task_id)
    and target_responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;

  update public.task_assignments
  set acknowledged_at = coalesce(acknowledged_at, now())
  where task_id = target_task_id
    and (user_id = auth.uid() or public.can_manage_company(target_company_id));

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type)
  values (target_company_id, target_task_id, auth.uid(), 'acknowledged');
end;
$$;

create or replace function public.create_operational_task(
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
  target_materials jsonb default '[]'::jsonb
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

  if coalesce(cardinality(target_assignee_ids), 0) = 0 then
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
    created_by
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
    target_assignee_ids[1],
    auth.uid()
  )
  returning id into new_task_id;

  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  select target_company_id, new_task_id, assignee_id, auth.uid()
  from unnest(target_assignee_ids) assignee_id;

  insert into public.task_materials (
    company_id,
    task_id,
    product_name,
    dose,
    unit,
    mixing_order,
    notes
  )
  select
    target_company_id,
    new_task_id,
    trim(material->>'productName'),
    nullif(trim(material->>'dose'), ''),
    nullif(trim(material->>'unit'), ''),
    coalesce((material->>'mixingOrder')::integer, material_index::integer),
    nullif(trim(material->>'notes'), '')
  from jsonb_array_elements(target_materials) with ordinality as items(material, material_index)
  where nullif(trim(material->>'productName'), '') is not null;

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
    jsonb_build_object('assignee_count', cardinality(target_assignee_ids))
  );

  return new_task_id;
end;
$$;

create or replace function public.update_operational_task_status(
  target_task_id uuid,
  next_status text,
  update_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_responsible_user_id uuid;
  update_kind public.task_update_type;
begin
  select company_id, responsible_user_id into target_company_id, target_responsible_user_id
  from public.tasks
  where id = target_task_id;

  if target_company_id is null then
    raise exception 'task_not_found';
  end if;

  if not public.can_manage_company(target_company_id)
    and not public.is_task_assignee(target_task_id)
    and target_responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;

  if not public.can_manage_company(target_company_id)
    and public.is_task_assignee(target_task_id)
    and not exists (
      select 1
      from public.task_assignments assignment
      where assignment.task_id = target_task_id
        and assignment.user_id = auth.uid()
        and assignment.acknowledged_at is not null
    ) then
    raise exception 'task_not_acknowledged';
  end if;

  if next_status not in ('en_progreso', 'bloqueada', 'completada', 'cancelada') then
    raise exception 'invalid_task_status';
  end if;

  if next_status = 'bloqueada' and nullif(trim(update_note), '') is null then
    raise exception 'blocked_reason_required';
  end if;

  update public.tasks
  set status = next_status::public.task_status,
      blocked_reason = case when next_status = 'bloqueada' then nullif(trim(update_note), '') else null end,
      started_at = case when next_status = 'en_progreso' then coalesce(started_at, now()) else started_at end,
      completed_at = case when next_status = 'completada' then now() else null end
  where id = target_task_id;

  update_kind := case next_status
    when 'en_progreso' then 'started'::public.task_update_type
    when 'bloqueada' then 'blocked'::public.task_update_type
    when 'completada' then 'completed'::public.task_update_type
    else 'cancelled'::public.task_update_type
  end;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note)
  values (target_company_id, target_task_id, auth.uid(), update_kind, nullif(trim(update_note), ''));
end;
$$;

create or replace function public.update_operational_task(
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
  target_materials jsonb default '[]'::jsonb
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

  if coalesce(cardinality(target_assignee_ids), 0) = 0 then
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
      responsible_user_id = target_assignee_ids[1]
  where id = target_task_id;

  delete from public.task_assignments where task_id = target_task_id;
  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  select target_company_id, target_task_id, assignee_id, auth.uid()
  from unnest(target_assignee_ids) assignee_id;

  delete from public.task_materials where task_id = target_task_id;
  insert into public.task_materials (
    company_id,
    task_id,
    product_name,
    dose,
    unit,
    mixing_order,
    notes
  )
  select
    target_company_id,
    target_task_id,
    trim(material->>'productName'),
    nullif(trim(material->>'dose'), ''),
    nullif(trim(material->>'unit'), ''),
    coalesce((material->>'mixingOrder')::integer, material_index::integer),
    nullif(trim(material->>'notes'), '')
  from jsonb_array_elements(target_materials) with ordinality as items(material, material_index)
  where nullif(trim(material->>'productName'), '') is not null;

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

create or replace function public.publish_weekly_plan(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  current_plan_status public.weekly_plan_status;
begin
  select company_id, status into target_company_id, current_plan_status
  from public.weekly_plans
  where id = target_plan_id;

  if target_company_id is null then
    raise exception 'plan_not_found';
  end if;

  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if current_plan_status = 'published' then
    return;
  end if;

  update public.weekly_plans
  set status = 'published',
      published_by = auth.uid(),
      published_at = now()
  where id = target_plan_id;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type)
  select task.company_id, task.id, auth.uid(), 'published'
  from public.tasks task
  where task.weekly_plan_id = target_plan_id;

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
    assignment.task_id,
    target_plan_id,
    'telegram',
    'weekly_plan_published',
    jsonb_build_object('weekly_plan_id', target_plan_id)
  from public.task_assignments assignment
  join public.tasks task on task.id = assignment.task_id
  where task.weekly_plan_id = target_plan_id;
end;
$$;

revoke all on function public.acknowledge_operational_task(uuid) from public;
revoke all on function public.create_operational_task(
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
  jsonb
) from public;
revoke all on function public.update_operational_task_status(uuid, text, text) from public;
revoke all on function public.update_operational_task(
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
  jsonb
) from public;
revoke all on function public.publish_weekly_plan(uuid) from public;

grant execute on function public.acknowledge_operational_task(uuid) to authenticated;
grant execute on function public.create_operational_task(
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
  jsonb
) to authenticated;
grant execute on function public.update_operational_task_status(uuid, text, text) to authenticated;
grant execute on function public.update_operational_task(
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
  jsonb
) to authenticated;
grant execute on function public.publish_weekly_plan(uuid) to authenticated;

create index if not exists weekly_plans_company_week_idx on public.weekly_plans(company_id, week_start);
create index if not exists tasks_weekly_plan_idx on public.tasks(weekly_plan_id, scheduled_date);
create index if not exists task_assignments_user_idx on public.task_assignments(user_id, task_id);
create index if not exists task_materials_task_idx on public.task_materials(task_id, mixing_order);
create index if not exists task_updates_task_date_idx on public.task_updates(task_id, created_at desc);
create index if not exists notification_outbox_pending_idx on public.notification_outbox(status, scheduled_for);
