-- mira - 41 Work technical adapters
-- Ejecutar después de 40_work_core.sql.
-- Conserva las RPC complete_*_task como adaptadores y obliga a que cada
-- resultado técnico tenga un Work de origen.

create or replace function public.create_unplanned_work(
  target_company_id uuid,
  target_greenhouse_id uuid,
  target_type public.task_type,
  target_title text,
  target_occurred_at date,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_work public.tasks%rowtype;
  material_item jsonb;
  material_id uuid;
  material_ids jsonb := '[]'::jsonb;
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'invalid_work_payload';
  end if;
  if target_type not in ('riego'::public.task_type, 'fertirriego'::public.task_type,
    'fertilizacion'::public.task_type, 'aplicacion_foliar'::public.task_type,
    'cosecha'::public.task_type) then
    raise exception 'unplanned_work_type_not_supported';
  end if;
  if target_occurred_at is null then raise exception 'work_occurred_at_required'; end if;
  if nullif(trim(target_title), '') is null then raise exception 'work_title_required'; end if;
  if not public.can_access_greenhouse(target_company_id, target_greenhouse_id) then
    raise exception 'not_allowed';
  end if;

  insert into public.tasks (
    company_id, greenhouse_id, type, title, scheduled_date, status,
    responsible_user_id, created_by, origin, technical_plan
  ) values (
    target_company_id, target_greenhouse_id, target_type, trim(target_title),
    target_occurred_at, 'pendiente', auth.uid(), auth.uid(), 'unplanned', target_payload
  ) returning * into created_work;

  if target_payload ? 'materials' then
    if jsonb_typeof(target_payload->'materials') <> 'array' then
      raise exception 'invalid_work_materials';
    end if;
    for material_item in select value from jsonb_array_elements(target_payload->'materials') loop
      if nullif(trim(material_item->>'productName'), '') is null then
        raise exception 'work_material_product_required';
      end if;
      insert into public.task_materials (
        company_id, task_id, product_id, product_name, dose, unit, mixing_order, notes
      ) values (
        target_company_id, created_work.id,
        nullif(trim(material_item->>'productId'), '')::uuid,
        trim(material_item->>'productName'),
        nullif(trim(material_item->>'dose'), ''),
        nullif(trim(material_item->>'unit'), ''),
        coalesce((material_item->>'mixingOrder')::integer, 0),
        nullif(trim(material_item->>'notes'), '')
      ) returning id into material_id;
      material_ids := material_ids || jsonb_build_array(material_id);
    end loop;
  end if;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata)
  values (
    created_work.company_id, created_work.id, auth.uid(), 'created',
    jsonb_build_object('source', 'work', 'origin', 'unplanned')
  );

  return jsonb_build_object('workId', created_work.id, 'materialIds', material_ids);
end;
$$;

create or replace function public.finish_technical_work(
  target_work_id uuid,
  target_occurred_at date,
  target_note text default null,
  target_actor_user_id uuid default auth.uid(),
  target_source text default 'technical_adapter'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  final_status public.task_status;
begin
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if target_occurred_at is null then raise exception 'work_occurred_at_required'; end if;
  if target_work.status = 'verificada'::public.task_status then
    raise exception 'invalid_work_transition';
  end if;

  final_status := case when target_work.verification_required
    then 'completada'::public.task_status else 'verificada'::public.task_status end;
  update public.tasks
  set status = final_status,
      blocked_reason = null,
      started_at = coalesce(started_at, now()),
      completed_at = coalesce(completed_at, now()),
      occurred_at = target_occurred_at::timestamptz,
      verified_at = case when final_status = 'verificada'::public.task_status then now() else null end,
      verified_by = case when final_status = 'verificada'::public.task_status then target_actor_user_id else null end,
      updated_at = now()
  where id = target_work_id
  returning * into target_work;

  if final_status = 'verificada'::public.task_status then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
    values (
      target_work.company_id, target_work.id, target_actor_user_id, 'verified',
      nullif(trim(target_note), ''), jsonb_build_object('source', target_source, 'automatic', true)
    );
  end if;

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'occurredAt', target_work.occurred_at);
end;
$$;

-- Las implementaciones previas siguen haciendo la validación y la escritura del
-- resultado; los nombres públicos se recrean como adaptadores del ciclo Work.
alter function public.complete_application_task(uuid, date, text, jsonb) rename to legacy_complete_application_task;
alter function public.complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text) rename to legacy_complete_irrigation_task;
alter function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) rename to legacy_complete_nutrition_task;
alter function public.complete_harvest_task(
  uuid, date, numeric, numeric, numeric, numeric, numeric, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) rename to legacy_complete_harvest_task;

create or replace function public.complete_application_task(
  target_task_id uuid, target_occurred_at date, target_applied_area text default null,
  target_applications jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  result := public.legacy_complete_application_task(target_task_id, target_occurred_at, target_applied_area, target_applications);
  perform public.finish_technical_work(target_task_id, target_occurred_at, 'Aplicación confirmada y guardada en registros técnicos');
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

create or replace function public.complete_irrigation_task(
  target_task_id uuid, target_occurred_at date, target_duration_min integer,
  target_estimated_liters numeric, target_sector text default null, target_ph numeric default null,
  target_ec numeric default null, target_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  result := public.legacy_complete_irrigation_task(target_task_id, target_occurred_at, target_duration_min, target_estimated_liters, target_sector, target_ph, target_ec, target_notes);
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Riego confirmado y guardado en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

create or replace function public.complete_nutrition_task(
  target_task_id uuid, target_occurred_at date, target_method text,
  target_crop_stage text default null, target_objective text default null,
  target_ph numeric default null, target_ec numeric default null, target_notes text default null,
  target_products jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  result := public.legacy_complete_nutrition_task(target_task_id, target_occurred_at, target_method, target_crop_stage, target_objective, target_ph, target_ec, target_notes, target_products);
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Nutrición confirmada y guardada en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

create or replace function public.complete_harvest_task(
  target_task_id uuid, target_occurred_at date, target_kilograms numeric,
  target_first_quality_kg numeric default 0, target_second_quality_kg numeric default 0,
  target_merma_kg numeric default 0, target_estimated_price numeric default 0,
  target_destination text default null, target_notes text default null,
  target_box_count numeric default 0, target_box_weight_kg numeric default 20,
  target_first_quality_boxes numeric default 0, target_second_quality_boxes numeric default 0,
  target_third_quality_boxes numeric default 0, target_merma_boxes numeric default 0,
  target_third_quality_kg numeric default 0, target_first_quality_price numeric default 0,
  target_second_quality_price numeric default 0, target_third_quality_price numeric default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  result := public.legacy_complete_harvest_task(
    target_task_id, target_occurred_at, target_kilograms, target_first_quality_kg,
    target_second_quality_kg, target_merma_kg, target_estimated_price, target_destination,
    target_notes, target_box_count, target_box_weight_kg, target_first_quality_boxes,
    target_second_quality_boxes, target_third_quality_boxes, target_merma_boxes,
    target_third_quality_kg, target_first_quality_price, target_second_quality_price,
    target_third_quality_price
  );
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Cosecha confirmada y guardada en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

-- Punto de entrada exclusivo para el webhook: la función Edge no puede portar
-- el JWT del operador, por eso el actor se valida y se registra explícitamente.
create or replace function public.execute_telegram_work_action(
  target_work_id uuid,
  target_actor_user_id uuid,
  target_action text,
  target_note text default null,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  material public.task_materials%rowtype;
  result_id uuid;
  result_ids jsonb := '[]'::jsonb;
  occurred_on date := nullif(trim(coalesce(target_payload->>'occurredAt', '')), '')::date;
  final_status public.task_status;
begin
  if auth.role() <> 'service_role' then raise exception 'not_allowed'; end if;
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not exists (
    select 1 from public.company_members member
    where member.company_id = target_work.company_id and member.user_id = target_actor_user_id
      and member.status = 'active'
  ) then raise exception 'not_allowed'; end if;

  if target_action = 'block' then
    if nullif(trim(target_note), '') is null then raise exception 'blocked_reason_required'; end if;
    update public.tasks set status = 'bloqueada', blocked_reason = trim(target_note), updated_at = now()
    where id = target_work.id;
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
    values (target_work.company_id, target_work.id, target_actor_user_id, 'blocked', trim(target_note), jsonb_build_object('source', 'telegram'));
    return jsonb_build_object('workId', target_work.id, 'status', 'bloqueada');
  end if;
  if target_action <> 'complete' then raise exception 'invalid_work_action'; end if;
  if target_work.status not in ('pendiente'::public.task_status, 'en_progreso'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;
  if occurred_on is null then occurred_on := current_date; end if;

  if target_work.type = 'riego'::public.task_type then
    insert into public.irrigation_records (
      company_id, greenhouse_id, occurred_at, duration_min, estimated_liters, sector, ph, ec, notes,
      responsible_user_id, created_by, source_task_id
    ) values (
      target_work.company_id, target_work.greenhouse_id, occurred_on,
      (target_payload->>'durationMin')::integer, (target_payload->>'estimatedLiters')::numeric,
      nullif(trim(target_payload->>'sector'), ''), nullif(trim(target_payload->>'ph'), '')::numeric,
      nullif(trim(target_payload->>'ec'), '')::numeric,
      coalesce(nullif(trim(target_payload->>'notes'), ''), nullif(trim(target_note), ''), target_work.instructions),
      target_actor_user_id, target_actor_user_id, target_work.id
    ) on conflict on constraint irrigation_records_source_task_unique do update set
      occurred_at = excluded.occurred_at, duration_min = excluded.duration_min,
      estimated_liters = excluded.estimated_liters, sector = excluded.sector, ph = excluded.ph,
      ec = excluded.ec, notes = excluded.notes, responsible_user_id = excluded.responsible_user_id,
      updated_at = now() returning id into result_id;
    result_ids := jsonb_build_array(result_id);
  elsif target_work.type = 'aplicacion_foliar'::public.task_type then
    for material in select * from public.task_materials where task_id = target_work.id order by mixing_order, created_at loop
      insert into public.application_records (
        company_id, greenhouse_id, product_id, category, product_name, composition, dose, applied_area,
        safety_interval, reentry_interval, occurred_at, notes, responsible_user_id, created_by,
        source_task_id, source_task_material_id
      ) values (
        target_work.company_id, target_work.greenhouse_id, material.product_id,
        coalesce((select product.category from public.products product where product.id = material.product_id),
          nullif(trim(target_payload->>'category'), ''))::public.application_category,
        material.product_name, null, coalesce(nullif(trim(material.dose), ''), 'No especificada'),
        nullif(trim(target_payload->>'appliedArea'), ''), null, null, occurred_on,
        coalesce(nullif(trim(target_payload->>'notes'), ''), material.notes, target_work.instructions),
        target_actor_user_id, target_actor_user_id, target_work.id, material.id
      ) on conflict on constraint application_records_source_material_unique do update set
        occurred_at = excluded.occurred_at, dose = excluded.dose, applied_area = excluded.applied_area,
        notes = excluded.notes, responsible_user_id = excluded.responsible_user_id, updated_at = now()
      returning id into result_id;
      result_ids := result_ids || jsonb_build_array(result_id);
    end loop;
    if jsonb_array_length(result_ids) = 0 then raise exception 'application_materials_required'; end if;
  elsif target_work.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type) then
    for material in select * from public.task_materials where task_id = target_work.id order by mixing_order, created_at loop
      insert into public.nutrition_records (
        company_id, greenhouse_id, product_id, product_name, dose, method, ph, ec, occurred_at,
        crop_stage, objective, notes, responsible_user_id, created_by, source_task_id, source_task_material_id
      ) values (
        target_work.company_id, target_work.greenhouse_id, material.product_id, material.product_name,
        coalesce(nullif(trim(material.dose), ''), 'No especificada'),
        (target_payload->>'method')::public.nutrition_method,
        nullif(trim(target_payload->>'ph'), '')::numeric, nullif(trim(target_payload->>'ec'), '')::numeric,
        occurred_on, nullif(trim(target_payload->>'cropStage'), '')::public.crop_stage,
        nullif(trim(target_payload->>'objective'), '')::public.nutrition_objective,
        coalesce(nullif(trim(target_payload->>'notes'), ''), material.notes, target_work.instructions),
        target_actor_user_id, target_actor_user_id, target_work.id, material.id
      ) on conflict on constraint nutrition_records_source_material_unique do update set
        occurred_at = excluded.occurred_at, dose = excluded.dose, method = excluded.method, ph = excluded.ph,
        ec = excluded.ec, crop_stage = excluded.crop_stage, objective = excluded.objective,
        notes = excluded.notes, responsible_user_id = excluded.responsible_user_id, updated_at = now()
      returning id into result_id;
      result_ids := result_ids || jsonb_build_array(result_id);
    end loop;
    if jsonb_array_length(result_ids) = 0 then raise exception 'nutrition_products_required'; end if;
  elsif target_work.type = 'cosecha'::public.task_type then
    insert into public.harvest_records (
      company_id, greenhouse_id, occurred_at, kilograms, box_count, box_weight_kg, first_quality_kg,
      second_quality_kg, third_quality_kg, discard_kg, merma_kg, first_quality_boxes, second_quality_boxes,
      third_quality_boxes, merma_boxes, first_quality_price, second_quality_price, third_quality_price,
      estimated_price, destination, notes, responsible_user_id, created_by, source_task_id
    ) values (
      target_work.company_id, target_work.greenhouse_id, occurred_on, (target_payload->>'kilograms')::numeric,
      coalesce((target_payload->>'boxCount')::numeric, 0), coalesce((target_payload->>'boxWeightKg')::numeric, 20),
      coalesce((target_payload->>'firstQualityKg')::numeric, 0), coalesce((target_payload->>'secondQualityKg')::numeric, 0),
      coalesce((target_payload->>'thirdQualityKg')::numeric, 0), coalesce((target_payload->>'mermaKg')::numeric, 0),
      coalesce((target_payload->>'mermaKg')::numeric, 0), coalesce((target_payload->>'firstQualityBoxes')::numeric, 0),
      coalesce((target_payload->>'secondQualityBoxes')::numeric, 0), coalesce((target_payload->>'thirdQualityBoxes')::numeric, 0),
      coalesce((target_payload->>'mermaBoxes')::numeric, 0), coalesce((target_payload->>'firstQualityPrice')::numeric, 0),
      coalesce((target_payload->>'secondQualityPrice')::numeric, 0), coalesce((target_payload->>'thirdQualityPrice')::numeric, 0),
      coalesce((target_payload->>'estimatedPrice')::numeric, 0), nullif(trim(target_payload->>'destination'), ''),
      coalesce(nullif(trim(target_payload->>'notes'), ''), target_work.instructions),
      target_actor_user_id, target_actor_user_id, target_work.id
    ) on conflict on constraint harvest_records_source_task_unique do update set
      occurred_at = excluded.occurred_at, kilograms = excluded.kilograms, box_count = excluded.box_count,
      box_weight_kg = excluded.box_weight_kg, first_quality_kg = excluded.first_quality_kg,
      second_quality_kg = excluded.second_quality_kg, third_quality_kg = excluded.third_quality_kg,
      discard_kg = excluded.discard_kg, merma_kg = excluded.merma_kg,
      estimated_price = excluded.estimated_price, destination = excluded.destination, notes = excluded.notes,
      responsible_user_id = excluded.responsible_user_id, updated_at = now() returning id into result_id;
    result_ids := jsonb_build_array(result_id);
  end if;

  final_status := case when target_work.verification_required then 'completada'::public.task_status else 'verificada'::public.task_status end;
  update public.tasks set status = final_status, blocked_reason = null, started_at = coalesce(started_at, now()),
    completed_at = now(), occurred_at = occurred_on::timestamptz,
    verified_at = case when final_status = 'verificada'::public.task_status then now() else null end,
    verified_by = case when final_status = 'verificada'::public.task_status then target_actor_user_id else null end,
    updated_at = now() where id = target_work.id;
  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_work.company_id, target_work.id, target_actor_user_id, 'completed', nullif(trim(target_note), ''),
    jsonb_build_object('source', 'telegram', 'occurred_at', occurred_on));
  if final_status = 'verificada'::public.task_status then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata)
    values (target_work.company_id, target_work.id, target_actor_user_id, 'verified', jsonb_build_object('source', 'telegram', 'automatic', true));
  end if;
  return jsonb_build_object('workId', target_work.id, 'status', final_status, 'recordIds', result_ids);
end;
$$;

revoke all on function public.create_unplanned_work(uuid, uuid, public.task_type, text, date, jsonb) from public, anon;
grant execute on function public.create_unplanned_work(uuid, uuid, public.task_type, text, date, jsonb) to authenticated;
revoke all on function public.finish_technical_work(uuid, date, text, uuid, text) from public, anon;
revoke all on function public.execute_telegram_work_action(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.execute_telegram_work_action(uuid, uuid, text, text, jsonb) to service_role;
revoke all on function public.complete_application_task(uuid, date, text, jsonb) from public, anon;
grant execute on function public.complete_application_task(uuid, date, text, jsonb) to authenticated;
revoke all on function public.complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text) from public, anon;
grant execute on function public.complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text) to authenticated;
revoke all on function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) to authenticated;
revoke all on function public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
