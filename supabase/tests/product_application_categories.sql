-- Regression: la categoría elegida al confirmar una aplicación queda ligada
-- al producto y se reutiliza en actividades posteriores.
rollback;
begin;

do $$
declare
  test_company uuid := '91000000-0000-0000-0000-000000000001';
  test_greenhouse uuid := '92000000-0000-0000-0000-000000000001';
  owner_id uuid := '93000000-0000-0000-0000-000000000001';
  product_id uuid := '94000000-0000-0000-0000-000000000001';
  application_work uuid := '95000000-0000-0000-0000-000000000001';
  material_id uuid := '96000000-0000-0000-0000-000000000001';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', 'product-category-owner@example.test', '', now(), '{}', '{}', now(), now()
  );
  insert into public.companies (id, name, created_by)
  values (test_company, 'Product category test', owner_id);
  insert into public.greenhouses (id, company_id, name, manager_user_id)
  values (test_greenhouse, test_company, 'Invernadero de prueba', owner_id);
  insert into public.products (id, company_id, name, category, composition)
  values (product_id, test_company, 'Producto bactericida', null, 'Composición de prueba');
  insert into public.tasks (
    id, company_id, greenhouse_id, type, title, scheduled_date, status,
    responsible_user_id, created_by
  ) values (
    application_work, test_company, test_greenhouse, 'aplicacion_foliar',
    'Aplicación vencida categorizada', current_date - 1, 'pendiente', owner_id, owner_id
  );
  insert into public.task_materials (
    id, company_id, task_id, product_id, product_name, composition, dose, unit, mixing_order
  ) values (
    material_id, test_company, application_work, product_id, 'Producto bactericida',
    'Composición de prueba', '2', 'ml', 1
  );

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform public.complete_application_task(
    application_work,
    current_date,
    'Área completa',
    jsonb_build_array(jsonb_build_object(
      'materialId', material_id,
      'productName', 'Producto bactericida',
      'dose', '2 ml',
      'category', 'bactericida',
      'composition', 'Composición de prueba'
    ))
  );

  if not exists (
    select 1 from public.products
    where id = product_id and category = 'bactericida'::public.application_category
  ) then
    raise exception 'The selected category was not saved on the product';
  end if;
  if not exists (
    select 1 from public.application_records
    where source_task_id = application_work and source_task_material_id = material_id
  ) then
    raise exception 'The application record was not saved';
  end if;
end
$$;

rollback;
