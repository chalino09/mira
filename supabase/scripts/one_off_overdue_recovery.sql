-- MIRA · Recuperación externa y única de actividades técnicas vencidas
--
-- Uso seguro en Supabase SQL Editor:
--   1. Ejecute sin modificar la configuración: apply_changes = false.
--   2. Revise los tres resultados (resumen, actividades elegibles y exclusiones).
--   3. Para aplicar, cambie apply_changes a true y expected_selected_count al
--      total_elegibles mostrado por la simulación. Si el total cambia, aborta.
--
-- Este script NO elimina ni aprueba actividades. Solo registra aplicaciones y
-- nutriciones vencidas que ya tengan encargado, envío confirmado y receta completa.
-- La fecha real conservada es la fecha planeada. Toda la ejecución es atómica.

begin;

create temporary table recovery_settings on commit drop as
select
  'Mercadia Ag'::text as company_name,
  date_trunc('week', current_date)::date as current_week_start,
  100::integer as max_tasks,
  false::boolean as apply_changes,         -- Cambiar a true únicamente después de revisar la simulación.
  null::integer as expected_selected_count, -- Al aplicar, escribir aquí el total_elegibles de la simulación.
  gen_random_uuid() as run_id;

create temporary table recovery_context (
  company_id uuid not null,
  actor_user_id uuid not null
) on commit drop;

do $validation$
declare
  settings recovery_settings%rowtype;
  matching_companies integer;
  target_company_id uuid;
  target_actor_user_id uuid;
begin
  select * into settings from recovery_settings;

  if settings.max_tasks < 1 or settings.max_tasks > 500 then
    raise exception 'max_tasks debe estar entre 1 y 500';
  end if;

  select count(*), (array_agg(company.id order by company.id))[1]
  into matching_companies, target_company_id
  from public.companies company
  where lower(trim(company.name)) = lower(trim(settings.company_name));

  if matching_companies <> 1 then
    raise exception 'Se esperaba exactamente una empresa llamada %, pero se encontraron %',
      settings.company_name, matching_companies;
  end if;

  select member.user_id
  into target_actor_user_id
  from public.company_members member
  where member.company_id = target_company_id
    and member.status = 'active'::public.member_status
    and member.user_id is not null
  order by
    case member.role
      when 'owner'::public.member_role then 1
      when 'admin'::public.member_role then 2
      when 'manager'::public.member_role then 3
    end,
    member.created_at,
    member.id
  limit 1;

  if target_actor_user_id is null then
    raise exception 'La empresa % no tiene un usuario activo para auditar la recuperación', settings.company_name;
  end if;

  if to_regprocedure('public.complete_application_task(uuid,date,text,jsonb)') is null
    or to_regprocedure('public.complete_nutrition_task(uuid,date,text,text,text,numeric,numeric,text,jsonb)') is null then
    raise exception 'Faltan las funciones técnicas de Mira. Ejecute primero las migraciones de recuperación';
  end if;

  insert into recovery_context (company_id, actor_user_id)
  values (target_company_id, target_actor_user_id);
end
$validation$;

create temporary table recovery_review on commit drop as
with task_facts as (
  select
    task.id as task_id,
    task.company_id,
    task.greenhouse_id,
    greenhouse.name as greenhouse_name,
    greenhouse.transplant_date,
    task.type,
    task.title,
    task.scheduled_date,
    task.status,
    task.technical_plan,
    task.instructions,
    count(material.id)::integer as material_count,
    bool_or(material.id is not null and (
      material.product_id is null
      or nullif(trim(material.product_name), '') is null
      or nullif(trim(material.dose), '') is null
      or nullif(trim(material.unit), '') is null
      or product.id is null
    )) as has_incomplete_material,
    bool_or(material.id is not null and task.type = 'aplicacion_foliar'::public.task_type
      and product.category is null) as has_missing_category,
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
  join recovery_context context on context.company_id = task.company_id
  join public.greenhouses greenhouse on greenhouse.id = task.greenhouse_id
  left join public.task_materials material on material.task_id = task.id
  left join public.products product
    on product.id = material.product_id
   and product.company_id = material.company_id
  where task.scheduled_date < current_date
    and task.status in ('pendiente'::public.task_status, 'bloqueada'::public.task_status)
  group by task.id, greenhouse.name, greenhouse.transplant_date
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
      when facts.has_missing_category then 'categoria_producto_faltante'
      when facts.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type)
        and coalesce(nullif(trim(facts.technical_plan->>'targetPh'), ''), '0') !~ '^-?[0-9]+([.,][0-9]+)?$'
        then 'ph_objetivo_invalido'
      when facts.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type)
        and coalesce(nullif(trim(facts.technical_plan->>'targetEc'), ''), '0') !~ '^-?[0-9]+([.,][0-9]+)?$'
        then 'ec_objetivo_invalido'
      else null
    end as exclusion_reason
  from task_facts facts
  cross join recovery_settings settings
)
select * from classified;

create temporary table recovery_selected on commit drop as
select review.*,
  row_number() over (order by review.scheduled_date, review.task_id)::integer as selection_order
from recovery_review review
cross join recovery_settings settings
where review.exclusion_reason is null
order by review.scheduled_date, review.task_id
limit (select max_tasks from recovery_settings);

create temporary table recovery_snapshot on commit drop as
select
  (select count(*) from public.tasks task where task.company_id = context.company_id) as tasks_before,
  (select count(*) from public.task_materials material where material.company_id = context.company_id) as materials_before,
  (select count(*) from public.products product where product.company_id = context.company_id) as products_before,
  (select count(*) from public.application_records record where record.company_id = context.company_id) as applications_before,
  (select count(*) from public.nutrition_records record where record.company_id = context.company_id) as nutrition_before
from recovery_context context;

-- Resultado 1: resumen que se usa como candado para la ejecución.
select
  settings.company_name as empresa,
  settings.current_week_start as inicio_semana_protegida,
  settings.apply_changes as modo_aplicacion,
  count(selected.task_id)::integer as total_elegibles,
  count(*) filter (where selected.type = 'aplicacion_foliar'::public.task_type)::integer as aplicaciones,
  count(*) filter (where selected.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type))::integer as nutriciones,
  min(selected.scheduled_date) as fecha_mas_antigua,
  max(selected.scheduled_date) as fecha_mas_reciente,
  settings.run_id
from recovery_settings settings
left join recovery_selected selected on true
group by settings.company_name, settings.current_week_start, settings.apply_changes, settings.run_id;

-- Resultado 2: detalle exacto de lo que se registraría, de más antiguo a reciente.
select
  selected.selection_order,
  selected.task_id,
  selected.scheduled_date as fecha_real,
  selected.greenhouse_name as invernadero,
  selected.type as tipo,
  selected.title,
  selected.material_count as productos
from recovery_selected selected
order by selected.selection_order;

-- Resultado 3: todo lo que queda fuera y el motivo; no se inventan datos faltantes.
select
  review.exclusion_reason as motivo_exclusion,
  count(*)::integer as actividades
from recovery_review review
where review.exclusion_reason is not null
group by review.exclusion_reason
order by review.exclusion_reason;

do $execution$
declare
  settings recovery_settings%rowtype;
  context recovery_context%rowtype;
  snapshot recovery_snapshot%rowtype;
  target record;
  selected_count integer;
  applications_payload jsonb;
  nutrition_payload jsonb;
  nutrition_method text;
  nutrition_objective text;
  crop_stage text;
  target_ph numeric;
  target_ec numeric;
  technical_records integer;
  total_materials integer;
  audit_count integer;
begin
  select * into settings from recovery_settings;
  select * into context from recovery_context;
  select * into snapshot from recovery_snapshot;
  select count(*) into selected_count from recovery_selected;

  if not settings.apply_changes then
    raise notice 'SIMULACIÓN: no se modificó ninguna actividad. Elegibles: %', selected_count;
    return;
  end if;

  if settings.expected_selected_count is null then
    raise exception 'Para aplicar, expected_selected_count debe contener el total_elegibles de la simulación (%)', selected_count;
  end if;

  if settings.expected_selected_count <> selected_count then
    raise exception 'El candado no coincide: se esperaban % actividades y ahora son %. No se aplicó nada',
      settings.expected_selected_count, selected_count;
  end if;

  if selected_count = 0 then
    raise exception 'No hay actividades elegibles; no se aplicó nada';
  end if;

  perform set_config('request.jwt.claim.sub', context.actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  for target in
    select * from recovery_selected order by selection_order
  loop
    if target.type = 'aplicacion_foliar'::public.task_type then
      select jsonb_agg(
        jsonb_build_object(
          'materialId', material.id,
          'productName', material.product_name,
          'dose', case
            when right(lower(trim(material.dose)), length(trim(material.unit))) = lower(trim(material.unit))
              then trim(material.dose)
            else trim(material.dose) || ' ' || trim(material.unit)
          end,
          'category', product.category::text,
          'composition', coalesce(material.composition, product.composition),
          'safetyInterval', product.safety_interval,
          'reentryInterval', product.reentry_interval,
          'notes', coalesce(material.notes, target.instructions)
        )
        order by material.mixing_order nulls last, material.id
      )
      into applications_payload
      from public.task_materials material
      join public.products product on product.id = material.product_id
      where material.task_id = target.task_id;

      perform public.complete_application_task(
        target.task_id,
        target.scheduled_date,
        nullif(trim(target.technical_plan->>'appliedArea'), ''),
        applications_payload
      );
    else
      select jsonb_agg(
        jsonb_build_object(
          'materialId', material.id,
          'productName', material.product_name,
          'dose', case
            when right(lower(trim(material.dose)), length(trim(material.unit))) = lower(trim(material.unit))
              then trim(material.dose)
            else trim(material.dose) || ' ' || trim(material.unit)
          end
        )
        order by material.mixing_order nulls last, material.id
      )
      into nutrition_payload
      from public.task_materials material
      where material.task_id = target.task_id;

      nutrition_method := case lower(trim(coalesce(target.technical_plan->>'method', 'Fertirriego')))
        when 'foliar' then 'foliar'
        when 'drench' then 'drench'
        else 'fertirriego'
      end;

      nutrition_objective := case lower(trim(coalesce(target.technical_plan->>'objective', 'Desarrollo')))
        when 'raíz' then 'raiz'
        when 'raiz' then 'raiz'
        when 'floración' then 'floracion'
        when 'floracion' then 'floracion'
        when 'cuajado' then 'cuajado'
        when 'engorde' then 'engorde'
        when 'calidad' then 'calidad'
        else 'desarrollo'
      end;

      crop_stage := case
        when target.transplant_date is null then 'vegetativo'
        when target.scheduled_date - target.transplant_date < 43 then 'vegetativo'
        when target.scheduled_date - target.transplant_date < 78 then 'floracion'
        else 'produccion'
      end;

      target_ph := nullif(replace(trim(target.technical_plan->>'targetPh'), ',', '.'), '')::numeric;
      target_ec := nullif(replace(trim(target.technical_plan->>'targetEc'), ',', '.'), '')::numeric;

      perform public.complete_nutrition_task(
        target.task_id,
        target.scheduled_date,
        nutrition_method,
        crop_stage,
        nutrition_objective,
        target_ph,
        target_ec,
        target.instructions,
        nutrition_payload
      );
    end if;

    insert into public.task_updates (
      company_id, task_id, actor_user_id, update_type, note, metadata
    ) values (
      target.company_id,
      target.task_id,
      context.actor_user_id,
      'comment'::public.task_update_type,
      'Recuperación externa de actividad vencida; fecha real conservada desde la planeación.',
      jsonb_build_object(
        'source', 'one_time_overdue_recovery',
        'run_id', settings.run_id,
        'scheduled_date', target.scheduled_date,
        'selection_order', target.selection_order
      )
    );
  end loop;

  -- Verificaciones dentro de la misma transacción: cualquier diferencia revierte todo.
  if exists (
    select 1
    from recovery_selected selected
    join public.tasks task on task.id = selected.task_id
    where task.status <> 'completada'::public.task_status
      or task.occurred_at::date is distinct from selected.scheduled_date
      or task.verified_at is not null
      or task.verified_by is not null
  ) then
    raise exception 'Verificación fallida: estado, fecha real o aprobación inesperada';
  end if;

  if exists (
    select 1 from recovery_selected selected
    cross join recovery_settings current_settings
    where selected.scheduled_date >= current_settings.current_week_start
  ) then
    raise exception 'Verificación fallida: se incluyó una actividad de la semana actual';
  end if;

  select coalesce(sum(selected.material_count), 0)::integer
  into total_materials
  from recovery_selected selected;

  select count(*)::integer
  into technical_records
  from (
    select record.source_task_material_id
    from public.application_records record
    join recovery_selected selected on selected.task_id = record.source_task_id
    union all
    select record.source_task_material_id
    from public.nutrition_records record
    join recovery_selected selected on selected.task_id = record.source_task_id
  ) records;

  if technical_records <> total_materials then
    raise exception 'Verificación fallida: se esperaban % registros técnicos y se encontraron %',
      total_materials, technical_records;
  end if;

  select count(*)::integer
  into audit_count
  from public.task_updates update_row
  join recovery_selected selected on selected.task_id = update_row.task_id
  where update_row.metadata->>'source' = 'one_time_overdue_recovery'
    and update_row.metadata->>'run_id' = settings.run_id::text;

  if audit_count <> selected_count then
    raise exception 'Verificación fallida: se esperaban % auditorías y se encontraron %', selected_count, audit_count;
  end if;

  if (select count(*) from public.tasks task where task.company_id = context.company_id) <> snapshot.tasks_before
    or (select count(*) from public.task_materials material where material.company_id = context.company_id) <> snapshot.materials_before
    or (select count(*) from public.products product where product.company_id = context.company_id) <> snapshot.products_before then
    raise exception 'Verificación fallida: cambió la cantidad de tareas, materiales o productos';
  end if;

  if (select count(*) from public.application_records record where record.company_id = context.company_id)
      <> snapshot.applications_before + (
        select coalesce(sum(material_count), 0) from recovery_selected
        where type = 'aplicacion_foliar'::public.task_type
      )
    or (select count(*) from public.nutrition_records record where record.company_id = context.company_id)
      <> snapshot.nutrition_before + (
        select coalesce(sum(material_count), 0) from recovery_selected
        where type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type)
      ) then
    raise exception 'Verificación fallida: la cantidad de registros técnicos no coincide';
  end if;

  raise notice 'APLICADO Y VERIFICADO: % actividades, % registros técnicos, 0 eliminaciones, 0 aprobaciones. Run ID: %',
    selected_count, technical_records, settings.run_id;
end
$execution$;

-- Resultado final. En simulación todos aparecen como "sin_aplicar".
select
  selected.selection_order,
  selected.task_id,
  selected.scheduled_date as fecha_real,
  task.status,
  task.occurred_at,
  task.verified_at,
  case
    when settings.apply_changes then 'aplicado_y_verificado'
    else 'simulacion_sin_cambios'
  end as resultado,
  settings.run_id
from recovery_selected selected
join public.tasks task on task.id = selected.task_id
cross join recovery_settings settings
order by selected.selection_order;

commit;
