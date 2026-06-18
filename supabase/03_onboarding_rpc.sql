-- mira - 03 Onboarding RPC
-- Ejecutar después de 01_schema.sql y 02_rls_policies.sql.
-- Esta función crea perfil + empresa + membresía owner + primer invernadero.

create or replace function public.create_initial_workspace(
  full_name text,
  company_name text,
  greenhouse_name text,
  greenhouse_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_company_id uuid;
  new_greenhouse_id uuid;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.profiles (id, full_name, email)
  values (
    current_user_id,
    nullif(trim(full_name), ''),
    (select email from auth.users where id = current_user_id)
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        updated_at = now();

  insert into public.companies (name, legal_name, created_by)
  values (
    nullif(trim(company_name), ''),
    nullif(trim(company_name), ''),
    current_user_id
  )
  returning id into new_company_id;

  insert into public.company_members (company_id, user_id, role, status)
  values (new_company_id, current_user_id, 'owner', 'active')
  on conflict (company_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now();

  insert into public.greenhouses (
    company_id,
    name,
    location,
    tomato_variety,
    crop_stage,
    manager_user_id,
    plants_count,
    beds_count,
    health_status
  )
  values (
    new_company_id,
    nullif(trim(greenhouse_name), ''),
    nullif(trim(greenhouse_location), ''),
    'Roma',
    'produccion',
    current_user_id,
    0,
    0,
    'baja'
  )
  returning id into new_greenhouse_id;

  return jsonb_build_object(
    'company_id', new_company_id,
    'greenhouse_id', new_greenhouse_id
  );
end;
$$;

revoke all on function public.create_initial_workspace(text, text, text, text) from public;
grant execute on function public.create_initial_workspace(text, text, text, text) to authenticated;
