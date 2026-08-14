-- MIRA · Tercer lote: 19 aplicaciones exactas de la simulación
-- Una sola sentencia. No elimina ni aprueba actividades.

do $recovery$
declare
  target_ids uuid[] := array[
    '77fb7103-4226-40a0-b0cc-c4f21d31e207'::uuid,
    'd282556e-e8d4-4946-8c2d-21f23b504a7d'::uuid,
    '9f1643b9-3bf0-4f64-a66b-83b682b4e8f1'::uuid,
    '348a3351-e07a-487c-8e42-01ba644450bf'::uuid,
    '74c4ddfd-2e9d-4615-bb35-286c773f65c4'::uuid,
    '210e179b-bd92-4c2d-949b-31740973158a'::uuid,
    '422db0a2-1c1f-4f15-b4ab-d9280b343eef'::uuid,
    '15b630ba-8234-4080-ae12-58bc4263f5b6'::uuid,
    '852d6858-f313-4e16-bb7b-2e217eadcee5'::uuid,
    'c7e00068-ee5a-4a8e-baa6-e26678cb7b7c'::uuid,
    '61daeb9b-d85e-4494-b34f-888f0a8348b5'::uuid,
    'db2af9d2-6ceb-428f-98d6-692f44fc2b64'::uuid,
    '85fd3be9-12a1-45d0-bcb8-536e078ff904'::uuid,
    '415c5df7-9cc8-4237-99be-d21355f7b9c9'::uuid,
    'a3a0ea43-e9d8-4dcb-8945-9ec793c24184'::uuid,
    '83945d05-3167-4853-ace5-da2e0d69ece7'::uuid,
    '9a2a01b1-11c7-4585-a0ed-da9618f2a833'::uuid,
    '78f53e9e-cb19-4f4d-adf8-a895061ec18b'::uuid,
    '610c5b2f-8be7-4031-aafb-ee1d1a406c7a'::uuid
  ];
  expected_count constant integer := 19;
  run_id uuid := gen_random_uuid();
  company_id_value uuid;
  actor_user_id uuid;
  matching_companies integer;
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
    raise exception 'Candado inválido: deben existir exactamente 19 IDs únicos';
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
    else 3 end, member.created_at, member.id
  limit 1;
  if actor_user_id is null then
    raise exception 'Mercadia Ag no tiene usuario activo para auditar la recuperación';
  end if;

  if (select count(*) from public.tasks task
      where task.company_id = company_id_value and task.id = any(target_ids)) <> expected_count then
    raise exception 'Candado no coincide: no se encontraron las 19 actividades exactas';
  end if;

  for target in
    select task.* from public.tasks task
    where task.company_id = company_id_value and task.id = any(target_ids)
    order by task.scheduled_date, task.id
    for update
  loop
    if target.status <> 'pendiente'::public.task_status
      or target.scheduled_date >= date_trunc('week', current_date)::date
      or target.type <> 'aplicacion_foliar'::public.task_type then
      raise exception 'La actividad % cambió de estado, fecha o tipo; no se aplicó nada', target.id;
    end if;
    if not exists (select 1 from public.task_assignments a where a.task_id = target.id)
      and not exists (select 1 from public.task_staff_assignments a where a.task_id = target.id) then
      raise exception 'La actividad % no tiene encargado; no se aplicó nada', target.id;
    end if;
    if exists (select 1 from public.task_assignments a where a.task_id = target.id)
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
        select 1 from public.task_materials material
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
    select task.* from public.tasks task
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
      target.id, target.scheduled_date,
      nullif(trim(target.technical_plan->>'appliedArea'), ''), applications_payload
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
    raise exception 'Verificación fallida: se esperaban 19 auditorías y se encontraron %', audit_count;
  end if;

  if (select count(*) from public.tasks where company_id = company_id_value) <> tasks_before
    or (select count(*) from public.task_materials where company_id = company_id_value) <> materials_before
    or (select count(*) from public.products where company_id = company_id_value) <> products_before
    or (select count(*) from public.application_records where company_id = company_id_value)
      <> applications_before + expected_records then
    raise exception 'Verificación fallida: cambió una cantidad protegida';
  end if;

  raise notice 'ÉXITO: 19 aplicaciones completadas; % registros técnicos; 0 eliminaciones; 0 aprobaciones. Run ID: %',
    expected_records, run_id;
end
$recovery$;
