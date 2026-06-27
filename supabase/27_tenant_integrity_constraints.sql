-- mira - 27 Tenant integrity constraints
-- Ejecutar despues de 26_private_pest_photos.sql.
-- Endurece integridad multiempresa: cada referencia operacional que vive
-- dentro de una empresa queda anclada tambien por company_id.
--
-- Si alguna validacion falla, revisa datos cruzados entre empresas antes de
-- volver a ejecutar esta migracion. Las constraints se agregan como NOT VALID
-- y se validan al final para que el error apunte a la relacion afectada.

do $$ begin
  alter table public.products
  add constraint products_id_company_unique unique (id, company_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.greenhouse_sectors
  add constraint greenhouse_sectors_id_company_unique unique (id, company_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.greenhouse_sectors
  add constraint greenhouse_sectors_id_greenhouse_company_unique unique (id, greenhouse_id, company_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.task_materials
  add constraint task_materials_id_company_unique unique (id, company_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_runs
  add constraint copilot_runs_id_company_unique unique (id, company_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_insights
  add constraint copilot_insights_id_company_unique unique (id, company_id);
exception when duplicate_object then null;
end $$;

create index if not exists tasks_sector_greenhouse_company_idx
on public.tasks(sector_id, greenhouse_id, company_id)
where sector_id is not null;

create index if not exists irrigation_records_sector_greenhouse_company_idx
on public.irrigation_records(sector_id, greenhouse_id, company_id)
where sector_id is not null;

create index if not exists nutrition_records_product_company_idx
on public.nutrition_records(product_id, company_id)
where product_id is not null;

create index if not exists application_records_product_company_idx
on public.application_records(product_id, company_id)
where product_id is not null;

create index if not exists cost_records_greenhouse_company_idx
on public.cost_records(greenhouse_id, company_id)
where greenhouse_id is not null;

create index if not exists task_materials_product_company_idx
on public.task_materials(product_id, company_id)
where product_id is not null;

create index if not exists notification_outbox_task_company_idx
on public.notification_outbox(task_id, company_id)
where task_id is not null;

create index if not exists notification_outbox_weekly_plan_company_idx
on public.notification_outbox(weekly_plan_id, company_id)
where weekly_plan_id is not null;

create index if not exists application_records_source_task_company_idx
on public.application_records(source_task_id, company_id)
where source_task_id is not null;

create index if not exists application_records_source_material_company_idx
on public.application_records(source_task_material_id, company_id)
where source_task_material_id is not null;

create index if not exists irrigation_records_source_task_company_idx
on public.irrigation_records(source_task_id, company_id)
where source_task_id is not null;

create index if not exists nutrition_records_source_task_company_idx
on public.nutrition_records(source_task_id, company_id)
where source_task_id is not null;

create index if not exists nutrition_records_source_material_company_idx
on public.nutrition_records(source_task_material_id, company_id)
where source_task_material_id is not null;

create index if not exists harvest_records_source_task_company_idx
on public.harvest_records(source_task_id, company_id)
where source_task_id is not null;

create index if not exists technical_lab_studies_greenhouse_company_fk_idx
on public.technical_lab_studies(greenhouse_id, company_id);

create index if not exists nutrition_monitoring_events_crop_cycle_company_idx
on public.nutrition_monitoring_events(crop_cycle_id, company_id)
where crop_cycle_id is not null;

create index if not exists copilot_runs_greenhouse_company_idx
on public.copilot_runs(greenhouse_id, company_id)
where greenhouse_id is not null;

create index if not exists copilot_insights_greenhouse_company_idx
on public.copilot_insights(greenhouse_id, company_id)
where greenhouse_id is not null;

create index if not exists copilot_insights_run_company_idx
on public.copilot_insights(run_id, company_id)
where run_id is not null;

create index if not exists copilot_task_suggestions_insight_company_idx
on public.copilot_task_suggestions(insight_id, company_id)
where insight_id is not null;

create index if not exists copilot_task_suggestions_approved_task_company_idx
on public.copilot_task_suggestions(approved_task_id, company_id)
where approved_task_id is not null;

create index if not exists copilot_manager_messages_greenhouse_company_idx
on public.copilot_manager_messages(greenhouse_id, company_id)
where greenhouse_id is not null;

create index if not exists copilot_manager_messages_task_company_idx
on public.copilot_manager_messages(task_id, company_id)
where task_id is not null;

create index if not exists copilot_manager_messages_insight_company_idx
on public.copilot_manager_messages(insight_id, company_id)
where insight_id is not null;

-- Corrige FKs compuestas existentes que no deben intentar limpiar company_id.
alter table public.tasks
drop constraint if exists tasks_weekly_plan_company_fk;

do $$ begin
  alter table public.tasks
  add constraint tasks_weekly_plan_company_fk
  foreign key (weekly_plan_id, company_id)
  references public.weekly_plans(id, company_id)
  on delete set null (weekly_plan_id)
  not valid;
exception when duplicate_object then null;
end $$;

alter table public.cost_records
drop constraint if exists cost_records_greenhouse_id_company_id_fkey;

alter table public.cost_records
drop constraint if exists cost_records_greenhouse_company_fk;

do $$ begin
  alter table public.cost_records
  add constraint cost_records_greenhouse_company_fk
  foreign key (greenhouse_id, company_id)
  references public.greenhouses(id, company_id)
  on delete set null (greenhouse_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.tasks
  add constraint tasks_sector_greenhouse_company_fk
  foreign key (sector_id, greenhouse_id, company_id)
  references public.greenhouse_sectors(id, greenhouse_id, company_id)
  on delete set null (sector_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.irrigation_records
  add constraint irrigation_records_sector_greenhouse_company_fk
  foreign key (sector_id, greenhouse_id, company_id)
  references public.greenhouse_sectors(id, greenhouse_id, company_id)
  on delete set null (sector_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.nutrition_records
  add constraint nutrition_records_product_company_fk
  foreign key (product_id, company_id)
  references public.products(id, company_id)
  on delete set null (product_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.application_records
  add constraint application_records_product_company_fk
  foreign key (product_id, company_id)
  references public.products(id, company_id)
  on delete set null (product_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.task_materials
  add constraint task_materials_product_company_fk
  foreign key (product_id, company_id)
  references public.products(id, company_id)
  on delete set null (product_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.notification_outbox
  add constraint notification_outbox_task_company_fk
  foreign key (task_id, company_id)
  references public.tasks(id, company_id)
  on delete cascade
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.notification_outbox
  add constraint notification_outbox_weekly_plan_company_fk
  foreign key (weekly_plan_id, company_id)
  references public.weekly_plans(id, company_id)
  on delete cascade
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.application_records
  add constraint application_records_source_task_company_fk
  foreign key (source_task_id, company_id)
  references public.tasks(id, company_id)
  on delete set null (source_task_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.application_records
  add constraint application_records_source_material_company_fk
  foreign key (source_task_material_id, company_id)
  references public.task_materials(id, company_id)
  on delete set null (source_task_material_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.irrigation_records
  add constraint irrigation_records_source_task_company_fk
  foreign key (source_task_id, company_id)
  references public.tasks(id, company_id)
  on delete set null (source_task_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.nutrition_records
  add constraint nutrition_records_source_task_company_fk
  foreign key (source_task_id, company_id)
  references public.tasks(id, company_id)
  on delete set null (source_task_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.nutrition_records
  add constraint nutrition_records_source_material_company_fk
  foreign key (source_task_material_id, company_id)
  references public.task_materials(id, company_id)
  on delete set null (source_task_material_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.harvest_records
  add constraint harvest_records_source_task_company_fk
  foreign key (source_task_id, company_id)
  references public.tasks(id, company_id)
  on delete set null (source_task_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.technical_lab_studies
  add constraint technical_lab_studies_greenhouse_company_fk
  foreign key (greenhouse_id, company_id)
  references public.greenhouses(id, company_id)
  on delete cascade
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.nutrition_monitoring_events
  add constraint nutrition_monitoring_events_crop_cycle_company_fk
  foreign key (crop_cycle_id, company_id)
  references public.crop_cycles(id, company_id)
  on delete set null (crop_cycle_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_runs
  add constraint copilot_runs_greenhouse_company_fk
  foreign key (greenhouse_id, company_id)
  references public.greenhouses(id, company_id)
  on delete set null (greenhouse_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_insights
  add constraint copilot_insights_greenhouse_company_fk
  foreign key (greenhouse_id, company_id)
  references public.greenhouses(id, company_id)
  on delete cascade
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_insights
  add constraint copilot_insights_run_company_fk
  foreign key (run_id, company_id)
  references public.copilot_runs(id, company_id)
  on delete set null (run_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_task_suggestions
  add constraint copilot_task_suggestions_insight_company_fk
  foreign key (insight_id, company_id)
  references public.copilot_insights(id, company_id)
  on delete set null (insight_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_task_suggestions
  add constraint copilot_task_suggestions_approved_task_company_fk
  foreign key (approved_task_id, company_id)
  references public.tasks(id, company_id)
  on delete set null (approved_task_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_manager_messages
  add constraint copilot_manager_messages_greenhouse_company_fk
  foreign key (greenhouse_id, company_id)
  references public.greenhouses(id, company_id)
  on delete set null (greenhouse_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_manager_messages
  add constraint copilot_manager_messages_task_company_fk
  foreign key (task_id, company_id)
  references public.tasks(id, company_id)
  on delete set null (task_id)
  not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.copilot_manager_messages
  add constraint copilot_manager_messages_insight_company_fk
  foreign key (insight_id, company_id)
  references public.copilot_insights(id, company_id)
  on delete set null (insight_id)
  not valid;
exception when duplicate_object then null;
end $$;

alter table public.tasks validate constraint tasks_weekly_plan_company_fk;
alter table public.cost_records validate constraint cost_records_greenhouse_company_fk;
alter table public.tasks validate constraint tasks_sector_greenhouse_company_fk;
alter table public.irrigation_records validate constraint irrigation_records_sector_greenhouse_company_fk;
alter table public.nutrition_records validate constraint nutrition_records_product_company_fk;
alter table public.application_records validate constraint application_records_product_company_fk;
alter table public.task_materials validate constraint task_materials_product_company_fk;
alter table public.notification_outbox validate constraint notification_outbox_task_company_fk;
alter table public.notification_outbox validate constraint notification_outbox_weekly_plan_company_fk;
alter table public.application_records validate constraint application_records_source_task_company_fk;
alter table public.application_records validate constraint application_records_source_material_company_fk;
alter table public.irrigation_records validate constraint irrigation_records_source_task_company_fk;
alter table public.nutrition_records validate constraint nutrition_records_source_task_company_fk;
alter table public.nutrition_records validate constraint nutrition_records_source_material_company_fk;
alter table public.harvest_records validate constraint harvest_records_source_task_company_fk;
alter table public.technical_lab_studies validate constraint technical_lab_studies_greenhouse_company_fk;
alter table public.nutrition_monitoring_events validate constraint nutrition_monitoring_events_crop_cycle_company_fk;
alter table public.copilot_runs validate constraint copilot_runs_greenhouse_company_fk;
alter table public.copilot_insights validate constraint copilot_insights_greenhouse_company_fk;
alter table public.copilot_insights validate constraint copilot_insights_run_company_fk;
alter table public.copilot_task_suggestions validate constraint copilot_task_suggestions_insight_company_fk;
alter table public.copilot_task_suggestions validate constraint copilot_task_suggestions_approved_task_company_fk;
alter table public.copilot_manager_messages validate constraint copilot_manager_messages_greenhouse_company_fk;
alter table public.copilot_manager_messages validate constraint copilot_manager_messages_task_company_fk;
alter table public.copilot_manager_messages validate constraint copilot_manager_messages_insight_company_fk;
