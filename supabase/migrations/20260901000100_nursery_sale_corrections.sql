-- Allow authorized users to correct a nursery sale without rewriting its receipt history.
create or replace function public.update_nursery_sale(
  target_sale_id uuid,
  target_customer_id uuid,
  target_occurred_at date,
  target_payment_terms text,
  target_due_date date,
  target_total_amount numeric,
  target_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sale public.nursery_sales%rowtype;
  active_paid numeric;
begin
  select * into target_sale
  from public.nursery_sales
  where id = target_sale_id
  for update;

  if target_sale.id is null then raise exception 'nursery_sale_not_found'; end if;
  if not public.can_manage_company(target_sale.company_id) then raise exception 'not_allowed'; end if;
  if target_sale.cancelled_at is not null then raise exception 'nursery_sale_cancelled'; end if;
  if target_occurred_at is null then raise exception 'nursery_sale_date_required'; end if;
  if target_payment_terms not in ('cash', 'credit') then raise exception 'nursery_sale_terms_invalid'; end if;
  if target_total_amount is null or round(target_total_amount, 2) <= 0 then raise exception 'nursery_sale_total_invalid'; end if;
  if target_payment_terms = 'credit' and target_customer_id is null then raise exception 'nursery_sale_credit_customer_required'; end if;
  if target_payment_terms = 'credit' and (target_due_date is null or target_due_date < target_occurred_at) then
    raise exception 'nursery_sale_credit_due_date_required';
  end if;
  if target_payment_terms = 'cash' and target_due_date is not null then raise exception 'nursery_sale_cash_due_date_invalid'; end if;
  if target_customer_id is not null and not exists (
    select 1 from public.nursery_customers customer
    where customer.id = target_customer_id
      and customer.company_id = target_sale.company_id
      and customer.is_active = true
  ) then raise exception 'nursery_customer_not_found'; end if;

  select coalesce(sum(allocation.amount), 0) into active_paid
  from public.nursery_receipt_allocations allocation
  join public.nursery_receipts receipt on receipt.id = allocation.receipt_id
  where allocation.sale_id = target_sale.id and receipt.voided_at is null;

  if round(target_total_amount, 2) < active_paid then raise exception 'nursery_sale_total_below_paid'; end if;
  if target_payment_terms = 'cash' and round(target_total_amount, 2) <> active_paid then
    raise exception 'nursery_cash_sale_must_be_paid';
  end if;

  update public.nursery_sales
  set customer_id = target_customer_id,
      occurred_at = target_occurred_at,
      payment_terms = target_payment_terms,
      due_date = case when target_payment_terms = 'credit' then target_due_date else null end,
      total_amount = round(target_total_amount, 2),
      notes = nullif(trim(target_notes), ''),
      updated_at = now()
  where id = target_sale.id
  returning * into target_sale;

  return jsonb_build_object(
    'saleId', target_sale.id,
    'paidAmount', active_paid,
    'balanceAmount', greatest(target_sale.total_amount - active_paid, 0)
  );
end;
$$;

revoke all on function public.update_nursery_sale(uuid, uuid, date, text, date, numeric, text) from public, anon;
grant execute on function public.update_nursery_sale(uuid, uuid, date, text, date, numeric, text) to authenticated;
