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
  result := public.get_view_operational_aggregates(company_id, greenhouse_id);
  if (result->>'commercialKg')::numeric <> 180 or (result->>'estimatedRevenue')::numeric <> 400
    or (result->>'soldBoxes')::numeric <> 9 then
    raise exception 'Dashboard totals omit Canica or Papel';
  end if;

  -- Corrections persist the new fields and include them in the audit snapshot.
  perform public.update_harvest_record(
    target_harvest_record_id => record_id, target_occurred_at => current_date,
    target_box_count => 10, target_box_weight_kg => 20, target_first_quality_boxes => 2,
    target_first_quality_price => 100, target_canica_boxes => 4, target_canica_price => 40,
    target_papel_boxes => 3, target_papel_price => 20, target_merma_boxes => 1,
    target_change_note => 'Corregir clasificación'
  );
  if not exists (select 1 from public.harvest_record_revisions
    where harvest_record_id = record_id and (before_values->>'canica_boxes')::numeric = 3
      and (after_values->>'canica_boxes')::numeric = 4 and (after_values->>'papel_boxes')::numeric = 3) then
    raise exception 'Correction audit must include both sizes';
  end if;

  begin
    perform public.update_harvest_record(
      target_harvest_record_id => record_id, target_occurred_at => current_date,
      target_box_count => 10, target_canica_boxes => 11, target_change_note => 'Invalid total'
    );
    raise exception 'Expected reconciliation rejection';
  exception when others then
    if sqlerrm <> 'harvest_box_reconciliation_required' then raise; end if;
  end;
  begin
    perform public.update_harvest_record(
      target_harvest_record_id => record_id, target_occurred_at => current_date,
      target_box_count => 10, target_papel_boxes => -1, target_change_note => 'Invalid size'
    );
    raise exception 'Expected negative size rejection';
  exception when others then
    if sqlerrm <> 'harvest_values_invalid' then raise; end if;
  end;

  result := public.upsert_harvest_sale(
    target_harvest_record_id => record_id, target_buyer_name => 'Cliente de prueba',
    target_occurred_at => current_date, target_commission_per_box => 2,
    target_freight_per_box => 3, target_packaging_per_box => 1,
    target_lines => '[{"quality":"Canica","boxCount":4,"grossPricePerBox":40},{"quality":"Papel","boxCount":3,"grossPricePerBox":20}]'
  );
  sale_id := (result->>'saleId')::uuid;
  if (result->>'grossAmount')::numeric <> 220 or (result->>'netAmount')::numeric <> 178 then
    raise exception 'Sale must include both sizes and deductions';
  end if;
  -- Editing the same sale must recognize both sizes as supported lines.
  perform public.upsert_harvest_sale(
    target_harvest_record_id => record_id, target_sale_id => sale_id,
    target_buyer_name => 'Cliente de prueba', target_occurred_at => current_date,
    target_lines => '[{"quality":"Canica","boxCount":4,"grossPricePerBox":40},{"quality":"Papel","boxCount":3,"grossPricePerBox":20}]'
  );
  begin
    perform public.upsert_harvest_sale(
      target_harvest_record_id => record_id, target_sale_id => sale_id,
      target_buyer_name => 'Cliente de prueba', target_occurred_at => current_date,
      target_lines => '[{"quality":"Papel","boxCount":4,"grossPricePerBox":20}]'
    );
    raise exception 'Expected size availability rejection';
  exception when others then
    if sqlerrm <> 'sale_boxes_exceed_harvest' then raise; end if;
  end;
end;
$$;
rollback;
