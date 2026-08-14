-- Relaciona la categoría con el producto para reutilizarla en actividades
-- futuras y vencidas. No elimina actividades, materiales ni registros.

-- Recupera relaciones históricas cuando el material conserva el mismo nombre
-- que un único producto del catálogo de su empresa.
with catalog_product_names as (
  select
    company_id,
    regexp_replace(lower(trim(name)), '\s+', ' ', 'g') as normalized_name,
    (array_agg(id order by created_at, id))[1] as product_id,
    count(*) as product_count
  from public.products
  group by company_id, regexp_replace(lower(trim(name)), '\s+', ' ', 'g')
), unique_catalog_products as (
  select company_id, normalized_name, product_id
  from catalog_product_names
  where product_count = 1
)
update public.task_materials material
set product_id = catalog.product_id
from unique_catalog_products catalog
where material.product_id is null
  and material.company_id = catalog.company_id
  and regexp_replace(lower(trim(material.product_name)), '\s+', ' ', 'g') = catalog.normalized_name;

-- Si el producto ya tuvo aplicaciones verificables, recupera la categoría más
-- usada sin inventarla ni reemplazar una categoría que ya exista.
with category_usage as (
  select
    material.product_id,
    application.category,
    count(*) as usage_count,
    row_number() over (
      partition by material.product_id
      order by count(*) desc, application.category::text
    ) as preference_order
  from public.application_records application
  join public.task_materials material
    on material.id = application.source_task_material_id
  where material.product_id is not null
  group by material.product_id, application.category
), preferred_categories as (
  select product_id, category
  from category_usage
  where preference_order = 1
)
update public.products product
set category = preferred.category, updated_at = now()
from preferred_categories preferred
where product.id = preferred.product_id
  and product.category is null;

-- Al confirmar una aplicación, la primera categoría válida del producto queda
-- guardada en el catálogo y se reutiliza en las siguientes actividades.
create or replace function public.complete_application_task(
  target_task_id uuid,
  target_occurred_at date,
  target_applied_area text default null,
  target_applications jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  application_item jsonb;
  material_id uuid;
  category_value public.application_category;
begin
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;

  if jsonb_typeof(target_applications) = 'array' then
    for application_item in select value from jsonb_array_elements(target_applications)
    loop
      material_id := nullif(trim(application_item->>'materialId'), '')::uuid;
      category_value := nullif(trim(application_item->>'category'), '')::public.application_category;

      if material_id is not null and category_value is not null then
        update public.products product
        set category = category_value, updated_at = now()
        from public.task_materials material
        where material.id = material_id
          and material.task_id = target_task_id
          and product.id = material.product_id
          and product.company_id = material.company_id
          and product.category is null;
      end if;
    end loop;
  end if;

  result := public.legacy_complete_application_task(
    target_task_id,
    target_occurred_at,
    target_applied_area,
    target_applications
  );
  perform public.finish_technical_work(
    target_task_id,
    target_occurred_at,
    'Aplicación confirmada y guardada en registros técnicos'
  );
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

revoke all on function public.complete_application_task(uuid, date, text, jsonb) from public, anon;
grant execute on function public.complete_application_task(uuid, date, text, jsonb) to authenticated;
