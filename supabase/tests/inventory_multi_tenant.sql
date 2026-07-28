-- Runs after the full migration chain as the local database owner.
-- Covers inventory idempotency, stock safety, cross-company writes, and RLS reads.
rollback;
begin;

do $$
declare
  company_a uuid := '61000000-0000-0000-0000-000000000001';
  company_b uuid := '62000000-0000-0000-0000-000000000001';
  owner_a uuid := '63000000-0000-0000-0000-000000000001';
  owner_b uuid := '64000000-0000-0000-0000-000000000001';
  item_a uuid;
  item_b uuid;
  location_a uuid;
  movement_count integer;
  balance_quantity numeric;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-a@example.test', '', now(), '{}', '{}', now(), now()),
    (owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inventory-b@example.test', '', now(), '{}', '{}', now(), now());

  insert into public.companies (id, name, created_by)
  values (company_a, 'Inventario A', owner_a), (company_b, 'Inventario B', owner_b);

  if not exists (
    select 1 from public.company_members
    where company_id = company_a and user_id = owner_a and role = 'owner' and status = 'active'
  ) or not exists (
    select 1 from public.company_members
    where company_id = company_b and user_id = owner_b and role = 'owner' and status = 'active'
  ) then
    raise exception 'Company creation did not provision its active owner membership';
  end if;

  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  select (public.create_inventory_item(company_a, 'Fertilizante A', 'kg')->>'inventoryItemId')::uuid into item_a;
  select id into location_a
  from public.inventory_locations
  where company_id = company_a and is_central;

  perform public.receive_inventory(company_a, item_a, 10, 25, current_date, 'inventory-a-receipt');
  perform public.receive_inventory(company_a, item_a, 10, 25, current_date, 'inventory-a-receipt');

  select count(*) into movement_count
  from public.inventory_movements
  where company_id = company_a and idempotency_key = 'inventory-a-receipt';
  if movement_count <> 1 then raise exception 'Inventory receipt was not idempotent'; end if;

  select quantity into balance_quantity
  from public.inventory_balances
  where company_id = company_a and location_id = location_a and inventory_item_id = item_a;
  if balance_quantity <> 10 then raise exception 'Unexpected inventory balance: %', balance_quantity; end if;

  begin
    perform public.adjust_inventory(company_a, item_a, -11, current_date, 'invalid negative stock', 'inventory-a-underflow');
    raise exception 'Inventory accepted negative stock';
  exception when others then
    if sqlerrm <> 'inventory_insufficient_stock' then raise; end if;
  end;

  begin
    perform public.receive_inventory(company_b, item_a, 1, 25, current_date, 'inventory-cross-company-write');
    raise exception 'Owner A wrote inventory for company B';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', owner_b::text, true);
  select (public.create_inventory_item(company_b, 'Fertilizante B', 'kg')->>'inventoryItemId')::uuid into item_b;
  begin
    perform public.receive_inventory(company_b, item_a, 1, 25, current_date, 'inventory-cross-company-item');
    raise exception 'Company B used an inventory item from company A';
  exception when others then
    if sqlerrm <> 'inventory_item_not_found' then raise; end if;
  end;

  if item_b is null then raise exception 'Company B inventory item was not created'; end if;
end
$$;

select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
begin
  if not exists (
    select 1 from public.inventory_items where company_id = '61000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Owner A lost access to its inventory';
  end if;
  if exists (
    select 1 from public.inventory_items where company_id = '62000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'RLS exposed company B inventory to owner A';
  end if;
end
$$;

rollback;
