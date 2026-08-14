-- MIRA · 7 actividades confirmadas por operación, sin envío de Telegram.
-- Una sola sentencia; no aprueba ni elimina actividades.

do $completion$
declare
  target_ids uuid[] := array[
    'ff2463d4-8e9e-4d1a-8fe3-7627359bd8ce'::uuid,
    '7d787534-3f58-450a-9588-3699cad18de1'::uuid,
    'fb2808ed-b71c-4caf-bdbd-f9b867186207'::uuid,
    'e9c9acd4-452a-4040-aeb8-7d9de2ae71eb'::uuid,
    'be78073d-5fff-4a19-a919-38a19fbd312c'::uuid,
    'ec6f01eb-1e51-4cb7-bd52-cc2ca3a06b1f'::uuid,
    '12a85338-3bf6-43bf-b209-941bb22af9ba'::uuid
  ];
  expected_count constant integer := 7;
  company_id_value uuid;
  actor_user_id uuid;
  matching_companies integer;
  tasks_before bigint;
  materials_before bigint;
  products_before bigint;
  applications_before bigint;
  nutrition_before bigint;
  expected_applications integer := 0;
  expected_nutrition integer := 0;
  audit_count integer;
  technical_count integer;
  run_id uuid := gen_random_uuid();
  target record;
  application_payload jsonb;
  nutrition_payload jsonb;
  crop_stage text;
  nutrition_method text;
  nutrition_objective text;
  target_ph numeric;
  target_ec numeric;
begin
  if cardinality(target_ids) <> expected_count
    or (select count(distinct id_value) from unnest(target_ids) as target_id(id_value)) <> expected_count then
    raise exception 'Candado inválido: deben existir exactamente 7 IDs únicos';
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
    raise exception 'Candado no coincide: no se encontraron las 7 actividades exactas';
  end if;

  for target in
    select task.*, greenhouse.transplant_date
    from public.tasks task
    join public.greenhouses greenhouse on greenhouse.id = task.greenhouse_id
    where task.company_id = company_id_value and task.id = any(target_ids)
    order by task.scheduled_date, task.id
    for update of task
  loop
    if target.status <> 'pendiente'::public.task_status
      or target.scheduled_date >= date_trunc('week', current_date)::date
      or target.type not in (
        'aplicacion_foliar'::public.task_type,
        'fertirriego'::public.task_type,
        'fertilizacion'::public.task_type
      ) then
      raise exception 'La actividad % cambió de estado, fecha o tipo; no se aplicó nada', target.id;
    end if;
    if not exists (select 1 from public.task_materials material where material.task_id = target.id)
      or exists (
        select 1 from public.task_materials material
        left join public.products product
          on product.id = material.product_id and product.company_id = material.company_id
        where material.task_id = target.id
          and (material.product_id is null or nullif(trim(material.product_name), '') is null
            or nullif(trim(material.dose), '') is null or nullif(trim(material.unit), '') is null
            or product.id is null
            or (target.type = 'aplicacion_foliar'::public.task_type and product.category is null))
      ) then
      raise exception 'La actividad % tiene receta incompleta; no se aplicó nada', target.id;
    end if;
    if exists (select 1 from public.application_records record where record.source_task_id = target.id)
      or exists (select 1 from public.nutrition_records record where record.source_task_id = target.id) then
      raise exception 'La actividad % ya tiene un registro técnico; no se aplicó nada', target.id;
    end if;
  end loop;

  select count(*) into tasks_before from public.tasks where company_id = company_id_value;
  select count(*) into materials_before from public.task_materials where company_id = company_id_value;
  select count(*) into products_before from public.products where company_id = company_id_value;
  select count(*) into applications_before from public.application_records where company_id = company_id_value;
  select count(*) into nutrition_before from public.nutrition_records where company_id = company_id_value;
  select count(*)::integer into expected_applications
  from public.task_materials material join public.tasks task on task.id = material.task_id
  where task.id = any(target_ids) and task.type = 'aplicacion_foliar'::public.task_type;
  select count(*)::integer into expected_nutrition
  from public.task_materials material join public.tasks task on task.id = material.task_id
  where task.id = any(target_ids)
    and task.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type);

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
        'dose', case when right(lower(trim(material.dose)), length(trim(material.unit))) = lower(trim(material.unit))
          then trim(material.dose) else trim(material.dose) || ' ' || trim(material.unit) end,
        'category', product.category::text,
        'composition', coalesce(material.composition, product.composition),
        'safetyInterval', product.safety_interval,
        'reentryInterval', product.reentry_interval,
        'notes', coalesce(material.notes, target.instructions)
      ) order by material.mixing_order nulls last, material.id)
      into application_payload
      from public.task_materials material
      join public.products product on product.id = material.product_id
      where material.task_id = target.id;
      perform public.complete_application_task(
        target.id, target.scheduled_date,
        nullif(trim(target.technical_plan->>'appliedArea'), ''), application_payload
      );
    else
      select jsonb_agg(jsonb_build_object(
        'materialId', material.id,
        'productName', material.product_name,
        'dose', case when right(lower(trim(material.dose)), length(trim(material.unit))) = lower(trim(material.unit))
          then trim(material.dose) else trim(material.dose) || ' ' || trim(material.unit) end
      ) order by material.mixing_order nulls last, material.id)
      into nutrition_payload
      from public.task_materials material where material.task_id = target.id;
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
        target.id, target.scheduled_date, nutrition_method, crop_stage, nutrition_objective,
        target_ph, target_ec, target.instructions, nutrition_payload
      );
    end if;
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
    values (
      company_id_value, target.id, actor_user_id, 'comment'::public.task_update_type,
      'Recuperación externa confirmada por operación; no hubo comprobante de envío.',
      jsonb_build_object('source', 'one_time_overdue_recovery', 'run_id', run_id,
        'scheduled_date', target.scheduled_date, 'confirmed_by_user', true)
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
  select count(*)::integer into technical_count
  from (
    select source_task_material_id from public.application_records where source_task_id = any(target_ids)
    union all
    select source_task_material_id from public.nutrition_records where source_task_id = any(target_ids)
  ) records;
  if technical_count <> expected_applications + expected_nutrition then
    raise exception 'Verificación fallida: cantidad de registros técnicos incorrecta';
  end if;
  select count(*)::integer into audit_count from public.task_updates update_row
  where update_row.task_id = any(target_ids)
    and update_row.metadata->>'source' = 'one_time_overdue_recovery'
    and update_row.metadata->>'run_id' = run_id::text;
  if audit_count <> expected_count then
    raise exception 'Verificación fallida: auditorías incompletas';
  end if;
  if (select count(*) from public.tasks where company_id = company_id_value) <> tasks_before
    or (select count(*) from public.task_materials where company_id = company_id_value) <> materials_before
    or (select count(*) from public.products where company_id = company_id_value) <> products_before
    or (select count(*) from public.application_records where company_id = company_id_value)
      <> applications_before + expected_applications
    or (select count(*) from public.nutrition_records where company_id = company_id_value)
      <> nutrition_before + expected_nutrition then
    raise exception 'Verificación fallida: cambió una cantidad protegida';
  end if;
  raise notice 'ÉXITO: 7 actividades completadas, % registros técnicos, 0 aprobaciones y 0 eliminaciones. Run ID: %', technical_count, run_id;
end
$completion$;
