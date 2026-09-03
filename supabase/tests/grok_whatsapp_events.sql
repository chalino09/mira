-- Regression: Grok callbacks are idempotent and preserve the human actor.
rollback;
begin;

do $$
declare
  test_company uuid := '91000000-0000-0000-0000-000000000001';
  test_greenhouse uuid := '92000000-0000-0000-0000-000000000001';
  test_plan uuid := '93000000-0000-0000-0000-000000000001';
  owner_id uuid := '94000000-0000-0000-0000-000000000001';
  manager_id uuid := '94000000-0000-0000-0000-000000000002';
  staff_id uuid := '95000000-0000-0000-0000-000000000001';
  reply_work uuid := '96000000-0000-0000-0000-000000000001';
  staff_work uuid := '96000000-0000-0000-0000-000000000002';
  irrigation_work uuid := '96000000-0000-0000-0000-000000000003';
  application_work uuid := '96000000-0000-0000-0000-000000000004';
  reply_dispatch uuid := '97000000-0000-0000-0000-000000000001';
  staff_dispatch uuid := '97000000-0000-0000-0000-000000000002';
  irrigation_dispatch uuid := '97000000-0000-0000-0000-000000000003';
  application_dispatch uuid := '97000000-0000-0000-0000-000000000004';
  application_product uuid := '98000000-0000-0000-0000-000000000001';
  reply_token text := repeat('1', 64);
  staff_token text := repeat('2', 64);
  irrigation_token text := repeat('3', 64);
  application_token text := repeat('4', 64);
  answer_count integer;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grok-owner@example.test', '', now(), '{}', '{}', now(), now()),
    (manager_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'grok-manager@example.test', '', now(), '{}', '{}', now(), now());

  update public.profiles set phone = '+524521111111' where id = manager_id;
  insert into public.companies (id, name, created_by) values (test_company, 'Grok callback test', owner_id);
  insert into public.company_members (company_id, user_id, role, status) values
    (test_company, owner_id, 'owner', 'active'),
    (test_company, manager_id, 'manager', 'active')
  on conflict (company_id, user_id) do update
  set role = excluded.role,
      status = excluded.status;
  insert into public.company_staff (id, company_id, full_name, phone, role, status, created_by)
  values (staff_id, test_company, 'Encargado interno', '+524522222222', 'manager', 'active', owner_id);
  insert into public.greenhouses (id, company_id, name, manager_user_id)
  values (test_greenhouse, test_company, 'Invernadero Grok', manager_id);
  insert into public.weekly_plans (id, company_id, week_start, status, created_by, published_by, published_at)
  values (test_plan, test_company, current_date - extract(isodow from current_date)::integer + 1, 'published', owner_id, owner_id, now());
  insert into public.products (id, company_id, name, category, composition)
  values (application_product, test_company, 'Producto de prueba', 'fungicida', 'Ingrediente de prueba');

  insert into public.tasks (
    id, company_id, greenhouse_id, weekly_plan_id, type, title, scheduled_date, status, responsible_user_id, created_by
  ) values
    (reply_work, test_company, test_greenhouse, test_plan, 'limpieza', 'Responder limpieza', current_date, 'pendiente', manager_id, owner_id),
    (staff_work, test_company, test_greenhouse, test_plan, 'limpieza', 'Completar limpieza', current_date, 'pendiente', null, owner_id),
    (irrigation_work, test_company, test_greenhouse, test_plan, 'riego', 'Completar riego', current_date, 'pendiente', manager_id, owner_id),
    (application_work, test_company, test_greenhouse, test_plan, 'aplicacion_foliar', 'Completar aplicación', current_date, 'pendiente', manager_id, owner_id);

  insert into public.task_assignments (company_id, task_id, user_id, assigned_by) values
    (test_company, reply_work, manager_id, owner_id),
    (test_company, irrigation_work, manager_id, owner_id),
    (test_company, application_work, manager_id, owner_id);
  insert into public.task_staff_assignments (company_id, task_id, staff_id, assigned_by)
  values (test_company, staff_work, staff_id, owner_id);
  insert into public.task_materials (
    company_id, task_id, product_id, product_name, composition, dose, unit, mixing_order
  ) values (
    test_company, application_work, application_product, 'Producto de prueba', 'Ingrediente de prueba', '2', 'ml/L', 1
  );

  insert into public.agent_dispatches (
    id, company_id, work_id, weekly_plan_id, recipient_user_id, recipient_staff_id,
    recipient_name, recipient_phone, event_type, dedupe_key, status, callback_token_hash
  ) values
    (reply_dispatch, test_company, reply_work, test_plan, manager_id, null, 'Manager', '+524521111111', 'work_assigned', 'reply', 'sent', encode(extensions.digest(convert_to(reply_token, 'UTF8'), 'sha256'), 'hex')),
    (staff_dispatch, test_company, staff_work, test_plan, null, staff_id, 'Encargado interno', '+524522222222', 'work_assigned', 'staff-complete', 'sent', encode(extensions.digest(convert_to(staff_token, 'UTF8'), 'sha256'), 'hex')),
    (irrigation_dispatch, test_company, irrigation_work, test_plan, manager_id, null, 'Manager', '+524521111111', 'work_assigned', 'irrigation-complete', 'sent', encode(extensions.digest(convert_to(irrigation_token, 'UTF8'), 'sha256'), 'hex')),
    (application_dispatch, test_company, application_work, test_plan, manager_id, null, 'Manager', '+524521111111', 'work_assigned', 'application-complete', 'sent', encode(extensions.digest(convert_to(application_token, 'UTF8'), 'sha256'), 'hex'));

  perform set_config('request.jwt.claim.role', 'service_role', true);
  begin
    perform public.process_grok_work_callback(reply_dispatch, repeat('9', 64), 'invalid-token', 'responded', 'No debe entrar', '{}'::jsonb);
    raise exception 'Invalid Grok callback token was accepted';
  exception when others then
    if sqlerrm not like '%invalid_agent_callback_token%' then raise; end if;
  end;
  perform public.process_grok_work_callback(reply_dispatch, reply_token, 'reply-1', 'responded', 'Voy en camino', '{}'::jsonb);
  perform public.process_grok_work_callback(reply_dispatch, reply_token, 'reply-1', 'responded', 'Voy en camino', '{}'::jsonb);

  select count(*) into answer_count
  from public.task_updates
  where task_id = reply_work
    and update_type = 'answer'
    and note = 'Voy en camino';
  if answer_count <> 1 then raise exception 'Duplicate Grok callback created % answer events', answer_count; end if;

  perform public.process_grok_work_callback(
    staff_dispatch,
    staff_token,
    'staff-complete-1',
    'completed',
    'Listo, terminé la limpieza',
    jsonb_build_object('occurredAt', current_date)
  );
  if not exists (
    select 1 from public.tasks where id = staff_work and status = 'completada'::public.task_status
  ) then raise exception 'Staff callback did not complete the Work'; end if;
  if not exists (
    select 1 from public.task_updates
    where task_id = staff_work and update_type = 'completed' and actor_staff_id = staff_id
      and metadata->>'source' = 'grok_whatsapp'
  ) then raise exception 'Staff completion actor was not preserved'; end if;

  perform public.process_grok_work_callback(
    irrigation_dispatch,
    irrigation_token,
    'irrigation-complete-1',
    'completed',
    'Riego terminado',
    jsonb_build_object('occurredAt', current_date, 'durationMin', 25, 'estimatedLiters', 300, 'sector', 'Módulo 1')
  );
  if not exists (
    select 1 from public.irrigation_records
    where source_task_id = irrigation_work and duration_min = 25 and estimated_liters = 300
  ) then raise exception 'Grok irrigation callback did not create its technical record'; end if;

  perform public.process_grok_work_callback(
    application_dispatch,
    application_token,
    'application-complete-1',
    'completed',
    'Aplicación terminada',
    jsonb_build_object('occurredAt', current_date, 'appliedArea', 'Módulo 1')
  );
  if not exists (
    select 1 from public.application_records
    where source_task_id = application_work and category = 'fungicida'::public.application_category
  ) then raise exception 'Grok application callback did not preserve the product category'; end if;
end
$$;

rollback;
