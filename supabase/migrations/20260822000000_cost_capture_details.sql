-- Cost capture details used by the Mira form and historical spreadsheet imports.
-- Kept idempotent because the legacy Mercadia import introduced these columns first.

alter table public.cost_records
  add column if not exists quantity numeric(14,4),
  add column if not exists unit text,
  add column if not exists unit_price numeric(14,4);

alter table public.cost_records
  drop constraint if exists cost_records_quantity_non_negative,
  drop constraint if exists cost_records_unit_price_non_negative;

alter table public.cost_records
  add constraint cost_records_quantity_non_negative
    check (quantity is null or quantity >= 0),
  add constraint cost_records_unit_price_non_negative
    check (unit_price is null or unit_price >= 0);
