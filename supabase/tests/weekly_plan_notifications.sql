-- Run after the complete Supabase SQL chain as a database owner.
-- Dependency-free regression test for migration 20260727000000.
rollback;
begin;

do $$
declare
  test_company uuid := '61000000-0000-0000-0000-000000000001';
  test_greenhouse uuid := '62000000-0000-0000-0000-000000000001';
  test_plan uuid := '63000000-0000-0000-0000-000000000001';
  first_task uuid := '64000000-0000-0000-0000-000000000001';
  owner_id uuid := '65000000-0000-0000-0000-000000000001';
  manager_a uuid := '65000000-0000-0000-0000-000000000002';
  manager_b uuid := '65000000-0000-0000-0000-000000000003';
  result_count integer;
begin
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'weekly-owner@example.test', '', now(), '{}', '{}', now(), now()),
    (manager_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'weekly-a@example.test', '', now(), '{}', '{}', now(), now()),
    (manager_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'weekly-b@example.test', '', now(), '{}', '{}', now(), now());

  insert into public.companies (id, name, created_by)
  values (test_company, 'Weekly notifications test', owner_id);

  insert into public.company_members (company_id, user_id, role, status)
  values
    (test_company, owner_id, 'owner', 'active'),
    (test_company, manager_a, 'manager', 'active'),
    (test_company, manager_b, 'manager', 'active');

  insert into public.greenhouses (id, company_id, name, manager_user_id)
  values (test_greenhouse, test_company, 'Prueba semanal', manager_a);

  insert into public.weekly_plans (
    id,
    company_id,
    week_start,
    title,
    status,
    created_by,
    published_by,
    published_at
  )
  values (
    test_plan,
    test_company,
    current_date - extract(isodow from current_date)::integer + 1,
    'Semana de prueba',
    'published',
    owner_id,
    owner_id,
    now()
  );

  insert into public.tasks (
    id,
    company_id,
    greenhouse_id,
    weekly_plan_id,
    type,
    title,
    scheduled_date,
    responsible_user_id,
    created_by
  )
  values
    (first_task, test_company, test_greenhouse, test_plan, 'riego', 'Riego uno', current_date, manager_a, owner_id);

  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  -- Adding a task assignment after publication must queue that task.
  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  values (test_company, first_task, manager_a, owner_id);

  select count(*)
  into result_count
  from public.notification_outbox
  where task_id = first_task
    and user_id = manager_a
    and event_type = 'task_updated'
    and status = 'pending';

  if result_count <> 1 then
    raise exception 'Expected one notification for a newly assigned published task, got %', result_count;
  end if;

  -- Repeated inserts from legacy RPC code must not duplicate a pending event.
  insert into public.notification_outbox (
    company_id,
    user_id,
    task_id,
    weekly_plan_id,
    channel,
    event_type,
    payload
  )
  values (
    test_company,
    manager_a,
    first_task,
    test_plan,
    'telegram',
    'task_updated',
    jsonb_build_object('task_id', first_task)
  );

  select count(*)
  into result_count
  from public.notification_outbox
  where task_id = first_task
    and user_id = manager_a
    and event_type = 'task_updated'
    and status = 'pending';

  if result_count <> 1 then
    raise exception 'Pending task notification was duplicated';
  end if;

  -- Removing an assignee must cancel their pending delivery.
  delete from public.task_assignments
  where company_id = test_company
    and task_id = first_task
    and user_id = manager_a;

  if exists (
    select 1
    from public.notification_outbox
    where task_id = first_task
      and user_id = manager_a
      and status = 'pending'
  ) then
    raise exception 'Removed assignee retained a pending notification';
  end if;

  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  values (test_company, first_task, manager_b, owner_id);

  -- A later reassignment must cancel only the removed recipient.
  delete from public.task_assignments
  where company_id = test_company
    and task_id = first_task
    and user_id = manager_b;

  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  values (test_company, first_task, manager_a, owner_id);

  if exists (
    select 1
    from public.notification_outbox
    where task_id = first_task
      and user_id = manager_b
      and status = 'pending'
  ) then
    raise exception 'Previous assignee retained a pending weekly delivery';
  end if;

  if not exists (
    select 1
    from public.notification_outbox
    where task_id = first_task
      and user_id = manager_a
      and event_type = 'task_updated'
      and status = 'pending'
  ) then
    raise exception 'New assignee did not receive a pending task update';
  end if;
end
$$;

rollback;
