-- mira - 42 Work technical backfill
-- Ejecutar después de 41_work_technical_adapters.sql.
-- Crea un Work histórico verificable para cada resultado técnico que todavía no
-- tenga source_task_id y, al final, impide nuevos resultados huérfanos.

do $$
declare
  irrigation public.irrigation_records%rowtype;
  nutrition public.nutrition_records%rowtype;
  application public.application_records%rowtype;
  harvest public.harvest_records%rowtype;
  work_id uuid;
begin
  for irrigation in
    select * from public.irrigation_records where source_task_id is null order by occurred_at, created_at
  loop
    insert into public.tasks (
      company_id, greenhouse_id, sector_id, type, title, scheduled_date, status,
      responsible_user_id, created_by, origin, occurred_at, completed_at, verified_at,
      verified_by, created_at, updated_at
    ) values (
      irrigation.company_id, irrigation.greenhouse_id, irrigation.sector_id, 'riego',
      'Riego histórico', irrigation.occurred_at, 'verificada', irrigation.responsible_user_id,
      irrigation.created_by, 'migrated', irrigation.occurred_at::timestamptz,
      irrigation.created_at, irrigation.created_at, irrigation.responsible_user_id,
      irrigation.created_at, irrigation.updated_at
    ) returning id into work_id;
    update public.irrigation_records set source_task_id = work_id where id = irrigation.id;
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata, created_at)
    values (irrigation.company_id, work_id, irrigation.created_by, 'created',
      jsonb_build_object('source', 'technical_backfill', 'recordType', 'irrigation', 'recordId', irrigation.id), irrigation.created_at),
      (irrigation.company_id, work_id, irrigation.responsible_user_id, 'completed',
      jsonb_build_object('source', 'technical_backfill', 'recordId', irrigation.id), irrigation.updated_at),
      (irrigation.company_id, work_id, irrigation.responsible_user_id, 'verified',
      jsonb_build_object('source', 'technical_backfill', 'automatic', true, 'recordId', irrigation.id), irrigation.updated_at);
  end loop;

  for nutrition in
    select * from public.nutrition_records where source_task_id is null order by occurred_at, created_at
  loop
    insert into public.tasks (
      company_id, greenhouse_id, type, title, scheduled_date, status, responsible_user_id,
      created_by, origin, occurred_at, completed_at, verified_at, verified_by, created_at, updated_at
    ) values (
      nutrition.company_id, nutrition.greenhouse_id,
      case when nutrition.method::text = 'fertirriego' then 'fertirriego'::public.task_type else 'fertilizacion'::public.task_type end,
      'Nutrición histórica', nutrition.occurred_at, 'verificada', nutrition.responsible_user_id,
      nutrition.created_by, 'migrated', nutrition.occurred_at::timestamptz,
      nutrition.created_at, nutrition.created_at, nutrition.responsible_user_id,
      nutrition.created_at, nutrition.updated_at
    ) returning id into work_id;
    update public.nutrition_records set source_task_id = work_id where id = nutrition.id;
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata, created_at)
    values (nutrition.company_id, work_id, nutrition.created_by, 'created',
      jsonb_build_object('source', 'technical_backfill', 'recordType', 'nutrition', 'recordId', nutrition.id), nutrition.created_at),
      (nutrition.company_id, work_id, nutrition.responsible_user_id, 'completed',
      jsonb_build_object('source', 'technical_backfill', 'recordId', nutrition.id), nutrition.updated_at),
      (nutrition.company_id, work_id, nutrition.responsible_user_id, 'verified',
      jsonb_build_object('source', 'technical_backfill', 'automatic', true, 'recordId', nutrition.id), nutrition.updated_at);
  end loop;

  for application in
    select * from public.application_records where source_task_id is null order by occurred_at, created_at
  loop
    insert into public.tasks (
      company_id, greenhouse_id, type, title, scheduled_date, status, responsible_user_id,
      created_by, origin, occurred_at, completed_at, verified_at, verified_by, created_at, updated_at
    ) values (
      application.company_id, application.greenhouse_id, 'aplicacion_foliar',
      'Aplicación histórica', application.occurred_at, 'verificada', application.responsible_user_id,
      application.created_by, 'migrated', application.occurred_at::timestamptz,
      application.created_at, application.created_at, application.responsible_user_id,
      application.created_at, application.updated_at
    ) returning id into work_id;
    update public.application_records set source_task_id = work_id where id = application.id;
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata, created_at)
    values (application.company_id, work_id, application.created_by, 'created',
      jsonb_build_object('source', 'technical_backfill', 'recordType', 'application', 'recordId', application.id), application.created_at),
      (application.company_id, work_id, application.responsible_user_id, 'completed',
      jsonb_build_object('source', 'technical_backfill', 'recordId', application.id), application.updated_at),
      (application.company_id, work_id, application.responsible_user_id, 'verified',
      jsonb_build_object('source', 'technical_backfill', 'automatic', true, 'recordId', application.id), application.updated_at);
  end loop;

  for harvest in
    select * from public.harvest_records where source_task_id is null order by occurred_at, created_at
  loop
    insert into public.tasks (
      company_id, greenhouse_id, type, title, scheduled_date, status, responsible_user_id,
      created_by, origin, occurred_at, completed_at, verified_at, verified_by, created_at, updated_at
    ) values (
      harvest.company_id, harvest.greenhouse_id, 'cosecha', 'Cosecha histórica', harvest.occurred_at,
      'verificada', harvest.responsible_user_id, harvest.created_by, 'migrated', harvest.occurred_at::timestamptz,
      harvest.created_at, harvest.created_at, harvest.responsible_user_id, harvest.created_at, harvest.updated_at
    ) returning id into work_id;
    update public.harvest_records set source_task_id = work_id where id = harvest.id;
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata, created_at)
    values (harvest.company_id, work_id, harvest.created_by, 'created',
      jsonb_build_object('source', 'technical_backfill', 'recordType', 'harvest', 'recordId', harvest.id), harvest.created_at),
      (harvest.company_id, work_id, harvest.responsible_user_id, 'completed',
      jsonb_build_object('source', 'technical_backfill', 'recordId', harvest.id), harvest.updated_at),
      (harvest.company_id, work_id, harvest.responsible_user_id, 'verified',
      jsonb_build_object('source', 'technical_backfill', 'automatic', true, 'recordId', harvest.id), harvest.updated_at);
  end loop;
end;
$$;

-- source_task_id pasa a ser obligatorio; el comportamiento anterior "set null"
-- dejaría huérfanos al borrar un Work, por lo que se convierte en restrictivo.
alter table public.application_records drop constraint if exists application_records_source_task_fk;
alter table public.application_records add constraint application_records_source_task_fk
  foreign key (source_task_id) references public.tasks(id) on delete restrict;
alter table public.irrigation_records drop constraint if exists irrigation_records_source_task_fk;
alter table public.irrigation_records add constraint irrigation_records_source_task_fk
  foreign key (source_task_id) references public.tasks(id) on delete restrict;
alter table public.nutrition_records drop constraint if exists nutrition_records_source_task_fk;
alter table public.nutrition_records add constraint nutrition_records_source_task_fk
  foreign key (source_task_id) references public.tasks(id) on delete restrict;
alter table public.harvest_records drop constraint if exists harvest_records_source_task_fk;
alter table public.harvest_records add constraint harvest_records_source_task_fk
  foreign key (source_task_id) references public.tasks(id) on delete restrict;

alter table public.irrigation_records alter column source_task_id set not null;
alter table public.nutrition_records alter column source_task_id set not null;
alter table public.application_records alter column source_task_id set not null;
alter table public.harvest_records alter column source_task_id set not null;

-- La app sólo puede crear o modificar resultados mediante los adaptadores Work.
-- Los SECURITY DEFINER de 41 conservan los permisos necesarios internamente.
do $$ declare
  table_name text;
begin
  foreach table_name in array array[
    'irrigation_records', 'nutrition_records', 'application_records', 'harvest_records'
  ] loop
    execute format('drop policy if exists "%s_insert_writer" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s_insert_scoped" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s_update_writer" on public.%I', table_name, table_name);
    execute format('drop policy if exists "%s_update_scoped" on public.%I', table_name, table_name);
  end loop;
end;
$$;

-- Los nombres legacy son internos; los adaptadores públicos de 41 son el único
-- punto soportado para crear resultados técnicos.
revoke all on function public.legacy_complete_application_task(uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.legacy_complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.legacy_complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.legacy_complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
