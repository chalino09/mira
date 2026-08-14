-- Regression: a technical task may be recorded directly from pendiente and
-- must persist both the technical record and the completed Work.
rollback;
begin;

do $$
declare
  test_company uuid := '81000000-0000-0000-0000-000000000001';
  test_greenhouse uuid := '82000000-0000-0000-0000-000000000001';
  owner_id uuid := '83000000-0000-0000-0000-000000000001';
  irrigation_work uuid := '84000000-0000-0000-0000-000000000001';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'overdue-recovery-owner@example.test', '', now(), '{}', '{}', now(), now());
  insert into public.companies (id, name, created_by) values (test_company, 'Overdue recovery test', owner_id);
  insert into public.greenhouses (id, company_id, name, manager_user_id) values (test_greenhouse, test_company, 'Invernadero de prueba', owner_id);
  insert into public.tasks (id, company_id, greenhouse_id, type, title, scheduled_date, status, responsible_user_id, created_by)
  values (irrigation_work, test_company, test_greenhouse, 'riego', 'Riego vencido recuperado', current_date - 1, 'pendiente', owner_id, owner_id);

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform public.complete_irrigation_task(irrigation_work, current_date, 20, 250, 'Sector A', null, null, 'Registro recuperado');

  if not exists (select 1 from public.tasks where id = irrigation_work and status = 'completada'::public.task_status and occurred_at::date = current_date) then
    raise exception 'A pending overdue irrigation work was not completed';
  end if;
  if not exists (select 1 from public.irrigation_records where source_task_id = irrigation_work and duration_min = 20 and estimated_liters = 250) then
    raise exception 'The irrigation technical record was rolled back';
  end if;
end
$$;

rollback;
