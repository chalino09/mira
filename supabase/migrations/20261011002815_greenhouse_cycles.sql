-- Preserve production history and attribute operational records to crop cycles.
begin;
alter table public.crop_cycles add column if not exists budget_amount numeric,
  add column if not exists beds_count integer,
  add column if not exists crop_stage public.crop_stage not null default 'vegetativo';
alter table public.crop_cycles add constraint crop_cycles_budget_check check (budget_amount is null or budget_amount >= 0);
alter table public.crop_cycles add constraint crop_cycles_beds_check check (beds_count is null or beds_count >= 0);
alter table public.crop_cycles add constraint crop_cycles_scope_unique unique (id, company_id, greenhouse_id);

insert into public.crop_cycles (company_id, greenhouse_id, crop_id, variety, transplant_date,
 plants_count, stem_count, is_grafted, started_at, budget_amount, beds_count, crop_stage, notes)
select company_id, id, crop_id, coalesce(crop_variety, tomato_variety), transplant_date,
 plants_count, stem_count, is_grafted, transplant_date, budget_amount, beds_count, crop_stage,
 'Datos conservados del invernadero al habilitar el historial de ciclos.'
from public.greenhouses g where crop_id is not null and not exists (
 select 1 from public.crop_cycles c where c.greenhouse_id = g.id);

-- Keep existing imported cycles and their original dates/varieties intact.
update public.crop_cycles c set budget_amount = g.budget_amount, beds_count = g.beds_count,
 crop_stage = g.crop_stage from public.greenhouses g
where c.greenhouse_id = g.id and c.status = 'active';

create or replace function public.sync_greenhouse_active_cycle()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
 if new.crop_id is null then return new; end if;
 if exists (select 1 from public.crop_cycles where greenhouse_id = new.id and status = 'active') then
  update public.crop_cycles set crop_id = new.crop_id, variety = coalesce(new.crop_variety, new.tomato_variety),
   transplant_date = new.transplant_date, plants_count = new.plants_count, stem_count = new.stem_count,
   is_grafted = new.is_grafted, budget_amount = new.budget_amount, beds_count = new.beds_count,
   crop_stage = new.crop_stage, updated_at = now()
  where greenhouse_id = new.id and status = 'active';
 elsif tg_op = 'INSERT' then
  insert into public.crop_cycles (company_id, greenhouse_id, crop_id, variety, transplant_date,
   plants_count, stem_count, is_grafted, started_at, budget_amount, beds_count, crop_stage, created_by)
  values (new.company_id, new.id, new.crop_id, coalesce(new.crop_variety, new.tomato_variety),
   new.transplant_date, new.plants_count, new.stem_count, new.is_grafted, new.transplant_date,
   new.budget_amount, new.beds_count, new.crop_stage, auth.uid());
 end if;
 return new;
end $$;
create trigger greenhouse_active_cycle_sync after insert or update of crop_id, crop_variety,
 tomato_variety, transplant_date, plants_count, stem_count, is_grafted, budget_amount, beds_count, crop_stage
 on public.greenhouses for each row execute function public.sync_greenhouse_active_cycle();

create or replace function public.start_greenhouse_cycle(target_greenhouse_id uuid, target_crop_id uuid,
 target_variety text, target_start date, target_plants integer, target_stems integer default null,
 target_grafted boolean default null, target_budget numeric default null, target_beds integer default 0,
 target_notes text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare g public.greenhouses; new_id uuid;
begin
 select * into g from public.greenhouses where id = target_greenhouse_id for update;
 if g.id is null or not public.can_manage_company(g.company_id) then raise exception 'No tienes permiso para administrar ciclos.'; end if;
 if target_start > current_date or target_plants is null or target_plants <= 0
  or nullif(trim(target_variety), '') is null then raise exception 'Revisa la fecha, variedad y número de plantas.'; end if;
 if exists (select 1 from public.crop_cycles where greenhouse_id = g.id and status = 'active') then
  raise exception 'Finaliza el ciclo actual antes de iniciar otro.';
 end if;
 if exists (select 1 from public.crop_cycles where greenhouse_id = g.id
   and ended_at >= target_start) then
  raise exception 'La fecha de inicio debe ser posterior al cierre del ciclo anterior.';
 end if;
 insert into public.crop_cycles (company_id, greenhouse_id, crop_id, variety, transplant_date,
  plants_count, stem_count, is_grafted, started_at, budget_amount, beds_count, notes, created_by)
 values (g.company_id, g.id, target_crop_id, trim(target_variety), target_start, target_plants,
  target_stems, target_grafted, target_start, target_budget, target_beds, target_notes, auth.uid()) returning id into new_id;
 update public.greenhouses set crop_id = target_crop_id, crop_variety = trim(target_variety),
  tomato_variety = case when target_crop_id = '7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1' then trim(target_variety) else null end,
  transplant_date = target_start, plants_count = target_plants, stem_count = target_stems,
  is_grafted = target_grafted, budget_amount = target_budget, beds_count = target_beds,
  crop_stage = 'vegetativo', updated_at = now() where id = g.id;
 return new_id;
end $$;

create or replace function public.close_greenhouse_cycle(target_cycle_id uuid, target_end date)
returns void language plpgsql security invoker set search_path = public as $$
declare c public.crop_cycles;
begin
 -- Same lock order as start prevents simultaneous close/start races.
 perform 1 from public.greenhouses where id = (select greenhouse_id from public.crop_cycles where id = target_cycle_id) for update;
 select * into c from public.crop_cycles where id = target_cycle_id for update;
 if c.id is null or not public.can_manage_company(c.company_id) then raise exception 'No tienes permiso para administrar ciclos.'; end if;
 if c.status = 'cancelled' then raise exception 'Este ciclo está cancelado.'; end if;
 if target_end > current_date or target_end < coalesce(c.started_at, c.transplant_date, target_end) then
  raise exception 'La fecha de cierre no es válida.';
 end if;
 if exists (select 1 from public.crop_cycles other where other.greenhouse_id=c.greenhouse_id and other.id<>c.id and other.status<>'cancelled' and coalesce(other.started_at,other.transplant_date)>coalesce(c.started_at,c.transplant_date,'0001-01-01') and coalesce(other.started_at,other.transplant_date)<=target_end) then raise exception 'El cierre debe ser anterior al inicio del siguiente ciclo.'; end if;
 update public.crop_cycles set status = 'closed', ended_at = target_end, updated_at = now() where id = c.id;
end $$;

revoke all on function public.start_greenhouse_cycle(uuid,uuid,text,date,integer,integer,boolean,numeric,integer,text) from public;
revoke all on function public.close_greenhouse_cycle(uuid,date) from public;
grant execute on function public.start_greenhouse_cycle(uuid,uuid,text,date,integer,integer,boolean,numeric,integer,text) to authenticated;
grant execute on function public.close_greenhouse_cycle(uuid,date) to authenticated;

create or replace function public.update_greenhouse_cycle_details(target_cycle_id uuid, target_crop_id uuid,
 target_variety text, target_start date, target_plants integer, target_stems integer default null,
 target_grafted boolean default null, target_budget numeric default null, target_beds integer default 0,
 target_notes text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare c public.crop_cycles;
begin
 perform 1 from public.greenhouses where id=(select greenhouse_id from public.crop_cycles where id=target_cycle_id) for update;
 select * into c from public.crop_cycles where id=target_cycle_id for update;
 if c.id is null or not public.can_manage_company(c.company_id) then raise exception 'No tienes permiso para editar este ciclo.'; end if;
 if target_start > current_date or target_start > c.ended_at or target_plants is null or target_plants < 0 or nullif(trim(target_variety),'') is null then raise exception 'Revisa la fecha, variedad y plantas.'; end if;
 if exists (select 1 from public.crop_cycles other where other.greenhouse_id=c.greenhouse_id and other.id<>c.id and other.status<>'cancelled' and other.ended_at>=target_start and coalesce(other.started_at,other.transplant_date)<=target_start) then raise exception 'La fecha coincide con otro ciclo.'; end if;
 update public.crop_cycles set crop_id=target_crop_id, variety=trim(target_variety), started_at=target_start,
 transplant_date=target_start, plants_count=target_plants, stem_count=target_stems,is_grafted=target_grafted,
 budget_amount=target_budget,beds_count=target_beds,notes=target_notes,updated_at=now() where id=c.id;
 if c.status='active' then
  update public.greenhouses set crop_id=target_crop_id,crop_variety=trim(target_variety),
   tomato_variety=case when target_crop_id='7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1' then trim(target_variety) else null end,
   transplant_date=target_start,plants_count=target_plants,stem_count=target_stems,is_grafted=target_grafted,
   budget_amount=target_budget,beds_count=target_beds,updated_at=now() where id=c.greenhouse_id;
 end if;
end $$;
revoke all on function public.update_greenhouse_cycle_details(uuid,uuid,text,date,integer,integer,boolean,numeric,integer,text) from public;
grant execute on function public.update_greenhouse_cycle_details(uuid,uuid,text,date,integer,integer,boolean,numeric,integer,text) to authenticated;

-- Preserve all existing unassigned rows for review. Dates alone are not evidence
-- of a historical cycle boundary, especially when the previous close is unknown.
create or replace function public.assign_record_crop_cycle()
returns trigger language plpgsql security invoker set search_path = public as $$
declare record_date date; source_cycle uuid; candidates uuid[];
begin
 if tg_op = 'UPDATE' then
  -- Explicit assignments and existing historical membership remain stable.
  return new;
 end if;
 if new.crop_cycle_id is not null then return new; end if;
 if tg_table_name = 'tasks' then
  new.crop_cycle_id := nullif(new.technical_plan->>'cropCycleId', '')::uuid;
  if new.crop_cycle_id is not null then return new; end if;
 elsif coalesce(to_jsonb(new)->>'source_task_id',to_jsonb(new)->>'source_work_id') is not null then
  select crop_cycle_id into source_cycle from public.tasks
  where id = coalesce(to_jsonb(new)->>'source_task_id',to_jsonb(new)->>'source_work_id')::uuid and company_id = new.company_id
   and greenhouse_id = new.greenhouse_id;
  if source_cycle is not null then new.crop_cycle_id := source_cycle; return new; end if;
 end if;
 record_date := (to_jsonb(new)->>tg_argv[0])::date;
 select array_agg(c.id) into candidates from public.crop_cycles c
 where c.company_id = new.company_id and c.greenhouse_id = new.greenhouse_id and c.status <> 'cancelled'
  and coalesce(c.started_at,c.transplant_date) <= record_date
  and (c.ended_at >= record_date or c.status = 'active')
  -- A newer cycle with an unknown start makes historical inference unsafe.
  and not exists (select 1 from public.crop_cycles newer where newer.greenhouse_id=c.greenhouse_id
   and newer.created_at > c.created_at and newer.status <> 'cancelled'
   and (coalesce(newer.started_at,newer.transplant_date) is null or coalesce(newer.started_at,newer.transplant_date)<=record_date));
 if cardinality(candidates) = 1 then new.crop_cycle_id := candidates[1]; end if;
 return new;
end $$;

do $$ declare item record;
begin
 for item in select * from (values ('tasks','scheduled_date'), ('irrigation_records','occurred_at'),
  ('nutrition_records','occurred_at'), ('application_records','occurred_at'), ('pest_alerts','detected_at'),
  ('harvest_records','occurred_at'), ('cost_records','occurred_at'),
  ('nutrition_monitoring_events','sample_date'), ('technical_lab_studies','sample_date')) as t(tbl,dt) loop
  execute format('alter table public.%I add column if not exists crop_cycle_id uuid', item.tbl);
  execute format('alter table public.%I add constraint %I foreign key (crop_cycle_id,company_id,greenhouse_id) references public.crop_cycles(id,company_id,greenhouse_id) on delete set null (crop_cycle_id)', item.tbl, item.tbl || '_cycle_scope_fk');
  execute format('alter table public.%I add constraint %I check (crop_cycle_id is null or greenhouse_id is not null)', item.tbl, item.tbl || '_cycle_greenhouse_check');
  execute format('create index if not exists %I on public.%I (company_id,greenhouse_id,crop_cycle_id)', item.tbl || '_cycle_idx', item.tbl);
  execute format('create trigger assign_crop_cycle before insert on public.%I for each row execute function public.assign_record_crop_cycle(%L)',item.tbl,item.dt);
 end loop;
end $$;

-- Company administrators manage cycles; managers can inspect their assigned area.
drop policy if exists crop_cycles_insert_scoped on public.crop_cycles;
create policy crop_cycles_insert_scoped on public.crop_cycles for insert to authenticated
 with check (public.can_manage_company(company_id));
drop policy if exists crop_cycles_update_scoped on public.crop_cycles;
create policy crop_cycles_update_scoped on public.crop_cycles for update to authenticated
 using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id));
revoke all on public.crop_cycles from anon;
revoke delete on public.crop_cycles from authenticated;
grant select, insert, update on public.crop_cycles to authenticated;

create or replace function public.assign_records_to_cycle(target_cycle_id uuid, target_table text, target_record_ids uuid[])
returns integer language plpgsql security invoker set search_path = public as $$
declare c public.crop_cycles; affected integer;
begin
 select * into c from public.crop_cycles where id=target_cycle_id;
 if c.id is null or not public.can_manage_company(c.company_id) then raise exception 'No tienes permiso para asignar registros.'; end if;
 if target_table <> all(array['tasks','irrigation_records','nutrition_records','application_records','pest_alerts',
  'harvest_records','cost_records','nutrition_monitoring_events','technical_lab_studies']) then raise exception 'Tipo de registro inválido.'; end if;
 if coalesce(cardinality(target_record_ids),0) = 0 or cardinality(target_record_ids) > 100 then raise exception 'Selecciona entre 1 y 100 registros.'; end if;
 execute format('update public.%I set crop_cycle_id=$1 where id=any($2) and company_id=$3 and greenhouse_id=$4',target_table)
 using c.id,target_record_ids,c.company_id,c.greenhouse_id;
 get diagnostics affected = row_count;
 if affected <> cardinality(target_record_ids) then raise exception 'Algunos registros no pertenecen a este invernadero.'; end if;
 return affected;
end $$;
revoke all on function public.assign_records_to_cycle(uuid,text,uuid[]) from public;
grant execute on function public.assign_records_to_cycle(uuid,text,uuid[]) to authenticated;

-- Counts and totals cover all rows, regardless of PostgREST's pagination limit.
create or replace function public.get_greenhouse_cycle_totals(target_greenhouse_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare g public.greenhouses; result jsonb;
begin
 select * into g from public.greenhouses where id=target_greenhouse_id;
 if g.id is null or not public.can_access_greenhouse(g.company_id,g.id) then raise exception 'No tienes acceso a este invernadero.'; end if;
 with records as (
  select crop_cycle_id, 'tasks' as kind, 0::numeric kg, 0::numeric expense, 0::numeric income from public.tasks where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'irrigation_records',0,0,0 from public.irrigation_records where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'nutrition_records',0,0,0 from public.nutrition_records where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'application_records',0,0,0 from public.application_records where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'pest_alerts',0,0,0 from public.pest_alerts where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'harvest_records',kilograms,0,0 from public.harvest_records where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'cost_records',0,amount,0 from public.cost_records where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'nutrition_monitoring_events',0,0,0 from public.nutrition_monitoring_events where greenhouse_id=g.id and company_id=g.company_id
  union all select crop_cycle_id,'technical_lab_studies',0,0,0 from public.technical_lab_studies where greenhouse_id=g.id and company_id=g.company_id
  union all select h.crop_cycle_id,'sales',0,0,s.net_amount from public.harvest_sales s join public.harvest_records h on h.id=s.harvest_record_id and h.company_id=s.company_id where h.greenhouse_id=g.id and h.company_id=g.company_id
 ), grouped as (
  select crop_cycle_id,kind,count(*) as total,coalesce(sum(kg),0) kg,coalesce(sum(expense),0) expense,coalesce(sum(income),0) income from records group by crop_cycle_id,kind
 )
 select coalesce(jsonb_agg(jsonb_build_object('cycleId',crop_cycle_id,'resource',kind,'count',total,'kilograms',kg,'expenses',expense,'income',income)),'[]'::jsonb) into result from grouped;
 return result;
end $$;
revoke all on function public.get_greenhouse_cycle_totals(uuid) from public;
grant execute on function public.get_greenhouse_cycle_totals(uuid) to authenticated;
create or replace function public.get_cycle_operational_aggregates(
  target_company_id uuid,
  target_greenhouse_id uuid default null,
  target_start_date date default null,
  target_end_date date default null,
  target_cycle_id uuid default null,
  target_unassigned boolean default false
)
returns jsonb
language plpgsql
security invoker
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
      and (not target_unassigned or cost.crop_cycle_id is null)
      and (target_cycle_id is null or cost.crop_cycle_id = target_cycle_id)
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
      and (not target_unassigned or harvest.crop_cycle_id is null)
      and (target_cycle_id is null or harvest.crop_cycle_id = target_cycle_id)
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
      and (not target_unassigned or irrigation.crop_cycle_id is null)
      and (target_cycle_id is null or irrigation.crop_cycle_id = target_cycle_id)
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
revoke all on function public.get_cycle_operational_aggregates(uuid,uuid,date,date,uuid,boolean) from public;
grant execute on function public.get_cycle_operational_aggregates(uuid,uuid,date,date,uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
