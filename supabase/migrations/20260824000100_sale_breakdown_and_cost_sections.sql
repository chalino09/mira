-- Desglose comercial de cosecha y apartados operativos de costos.

alter type public.cost_category add value if not exists 'preparacion_terreno_maquinaria';
alter type public.cost_category add value if not exists 'analisis_laboratorio';
alter type public.cost_category add value if not exists 'material_vegetal';
alter type public.cost_category add value if not exists 'polinizacion';

alter table public.harvest_sales
  add column if not exists packaging_amount numeric(14,2) not null default 0;

alter table public.harvest_sale_lines
  add column if not exists packaging_per_box numeric(14,4) not null default 0;

alter table public.harvest_sales drop constraint if exists harvest_sales_amounts_non_negative;
alter table public.harvest_sales add constraint harvest_sales_amounts_non_negative check (
  gross_amount >= 0 and commission_amount >= 0 and freight_amount >= 0
  and packaging_amount >= 0 and net_amount >= 0
);

alter table public.harvest_sale_lines drop constraint if exists harvest_sale_lines_values_non_negative;
alter table public.harvest_sale_lines add constraint harvest_sale_lines_values_non_negative check (
  box_count >= 0 and box_weight_kg > 0 and kilograms >= 0 and gross_unit_price >= 0
  and commission_per_box >= 0 and freight_per_box >= 0 and packaging_per_box >= 0
  and net_unit_price >= 0 and gross_amount >= 0 and net_amount >= 0
);

create table if not exists public.harvest_sale_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  harvest_sale_id uuid not null references public.harvest_sales(id) on delete cascade,
  changed_by uuid references auth.users(id),
  before_values jsonb,
  after_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists harvest_sale_revisions_sale_created_idx
on public.harvest_sale_revisions(harvest_sale_id, created_at desc);

alter table public.harvest_sale_revisions enable row level security;

drop policy if exists "harvest_sale_revisions_select_member" on public.harvest_sale_revisions;
create policy "harvest_sale_revisions_select_member"
on public.harvest_sale_revisions for select to authenticated
using (public.is_company_member(company_id));

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
      and public.route_slug(sale_line.quality_label) not in ('primera', 'primeras', 'segunda', 'segundas', 'tercera', 'terceras')
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
    if line_quality not in ('primera', 'segunda', 'tercera') then raise exception 'sale_quality_invalid'; end if;
    if line_quality = any(seen_qualities) then raise exception 'sale_quality_duplicated'; end if;
    seen_qualities := array_append(seen_qualities, line_quality);
    if line_boxes < 0 or line_price < 0 then raise exception 'sale_line_values_invalid'; end if;
    quality_limit := case line_quality
      when 'primera' then coalesce(target_harvest.first_quality_boxes, 0)
      when 'segunda' then coalesce(target_harvest.second_quality_boxes, 0)
      else coalesce(target_harvest.third_quality_boxes, 0)
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
