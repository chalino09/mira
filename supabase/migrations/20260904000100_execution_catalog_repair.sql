-- Repair deployed planning functions that discarded productId, recover only
-- unambiguous catalog links on OPEN work, and close changed executions atomically.
-- Historical technical records and closed work are not backfilled.

create or replace function public.create_operational_task_with_staff(
  target_company_id uuid,
  target_week_start date,
  target_greenhouse_id uuid,
  target_type public.task_type,
  target_title text,
  target_scheduled_date date,
  target_scheduled_time time default null,
  target_priority public.task_priority default 'normal',
  target_instructions text default null,
  target_execution_mode public.execution_mode default 'crew',
  target_crew_size integer default null,
  target_assignee_ids uuid[] default array[]::uuid[],
  target_staff_assignee_ids uuid[] default array[]::uuid[],
  target_materials jsonb default '[]'::jsonb,
  target_technical_plan jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan_id uuid;
  new_task_id uuid;
begin
  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if nullif(trim(target_title), '') is null then
    raise exception 'task_title_required';
  end if;

  if target_scheduled_date < target_week_start
    or target_scheduled_date > target_week_start + 6 then
    raise exception 'task_outside_week';
  end if;

  if target_crew_size is not null and target_crew_size < 0 then
    raise exception 'crew_size_invalid';
  end if;

  if coalesce(cardinality(target_assignee_ids), 0) = 0
    and coalesce(cardinality(target_staff_assignee_ids), 0) = 0 then
    raise exception 'assignee_required';
  end if;

  if exists (
    select 1
    from unnest(target_assignee_ids) requested_user_id
    where not exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = requested_user_id
        and member.role = 'manager'
        and member.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  if exists (
    select 1
    from unnest(target_staff_assignee_ids) requested_staff_id
    where not exists (
      select 1
      from public.company_staff staff
      where staff.company_id = target_company_id
        and staff.id = requested_staff_id
        and staff.role = 'manager'
        and staff.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  insert into public.weekly_plans (company_id, week_start, title, created_by)
  values (
    target_company_id,
    target_week_start,
    'Semana ' || to_char(target_week_start, 'IYYY-IW'),
    auth.uid()
  )
  on conflict (company_id, week_start) do update
    set updated_at = now()
  returning id into target_plan_id;

  insert into public.tasks (
    company_id,
    greenhouse_id,
    weekly_plan_id,
    type,
    title,
    scheduled_date,
    scheduled_time,
    status,
    priority,
    instructions,
    execution_mode,
    crew_size,
    responsible_user_id,
    created_by,
    technical_plan
  )
  values (
    target_company_id,
    target_greenhouse_id,
    target_plan_id,
    target_type,
    trim(target_title),
    target_scheduled_date,
    target_scheduled_time,
    'pendiente',
    target_priority,
    nullif(trim(target_instructions), ''),
    target_execution_mode,
    target_crew_size,
    case when coalesce(cardinality(target_assignee_ids), 0) > 0 then target_assignee_ids[1] else null end,
    auth.uid(),
    coalesce(target_technical_plan, '{}'::jsonb)
  )
  returning id into new_task_id;

  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  select target_company_id, new_task_id, assignee_id, auth.uid()
  from unnest(target_assignee_ids) assignee_id;

  insert into public.task_staff_assignments (company_id, task_id, staff_id, assigned_by)
  select target_company_id, new_task_id, staff_id, auth.uid()
  from unnest(target_staff_assignee_ids) staff_id;

  if exists (
    select 1 from jsonb_array_elements(target_materials) requested
    where nullif(trim(requested->>'productId'), '') is not null
      and not exists (
        select 1 from public.products product
        where product.id = nullif(trim(requested->>'productId'), '')::uuid
          and product.company_id = target_company_id
      )
  ) then raise exception 'invalid_material_product'; end if;

  insert into public.task_materials (
    company_id,
    task_id,
    product_id,
    product_name,
    composition,
    dose,
    unit,
    mixing_order,
    notes
  )
  select
    target_company_id,
    new_task_id,
    product.id,
    trim(coalesce(nullif(material->>'productName', ''), product.name)),
    coalesce(nullif(trim(material->>'composition'), ''), product.composition),
    nullif(trim(material->>'dose'), ''),
    nullif(trim(material->>'unit'), ''),
    coalesce((material->>'mixingOrder')::integer, material_index::integer),
    nullif(trim(material->>'notes'), '')
  from jsonb_array_elements(target_materials) with ordinality as items(material, material_index)
  left join public.products product
    on product.id = nullif(material->>'productId', '')::uuid
    and product.company_id = target_company_id
  where nullif(trim(coalesce(nullif(material->>'productName', ''), product.name)), '') is not null;

  insert into public.task_updates (
    company_id,
    task_id,
    actor_user_id,
    update_type,
    metadata
  )
  values (
    target_company_id,
    new_task_id,
    auth.uid(),
    'created',
    jsonb_build_object(
      'assignee_count', cardinality(target_assignee_ids),
      'staff_assignee_count', cardinality(target_staff_assignee_ids)
    )
  );

  return new_task_id;
end;
$$;

create or replace function public.update_operational_task_with_staff(
  target_task_id uuid,
  target_greenhouse_id uuid,
  target_type public.task_type,
  target_title text,
  target_scheduled_date date,
  target_scheduled_time time default null,
  target_priority public.task_priority default 'normal',
  target_instructions text default null,
  target_execution_mode public.execution_mode default 'crew',
  target_crew_size integer default null,
  target_assignee_ids uuid[] default array[]::uuid[],
  target_staff_assignee_ids uuid[] default array[]::uuid[],
  target_materials jsonb default '[]'::jsonb,
  target_technical_plan jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_plan_id uuid;
  target_week_start date;
  plan_is_published boolean := false;
begin
  select task.company_id, task.weekly_plan_id, plan.week_start, plan.status = 'published'
  into target_company_id, target_plan_id, target_week_start, plan_is_published
  from public.tasks task
  left join public.weekly_plans plan on plan.id = task.weekly_plan_id
  where task.id = target_task_id;

  if target_company_id is null then
    raise exception 'task_not_found';
  end if;

  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if nullif(trim(target_title), '') is null then
    raise exception 'task_title_required';
  end if;

  if target_week_start is not null
    and (target_scheduled_date < target_week_start or target_scheduled_date > target_week_start + 6) then
    raise exception 'task_outside_week';
  end if;

  if target_crew_size is not null and target_crew_size < 0 then
    raise exception 'crew_size_invalid';
  end if;

  if coalesce(cardinality(target_assignee_ids), 0) = 0
    and coalesce(cardinality(target_staff_assignee_ids), 0) = 0 then
    raise exception 'assignee_required';
  end if;

  if exists (
    select 1
    from unnest(target_assignee_ids) requested_user_id
    where not exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = requested_user_id
        and member.role = 'manager'
        and member.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  if exists (
    select 1
    from unnest(target_staff_assignee_ids) requested_staff_id
    where not exists (
      select 1
      from public.company_staff staff
      where staff.company_id = target_company_id
        and staff.id = requested_staff_id
        and staff.role = 'manager'
        and staff.status = 'active'
    )
  ) then
    raise exception 'invalid_assignee';
  end if;

  update public.tasks
  set greenhouse_id = target_greenhouse_id,
      type = target_type,
      title = trim(target_title),
      scheduled_date = target_scheduled_date,
      scheduled_time = target_scheduled_time,
      priority = target_priority,
      instructions = nullif(trim(target_instructions), ''),
      execution_mode = target_execution_mode,
      crew_size = target_crew_size,
      responsible_user_id = case when coalesce(cardinality(target_assignee_ids), 0) > 0 then target_assignee_ids[1] else null end,
      technical_plan = coalesce(target_technical_plan, '{}'::jsonb),
      updated_at = now()
  where id = target_task_id;

  delete from public.task_assignments where task_id = target_task_id;
  insert into public.task_assignments (company_id, task_id, user_id, assigned_by)
  select target_company_id, target_task_id, assignee_id, auth.uid()
  from unnest(target_assignee_ids) assignee_id;

  delete from public.task_staff_assignments where task_id = target_task_id;
  insert into public.task_staff_assignments (company_id, task_id, staff_id, assigned_by)
  select target_company_id, target_task_id, staff_id, auth.uid()
  from unnest(target_staff_assignee_ids) staff_id;

  delete from public.task_materials where task_id = target_task_id;
  if exists (
    select 1 from jsonb_array_elements(target_materials) requested
    where nullif(trim(requested->>'productId'), '') is not null
      and not exists (
        select 1 from public.products product
        where product.id = nullif(trim(requested->>'productId'), '')::uuid
          and product.company_id = target_company_id
      )
  ) then raise exception 'invalid_material_product'; end if;

  insert into public.task_materials (
    company_id,
    task_id,
    product_id,
    product_name,
    composition,
    dose,
    unit,
    mixing_order,
    notes
  )
  select
    target_company_id,
    target_task_id,
    product.id,
    trim(coalesce(nullif(material->>'productName', ''), product.name)),
    coalesce(nullif(trim(material->>'composition'), ''), product.composition),
    nullif(trim(material->>'dose'), ''),
    nullif(trim(material->>'unit'), ''),
    coalesce((material->>'mixingOrder')::integer, material_index::integer),
    nullif(trim(material->>'notes'), '')
  from jsonb_array_elements(target_materials) with ordinality as items(material, material_index)
  left join public.products product
    on product.id = nullif(material->>'productId', '')::uuid
    and product.company_id = target_company_id
  where nullif(trim(coalesce(nullif(material->>'productName', ''), product.name)), '') is not null;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note)
  values (target_company_id, target_task_id, auth.uid(), 'comment', 'Actividad actualizada');

  if plan_is_published then
    insert into public.notification_outbox (
      company_id,
      user_id,
      task_id,
      weekly_plan_id,
      channel,
      event_type,
      payload
    )
    select
      assignment.company_id,
      assignment.user_id,
      target_task_id,
      target_plan_id,
      'telegram',
      'task_updated',
      jsonb_build_object('task_id', target_task_id)
    from public.task_assignments assignment
    where assignment.task_id = target_task_id;
  end if;
end;
$$;

-- Recover only exact, case/whitespace-insensitive, unique names in the same tenant.
with catalog as (
  select company_id, regexp_replace(lower(trim(name)), '\s+', ' ', 'g') as name_key,
    (array_agg(id order by id))[1] as product_id
  from public.products
  group by company_id, regexp_replace(lower(trim(name)), '\s+', ' ', 'g')
  having count(*) = 1
)
update public.task_materials material
set product_id = catalog.product_id
from catalog, public.tasks work
where material.product_id is null
  and material.company_id = catalog.company_id
  and regexp_replace(lower(trim(material.product_name)), '\s+', ' ', 'g') = catalog.name_key
  and work.id = material.task_id and work.company_id = material.company_id
  and work.status in ('pendiente', 'en_progreso', 'bloqueada');

create or replace function public.sync_work_execution_materials(
  target_work_id uuid,
  target_materials jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_work public.tasks%rowtype;
  catalog_product public.products%rowtype;
  material_item jsonb;
  material_index bigint;
  material_id_text text;
  material_id uuid;
  selected_product_id uuid;
  candidate_ids uuid[];
  seen_material_ids text[] := '{}';
  result_material_ids jsonb := '[]'::jsonb;
  previous_materials jsonb;
begin
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not coalesce(public.can_operate_work(target_work_id), false) then raise exception 'not_allowed'; end if;
  if target_work.status not in ('pendiente', 'en_progreso', 'bloqueada') then raise exception 'work_is_closed'; end if;
  if target_materials is null or jsonb_typeof(target_materials) <> 'array' then raise exception 'work_materials_required'; end if;
  if jsonb_array_length(target_materials) = 0 then raise exception 'work_materials_required'; end if;

  select coalesce(jsonb_agg(to_jsonb(material) order by material.mixing_order, material.id), '[]'::jsonb)
  into previous_materials from public.task_materials material where material.task_id = target_work.id;

  for material_item, material_index in select value, ordinality from jsonb_array_elements(target_materials) with ordinality loop
    if jsonb_typeof(material_item) <> 'object' then raise exception 'invalid_work_material'; end if;
    if nullif(trim(material_item->>'productName'), '') is null then raise exception 'work_material_product_required'; end if;
    if nullif(trim(material_item->>'dose'), '') is null or nullif(trim(material_item->>'unit'), '') is null then
      raise exception 'work_material_dose_required';
    end if;
    selected_product_id := nullif(trim(material_item->>'productId'), '')::uuid;
    material_id_text := nullif(trim(material_item->>'materialId'), '');
    if material_id_text = any(seen_material_ids) then raise exception 'duplicate_work_material'; end if;
    if material_id_text is not null then seen_material_ids := array_append(seen_material_ids, material_id_text); end if;

    -- Compatibility for already-open forms and legacy tasks. Never guess between
    -- duplicate names or substitute a nonempty foreign/deleted product ID.
    if selected_product_id is null then
      select array_agg(product.id) into candidate_ids from public.products product
      where product.company_id = target_work.company_id
        and regexp_replace(lower(trim(product.name)), '\s+', ' ', 'g') =
          regexp_replace(lower(trim(material_item->>'productName')), '\s+', ' ', 'g');
      if cardinality(candidate_ids) > 1 then raise exception 'ambiguous_material_product'; end if;
      selected_product_id := candidate_ids[1];
    end if;
    select * into catalog_product from public.products product
    where product.id = selected_product_id and product.company_id = target_work.company_id;
    if catalog_product.id is null then raise exception 'invalid_material_product'; end if;

    if material_id_text is null or material_id_text like 'new:%' then
      insert into public.task_materials (company_id, task_id, product_id, product_name, composition, dose, unit, mixing_order, notes)
      values (target_work.company_id, target_work.id, catalog_product.id, catalog_product.name,
        coalesce(catalog_product.composition, nullif(trim(material_item->>'composition'), '')),
        trim(material_item->>'dose'), trim(material_item->>'unit'), material_index::integer,
        nullif(trim(material_item->>'notes'), ''))
      returning id into material_id;
    else
      material_id := material_id_text::uuid;
      update public.task_materials material
      set product_id = catalog_product.id, product_name = catalog_product.name,
        composition = coalesce(catalog_product.composition, nullif(trim(material_item->>'composition'), '')),
        dose = trim(material_item->>'dose'), unit = trim(material_item->>'unit'), mixing_order = material_index::integer
      where material.id = material_id and material.task_id = target_work.id and material.company_id = target_work.company_id
      returning material.id into material_id;
      if material_id is null then raise exception 'invalid_work_material'; end if;
    end if;
    result_material_ids := result_material_ids || jsonb_build_array(material_id);
  end loop;

  -- Retain the previous planned values and the actual selection for audit/review.
  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_work.company_id, target_work.id, auth.uid(), 'comment', 'Productos confirmados al registrar lo realizado.',
    jsonb_build_object('source', 'execution_materials', 'previousMaterials', previous_materials,
      'appliedMaterials', target_materials, 'materialIds', result_material_ids));
  return jsonb_build_object('workId', target_work.id, 'materialIds', result_material_ids);
end;
$$;

-- One request/transaction covers review, product synchronization, records and
-- completion. A later validation failure rolls back the earlier writes as well.
create or replace function public.complete_nutrition_execution(
  target_task_id uuid, target_occurred_at date, target_method text,
  target_crop_stage text default null, target_objective text default null,
  target_ph numeric default null, target_ec numeric default null, target_notes text default null,
  target_products jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare synced jsonb; products jsonb;
begin
  perform public.require_work_verification(target_task_id);
  synced := public.sync_work_execution_materials(target_task_id, target_products);
  select jsonb_agg(value || jsonb_build_object(
    'materialId', synced->'materialIds'->>(ordinality::integer - 1),
    'dose', concat_ws(' ', trim(value->>'dose'), trim(value->>'unit'))
  ) order by ordinality) into products
  from jsonb_array_elements(target_products) with ordinality;
  return public.complete_nutrition_task(target_task_id, target_occurred_at, target_method,
    target_crop_stage, target_objective, target_ph, target_ec, target_notes, products);
end;
$$;

create or replace function public.complete_application_execution(
  target_task_id uuid, target_occurred_at date, target_applied_area text default null,
  target_applications jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare synced jsonb; applications jsonb;
begin
  perform public.require_work_verification(target_task_id);
  synced := public.sync_work_execution_materials(target_task_id, target_applications);
  select jsonb_agg(value || jsonb_build_object(
    'materialId', synced->'materialIds'->>(ordinality::integer - 1),
    'dose', concat_ws(' ', trim(value->>'dose'), trim(value->>'unit'))
  ) order by ordinality) into applications
  from jsonb_array_elements(target_applications) with ordinality;
  return public.complete_application_task(target_task_id, target_occurred_at, target_applied_area, applications);
end;
$$;

revoke all on function public.sync_work_execution_materials(uuid, jsonb) from public, anon;
grant execute on function public.sync_work_execution_materials(uuid, jsonb) to authenticated;
revoke all on function public.complete_nutrition_execution(uuid, date, text, text, text, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.complete_nutrition_execution(uuid, date, text, text, text, numeric, numeric, text, jsonb) to authenticated;
revoke all on function public.complete_application_execution(uuid, date, text, jsonb) from public, anon;
grant execute on function public.complete_application_execution(uuid, date, text, jsonb) to authenticated;
-- Existing planning grants are preserved by CREATE OR REPLACE, but explicitly
-- enforce the same authenticated-only entry points on manually updated installs.
revoke all on function public.create_operational_task_with_staff(uuid, date, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.create_operational_task_with_staff(uuid, date, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], uuid[], jsonb, jsonb) to authenticated;
revoke all on function public.update_operational_task_with_staff(uuid, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.update_operational_task_with_staff(uuid, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], uuid[], jsonb, jsonb) to authenticated;

-- Only applied materials can generate stock consumption. The original plan may
-- contain products that were omitted from the actual execution.
create or replace function public.sync_work_automatic_costs(
  target_work_id uuid,
  target_occurred_at date,
  target_water_liters numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  material public.task_materials%rowtype;
  item public.inventory_items%rowtype;
  quantity_value numeric;
  labor_hours numeric;
  energy_kwh numeric;
  applied_count integer := 0;
begin
  select * into target_work from public.tasks where id = target_work_id;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if target_occurred_at is null then raise exception 'work_occurred_at_required'; end if;

  -- Las dosis numericas con la misma unidad que el articulo se vuelven consumo.
  for material in
    select planned.* from public.task_materials planned
    where planned.task_id = target_work.id
      and (
        (target_work.type in ('fertirriego', 'fertilizacion') and exists (
          select 1 from public.nutrition_records actual
          where actual.source_task_id = target_work.id and actual.source_task_material_id = planned.id
        ))
        or (target_work.type = 'aplicacion_foliar' and exists (
          select 1 from public.application_records actual
          where actual.source_task_id = target_work.id and actual.source_task_material_id = planned.id
        ))
        or target_work.type not in ('fertirriego', 'fertilizacion', 'aplicacion_foliar')
      )
  loop
    if material.product_id is null or material.dose is null or material.unit is null then
      continue;
    end if;

    quantity_value := public.parse_formatted_numeric(material.dose);
    if quantity_value is null or quantity_value <= 0 then continue; end if;

    select * into item from public.inventory_items
    where company_id = target_work.company_id and product_id = material.product_id
      and kind = 'material' and is_active;
    if item.id is null or lower(trim(item.base_unit)) <> lower(trim(material.unit)) then continue; end if;

    perform public.record_work_inventory_consumption(
      target_work.id, item.id, quantity_value, item.base_unit, target_occurred_at,
      'material:' || target_work.id::text || ':' || material.id::text,
      'Consumo automatico desde Work', material.id
    );
    applied_count := applied_count + 1;
  end loop;

  if target_water_liters is not null and target_water_liters > 0 then
    perform public.record_resource_work_cost(
      target_work.company_id, target_work.id, target_work.greenhouse_id, 'water', target_water_liters,
      'L', target_occurred_at, 'water:' || target_work.id::text, 'Costo automatico de agua'
    );
  end if;

  energy_kwh := public.parse_formatted_numeric(target_work.technical_plan->>'energyKwh');
  if energy_kwh is not null and energy_kwh > 0 then
    perform public.record_resource_work_cost(
      target_work.company_id, target_work.id, target_work.greenhouse_id, 'energy', energy_kwh,
      'kWh', target_occurred_at, 'energy:' || target_work.id::text, 'Costo automatico de energia'
    );
  end if;

  labor_hours := public.parse_formatted_numeric(target_work.technical_plan->>'laborHours');
  if labor_hours is not null and labor_hours > 0 then
    labor_hours := labor_hours * greatest(coalesce(target_work.crew_size, 1), 1);
    perform public.record_resource_work_cost(
      target_work.company_id, target_work.id, target_work.greenhouse_id, 'labor', labor_hours,
      'h', target_occurred_at, 'labor:' || target_work.id::text, 'Costo automatico de mano de obra'
    );
  end if;

  return jsonb_build_object('workId', target_work.id, 'materialConsumptions', applied_count);
end;
$$;

notify pgrst, 'reload schema';
