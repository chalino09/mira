-- MIRA · Productos sin categoría que bloquean aplicaciones vencidas
-- Solo lectura: no modifica ninguna tabla.

with company_context as (
  select company.id as company_id
  from public.companies company
  where lower(trim(company.name)) = lower('Mercadia Ag')
    and (
      select count(*) from public.companies matching
      where lower(trim(matching.name)) = lower('Mercadia Ag')
    ) = 1
), affected as (
  select
    product.id as product_id,
    product.name as product_name,
    product.composition,
    task.id as task_id,
    task.title as task_title,
    task.scheduled_date,
    greenhouse.name as greenhouse_name
  from public.tasks task
  join company_context context on context.company_id = task.company_id
  join public.greenhouses greenhouse on greenhouse.id = task.greenhouse_id
  join public.task_materials material on material.task_id = task.id
  join public.products product on product.id = material.product_id
  where task.type = 'aplicacion_foliar'::public.task_type
    and task.status = 'pendiente'::public.task_status
    and task.scheduled_date < date_trunc('week', current_date)::date
    and product.category is null
)
select
  product_id,
  product_name,
  composition,
  count(distinct task_id)::integer as actividades_afectadas,
  min(scheduled_date) as fecha_mas_antigua,
  string_agg(distinct greenhouse_name, ', ' order by greenhouse_name) as invernaderos,
  (array_agg(task_title order by scheduled_date, task_id))[1] as ejemplo_actividad
from affected
group by product_id, product_name, composition
order by actividades_afectadas desc, product_name, product_id;
