-- MIRA · Repara dos enlaces de catálogo, sin completar actividades.
-- SA-PROPEL: bioestimulante. Q-VIRUS: mismo producto que Q VIRUS.

do $repair$
declare
  company_id_value uuid;
  matching_companies integer;
  sa_propel_id uuid;
  q_virus_id uuid;
  matching_sa_propel integer;
  matching_q_virus integer;
  updated_materials integer;
begin
  select count(*), (array_agg(company.id order by company.id))[1]
  into matching_companies, company_id_value
  from public.companies company
  where lower(trim(company.name)) = lower('Mercadia Ag');

  if matching_companies <> 1 then
    raise exception 'Se esperaba exactamente una empresa Mercadia Ag; se encontraron %', matching_companies;
  end if;

  select count(*), (array_agg(product.id order by product.created_at, product.id))[1]
  into matching_sa_propel, sa_propel_id
  from public.products product
  where product.company_id = company_id_value
    and regexp_replace(lower(trim(product.name)), '\s+', ' ', 'g') = 'sa-propel';

  if matching_sa_propel > 1 then
    raise exception 'Hay más de un producto SA-PROPEL; no se modificó nada';
  end if;

  if matching_sa_propel = 0 then
    insert into public.products (company_id, name, category, composition)
    values (
      company_id_value,
      'SA-PROPEL',
      'bioestimulante'::public.application_category,
      'Sulfato de potasio (K2SO4) en cadenas de carbono con oxígeno de doble enlace; 1.69% p/v.'
    )
    returning id into sa_propel_id;
  else
    update public.products
    set category = 'bioestimulante'::public.application_category, updated_at = now()
    where id = sa_propel_id and category is null;
  end if;

  select count(*), (array_agg(product.id order by product.created_at, product.id))[1]
  into matching_q_virus, q_virus_id
  from public.products product
  where product.company_id = company_id_value
    and regexp_replace(lower(trim(product.name)), '\s+', ' ', 'g') = 'q virus';

  if matching_q_virus <> 1 then
    raise exception 'Se esperaba un solo producto Q VIRUS; se encontraron %. No se modificó nada', matching_q_virus;
  end if;

  update public.task_materials material
  set product_id = sa_propel_id
  where material.id in (
    select id from public.task_materials
    where task_id = '17bf74d2-4c0d-4b92-b09c-a39e6a8e2892'::uuid
      and regexp_replace(lower(trim(product_name)), '\s+', ' ', 'g') = 'sa-propel'
  )
    and material.company_id = company_id_value
    and material.product_id is null;
  get diagnostics updated_materials = row_count;
  if updated_materials <> 1 then
    raise exception 'Se esperaba reparar un material SA-PROPEL y se repararon %; no se completó ninguna actividad', updated_materials;
  end if;

  update public.task_materials material
  set product_id = q_virus_id
  where material.id in (
    select id from public.task_materials
    where task_id = '363efa54-ed7c-4572-b081-875e610e9cbb'::uuid
      and regexp_replace(lower(trim(product_name)), '\s+', ' ', 'g') = 'q-virus'
  )
    and material.company_id = company_id_value
    and material.product_id is null;
  get diagnostics updated_materials = row_count;
  if updated_materials <> 1 then
    raise exception 'Se esperaba reparar un material Q-VIRUS y se repararon %; no se completó ninguna actividad', updated_materials;
  end if;

  if exists (
    select 1 from public.tasks task
    where task.id in (
      '17bf74d2-4c0d-4b92-b09c-a39e6a8e2892'::uuid,
      '363efa54-ed7c-4572-b081-875e610e9cbb'::uuid
    )
      and task.status <> 'pendiente'::public.task_status
  ) then
    raise exception 'Verificación fallida: una actividad cambió de estado';
  end if;

  raise notice 'ÉXITO: se repararon SA-PROPEL y Q-VIRUS; 0 actividades completadas; 0 aprobaciones; 0 eliminaciones.';
end
$repair$;
