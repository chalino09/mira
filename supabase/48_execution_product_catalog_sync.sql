-- mira - 48 Execution product catalog sync
-- Ejecutar despues de 47_pending_product_catalog.sql.
-- Permite confirmar, sustituir o agregar productos desde el catálogo
-- antes de cerrar una aplicación o nutrición, conservando product_id e inventario.

create or replace function public.sync_work_execution_materials(
  target_work_id uuid,
  target_materials jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  material_item jsonb;
  material_index bigint;
  material_id_text text;
  material_id uuid;
  selected_product_id uuid;
  result_material_ids jsonb := '[]'::jsonb;
begin
  select * into target_work
  from public.tasks
  where id = target_work_id;

  if target_work.id is null then
    raise exception 'work_not_found';
  end if;

  if not public.can_manage_company(target_work.company_id)
    and target_work.responsible_user_id is distinct from auth.uid()
    and not public.is_task_assignee(target_work.id) then
    raise exception 'not_allowed';
  end if;

  if target_work.status in ('completada'::public.task_status, 'verificada'::public.task_status, 'cancelada'::public.task_status) then
    raise exception 'work_is_closed';
  end if;

  if jsonb_typeof(target_materials) <> 'array' or jsonb_array_length(target_materials) = 0 then
    raise exception 'work_materials_required';
  end if;

  for material_item, material_index in
    select value, ordinality
    from jsonb_array_elements(target_materials) with ordinality
  loop
    selected_product_id := nullif(trim(material_item->>'productId'), '')::uuid;
    material_id_text := nullif(trim(material_item->>'materialId'), '');

    if selected_product_id is null or not exists (
      select 1
      from public.products product
      where product.id = selected_product_id
        and product.company_id = target_work.company_id
    ) then
      raise exception 'invalid_material_product';
    end if;

    if nullif(trim(material_item->>'productName'), '') is null then
      raise exception 'work_material_product_required';
    end if;

    if material_id_text is null or material_id_text like 'new:%' then
      insert into public.task_materials (
        company_id,
        task_id,
        product_id,
        product_name,
        composition,
        dose,
        unit,
        mixing_order,
        notes
      ) values (
        target_work.company_id,
        target_work.id,
        selected_product_id,
        trim(material_item->>'productName'),
        nullif(trim(material_item->>'composition'), ''),
        nullif(trim(material_item->>'dose'), ''),
        nullif(trim(material_item->>'unit'), ''),
        material_index::integer,
        nullif(trim(material_item->>'notes'), '')
      ) returning id into material_id;
    else
      material_id := material_id_text::uuid;

      update public.task_materials
      set product_id = selected_product_id,
          product_name = trim(material_item->>'productName'),
          composition = nullif(trim(material_item->>'composition'), ''),
          dose = nullif(trim(material_item->>'dose'), ''),
          unit = nullif(trim(material_item->>'unit'), ''),
          mixing_order = material_index::integer
      where id = material_id
        and task_id = target_work.id
        and company_id = target_work.company_id
      returning id into material_id;

      if material_id is null then
        raise exception 'invalid_work_material';
      end if;
    end if;

    result_material_ids := result_material_ids || jsonb_build_array(material_id);
  end loop;

  return jsonb_build_object(
    'workId', target_work.id,
    'materialIds', result_material_ids
  );
end;
$$;

revoke all on function public.sync_work_execution_materials(uuid, jsonb) from public, anon;
grant execute on function public.sync_work_execution_materials(uuid, jsonb) to authenticated;
