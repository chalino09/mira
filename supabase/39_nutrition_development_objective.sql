-- mira - 39 Nutrition development objective
-- Ejecutar despues de 38_application_category_expansion.sql.
-- Agrega "desarrollo" como objetivo de nutricion y actualiza la validacion de cierre operativo.

alter type public.nutrition_objective add value if not exists 'desarrollo';

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
returns jsonb
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
  nutrition_record_id uuid;
  nutrition_record_ids jsonb := '[]'::jsonb;
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
  if target_objective is not null and target_objective not in ('desarrollo', 'raiz', 'floracion', 'cuajado', 'engorde', 'calidad') then
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
      updated_at = now()
    returning id into nutrition_record_id;

    nutrition_record_ids := nutrition_record_ids || jsonb_build_array(nutrition_record_id);
  end loop;

  was_completed := target_task.status = 'completada'::public.task_status;
  update public.tasks
  set status = 'completada', blocked_reason = null, started_at = null,
      completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = target_task_id;

  if not was_completed then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
    values (target_task.company_id, target_task_id, auth.uid(), 'completed',
      'Nutricion confirmada y guardada en registros tecnicos',
      jsonb_build_object('product_count', jsonb_array_length(target_products)));
  end if;

  return jsonb_build_object(
    'taskId', target_task_id,
    'recordIds', nutrition_record_ids
  );
end;
$$;

revoke all on function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) from public;
revoke all on function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) from anon;
grant execute on function public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) to authenticated;
