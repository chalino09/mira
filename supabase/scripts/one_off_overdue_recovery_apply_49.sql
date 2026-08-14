-- MIRA · APLICACIÓN FINAL BLOQUEADA A LOS 49 IDs SIMULADOS
-- Una sola sentencia. Es atómica: ante cualquier diferencia, revierte todo.
-- No elimina ni aprueba actividades. La fecha real será la fecha planeada.

do $recovery$
declare
  target_ids uuid[] := array[
    '8c8786df-946a-48c5-863e-a349f1627da9'::uuid,
    'ed8363f6-2a67-4eec-b745-b49bcb12c1e4'::uuid,
    '18ae2bc2-7ba9-413b-b2eb-3b5a338740ae'::uuid,
    '7beccd90-39c9-4fe6-babb-e31c98b7d58d'::uuid,
    'e1b29ba2-4416-4a05-9ddd-5a87369ff032'::uuid,
    '46243dc6-0415-4017-a821-21fb6bbe98dd'::uuid,
    '9223aebd-67da-4d18-a112-b443b9d1f812'::uuid,
    '10a7aa83-ed06-4da7-9be7-b9390eaf43c9'::uuid,
    'a9bba5c2-33d7-45d5-9213-8d8fa66d78b8'::uuid,
    'b73973b1-4140-48a5-8792-6668d291d718'::uuid,
    'c7a15c9b-b37c-4588-8214-daca2d9fe6f7'::uuid,
    'f5669be4-bb51-471e-b36e-491af156a734'::uuid,
    'f72c479f-1e06-4329-85b6-abddcba7af16'::uuid,
    '0a55db20-0bfc-491d-a230-e300f22040e1'::uuid,
    '74a4eb43-4df6-43f0-82aa-ffbecf99a5bc'::uuid,
    'eca2d06f-c4d7-45cf-9345-816b5fd57c0f'::uuid,
    'c2fd4b0e-45f3-4196-9597-d18f12f71bee'::uuid,
    '117a4f45-9305-4831-8142-355b78b58340'::uuid,
    '5f9ae293-f5f1-4a94-a382-1918bfccf0c1'::uuid,
    '7adee897-36ca-47dc-9034-e2db68d9a70a'::uuid,
    '294afb90-a9d7-4d3f-b77a-e69716564a72'::uuid,
    'cd3c316e-8426-4ce0-b379-143dccf01b78'::uuid,
    'db6241e9-e5d1-410b-a455-97c1612e5e9f'::uuid,
    'ab44c02a-ac33-489c-8754-529b538f3a16'::uuid,
    'c540827d-ef89-444f-8ca2-42b0a5621a45'::uuid,
    '1275984f-f4bd-493d-9231-780f0f3de51f'::uuid,
    '4b22361d-b040-4d32-907f-e7d1f9ebbb38'::uuid,
    '5145083d-aaa3-4cf2-a722-cc07421f8234'::uuid,
    '5a3e564d-2bc2-4d81-ae16-d2c07e0b2350'::uuid,
    '9ef761d0-305d-41d7-a61a-1e02882092e3'::uuid,
    'd06532ac-cfea-4be0-8b87-3c22b84cef02'::uuid,
    'ee16295e-58d9-4268-8283-ff10a46aec19'::uuid,
    'bf645a73-c312-4fd6-9264-872b1a4996b9'::uuid,
    'd06ce9b7-87d7-49c8-b440-087e3e1347f7'::uuid,
    '2983fc4c-40b2-43ab-8eb2-6718178eec44'::uuid,
    'a888db1a-4781-446c-8f6c-1446203a0a36'::uuid,
    'c22a2e4e-0ed5-497d-a81c-053c350eab15'::uuid,
    'c9ff83af-0ef3-4b95-8c72-73cb27f3a3c6'::uuid,
    '00a63c13-b3aa-4d45-9bd6-aef24429d768'::uuid,
    '1c848ede-3173-41fd-9b74-3bc50828ff4b'::uuid,
    '380cfc36-6d22-4b64-a606-5e4b95d17b09'::uuid,
    '42c131e9-64ad-42b0-978b-98bebab0f7ef'::uuid,
    '8048f5aa-65b3-4d8e-98d8-f8d3c7788447'::uuid,
    '14abccaf-daf2-4f4d-a747-f1a8686dfc1d'::uuid,
    '4c7930a8-7511-4845-9e16-2e5c123d22db'::uuid,
    '79948f17-5f89-4372-b346-0ee36c5034c9'::uuid,
    '2197cbaf-efef-416f-825a-c0dce71dc9e6'::uuid,
    '4a6fe1df-592d-442f-9536-1095fb7e0541'::uuid,
    'dbbdd581-eecc-4bc7-a490-a4e7eed4f7d7'::uuid
  ];
  expected_count constant integer := 49;
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
  nutrition_before bigint;
  expected_application_records integer := 0;
  expected_nutrition_records integer := 0;
  technical_records integer;
  audit_count integer;
  target record;
  applications_payload jsonb;
  nutrition_payload jsonb;
  nutrition_method text;
  nutrition_objective text;
  crop_stage text;
  target_ph numeric;
  target_ec numeric;
begin
  if cardinality(target_ids) <> expected_count
    or (select count(distinct id_value) from unnest(target_ids) as target_id(id_value)) <> expected_count then
    raise exception 'Candado inválido: la lista debe contener exactamente 49 IDs únicos';
  end if;

  select count(*), (array_agg(company.id order by company.id))[1]
  into matching_companies, company_id_value
  from public.companies company
  where lower(trim(company.name)) = lower('Mercadia Ag');

  if matching_companies <> 1 then
    raise exception 'Se esperaba exactamente una empresa Mercadia Ag; se encontraron %', matching_companies;
  end if;

  select member.user_id
  into actor_user_id
  from public.company_members member
  where member.company_id = company_id_value
    and member.status = 'active'::public.member_status
    and member.user_id is not null
  order by case member.role
    when 'owner'::public.member_role then 1
    when 'admin'::public.member_role then 2
    else 3
  end, member.created_at, member.id
  limit 1;

  if actor_user_id is null then
    raise exception 'Mercadia Ag no tiene un usuario activo para auditar la recuperación';
  end if;

  select count(*) into matching_tasks
  from public.tasks task
  where task.company_id = company_id_value and task.id = any(target_ids);

  if matching_tasks <> expected_count then
    raise exception 'Candado no coincide: se esperaban 49 actividades de Mercadia Ag y se encontraron %', matching_tasks;
  end if;

  -- Revalida cada condición de la simulación justo antes de modificar algo.
  for target in
    select task.*, greenhouse.transplant_date
    from public.tasks task
    join public.greenhouses greenhouse on greenhouse.id = task.greenhouse_id
    where task.company_id = company_id_value and task.id = any(target_ids)
    order by task.scheduled_date, task.id
    for update of task
  loop
    if target.status <> 'pendiente'::public.task_status then
      raise exception 'La actividad % ya no está pendiente; no se aplicó nada', target.id;
    end if;
    if target.scheduled_date >= current_week_start then
      raise exception 'La actividad % pertenece a la semana actual; no se aplicó nada', target.id;
    end if;
    if target.type not in ('aplicacion_foliar'::public.task_type, 'fertirriego'::public.task_type, 'fertilizacion'::public.task_type) then
      raise exception 'La actividad % no es de un tipo técnico permitido; no se aplicó nada', target.id;
    end if;
    if not exists (select 1 from public.task_assignments assignment where assignment.task_id = target.id)
      and not exists (select 1 from public.task_staff_assignments assignment where assignment.task_id = target.id) then
      raise exception 'La actividad % ya no tiene encargado; no se aplicó nada', target.id;
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
    if not exists (select 1 from public.task_materials material where material.task_id = target.id) then
      raise exception 'La actividad % no tiene materiales; no se aplicó nada', target.id;
    end if;
    if exists (
      select 1
      from public.task_materials material
      left join public.products product
        on product.id = material.product_id and product.company_id = material.company_id
      where material.task_id = target.id
        and (material.product_id is null or nullif(trim(material.product_name), '') is null
          or nullif(trim(material.dose), '') is null or nullif(trim(material.unit), '') is null
          or product.id is null)
    ) then
      raise exception 'La actividad % tiene una receta incompleta; no se aplicó nada', target.id;
    end if;
    if exists (select 1 from public.application_records record where record.source_task_id = target.id)
      or exists (select 1 from public.nutrition_records record where record.source_task_id = target.id) then
      raise exception 'La actividad % ya tiene registro técnico; no se aplicó nada', target.id;
    end if;
    if target.type = 'aplicacion_foliar'::public.task_type and exists (
      select 1 from public.task_materials material
      join public.products product on product.id = material.product_id
      where material.task_id = target.id and product.category is null
    ) then
      raise exception 'La actividad % tiene un producto sin categoría; no se aplicó nada', target.id;
    end if;
    if target.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type)
      and (coalesce(nullif(trim(target.technical_plan->>'targetPh'), ''), '0') !~ '^-?[0-9]+([.,][0-9]+)?$'
        or coalesce(nullif(trim(target.technical_plan->>'targetEc'), ''), '0') !~ '^-?[0-9]+([.,][0-9]+)?$') then
      raise exception 'La actividad % tiene pH o CE inválido; no se aplicó nada', target.id;
    end if;
  end loop;

  select count(*) into tasks_before from public.tasks where company_id = company_id_value;
  select count(*) into materials_before from public.task_materials where company_id = company_id_value;
  select count(*) into products_before from public.products where company_id = company_id_value;
  select count(*) into applications_before from public.application_records where company_id = company_id_value;
  select count(*) into nutrition_before from public.nutrition_records where company_id = company_id_value;

  select coalesce(sum(material_count), 0)::integer into expected_application_records
  from (
    select count(material.id) as material_count
    from public.tasks task
    join public.task_materials material on material.task_id = task.id
    where task.id = any(target_ids) and task.type = 'aplicacion_foliar'::public.task_type
    group by task.id
  ) counts;

  select coalesce(sum(material_count), 0)::integer into expected_nutrition_records
  from (
    select count(material.id) as material_count
    from public.tasks task
    join public.task_materials material on material.task_id = task.id
    where task.id = any(target_ids)
      and task.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type)
    group by task.id
  ) counts;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  for target in
    select task.*, greenhouse.transplant_date
    from public.tasks task
    join public.greenhouses greenhouse on greenhouse.id = task.greenhouse_id
    where task.company_id = company_id_value and task.id = any(target_ids)
    order by task.scheduled_date, task.id
  loop
    if target.type = 'aplicacion_foliar'::public.task_type then
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
    else
      select jsonb_agg(jsonb_build_object(
        'materialId', material.id,
        'productName', material.product_name,
        'dose', case
          when right(lower(trim(material.dose)), length(trim(material.unit))) = lower(trim(material.unit))
            then trim(material.dose)
          else trim(material.dose) || ' ' || trim(material.unit)
        end
      ) order by material.mixing_order nulls last, material.id)
      into nutrition_payload
      from public.task_materials material
      where material.task_id = target.id;

      nutrition_method := case lower(trim(coalesce(target.technical_plan->>'method', 'Fertirriego')))
        when 'foliar' then 'foliar' when 'drench' then 'drench' else 'fertirriego' end;
      nutrition_objective := case lower(trim(coalesce(target.technical_plan->>'objective', 'Desarrollo')))
        when 'raíz' then 'raiz' when 'raiz' then 'raiz'
        when 'floración' then 'floracion' when 'floracion' then 'floracion'
        when 'cuajado' then 'cuajado' when 'engorde' then 'engorde'
        when 'calidad' then 'calidad' else 'desarrollo' end;
      crop_stage := case
        when target.transplant_date is null then 'vegetativo'
        when target.scheduled_date - target.transplant_date < 43 then 'vegetativo'
        when target.scheduled_date - target.transplant_date < 78 then 'floracion'
        else 'produccion' end;
      target_ph := nullif(replace(trim(target.technical_plan->>'targetPh'), ',', '.'), '')::numeric;
      target_ec := nullif(replace(trim(target.technical_plan->>'targetEc'), ',', '.'), '')::numeric;

      perform public.complete_nutrition_task(
        target.id, target.scheduled_date, nutrition_method, crop_stage,
        nutrition_objective, target_ph, target_ec, target.instructions, nutrition_payload
      );
    end if;

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

  select count(*)::integer into technical_records
  from (
    select source_task_material_id from public.application_records where source_task_id = any(target_ids)
    union all
    select source_task_material_id from public.nutrition_records where source_task_id = any(target_ids)
  ) records;

  if technical_records <> expected_application_records + expected_nutrition_records then
    raise exception 'Verificación fallida: se esperaban % registros técnicos y se encontraron %',
      expected_application_records + expected_nutrition_records, technical_records;
  end if;

  select count(*)::integer into audit_count
  from public.task_updates update_row
  where update_row.task_id = any(target_ids)
    and update_row.metadata->>'source' = 'one_time_overdue_recovery'
    and update_row.metadata->>'run_id' = run_id::text;

  if audit_count <> expected_count then
    raise exception 'Verificación fallida: se esperaban 49 auditorías y se encontraron %', audit_count;
  end if;

  if (select count(*) from public.tasks where company_id = company_id_value) <> tasks_before
    or (select count(*) from public.task_materials where company_id = company_id_value) <> materials_before
    or (select count(*) from public.products where company_id = company_id_value) <> products_before then
    raise exception 'Verificación fallida: cambió la cantidad de tareas, materiales o productos';
  end if;

  if (select count(*) from public.application_records where company_id = company_id_value)
      <> applications_before + expected_application_records
    or (select count(*) from public.nutrition_records where company_id = company_id_value)
      <> nutrition_before + expected_nutrition_records then
    raise exception 'Verificación fallida: la cantidad de registros técnicos no coincide';
  end if;

  raise notice 'ÉXITO: 49 actividades completadas y verificadas internamente; % registros técnicos; 0 eliminaciones; 0 aprobaciones. Run ID: %',
    technical_records, run_id;
end
$recovery$;
