-- mira - 03 Seed template
-- Ejecutar después de crear usuarios en Supabase Auth.
-- Cambia los UUID por los IDs reales de auth.users.

-- 1. Ve a Supabase > Authentication > Users.
-- 2. Copia el UUID de tu papá/mamá/encargado.
-- 3. Reemplaza los valores de abajo.

do $$
declare
  owner_user_id uuid := 'REEMPLAZA-CON-UUID-OWNER'::uuid;
  admin_user_id uuid := null; -- ejemplo: 'REEMPLAZA-CON-UUID-ADMIN'::uuid;
  manager_user_id uuid := null; -- ejemplo: 'REEMPLAZA-CON-UUID-MANAGER'::uuid;
  company_id uuid;
  greenhouse_id uuid;
begin
  insert into public.companies (name, legal_name, created_by)
  values ('Invernaderos Familia', 'Invernaderos Familia', owner_user_id)
  returning id into company_id;

  insert into public.company_members (company_id, user_id, role, status)
  values (company_id, owner_user_id, 'owner', 'active')
  on conflict (company_id, user_id) do nothing;

  if admin_user_id is not null then
    insert into public.company_members (company_id, user_id, role, status)
    values (company_id, admin_user_id, 'admin', 'active');
  end if;

  if manager_user_id is not null then
    insert into public.company_members (company_id, user_id, role, status)
    values (company_id, manager_user_id, 'manager', 'active');
  end if;

  insert into public.greenhouses (
    company_id,
    name,
    location,
    surface_m2,
    tomato_variety,
    transplant_date,
    plants_count,
    beds_count,
    crop_stage,
    manager_user_id,
    health_status
  )
  values (
    company_id,
    'Casa 1',
    'Acatzingo, Puebla',
    5000,
    'Roma',
    '2026-01-18',
    12500,
    36,
    'produccion',
    manager_user_id,
    'media'
  )
  returning id into greenhouse_id;

  insert into public.greenhouse_sectors (company_id, greenhouse_id, name, sector_type, order_index)
  select company_id, greenhouse_id, 'Cama ' || n, 'cama', n
  from generate_series(1, 36) as n;

  insert into public.tasks (
    company_id,
    greenhouse_id,
    type,
    title,
    scheduled_date,
    scheduled_time,
    status,
    responsible_user_id,
    created_by,
    notes
  )
  values
    (company_id, greenhouse_id, 'riego', 'Riego sector norte', '2026-06-18', '08:30', 'pendiente', manager_user_id, owner_user_id, null),
    (company_id, greenhouse_id, 'revision_plagas', 'Monitoreo de mosquita blanca', '2026-06-18', '10:00', 'en_progreso', manager_user_id, owner_user_id, null),
    (company_id, greenhouse_id, 'cosecha', 'Corte primera calidad', '2026-06-18', '12:30', 'pendiente', manager_user_id, owner_user_id, null);

  insert into public.irrigation_records (
    company_id,
    greenhouse_id,
    occurred_at,
    duration_min,
    estimated_liters,
    ph,
    ec,
    notes,
    responsible_user_id,
    created_by
  )
  values
    (company_id, greenhouse_id, '2026-06-17', 38, 6400, 5.9, 2.3, 'Pulso matutino estable', manager_user_id, owner_user_id),
    (company_id, greenhouse_id, '2026-06-16', 42, 6900, 6.1, 2.4, 'Se ajustó drenaje', manager_user_id, owner_user_id);

  insert into public.application_records (
    company_id,
    greenhouse_id,
    category,
    product_name,
    composition,
    dose,
    applied_area,
    safety_interval,
    reentry_interval,
    occurred_at,
    notes,
    responsible_user_id,
    created_by
  )
  values
    (company_id, greenhouse_id, 'fungicida', 'Azoxistrobin', 'Azoxistrobin 250 g/L', '0.6 L / ha', 'Casa 1 completa', '3 días', '12 horas', '2026-06-14', 'Preventivo contra cenicilla', manager_user_id, owner_user_id);

  insert into public.pest_alerts (
    company_id,
    greenhouse_id,
    problem,
    severity,
    affected_zone,
    detected_at,
    action_taken,
    follow_up,
    responsible_user_id,
    created_by
  )
  values
    (company_id, greenhouse_id, 'Mosquita blanca', 'media', 'Camas 18-22', '2026-06-16', 'Trampas cromáticas y monitoreo focal', 'Revisar población en 48 h', manager_user_id, owner_user_id);

  insert into public.harvest_records (
    company_id,
    greenhouse_id,
    occurred_at,
    kilograms,
    first_quality_kg,
    second_quality_kg,
    discard_kg,
    estimated_price,
    destination,
    notes,
    responsible_user_id,
    created_by
  )
  values
    (company_id, greenhouse_id, '2026-06-17', 920, 710, 160, 50, 16.40, 'Central de Abasto Puebla', 'Buena firmeza', manager_user_id, owner_user_id);

  insert into public.cost_records (
    company_id,
    greenhouse_id,
    category,
    amount,
    occurred_at,
    notes,
    created_by
  )
  values
    (company_id, greenhouse_id, 'fertilizantes', 18500, '2026-06-15', 'Solución nutritiva semana 24', owner_user_id),
    (company_id, greenhouse_id, 'mano_obra', 12600, '2026-06-12', 'Poda, deshoje y cosecha', owner_user_id);
end $$;
