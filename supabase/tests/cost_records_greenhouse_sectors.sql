-- Regression: a cost may target only a sector from the same greenhouse/company.
rollback;
begin;

do $$
declare
  company_a uuid := 'a1000000-0000-0000-0000-000000000001';
  company_b uuid := 'a2000000-0000-0000-0000-000000000001';
  greenhouse_a uuid := 'a3000000-0000-0000-0000-000000000001';
  greenhouse_b uuid := 'a4000000-0000-0000-0000-000000000001';
  sector_a uuid := 'a5000000-0000-0000-0000-000000000001';
  sector_b uuid := 'a6000000-0000-0000-0000-000000000001';
  cost_a uuid := 'a7000000-0000-0000-0000-000000000001';
  saved_sector uuid;
  saved_greenhouse uuid;
  saved_company uuid;
begin
  insert into public.companies (id, name)
  values (company_a, 'Costos por módulo A'), (company_b, 'Costos por módulo B');

  insert into public.greenhouses (id, company_id, name)
  values
    (greenhouse_a, company_a, 'Invernadero A'),
    (greenhouse_b, company_b, 'Invernadero B');

  insert into public.greenhouse_sectors (id, company_id, greenhouse_id, name)
  values
    (sector_a, company_a, greenhouse_a, 'Módulo A'),
    (sector_b, company_b, greenhouse_b, 'Módulo B');

  insert into public.cost_records (
    id, company_id, greenhouse_id, greenhouse_sector_id, category, amount, occurred_at
  ) values (
    cost_a, company_a, greenhouse_a, sector_a, 'mantenimiento', 125.00, current_date
  );

  begin
    insert into public.cost_records (
      company_id, greenhouse_id, greenhouse_sector_id, category, amount, occurred_at
    ) values (
      company_a, null, sector_a, 'mantenimiento', 125.00, current_date
    );
    raise exception 'A sector cost was accepted without a greenhouse';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.cost_records (
      company_id, greenhouse_id, greenhouse_sector_id, category, amount, occurred_at
    ) values (
      company_a, greenhouse_b, sector_a, 'mantenimiento', 50.00, current_date
    );
    raise exception 'A cross-company sector cost was accepted';
  exception
    when foreign_key_violation then null;
  end;

  delete from public.greenhouse_sectors where id = sector_a;

  select greenhouse_sector_id, greenhouse_id, company_id
  into saved_sector, saved_greenhouse, saved_company
  from public.cost_records
  where id = cost_a;

  if saved_sector is not null or saved_greenhouse <> greenhouse_a or saved_company <> company_a then
    raise exception 'Deleting a sector must clear only the sector reference';
  end if;

  delete from public.greenhouses where id = greenhouse_a;

  select greenhouse_id into saved_greenhouse
  from public.cost_records
  where id = cost_a;

  if saved_greenhouse is not null then
    raise exception 'Deleting a greenhouse must clear the greenhouse reference';
  end if;
end
$$;

rollback;
