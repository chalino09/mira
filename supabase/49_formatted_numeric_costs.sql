-- mira - 49 Formatted numeric costs
-- Ejecutar despues de 48_execution_product_catalog_sync.sql.
-- Interpreta la coma como separador de miles, igual que los formularios de Mira.

create or replace function public.parse_formatted_numeric(target_value text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when target_value is null then null
    when trim(target_value) ~ '^[0-9]+(\.[0-9]+)?$'
      then trim(target_value)::numeric
    when trim(target_value) ~ '^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$'
      then replace(trim(target_value), ',', '')::numeric
    else null
  end;
$$;

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
  for material in select * from public.task_materials where task_id = target_work.id loop
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

revoke all on function public.parse_formatted_numeric(text) from public, anon;
revoke all on function public.sync_work_automatic_costs(uuid, date, numeric) from public, anon;

