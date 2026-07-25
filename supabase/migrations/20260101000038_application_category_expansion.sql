-- mira - 38 Application category expansion
-- Ejecutar despues de 37_harvest_boxes_quality_pricing.sql.
-- Amplia categorias de aplicaciones y actualiza la validacion usada al confirmar operaciones.

alter type public.application_category add value if not exists 'acondicionador_agua';
alter type public.application_category add value if not exists 'adyuvante_coadyuvante';
alter type public.application_category add value if not exists 'acaricida';
alter type public.application_category add value if not exists 'nematicida';
alter type public.application_category add value if not exists 'bactericida';
alter type public.application_category add value if not exists 'sanitizante_desinfectante';
alter type public.application_category add value if not exists 'regulador_crecimiento';

create or replace function public.complete_application_task(
  target_task_id uuid,
  target_occurred_at date,
  target_applied_area text default null,
  target_applications jsonb default '[]'::jsonb
)
returns jsonb
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
  application_record_id uuid;
  application_record_ids jsonb := '[]'::jsonb;
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
      'fertilizante',
      'bioestimulante',
      'corrector',
      'acondicionador_agua',
      'adyuvante_coadyuvante',
      'microorganismos',
      'fungicida',
      'insecticida',
      'acaricida',
      'nematicida',
      'bactericida',
      'sanitizante_desinfectante',
      'regulador_crecimiento'
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
      updated_at = now()
    returning id into application_record_id;

    application_record_ids := application_record_ids || jsonb_build_array(application_record_id);
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
      'Aplicacion confirmada y guardada en registros tecnicos',
      jsonb_build_object('application_count', jsonb_array_length(target_applications))
    );
  end if;

  return jsonb_build_object(
    'taskId', target_task_id,
    'recordIds', application_record_ids
  );
end;
$$;

revoke all on function public.complete_application_task(uuid, date, text, jsonb) from public;
revoke all on function public.complete_application_task(uuid, date, text, jsonb) from anon;
grant execute on function public.complete_application_task(uuid, date, text, jsonb) to authenticated;
