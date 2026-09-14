-- Agrega los tamaños Canica y Papel a captura, correcciones y ventas de cosecha.
-- Los registros anteriores conservan sus cantidades y los nuevos tamaños inician en cero.

alter table public.harvest_records
  add column if not exists canica_boxes numeric(12,2) not null default 0 check (canica_boxes >= 0),
  add column if not exists papel_boxes numeric(12,2) not null default 0 check (papel_boxes >= 0),
  add column if not exists canica_kg numeric(12,2) not null default 0 check (canica_kg >= 0),
  add column if not exists papel_kg numeric(12,2) not null default 0 check (papel_kg >= 0),
  add column if not exists canica_price numeric(12,2) not null default 0 check (canica_price >= 0),
  add column if not exists papel_price numeric(12,2) not null default 0 check (papel_price >= 0);

-- Sustituye las firmas anteriores para evitar sobrecargas ambiguas en PostgREST.
-- Los nuevos argumentos tienen valores predeterminados para clientes anteriores.
drop function public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
drop function public.update_harvest_record(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text);

create or replace function public.complete_harvest_task(
  target_task_id uuid, target_occurred_at date, target_kilograms numeric,
  target_first_quality_kg numeric default 0, target_second_quality_kg numeric default 0,
  target_merma_kg numeric default 0, target_estimated_price numeric default 0,
  target_destination text default null, target_notes text default null,
  target_box_count numeric default 0, target_box_weight_kg numeric default 20,
  target_first_quality_boxes numeric default 0, target_second_quality_boxes numeric default 0,
  target_third_quality_boxes numeric default 0, target_merma_boxes numeric default 0,
  target_third_quality_kg numeric default 0, target_first_quality_price numeric default 0,
  target_second_quality_price numeric default 0, target_third_quality_price numeric default 0,
  target_canica_boxes numeric default 0, target_papel_boxes numeric default 0,
  target_canica_price numeric default 0, target_papel_price numeric default 0
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
    or coalesce(target_third_quality_price, 0) < 0
    or coalesce(target_canica_boxes, 0) < 0 or coalesce(target_papel_boxes, 0) < 0
    or coalesce(target_canica_price, 0) < 0 or coalesce(target_papel_price, 0) < 0 then raise exception 'harvest_values_invalid'; end if;
  classified_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0)
    + coalesce(target_third_quality_boxes, 0) + coalesce(target_canica_boxes, 0) + coalesce(target_papel_boxes, 0) + coalesce(target_merma_boxes, 0);
  if abs(classified_box_count - target_box_count) > 0.000001 then raise exception 'harvest_box_reconciliation_required'; end if;
  commercial_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0) + coalesce(target_third_quality_boxes, 0) + coalesce(target_canica_boxes, 0) + coalesce(target_papel_boxes, 0);
  calculated_estimated_price := case when commercial_box_count > 0 then (
    coalesce(target_first_quality_boxes, 0) * coalesce(target_first_quality_price, 0)
    + coalesce(target_second_quality_boxes, 0) * coalesce(target_second_quality_price, 0)
    + coalesce(target_third_quality_boxes, 0) * coalesce(target_third_quality_price, 0)
    + coalesce(target_canica_boxes, 0) * coalesce(target_canica_price, 0)
    + coalesce(target_papel_boxes, 0) * coalesce(target_papel_price, 0)
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
  update public.harvest_records
  set canica_boxes = coalesce(target_canica_boxes, 0), papel_boxes = coalesce(target_papel_boxes, 0),
      canica_kg = coalesce(target_canica_boxes, 0) * target_box_weight_kg,
      papel_kg = coalesce(target_papel_boxes, 0) * target_box_weight_kg,
      canica_price = coalesce(target_canica_price, 0), papel_price = coalesce(target_papel_price, 0)
  where id = (result->>'recordId')::uuid;
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
  target_destination text default null, target_notes text default null, target_change_note text default null,
  target_canica_boxes numeric default 0, target_papel_boxes numeric default 0,
  target_canica_price numeric default 0, target_papel_price numeric default 0
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
    or coalesce(target_third_quality_price, 0) < 0
    or coalesce(target_canica_boxes, 0) < 0 or coalesce(target_papel_boxes, 0) < 0
    or coalesce(target_canica_price, 0) < 0 or coalesce(target_papel_price, 0) < 0 then raise exception 'harvest_values_invalid'; end if;
  classified_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0)
    + coalesce(target_third_quality_boxes, 0) + coalesce(target_canica_boxes, 0) + coalesce(target_papel_boxes, 0) + coalesce(target_merma_boxes, 0);
  if abs(classified_box_count - target_box_count) > 0.000001 then raise exception 'harvest_box_reconciliation_required'; end if;
  commercial_box_count := coalesce(target_first_quality_boxes, 0) + coalesce(target_second_quality_boxes, 0) + coalesce(target_third_quality_boxes, 0) + coalesce(target_canica_boxes, 0) + coalesce(target_papel_boxes, 0);
  calculated_estimated_price := case when commercial_box_count > 0 then (
    coalesce(target_first_quality_boxes, 0) * coalesce(target_first_quality_price, 0)
    + coalesce(target_second_quality_boxes, 0) * coalesce(target_second_quality_price, 0)
    + coalesce(target_third_quality_boxes, 0) * coalesce(target_third_quality_price, 0)
    + coalesce(target_canica_boxes, 0) * coalesce(target_canica_price, 0)
    + coalesce(target_papel_boxes, 0) * coalesce(target_papel_price, 0)
  ) / commercial_box_count else 0 end;
  before_snapshot := to_jsonb(target_record);
  update public.harvest_records
  set occurred_at = target_occurred_at,
      kilograms = target_box_count * target_box_weight_kg,
      box_count = target_box_count, box_weight_kg = target_box_weight_kg,
      first_quality_kg = coalesce(target_first_quality_boxes, 0) * target_box_weight_kg,
      second_quality_kg = coalesce(target_second_quality_boxes, 0) * target_box_weight_kg,
      third_quality_kg = coalesce(target_third_quality_boxes, 0) * target_box_weight_kg,
      canica_kg = coalesce(target_canica_boxes, 0) * target_box_weight_kg,
      papel_kg = coalesce(target_papel_boxes, 0) * target_box_weight_kg,
      canica_boxes = coalesce(target_canica_boxes, 0), papel_boxes = coalesce(target_papel_boxes, 0),
      canica_price = coalesce(target_canica_price, 0), papel_price = coalesce(target_papel_price, 0),
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

revoke all on function public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;
revoke all on function public.update_harvest_record(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.update_harvest_record(uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.upsert_harvest_sale(
  target_harvest_record_id uuid,
  target_sale_id uuid default null,
  target_buyer_name text default null,
  target_occurred_at date default null,
  target_commission_per_box numeric default 0,
  target_freight_per_box numeric default 0,
  target_packaging_per_box numeric default 0,
  target_payment_status text default 'pending',
  target_paid_at date default null,
  target_notes text default null,
  target_lines jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_harvest public.harvest_records%rowtype;
  target_sale public.harvest_sales%rowtype;
  line jsonb;
  line_quality text;
  line_boxes numeric;
  line_price numeric;
  quality_limit numeric;
  line_gross numeric;
  line_net numeric;
  total_boxes numeric := 0;
  total_gross numeric := 0;
  total_commission numeric := 0;
  total_freight numeric := 0;
  total_packaging numeric := 0;
  total_net numeric := 0;
  before_snapshot jsonb;
  seen_qualities text[] := '{}';
begin
  select * into target_harvest from public.harvest_records
  where id = target_harvest_record_id for update;
  if target_harvest.id is null then raise exception 'harvest_record_not_found'; end if;
  if not public.can_manage_company(target_harvest.company_id) then raise exception 'not_allowed'; end if;
  if nullif(trim(target_buyer_name), '') is null then raise exception 'sale_buyer_required'; end if;
  if target_occurred_at is null then raise exception 'sale_date_required'; end if;
  if target_payment_status not in ('pending', 'paid') then raise exception 'sale_payment_status_invalid'; end if;
  if coalesce(target_commission_per_box, 0) < 0 or coalesce(target_freight_per_box, 0) < 0
    or coalesce(target_packaging_per_box, 0) < 0 then raise exception 'sale_deductions_invalid'; end if;
  if jsonb_typeof(coalesce(target_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(target_lines, '[]'::jsonb)) = 0
    then raise exception 'sale_lines_required'; end if;

  if target_sale_id is not null then
    select * into target_sale from public.harvest_sales
    where id = target_sale_id and harvest_record_id = target_harvest.id for update;
    if target_sale.id is null then raise exception 'harvest_sale_not_found'; end if;
  else
    select * into target_sale from public.harvest_sales
    where harvest_record_id = target_harvest.id order by created_at asc limit 1 for update;
  end if;

  if target_sale.id is not null and exists (
    select 1 from public.harvest_sale_lines sale_line
    where sale_line.sale_id = target_sale.id
      and public.route_slug(sale_line.quality_label) not in ('primera', 'primeras', 'segunda', 'segundas', 'tercera', 'terceras', 'canica', 'papel')
  ) then raise exception 'harvest_sale_special_lines_require_review'; end if;

  if target_sale.id is not null then
    select jsonb_build_object(
      'sale', to_jsonb(target_sale),
      'lines', coalesce((select jsonb_agg(to_jsonb(existing_line) order by existing_line.created_at) from public.harvest_sale_lines existing_line where existing_line.sale_id = target_sale.id), '[]'::jsonb)
    ) into before_snapshot;
  end if;

  for line in select value from jsonb_array_elements(target_lines)
  loop
    line_quality := public.route_slug(coalesce(line->>'quality', ''));
    line_boxes := coalesce((line->>'boxCount')::numeric, 0);
    line_price := coalesce((line->>'grossPricePerBox')::numeric, 0);
    if line_quality not in ('primera', 'segunda', 'tercera', 'canica', 'papel') then raise exception 'sale_quality_invalid'; end if;
    if line_quality = any(seen_qualities) then raise exception 'sale_quality_duplicated'; end if;
    seen_qualities := array_append(seen_qualities, line_quality);
    if line_boxes < 0 or line_price < 0 then raise exception 'sale_line_values_invalid'; end if;
    quality_limit := case line_quality
      when 'primera' then coalesce(target_harvest.first_quality_boxes, 0)
      when 'segunda' then coalesce(target_harvest.second_quality_boxes, 0)
      when 'tercera' then coalesce(target_harvest.third_quality_boxes, 0)
      when 'canica' then coalesce(target_harvest.canica_boxes, 0)
      when 'papel' then coalesce(target_harvest.papel_boxes, 0)
    end;
    if line_boxes > quality_limit then raise exception 'sale_boxes_exceed_harvest'; end if;
    if line_boxes > 0 and line_price < coalesce(target_commission_per_box, 0) + coalesce(target_freight_per_box, 0) + coalesce(target_packaging_per_box, 0)
      then raise exception 'sale_deductions_exceed_price'; end if;
  end loop;

  if target_sale.id is null then
    insert into public.harvest_sales (
      company_id, greenhouse_id, harvest_record_id, cut_number, buyer_name, occurred_at,
      payment_status, paid_at, source_reference, notes, gross_amount, commission_amount,
      freight_amount, packaging_amount, net_amount
    ) values (
      target_harvest.company_id, target_harvest.greenhouse_id, target_harvest.id,
      coalesce((select max(existing_sale.cut_number) + 1 from public.harvest_sales existing_sale where existing_sale.greenhouse_id = target_harvest.greenhouse_id), 1),
      trim(target_buyer_name), target_occurred_at, target_payment_status,
      case when target_payment_status = 'paid' then coalesce(target_paid_at, target_occurred_at) else null end,
      'manual-sale:' || gen_random_uuid()::text, nullif(trim(target_notes), ''), 0, 0, 0, 0, 0
    ) returning * into target_sale;
  else
    update public.harvest_sales set
      buyer_name = trim(target_buyer_name), occurred_at = target_occurred_at,
      payment_status = target_payment_status,
      paid_at = case when target_payment_status = 'paid' then coalesce(target_paid_at, target_occurred_at) else null end,
      notes = nullif(trim(target_notes), ''), updated_at = now()
    where id = target_sale.id returning * into target_sale;
    delete from public.harvest_sale_lines where sale_id = target_sale.id;
  end if;

  for line in select value from jsonb_array_elements(target_lines)
  loop
    line_quality := public.route_slug(line->>'quality');
    line_boxes := coalesce((line->>'boxCount')::numeric, 0);
    line_price := coalesce((line->>'grossPricePerBox')::numeric, 0);
    if line_boxes <= 0 then continue; end if;
    line_gross := round(line_boxes * line_price, 2);
    line_net := round(line_boxes * (line_price - coalesce(target_commission_per_box, 0) - coalesce(target_freight_per_box, 0) - coalesce(target_packaging_per_box, 0)), 2);
    insert into public.harvest_sale_lines (
      sale_id, quality_label, box_count, box_weight_kg, kilograms, gross_unit_price,
      commission_per_box, freight_per_box, packaging_per_box, net_unit_price,
      gross_amount, net_amount, source_reference, notes
    ) values (
      target_sale.id, line_quality, line_boxes, target_harvest.box_weight_kg,
      line_boxes * target_harvest.box_weight_kg, line_price,
      coalesce(target_commission_per_box, 0), coalesce(target_freight_per_box, 0), coalesce(target_packaging_per_box, 0),
      line_price - coalesce(target_commission_per_box, 0) - coalesce(target_freight_per_box, 0) - coalesce(target_packaging_per_box, 0),
      line_gross, line_net, 'manual-sale-line:' || target_sale.id::text || ':' || line_quality, null
    );
    total_boxes := total_boxes + line_boxes;
    total_gross := total_gross + line_gross;
    total_net := total_net + line_net;
  end loop;

  if total_boxes <= 0 then raise exception 'sale_boxes_required'; end if;
  total_commission := round(total_boxes * coalesce(target_commission_per_box, 0), 2);
  total_freight := round(total_boxes * coalesce(target_freight_per_box, 0), 2);
  total_packaging := round(total_boxes * coalesce(target_packaging_per_box, 0), 2);

  update public.harvest_sales set gross_amount = total_gross,
    commission_amount = total_commission, freight_amount = total_freight,
    packaging_amount = total_packaging, net_amount = total_net, updated_at = now()
  where id = target_sale.id returning * into target_sale;

  insert into public.harvest_sale_revisions (company_id, harvest_sale_id, changed_by, before_values, after_values)
  select target_harvest.company_id, target_sale.id, auth.uid(), before_snapshot,
    jsonb_build_object(
      'sale', to_jsonb(target_sale),
      'lines', coalesce((select jsonb_agg(to_jsonb(saved_line) order by saved_line.created_at) from public.harvest_sale_lines saved_line where saved_line.sale_id = target_sale.id), '[]'::jsonb)
    );

  return jsonb_build_object('saleId', target_sale.id, 'grossAmount', total_gross,
    'commissionAmount', total_commission, 'freightAmount', total_freight,
    'packagingAmount', total_packaging, 'netAmount', total_net);
end;
$$;

revoke all on function public.upsert_harvest_sale(uuid, uuid, text, date, numeric, numeric, numeric, text, date, text, jsonb) from public, anon;
grant execute on function public.upsert_harvest_sale(uuid, uuid, text, date, numeric, numeric, numeric, text, date, text, jsonb) to authenticated;

-- Incluye los nuevos tamaños en los totales del panel.
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
      coalesce(harvest.first_quality_kg, 0) + coalesce(harvest.second_quality_kg, 0) + coalesce(harvest.third_quality_kg, 0) + coalesce(harvest.canica_kg, 0) + coalesce(harvest.papel_kg, 0) as commercial_kg,
      coalesce(harvest.first_quality_boxes, 0) + coalesce(harvest.second_quality_boxes, 0) + coalesce(harvest.third_quality_boxes, 0) + coalesce(harvest.canica_boxes, 0) + coalesce(harvest.papel_boxes, 0) as commercial_boxes,
      coalesce(sales.gross_revenue,
        coalesce(harvest.first_quality_boxes, 0) * coalesce(harvest.first_quality_price, 0)
        + coalesce(harvest.second_quality_boxes, 0) * coalesce(harvest.second_quality_price, 0)
        + coalesce(harvest.third_quality_boxes, 0) * coalesce(harvest.third_quality_price, 0)
        + coalesce(harvest.canica_boxes, 0) * coalesce(harvest.canica_price, 0)
        + coalesce(harvest.papel_boxes, 0) * coalesce(harvest.papel_price, 0)
      ) as gross_revenue,
      coalesce(sales.commission_amount, 0) as commission_amount,
      coalesce(sales.freight_amount, 0) as freight_amount,
      coalesce(sales.net_revenue,
        coalesce(harvest.first_quality_boxes, 0) * coalesce(harvest.first_quality_price, 0)
        + coalesce(harvest.second_quality_boxes, 0) * coalesce(harvest.second_quality_price, 0)
        + coalesce(harvest.third_quality_boxes, 0) * coalesce(harvest.third_quality_price, 0)
        + coalesce(harvest.canica_boxes, 0) * coalesce(harvest.canica_price, 0)
        + coalesce(harvest.papel_boxes, 0) * coalesce(harvest.papel_price, 0)
      ) as net_revenue,
      case when coalesce(sales.sold_boxes, 0) > 0 then sales.sold_boxes
        else coalesce(harvest.first_quality_boxes, 0) + coalesce(harvest.second_quality_boxes, 0) + coalesce(harvest.third_quality_boxes, 0) + coalesce(harvest.canica_boxes, 0) + coalesce(harvest.papel_boxes, 0)
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

