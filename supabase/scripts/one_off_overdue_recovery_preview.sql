-- MIRA · SIMULACIÓN SEGURA (una sola consulta)
-- Esta consulta no modifica, completa, aprueba ni elimina nada.

with settings as (
  select
    'Mercadia Ag'::text as company_name,
    date_trunc('week', current_date)::date as current_week_start,
    100::integer as max_tasks
), company_context as (
  select company.id as company_id
  from public.companies company
  cross join settings
  where lower(trim(company.name)) = lower(trim(settings.company_name))
    and (
      select count(*)
      from public.companies matching
      where lower(trim(matching.name)) = lower(trim(settings.company_name))
    ) = 1
), task_facts as (
  select
    task.id as task_id,
    task.type,
    task.title,
    task.scheduled_date,
    task.status,
    greenhouse.name as greenhouse_name,
    task.technical_plan,
    (
      select count(*)::integer
      from public.task_materials material
      where material.task_id = task.id
    ) as material_count,
    exists (
      select 1
      from public.task_materials material
      left join public.products product
        on product.id = material.product_id
       and product.company_id = material.company_id
      where material.task_id = task.id
        and (
          material.product_id is null
          or nullif(trim(material.product_name), '') is null
          or nullif(trim(material.dose), '') is null
          or nullif(trim(material.unit), '') is null
          or product.id is null
        )
    ) as has_incomplete_material,
    exists (
      select 1
      from public.task_materials material
      join public.products product on product.id = material.product_id
      where material.task_id = task.id
        and product.category is null
    ) as has_missing_category,
    exists (
      select 1 from public.task_assignments assignment
      where assignment.task_id = task.id
    ) as has_member_assignment,
    exists (
      select 1 from public.task_staff_assignments assignment
      where assignment.task_id = task.id
    ) as has_staff_assignment,
    exists (
      select 1 from public.notification_outbox outbox
      where outbox.task_id = task.id
        and outbox.channel = 'telegram'::public.notification_channel
        and outbox.status = 'sent'::public.notification_status
    ) as has_confirmed_delivery,
    exists (
      select 1 from public.application_records record
      where record.source_task_id = task.id
    ) or exists (
      select 1 from public.nutrition_records record
      where record.source_task_id = task.id
    ) as has_technical_record
  from public.tasks task
  join company_context context on context.company_id = task.company_id
  join public.greenhouses greenhouse on greenhouse.id = task.greenhouse_id
  where task.scheduled_date < current_date
    and task.status in ('pendiente'::public.task_status, 'bloqueada'::public.task_status)
), classified as (
  select
    facts.*,
    case
      when facts.status = 'bloqueada'::public.task_status then 'bloqueada'
      when facts.scheduled_date >= settings.current_week_start then 'semana_actual'
      when facts.type not in (
        'aplicacion_foliar'::public.task_type,
        'fertirriego'::public.task_type,
        'fertilizacion'::public.task_type
      ) then 'tipo_no_automatico'
      when not facts.has_member_assignment and not facts.has_staff_assignment then 'sin_encargado'
      when facts.has_member_assignment and not facts.has_confirmed_delivery then 'envio_sin_confirmar'
      when facts.material_count = 0 then 'sin_materiales'
      when facts.has_incomplete_material then 'receta_incompleta'
      when facts.has_technical_record then 'registro_tecnico_existente'
      when facts.type = 'aplicacion_foliar'::public.task_type and facts.has_missing_category
        then 'categoria_producto_faltante'
      when facts.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type)
        and coalesce(nullif(trim(facts.technical_plan->>'targetPh'), ''), '0') !~ '^-?[0-9]+([.,][0-9]+)?$'
        then 'ph_objetivo_invalido'
      when facts.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type)
        and coalesce(nullif(trim(facts.technical_plan->>'targetEc'), ''), '0') !~ '^-?[0-9]+([.,][0-9]+)?$'
        then 'ec_objetivo_invalido'
      else null
    end as exclusion_reason
  from task_facts facts
  cross join settings
), selected as (
  select classified.*
  from classified
  where exclusion_reason is null
  order by scheduled_date, task_id
  limit (select max_tasks from settings)
), exclusion_totals as (
  select exclusion_reason, count(*)::integer as total
  from classified
  where exclusion_reason is not null
  group by exclusion_reason
)
select
  (select count(*) from company_context)::integer as empresas_encontradas,
  (select current_week_start from settings) as inicio_semana_protegida,
  (select count(*) from selected)::integer as total_elegibles,
  (select count(*) from selected where type = 'aplicacion_foliar'::public.task_type)::integer as aplicaciones,
  (select count(*) from selected where type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type))::integer as nutriciones,
  (select min(scheduled_date) from selected) as fecha_mas_antigua,
  (select max(scheduled_date) from selected) as fecha_mas_reciente,
  coalesce((
    select jsonb_object_agg(exclusion_reason, total order by exclusion_reason)
    from exclusion_totals
  ), '{}'::jsonb) as exclusiones,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'task_id', task_id,
      'fecha_real', scheduled_date,
      'invernadero', greenhouse_name,
      'tipo', type,
      'titulo', title,
      'productos', material_count
    ) order by scheduled_date, task_id)
    from selected
  ), '[]'::jsonb) as actividades_elegibles;
