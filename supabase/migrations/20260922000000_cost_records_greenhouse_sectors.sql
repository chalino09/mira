-- Vincula gastos opcionalmente con un módulo físico del invernadero.
-- Los gastos existentes y los gastos generales conservan greenhouse_sector_id = NULL.

alter table public.cost_records
  add column if not exists greenhouse_sector_id uuid;

-- Un módulo siempre pertenece a un invernadero. La relación compuesta también
-- mantiene alineada la empresa del gasto con la del módulo seleccionado.
alter table public.cost_records
  drop constraint if exists cost_records_sector_requires_greenhouse_check;

alter table public.cost_records
  add constraint cost_records_sector_requires_greenhouse_check
  check (greenhouse_sector_id is null or greenhouse_id is not null);

create index if not exists cost_records_sector_greenhouse_company_idx
on public.cost_records(greenhouse_sector_id, greenhouse_id, company_id)
where greenhouse_sector_id is not null;

alter table public.cost_records
  drop constraint if exists cost_records_greenhouse_sector_company_fk;

do $$ begin
  alter table public.cost_records
  add constraint cost_records_greenhouse_sector_company_fk
  foreign key (greenhouse_sector_id, greenhouse_id, company_id)
  references public.greenhouse_sectors(id, greenhouse_id, company_id)
  on delete set null (greenhouse_sector_id)
  not valid;
exception when duplicate_object then null;
end $$;

alter table public.cost_records
  validate constraint cost_records_greenhouse_sector_company_fk;
