-- Reclasificación acotada de importaciones históricas verificables.

update public.cost_records
set category = 'preparacion_terreno_maquinaria'::public.cost_category, updated_at = now()
where source_reference like '%:trabajo-tractor:%'
  and source_reference not like '%:renta-anual';

update public.cost_records
set category = 'material_vegetal'::public.cost_category, updated_at = now()
where source_reference like '%:plantula:%';

update public.cost_records
set category = 'polinizacion'::public.cost_category, updated_at = now()
where source_reference like '%:abejorros:%';
