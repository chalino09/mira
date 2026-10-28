-- Authorized feature: two payment methods on the same harvest sale.
-- Additive migration: existing RPCs, table grants and RLS policies are unchanged.
-- The new RPC reuses company authorization and locks from upsert_harvest_sale,
-- requires auth.uid(), and is executable only by the existing authenticated role.
-- The optional split belongs to the same sale; existing single-method notes are unchanged.
alter table public.harvest_sales add column payment_split jsonb not null default '[]'::jsonb
  check (case when jsonb_typeof(payment_split) = 'array' then jsonb_array_length(payment_split) in (0, 2) else false end);

create or replace function public.upsert_harvest_sale_with_payments(
  target_harvest_record_id uuid,
  target_sale_id uuid default null,
  target_buyer_name text default null,
  target_occurred_at date default null,
  target_commission_per_box numeric default 0,
  target_freight_per_box numeric default 0,
  target_packaging_per_box numeric default 0,
  target_payment_status text default 'pending',
  target_paid_at date default null,
  target_notes text default null,
  target_lines jsonb default '[]'::jsonb,
  target_payment_method text default null,
  target_payments jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  saved_sale public.harvest_sales%rowtype;
  before_sale jsonb;
  sale_lines jsonb;
  payments jsonb := coalesce(target_payments, '[]'::jsonb);
  payment jsonb;
  payment_amount numeric;
  payment_total numeric := 0;
  methods text[] := '{}';
  primary_method text := target_payment_method;
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if primary_method is not null and primary_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'sale_payment_method_invalid';
  end if;
  if jsonb_typeof(payments) <> 'array' then raise exception 'sale_payment_split_invalid'; end if;
  if jsonb_array_length(payments) not in (0, 2) then raise exception 'sale_payment_split_invalid'; end if;
  for payment in select value from jsonb_array_elements(payments) loop
    if jsonb_typeof(payment) <> 'object' or payment->>'method' is null
      or payment->>'method' not in ('cash', 'transfer', 'card', 'other') then
      raise exception 'sale_payment_method_invalid';
    end if;
    if payment->>'method' = any(methods) then raise exception 'sale_payment_method_duplicated'; end if;
    methods := array_append(methods, payment->>'method');
    if jsonb_typeof(payment->'amount') is distinct from 'number' then raise exception 'sale_payment_amount_invalid'; end if;
    payment_amount := (payment->>'amount')::numeric;
    if payment_amount <= 0 or payment_amount <> round(payment_amount, 2) then raise exception 'sale_payment_amount_invalid'; end if;
    payment_total := payment_total + payment_amount;
  end loop;
  if jsonb_array_length(payments) = 2 then primary_method := payments->0->>'method'; end if;

  -- Existing RPC enforces company authorization, cycle locks, prices and quantities.
  -- Any split error below rolls back that RPC and its audit in this transaction.
  result := public.upsert_harvest_sale(
    target_harvest_record_id, target_sale_id, target_buyer_name, target_occurred_at,
    target_commission_per_box, target_freight_per_box, target_packaging_per_box,
    target_payment_status, target_paid_at, target_notes, target_lines
  );
  select * into strict saved_sale from public.harvest_sales where id = (result->>'saleId')::uuid;
  if jsonb_array_length(payments) = 2 and payment_total <> saved_sale.net_amount then
    raise exception 'sale_payment_total_mismatch';
  end if;
  if saved_sale.payment_method is distinct from primary_method or saved_sale.payment_split is distinct from payments then
    before_sale := to_jsonb(saved_sale);
    update public.harvest_sales set payment_method = primary_method, payment_split = payments, updated_at = now()
      where id = saved_sale.id returning * into saved_sale;
    select coalesce(jsonb_agg(to_jsonb(line) order by line.created_at), '[]'::jsonb)
      into sale_lines from public.harvest_sale_lines line where line.sale_id = saved_sale.id;
    insert into public.harvest_sale_revisions (company_id, harvest_sale_id, changed_by, before_values, after_values)
      values (saved_sale.company_id, saved_sale.id, auth.uid(),
        jsonb_build_object('sale', before_sale, 'lines', sale_lines),
        jsonb_build_object('sale', to_jsonb(saved_sale), 'lines', sale_lines));
  end if;
  return result;
end;
$$;
revoke all on function public.upsert_harvest_sale_with_payments(uuid, uuid, text, date, numeric, numeric, numeric, text, date, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.upsert_harvest_sale_with_payments(uuid, uuid, text, date, numeric, numeric, numeric, text, date, text, jsonb, text, jsonb) to authenticated;

-- Existing RPC definitions and their privileges remain unchanged.
notify pgrst, 'reload schema';
