-- MIRA · Segundo lote: 14 aplicaciones exactas de la simulación
-- Una sola sentencia y una sola transacción. No elimina ni aprueba nada.

do $recovery$
declare
  target_ids uuid[] := array[
    'ee136f6e-25eb-4e8e-ac9d-9e804217ee3f'::uuid,
    '22ca997f-0311-4363-a9e1-5feb4078d378'::uuid,
    '870a18ab-eb64-4cb0-9c14-63875a1d8989'::uuid,
    '355d0a3b-23ab-4808-a334-d7e6a794d175'::uuid,
    '0a845daf-c33c-4389-9933-a7ad9a1d86a2'::uuid,
    '51db5e84-d792-44d9-ae4e-dbc8e373e6cd'::uuid,
    'cfb4ee0f-738b-424a-93c6-5ef878c266a5'::uuid,
    '8d945e97-9b17-481a-b345-979bd07cbd23'::uuid,
    '64d4c13e-c4a7-4502-9788-fa44818e268f'::uuid,
    'b1e49bb6-b471-424b-a70b-46822b76de03'::uuid,
    '93b8cac8-e933-4fa2-9cad-9f22c2da9f8e'::uuid,
    '04921ca1-f74d-4bc4-9435-174d19327a56'::uuid,
    '3a6ead00-5f1a-4043-923b-ed5f230b4456'::uuid,
    'da577895-4e4b-4d9f-9cfc-1e509b7496a9'::uuid
  ];
  expected_count constant integer := 14;
  current_week_start constant date := date_trunc('week', current_date)::date;
  run_id uuid := gen_random_uuid();
  company_id_value uuid;
  actor_user_id uuid;
  matching_companies integer;
  matching_tasks integer;
  tasks_before bigint;
  materials_before bigint;
  products_before bigint;
  applications_before bigint;
  expected_records integer;
  audit_count integer;
  target record;
  applications_payload jsonb;
begin
  if cardinality(target_ids) <> expected_count
    or (select count(distinct id_value) from unnest(target_ids) as target_id(id_value)) <> expected_count then
    raise exception 'Candado inválido: deben existir exactamente 14 IDs únicos';
  end if;

  select count(*), (array_agg(company.id order by company.id))[1]
  into matching_companies, company_id_value
  from public.companies company
  where lower(trim(company.name)) = lower('Mercadia Ag');

  if matching_companies <> 1 then
    raise exception 'Se esperaba exactamente una empresa Mercadia Ag; se encontraron %', matching_companies;
  end if;

  select member.user_id into actor_user_id
  from public.company_members member
  where member.company_id = company_id_value
    and member.status = 'active'::public.member_status
    and member.user_id is not null
  order by case member.role
    when 'owner'::public.member_role then 1
    when 'admin'::public.member_role then 2
    else 3 end,
    member.created_at, member.id
  limit 1;

  if actor_user_id is null then
    raise exception 'Mercadia Ag no tiene un usuario activo para auditar la recuperación';
  end if;

  select count(*) into matching_tasks
  from public.tasks task
  where task.company_id = company_id_value and task.id = any(target_ids);

  if matching_tasks <> expected_count then
    raise exception 'Candado no coincide: se esperaban 14 actividades y se encontraron %', matching_tasks;
  end if;

  for target in
    select task.*
    from public.tasks task
    where task.company_id = company_id_value and task.id = any(target_ids)
    order by task.scheduled_date, task.id
    for update
  loop
    if target.status <> 'pendiente'::public.task_status then
      raise exception 'La actividad % ya no está pendiente; no se aplicó nada', target.id;
    end if;
    if target.scheduled_date >= current_week_start then
      raise exception 'La actividad % pertenece a la semana actual; no se aplicó nada', target.id;
    end if;
    if target.type <> 'aplicacion_foliar'::public.task_type then
      raise exception 'La actividad % ya no es una aplicación; no se aplicó nada', target.id;
    end if;
    if not exists (select 1 from public.task_assignments assignment where assignment.task_id = target.id)
      and not exists (select 1 from public.task_staff_assignments assignment where assignment.task_id = target.id) then
      raise exception 'La actividad % no tiene encargado; no se aplicó nada', target.id;
    end if;
    if exists (select 1 from public.task_assignments assignment where assignment.task_id = target.id)
      and not exists (
        select 1 from public.notification_outbox outbox
        where outbox.task_id = target.id
          and outbox.channel = 'telegram'::public.notification_channel
          and outbox.status = 'sent'::public.notification_status
      ) then
      raise exception 'La actividad % no tiene envío confirmado; no se aplicó nada', target.id;
    end if;
    if not exists (select 1 from public.task_materials material where material.task_id = target.id)
      or exists (
        select 1
        from public.task_materials material
        left join public.products product
          on product.id = material.product_id and product.company_id = material.company_id
        where material.task_id = target.id
          and (material.product_id is null or nullif(trim(material.product_name), '') is null
            or nullif(trim(material.dose), '') is null or nullif(trim(material.unit), '') is null
            or product.id is null or product.category is null)
      ) then
      raise exception 'La actividad % tiene receta o categoría incompleta; no se aplicó nada', target.id;
    end if;
    if exists (select 1 from public.application_records record where record.source_task_id = target.id)
      or exists (select 1 from public.nutrition_records record where record.source_task_id = target.id) then
      raise exception 'La actividad % ya tiene registro técnico; no se aplicó nada', target.id;
    end if;
  end loop;

  select count(*) into tasks_before from public.tasks where company_id = company_id_value;
  select count(*) into materials_before from public.task_materials where company_id = company_id_value;
  select count(*) into products_before from public.products where company_id = company_id_value;
  select count(*) into applications_before from public.application_records where company_id = company_id_value;
  select count(*)::integer into expected_records
  from public.task_materials material where material.task_id = any(target_ids);

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  for target in
    select task.*
    from public.tasks task
    where task.company_id = company_id_value and task.id = any(target_ids)
    order by task.scheduled_date, task.id
  loop
    select jsonb_agg(jsonb_build_object(
      'materialId', material.id,
      'productName', material.product_name,
      'dose', case
        when right(lower(trim(material.dose)), length(trim(material.unit))) = lower(trim(material.unit))
          then trim(material.dose)
        else trim(material.dose) || ' ' || trim(material.unit)
      end,
      'category', product.category::text,
      'composition', coalesce(material.composition, product.composition),
      'safetyInterval', product.safety_interval,
      'reentryInterval', product.reentry_interval,
      'notes', coalesce(material.notes, target.instructions)
    ) order by material.mixing_order nulls last, material.id)
    into applications_payload
    from public.task_materials material
    join public.products product on product.id = material.product_id
    where material.task_id = target.id;

    perform public.complete_application_task(
      target.id,
      target.scheduled_date,
      nullif(trim(target.technical_plan->>'appliedArea'), ''),
      applications_payload
    );

    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
    values (
      company_id_value, target.id, actor_user_id, 'comment'::public.task_update_type,
      'Recuperación externa de actividad vencida; fecha real conservada desde la planeación.',
      jsonb_build_object('source', 'one_time_overdue_recovery', 'run_id', run_id,
        'scheduled_date', target.scheduled_date)
    );
  end loop;

  if exists (
    select 1 from public.tasks task
    where task.id = any(target_ids)
      and (task.status <> 'completada'::public.task_status
        or task.occurred_at::date is distinct from task.scheduled_date
        or task.verified_at is not null or task.verified_by is not null)
  ) then
    raise exception 'Verificación fallida: estado, fecha real o aprobación inesperada';
  end if;

  if (select count(*) from public.application_records where source_task_id = any(target_ids)) <> expected_records then
    raise exception 'Verificación fallida: la cantidad de registros técnicos no coincide';
  end if;

  select count(*)::integer into audit_count
  from public.task_updates update_row
  where update_row.task_id = any(target_ids)
    and update_row.metadata->>'source' = 'one_time_overdue_recovery'
    and update_row.metadata->>'run_id' = run_id::text;

  if audit_count <> expected_count then
    raise exception 'Verificación fallida: se esperaban 14 auditorías y se encontraron %', audit_count;
  end if;

  if (select count(*) from public.tasks where company_id = company_id_value) <> tasks_before
    or (select count(*) from public.task_materials where company_id = company_id_value) <> materials_before
    or (select count(*) from public.products where company_id = company_id_value) <> products_before
    or (select count(*) from public.application_records where company_id = company_id_value)
      <> applications_before + expected_records then
    raise exception 'Verificación fallida: cambió una cantidad protegida';
  end if;

  raise notice 'ÉXITO: 14 aplicaciones completadas; % registros técnicos; 0 eliminaciones; 0 aprobaciones. Run ID: %',
    expected_records, run_id;
end
$recovery$;
