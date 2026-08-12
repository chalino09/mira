-- Evita guardar cosechas nuevas cuyas cajas por calidad no reconcilian con el total.
-- No modifica ni vuelve a validar registros históricos.

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
declare
  result jsonb;
  classified_box_count numeric;
begin
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;

  if coalesce(target_box_count, 0) <= 0 then
    raise exception 'harvest_box_count_required';
  end if;

  classified_box_count := coalesce(target_first_quality_boxes, 0)
    + coalesce(target_second_quality_boxes, 0)
    + coalesce(target_third_quality_boxes, 0)
    + coalesce(target_merma_boxes, 0);

  if classified_box_count <> target_box_count then
    raise exception 'harvest_box_reconciliation_required';
  end if;

  result := public.legacy_complete_harvest_task(target_task_id, target_occurred_at, target_kilograms, target_first_quality_kg, target_second_quality_kg, target_merma_kg, target_estimated_price, target_destination, target_notes, target_box_count, target_box_weight_kg, target_first_quality_boxes, target_second_quality_boxes, target_third_quality_boxes, target_merma_boxes, target_third_quality_kg, target_first_quality_price, target_second_quality_price, target_third_quality_price);
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Cosecha confirmada y guardada en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;
