-- mira - 37 Harvest boxes, third quality and quality pricing
-- Ejecutar despues de 36_product_catalog_from_excel.sql.
-- No elimina columnas anteriores: discard_kg queda como compatibilidad y merma_kg
-- es el nombre operativo para los nuevos formularios.

alter table public.harvest_records
add column if not exists box_count numeric(12,2) not null default 0,
add column if not exists box_weight_kg numeric(12,2) not null default 20,
add column if not exists first_quality_boxes numeric(12,2) not null default 0,
add column if not exists second_quality_boxes numeric(12,2) not null default 0,
add column if not exists third_quality_boxes numeric(12,2) not null default 0,
add column if not exists merma_boxes numeric(12,2) not null default 0,
add column if not exists third_quality_kg numeric(12,2) not null default 0,
add column if not exists merma_kg numeric(12,2) not null default 0,
add column if not exists first_quality_price numeric(12,2) not null default 0,
add column if not exists second_quality_price numeric(12,2) not null default 0,
add column if not exists third_quality_price numeric(12,2) not null default 0;

update public.harvest_records
set merma_kg = discard_kg
where merma_kg = 0
  and discard_kg > 0;

drop function if exists public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text);

create or replace function public.complete_harvest_task(
  target_task_id uuid,
  target_occurred_at date,
  target_kilograms numeric,
  target_first_quality_kg numeric default 0,
  target_second_quality_kg numeric default 0,
  target_merma_kg numeric default 0,
  target_estimated_price numeric default 0,
  target_destination text default null,
  target_notes text default null,
  target_box_count numeric default 0,
  target_box_weight_kg numeric default 20,
  target_first_quality_boxes numeric default 0,
  target_second_quality_boxes numeric default 0,
  target_third_quality_boxes numeric default 0,
  target_merma_boxes numeric default 0,
  target_third_quality_kg numeric default 0,
  target_first_quality_price numeric default 0,
  target_second_quality_price numeric default 0,
  target_third_quality_price numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_task public.tasks%rowtype;
  was_completed boolean;
  harvest_record_id uuid;
begin
  select * into target_task
  from public.tasks
  where id = target_task_id;

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
    or coalesce(target_third_quality_kg, 0) < 0 or coalesce(target_merma_kg, 0) < 0
    or coalesce(target_estimated_price, 0) < 0
    or coalesce(target_box_count, 0) < 0 or coalesce(target_box_weight_kg, 0) < 0
    or coalesce(target_first_quality_boxes, 0) < 0 or coalesce(target_second_quality_boxes, 0) < 0
    or coalesce(target_third_quality_boxes, 0) < 0 or coalesce(target_merma_boxes, 0) < 0
    or coalesce(target_first_quality_price, 0) < 0 or coalesce(target_second_quality_price, 0) < 0
    or coalesce(target_third_quality_price, 0) < 0 then
    raise exception 'harvest_values_invalid';
  end if;

  insert into public.harvest_records (
    company_id, greenhouse_id, occurred_at, kilograms, box_count, box_weight_kg,
    first_quality_kg, second_quality_kg, third_quality_kg, discard_kg, merma_kg,
    first_quality_boxes, second_quality_boxes, third_quality_boxes, merma_boxes,
    first_quality_price, second_quality_price, third_quality_price,
    estimated_price, destination, notes, responsible_user_id, created_by, source_task_id
  )
  values (
    target_task.company_id, target_task.greenhouse_id, target_occurred_at, target_kilograms,
    coalesce(target_box_count, 0), coalesce(target_box_weight_kg, 20),
    coalesce(target_first_quality_kg, 0), coalesce(target_second_quality_kg, 0),
    coalesce(target_third_quality_kg, 0), coalesce(target_merma_kg, 0), coalesce(target_merma_kg, 0),
    coalesce(target_first_quality_boxes, 0), coalesce(target_second_quality_boxes, 0),
    coalesce(target_third_quality_boxes, 0), coalesce(target_merma_boxes, 0),
    coalesce(target_first_quality_price, 0), coalesce(target_second_quality_price, 0),
    coalesce(target_third_quality_price, 0), coalesce(target_estimated_price, 0),
    nullif(trim(target_destination), ''),
    coalesce(nullif(trim(target_notes), ''), target_task.instructions),
    auth.uid(), auth.uid(), target_task.id
  )
  on conflict on constraint harvest_records_source_task_unique
  do update set
    occurred_at = excluded.occurred_at,
    kilograms = excluded.kilograms,
    box_count = excluded.box_count,
    box_weight_kg = excluded.box_weight_kg,
    first_quality_kg = excluded.first_quality_kg,
    second_quality_kg = excluded.second_quality_kg,
    third_quality_kg = excluded.third_quality_kg,
    discard_kg = excluded.discard_kg,
    merma_kg = excluded.merma_kg,
    first_quality_boxes = excluded.first_quality_boxes,
    second_quality_boxes = excluded.second_quality_boxes,
    third_quality_boxes = excluded.third_quality_boxes,
    merma_boxes = excluded.merma_boxes,
    first_quality_price = excluded.first_quality_price,
    second_quality_price = excluded.second_quality_price,
    third_quality_price = excluded.third_quality_price,
    estimated_price = excluded.estimated_price,
    destination = excluded.destination,
    notes = excluded.notes,
    responsible_user_id = excluded.responsible_user_id,
    updated_at = now()
  returning id into harvest_record_id;

  was_completed := target_task.status = 'completada'::public.task_status;
  update public.tasks
  set status = 'completada', blocked_reason = null, started_at = null,
      completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = target_task_id;

  if not was_completed then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note)
    values (target_task.company_id, target_task_id, auth.uid(), 'completed',
      'Cosecha confirmada y guardada en registros tecnicos');
  end if;

  return jsonb_build_object(
    'taskId', target_task_id,
    'recordId', harvest_record_id
  );
end;
$$;

revoke all on function public.complete_harvest_task(
  uuid, date, numeric, numeric, numeric, numeric, numeric, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from public;
revoke all on function public.complete_harvest_task(
  uuid, date, numeric, numeric, numeric, numeric, numeric, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) from anon;
grant execute on function public.complete_harvest_task(
  uuid, date, numeric, numeric, numeric, numeric, numeric, text, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;
