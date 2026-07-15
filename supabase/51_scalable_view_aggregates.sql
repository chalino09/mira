-- mira - 51 Scalable view aggregates
-- Ejecutar después de 50_public_route_identifiers.sql.
-- Agrega índices para las consultas por vista y un RPC agregado que evita
-- descargar historiales completos en Costos y Reportes.

create extension if not exists pg_trgm;

create index if not exists tasks_company_greenhouse_date_status_idx
on public.tasks(company_id, greenhouse_id, scheduled_date, status, id);

create index if not exists irrigation_company_greenhouse_date_id_idx
on public.irrigation_records(company_id, greenhouse_id, occurred_at desc, id desc);

create index if not exists nutrition_company_greenhouse_date_id_idx
on public.nutrition_records(company_id, greenhouse_id, occurred_at desc, id desc);

create index if not exists applications_company_greenhouse_date_id_idx
on public.application_records(company_id, greenhouse_id, occurred_at desc, id desc);

create index if not exists pest_company_greenhouse_date_id_idx
on public.pest_alerts(company_id, greenhouse_id, detected_at desc, id desc);

create index if not exists pest_company_status_severity_date_idx
on public.pest_alerts(company_id, case_status, severity, detected_at desc, id desc);

create index if not exists harvest_company_greenhouse_date_id_idx
on public.harvest_records(company_id, greenhouse_id, occurred_at desc, id desc);

create index if not exists costs_company_greenhouse_date_id_idx
on public.cost_records(company_id, greenhouse_id, occurred_at desc, id desc);

create index if not exists costs_company_category_date_id_idx
on public.cost_records(company_id, category, occurred_at desc, id desc);

create index if not exists applications_product_name_trgm_idx
on public.application_records using gin (product_name gin_trgm_ops);

create index if not exists applications_composition_trgm_idx
on public.application_records using gin (composition gin_trgm_ops)
where composition is not null;

create index if not exists applications_applied_area_trgm_idx
on public.application_records using gin (applied_area gin_trgm_ops)
where applied_area is not null;

create index if not exists nutrition_product_name_trgm_idx
on public.nutrition_records using gin (product_name gin_trgm_ops);

create index if not exists nutrition_notes_trgm_idx
on public.nutrition_records using gin (notes gin_trgm_ops)
where notes is not null;

create index if not exists irrigation_sector_trgm_idx
on public.irrigation_records using gin (sector gin_trgm_ops)
where sector is not null;

create index if not exists irrigation_notes_trgm_idx
on public.irrigation_records using gin (notes gin_trgm_ops)
where notes is not null;

create index if not exists pest_problem_trgm_idx
on public.pest_alerts using gin (problem gin_trgm_ops);

create index if not exists pest_affected_zone_trgm_idx
on public.pest_alerts using gin (affected_zone gin_trgm_ops)
where affected_zone is not null;

create index if not exists costs_notes_trgm_idx
on public.cost_records using gin (notes gin_trgm_ops)
where notes is not null;

create or replace function public.get_view_operational_aggregates(
  target_company_id uuid,
  target_greenhouse_id uuid default null,
  target_start_date date default null,
  target_end_date date default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_company_member(target_company_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if target_start_date is not null
     and target_end_date is not null
     and target_start_date > target_end_date then
    raise exception 'invalid_view_period' using errcode = '22023';
  end if;

  if target_greenhouse_id is not null
     and not public.can_access_greenhouse(target_company_id, target_greenhouse_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  with accessible_costs as (
    select cost.category, cost.amount
    from public.cost_records cost
    where cost.company_id = target_company_id
      and (target_greenhouse_id is null or cost.greenhouse_id = target_greenhouse_id)
      and (cost.greenhouse_id is not null and public.can_access_greenhouse(target_company_id, cost.greenhouse_id)
        or cost.greenhouse_id is null and public.can_manage_company(target_company_id))
      and (target_start_date is null or cost.occurred_at >= target_start_date)
      and (target_end_date is null or cost.occurred_at <= target_end_date)
  ), cost_totals as (
    select coalesce(sum(amount), 0)::numeric as total_cost
    from accessible_costs
  ), cost_categories as (
    select category::text as category, sum(amount)::numeric as amount
    from accessible_costs
    group by category
    order by amount desc, category
  ), accessible_harvests as (
    select
      harvest.occurred_at,
      harvest.kilograms,
      harvest.box_count,
      coalesce(harvest.first_quality_kg, 0) + coalesce(harvest.second_quality_kg, 0) + coalesce(harvest.third_quality_kg, 0) as commercial_kg,
      case
        when coalesce(harvest.first_quality_kg, 0) * coalesce(harvest.first_quality_price, 0)
           + coalesce(harvest.second_quality_kg, 0) * coalesce(harvest.second_quality_price, 0)
           + coalesce(harvest.third_quality_kg, 0) * coalesce(harvest.third_quality_price, 0) <> 0
        then coalesce(harvest.first_quality_kg, 0) * coalesce(harvest.first_quality_price, 0)
           + coalesce(harvest.second_quality_kg, 0) * coalesce(harvest.second_quality_price, 0)
           + coalesce(harvest.third_quality_kg, 0) * coalesce(harvest.third_quality_price, 0)
        else (coalesce(harvest.first_quality_kg, 0) + coalesce(harvest.second_quality_kg, 0) + coalesce(harvest.third_quality_kg, 0))
           * coalesce(harvest.estimated_price, 0)
      end as estimated_revenue
    from public.harvest_records harvest
    where harvest.company_id = target_company_id
      and (target_greenhouse_id is null or harvest.greenhouse_id = target_greenhouse_id)
      and public.can_access_greenhouse(target_company_id, harvest.greenhouse_id)
      and (target_start_date is null or harvest.occurred_at >= target_start_date)
      and (target_end_date is null or harvest.occurred_at <= target_end_date)
  ), harvest_totals as (
    select
      coalesce(sum(kilograms), 0)::numeric as total_kg,
      coalesce(sum(box_count), 0)::numeric as total_boxes,
      coalesce(sum(commercial_kg), 0)::numeric as commercial_kg,
      coalesce(sum(estimated_revenue), 0)::numeric as estimated_revenue
    from accessible_harvests
  ), harvest_daily as (
    select occurred_at, sum(kilograms)::numeric as kilograms
    from accessible_harvests
    group by occurred_at
    order by occurred_at desc
    limit 31
  ), accessible_irrigation as (
    select irrigation.occurred_at, irrigation.estimated_liters, irrigation.duration_min, irrigation.ec
    from public.irrigation_records irrigation
    where irrigation.company_id = target_company_id
      and (target_greenhouse_id is null or irrigation.greenhouse_id = target_greenhouse_id)
      and public.can_access_greenhouse(target_company_id, irrigation.greenhouse_id)
      and (target_start_date is null or irrigation.occurred_at >= target_start_date)
      and (target_end_date is null or irrigation.occurred_at <= target_end_date)
  ), irrigation_totals as (
    select
      coalesce(sum(estimated_liters), 0)::numeric as total_liters,
      coalesce(avg(duration_min), 0)::numeric as average_duration,
      avg(ec)::numeric as average_ec
    from accessible_irrigation
  ), irrigation_daily as (
    select occurred_at, sum(estimated_liters)::numeric as liters
    from accessible_irrigation
    group by occurred_at
    order by occurred_at desc
    limit 31
  )
  select jsonb_build_object(
    'totalCost', cost_totals.total_cost,
    'costByCategory', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', amount)) from cost_categories), '[]'::jsonb),
    'totalHarvestKg', harvest_totals.total_kg,
    'totalHarvestBoxes', harvest_totals.total_boxes,
    'commercialKg', harvest_totals.commercial_kg,
    'estimatedRevenue', harvest_totals.estimated_revenue,
    'averagePrice', case when harvest_totals.commercial_kg > 0 then harvest_totals.estimated_revenue / harvest_totals.commercial_kg else 0 end,
    'harvestDaily', coalesce((select jsonb_agg(jsonb_build_object('date', occurred_at, 'kg', kilograms) order by occurred_at asc) from harvest_daily), '[]'::jsonb),
    'totalIrrigationLiters', irrigation_totals.total_liters,
    'averageIrrigationDuration', irrigation_totals.average_duration,
    'averageEc', irrigation_totals.average_ec,
    'irrigationDaily', coalesce((select jsonb_agg(jsonb_build_object('date', occurred_at, 'liters', liters) order by occurred_at asc) from irrigation_daily), '[]'::jsonb)
  )
  into result
  from cost_totals, harvest_totals, irrigation_totals;

  return result;
end;
$$;

revoke all on function public.get_view_operational_aggregates(uuid, uuid, date, date) from public;
revoke all on function public.get_view_operational_aggregates(uuid, uuid, date, date) from anon;
grant execute on function public.get_view_operational_aggregates(uuid, uuid, date, date) to authenticated;
