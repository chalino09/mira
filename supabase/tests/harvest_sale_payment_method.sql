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
  foreach method in array array['cash', 'transfer', 'card', 'other'] loop
    result := public.upsert_harvest_sale_with_payment(
      target_harvest_record_id => record_id, target_sale_id => sale_id,
      target_buyer_name => 'Cliente de prueba', target_occurred_at => current_date,
      target_payment_method => method,
      target_lines => '[{"quality":"Primera","boxCount":2,"grossPricePerBox":100}]'
    );
    sale_id := (result->>'saleId')::uuid;
    select payment_method, payment_status, net_amount into persisted_method, saved_status, saved_net
      from public.harvest_sales where id = sale_id;
    if persisted_method is distinct from method or saved_status <> 'pending' or saved_net <> 200 then
      raise exception 'Payment method must persist without marking paid or changing sale amounts';
    end if;
    if not exists (select 1 from public.harvest_sale_revisions
      where harvest_sale_id = sale_id and after_values->'sale'->>'payment_method' = method) then
      raise exception 'Payment method must appear in the revision audit';
    end if;
  end loop;

  -- Clearing is allowed, including compatibility with callers omitting the field.
  perform public.upsert_harvest_sale_with_payment(
    target_harvest_record_id => record_id, target_sale_id => sale_id,
    target_buyer_name => 'Cliente de prueba', target_occurred_at => current_date,
    target_payment_status => 'paid', target_paid_at => current_date,
    target_lines => '[{"quality":"Primera","boxCount":2,"grossPricePerBox":100}]'
  );
  if not exists (select 1 from public.harvest_sales where id = sale_id
    and payment_method is null and payment_status = 'paid' and paid_at = current_date) then
    raise exception 'Optional method and paid status must remain independent';
  end if;
  begin
    perform public.upsert_harvest_sale_with_payment(target_harvest_record_id => record_id, target_payment_method => 'invalid');
    raise exception 'Expected invalid payment method rejection';
  exception when others then
    if sqlerrm <> 'sale_payment_method_invalid' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.upsert_harvest_sale_with_payment(target_harvest_record_id => record_id, target_payment_method => 'cash');
    raise exception 'Expected unauthenticated call rejection';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;
end;
$$;
rollback;
