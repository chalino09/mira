-- Run after the full migration chain as database owner; fixtures are rolled back.
begin;
do $$
declare
  company_id uuid := gen_random_uuid();
  greenhouse_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  work_id uuid := gen_random_uuid();
  record_id uuid;
  sale_id uuid;
  result jsonb;
  saved public.harvest_records%rowtype;
  method text;
  persisted_method text;
  saved_status text;
  saved_net numeric;
  invalid_split jsonb;
  expected_error text;
  revision_count bigint;
  outsider_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'harvest-sizes@example.test', '', now(), '{}', '{}', now(), now());
  insert into public.companies (id, name, created_by) values (company_id, 'Harvest sizes test', owner_id);
  insert into public.greenhouses (id, company_id, name, manager_user_id) values (greenhouse_id, company_id, 'Test greenhouse', owner_id);
  insert into public.tasks (id, company_id, greenhouse_id, type, title, scheduled_date, status, responsible_user_id, created_by)
  values (work_id, company_id, greenhouse_id, 'cosecha', 'Canica y Papel', current_date, 'pendiente', owner_id, owner_id);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  result := public.complete_harvest_task(
    target_task_id => work_id, target_occurred_at => current_date, target_kilograms => 200,
    target_box_count => 10, target_box_weight_kg => 20, target_first_quality_boxes => 2,
    target_first_quality_price => 100, target_canica_boxes => 3, target_canica_price => 40,
    target_papel_boxes => 4, target_papel_price => 20, target_merma_boxes => 1
  );
  record_id := (result->>'recordId')::uuid;
  select * into strict saved from public.harvest_records where id = record_id;
  if saved.canica_boxes <> 3 or saved.papel_boxes <> 4 or saved.canica_kg <> 60 or saved.papel_kg <> 80
    or saved.kilograms <> 200 or abs(saved.estimated_price - 400.0 / 9) > 0.01 then
    raise exception 'New sizes must persist and contribute to kilograms and price per box';
  end if;
  result := public.upsert_harvest_sale_with_payments(
    target_harvest_record_id => record_id, target_buyer_name => 'Cliente de prueba',
    target_occurred_at => current_date, target_commission_per_box => 10,
    target_payments => '[{"method":"cash","amount":80},{"method":"transfer","amount":100}]',
    target_lines => '[{"quality":"Primera","boxCount":2,"grossPricePerBox":100}]'
  );
  sale_id := (result->>'saleId')::uuid;
  if not exists (select 1 from public.harvest_sales where id = sale_id and payment_method = 'cash'
    and payment_split = '[{"method":"cash","amount":80},{"method":"transfer","amount":100}]'::jsonb
    and payment_status = 'pending' and paid_at is null and net_amount = 180) then
    raise exception 'Split must persist on one pending sale with amounts matching net after deductions';
  end if;
  if not exists (select 1 from public.harvest_sale_revisions where harvest_sale_id = sale_id
    and jsonb_array_length(after_values->'sale'->'payment_split') = 2) then
    raise exception 'Split must be audited';
  end if;
  select count(*) into revision_count from public.harvest_sale_revisions where harvest_sale_id = sale_id;
  for invalid_split, expected_error in select * from (values
    ('{}'::jsonb, 'sale_payment_split_invalid'),
    ('[{"method":"cash","amount":180}]'::jsonb, 'sale_payment_split_invalid'),
    ('[{"method":"cash","amount":50},{"method":"cash","amount":130}]'::jsonb, 'sale_payment_method_duplicated'),
    ('[{"method":"invalid","amount":50},{"method":"cash","amount":130}]'::jsonb, 'sale_payment_method_invalid'),
    ('[{"amount":50},{"method":"cash","amount":130}]'::jsonb, 'sale_payment_method_invalid'),
    ('[{"method":"cash","amount":0},{"method":"transfer","amount":180}]'::jsonb, 'sale_payment_amount_invalid'),
    ('[{"method":"cash","amount":-1},{"method":"transfer","amount":181}]'::jsonb, 'sale_payment_amount_invalid'),
    ('[{"method":"cash","amount":80.001},{"method":"transfer","amount":99.999}]'::jsonb, 'sale_payment_amount_invalid'),
    ('[{"method":"cash","amount":"80"},{"method":"transfer","amount":100}]'::jsonb, 'sale_payment_amount_invalid'),
    ('[{"method":"cash"},{"method":"transfer","amount":100}]'::jsonb, 'sale_payment_amount_invalid'),
    ('[{"method":"cash","amount":80},{"method":"transfer","amount":120}]'::jsonb, 'sale_payment_total_mismatch')
  ) as cases(payments, error_code) loop
    begin
      perform public.upsert_harvest_sale_with_payments(
        target_harvest_record_id => record_id, target_sale_id => sale_id,
        target_buyer_name => 'Must roll back', target_occurred_at => current_date,
        target_commission_per_box => 10, target_payments => invalid_split,
        target_lines => '[{"quality":"Primera","boxCount":2,"grossPricePerBox":100}]'
      );
      raise exception 'Expected split validation failure';
    exception when others then
      if sqlerrm <> expected_error then raise; end if;
    end;
  end loop;
  if (select buyer_name from public.harvest_sales where id = sale_id) <> 'Cliente de prueba'
    or (select count(*) from public.harvest_sale_revisions where harvest_sale_id = sale_id) <> revision_count then
    raise exception 'Invalid split must roll back sale and audit changes';
  end if;

  -- Paid status remains explicit; editing the split replaces it on the same note.
  perform public.upsert_harvest_sale_with_payments(
    target_harvest_record_id => record_id, target_sale_id => sale_id,
    target_buyer_name => 'Cliente de prueba', target_occurred_at => current_date,
    target_payment_status => 'paid', target_paid_at => current_date,
    target_payments => '[{"method":"card","amount":100},{"method":"other","amount":100}]',
    target_lines => '[{"quality":"Primera","boxCount":2,"grossPricePerBox":100}]'
  );
  if not exists (select 1 from public.harvest_sales where id = sale_id and payment_status = 'paid'
    and paid_at = current_date and payment_split->0->>'method' = 'card') then
    raise exception 'Editing split and explicitly paid status must persist';
  end if;
  perform public.upsert_harvest_sale_with_payments(
    target_harvest_record_id => record_id, target_sale_id => sale_id,
    target_buyer_name => 'Cliente de prueba', target_occurred_at => current_date, target_payment_method => 'transfer', target_payments => '[]'::jsonb,
    target_lines => '[{"quality":"Primera","boxCount":2,"grossPricePerBox":100}]'
  );
  if not exists (select 1 from public.harvest_sales where id = sale_id and payment_method = 'transfer'
    and payment_split = '[]'::jsonb) then raise exception 'Single-method save must clear split'; end if;

  perform set_config('request.jwt.claim.sub', outsider_id::text, true);
  begin
    perform public.upsert_harvest_sale_with_payments(
      target_harvest_record_id => record_id, target_sale_id => sale_id,
      target_buyer_name => 'Unauthorized', target_occurred_at => current_date,
      target_payments => '[{"method":"cash","amount":100},{"method":"transfer","amount":100}]',
      target_lines => '[{"quality":"Primera","boxCount":2,"grossPricePerBox":100}]'
    );
    raise exception 'Expected other-company rejection';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.upsert_harvest_sale_with_payments(target_harvest_record_id => record_id);
    raise exception 'Expected unauthenticated rejection';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end;
$$;
rollback;
