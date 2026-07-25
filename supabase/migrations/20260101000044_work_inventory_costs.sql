-- mira - 44 Work inventory and automatic costs
-- Ejecutar después de 43_inventory_core.sql.
-- Convierte consumos de Work y recursos medidos en movimientos/costos idempotentes.

do $$ begin
  create type public.cost_origin as enum ('manual', 'inventory', 'resource', 'reversal');
exception when duplicate_object then null;
end $$;

alter table public.cost_records
add column if not exists source_work_id uuid references public.tasks(id) on delete restrict,
add column if not exists source_inventory_movement_id uuid references public.inventory_movements(id) on delete restrict,
add column if not exists source_resource_consumption_id uuid references public.work_resource_consumptions(id) on delete restrict,
add column if not exists origin public.cost_origin not null default 'manual';

create unique index if not exists cost_records_source_inventory_movement_unique
on public.cost_records(source_inventory_movement_id)
where source_inventory_movement_id is not null;
create unique index if not exists cost_records_source_resource_consumption_unique
on public.cost_records(source_resource_consumption_id)
where source_resource_consumption_id is not null;
create index if not exists cost_records_source_work_idx
on public.cost_records(source_work_id)
where source_work_id is not null;

create table if not exists public.work_inventory_consumptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_id uuid not null references public.tasks(id) on delete restrict,
  task_material_id uuid references public.task_materials(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  quantity numeric(14,4) not null,
  unit text not null,
  occurred_at date not null,
  idempotency_key text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (company_id, idempotency_key),
  constraint work_inventory_consumptions_quantity_positive check (quantity > 0),
  constraint work_inventory_consumptions_unit_required check (nullif(trim(unit), '') is not null)
);

create index if not exists work_inventory_consumptions_work_idx
on public.work_inventory_consumptions(work_id, occurred_at desc);

alter table public.work_inventory_consumptions enable row level security;
drop policy if exists "work_inventory_consumptions_select_member" on public.work_inventory_consumptions;
create policy "work_inventory_consumptions_select_member"
on public.work_inventory_consumptions for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "work_inventory_consumptions_insert_manager" on public.work_inventory_consumptions;
create policy "work_inventory_consumptions_insert_manager"
on public.work_inventory_consumptions for insert to authenticated
with check (public.can_manage_company(company_id));
drop policy if exists "work_inventory_consumptions_update_manager" on public.work_inventory_consumptions;
create policy "work_inventory_consumptions_update_manager"
on public.work_inventory_consumptions for update to authenticated
using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id));
drop policy if exists "work_inventory_consumptions_delete_manager" on public.work_inventory_consumptions;
create policy "work_inventory_consumptions_delete_manager"
on public.work_inventory_consumptions for delete to authenticated
using (public.can_manage_company(company_id));

create or replace function public.record_inventory_work_cost(
  target_company_id uuid,
  target_work_id uuid,
  target_greenhouse_id uuid,
  target_movement_id uuid,
  target_category public.cost_category,
  target_amount numeric,
  target_occurred_at date,
  target_note text,
  target_origin public.cost_origin default 'inventory'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare cost_id uuid;
begin
  if target_amount is null or target_amount = 0 then return null; end if;
  insert into public.cost_records (
    company_id, greenhouse_id, category, amount, occurred_at, notes,
    source_work_id, source_inventory_movement_id, origin, created_by
  ) values (
    target_company_id, target_greenhouse_id, target_category, target_amount, target_occurred_at,
    nullif(trim(target_note), ''), target_work_id, target_movement_id, target_origin, auth.uid()
  ) on conflict (source_inventory_movement_id) where source_inventory_movement_id is not null
  do update set amount = excluded.amount, occurred_at = excluded.occurred_at, notes = excluded.notes, updated_at = now()
  returning id into cost_id;
  return cost_id;
end;
$$;

create or replace function public.record_resource_work_cost(
  target_company_id uuid,
  target_work_id uuid,
  target_greenhouse_id uuid,
  target_resource_type public.resource_cost_type,
  target_quantity numeric,
  target_unit text,
  target_occurred_at date,
  target_idempotency_key text,
  target_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rate public.company_resource_rates%rowtype;
  consumption_id uuid;
  cost_id uuid;
  cost_category_value public.cost_category;
begin
  if target_quantity is null or target_quantity <= 0 then raise exception 'resource_quantity_required'; end if;
  if nullif(trim(target_idempotency_key), '') is null then raise exception 'resource_idempotency_required'; end if;
  select * into rate from public.company_resource_rates
  where company_id = target_company_id and resource_type = target_resource_type and is_active;
  if rate.id is null then return jsonb_build_object('skipped', true, 'reason', 'resource_rate_not_configured'); end if;
  if lower(trim(rate.unit)) <> lower(trim(target_unit)) then raise exception 'resource_unit_mismatch'; end if;

  insert into public.work_resource_consumptions (
    company_id, work_id, greenhouse_id, resource_type, quantity, unit, unit_cost,
    occurred_at, idempotency_key, note, created_by
  ) values (
    target_company_id, target_work_id, target_greenhouse_id, target_resource_type,
    target_quantity, trim(target_unit), rate.unit_cost, target_occurred_at,
    trim(target_idempotency_key), nullif(trim(target_note), ''), auth.uid()
  ) on conflict (company_id, idempotency_key) do nothing
  returning id into consumption_id;

  if consumption_id is null then
    select id into consumption_id from public.work_resource_consumptions
    where company_id = target_company_id and idempotency_key = trim(target_idempotency_key);
    return jsonb_build_object('resourceConsumptionId', consumption_id, 'idempotent', true);
  end if;

  cost_category_value := case target_resource_type
    when 'water'::public.resource_cost_type then 'agua'::public.cost_category
    when 'energy'::public.resource_cost_type then 'energia'::public.cost_category
    else 'mano_obra'::public.cost_category
  end;
  insert into public.cost_records (
    company_id, greenhouse_id, category, amount, occurred_at, notes,
    source_work_id, source_resource_consumption_id, origin, created_by
  ) values (
    target_company_id, target_greenhouse_id, cost_category_value,
    round(target_quantity * rate.unit_cost, 2), target_occurred_at, nullif(trim(target_note), ''),
    target_work_id, consumption_id, 'resource', auth.uid()
  ) on conflict (source_resource_consumption_id) where source_resource_consumption_id is not null
  do update set amount = excluded.amount, occurred_at = excluded.occurred_at, notes = excluded.notes, updated_at = now()
  returning id into cost_id;
  return jsonb_build_object('resourceConsumptionId', consumption_id, 'costId', cost_id);
end;
$$;

create or replace function public.record_work_inventory_consumption(
  target_work_id uuid,
  target_inventory_item_id uuid,
  target_quantity numeric,
  target_unit text,
  target_occurred_at date,
  target_idempotency_key text,
  target_note text default null,
  target_task_material_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  item public.inventory_items%rowtype;
  existing public.work_inventory_consumptions%rowtype;
  consumption_id uuid;
  location_id uuid;
  movement_id uuid;
  movement public.inventory_movements%rowtype;
  cost_id uuid;
begin
  select * into target_work from public.tasks where id = target_work_id;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if auth.role() <> 'service_role'
    and not public.can_operate_work(target_work_id)
    and not public.can_manage_company(target_work.company_id) then
    raise exception 'not_allowed';
  end if;
  if target_quantity is null or target_quantity <= 0 then raise exception 'inventory_quantity_required'; end if;
  if target_occurred_at is null then raise exception 'inventory_date_required'; end if;
  if nullif(trim(target_idempotency_key), '') is null then raise exception 'inventory_idempotency_required'; end if;
  select * into item from public.inventory_items
  where id = target_inventory_item_id and company_id = target_work.company_id and is_active;
  if item.id is null then raise exception 'inventory_item_not_found'; end if;
  if lower(trim(item.base_unit)) <> lower(trim(target_unit)) then raise exception 'inventory_unit_mismatch'; end if;
  if target_task_material_id is not null and not exists (
    select 1 from public.task_materials where id = target_task_material_id and task_id = target_work.id
  ) then raise exception 'invalid_work_material'; end if;

  select * into existing from public.work_inventory_consumptions
  where company_id = target_work.company_id and idempotency_key = trim(target_idempotency_key);
  if existing.id is not null then
    return jsonb_build_object('inventoryConsumptionId', existing.id, 'movementId', existing.inventory_movement_id, 'idempotent', true);
  end if;

  location_id := public.ensure_central_inventory_location(target_work.company_id);
  movement_id := public.apply_inventory_movement(
    target_work.company_id, location_id, item.id, 'consumption', -target_quantity, null,
    target_occurred_at, 'work-consumption:' || trim(target_idempotency_key), target_note,
    target_work.id, target_task_material_id, null, auth.uid()
  );
  select * into movement from public.inventory_movements where id = movement_id;

  insert into public.work_inventory_consumptions (
    company_id, work_id, task_material_id, inventory_item_id, inventory_movement_id,
    quantity, unit, occurred_at, idempotency_key, created_by
  ) values (
    target_work.company_id, target_work.id, target_task_material_id, item.id, movement_id,
    target_quantity, item.base_unit, target_occurred_at, trim(target_idempotency_key), auth.uid()
  ) on conflict (company_id, idempotency_key) do nothing
  returning id into consumption_id;

  if consumption_id is null then
    select id into consumption_id from public.work_inventory_consumptions
    where company_id = target_work.company_id and idempotency_key = trim(target_idempotency_key);
  end if;

  cost_id := public.record_inventory_work_cost(
    target_work.company_id, target_work.id, target_work.greenhouse_id, movement_id, item.cost_category,
    round(abs(movement.quantity) * movement.unit_cost, 2), target_occurred_at,
    coalesce(nullif(trim(target_note), ''), 'Consumo automático de inventario')
  );
  return jsonb_build_object('inventoryConsumptionId', consumption_id, 'movementId', movement_id, 'costId', cost_id);
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

  -- Las dosis numéricas con la misma unidad que el artículo se vuelven consumo.
  for material in select * from public.task_materials where task_id = target_work.id loop
    if material.product_id is null or material.dose is null or material.unit is null
      or trim(material.dose) !~ '^[0-9]+([.,][0-9]+)?$' then
      continue;
    end if;
    select * into item from public.inventory_items
    where company_id = target_work.company_id and product_id = material.product_id
      and kind = 'material' and is_active;
    if item.id is null or lower(trim(item.base_unit)) <> lower(trim(material.unit)) then continue; end if;
    quantity_value := replace(trim(material.dose), ',', '.')::numeric;
    perform public.record_work_inventory_consumption(
      target_work.id, item.id, quantity_value, item.base_unit, target_occurred_at,
      'material:' || target_work.id::text || ':' || material.id::text,
      'Consumo automático desde Work', material.id
    );
    applied_count := applied_count + 1;
  end loop;

  if target_water_liters is not null and target_water_liters > 0 then
    perform public.record_resource_work_cost(
      target_work.company_id, target_work.id, target_work.greenhouse_id, 'water', target_water_liters,
      'L', target_occurred_at, 'water:' || target_work.id::text, 'Costo automático de agua'
    );
  end if;

  if coalesce(target_work.technical_plan->>'energyKwh', '') ~ '^[0-9]+([.,][0-9]+)?$' then
    energy_kwh := replace(target_work.technical_plan->>'energyKwh', ',', '.')::numeric;
    if energy_kwh > 0 then
      perform public.record_resource_work_cost(
        target_work.company_id, target_work.id, target_work.greenhouse_id, 'energy', energy_kwh,
        'kWh', target_occurred_at, 'energy:' || target_work.id::text, 'Costo automático de energía'
      );
    end if;
  end if;

  if coalesce(target_work.technical_plan->>'laborHours', '') ~ '^[0-9]+([.,][0-9]+)?$' then
    labor_hours := replace(target_work.technical_plan->>'laborHours', ',', '.')::numeric * greatest(coalesce(target_work.crew_size, 1), 1);
    if labor_hours > 0 then
      perform public.record_resource_work_cost(
        target_work.company_id, target_work.id, target_work.greenhouse_id, 'labor', labor_hours,
        'h', target_occurred_at, 'labor:' || target_work.id::text, 'Costo automático de mano de obra'
      );
    end if;
  end if;
  return jsonb_build_object('workId', target_work.id, 'materialConsumptions', applied_count);
end;
$$;

create or replace function public.on_irrigation_inventory_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_work_automatic_costs(new.source_task_id, new.occurred_at, new.estimated_liters);
  return new;
end;
$$;

create or replace function public.on_material_work_inventory_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_work_automatic_costs(new.source_task_id, new.occurred_at, null);
  return new;
end;
$$;

drop trigger if exists irrigation_records_inventory_cost on public.irrigation_records;
create trigger irrigation_records_inventory_cost
after insert on public.irrigation_records
for each row execute function public.on_irrigation_inventory_cost();

drop trigger if exists nutrition_records_inventory_cost on public.nutrition_records;
create trigger nutrition_records_inventory_cost
after insert on public.nutrition_records
for each row execute function public.on_material_work_inventory_cost();

drop trigger if exists application_records_inventory_cost on public.application_records;
create trigger application_records_inventory_cost
after insert on public.application_records
for each row execute function public.on_material_work_inventory_cost();

create or replace function public.on_work_automatic_resource_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completada'::public.task_status, 'verificada'::public.task_status)
    and old.status not in ('completada'::public.task_status, 'verificada'::public.task_status)
    and new.occurred_at is not null then
    perform public.sync_work_automatic_costs(new.id, new.occurred_at::date, null);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_automatic_resource_cost on public.tasks;
create trigger tasks_automatic_resource_cost
after update of status on public.tasks
for each row execute function public.on_work_automatic_resource_cost();

-- Una reversión devuelve existencias y genera el contra-costo, sin borrar historia.
create or replace function public.reverse_inventory_movement(
  target_movement_id uuid,
  target_reason text,
  target_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_movement public.inventory_movements%rowtype;
  reversal_id uuid;
  source_cost public.cost_records%rowtype;
  reversal_cost_id uuid;
begin
  select * into source_movement from public.inventory_movements where id = target_movement_id for update;
  if source_movement.id is null then raise exception 'inventory_movement_not_found'; end if;
  if not public.can_manage_company(source_movement.company_id) then raise exception 'not_allowed'; end if;
  if nullif(trim(target_reason), '') is null then raise exception 'inventory_reversal_reason_required'; end if;
  reversal_id := public.apply_inventory_movement(
    source_movement.company_id, source_movement.location_id, source_movement.inventory_item_id,
    'reversal', -source_movement.quantity, source_movement.unit_cost, current_date,
    target_idempotency_key, target_reason, source_movement.work_id, source_movement.task_material_id,
    source_movement.id, auth.uid()
  );
  select * into source_cost from public.cost_records where source_inventory_movement_id = source_movement.id;
  if source_cost.id is not null then
    insert into public.cost_records (
      company_id, greenhouse_id, category, amount, occurred_at, notes, source_work_id,
      source_inventory_movement_id, origin, created_by
    ) values (
      source_cost.company_id, source_cost.greenhouse_id, source_cost.category, -source_cost.amount,
      current_date, 'Reversión: ' || trim(target_reason), source_cost.source_work_id,
      reversal_id, 'reversal', auth.uid()
    ) on conflict (source_inventory_movement_id) where source_inventory_movement_id is not null
    do update set amount = excluded.amount, notes = excluded.notes, updated_at = now()
    returning id into reversal_cost_id;
  end if;
  return jsonb_build_object('movementId', reversal_id, 'reversedMovementId', source_movement.id, 'costId', reversal_cost_id);
end;
$$;

revoke all on function public.record_inventory_work_cost(uuid, uuid, uuid, uuid, public.cost_category, numeric, date, text, public.cost_origin) from public, anon;
revoke all on function public.record_resource_work_cost(uuid, uuid, uuid, public.resource_cost_type, numeric, text, date, text, text) from public, anon;
revoke all on function public.sync_work_automatic_costs(uuid, date, numeric) from public, anon;
revoke all on function public.record_work_inventory_consumption(uuid, uuid, numeric, text, date, text, text, uuid) from public, anon;
grant execute on function public.record_work_inventory_consumption(uuid, uuid, numeric, text, date, text, text, uuid) to authenticated;
revoke all on function public.reverse_inventory_movement(uuid, text, text) from public, anon;
grant execute on function public.reverse_inventory_movement(uuid, text, text) to authenticated;
