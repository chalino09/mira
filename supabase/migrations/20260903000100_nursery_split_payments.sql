-- Allow one nursery payment to be split across multiple payment methods.
alter table public.nursery_receipts
  drop constraint if exists nursery_receipts_method_valid;

alter table public.nursery_receipts
  add constraint nursery_receipts_method_valid check (
    payment_method in ('cash', 'card', 'transfer', 'other')
  );

alter table public.nursery_receipts
  add column if not exists payment_group_id uuid;

create index if not exists nursery_receipts_payment_group_idx
on public.nursery_receipts(payment_group_id)
where payment_group_id is not null;

create or replace function public.record_nursery_split_payment(
  target_sale_id uuid,
  target_occurred_at date,
  target_payments jsonb,
  target_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_sale public.nursery_sales%rowtype;
  payment jsonb;
  payment_method text;
  payment_amount numeric;
  current_paid numeric;
  payment_total numeric := 0;
  payment_count integer := 0;
  payment_methods text[] := array[]::text[];
  payment_group uuid := gen_random_uuid();
  target_receipt_id uuid;
begin
  select * into target_sale
  from public.nursery_sales
  where id = target_sale_id
  for update;

  if target_sale.id is null then raise exception 'nursery_sale_not_found'; end if;
  if not public.can_manage_company(target_sale.company_id) then raise exception 'not_allowed'; end if;
  if target_sale.cancelled_at is not null then raise exception 'nursery_sale_cancelled'; end if;
  if target_occurred_at is null then raise exception 'nursery_receipt_date_required'; end if;
  if target_payments is null or jsonb_typeof(target_payments) <> 'array' or jsonb_array_length(target_payments) = 0 then
    raise exception 'nursery_split_payments_required';
  end if;

  for payment in select value from jsonb_array_elements(target_payments)
  loop
    payment_method := nullif(trim(payment->>'paymentMethod'), '');
    payment_amount := nullif(payment->>'amount', '')::numeric;
    if payment_method not in ('cash', 'card', 'transfer', 'other') then
      raise exception 'nursery_payment_method_invalid';
    end if;
    if payment_method = any(payment_methods) then
      raise exception 'nursery_split_payment_method_duplicate';
    end if;
    if payment_amount is null or round(payment_amount, 2) <= 0 then
      raise exception 'nursery_receipt_amount_invalid';
    end if;
    payment_methods := array_append(payment_methods, payment_method);
    payment_total := payment_total + round(payment_amount, 2);
    payment_count := payment_count + 1;
  end loop;

  select coalesce(sum(allocation.amount), 0) into current_paid
  from public.nursery_receipt_allocations allocation
  join public.nursery_receipts receipt on receipt.id = allocation.receipt_id
  where allocation.sale_id = target_sale.id and receipt.voided_at is null;

  if current_paid + payment_total > target_sale.total_amount then
    raise exception 'nursery_sale_overpayment';
  end if;

  for payment in select value from jsonb_array_elements(target_payments)
  loop
    payment_method := trim(payment->>'paymentMethod');
    payment_amount := round((payment->>'amount')::numeric, 2);

    insert into public.nursery_receipts (
      company_id, nursery_id, customer_id, receipt_kind, payment_method,
      occurred_at, amount, notes, payment_group_id, created_by
    ) values (
      target_sale.company_id, target_sale.nursery_id, target_sale.customer_id,
      case when current_paid + payment_total = target_sale.total_amount then 'settlement' else 'sale_payment' end,
      payment_method, target_occurred_at, payment_amount,
      nullif(trim(target_notes), ''), payment_group, auth.uid()
    ) returning id into target_receipt_id;

    insert into public.nursery_receipt_allocations (
      company_id, receipt_id, sale_id, amount, created_by
    ) values (
      target_sale.company_id, target_receipt_id, target_sale.id, payment_amount, auth.uid()
    );
  end loop;

  return jsonb_build_object(
    'saleId', target_sale.id,
    'paymentGroupId', payment_group,
    'paymentCount', payment_count,
    'paidAmount', current_paid + payment_total,
    'balanceAmount', greatest(target_sale.total_amount - current_paid - payment_total, 0)
  );
end;
$$;

revoke all on function public.record_nursery_split_payment(uuid, date, jsonb, text) from public, anon;
grant execute on function public.record_nursery_split_payment(uuid, date, jsonb, text) to authenticated;
