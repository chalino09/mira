-- Existing sales remain unclassified; no tables, sales or functions are removed.
alter table public.harvest_sales add column payment_method text
  check (payment_method in ('cash', 'transfer', 'card', 'other'));

-- Preserve the existing RPC for older clients. This wrapper uses its validation,
-- permissions, calculations and audit, then records the optional payment method
-- in the same transaction.
create or replace function public.upsert_harvest_sale_with_payment(
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
  target_payment_method text default null
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
begin
  if auth.uid() is null then raise exception 'not_allowed'; end if;
  if target_payment_method is not null and target_payment_method not in ('cash', 'transfer', 'card', 'other')
    then raise exception 'sale_payment_method_invalid'; end if;

  -- The existing RPC checks company authorization and locks the harvest and sale.
  result := public.upsert_harvest_sale(
    target_harvest_record_id, target_sale_id, target_buyer_name, target_occurred_at,
    target_commission_per_box, target_freight_per_box, target_packaging_per_box,
    target_payment_status, target_paid_at, target_notes, target_lines
  );
  select * into strict saved_sale from public.harvest_sales
    where id = (result->>'saleId')::uuid;
  if saved_sale.payment_method is distinct from target_payment_method then
    before_sale := to_jsonb(saved_sale);
    update public.harvest_sales
      set payment_method = target_payment_method, updated_at = now()
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

revoke all on function public.upsert_harvest_sale_with_payment(uuid, uuid, text, date, numeric, numeric, numeric, text, date, text, jsonb, text) from public, anon;
grant execute on function public.upsert_harvest_sale_with_payment(uuid, uuid, text, date, numeric, numeric, numeric, text, date, text, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
