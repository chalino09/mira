-- MIRA · Completa únicamente 2 aplicaciones confirmadas por operación.
-- SA-PROPEL y Q-VIRUS ya tienen su producto/categoría ligados.
-- No aprueba ni elimina actividades; conserva la fecha planeada como fecha real.

do $completion$
declare
  target_ids uuid[] := array[
    '17bf74d2-4c0d-4b92-b09c-a39e6a8e2892'::uuid,
    '363efa54-ed7c-4572-b081-875e610e9cbb'::uuid
  ];
  expected_count constant integer := 2;
  company_id_value uuid;
  actor_user_id uuid;
  matching_companies integer;
  tasks_before bigint;
  materials_before bigint;
  products_before bigint;
  applications_before bigint;
  expected_records integer := 0;
  technical_count integer;
  audit_count integer;
  run_id uuid := gen_random_uuid();
  target record;
  application_payload jsonb;
begin
  if cardinality(target_ids) <> expected_count
    or (select count(distinct id_value) from unnest(target_ids) as target_id(id_value)) <> expected_count then
    raise exception 'Candado inválido: deben existir exactamente 2 IDs únicos';
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
    raise exception 'Candado no coincide: no se encontraron las 2 actividades exactas';
  end if;

  for target in
    select task.*
    from public.tasks task
    where task.company_id = company_id_value and task.id = any(target_ids)
    order by task.scheduled_date, task.id
    for update
  loop
    if target.status <> 'pendiente'::public.task_status
      or target.scheduled_date >= date_trunc('week', current_date)::date
      or target.type <> 'aplicacion_foliar'::public.task_type then
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
            or product.id is null or product.category is null)
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
  from public.application_records where source_task_id = any(target_ids);
  if technical_count <> expected_records then
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
      <> applications_before + expected_records then
    raise exception 'Verificación fallida: cambió una cantidad protegida';
  end if;

  raise notice 'ÉXITO: 2 actividades completadas, % registros técnicos, 0 aprobaciones y 0 eliminaciones. Run ID: %', technical_count, run_id;
end
$completion$;
