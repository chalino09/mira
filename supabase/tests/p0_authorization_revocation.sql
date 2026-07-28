-- Run after the complete Supabase SQL chain as a database owner.
-- Dependency-free authorization regression test (no pgTAP required).
-- The leading ROLLBACK makes it safe to rerun after a failed SQL-editor attempt.
rollback;
begin;

do $$
declare
  company_a uuid := '10000000-0000-0000-0000-000000000001';
  company_b uuid := '20000000-0000-0000-0000-000000000001';
  active_greenhouse uuid := '30000000-0000-0000-0000-000000000001';
  disabled_greenhouse uuid := '30000000-0000-0000-0000-000000000002';
  work_a uuid := '40000000-0000-0000-0000-000000000001';
  owner_id uuid := '50000000-0000-0000-0000-000000000001';
  admin_id uuid := '50000000-0000-0000-0000-000000000002';
  active_manager_id uuid := '50000000-0000-0000-0000-000000000003';
  disabled_manager_id uuid := '50000000-0000-0000-0000-000000000004';
  outsider_id uuid := '50000000-0000-0000-0000-000000000005';
  actor_id uuid;
  expected boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p0-owner@example.test', '', now(), '{}', '{}', now(), now()),
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p0-admin@example.test', '', now(), '{}', '{}', now(), now()),
    (active_manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p0-active@example.test', '', now(), '{}', '{}', now(), now()),
    (disabled_manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p0-disabled@example.test', '', now(), '{}', '{}', now(), now()),
    (outsider_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p0-outsider@example.test', '', now(), '{}', '{}', now(), now());
  insert into public.companies (id, name, created_by) values (company_a, 'P0 A', owner_id), (company_b, 'P0 B', outsider_id);

  if not exists (
    select 1 from public.company_members
    where company_id = company_a and user_id = owner_id and role = 'owner' and status = 'active'
  ) or not exists (
    select 1 from public.company_members
    where company_id = company_b and user_id = outsider_id and role = 'owner' and status = 'active'
  ) then
    raise exception 'Company creation did not provision its active owner membership';
  end if;

  insert into public.company_members (company_id, user_id, role, status) values
    (company_a, admin_id, 'admin', 'active'),
    (company_a, active_manager_id, 'manager', 'active'), (company_a, disabled_manager_id, 'manager', 'disabled');
  insert into public.greenhouses (id, company_id, name, manager_user_id) values
    (active_greenhouse, company_a, 'Activo', active_manager_id),
    (disabled_greenhouse, company_a, 'Desactivado', disabled_manager_id);
  insert into public.tasks (id, company_id, greenhouse_id, type, title, scheduled_date, responsible_user_id, created_by)
  values (work_a, company_a, disabled_greenhouse, 'riego', 'P0 work', current_date, disabled_manager_id, owner_id);
  insert into public.task_assignments (company_id, task_id, user_id) values
    (company_a, work_a, active_manager_id), (company_a, work_a, disabled_manager_id);

  foreach actor_id in array array[owner_id, admin_id, active_manager_id, disabled_manager_id, outsider_id] loop
    perform set_config('request.jwt.claim.sub', actor_id::text, true);
    expected := actor_id in (owner_id, admin_id, active_manager_id);
    if public.can_view_operational_task(work_a) is distinct from expected then raise exception 'Work visibility failed for %', actor_id; end if;
    if public.can_operate_work(work_a) is distinct from expected then raise exception 'Work operation failed for %', actor_id; end if;
  end loop;

  perform set_config('request.jwt.claim.sub', active_manager_id::text, true);
  if not public.can_access_greenhouse(company_a, active_greenhouse) then raise exception 'Active manager lost greenhouse access'; end if;
  perform set_config('request.jwt.claim.sub', disabled_manager_id::text, true);
  if public.can_access_greenhouse(company_a, disabled_greenhouse) then raise exception 'Disabled manager retained greenhouse access'; end if;
  if public.is_task_assignee(work_a) then raise exception 'Disabled manager retained Work assignment access'; end if;
  begin
    perform public.update_operational_task_status(work_a, 'bloqueada', 'P0 authorization check');
    raise exception 'Disabled manager invoked a Work RPC';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end
$$;

rollback;
