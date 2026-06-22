-- mira - 12 Operation technical records
-- Ejecutar después de 11_telegram_connection.sql.
-- Conserva la planeación y crea el registro técnico de aplicaciones, riegos,
-- nutrición y cosechas únicamente cuando se confirman como realizados.

alter table public.application_records
add column if not exists source_task_id uuid,
add column if not exists source_task_material_id uuid;

alter table public.irrigation_records
add column if not exists sector text,
add column if not exists source_task_id uuid;

alter table public.nutrition_records
add column if not exists source_task_id uuid,
add column if not exists source_task_material_id uuid;

alter table public.harvest_records
add column if not exists source_task_id uuid;

alter table public.tasks
add column if not exists technical_plan jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.application_records
  add constraint application_records_source_task_fk
  foreign key (source_task_id)
  references public.tasks(id)
  on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.application_records
  add constraint application_records_source_material_fk
  foreign key (source_task_material_id)
  references public.task_materials(id)
  on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.application_records
  add constraint application_records_source_material_unique
  unique (source_task_material_id);
exception when duplicate_object then null;
end $$;

create index if not exists application_records_source_task_idx
on public.application_records(source_task_id);

do $$ begin
  alter table public.irrigation_records
  add constraint irrigation_records_source_task_fk
  foreign key (source_task_id) references public.tasks(id) on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.irrigation_records
  add constraint irrigation_records_source_task_unique unique (source_task_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.nutrition_records
  add constraint nutrition_records_source_task_fk
  foreign key (source_task_id) references public.tasks(id) on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.nutrition_records
  add constraint nutrition_records_source_material_fk
  foreign key (source_task_material_id) references public.task_materials(id) on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.nutrition_records
  add constraint nutrition_records_source_material_unique unique (source_task_material_id);
exception when duplicate_object then null;
end $$;

create index if not exists nutrition_records_source_task_idx
on public.nutrition_records(source_task_id);

do $$ begin
  alter table public.harvest_records
  add constraint harvest_records_source_task_fk
  foreign key (source_task_id) references public.tasks(id) on delete set null;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.harvest_records
  add constraint harvest_records_source_task_unique unique (source_task_id);
exception when duplicate_object then null;
end $$;

create or replace function public.complete_application_task(
  target_task_id uuid,
  target_occurred_at date,
  target_applied_area text default null,
  target_applications jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task public.tasks%rowtype;
  target_material public.task_materials%rowtype;
  application_item jsonb;
  material_id uuid;
  category_value text;
  product_name_value text;
  dose_value text;
  was_completed boolean;
begin
  select * into target_task
  from public.tasks
  where id = target_task_id;

  if target_task.id is null then
    raise exception 'task_not_found';
  end if;

  if not public.can_manage_company(target_task.company_id)
    and not public.is_task_assignee(target_task_id)
    and target_task.responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;

  if target_task.type <> 'aplicacion_foliar'::public.task_type then
    raise exception 'task_is_not_application';
  end if;

  if target_occurred_at is null then
    raise exception 'application_date_required';
  end if;

  if jsonb_typeof(target_applications) <> 'array'
    or jsonb_array_length(target_applications) = 0 then
    raise exception 'application_materials_required';
  end if;

  for application_item in
    select value from jsonb_array_elements(target_applications)
  loop
    material_id := nullif(trim(application_item->>'materialId'), '')::uuid;
    category_value := nullif(trim(application_item->>'category'), '');

    if material_id is null then
      raise exception 'application_material_required';
    end if;

    select * into target_material
    from public.task_materials
    where id = material_id
      and task_id = target_task_id;

    if target_material.id is null then
      raise exception 'invalid_application_material';
    end if;

    if category_value is null or category_value not in (
      'bioestimulante',
      'fungicida',
      'insecticida',
      'fertilizante',
      'microorganismos',
      'corrector'
    ) then
      raise exception 'invalid_application_category';
    end if;

    product_name_value := coalesce(
      nullif(trim(application_item->>'productName'), ''),
      target_material.product_name
    );
    dose_value := coalesce(
      nullif(trim(application_item->>'dose'), ''),
      target_material.dose
    );

    if product_name_value is null then
      raise exception 'application_product_required';
    end if;

    if dose_value is null then
      raise exception 'application_dose_required';
    end if;

    insert into public.application_records (
      company_id,
      greenhouse_id,
      product_id,
      category,
      product_name,
      composition,
      dose,
      applied_area,
      safety_interval,
      reentry_interval,
      occurred_at,
      notes,
      responsible_user_id,
      created_by,
      source_task_id,
      source_task_material_id
    )
    values (
      target_task.company_id,
      target_task.greenhouse_id,
      target_material.product_id,
      category_value::public.application_category,
      product_name_value,
      nullif(trim(application_item->>'composition'), ''),
      dose_value,
      nullif(trim(target_applied_area), ''),
      nullif(trim(application_item->>'safetyInterval'), ''),
      nullif(trim(application_item->>'reentryInterval'), ''),
      target_occurred_at,
      coalesce(
        nullif(trim(application_item->>'notes'), ''),
        target_material.notes,
        target_task.instructions
      ),
      auth.uid(),
      auth.uid(),
      target_task_id,
      target_material.id
    )
    on conflict on constraint application_records_source_material_unique
    do update set
      category = excluded.category,
      product_name = excluded.product_name,
      composition = excluded.composition,
      dose = excluded.dose,
      applied_area = excluded.applied_area,
      safety_interval = excluded.safety_interval,
      reentry_interval = excluded.reentry_interval,
      occurred_at = excluded.occurred_at,
      notes = excluded.notes,
      responsible_user_id = excluded.responsible_user_id,
      updated_at = now();
  end loop;

  was_completed := target_task.status = 'completada'::public.task_status;

  update public.tasks
  set status = 'completada',
      blocked_reason = null,
      started_at = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = target_task_id;

  if not was_completed then
    insert into public.task_updates (
      company_id,
      task_id,
      actor_user_id,
      update_type,
      note,
      metadata
    )
    values (
      target_task.company_id,
      target_task_id,
      auth.uid(),
      'completed',
      'Aplicación confirmada y guardada en registros técnicos',
      jsonb_build_object('application_count', jsonb_array_length(target_applications))
    );
  end if;
end;
$$;

revoke all on function public.complete_application_task(uuid, date, text, jsonb) from public;
grant execute on function public.complete_application_task(uuid, date, text, jsonb) to authenticated;

create or replace function public.complete_irrigation_task(
  target_task_id uuid,
  target_occurred_at date,
  target_duration_min integer,
  target_estimated_liters numeric,
  target_sector text default null,
  target_ph numeric default null,
  target_ec numeric default null,
  target_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task public.tasks%rowtype;
  was_completed boolean;
begin
  select * into target_task from public.tasks where id = target_task_id;

  if target_task.id is null then raise exception 'task_not_found'; end if;
  if not public.can_manage_company(target_task.company_id)
    and not public.is_task_assignee(target_task_id)
    and target_task.responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if target_task.type <> 'riego'::public.task_type then raise exception 'task_is_not_irrigation'; end if;
  if target_occurred_at is null then raise exception 'irrigation_date_required'; end if;
  if target_duration_min is null or target_duration_min <= 0 then raise exception 'irrigation_duration_required'; end if;
  if target_estimated_liters is null or target_estimated_liters <= 0 then raise exception 'irrigation_liters_required'; end if;

  insert into public.irrigation_records (
    company_id, greenhouse_id, occurred_at, duration_min, estimated_liters,
    sector, ph, ec, notes, responsible_user_id, created_by, source_task_id
  )
  values (
    target_task.company_id, target_task.greenhouse_id, target_occurred_at,
    target_duration_min, target_estimated_liters, nullif(trim(target_sector), ''),
    target_ph, target_ec, coalesce(nullif(trim(target_notes), ''), target_task.instructions),
    auth.uid(), auth.uid(), target_task_id
  )
  on conflict on constraint irrigation_records_source_task_unique
  do update set
    occurred_at = excluded.occurred_at,
    duration_min = excluded.duration_min,
    estimated_liters = excluded.estimated_liters,
    sector = excluded.sector,
    ph = excluded.ph,
    ec = excluded.ec,
    notes = excluded.notes,
    responsible_user_id = excluded.responsible_user_id,
    updated_at = now();

  was_completed := target_task.status = 'completada'::public.task_status;
  update public.tasks
  set status = 'completada', blocked_reason = null, started_at = null,
      completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = target_task_id;

  if not was_completed then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note)
    values (target_task.company_id, target_task_id, auth.uid(), 'completed',
      'Riego confirmado y guardado en registros técnicos');
  end if;
end;
$$;

revoke all on function public.complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text) from public;
grant execute on function public.complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text) to authenticated;

create or replace function public.complete_nutrition_task(
  target_task_id uuid,
  target_occurred_at date,
  target_method text,
  target_crop_stage text default null,
  target_objective text default null,
  target_ph numeric default null,
  target_ec numeric default null,
  target_notes text default null,
  target_products jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task public.tasks%rowtype;
  target_material public.task_materials%rowtype;
  product_item jsonb;
  material_id uuid;
  product_name_value text;
  dose_value text;
  was_completed boolean;
begin
  select * into target_task from public.tasks where id = target_task_id;

  if target_task.id is null then raise exception 'task_not_found'; end if;
  if not public.can_manage_company(target_task.company_id)
    and not public.is_task_assignee(target_task_id)
    and target_task.responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if target_task.type not in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type) then
    raise exception 'task_is_not_nutrition';
  end if;
  if target_occurred_at is null then raise exception 'nutrition_date_required'; end if;
  if target_method is null or target_method not in ('fertirriego', 'foliar', 'drench') then
    raise exception 'invalid_nutrition_method';
  end if;
  if target_crop_stage is not null and target_crop_stage not in ('vegetativo', 'floracion', 'cuajado', 'produccion', 'descanso') then
    raise exception 'invalid_crop_stage';
  end if;
  if target_objective is not null and target_objective not in ('raiz', 'floracion', 'cuajado', 'engorde', 'calidad') then
    raise exception 'invalid_nutrition_objective';
  end if;
  if jsonb_typeof(target_products) <> 'array' or jsonb_array_length(target_products) = 0 then
    raise exception 'nutrition_products_required';
  end if;

  for product_item in select value from jsonb_array_elements(target_products)
  loop
    material_id := nullif(trim(product_item->>'materialId'), '')::uuid;
    if material_id is null then raise exception 'nutrition_material_required'; end if;

    select * into target_material
    from public.task_materials
    where id = material_id and task_id = target_task_id;
    if target_material.id is null then raise exception 'invalid_nutrition_material'; end if;

    product_name_value := coalesce(nullif(trim(product_item->>'productName'), ''), target_material.product_name);
    dose_value := coalesce(nullif(trim(product_item->>'dose'), ''), target_material.dose);
    if product_name_value is null then raise exception 'nutrition_product_required'; end if;
    if dose_value is null then raise exception 'nutrition_dose_required'; end if;

    insert into public.nutrition_records (
      company_id, greenhouse_id, product_id, product_name, dose, method, ph, ec,
      occurred_at, crop_stage, objective, notes, responsible_user_id, created_by,
      source_task_id, source_task_material_id
    )
    values (
      target_task.company_id, target_task.greenhouse_id, target_material.product_id,
      product_name_value, dose_value, target_method::public.nutrition_method,
      target_ph, target_ec, target_occurred_at,
      target_crop_stage::public.crop_stage, target_objective::public.nutrition_objective,
      coalesce(nullif(trim(target_notes), ''), target_material.notes, target_task.instructions),
      auth.uid(), auth.uid(), target_task_id, target_material.id
    )
    on conflict on constraint nutrition_records_source_material_unique
    do update set
      product_name = excluded.product_name,
      dose = excluded.dose,
      method = excluded.method,
      ph = excluded.ph,
      ec = excluded.ec,
      occurred_at = excluded.occurred_at,
      crop_stage = excluded.crop_stage,
      objective = excluded.objective,
      notes = excluded.notes,
      responsible_user_id = excluded.responsible_user_id,
      updated_at = now();
  end loop;

  was_completed := target_task.status = 'completada'::public.task_status;
  update public.tasks
  set status = 'completada', blocked_reason = null, started_at = null,
      completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = target_task_id;

  if not was_completed then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
    values (target_task.company_id, target_task_id, auth.uid(), 'completed',
      'Nutrición confirmada y guardada en registros técnicos',
      jsonb_build_object('product_count', jsonb_array_length(target_products)));
  end if;
end;
$$;

revoke all on function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) from public;
grant execute on function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) to authenticated;

create or replace function public.complete_harvest_task(
  target_task_id uuid,
  target_occurred_at date,
  target_kilograms numeric,
  target_first_quality_kg numeric default 0,
  target_second_quality_kg numeric default 0,
  target_discard_kg numeric default 0,
  target_estimated_price numeric default 0,
  target_destination text default null,
  target_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task public.tasks%rowtype;
  was_completed boolean;
begin
  select * into target_task from public.tasks where id = target_task_id;

  if target_task.id is null then raise exception 'task_not_found'; end if;
  if not public.can_manage_company(target_task.company_id)
    and not public.is_task_assignee(target_task_id)
    and target_task.responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if target_task.type <> 'cosecha'::public.task_type then raise exception 'task_is_not_harvest'; end if;
  if target_occurred_at is null then raise exception 'harvest_date_required'; end if;
  if target_kilograms is null or target_kilograms <= 0 then raise exception 'harvest_kilograms_required'; end if;
  if coalesce(target_first_quality_kg, 0) < 0 or coalesce(target_second_quality_kg, 0) < 0
    or coalesce(target_discard_kg, 0) < 0 or coalesce(target_estimated_price, 0) < 0 then
    raise exception 'harvest_values_invalid';
  end if;

  insert into public.harvest_records (
    company_id, greenhouse_id, occurred_at, kilograms, first_quality_kg,
    second_quality_kg, discard_kg, estimated_price, destination, notes,
    responsible_user_id, created_by, source_task_id
  )
  values (
    target_task.company_id, target_task.greenhouse_id, target_occurred_at,
    target_kilograms, coalesce(target_first_quality_kg, 0),
    coalesce(target_second_quality_kg, 0), coalesce(target_discard_kg, 0),
    coalesce(target_estimated_price, 0), nullif(trim(target_destination), ''),
    coalesce(nullif(trim(target_notes), ''), target_task.instructions),
    auth.uid(), auth.uid(), target_task_id
  )
  on conflict on constraint harvest_records_source_task_unique
  do update set
    occurred_at = excluded.occurred_at,
    kilograms = excluded.kilograms,
    first_quality_kg = excluded.first_quality_kg,
    second_quality_kg = excluded.second_quality_kg,
    discard_kg = excluded.discard_kg,
    estimated_price = excluded.estimated_price,
    destination = excluded.destination,
    notes = excluded.notes,
    responsible_user_id = excluded.responsible_user_id,
    updated_at = now();

  was_completed := target_task.status = 'completada'::public.task_status;
  update public.tasks
  set status = 'completada', blocked_reason = null, started_at = null,
      completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = target_task_id;

  if not was_completed then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note)
    values (target_task.company_id, target_task_id, auth.uid(), 'completed',
      'Cosecha confirmada y guardada en registros técnicos');
  end if;
end;
$$;

revoke all on function public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text) from public;
grant execute on function public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text) to authenticated;

create or replace function public.create_operational_task_with_plan(
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
  target_materials jsonb default '[]'::jsonb,
  target_technical_plan jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_task_id uuid;
begin
  select public.create_operational_task(
    target_company_id,
    target_week_start,
    target_greenhouse_id,
    target_type,
    target_title,
    target_scheduled_date,
    target_scheduled_time,
    target_priority,
    target_instructions,
    target_execution_mode,
    target_crew_size,
    target_assignee_ids,
    target_materials
  ) into new_task_id;

  update public.tasks
  set technical_plan = coalesce(target_technical_plan, '{}'::jsonb), updated_at = now()
  where id = new_task_id;

  return new_task_id;
end;
$$;

revoke all on function public.create_operational_task_with_plan(uuid, date, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], jsonb, jsonb) from public;
grant execute on function public.create_operational_task_with_plan(uuid, date, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], jsonb, jsonb) to authenticated;

create or replace function public.update_operational_task_with_plan(
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
  target_materials jsonb default '[]'::jsonb,
  target_technical_plan jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.update_operational_task(
    target_task_id,
    target_greenhouse_id,
    target_type,
    target_title,
    target_scheduled_date,
    target_scheduled_time,
    target_priority,
    target_instructions,
    target_execution_mode,
    target_crew_size,
    target_assignee_ids,
    target_materials
  );

  update public.tasks
  set technical_plan = coalesce(target_technical_plan, '{}'::jsonb), updated_at = now()
  where id = target_task_id;
end;
$$;

revoke all on function public.update_operational_task_with_plan(uuid, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], jsonb, jsonb) from public;
grant execute on function public.update_operational_task_with_plan(uuid, uuid, public.task_type, text, date, time, public.task_priority, text, public.execution_mode, integer, uuid[], jsonb, jsonb) to authenticated;
