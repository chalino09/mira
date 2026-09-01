-- Runs after the full migration chain as the local database owner.
-- Covers nursery cash/credit rules, nullable real quantities, idempotency,
-- overpayment protection, reversals, authorization, and RLS isolation.
rollback;
begin;

do $$
declare
  company_a uuid := '71000000-0000-0000-0000-000000000001';
  company_b uuid := '72000000-0000-0000-0000-000000000001';
  owner_a uuid := '73000000-0000-0000-0000-000000000001';
  owner_b uuid := '74000000-0000-0000-0000-000000000001';
  manager_a uuid := '75000000-0000-0000-0000-000000000001';
  nursery_a uuid := '76000000-0000-0000-0000-000000000001';
  nursery_b uuid := '77000000-0000-0000-0000-000000000001';
  customer_a uuid := '78000000-0000-0000-0000-000000000001';
  customer_b uuid := '79000000-0000-0000-0000-000000000001';
  cash_sale_id uuid;
  credit_sale_id uuid;
  final_receipt_id uuid;
  advance_receipt_id uuid;
  result jsonb;
  balance numeric;
  paid numeric;
  status text;
  record_count integer;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nursery-owner-a@example.test', '', now(), '{}', '{}', now(), now()),
    (owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nursery-owner-b@example.test', '', now(), '{}', '{}', now(), now()),
    (manager_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nursery-manager-a@example.test', '', now(), '{}', '{}', now(), now());

  insert into public.companies (id, name, created_by)
  values (company_a, 'Vivero A', owner_a), (company_b, 'Vivero B', owner_b);
  insert into public.company_members (company_id, user_id, role, status)
  values (company_a, manager_a, 'manager', 'active');

  insert into public.nurseries (id, company_id, name, code, created_by)
  values
    (nursery_a, company_a, 'Vivero principal A', 'principal', owner_a),
    (nursery_b, company_b, 'Vivero principal B', 'principal', owner_b);
  insert into public.nursery_customers (id, company_id, display_name, created_by)
  values
    (customer_a, company_a, 'Cliente A', owner_a),
    (customer_b, company_b, 'Cliente B', owner_b);

  perform set_config('request.jwt.claim.sub', owner_a::text, true);

  result := public.create_nursery_sale(
    nursery_a,
    customer_a,
    current_date,
    'seedling',
    'cash',
    null,
    'Cobro conocido; cantidad real pendiente de confirmar',
    jsonb_build_array(jsonb_build_object(
      'description', 'Plántula Agua Miel doble tallo',
      'quantity', null,
      'unit', null,
      'unitPrice', null,
      'lineTotal', 5000
    )),
    5000,
    'cash',
    'nursery-test-cash-sale',
    'nursery-test-cash-receipt'
  );
  cash_sale_id := (result->>'saleId')::uuid;

  select paid_amount, balance_amount, payment_status
  into paid, balance, status
  from public.nursery_sale_balances where id = cash_sale_id;
  if paid <> 5000 or balance <> 0 or status <> 'paid' then
    raise exception 'Cash sale did not settle correctly: paid %, balance %, status %', paid, balance, status;
  end if;
  if not exists (
    select 1 from public.nursery_sale_lines
    where sale_id = cash_sale_id and quantity is null and unit_price is null and line_total = 5000
  ) then raise exception 'Nursery sale did not preserve nullable real quantity'; end if;

  result := public.create_nursery_sale(
    nursery_a, customer_a, current_date, 'seedling', 'cash', null, null,
    jsonb_build_array(jsonb_build_object(
      'description', 'Plántula Agua Miel doble tallo', 'quantity', null,
      'unit', null, 'unitPrice', null, 'lineTotal', 5000
    )),
    5000, 'cash', 'nursery-test-cash-sale', 'nursery-test-cash-receipt'
  );
  if coalesce((result->>'idempotent')::boolean, false) is not true then
    raise exception 'Repeated sale source reference was not idempotent';
  end if;
  select count(*) into record_count
  from public.nursery_sales where company_id = company_a and source_reference = 'nursery-test-cash-sale';
  if record_count <> 1 then raise exception 'Idempotent sale created duplicates'; end if;

  begin
    perform public.create_nursery_sale(
      nursery_a, customer_a, current_date, 'seedling', 'cash', null, null,
      jsonb_build_array(jsonb_build_object(
        'description', 'Venta incompleta', 'quantity', null,
        'unit', null, 'unitPrice', null, 'lineTotal', 1000
      )),
      900, 'cash', 'nursery-test-invalid-cash-sale', 'nursery-test-invalid-cash-receipt'
    );
    raise exception 'Cash sale accepted an unpaid balance';
  exception when others then
    if sqlerrm <> 'nursery_cash_sale_must_be_paid' then raise; end if;
  end;

  result := public.create_nursery_sale(
    nursery_a,
    customer_a,
    current_date - 10,
    'seedling',
    'credit',
    current_date - 1,
    'Crédito con abono inicial',
    jsonb_build_array(jsonb_build_object(
      'description', '512 plántulas',
      'quantity', 512,
      'unit', 'pieza',
      'unitPrice', 1.953125,
      'lineTotal', 1000
    )),
    200,
    'transfer',
    'nursery-test-credit-sale',
    'nursery-test-credit-initial'
  );
  credit_sale_id := (result->>'saleId')::uuid;

  select paid_amount, balance_amount, payment_status
  into paid, balance, status
  from public.nursery_sale_balances where id = credit_sale_id;
  if paid <> 200 or balance <> 800 or status <> 'overdue' then
    raise exception 'Credit opening balance is wrong: paid %, balance %, status %', paid, balance, status;
  end if;

  perform public.record_nursery_payment(
    credit_sale_id, current_date, 300, 'cash', 'sale_payment',
    'Primer abono', 'nursery-test-credit-payment-1'
  );
  result := public.record_nursery_payment(
    credit_sale_id, current_date, 300, 'cash', 'sale_payment',
    'Primer abono repetido', 'nursery-test-credit-payment-1'
  );
  if coalesce((result->>'idempotent')::boolean, false) is not true then
    raise exception 'Repeated payment source reference was not idempotent';
  end if;
  select count(*) into record_count
  from public.nursery_receipts
  where company_id = company_a and source_reference = 'nursery-test-credit-payment-1';
  if record_count <> 1 then raise exception 'Idempotent payment created duplicates'; end if;

  begin
    perform public.record_nursery_payment(
      credit_sale_id, current_date, 501, 'cash', 'sale_payment',
      'Sobrepago inválido', 'nursery-test-overpayment'
    );
    raise exception 'Nursery accepted a payment above the outstanding balance';
  exception when others then
    if sqlerrm <> 'nursery_sale_overpayment' then raise; end if;
  end;

  result := public.record_nursery_receipt(
    nursery_a, customer_a, current_date, 400, 'transfer', 'advance',
    'Anticipo por aplicar', 'nursery-test-advance'
  );
  advance_receipt_id := (result->>'receiptId')::uuid;
  perform public.allocate_nursery_receipt(advance_receipt_id, credit_sale_id, 400);

  select paid_amount, balance_amount into paid, balance
  from public.nursery_sale_balances where id = credit_sale_id;
  if paid <> 900 or balance <> 100 then
    raise exception 'Advance allocation is wrong: paid %, balance %', paid, balance;
  end if;

  begin
    perform public.allocate_nursery_receipt(advance_receipt_id, credit_sale_id, 1);
    raise exception 'Nursery overallocated a receipt';
  exception when others then
    if sqlerrm <> 'nursery_receipt_overallocated' then raise; end if;
  end;

  result := public.record_nursery_payment(
    credit_sale_id, current_date, 100, 'cash', 'settlement',
    'Liquidación', 'nursery-test-final-payment'
  );
  final_receipt_id := (result->>'receiptId')::uuid;
  select paid_amount, balance_amount, payment_status
  into paid, balance, status
  from public.nursery_sale_balances where id = credit_sale_id;
  if paid <> 1000 or balance <> 0 or status <> 'paid' then
    raise exception 'Credit did not settle correctly: paid %, balance %, status %', paid, balance, status;
  end if;

  perform public.update_nursery_sale(
    credit_sale_id, customer_a, current_date, 'credit', current_date + 30,
    1500, 'Total corregido después de identificar abonos'
  );
  select paid_amount, balance_amount, payment_status
  into paid, balance, status
  from public.nursery_sale_balances where id = credit_sale_id;
  if paid <> 1000 or balance <> 500 or status <> 'partial' then
    raise exception 'Corrected sale did not preserve receipts: paid %, balance %, status %', paid, balance, status;
  end if;

  begin
    perform public.update_nursery_sale(
      credit_sale_id, customer_a, current_date, 'credit', current_date + 30,
      999, null
    );
    raise exception 'Nursery accepted a corrected total below active receipts';
  exception when others then
    if sqlerrm <> 'nursery_sale_total_below_paid' then raise; end if;
  end;

  perform public.void_nursery_receipt(final_receipt_id, 'Captura duplicada de prueba');
  select paid_amount, balance_amount, payment_status
  into paid, balance, status
  from public.nursery_sale_balances where id = credit_sale_id;
  if paid <> 900 or balance <> 600 or status <> 'partial' then
    raise exception 'Voiding a receipt did not restore the balance';
  end if;

  begin
    perform public.cancel_nursery_sale(credit_sale_id, 'Cancelación inválida');
    raise exception 'Nursery cancelled a sale with active receipts';
  exception when others then
    if sqlerrm <> 'nursery_sale_has_active_receipts' then raise; end if;
  end;

  begin
    perform public.create_nursery_sale(
      nursery_b, customer_b, current_date, 'seedling', 'cash', null, null,
      jsonb_build_array(jsonb_build_object(
        'description', 'Cruce de empresa', 'quantity', null,
        'unit', null, 'unitPrice', null, 'lineTotal', 100
      )),
      100, 'cash', 'nursery-test-cross-company', 'nursery-test-cross-company-receipt'
    );
    raise exception 'Owner A wrote a sale into company B';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', manager_a::text, true);
  begin
    perform public.create_nursery_sale(
      nursery_a, customer_a, current_date, 'seedling', 'cash', null, null,
      jsonb_build_array(jsonb_build_object(
        'description', 'Manager sin permiso', 'quantity', null,
        'unit', null, 'unitPrice', null, 'lineTotal', 100
      )),
      100, 'cash', 'nursery-test-manager-sale', 'nursery-test-manager-receipt'
    );
    raise exception 'Manager created a nursery sale';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;

  if has_table_privilege('authenticated', 'public.nursery_sales', 'UPDATE')
    or has_table_privilege('authenticated', 'public.nursery_receipts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.nursery_receipt_allocations', 'INSERT')
  then raise exception 'Financial tables allow direct mutation outside RPCs'; end if;
end
$$;

select set_config('request.jwt.claim.sub', '73000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
begin
  if not exists (
    select 1 from public.nursery_sales
    where company_id = '71000000-0000-0000-0000-000000000001'
  ) then raise exception 'Owner A lost access to its nursery sales'; end if;
  if exists (
    select 1 from public.nurseries
    where company_id = '72000000-0000-0000-0000-000000000001'
  ) then raise exception 'RLS exposed company B nursery to owner A'; end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '75000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.nurseries) then
    raise exception 'Manager can read nursery financial scope';
  end if;
end
$$;

rollback;
