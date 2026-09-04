-- Run on a disposable database after the full migration chain. No fixtures persist.
rollback;
begin;

do $$
declare
  company_a uuid := gen_random_uuid();
  company_b uuid := gen_random_uuid();
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  greenhouse uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  product_a uuid := gen_random_uuid();
  product_b uuid := gen_random_uuid();
  product_c uuid := gen_random_uuid();
  foreign_product uuid := gen_random_uuid();
  nutrition_work uuid;
  application_work uuid;
  failed_work uuid;
  material_a uuid;
  omitted_material uuid;
  failed_material uuid;
  item_b uuid;
  item_c uuid;
  result jsonb;
  payload jsonb;
  before_count integer;
  week_start date := date_trunc('week', current_date)::date;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (owner_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', owner_a || '@example.test', '', now(), '{}', '{}', now(), now()),
    (owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', owner_b || '@example.test', '', now(), '{}', '{}', now(), now());
  insert into public.companies (id, name, created_by) values (company_a, 'Execution A', owner_a), (company_b, 'Execution B', owner_b);
  insert into public.greenhouses (id, company_id, name, crop_id) values (greenhouse, company_a, 'Hectarea prueba', null);
  insert into public.company_staff (id, company_id, full_name) values (staff, company_a, 'Encargado de prueba');
  insert into public.products (id, company_id, name, composition) values
    (product_a, company_a, 'AMINOSHOT', 'Composición A'),
    (product_b, company_a, 'SUPRA ENGORDE', 'Composición B'),
    (product_c, company_a, 'Producto omitido', null),
    (foreign_product, company_b, 'AMINOSHOT', null);
  perform set_config('request.jwt.claim.sub', owner_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  nutrition_work := public.create_operational_task_with_staff(
    target_company_id := company_a, target_week_start := week_start, target_greenhouse_id := greenhouse,
    target_type := 'fertirriego', target_title := 'Nutrición de prueba', target_scheduled_date := current_date,
    target_staff_assignee_ids := array[staff],
    target_materials := jsonb_build_array(jsonb_build_object('productId', product_a, 'productName', 'AMINOSHOT', 'dose', '1', 'unit', 'kg'))
  );
  select id into material_a from public.task_materials where task_id = nutrition_work;
  if not exists(select 1 from public.task_materials where id = material_a and product_id = product_a and composition = 'Composición A') then
    raise exception 'Planning discarded the catalog ID or composition';
  end if;

  perform public.update_operational_task_with_staff(
    target_task_id := nutrition_work, target_greenhouse_id := greenhouse, target_type := 'fertirriego',
    target_title := 'Nutrición modificada', target_scheduled_date := current_date, target_staff_assignee_ids := array[staff],
    target_materials := jsonb_build_array(jsonb_build_object('productId', product_b, 'productName', 'SUPRA ENGORDE', 'dose', '5', 'unit', 'lt'))
  );
  if not exists(select 1 from public.task_materials where task_id = nutrition_work and product_id = product_b and composition = 'Composición B') then
    raise exception 'Editing the plan discarded the catalog ID';
  end if;

  -- Recreate the historical name-only row and mix it with a newly added product.
  update public.task_materials set product_id = null, product_name = 'AMINOSHOT', dose = '1', unit = 'kg' where task_id = nutrition_work;
  select id into material_a from public.task_materials where task_id = nutrition_work;
  insert into public.task_materials (company_id, task_id, product_id, product_name, dose, unit)
  values (company_a, nutrition_work, product_c, 'Producto omitido', '4', 'kg') returning id into omitted_material;
  item_b := (public.create_inventory_item(company_a, 'SUPRA ENGORDE', 'lt', 'material', 'agroinsumos', product_b)->>'inventoryItemId')::uuid;
  item_c := (public.create_inventory_item(company_a, 'Producto omitido', 'kg', 'material', 'agroinsumos', product_c)->>'inventoryItemId')::uuid;
  perform public.receive_inventory(company_a, item_b, 20, 10, current_date, 'execution-b-stock');
  perform public.receive_inventory(company_a, item_c, 20, 10, current_date, 'execution-c-stock');
  payload := jsonb_build_array(
    jsonb_build_object('materialId', material_a, 'productId', '', 'productName', 'AMINOSHOT', 'dose', '2', 'unit', 'kg'),
    jsonb_build_object('materialId', 'new:supra', 'productId', product_b, 'productName', 'SUPRA ENGORDE', 'dose', '5', 'unit', 'lt')
  );
  result := public.complete_nutrition_execution(nutrition_work, current_date, 'fertirriego', target_products := payload);
  if jsonb_array_length(result->'recordIds') <> 2 then raise exception 'Wrong nutrition record count'; end if;
  if not exists(select 1 from public.nutrition_records where source_task_id = nutrition_work and product_id = product_a and dose = '2 kg') then
    raise exception 'Legacy product or actual dose was lost';
  end if;
  if not exists(select 1 from public.tasks where id = nutrition_work and status = 'completada' and verification_required and verified_at is null) then
    raise exception 'Changed execution did not remain pending review';
  end if;
  if not exists(select 1 from public.task_updates where task_id = nutrition_work and metadata->>'source' = 'execution_materials'
    and metadata->'previousMaterials' @> jsonb_build_array(jsonb_build_object('id', material_a, 'dose', '1'))) then
    raise exception 'Original planned dose was not retained in the audit';
  end if;
  if (select quantity from public.inventory_balances where inventory_item_id = item_b) <> 15 then raise exception 'Actual inventory consumption is wrong'; end if;
  if (select quantity from public.inventory_balances where inventory_item_id = item_c) <> 20 then raise exception 'An omitted product was consumed'; end if;
  begin
    perform public.complete_nutrition_execution(nutrition_work, current_date, 'fertirriego', target_products := payload);
    raise exception 'A repeated close was accepted';
  exception when others then
    if sqlerrm <> 'invalid_work_transition' then raise; end if;
  end;
  if (select count(*) from public.nutrition_records where source_task_id = nutrition_work) <> 2 then raise exception 'Retry duplicated records'; end if;

  insert into public.tasks (company_id, greenhouse_id, type, title, scheduled_date, created_by)
  values (company_a, greenhouse, 'fertirriego', 'Atomic failure', current_date, owner_a) returning id into failed_work;
  insert into public.task_materials (company_id, task_id, product_id, product_name, dose, unit)
  values (company_a, failed_work, product_a, 'AMINOSHOT', '1', 'kg') returning id into failed_material;
  payload := jsonb_build_array(
    jsonb_build_object('materialId', failed_material, 'productId', product_b, 'productName', 'SUPRA ENGORDE', 'dose', '3', 'unit', 'lt'),
    jsonb_build_object('materialId', 'new:retry', 'productId', product_a, 'productName', 'AMINOSHOT', 'dose', '2', 'unit', 'kg')
  );
  select count(*) into before_count from public.task_updates where task_id = failed_work;
  begin
    perform public.complete_nutrition_execution(failed_work, current_date, 'invalid', target_products := payload);
    raise exception 'Invalid method was accepted';
  exception when others then
    if sqlerrm <> 'invalid_nutrition_method' then raise; end if;
  end;
  if (select count(*) from public.task_materials where task_id = failed_work) <> 1
    or not exists(select 1 from public.task_materials where id = failed_material and product_id = product_a and dose = '1')
    or exists(select 1 from public.tasks where id = failed_work and verification_required)
    or (select count(*) from public.task_updates where task_id = failed_work) <> before_count then
    raise exception 'A failed completion left partial changes';
  end if;

  -- A foreign ID must not fall back to a same-name product belonging to the caller.
  begin
    perform public.sync_work_execution_materials(failed_work, jsonb_build_array(jsonb_build_object(
      'materialId', failed_material, 'productId', foreign_product, 'productName', 'AMINOSHOT', 'dose', '2', 'unit', 'kg')));
    raise exception 'Cross-company product was accepted';
  exception when others then
    if sqlerrm <> 'invalid_material_product' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', owner_b::text, true);
  begin
    perform public.complete_nutrition_execution(failed_work, current_date, 'fertirriego', target_products := payload);
    raise exception 'Foreign operator was accepted';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', owner_a::text, true);

  -- Invalid identifiers do not silently vanish when creating future plans.
  begin
    perform public.create_operational_task_with_staff(target_company_id := company_a, target_week_start := week_start,
      target_greenhouse_id := greenhouse, target_type := 'fertirriego', target_title := 'Invalid catalog',
      target_scheduled_date := current_date, target_staff_assignee_ids := array[staff],
      target_materials := jsonb_build_array(jsonb_build_object('productId', foreign_product, 'productName', 'AMINOSHOT')));
    raise exception 'Planning accepted a foreign product';
  exception when others then
    if sqlerrm <> 'invalid_material_product' then raise; end if;
  end;

  insert into public.tasks (company_id, greenhouse_id, type, title, scheduled_date, created_by)
  values (company_a, greenhouse, 'aplicacion_foliar', 'Application substitution', current_date, owner_a) returning id into application_work;
  insert into public.task_materials (company_id, task_id, product_id, product_name, dose, unit)
  values (company_a, application_work, product_a, 'AMINOSHOT', '1', 'kg') returning id into material_a;
  result := public.complete_application_execution(application_work, current_date, target_applications := jsonb_build_array(
    jsonb_build_object('materialId', material_a, 'productId', product_b, 'productName', 'SUPRA ENGORDE', 'dose', '3', 'unit', 'lt', 'category', 'fertilizante')));
  if not exists(select 1 from public.application_records where source_task_id = application_work and product_id = product_b and dose = '3 lt') then
    raise exception 'Application substitution lost its real product or dose';
  end if;
  if (select quantity from public.inventory_balances where inventory_item_id = item_b) <> 12 then raise exception 'Substituted product consumption is wrong'; end if;

  insert into public.products (company_id, name) values (company_a, 'SUPRA  ENGORDE');
  begin
    perform public.sync_work_execution_materials(failed_work, jsonb_build_array(jsonb_build_object(
      'materialId', failed_material, 'productId', '', 'productName', 'SUPRA ENGORDE', 'dose', '2', 'unit', 'lt')));
    raise exception 'Ambiguous catalog name was accepted';
  exception when others then
    if sqlerrm <> 'ambiguous_material_product' then raise; end if;
  end;
  begin
    perform public.sync_work_execution_materials(failed_work, jsonb_build_array(payload->0, payload->0));
    raise exception 'Duplicate material was accepted';
  exception when others then
    if sqlerrm <> 'duplicate_work_material' then raise; end if;
  end;
  begin
    perform public.sync_work_execution_materials(failed_work, jsonb_build_array(jsonb_build_object(
      'materialId', material_a, 'productId', product_b, 'productName', 'SUPRA ENGORDE', 'dose', '2', 'unit', 'lt')));
    raise exception 'Material belonging to a different work was accepted';
  exception when others then
    if sqlerrm <> 'invalid_work_material' then raise; end if;
  end;
  raise notice 'PASS: planning links, legacy + new products, substitution, omission, inventory, rollback, retry, ambiguity, and tenant isolation';
end;
$$;

-- New endpoints are available to signed-in users, never anonymous users.
do $$
begin
  if has_function_privilege('anon', 'public.complete_nutrition_execution(uuid,date,text,text,text,numeric,numeric,text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.complete_application_execution(uuid,date,text,jsonb)', 'EXECUTE') then
    raise exception 'Anonymous execution permission leaked';
  end if;
  if not has_function_privilege('authenticated', 'public.complete_nutrition_execution(uuid,date,text,text,text,numeric,numeric,text,jsonb)', 'EXECUTE') then
    raise exception 'Authenticated users cannot call the new endpoint';
  end if;
end;
$$;
rollback;
