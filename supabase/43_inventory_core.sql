-- mira - 43 Inventory core
-- Ejecutar después de 42_work_technical_backfill.sql.
-- Almacén central multiempresa, existencias por unidad y movimientos auditables.

do $$ begin
  create type public.inventory_item_kind as enum ('material', 'water', 'energy', 'labor');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inventory_movement_type as enum ('receipt', 'consumption', 'adjustment', 'reversal');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.resource_cost_type as enum ('water', 'energy', 'labor');
exception when duplicate_object then null;
end $$;

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  is_central boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (id, company_id)
);

create unique index if not exists inventory_locations_one_central_idx
on public.inventory_locations(company_id)
where is_central;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  kind public.inventory_item_kind not null default 'material',
  name text not null,
  base_unit text not null,
  cost_category public.cost_category not null default 'agroinsumos',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, product_id),
  constraint inventory_items_base_unit_required check (nullif(trim(base_unit), '') is not null)
);

create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(14,4) not null default 0,
  average_unit_cost numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (location_id, inventory_item_id),
  foreign key (location_id, company_id)
    references public.inventory_locations(id, company_id) on delete restrict,
  foreign key (inventory_item_id, company_id)
    references public.inventory_items(id, company_id) on delete restrict,
  constraint inventory_balances_non_negative check (quantity >= 0),
  constraint inventory_balances_cost_non_negative check (average_unit_cost >= 0)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid not null,
  inventory_item_id uuid not null,
  movement_type public.inventory_movement_type not null,
  quantity numeric(14,4) not null,
  unit_cost numeric(14,4) not null default 0,
  occurred_at date not null,
  work_id uuid references public.tasks(id) on delete restrict,
  task_material_id uuid references public.task_materials(id) on delete restrict,
  related_movement_id uuid references public.inventory_movements(id) on delete restrict,
  idempotency_key text not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (company_id, idempotency_key),
  foreign key (location_id, company_id)
    references public.inventory_locations(id, company_id) on delete restrict,
  foreign key (inventory_item_id, company_id)
    references public.inventory_items(id, company_id) on delete restrict,
  constraint inventory_movements_quantity_direction check (
    (movement_type = 'receipt' and quantity > 0)
    or (movement_type = 'consumption' and quantity < 0)
    or (movement_type in ('adjustment', 'reversal') and quantity <> 0)
  ),
  constraint inventory_movements_cost_non_negative check (unit_cost >= 0)
);

create index if not exists inventory_movements_company_item_date_idx
on public.inventory_movements(company_id, inventory_item_id, occurred_at desc);
create index if not exists inventory_movements_work_idx
on public.inventory_movements(work_id)
where work_id is not null;

create table if not exists public.company_resource_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_type public.resource_cost_type not null,
  unit text not null,
  unit_cost numeric(14,4) not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, resource_type),
  constraint company_resource_rates_unit_required check (nullif(trim(unit), '') is not null),
  constraint company_resource_rates_cost_non_negative check (unit_cost >= 0)
);

create table if not exists public.work_resource_consumptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_id uuid not null references public.tasks(id) on delete restrict,
  greenhouse_id uuid references public.greenhouses(id) on delete set null,
  resource_type public.resource_cost_type not null,
  quantity numeric(14,4) not null,
  unit text not null,
  unit_cost numeric(14,4) not null,
  occurred_at date not null,
  idempotency_key text not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (company_id, idempotency_key),
  constraint work_resource_consumptions_quantity_positive check (quantity > 0),
  constraint work_resource_consumptions_cost_non_negative check (unit_cost >= 0)
);

create index if not exists work_resource_consumptions_work_idx
on public.work_resource_consumptions(work_id, occurred_at desc);

alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.company_resource_rates enable row level security;
alter table public.work_resource_consumptions enable row level security;

do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'inventory_locations', 'inventory_items', 'inventory_balances', 'inventory_movements',
    'company_resource_rates', 'work_resource_consumptions'
  ] loop
    execute format('drop policy if exists "%s_select_member" on public.%I', table_name, table_name);
    execute format('create policy "%s_select_member" on public.%I for select to authenticated using (public.is_company_member(company_id))', table_name, table_name);
    execute format('drop policy if exists "%s_insert_manager" on public.%I', table_name, table_name);
    execute format('create policy "%s_insert_manager" on public.%I for insert to authenticated with check (public.can_manage_company(company_id))', table_name, table_name);
    execute format('drop policy if exists "%s_update_manager" on public.%I', table_name, table_name);
    execute format('create policy "%s_update_manager" on public.%I for update to authenticated using (public.can_manage_company(company_id)) with check (public.can_manage_company(company_id))', table_name, table_name);
    execute format('drop policy if exists "%s_delete_manager" on public.%I', table_name, table_name);
    execute format('create policy "%s_delete_manager" on public.%I for delete to authenticated using (public.can_manage_company(company_id))', table_name, table_name);
  end loop;
end $$;

create or replace function public.ensure_central_inventory_location(target_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare location_id uuid;
begin
  select id into location_id
  from public.inventory_locations
  where company_id = target_company_id and is_central
  limit 1;
  if location_id is not null then return location_id; end if;

  insert into public.inventory_locations (company_id, name, code, is_central, created_by)
  values (target_company_id, 'Almacén central', 'CENTRAL', true, auth.uid())
  on conflict (company_id, code) do update set is_central = true
  returning id into location_id;
  return location_id;
end;
$$;

create or replace function public.create_inventory_item(
  target_company_id uuid,
  target_name text,
  target_base_unit text,
  target_kind public.inventory_item_kind default 'material',
  target_cost_category public.cost_category default 'agroinsumos',
  target_product_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare item public.inventory_items%rowtype;
begin
  if not public.can_manage_company(target_company_id) then raise exception 'not_allowed'; end if;
  if nullif(trim(target_name), '') is null then raise exception 'inventory_item_name_required'; end if;
  if nullif(trim(target_base_unit), '') is null then raise exception 'inventory_unit_required'; end if;
  if target_product_id is not null and not exists (
    select 1 from public.products product where product.id = target_product_id and product.company_id = target_company_id
  ) then raise exception 'invalid_inventory_product'; end if;

  insert into public.inventory_items (company_id, product_id, kind, name, base_unit, cost_category, created_by)
  values (target_company_id, target_product_id, target_kind, trim(target_name), trim(target_base_unit), target_cost_category, auth.uid())
  on conflict (company_id, product_id) do update
    set name = excluded.name, base_unit = excluded.base_unit, cost_category = excluded.cost_category,
        kind = excluded.kind, is_active = true, updated_at = now()
  returning * into item;

  perform public.ensure_central_inventory_location(target_company_id);
  return jsonb_build_object('inventoryItemId', item.id, 'baseUnit', item.base_unit);
end;
$$;

create or replace function public.set_company_resource_rate(
  target_company_id uuid,
  target_resource_type public.resource_cost_type,
  target_unit text,
  target_unit_cost numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare rate public.company_resource_rates%rowtype;
begin
  if not public.can_manage_company(target_company_id) then raise exception 'not_allowed'; end if;
  if nullif(trim(target_unit), '') is null then raise exception 'resource_unit_required'; end if;
  if target_unit_cost is null or target_unit_cost < 0 then raise exception 'resource_rate_invalid'; end if;
  insert into public.company_resource_rates (company_id, resource_type, unit, unit_cost, created_by)
  values (target_company_id, target_resource_type, trim(target_unit), target_unit_cost, auth.uid())
  on conflict (company_id, resource_type) do update
    set unit = excluded.unit, unit_cost = excluded.unit_cost, is_active = true, updated_at = now()
  returning * into rate;
  return jsonb_build_object('resourceType', rate.resource_type, 'unit', rate.unit, 'unitCost', rate.unit_cost);
end;
$$;

create or replace function public.apply_inventory_movement(
  target_company_id uuid,
  target_location_id uuid,
  target_item_id uuid,
  target_movement_type public.inventory_movement_type,
  target_quantity numeric,
  target_unit_cost numeric,
  target_occurred_at date,
  target_idempotency_key text,
  target_note text default null,
  target_work_id uuid default null,
  target_task_material_id uuid default null,
  target_related_movement_id uuid default null,
  target_actor_user_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_movement_id uuid;
  balance public.inventory_balances%rowtype;
  resolved_cost numeric(14,4);
  new_quantity numeric(14,4);
  movement_id uuid;
begin
  if nullif(trim(target_idempotency_key), '') is null then raise exception 'inventory_idempotency_required'; end if;
  select id into existing_movement_id from public.inventory_movements
  where company_id = target_company_id and idempotency_key = trim(target_idempotency_key);
  if existing_movement_id is not null then return existing_movement_id; end if;
  if target_quantity is null or target_quantity = 0 then raise exception 'inventory_quantity_required'; end if;
  if target_movement_type = 'receipt' and target_quantity <= 0 then raise exception 'inventory_receipt_quantity_invalid'; end if;
  if target_movement_type = 'consumption' and target_quantity >= 0 then raise exception 'inventory_consumption_quantity_invalid'; end if;
  if target_occurred_at is null then raise exception 'inventory_date_required'; end if;
  if not exists (select 1 from public.inventory_locations where id = target_location_id and company_id = target_company_id and is_active) then
    raise exception 'inventory_location_not_found';
  end if;
  if not exists (select 1 from public.inventory_items where id = target_item_id and company_id = target_company_id and is_active) then
    raise exception 'inventory_item_not_found';
  end if;

  select * into balance from public.inventory_balances
  where location_id = target_location_id and inventory_item_id = target_item_id for update;
  if balance.id is null then
    if target_quantity < 0 then raise exception 'inventory_insufficient_stock'; end if;
    insert into public.inventory_balances (company_id, location_id, inventory_item_id, quantity, average_unit_cost)
    values (target_company_id, target_location_id, target_item_id, 0, 0)
    returning * into balance;
  end if;

  resolved_cost := case
    when target_quantity > 0 then coalesce(target_unit_cost, 0)
    else balance.average_unit_cost
  end;
  if resolved_cost < 0 then raise exception 'inventory_unit_cost_invalid'; end if;
  new_quantity := balance.quantity + target_quantity;
  if new_quantity < 0 then raise exception 'inventory_insufficient_stock'; end if;

  insert into public.inventory_movements (
    company_id, location_id, inventory_item_id, movement_type, quantity, unit_cost,
    occurred_at, work_id, task_material_id, related_movement_id, idempotency_key, note, created_by
  ) values (
    target_company_id, target_location_id, target_item_id, target_movement_type, target_quantity, resolved_cost,
    target_occurred_at, target_work_id, target_task_material_id, target_related_movement_id,
    trim(target_idempotency_key), nullif(trim(target_note), ''), target_actor_user_id
  ) returning id into movement_id;

  update public.inventory_balances
  set quantity = new_quantity,
      average_unit_cost = case
        when target_quantity > 0 and new_quantity > 0
          then round(((balance.quantity * balance.average_unit_cost) + (target_quantity * resolved_cost)) / new_quantity, 4)
        when new_quantity = 0 then balance.average_unit_cost
        else balance.average_unit_cost
      end,
      updated_at = now()
  where id = balance.id;
  return movement_id;
exception when unique_violation then
  select id into existing_movement_id from public.inventory_movements
  where company_id = target_company_id and idempotency_key = trim(target_idempotency_key);
  return existing_movement_id;
end;
$$;

create or replace function public.receive_inventory(
  target_company_id uuid,
  target_item_id uuid,
  target_quantity numeric,
  target_unit_cost numeric,
  target_occurred_at date,
  target_idempotency_key text,
  target_note text default null,
  target_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare location_id uuid; movement_id uuid;
begin
  if not public.can_manage_company(target_company_id) then raise exception 'not_allowed'; end if;
  if target_unit_cost is null or target_unit_cost < 0 then raise exception 'inventory_unit_cost_invalid'; end if;
  location_id := coalesce(target_location_id, public.ensure_central_inventory_location(target_company_id));
  movement_id := public.apply_inventory_movement(
    target_company_id, location_id, target_item_id, 'receipt', target_quantity, target_unit_cost,
    target_occurred_at, target_idempotency_key, target_note, null, null, null, auth.uid()
  );
  return jsonb_build_object('movementId', movement_id);
end;
$$;

create or replace function public.adjust_inventory(
  target_company_id uuid,
  target_item_id uuid,
  target_quantity_delta numeric,
  target_occurred_at date,
  target_reason text,
  target_idempotency_key text,
  target_location_id uuid default null,
  target_unit_cost numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare location_id uuid; movement_id uuid;
begin
  if not public.can_manage_company(target_company_id) then raise exception 'not_allowed'; end if;
  if nullif(trim(target_reason), '') is null then raise exception 'inventory_adjustment_reason_required'; end if;
  location_id := coalesce(target_location_id, public.ensure_central_inventory_location(target_company_id));
  movement_id := public.apply_inventory_movement(
    target_company_id, location_id, target_item_id, 'adjustment', target_quantity_delta, target_unit_cost,
    target_occurred_at, target_idempotency_key, target_reason, null, null, null, auth.uid()
  );
  return jsonb_build_object('movementId', movement_id);
end;
$$;

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
declare source_movement public.inventory_movements%rowtype; reversal_id uuid;
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
  return jsonb_build_object('movementId', reversal_id, 'reversedMovementId', source_movement.id);
end;
$$;

revoke all on function public.apply_inventory_movement(uuid, uuid, uuid, public.inventory_movement_type, numeric, numeric, date, text, text, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.ensure_central_inventory_location(uuid) from public, anon;
revoke all on function public.create_inventory_item(uuid, text, text, public.inventory_item_kind, public.cost_category, uuid) from public, anon;
grant execute on function public.create_inventory_item(uuid, text, text, public.inventory_item_kind, public.cost_category, uuid) to authenticated;
revoke all on function public.set_company_resource_rate(uuid, public.resource_cost_type, text, numeric) from public, anon;
grant execute on function public.set_company_resource_rate(uuid, public.resource_cost_type, text, numeric) to authenticated;
revoke all on function public.receive_inventory(uuid, uuid, numeric, numeric, date, text, text, uuid) from public, anon;
grant execute on function public.receive_inventory(uuid, uuid, numeric, numeric, date, text, text, uuid) to authenticated;
revoke all on function public.adjust_inventory(uuid, uuid, numeric, date, text, text, uuid, numeric) from public, anon;
grant execute on function public.adjust_inventory(uuid, uuid, numeric, date, text, text, uuid, numeric) to authenticated;
revoke all on function public.reverse_inventory_movement(uuid, text, text) from public, anon;
grant execute on function public.reverse_inventory_movement(uuid, text, text) to authenticated;
