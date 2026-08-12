-- Importación única: Mercadia / Hectárea 4 / segundo ciclo Villa 2026.
-- Fuente: GASTOS 1 HA 4 2DO CICLO.xlsx. No es un motor de importación.
-- Se excluyen los gastos de gasolina de agosto a octubre de 2025 por ser del ciclo anterior.

begin;

alter table public.cost_records
  add column if not exists quantity numeric(14,4),
  add column if not exists unit text,
  add column if not exists unit_price numeric(14,4),
  add column if not exists legacy_group text,
  add column if not exists source_reference text;

create unique index if not exists cost_records_company_source_reference_unique
  on public.cost_records(company_id, source_reference)
  where source_reference is not null;

create table if not exists public.harvest_sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  harvest_record_id uuid not null references public.harvest_records(id) on delete cascade,
  cut_number integer not null,
  buyer_name text not null,
  occurred_at date not null,
  gross_amount numeric(14,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  freight_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  payment_status text not null default 'paid' check (payment_status in ('pending', 'paid')),
  paid_at date,
  source_reference text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_reference),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id) on delete cascade,
  constraint harvest_sales_cut_number_positive check (cut_number > 0),
  constraint harvest_sales_amounts_non_negative check (
    gross_amount >= 0 and commission_amount >= 0 and freight_amount >= 0 and net_amount >= 0
  )
);

create index if not exists harvest_sales_company_greenhouse_date_idx
  on public.harvest_sales(company_id, greenhouse_id, occurred_at desc);

create table if not exists public.harvest_sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.harvest_sales(id) on delete cascade,
  quality_label text not null,
  box_count numeric(12,2) not null,
  box_weight_kg numeric(12,2) not null default 20,
  kilograms numeric(12,2) not null,
  gross_unit_price numeric(14,4) not null,
  commission_per_box numeric(14,4) not null default 0,
  freight_per_box numeric(14,4) not null default 0,
  net_unit_price numeric(14,4) not null,
  gross_amount numeric(14,2) not null,
  net_amount numeric(14,2) not null,
  source_reference text not null unique,
  notes text,
  created_at timestamptz not null default now(),
  constraint harvest_sale_lines_values_non_negative check (
    box_count >= 0 and box_weight_kg > 0 and kilograms >= 0 and gross_unit_price >= 0
    and commission_per_box >= 0 and freight_per_box >= 0 and net_unit_price >= 0
    and gross_amount >= 0 and net_amount >= 0
  )
);

create index if not exists harvest_sale_lines_sale_idx on public.harvest_sale_lines(sale_id);

alter table public.harvest_sales enable row level security;
alter table public.harvest_sale_lines enable row level security;

drop policy if exists "harvest_sales_select_member" on public.harvest_sales;
create policy "harvest_sales_select_member"
  on public.harvest_sales for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists "harvest_sales_write_manager" on public.harvest_sales;
create policy "harvest_sales_write_manager"
  on public.harvest_sales for all to authenticated
  using (public.can_manage_company(company_id))
  with check (public.can_manage_company(company_id));
drop policy if exists "harvest_sale_lines_select_member" on public.harvest_sale_lines;
create policy "harvest_sale_lines_select_member"
  on public.harvest_sale_lines for select to authenticated
  using (exists (
    select 1 from public.harvest_sales sale
    where sale.id = harvest_sale_lines.sale_id and public.is_company_member(sale.company_id)
  ));
drop policy if exists "harvest_sale_lines_write_manager" on public.harvest_sale_lines;
create policy "harvest_sale_lines_write_manager"
  on public.harvest_sale_lines for all to authenticated
  using (exists (
    select 1 from public.harvest_sales sale
    where sale.id = harvest_sale_lines.sale_id and public.can_manage_company(sale.company_id)
  ))
  with check (exists (
    select 1 from public.harvest_sales sale
    where sale.id = harvest_sale_lines.sale_id and public.can_manage_company(sale.company_id)
  ));

drop trigger if exists set_harvest_sales_updated_at on public.harvest_sales;
create trigger set_harvest_sales_updated_at
before update on public.harvest_sales
for each row execute function public.set_updated_at();

do $$
declare
  target_company_id uuid;
  target_greenhouse_id uuid;
  tomato_id uuid;
  active_cycle_id uuid;
begin
  select company.id, greenhouse.id
    into target_company_id, target_greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag'
    and public.route_slug(greenhouse.name) = 'hectarea-4'
    and greenhouse.is_active
  limit 1;

  if target_company_id is null or target_greenhouse_id is null then
    raise notice 'Mercadia / Hectárea 4 no existe; se omite la importación histórica.';
    return;
  end if;

  select id into tomato_id from public.crops where slug = 'jitomate' limit 1;
  if tomato_id is null then
    raise exception 'jitomate_crop_not_found';
  end if;

  select id into active_cycle_id
  from public.crop_cycles
  where company_id = target_company_id
    and greenhouse_id = target_greenhouse_id
    and status = 'active'
  limit 1;

  if active_cycle_id is null then
    insert into public.crop_cycles (
      company_id, greenhouse_id, crop_id, variety, transplant_date, plants_count,
      stem_count, status, started_at, notes
    ) values (
      target_company_id, target_greenhouse_id, tomato_id, 'Villa', '2026-04-21', 27904,
      2, 'active', '2026-04-21', 'Segundo ciclo 2026 importado desde GASTOS 1 HA 4 2DO CICLO.xlsx'
    );
  end if;
end;
$$;

with legacy_costs (
  occurred_at, quantity, unit, concept, unit_price, amount, category, legacy_group, source_reference
) as (
values
  ('2026-04-02'::date, 3.15, 'HORA', 'RIPER', 700, 2205, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:2'),
  ('2026-04-02'::date, 2.15, 'HORA', 'TILER', 800, 1720, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:3'),
  ('2026-04-02'::date, 3, 'HORA', 'CAMAS', 700, 2100, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:4'),
  ('2026-04-02'::date, 3.3, 'HORA', 'RIPER', 700, 2310, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:5'),
  ('2026-04-02'::date, 3.3, 'HORA', 'CUCHILLO', 700, 2310, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:6'),
  ('2026-04-02'::date, 0.45, 'HORA', 'RIPER', 700, 315, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:7'),
  ('2026-04-02'::date, 2.2, 'HORA', 'TILER', 800, 1760, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:8'),
  ('2026-04-02'::date, 3, 'HORA', 'CAMAS', 700, 2100, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:9'),
  ('2026-04-02'::date, 3, 'HORA', 'RIPER', 700, 2100, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:10'),
  ('2026-04-02'::date, 2, 'HORA', 'CUCHILLA', 700, 1400, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:11'),
  ('2026-04-02'::date, 2.2, 'HORA', 'CUCHILLA', 700, 1540, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:12'),
  ('2026-04-02'::date, 1.5, 'HORA', 'RIPER', 700, 1050, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:13'),
  ('2026-04-02'::date, 2.4, 'HORA', 'TILER', 800, 1920, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:14'),
  ('2026-04-02'::date, 3.3, 'HORA', 'CAMAS', 700, 2310, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:15'),
  ('2026-04-02'::date, 1, 'AÑO', 'RENTA ANUAL TERRENO HECTÁREA 4', 256000, 256000, 'renta'::public.cost_category, null, 'hectarea-4-cycle-2:trabajo-tractor:renta-anual'),
  ('2026-04-21'::date, 27904, 'PIEZA', 'PLANTULA DOBLE TALLO VILLA', 4.3, 119987.2, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:plantula:3'),
  ('2026-05-22'::date, 4, 'CAJAS', 'COLMENAS', 2105, 8420, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:abejorros:4'),
  ('2026-06-03'::date, 4, 'CAJAS', 'COLMENAS', 2120, 8480, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:abejorros:5'),
  ('2026-05-30'::date, 1, 'LOTE', 'COLOCACION DE PLASTICOS', 2000, 2000, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:reparacion:3'),
  ('2026-06-24'::date, 1, 'LOTE', 'REPARACION DE FUMIGADORA', 2480, 2480, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:reparacion:4'),
  ('2026-05-27'::date, 2, 'PIEZA', 'TURNOS DE AGUA (LLENADO DE PRESA)', 100, 200, 'agua'::public.cost_category, null, 'hectarea-4-cycle-2:turno-de-agua:2'),
  ('2026-04-24'::date, 1, 'LOTE', 'GASOLINA', 566, 566, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:12'),
  ('2026-05-18'::date, 1, 'PIEZA', 'ACEITE', 59, 59, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:13'),
  ('2026-05-18'::date, 1, 'LOTE', 'GASOLINA', 72, 72, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:14'),
  ('2026-05-18'::date, 1, 'LOTE', 'GASOLINA', 72, 72, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:15'),
  ('2026-05-24'::date, 1, 'LOTE', 'GASOLINA', 466, 466, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:16'),
  ('2026-06-01'::date, 1, 'PIEZA', 'ACEITE', 59, 59, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:17'),
  ('2026-06-01'::date, 22.2675, 'LITROS', 'DIESEL', 26.99, 601, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:18'),
  ('2026-06-15'::date, 6.05, 'LITROS', 'GASOLINA', 23.9669, 145, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:19'),
  ('2026-06-18'::date, 23.23, 'LITRO', 'DIESEL', 27.5506, 640, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:20'),
  ('2026-06-26'::date, 1, 'PIEZA', 'ACEITE', 59, 59, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:21'),
  ('2026-07-01'::date, 23.34, 'LITRO', 'DIESEL', 26.9923, 630, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:22'),
  ('2026-07-04'::date, 20, 'LITRO', 'GASOLINA', 24, 480, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:23'),
  ('2026-07-09'::date, 22.23, 'LITRO', 'DIESEL', 26.9906, 600, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:24'),
  ('2026-07-09'::date, 5.29, 'LITRO', 'GASOLINA', 24.0076, 127, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:25'),
  ('2026-07-21'::date, 5.45, 'LITRO', 'GASOLINA', 23.8532, 130, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:26'),
  ('2026-07-30'::date, 23.342, 'LITRO', 'DIESEL', 26.99, 630, 'gasolina'::public.cost_category, null, 'hectarea-4-cycle-2:gasolina:27'),
  ('2026-04-11'::date, null, null, 'NOMINA', null, 16125, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:3'),
  ('2026-04-18'::date, null, null, 'NOMINA', null, 14750, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:4'),
  ('2026-04-25'::date, null, null, 'NOMINA', null, 14183, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:5'),
  ('2026-05-02'::date, null, null, 'NOMINA', null, 14839, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:6'),
  ('2026-05-08'::date, null, null, 'NOMINA', null, 12900, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:7'),
  ('2026-05-15'::date, null, null, 'NOMINA', null, 13775, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:8'),
  ('2026-05-23'::date, null, null, 'NOMINA', null, 13875, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:9'),
  ('2026-05-30'::date, null, null, 'NOMINA', null, 12700, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:10'),
  ('2026-06-06'::date, null, null, 'NOMINA', null, 15350, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:11'),
  ('2026-06-13'::date, null, null, 'NOMINA', null, 18075, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:12'),
  ('2026-06-20'::date, null, null, 'NOMINA', null, 15867, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:13'),
  ('2026-06-27'::date, null, null, 'NOMINA', null, 14417, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:14'),
  ('2026-07-04'::date, null, null, 'NOMINA', null, 15750, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:15'),
  ('2026-07-11'::date, null, null, 'NOMINA', null, 14100, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:16'),
  ('2026-07-17'::date, null, null, 'NOMINA', null, 15550, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:17'),
  ('2026-07-25'::date, null, null, 'NOMINA', null, 23663, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:18'),
  ('2026-08-01'::date, null, null, 'NOMINA', null, 23242, 'mano_obra'::public.cost_category, null, 'hectarea-4-cycle-2:nomina:19'),
  ('2026-04-02'::date, 1, 'ROLLO', 'CINTILLA TORO CAL. 6000, GOTA 20 cm (3,048 m)', 2683, 2683, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:2'),
  ('2026-04-02'::date, 100, 'PIEZA', 'CONECTOR TUBO CIEGO 16 MM- CINTA', 3, 300, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:3'),
  ('2026-04-02'::date, 100, 'PIEZA', 'MINIVÁLVULA CINTA - TUBO CIEGO 16 mm', 7, 700, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:4'),
  ('2026-04-07'::date, 100, 'PIEZA', 'CONECTOR CINTA - CINTA', 3, 300, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:5'),
  ('2026-04-07'::date, 100, 'PIEZA', 'MINIVÁLVULA CINTA - CINTA', 7, 700, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:6'),
  ('2026-04-10'::date, 4, 'PIEZA', 'INICIAL GRANDE 16 mm C/GOMA', 3.5, 14, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:7'),
  ('2026-04-13'::date, 4, 'ROLLO', 'ACOLCHADO LISO DE 1.00 m CAL. 80 (915 m)', 1000, 4000, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:8'),
  ('2026-04-13'::date, 1, 'ROLLO', 'ACOLCHADO LISO B/N  1 M CAL. 80 (915 M)', 1070, 1070, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:9'),
  ('2026-04-13'::date, 1, 'PIEZA', 'COPLE DE INSERCIÓN PARA MANGUERA CONEKTA 3"', 63.75, 63.75, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:10'),
  ('2026-04-13'::date, 8, 'ROLLO', 'ACOLCHADO LISO B/N  1 M CAL. 80 (915 M)', 1050, 8400, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:11'),
  ('2026-04-15'::date, 1, 'PIEZA', 'VÁLVULA ESFERA PVC ROSCAR 2"', 259.84, 259.84, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:12'),
  ('2026-04-15'::date, 2, 'PIEZA', 'ADAPTADOR MACHO DE INSERCIÓN P/MANGUERA CONEKTA 2"', 28.5, 57, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:13'),
  ('2026-04-15'::date, 1, 'PIEZA', 'COPLE MANGUERA CON REDUCCIÓN CONEKTA 2"- 1 1/4"', 34.5, 34.5, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:14'),
  ('2026-04-15'::date, 2, 'PIEZA', 'ABRAZADERA N°20 (21-44 MM) 1 1/4"', 8.005, 16.01, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:15'),
  ('2026-04-15'::date, 5, 'PIEZA', 'ABRAZADERA LEGION ECO NO.32  40-64MM 2"', 19.998, 99.99, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:16'),
  ('2026-04-15'::date, 0.5, 'PIEZA', 'LIJA PARA PLOMERO 1 1/2"', 12, 6, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:17'),
  ('2026-04-15'::date, 4, 'PIEZA', 'CONECTOR INICIAL GRANDE-CINTA C/GOMA', 5, 20, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:18'),
  ('2026-04-15'::date, 24, 'PIEZA', 'TAPON PARA CORRECCION WR 16MM C/GOMA', 3.5, 84, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:19'),
  ('2026-04-15'::date, 2, 'METRO', 'TUBO PVC HCO. C/CAMP RD-26 DE 3" (metro)', 104.005, 208.01, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:20'),
  ('2026-04-15'::date, 15, 'PIEZA', 'MINIVÁLVULA INICIAL GRANDE - CINTA', 9.5, 142.5, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:21'),
  ('2026-04-15'::date, 2, 'PIEZA', 'ABRAZADERA REFORZADA 4"', 80, 160, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:22'),
  ('2026-04-17'::date, 1, 'ROLLO', 'RAFIA NEGRA CAL. 1050 DE 4.5 KG', 290, 290, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:23'),
  ('2026-04-24'::date, 2, 'PIEZA', 'RADIOS', 201.835, 403.67, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:24'),
  ('2026-05-02'::date, 25, 'PIEZA', 'MINIVÁLVULA INICIAL GRANDE - CINTA', 9.5, 237.5, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:25'),
  ('2026-05-02'::date, 5, 'METRO', 'TUBO CIEGO 16 mm - TORO (metro)', 6, 30, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:26'),
  ('2026-05-02'::date, 15, 'PIEZA', 'MINIVÁLVULA CINTA - TUBO CIEGO 16 mm', 8, 120, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:27'),
  ('2026-05-04'::date, 2, 'PIEZA', 'RAFIA NEGRA CAL.1050 DE 4.5 kg', 313.005, 626.01, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:28'),
  ('2026-05-25'::date, 1, 'PIEZA', 'FUMIGADORA DE MOTOR HUSKY DE 2T 25L', 2289.6, 2289.6, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:29'),
  ('2026-05-30'::date, 2000, 'PIEZA', 'ANILLOS ALIANZA', 0.1624, 324.8, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:30'),
  ('2026-06-09'::date, 5, 'PIEZA', 'TIJERAS PODADORAS', 138, 690, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:31'),
  ('2026-06-11'::date, 1, 'PIEZA', 'EXPRIMIDOR', 26, 26, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:32'),
  ('2026-06-18'::date, 1, 'PIEZA', 'PINTURA', 88, 88, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:33'),
  ('2026-06-18'::date, 2, 'BOTES', 'SALVADO P.BIOLOGICOS', 47.5, 95, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:34'),
  ('2026-06-18'::date, 1, 'PIEZA', 'LACTEOS PARA BIOLOGICOS', 62.5, 62.5, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:35'),
  ('2026-06-27'::date, 2, 'LITRO', 'ALCOHOL - MICROORGANISMOS', 23.5, 47, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:36'),
  ('2026-06-27'::date, 1, 'PIEZA', 'AR GALVANIZADO CAL. 14 - 1 3/4" X 1 3/4"', 549.09, 549.09, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:37'),
  ('2026-06-27'::date, 100, 'PIEZA', 'PIJA HEXAGONAL PUNTA BROCA 1"', 0.9048, 90.48, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:38'),
  ('2026-06-27'::date, 8, 'METRO', 'CABLE DE ACERO 7X7 DE 1/8"', 8.0038, 64.03, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:39'),
  ('2026-06-27'::date, 3, 'PIEZA', 'POLEA CON BALERO BASE DE 1 1/2"', 147.25, 441.75, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:40'),
  ('2026-06-29'::date, 30, 'METRO', 'PLÁSTICO AMARILLO PARA TRAMPAS DE 1.20 M', 6.8, 204, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:41'),
  ('2026-06-29'::date, 1, 'PIEZA', 'HARINA PARA MICROORGANISMOS', 13.5, 13.5, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:42'),
  ('2026-07-01'::date, 1, 'PIEZA', 'SUJETADOR TRUPER PARA MICROORGANISMOS', 94, 94, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:43'),
  ('2026-07-03'::date, 2, 'PIEZA', 'VARILLAS', 168, 336, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:44'),
  ('2026-07-03'::date, 1, 'PIEZA', 'MICROORGANISMOS', 271, 271, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:45'),
  ('2026-07-04'::date, 1, 'PIEZA', 'LECHE PARA MICROORGANISMOS', 27.25, 27.25, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:46'),
  ('2026-07-07'::date, 26, 'METRO', 'CABLE DE ACERO 7x7 DE 1/16"', 4.9996, 129.99, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:47'),
  ('2026-07-13'::date, 12.5, 'METRO', 'TUBO CIEGO 16 mm - TORO (metro)', 6, 75, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:48'),
  ('2026-07-14'::date, 15, 'METRO', 'PLÁSTICO AMARILLO PARA TRAMPAS DE 1.20 M', 7.6, 114, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:49'),
  ('2026-07-14'::date, 5, 'LITRO', 'SPIDER PLUS 1 L', 310.5, 1552.5, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:50'),
  ('2026-07-16'::date, 1, 'ROLLO', 'RAFIA NEGRA CAL.1050 DE 4.5 kg', 281.7, 281.7, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:51'),
  ('2026-07-16'::date, 1, 'ROLLO', 'RAFIA NEGRA CAL.1050 DE 4.5 kg', 281.7, 281.7, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:52'),
  ('2026-07-18'::date, 1, 'PIEZA', 'ARINA DE AZUCAR', 149.25, 149.25, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:53'),
  ('2026-07-21'::date, 1, 'PIEZA', 'PRODUCTOS MICROORGANISMOS', 47.5, 47.5, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:54'),
  ('2026-07-21'::date, 0.5, 'METRO', 'TUBO PVC HCO. ABOCINADO RD-26 DE 1" (metro)', 23.98, 11.99, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:55'),
  ('2026-07-21'::date, 1, 'PIEZA', 'PEGAMENTO AZUL PVC (OATEY) - 1/8 L', 96.06, 96.06, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:56'),
  ('2026-07-24'::date, 1, 'PIEZA', 'GASOLINA Y ACEITE', 400, 400, 'mantenimiento'::public.cost_category, null, 'hectarea-4-cycle-2:material:57'),
  ('2026-07-25'::date, 1, 'PIEZA', 'MICROORGANISMOS', 57, 57, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:58'),
  ('2026-07-27'::date, 1, 'PIEZA', 'MICROORGANISMOS', 390, 390, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:59'),
  ('2026-07-31'::date, 1, 'PIEZA', 'VINAGRE', 1000, 1000, 'agroinsumos'::public.cost_category, null, 'hectarea-4-cycle-2:material:60'),
  ('2026-07-31'::date, 1, 'ROLLO', 'RAFIA NEGRA CAL.1050 DE 2 KG', 126.9, 126.9, 'plasticos'::public.cost_category, null, 'hectarea-4-cycle-2:material:61'),
  ('2026-04-02'::date, 1, 'PIEZA', 'AMINOSHOT 500 G', 272, 272, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:2'),
  ('2026-04-02'::date, 1, 'PIEZA', 'LARREA CITRIC 1 L', 331.5, 331.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:3'),
  ('2026-04-17'::date, 1, 'PIEZA', 'PUREX BIOSANITIZER 20 L', 4273.8, 4273.8, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:4'),
  ('2026-04-17'::date, 1, 'PIEZA', 'TOTAL 4G 20 L', 4419.99, 4419.99, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:5'),
  ('2026-04-21'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 562, 562, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:6'),
  ('2026-04-21'::date, 1, 'BULTO', 'FOSFATO MONOAMÓNICO ISAOSA (MAP) 25 kg', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:7'),
  ('2026-04-21'::date, 1, 'BULTO', 'AGRIBAT 20 L', 2159, 2159, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:8'),
  ('2026-04-23'::date, 2, 'PIEZA', 'POWER MIX 1 L', 389.3, 778.6, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:9'),
  ('2026-04-23'::date, 1, 'PIEZA', 'SUPRA ROOT 5 L', 1661.75, 1661.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:10'),
  ('2026-04-23'::date, 2, 'PIEZA', 'SUPRA CARB PLUS 1 L', 171.7, 343.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:11'),
  ('2026-04-23'::date, 5, 'PIEZA', 'PEPTON 85/16 1KG', 505.75, 2528.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:12'),
  ('2026-04-23'::date, 2, 'PIEZA', 'PLAS + ZINC 1 L', 250.75, 501.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:13'),
  ('2026-04-23'::date, 3, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 719.1, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:14'),
  ('2026-04-23'::date, 2, 'PIEZA', 'KONTRA S-3 1 L', 425, 850, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:15'),
  ('2026-04-23'::date, 2, 'PIEZA', 'AMINOBIO 85 500 G.', 255, 510, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:16'),
  ('2026-04-23'::date, 2, 'PIEZA', 'XP-1 (1 L)', 395.25, 790.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:17'),
  ('2026-04-27'::date, 0.5, 'PIEZA', 'PUREX BIOSANITIZER 20 L', 4273.8, 2136.9, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:18'),
  ('2026-04-27'::date, 2, 'PIEZA', 'TOTAL 4G 5 L', 1147.495, 2294.99, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:19'),
  ('2026-04-27'::date, 2, 'PIEZA', 'CHARGER OIDIUM 1 L', 238, 476, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:20'),
  ('2026-04-27'::date, 1, 'PIEZA', 'FOSFI ZN 1 L', 357, 357, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:21'),
  ('2026-04-29'::date, 1, 'PIEZA', 'SUPRA ROOT 5 L', 1661.75, 1661.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:22'),
  ('2026-04-29'::date, 1, 'PIEZA', 'Q-VIRUS 1 L', 672.35, 672.35, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:23'),
  ('2026-04-29'::date, 4, 'PIEZA', 'AMINOSHOT 500 G', 272, 1088, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:24'),
  ('2026-04-29'::date, 1, 'PIEZA', 'KONTRA S-3 1 L', 425, 425, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:25'),
  ('2026-04-29'::date, 1, 'PIEZA', 'FOSFI ZN 1 L', 357, 357, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:26'),
  ('2026-04-29'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 702, 702, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:27'),
  ('2026-04-29'::date, 1, 'BULTO', 'FOSFATO MONOAMÓNICO ISAOSA (MAP) 25 kg', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:28'),
  ('2026-04-29'::date, 1, 'PIEZA', 'AGRIBAT 5 L', 654.5, 654.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:29'),
  ('2026-04-29'::date, 1, 'BULTO', 'FOSFONITRATO PACIFEX (33-3-00) 25 KG', 385, 385, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:30'),
  ('2026-04-29'::date, 2, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 333, 666, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:31'),
  ('2026-05-01'::date, 1, 'PIEZA', 'SUBTY, MEG 5 L', 1500, 1500, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:32'),
  ('2026-05-01'::date, 2, 'PIEZA', 'INTERGUZAN', 330, 660, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:33'),
  ('2026-05-04'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 734, 734, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:34'),
  ('2026-05-04'::date, 1, 'BULTO', 'FOSFATO MONOAMÓNICO ISAOSA (MAP) 25 kg', 869, 869, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:35'),
  ('2026-05-04'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 380, 380, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:36'),
  ('2026-05-04'::date, 2, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 348, 696, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:37'),
  ('2026-05-04'::date, 3, 'KILO', 'LIVING X7 ZN EDDHA 1 KG', 430, 1290, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:38'),
  ('2026-05-07'::date, 3, 'PIEZA', 'CHARGER OIDIUM 1 L', 238, 714, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:39'),
  ('2026-05-07'::date, 2, 'PIEZA', 'VEGETAL OIL 1 L', 174.25, 348.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:40'),
  ('2026-05-08'::date, 2, 'PIEZA', 'INTERGUZAN', 330, 660, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:41'),
  ('2026-05-08'::date, 1, 'PIEZA', 'ABMOUNTAIN', 390, 390, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:42'),
  ('2026-05-13'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 702, 702, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:43'),
  ('2026-05-13'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 562, 562, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:44'),
  ('2026-05-13'::date, 1, 'BULTO', 'FOSFATO MONOAMÓNICO ISAOSA (MAP) 25 kg', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:45'),
  ('2026-05-13'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:46'),
  ('2026-05-13'::date, 2, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 333, 666, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:47'),
  ('2026-05-13'::date, 3, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 1096.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:48'),
  ('2026-05-13'::date, 3, 'PIEZA', 'TAGETES 1 L', 348.5, 1045.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:49'),
  ('2026-05-13'::date, 1, 'PIEZA', 'COMODORO 5 L', 3655, 3655, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:50'),
  ('2026-05-15'::date, 1, 'PIEZA', 'POWER MIX 1 L', 389.3, 389.3, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:51'),
  ('2026-05-15'::date, 1, 'PIEZA', 'PEPTON 85/16 1KG', 505.75, 505.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:52'),
  ('2026-05-15'::date, 1, 'PIEZA', 'AGRIBAT 20 L', 2159, 2159, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:53'),
  ('2026-05-15'::date, 1, 'PIEZA', 'XP-1 (1 L)', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:54'),
  ('2026-05-15'::date, 1, 'PIEZA', 'BIO ALGA 1 L', 338.3, 338.3, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:55'),
  ('2026-05-16'::date, 1, 'PIEZA', 'ZERENO 500 G', 246.5, 246.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:56'),
  ('2026-05-18'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 702, 702, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:57'),
  ('2026-05-18'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 562, 562, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:58'),
  ('2026-05-18'::date, 1, 'BULTO', 'FOSFATO MONOAMÓNICO ISAOSA (MAP) 25 kg', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:59'),
  ('2026-05-18'::date, 1, 'PIEZA', 'PEPTON 85/16 1KG', 505.75, 505.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:60'),
  ('2026-05-18'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:61'),
  ('2026-05-18'::date, 1, 'BULTO', 'FOSFONITRATO PACIFEX (33-3-00) 25 KG', 385, 385, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:62'),
  ('2026-05-18'::date, 1, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 333, 333, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:63'),
  ('2026-05-18'::date, 1, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 365.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:64'),
  ('2026-05-27'::date, 3, 'PIEZA', 'BELT', 430, 1290, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:65'),
  ('2026-05-27'::date, 1, 'BULTO', 'FOSFATO MONOAMÓNICO ISAOSA (MAP) 25 kg', 831, 831, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:66'),
  ('2026-05-27'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:67'),
  ('2026-05-27'::date, 1, 'BULTO', 'FOSFONITRATO PACIFEX (33-3-00) 25 KG', 378, 378, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:68'),
  ('2026-05-27'::date, 4, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 333, 1332, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:69'),
  ('2026-05-27'::date, 2, 'PIEZA', 'LIVING COMPLETE 1 KG', 179.35, 358.7, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:70'),
  ('2026-05-27'::date, 2, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 731, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:71'),
  ('2026-05-30'::date, 1, 'PIEZA', 'POWER MIX 1 L', 389.3, 389.3, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:72'),
  ('2026-05-30'::date, 1, 'PIEZA', 'XP-1 (1 L)', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:73'),
  ('2026-05-30'::date, 2, 'PIEZA', 'GOTA VERDE 1 L', 467.5, 935, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:74'),
  ('2026-05-30'::date, 5, 'PIEZA', 'COMODORO 1L', 756.5, 3782.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:75'),
  ('2026-05-30'::date, 1, 'PIEZA', 'SUPRA HORMONAL 1 L', 774.35, 774.35, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:76'),
  ('2026-05-30'::date, 1, 'PIEZA', 'SUPRA CARB PLUS 1 L', 171.7, 171.7, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:77'),
  ('2026-05-30'::date, 1, 'PIEZA', 'AGRIBAT 1 L', 140.25, 140.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:78'),
  ('2026-05-30'::date, 1, 'PIEZA', 'Q-VIRUS 1 L', 672.35, 672.35, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:79'),
  ('2026-05-30'::date, 1, 'PIEZA', 'APOLO 1 KG', 1198.5, 1198.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:80'),
  ('2026-06-04'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 562, 562, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:81'),
  ('2026-06-04'::date, 1, 'BULTO', 'FOSFATO MONOPOTÁSICO ISAOSA  (MKP) 25 kg', 1041, 1041, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:82'),
  ('2026-06-04'::date, 2, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 720, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:83'),
  ('2026-06-04'::date, 5, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 333, 1665, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:84'),
  ('2026-06-04'::date, 2, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 479.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:85'),
  ('2026-06-04'::date, 2, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 731, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:86'),
  ('2026-06-09'::date, 2, 'PIEZA', 'ALFHA 250 ML', 250, 500, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:87'),
  ('2026-06-09'::date, 1, 'PIEZA', 'FINAL BACTER 800 G', 480, 480, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:88'),
  ('2026-06-10'::date, 2, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 684, 1368, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:89'),
  ('2026-06-10'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:90'),
  ('2026-06-10'::date, 2, 'BULTO', 'FOSFATO MONOPOTÁSICO ISAOSA  (MKP) 25 kg', 1014, 2028, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:91'),
  ('2026-06-10'::date, 2, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 380, 760, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:92'),
  ('2026-06-10'::date, 3, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 319, 957, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:93'),
  ('2026-06-10'::date, 3, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 430, 1290, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:94'),
  ('2026-06-10'::date, 1, 'PIEZA', 'COBREX 4G  1 L', 289, 289, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:95'),
  ('2026-06-10'::date, 5, 'PIEZA', 'LARREA CITRIC 1 L', 338.3, 1691.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:96'),
  ('2026-06-12'::date, 1, 'PIEZA', 'POWER MIX 1 L', 389.3, 389.3, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:97'),
  ('2026-06-12'::date, 2, 'PIEZA', 'SILEX 1L', 306, 612, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:98'),
  ('2026-06-12'::date, 1, 'PIEZA', 'SUPRA ROOT 5 L', 1661.75, 1661.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:99'),
  ('2026-06-12'::date, 5, 'PIEZA', 'PEPTON 85/16 1KG', 505.75, 2528.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:100'),
  ('2026-06-12'::date, 1, 'PIEZA', 'XP-1 (1 L)', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:101'),
  ('2026-06-12'::date, 2, 'PIEZA', 'FOSFI K 1 L', 338.3, 676.6, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:102'),
  ('2026-06-12'::date, 3, 'PIEZA', 'FOSFI ZN 1 L', 357, 1071, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:103'),
  ('2026-06-13'::date, 1, 'PIEZA', 'LARREA CITRIC 1 L', 338.3, 338.3, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:104'),
  ('2026-06-18'::date, 1, 'PIEZA', 'ABMOUNTAIN 1 L', 320, 320, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:105'),
  ('2026-06-18'::date, 3, 'PIEZA', 'ALFHA 250 ML', 230, 690, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:106'),
  ('2026-06-19'::date, 2, 'PIEZA', 'STARKE ZINC 1 L', 622, 1244, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:107'),
  ('2026-06-19'::date, 1, 'PIEZA', 'SUPRA ROOT 5 L', 1661.75, 1661.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:108'),
  ('2026-06-19'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:109'),
  ('2026-06-19'::date, 1, 'BULTO', 'FOSFATO MONOPOTÁSICO ISAOSA  (MKP) 25 kg', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:110'),
  ('2026-06-19'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:111'),
  ('2026-06-19'::date, 4, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 307, 1228, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:112'),
  ('2026-06-19'::date, 1, 'PIEZA', 'PECTA CA 1 L', 280.5, 280.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:113'),
  ('2026-06-19'::date, 10, 'PIEZA', 'AMINOSHOT 500 G', 315.2, 3152, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:114'),
  ('2026-06-19'::date, 2, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 479.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:115'),
  ('2026-06-19'::date, 2, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 731, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:116'),
  ('2026-06-19'::date, 5, 'PIEZA', 'FULVIPOWER 95 1 KG', 240.55, 1202.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:117'),
  ('2026-06-19'::date, 3, 'PIEZA', 'AMINOBIO 85 500 G.', 277.1, 831.3, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:118'),
  ('2026-06-19'::date, 1, 'PIEZA', 'ORTHO P FLORACION 1 L', 371.45, 371.45, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:119'),
  ('2026-06-19'::date, 3, 'PIEZA', 'KINNA 1 L', 284.75, 854.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:120'),
  ('2026-06-19'::date, 2, 'PIEZA', 'GOTA VERDE 1 L', 467.5, 935, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:121'),
  ('2026-06-19'::date, 1, 'PIEZA', 'BIO ROOT 5 L', 1657.5, 1657.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:122'),
  ('2026-06-26'::date, 1, 'PIEZA', 'K3 1 KG', 868.5, 868.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:123'),
  ('2026-06-27'::date, 1, 'PIEZA', 'POWER MIX 1 L', 389.3, 389.3, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:124'),
  ('2026-06-27'::date, 20, 'BULTO', 'SUPRA ENGORDE 1 L', 204.85, 4097, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:125'),
  ('2026-06-27'::date, 2, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 659, 1318, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:126'),
  ('2026-06-27'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:127'),
  ('2026-06-27'::date, 2, 'BULTO', 'FOSFATO MONOPOTÁSICO ISAOSA  (MKP) 25 kg', 977, 1954, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:128'),
  ('2026-06-27'::date, 4, 'PIEZA', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 307, 1228, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:129'),
  ('2026-06-27'::date, 1, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 239.7, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:130'),
  ('2026-06-27'::date, 2, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 731, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:131'),
  ('2026-06-27'::date, 1, 'PIEZA', 'VEGETAL OIL 1 L', 174.25, 174.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:132'),
  ('2026-06-27'::date, 1, 'PIEZA', 'XP-1 (1 L)', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:133'),
  ('2026-06-27'::date, 1, 'PIEZA', 'XP-1 (1 L)', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:134'),
  ('2026-06-27'::date, 1, 'PIEZA', 'FOSFI Q 1 L', 357, 357, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:135'),
  ('2026-06-27'::date, 1, 'PIEZA', 'BIO AK 1 L', 329.8, 329.8, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:136'),
  ('2026-06-27'::date, 2, 'PIEZA', 'BETAGLI MAX 500 G', 495.5, 991, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:137'),
  ('2026-06-27'::date, 2, 'PIEZA', 'RE. BUILDER  5 L', 1416.1, 2832.2, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:138'),
  ('2026-07-03'::date, 1, 'PIEZA', 'DECIS FORTE', 418, 418, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:139'),
  ('2026-07-03'::date, 1, 'PIEZA', 'ELIMIPLAN', 500, 500, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:140'),
  ('2026-07-07'::date, 2, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 528, 1056, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:141'),
  ('2026-07-07'::date, 4, 'BULTO', 'NITRATO DE MAGNESIO 25 kg ISAOSA', 425, 1700, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:142'),
  ('2026-07-07'::date, 1, 'BULTO', 'FOSFATO MONOPOTÁSICO ISAOSA  (MKP) 25 kg', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:143'),
  ('2026-07-07'::date, 2, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 720, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:144'),
  ('2026-07-07'::date, 2, 'PIEZA', 'SUPRA ROOT 1 L', 351.9, 703.8, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:145'),
  ('2026-07-07'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:146'),
  ('2026-07-07'::date, 4, 'BULTO', 'NITRATO DE MAGNESIO 25 kg ISAOSA', 425, 1700, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:147'),
  ('2026-07-07'::date, 2, 'BULTO', 'FOSFATO MONOPOTÁSICO ISAOSA  (MKP) 25 kg', 977, 1954, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:148'),
  ('2026-07-07'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:149'),
  ('2026-07-07'::date, 2, 'PIEZA', 'MG SUPREME 1 L', 283.5, 567, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:150'),
  ('2026-07-07'::date, 1, 'PIEZA', 'ORTHO P FLORACION 1 L', 371.45, 371.45, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:151'),
  ('2026-07-07'::date, 2, 'PIEZA', 'VEGETAL OIL 1 L', 174.25, 348.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:152'),
  ('2026-07-07'::date, 1, 'PIEZA', 'XP-1 (1 L)', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:153'),
  ('2026-07-07'::date, 1, 'PIEZA', 'BIO AK 1 L', 329.8, 329.8, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:154'),
  ('2026-07-07'::date, 1, 'PIEZA', 'FOSFI Mg 1 L', 369.75, 369.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:155'),
  ('2026-07-07'::date, 2, 'PIEZA', 'BMO 1 L', 297.5, 595, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:156'),
  ('2026-07-07'::date, 1, 'PIEZA', 'CLEAN ROOT 1 L', 309.4, 309.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:157'),
  ('2026-07-07'::date, 2, 'PIEZA', 'BACILLUS 4 1 L', 309.4, 618.8, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:158'),
  ('2026-07-07'::date, 20, 'PIEZA', 'SUPRA ENGORDE 1 L', 204.85, 4097, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:159'),
  ('2026-07-07'::date, 1, 'PIEZA', 'MELAZA 20 L', 297.5, 297.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:160'),
  ('2026-07-07'::date, 2, 'PIEZA', 'Q-VIRUS 1 L', 672.35, 1344.7, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:161'),
  ('2026-07-07'::date, 2, 'PIEZA', 'AMINOSHOT 500 G', 272, 544, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:162'),
  ('2026-07-07'::date, 2, 'PIEZA', 'KONTRA S-3 1 L', 446.25, 892.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:163'),
  ('2026-07-09'::date, 2, 'PIEZA', 'METANIL  1 KG', 360, 720, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:164'),
  ('2026-07-09'::date, 1, 'PIEZA', 'METANIL  1 KG', 380, 380, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:165'),
  ('2026-07-13'::date, 20, 'PIEZA', 'SUPRA ENGORDE 1 L', 204.85, 4097, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:166'),
  ('2026-07-13'::date, 2, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 720, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:167'),
  ('2026-07-13'::date, 4, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 307, 1228, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:168'),
  ('2026-07-13'::date, 2, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 479.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:169'),
  ('2026-07-13'::date, 2, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 731, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:170'),
  ('2026-07-14'::date, 1, 'PIEZA', 'DECIS FORTE 450 ML', 418, 418, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:171'),
  ('2026-07-14'::date, 2, 'PIEZA', 'ELIMIPLAN 250 G', 250, 500, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:172'),
  ('2026-07-16'::date, 3, 'PIEZA', 'CONTRATIZON  1 KG', 360, 1080, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:173'),
  ('2026-07-16'::date, 6, 'PIEZA', 'AMBIOS XPR 1 L', 479.4, 2876.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:174'),
  ('2026-07-16'::date, 1, 'PIEZA', 'PLAS+ MOLIBDENO 1 L', 484.5, 484.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:175'),
  ('2026-07-16'::date, 2, 'PIEZA', 'PECTA CA 1 L', 280.5, 561, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:176'),
  ('2026-07-16'::date, 1, 'PIEZA', 'XP-1 (1 L)', 395.25, 395.25, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:177'),
  ('2026-07-16'::date, 1, 'PIEZA', 'FOSFI Mg 1 L', 369.75, 369.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:178'),
  ('2026-07-16'::date, 2, 'PIEZA', 'FOSFI ZN 1 L', 357, 714, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:179'),
  ('2026-07-16'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:180'),
  ('2026-07-16'::date, 1, 'BULTO', 'FOSFATO MONOAMÓNICO ISAOSA (MAP) 25 kg', 780, 780, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:181'),
  ('2026-07-16'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:182'),
  ('2026-07-16'::date, 2, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 307, 614, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:183'),
  ('2026-07-16'::date, 3, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 1096.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:184'),
  ('2026-07-16'::date, 4, 'BULTO', 'NITRATO DE MAGNESIO 25 kg ISAOSA', 425, 1700, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:185'),
  ('2026-07-16'::date, 2, 'PIEZA', 'TRICHO 3 EXPANSIVE 1 L', 309.4, 618.8, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:186'),
  ('2026-07-21'::date, 2, 'PIEZA', 'SUPRA B - 1 L', 249.9, 499.8, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:187'),
  ('2026-07-21'::date, 1, 'PIEZA', 'FOSFI Q 1 L', 357, 357, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:188'),
  ('2026-07-21'::date, 3, 'PIEZA', 'LARREA CITRIC 1 L', 338.3, 1014.9, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:189'),
  ('2026-07-21'::date, 20, 'PIEZA', 'SUPRA ENGORDE 1 L', 204.85, 4097, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:190'),
  ('2026-07-21'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:191'),
  ('2026-07-21'::date, 2, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 528, 1056, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:192'),
  ('2026-07-21'::date, 1, 'BULTO', 'FOSFATO MONOPOTÁSICO ISAOSA  (MKP) 25 kg', 977, 977, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:193'),
  ('2026-07-21'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:194'),
  ('2026-07-21'::date, 1, 'BULTO', 'FOSFONITRATO PACIFEX (33-3-00) 25 KG', 378, 378, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:195'),
  ('2026-07-21'::date, 5, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 307, 1535, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:196'),
  ('2026-07-21'::date, 2, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 479.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:197'),
  ('2026-07-21'::date, 2, 'PIEZA', 'LIVING X7 ZN EDDHA 1 KG', 365.5, 731, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:198'),
  ('2026-07-21'::date, 2, 'PIEZA', 'VEGETAL OIL 1 L', 174.25, 348.5, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:199'),
  ('2026-07-24'::date, 8, 'PIEZA', 'COMODORO 1L', 756.5, 6052, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:200'),
  ('2026-07-24'::date, 1, 'PIEZA', 'ROOT BOOTS 5L', 952, 952, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:201'),
  ('2026-07-27'::date, 1, 'BULTO', 'NITRATO DE POTASIO (NKS) ISAOSA  25  kg', 659, 659, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:202'),
  ('2026-07-27'::date, 1, 'BULTO', 'SULFATO DE POTASIO  ISAOSA (SOP) 25 kg', 528, 528, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:203'),
  ('2026-07-27'::date, 4, 'BULTO', 'NITRATO DE MAGNESIO 25 kg ISAOSA', 425, 1700, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:204'),
  ('2026-07-27'::date, 1, 'BULTO', 'SULFATO DE MAGNESIO PEÑOLES (SULMAG) 50 kg', 360, 360, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:205'),
  ('2026-07-27'::date, 1, 'BULTO', 'FOSFONITRATO PACIFEX (33-3-00) 25 KG', 378, 378, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:206'),
  ('2026-07-27'::date, 4, 'BULTO', 'NITRATO DE CALCIO  (NCA) ISAOSA  25  kg', 307, 1228, 'fertilizantes'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:207'),
  ('2026-07-27'::date, 2, 'PIEZA', 'LIVING X6 FE 1 KG', 239.7, 479.4, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:208'),
  ('2026-07-29'::date, 20, 'PIEZA', 'AGRIBAT 1 L', 132, 2640, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:209'),
  ('2026-07-29'::date, 6, 'PIEZA', 'ZERENO 500 G', 246.5, 1479, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:210'),
  ('2026-07-29'::date, 4, 'PIEZA', 'AMINOSHOT 500 G', 272, 1088, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:211'),
  ('2026-07-29'::date, 2, 'PIEZA', 'FULVIPOWER 95 1 KG', 240.55, 481.1, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:212'),
  ('2026-07-29'::date, 2, 'PIEZA', 'ESTREPA 60 1L', 416.5, 833, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:213'),
  ('2026-07-29'::date, 1, 'PIEZA', 'FOSFI Mg 1 L', 369.75, 369.75, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:214'),
  ('2026-07-29'::date, 20, 'PIEZA', 'SUPRA ENGORDE 1 L', 192.8, 3856, 'agroinsumos'::public.cost_category, 'teza', 'hectarea-4-cycle-2:insumos:215'),
  ('2026-07-31'::date, 4, 'PIEZA', 'ALFA', 225, 900, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:216'),
  ('2026-07-31'::date, 3, 'PIEZA', 'ABMAUNTAIN 1 L', 330, 990, 'agroinsumos'::public.cost_category, 'quimico', 'hectarea-4-cycle-2:insumos:217')
), target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag'
    and public.route_slug(greenhouse.name) = 'hectarea-4'
    and greenhouse.is_active
)
insert into public.cost_records (
  company_id, greenhouse_id, category, amount, occurred_at, notes, origin,
  quantity, unit, unit_price, legacy_group, source_reference
)
select
  target.company_id, target.greenhouse_id, legacy_costs.category, round(legacy_costs.amount, 2),
  legacy_costs.occurred_at, legacy_costs.concept, 'manual'::public.cost_origin,
  legacy_costs.quantity, legacy_costs.unit, legacy_costs.unit_price,
  legacy_costs.legacy_group, legacy_costs.source_reference
from legacy_costs cross join target
on conflict (company_id, source_reference) where source_reference is not null do update set
  greenhouse_id = excluded.greenhouse_id,
  category = excluded.category,
  amount = excluded.amount,
  occurred_at = excluded.occurred_at,
  notes = excluded.notes,
  quantity = excluded.quantity,
  unit = excluded.unit,
  unit_price = excluded.unit_price,
  legacy_group = excluded.legacy_group,
  updated_at = now();

with target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag'
    and public.route_slug(greenhouse.name) = 'hectarea-4'
    and greenhouse.is_active
), legacy_harvests (
  cut_number, occurred_at, source_reference, title, kilograms, box_count,
  first_boxes, second_boxes, third_boxes, first_price, second_price, third_price,
  net_amount, buyer_name, notes
) as (
  values
    (1, '2026-07-10'::date, 'hectarea-4-cycle-2:cosecha:corte-1', 'Cosecha histórica · Corte 1', 340, 17, 15, 2, 0, 200, 160, 0, 2555, 'SR. JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
    (2, '2026-07-22'::date, 'hectarea-4-cycle-2:cosecha:corte-2', 'Cosecha histórica · Corte 2', 10760, 538, 461, 58, 15, 140, 110, 70, 49069.7757847534, 'SR. JUAN', 'Venta cobrada. Incluye 4 cajas de canicas; comisión $25/caja y flete prorrateado.'),
    (3, '2026-07-23'::date, 'hectarea-4-cycle-2:cosecha:corte-3', 'Cosecha histórica · Corte 3', 3200, 160, 135, 25, 0, 127, 127, 0, 20320, 'DON CESAR', 'Venta cobrada sin comisión ni flete registrados.'),
    (4, '2026-07-29'::date, 'hectarea-4-cycle-2:cosecha:corte-4', 'Cosecha histórica · Corte 4', 16000, 800, 729, 67, 4, 115, 115, 115, 92000, 'DON CESAR', 'Venta cobrada sin comisión ni flete registrados.')
)
insert into public.tasks (
  id, company_id, greenhouse_id, type, title, scheduled_date, status, notes,
  technical_plan, origin, occurred_at, completed_at, verified_at
)
select
  md5(legacy_harvests.source_reference)::uuid, target.company_id, target.greenhouse_id,
  'cosecha'::public.task_type, legacy_harvests.title, legacy_harvests.occurred_at,
  'verificada'::public.task_status,
  legacy_harvests.notes || ' Fuente: ' || legacy_harvests.source_reference,
  jsonb_build_object('source', 'historical_excel_import', 'reference', legacy_harvests.source_reference),
  'migrated'::public.work_origin, legacy_harvests.occurred_at::timestamptz,
  legacy_harvests.occurred_at::timestamptz, legacy_harvests.occurred_at::timestamptz
from legacy_harvests cross join target
on conflict (id) do update set
  company_id = excluded.company_id, greenhouse_id = excluded.greenhouse_id,
  type = excluded.type, title = excluded.title, scheduled_date = excluded.scheduled_date,
  status = excluded.status, notes = excluded.notes, technical_plan = excluded.technical_plan,
  origin = excluded.origin, occurred_at = excluded.occurred_at,
  completed_at = excluded.completed_at, verified_at = excluded.verified_at, updated_at = now();

with target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag'
    and public.route_slug(greenhouse.name) = 'hectarea-4'
    and greenhouse.is_active
), legacy_harvests (
  occurred_at, source_reference, kilograms, box_count, first_boxes, second_boxes, third_boxes,
  first_price, second_price, third_price, net_amount, buyer_name, notes
) as (
  values
    ('2026-07-10'::date, 'hectarea-4-cycle-2:cosecha:corte-1', 340, 17, 15, 2, 0, 200, 160, 0, 2555, 'SR. JUAN', 'Venta cobrada. Comisión $25/caja y flete $20/caja.'),
    ('2026-07-22'::date, 'hectarea-4-cycle-2:cosecha:corte-2', 10760, 538, 461, 58, 15, 140, 110, 70, 49069.7757847534, 'SR. JUAN', 'Venta cobrada. Incluye 4 cajas de canicas; comisión $25/caja y flete prorrateado.'),
    ('2026-07-23'::date, 'hectarea-4-cycle-2:cosecha:corte-3', 3200, 160, 135, 25, 0, 127, 127, 0, 20320, 'DON CESAR', 'Venta cobrada sin comisión ni flete registrados.'),
    ('2026-07-29'::date, 'hectarea-4-cycle-2:cosecha:corte-4', 16000, 800, 729, 67, 4, 115, 115, 115, 92000, 'DON CESAR', 'Venta cobrada sin comisión ni flete registrados.')
)
insert into public.harvest_records (
  company_id, greenhouse_id, source_task_id, occurred_at, kilograms, box_count, box_weight_kg,
  first_quality_kg, second_quality_kg, third_quality_kg, merma_kg,
  first_quality_boxes, second_quality_boxes, third_quality_boxes, merma_boxes,
  first_quality_price, second_quality_price, third_quality_price, estimated_price,
  destination, notes
)
select
  target.company_id, target.greenhouse_id, md5(legacy_harvests.source_reference)::uuid,
  legacy_harvests.occurred_at, legacy_harvests.kilograms, legacy_harvests.box_count, 20,
  legacy_harvests.first_boxes * 20, legacy_harvests.second_boxes * 20, legacy_harvests.third_boxes * 20, 0,
  legacy_harvests.first_boxes, legacy_harvests.second_boxes, legacy_harvests.third_boxes, 0,
  legacy_harvests.first_price, legacy_harvests.second_price, legacy_harvests.third_price,
  round(legacy_harvests.net_amount, 2), legacy_harvests.buyer_name,
  legacy_harvests.notes || ' Fuente: ' || legacy_harvests.source_reference
from legacy_harvests cross join target
on conflict on constraint harvest_records_source_task_unique do update set
  company_id = excluded.company_id, greenhouse_id = excluded.greenhouse_id,
  occurred_at = excluded.occurred_at, kilograms = excluded.kilograms, box_count = excluded.box_count,
  box_weight_kg = excluded.box_weight_kg, first_quality_kg = excluded.first_quality_kg,
  second_quality_kg = excluded.second_quality_kg, third_quality_kg = excluded.third_quality_kg,
  merma_kg = excluded.merma_kg, first_quality_boxes = excluded.first_quality_boxes,
  second_quality_boxes = excluded.second_quality_boxes, third_quality_boxes = excluded.third_quality_boxes,
  merma_boxes = excluded.merma_boxes, first_quality_price = excluded.first_quality_price,
  second_quality_price = excluded.second_quality_price, third_quality_price = excluded.third_quality_price,
  estimated_price = excluded.estimated_price, destination = excluded.destination, notes = excluded.notes,
  updated_at = now();

with target as (
  select company.id as company_id, greenhouse.id as greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag'
    and public.route_slug(greenhouse.name) = 'hectarea-4'
    and greenhouse.is_active
), legacy_sales (
  cut_number, occurred_at, harvest_reference, buyer_name, gross_amount, commission_amount, freight_amount, net_amount, source_reference
) as (
  values
    (1, '2026-07-10'::date, 'hectarea-4-cycle-2:cosecha:corte-1', 'SR. JUAN', 3320, 425, 340, 2555, 'hectarea-4-cycle-2:venta:corte-1-juan'),
    (2, '2026-07-22'::date, 'hectarea-4-cycle-2:cosecha:corte-2', 'SR. JUAN', 72170, 13450, 9650.2242152466, 49069.7757847534, 'hectarea-4-cycle-2:venta:corte-2-juan'),
    (3, '2026-07-23'::date, 'hectarea-4-cycle-2:cosecha:corte-3', 'DON CESAR', 20320, 0, 0, 20320, 'hectarea-4-cycle-2:venta:corte-3-cesar'),
    (4, '2026-07-29'::date, 'hectarea-4-cycle-2:cosecha:corte-4', 'DON CESAR', 92000, 0, 0, 92000, 'hectarea-4-cycle-2:venta:corte-4-cesar')
)
insert into public.harvest_sales (
  company_id, greenhouse_id, harvest_record_id, cut_number, buyer_name, occurred_at,
  gross_amount, commission_amount, freight_amount, net_amount, payment_status, paid_at, source_reference, notes
)
select
  target.company_id, target.greenhouse_id, harvest.id, legacy_sales.cut_number,
  legacy_sales.buyer_name, legacy_sales.occurred_at, round(legacy_sales.gross_amount, 2),
  round(legacy_sales.commission_amount, 2), round(legacy_sales.freight_amount, 2), round(legacy_sales.net_amount, 2),
  'paid', legacy_sales.occurred_at, legacy_sales.source_reference, 'Importación histórica de venta cobrada.'
from legacy_sales
cross join target
join public.harvest_records harvest on harvest.source_task_id = md5(legacy_sales.harvest_reference)::uuid
on conflict (company_id, source_reference) do update set
  greenhouse_id = excluded.greenhouse_id, harvest_record_id = excluded.harvest_record_id,
  cut_number = excluded.cut_number, buyer_name = excluded.buyer_name, occurred_at = excluded.occurred_at,
  gross_amount = excluded.gross_amount, commission_amount = excluded.commission_amount,
  freight_amount = excluded.freight_amount, net_amount = excluded.net_amount,
  payment_status = excluded.payment_status, paid_at = excluded.paid_at, notes = excluded.notes, updated_at = now();

with legacy_lines (
  sale_reference, quality_label, box_count, gross_unit_price, commission_per_box, freight_per_box, net_unit_price, gross_amount, net_amount, source_reference
) as (
  values
    ('hectarea-4-cycle-2:venta:corte-1-juan', 'primeras', 15, 200, 25, 20, 155, 3000, 2325, 'hectarea-4-cycle-2:venta:corte-1-juan:primeras'),
    ('hectarea-4-cycle-2:venta:corte-1-juan', 'segundas', 2, 160, 25, 20, 115, 320, 230, 'hectarea-4-cycle-2:venta:corte-1-juan:segundas'),
    ('hectarea-4-cycle-2:venta:corte-2-juan', 'primeras', 461, 140, 25, 17.9372197309, 97.0627802691, 64540, 44745.9417040359, 'hectarea-4-cycle-2:venta:corte-2-juan:primeras'),
    ('hectarea-4-cycle-2:venta:corte-2-juan', 'segundas', 58, 110, 25, 17.9372197309, 67.0627802691, 6380, 3889.6412556054, 'hectarea-4-cycle-2:venta:corte-2-juan:segundas'),
    ('hectarea-4-cycle-2:venta:corte-2-juan', 'terceras', 15, 70, 25, 17.9372197309, 27.0627802691, 1050, 405.9417040359, 'hectarea-4-cycle-2:venta:corte-2-juan:terceras'),
    ('hectarea-4-cycle-2:venta:corte-2-juan', 'canicas', 4, 50, 25, 17.9372197309, 7.0627802691, 200, 28.2511210762, 'hectarea-4-cycle-2:venta:corte-2-juan:canicas'),
    ('hectarea-4-cycle-2:venta:corte-3-cesar', 'primeras', 135, 127, 0, 0, 127, 17145, 17145, 'hectarea-4-cycle-2:venta:corte-3-cesar:primeras'),
    ('hectarea-4-cycle-2:venta:corte-3-cesar', 'segundas', 25, 127, 0, 0, 127, 3175, 3175, 'hectarea-4-cycle-2:venta:corte-3-cesar:segundas'),
    ('hectarea-4-cycle-2:venta:corte-4-cesar', 'primeras', 729, 115, 0, 0, 115, 83835, 83835, 'hectarea-4-cycle-2:venta:corte-4-cesar:primeras'),
    ('hectarea-4-cycle-2:venta:corte-4-cesar', 'segundas', 67, 115, 0, 0, 115, 7705, 7705, 'hectarea-4-cycle-2:venta:corte-4-cesar:segundas'),
    ('hectarea-4-cycle-2:venta:corte-4-cesar', 'terceras', 4, 115, 0, 0, 115, 460, 460, 'hectarea-4-cycle-2:venta:corte-4-cesar:terceras')
)
insert into public.harvest_sale_lines (
  sale_id, quality_label, box_count, box_weight_kg, kilograms, gross_unit_price,
  commission_per_box, freight_per_box, net_unit_price, gross_amount, net_amount, source_reference
)
select
  sale.id, legacy_lines.quality_label, legacy_lines.box_count, 20, legacy_lines.box_count * 20,
  legacy_lines.gross_unit_price, legacy_lines.commission_per_box, legacy_lines.freight_per_box,
  legacy_lines.net_unit_price, round(legacy_lines.gross_amount, 2), round(legacy_lines.net_amount, 2),
  legacy_lines.source_reference
from legacy_lines
join public.harvest_sales sale on sale.source_reference = legacy_lines.sale_reference
on conflict (source_reference) do update set
  sale_id = excluded.sale_id, quality_label = excluded.quality_label, box_count = excluded.box_count,
  box_weight_kg = excluded.box_weight_kg, kilograms = excluded.kilograms,
  gross_unit_price = excluded.gross_unit_price, commission_per_box = excluded.commission_per_box,
  freight_per_box = excluded.freight_per_box, net_unit_price = excluded.net_unit_price,
  gross_amount = excluded.gross_amount, net_amount = excluded.net_amount;

do $$
declare
  target_company_id uuid;
  target_greenhouse_id uuid;
  cost_count integer;
  cost_total numeric;
  harvest_count integer;
  sale_count integer;
  sale_line_count integer;
  sale_total numeric;
begin
  select company.id, greenhouse.id
    into target_company_id, target_greenhouse_id
  from public.companies company
  join public.greenhouses greenhouse on greenhouse.company_id = company.id
  where company.slug = 'mercadia-ag'
    and public.route_slug(greenhouse.name) = 'hectarea-4'
    and greenhouse.is_active
  limit 1;

  if target_company_id is null or target_greenhouse_id is null then
    raise notice 'Mercadia / Hectárea 4 no existe; se omite la conciliación histórica.';
    return;
  end if;

  select count(*), coalesce(sum(amount), 0) into cost_count, cost_total
  from public.cost_records
  where company_id = target_company_id and source_reference like 'hectarea-4-cycle-2:%';
  if cost_count <> 330 or round(cost_total, 2) <> 939847.60 then
    raise exception 'hectarea_4_cost_reconciliation_failed: count %, total %', cost_count, cost_total;
  end if;

  select count(*) into harvest_count
  from public.harvest_records harvest
  join public.tasks task on task.id = harvest.source_task_id
  where harvest.company_id = target_company_id
    and task.technical_plan->>'source' = 'historical_excel_import'
    and task.technical_plan->>'reference' like 'hectarea-4-cycle-2:cosecha:%';
  if harvest_count <> 4 then raise exception 'hectarea_4_harvest_reconciliation_failed: %', harvest_count; end if;

  select count(*), coalesce(sum(net_amount), 0) into sale_count, sale_total
  from public.harvest_sales
  where company_id = target_company_id and source_reference like 'hectarea-4-cycle-2:%';
  if sale_count <> 4 or round(sale_total, 2) <> 163944.78 then
    raise exception 'hectarea_4_sale_reconciliation_failed: count %, total %', sale_count, sale_total;
  end if;

  select count(*) into sale_line_count
  from public.harvest_sale_lines
  where source_reference like 'hectarea-4-cycle-2:%';
  if sale_line_count <> 11 then raise exception 'hectarea_4_sale_line_reconciliation_failed: %', sale_line_count; end if;
end;
$$;

commit;
