-- mira - 45 Inventory intake from the Applications catalog
-- Ejecutar después de 44_work_inventory_costs.sql.
-- Permite registrar la primera compra de un producto existente sin crear primero un artículo de inventario.

create or replace function public.receive_product_inventory(
  target_company_id uuid,
  target_product_id uuid,
  target_base_unit text,
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
declare
  target_product public.products%rowtype;
  target_item public.inventory_items%rowtype;
  location_id uuid;
  movement_id uuid;
  requested_unit text;
begin
  if not public.can_manage_company(target_company_id) then raise exception 'not_allowed'; end if;
  if target_unit_cost is null or target_unit_cost < 0 then raise exception 'inventory_unit_cost_invalid'; end if;

  select * into target_product
  from public.products
  where id = target_product_id and company_id = target_company_id;
  if target_product.id is null then raise exception 'invalid_inventory_product'; end if;

  requested_unit := nullif(trim(target_base_unit), '');
  select * into target_item
  from public.inventory_items
  where company_id = target_company_id and product_id = target_product_id
  for update;

  if target_item.id is null then
    if requested_unit is null then raise exception 'inventory_unit_required'; end if;
    insert into public.inventory_items (company_id, product_id, kind, name, base_unit, cost_category, created_by)
    values (
      target_company_id,
      target_product_id,
      'material',
      target_product.name,
      requested_unit,
      case when target_product.category = 'fertilizante' then 'fertilizantes'::public.cost_category else 'agroinsumos'::public.cost_category end,
      auth.uid()
    )
    returning * into target_item;
  else
    if requested_unit is not null and lower(trim(target_item.base_unit)) <> lower(requested_unit) then
      raise exception 'inventory_unit_mismatch';
    end if;
    update public.inventory_items
    set name = target_product.name, is_active = true, updated_at = now()
    where id = target_item.id
    returning * into target_item;
  end if;

  location_id := coalesce(target_location_id, public.ensure_central_inventory_location(target_company_id));
  movement_id := public.apply_inventory_movement(
    target_company_id, location_id, target_item.id, 'receipt', target_quantity, target_unit_cost,
    target_occurred_at, target_idempotency_key, target_note, null, null, null, auth.uid()
  );

  return jsonb_build_object('movementId', movement_id, 'inventoryItemId', target_item.id, 'baseUnit', target_item.base_unit);
end;
$$;

revoke all on function public.receive_product_inventory(uuid, uuid, text, numeric, numeric, date, text, text, uuid) from public, anon;
grant execute on function public.receive_product_inventory(uuid, uuid, text, numeric, numeric, date, text, text, uuid) to authenticated;
