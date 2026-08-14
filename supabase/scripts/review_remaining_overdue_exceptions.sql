-- MIRA · Revisión de actividades vencidas restantes
-- SOLO LECTURA: no modifica, completa, aprueba ni elimina nada.

with company_context as (
  select company.id as company_id
  from public.companies company
  where lower(trim(company.name)) = lower('Mercadia Ag')
    and (
      select count(*) from public.companies matching
      where lower(trim(matching.name)) = lower('Mercadia Ag')
    ) = 1
), task_facts as (
  select
    task.id as task_id,
    task.scheduled_date,
    task.type,
    task.title,
    task.status,
    task.blocked_reason,
    greenhouse.name as greenhouse_name,
    exists (select 1 from public.task_assignments assignment where assignment.task_id = task.id)
      as has_member_assignment,
    exists (select 1 from public.task_staff_assignments assignment where assignment.task_id = task.id)
      as has_staff_assignment,
    exists (
      select 1 from public.notification_outbox outbox
      where outbox.task_id = task.id
        and outbox.channel = 'telegram'::public.notification_channel
        and outbox.status = 'sent'::public.notification_status
    ) as has_confirmed_delivery,
    exists (
      select 1 from public.application_records record where record.source_task_id = task.id
    ) or exists (
      select 1 from public.nutrition_records record where record.source_task_id = task.id
    ) as has_technical_record,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'producto', material.product_name,
        'dosis', material.dose,
        'unidad', material.unit,
        'categoria', product.category,
        'completo', material.product_id is not null
          and nullif(trim(material.product_name), '') is not null
          and nullif(trim(material.dose), '') is not null
          and nullif(trim(material.unit), '') is not null
          and product.id is not null
      ) order by material.mixing_order nulls last, material.id)
      from public.task_materials material
      left join public.products product
        on product.id = material.product_id and product.company_id = material.company_id
      where material.task_id = task.id
    ), '[]'::jsonb) as materiales
  from public.tasks task
  join company_context context on context.company_id = task.company_id
  join public.greenhouses greenhouse on greenhouse.id = task.greenhouse_id
  where task.scheduled_date < date_trunc('week', current_date)::date
    and task.status in ('pendiente'::public.task_status, 'bloqueada'::public.task_status)
)
select
  task_id,
  scheduled_date as fecha_planeada,
  greenhouse_name as invernadero,
  type as tipo,
  title as actividad,
  case
    when status = 'bloqueada'::public.task_status then 'bloqueada'
    when not has_member_assignment and not has_staff_assignment then 'sin_encargado'
    when has_member_assignment and not has_confirmed_delivery then 'envio_sin_confirmar'
    when jsonb_array_length(materiales) = 0 then 'sin_materiales'
    when exists (
      select 1 from jsonb_array_elements(materiales) material
      where coalesce((material->>'completo')::boolean, false) = false
    ) then 'receta_incompleta'
    when has_technical_record then 'registro_tecnico_existente'
    when type = 'aplicacion_foliar'::public.task_type and exists (
      select 1 from jsonb_array_elements(materiales) material
      where material->>'categoria' is null
    ) then 'categoria_producto_faltante'
    when type not in (
      'aplicacion_foliar'::public.task_type,
      'fertirriego'::public.task_type,
      'fertilizacion'::public.task_type
    ) then 'tipo_no_automatico'
    else 'revisar'
  end as motivo,
  blocked_reason,
  has_member_assignment or has_staff_assignment as tiene_encargado,
  has_confirmed_delivery as envio_confirmado,
  materiales
from task_facts
order by scheduled_date, task_id;
