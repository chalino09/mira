-- Normaliza la operación comercial de cosechas a precio por caja.
-- Los archivos fuente históricos permanecen intactos; esta migración corrige
-- únicamente la interpretación almacenada en harvest_records.

create table if not exists public.harvest_record_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  harvest_record_id uuid not null references public.harvest_records(id) on delete cascade,
  changed_by uuid references auth.users(id),
  change_note text,
  before_values jsonb not null,
  after_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists harvest_record_revisions_record_created_idx
on public.harvest_record_revisions(harvest_record_id, created_at desc);

alter table public.harvest_record_revisions enable row level security;

drop policy if exists "harvest_record_revisions_select_member" on public.harvest_record_revisions;
create policy "harvest_record_revisions_select_member"
on public.harvest_record_revisions for select to authenticated
using (public.is_company_member(company_id));

-- Las ventas históricas ya contienen el importe neto y las cajas realmente
-- vendidas. estimated_price debe representar un precio unitario por caja,
-- nunca el total de la venta.
with sale_lines as (
  select sale_id, sum(box_count)::numeric as sold_boxes
  from public.harvest_sale_lines
  group by sale_id
), sale_totals as (
  select
    sale.harvest_record_id,
    sum(sale.net_amount)::numeric as net_amount,
    sum(coalesce(sale_lines.sold_boxes, 0))::numeric as sold_boxes
  from public.harvest_sales sale
  left join sale_lines on sale_lines.sale_id = sale.id
  group by sale.harvest_record_id
)
update public.harvest_records harvest
set estimated_price = round(sale_totals.net_amount / nullif(sale_totals.sold_boxes, 0), 2),
    updated_at = now()
from sale_totals
cross join public.companies company
where harvest.id = sale_totals.harvest_record_id
  and company.id = harvest.company_id
  and company.slug = 'mercadia-ag'
  and sale_totals.sold_boxes > 0;

-- El agregado usa ventas registradas cuando existen. Para capturas nuevas sin
-- venta separada usa la estimación basada en cajas por calidad y precio/caja.
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
  if target_start_date is not null and target_end_date is not null and target_start_date > target_end_date then
    raise exception 'invalid_view_period' using errcode = '22023';
  end if;
  if target_greenhouse_id is not null and not public.can_access_greenhouse(target_company_id, target_greenhouse_id) then
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
    select coalesce(sum(amount), 0)::numeric as total_cost from accessible_costs
  ), cost_categories as (
    select category::text as category, sum(amount)::numeric as amount
    from accessible_costs group by category order by amount desc, category
  ), sale_lines as (
    select sale_id, sum(box_count)::numeric as sold_boxes
    from public.harvest_sale_lines group by sale_id
  ), sales_by_harvest as (
    select
      sale.harvest_record_id,
      sum(sale.gross_amount)::numeric as gross_revenue,
      sum(sale.commission_amount)::numeric as commission_amount,
      sum(sale.freight_amount)::numeric as freight_amount,
      sum(sale.net_amount)::numeric as net_revenue,
      sum(coalesce(sale_lines.sold_boxes, 0))::numeric as sold_boxes
    from public.harvest_sales sale
    left join sale_lines on sale_lines.sale_id = sale.id
    where sale.company_id = target_company_id
    group by sale.harvest_record_id
  ), accessible_harvests as (
    select
      harvest.occurred_at,
      harvest.kilograms,
      harvest.box_count,
      coalesce(harvest.first_quality_kg, 0) + coalesce(harvest.second_quality_kg, 0) + coalesce(harvest.third_quality_kg, 0) as commercial_kg,
      coalesce(harvest.first_quality_boxes, 0) + coalesce(harvest.second_quality_boxes, 0) + coalesce(harvest.third_quality_boxes, 0) as commercial_boxes,
      coalesce(sales.gross_revenue,
        coalesce(harvest.first_quality_boxes, 0) * coalesce(harvest.first_quality_price, 0)
        + coalesce(harvest.second_quality_boxes, 0) * coalesce(harvest.second_quality_price, 0)
        + coalesce(harvest.third_quality_boxes, 0) * coalesce(harvest.third_quality_price, 0)
      ) as gross_revenue,
      coalesce(sales.commission_amount, 0) as commission_amount,
      coalesce(sales.freight_amount, 0) as freight_amount,
      coalesce(sales.net_revenue,
        coalesce(harvest.first_quality_boxes, 0) * coalesce(harvest.first_quality_price, 0)
        + coalesce(harvest.second_quality_boxes, 0) * coalesce(harvest.second_quality_price, 0)
        + coalesce(harvest.third_quality_boxes, 0) * coalesce(harvest.third_quality_price, 0)
      ) as net_revenue,
      case when coalesce(sales.sold_boxes, 0) > 0 then sales.sold_boxes
        else coalesce(harvest.first_quality_boxes, 0) + coalesce(harvest.second_quality_boxes, 0) + coalesce(harvest.third_quality_boxes, 0)
      end as priced_boxes
    from public.harvest_records harvest
    left join sales_by_harvest sales on sales.harvest_record_id = harvest.id
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
      coalesce(sum(gross_revenue), 0)::numeric as gross_revenue,
      coalesce(sum(commission_amount), 0)::numeric as commission_amount,
      coalesce(sum(freight_amount), 0)::numeric as freight_amount,
      coalesce(sum(net_revenue), 0)::numeric as net_revenue,
      coalesce(sum(priced_boxes), 0)::numeric as sold_boxes
    from accessible_harvests
  ), harvest_daily as (
    select occurred_at, sum(kilograms)::numeric as kilograms
    from accessible_harvests group by occurred_at order by occurred_at desc limit 31
  ), accessible_irrigation as (
    select irrigation.occurred_at, irrigation.estimated_liters, irrigation.duration_min, irrigation.ec
    from public.irrigation_records irrigation
    where irrigation.company_id = target_company_id
      and (target_greenhouse_id is null or irrigation.greenhouse_id = target_greenhouse_id)
      and public.can_access_greenhouse(target_company_id, irrigation.greenhouse_id)
      and (target_start_date is null or irrigation.occurred_at >= target_start_date)
      and (target_end_date is null or irrigation.occurred_at <= target_end_date)
  ), irrigation_totals as (
    select coalesce(sum(estimated_liters), 0)::numeric as total_liters,
      coalesce(avg(duration_min), 0)::numeric as average_duration, avg(ec)::numeric as average_ec
    from accessible_irrigation
  ), irrigation_daily as (
    select occurred_at, sum(estimated_liters)::numeric as liters
    from accessible_irrigation group by occurred_at order by occurred_at desc limit 31
  )
  select jsonb_build_object(
    'totalCost', cost_totals.total_cost,
    'costByCategory', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'amount', amount)) from cost_categories), '[]'::jsonb),
    'totalHarvestKg', harvest_totals.total_kg,
    'totalHarvestBoxes', harvest_totals.total_boxes,
    'commercialKg', harvest_totals.commercial_kg,
    'estimatedRevenue', harvest_totals.net_revenue,
    'averagePrice', case when harvest_totals.sold_boxes > 0 then harvest_totals.net_revenue / harvest_totals.sold_boxes else 0 end,
    'grossRevenue', harvest_totals.gross_revenue,
    'commissionAmount', harvest_totals.commission_amount,
    'freightAmount', harvest_totals.freight_amount,
    'netRevenue', harvest_totals.net_revenue,
    'soldBoxes', harvest_totals.sold_boxes,
    'harvestDaily', coalesce((select jsonb_agg(jsonb_build_object('date', occurred_at, 'kg', kilograms) order by occurred_at asc) from harvest_daily), '[]'::jsonb),
    'totalIrrigationLiters', irrigation_totals.total_liters,
    'averageIrrigationDuration', irrigation_totals.average_duration,
    'averageEc', irrigation_totals.average_ec,
    'irrigationDaily', coalesce((select jsonb_agg(jsonb_build_object('date', occurred_at, 'liters', liters) order by occurred_at asc) from irrigation_daily), '[]'::jsonb)
  ) into result from cost_totals, harvest_totals, irrigation_totals;
  return result;
end;
$$;

-- Recalcula siempre desde las cajas y sus precios por caja. El parámetro de
-- precio estimado se conserva sólo para compatibilidad con clientes previos.
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
  commercial_box_count numeric;
  calculated_estimated_price numeric;
begin
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;
  if coalesce(target_box_count, 0) <= 0 then raise exception 'harvest_box_count_required'; end if;
  if coalesce(target_box_weight_kg, 0) <= 0 then raise exception 'harvest_box_weight_required'; end if;
  if coalesce(target_first_quality_boxes, 0) < 0 or coalesce(target_second_quality_boxes, 0) < 0
    or coalesce(target_third_quality_boxes, 0) < 0 or coalesce(target_merma_boxes, 0) < 0
    or coalesce(target_first_quality_price, 0) < 0 or coalesce(target_second_quality_price, 0) < 0
    or coalesce(target_third_quality_price, 0) < 0 then raise exception 'harvest_values_invalid'; end if;
  classified_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0)
    + coalesce(target_third_quality_boxes, 0) + coalesce(target_merma_boxes, 0);
  if abs(classified_box_count - target_box_count) > 0.000001 then raise exception 'harvest_box_reconciliation_required'; end if;
  commercial_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0) + coalesce(target_third_quality_boxes, 0);
  calculated_estimated_price := case when commercial_box_count > 0 then (
    coalesce(target_first_quality_boxes, 0) * coalesce(target_first_quality_price, 0)
    + coalesce(target_second_quality_boxes, 0) * coalesce(target_second_quality_price, 0)
    + coalesce(target_third_quality_boxes, 0) * coalesce(target_third_quality_price, 0)
  ) / commercial_box_count else 0 end;
  result := public.legacy_complete_harvest_task(target_task_id, target_occurred_at,
    target_box_count * coalesce(nullif(target_box_weight_kg, 0), 20),
    coalesce(target_first_quality_boxes, 0) * coalesce(nullif(target_box_weight_kg, 0), 20),
    coalesce(target_second_quality_boxes, 0) * coalesce(nullif(target_box_weight_kg, 0), 20),
    coalesce(target_merma_boxes, 0) * coalesce(nullif(target_box_weight_kg, 0), 20),
    calculated_estimated_price, target_destination, target_notes, target_box_count, target_box_weight_kg,
    target_first_quality_boxes, target_second_quality_boxes, target_third_quality_boxes, target_merma_boxes,
    coalesce(target_third_quality_boxes, 0) * coalesce(nullif(target_box_weight_kg, 0), 20),
    target_first_quality_price, target_second_quality_price, target_third_quality_price);
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Cosecha confirmada y guardada en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

create or replace function public.update_harvest_record(
  target_harvest_record_id uuid, target_occurred_at date, target_box_count numeric,
  target_box_weight_kg numeric default 20, target_first_quality_boxes numeric default 0,
  target_second_quality_boxes numeric default 0, target_third_quality_boxes numeric default 0,
  target_merma_boxes numeric default 0, target_first_quality_price numeric default 0,
  target_second_quality_price numeric default 0, target_third_quality_price numeric default 0,
  target_destination text default null, target_notes text default null, target_change_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_record public.harvest_records%rowtype;
  before_snapshot jsonb;
  classified_box_count numeric;
  commercial_box_count numeric;
  calculated_estimated_price numeric;
begin
  select * into target_record from public.harvest_records where id = target_harvest_record_id for update;
  if target_record.id is null then raise exception 'harvest_record_not_found'; end if;
  if not public.can_manage_company(target_record.company_id) then raise exception 'not_allowed'; end if;
  if target_occurred_at is null then raise exception 'harvest_date_required'; end if;
  if coalesce(target_box_count, 0) <= 0 then raise exception 'harvest_box_count_required'; end if;
  if coalesce(target_box_weight_kg, 0) <= 0 then raise exception 'harvest_box_weight_required'; end if;
  if nullif(trim(target_change_note), '') is null then raise exception 'harvest_change_note_required'; end if;
  if coalesce(target_first_quality_boxes, 0) < 0 or coalesce(target_second_quality_boxes, 0) < 0
    or coalesce(target_third_quality_boxes, 0) < 0 or coalesce(target_merma_boxes, 0) < 0
    or coalesce(target_first_quality_price, 0) < 0 or coalesce(target_second_quality_price, 0) < 0
    or coalesce(target_third_quality_price, 0) < 0 then raise exception 'harvest_values_invalid'; end if;
  classified_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0)
    + coalesce(target_third_quality_boxes, 0) + coalesce(target_merma_boxes, 0);
  if abs(classified_box_count - target_box_count) > 0.000001 then raise exception 'harvest_box_reconciliation_required'; end if;
  commercial_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0) + coalesce(target_third_quality_boxes, 0);
  calculated_estimated_price := case when commercial_box_count > 0 then (
    coalesce(target_first_quality_boxes, 0) * coalesce(target_first_quality_price, 0)
    + coalesce(target_second_quality_boxes, 0) * coalesce(target_second_quality_price, 0)
    + coalesce(target_third_quality_boxes, 0) * coalesce(target_third_quality_price, 0)
  ) / commercial_box_count else 0 end;
  before_snapshot := to_jsonb(target_record);
  update public.harvest_records
  set occurred_at = target_occurred_at,
      kilograms = target_box_count * target_box_weight_kg,
      box_count = target_box_count, box_weight_kg = target_box_weight_kg,
      first_quality_kg = coalesce(target_first_quality_boxes, 0) * target_box_weight_kg,
      second_quality_kg = coalesce(target_second_quality_boxes, 0) * target_box_weight_kg,
      third_quality_kg = coalesce(target_third_quality_boxes, 0) * target_box_weight_kg,
      discard_kg = coalesce(target_merma_boxes, 0) * target_box_weight_kg,
      merma_kg = coalesce(target_merma_boxes, 0) * target_box_weight_kg,
      first_quality_boxes = coalesce(target_first_quality_boxes, 0), second_quality_boxes = coalesce(target_second_quality_boxes, 0),
      third_quality_boxes = coalesce(target_third_quality_boxes, 0), merma_boxes = coalesce(target_merma_boxes, 0),
      first_quality_price = coalesce(target_first_quality_price, 0), second_quality_price = coalesce(target_second_quality_price, 0),
      third_quality_price = coalesce(target_third_quality_price, 0), estimated_price = calculated_estimated_price,
      destination = nullif(trim(target_destination), ''), notes = nullif(trim(target_notes), ''), updated_at = now()
  where id = target_record.id;
  update public.tasks set scheduled_date = target_occurred_at, occurred_at = target_occurred_at::timestamptz, updated_at = now()
  where id = target_record.source_task_id and company_id = target_record.company_id;
  insert into public.harvest_record_revisions (company_id, harvest_record_id, changed_by, change_note, before_values, after_values)
  select target_record.company_id, target_record.id, auth.uid(), nullif(trim(target_change_note), ''), before_snapshot, to_jsonb(harvest)
  from public.harvest_records harvest where harvest.id = target_record.id;
  return jsonb_build_object('recordId', target_record.id);
end;
$$;

revoke all on function public.update_harvest_record(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.update_harvest_record(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text) to authenticated;
