-- Run after the complete Supabase migration chain as a database owner.
-- Dependency-free regression test for migration 20260728000000.
rollback;
begin;

do $$
declare
  test_company uuid := '71000000-0000-0000-0000-000000000001';
  test_greenhouse uuid := '72000000-0000-0000-0000-000000000001';
  owner_id uuid := '73000000-0000-0000-0000-000000000001';
  direct_work uuid := '74000000-0000-0000-0000-000000000001';
  blocked_work uuid := '74000000-0000-0000-0000-000000000002';
  direct_result jsonb;
  blocked_result jsonb;
begin
  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    owner_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'verification-owner@example.test',
    '',
    now(),
    '{}',
    '{}',
    now(),
    now()
  );

  insert into public.companies (id, name, created_by)
  values (test_company, 'Work verification routing test', owner_id);

  insert into public.greenhouses (id, company_id, name, manager_user_id)
  values (test_greenhouse, test_company, 'Invernadero de prueba', owner_id);

  insert into public.tasks (
    id,
    company_id,
    greenhouse_id,
    type,
    title,
    scheduled_date,
    status,
    responsible_user_id,
    created_by
  )
  values
    (
      direct_work,
      test_company,
      test_greenhouse,
      'mantenimiento',
      'Finalización directa',
      current_date,
      'pendiente',
      owner_id,
      owner_id
    ),
    (
      blocked_work,
      test_company,
      test_greenhouse,
      'mantenimiento',
      'Finalización después de bloqueo',
      current_date,
      'pendiente',
      owner_id,
      owner_id
    );

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  perform public.start_work(direct_work);

  direct_result := public.complete_work(
    direct_work,
    jsonb_build_object('occurredAt', now(), 'note', 'Mantenimiento realizado')
  );

  if direct_result->>'status' <> 'completada' then
    raise exception 'A direct Mira completion should await verification';
  end if;

  if exists (
    select 1 from public.tasks
    where id = direct_work and (verified_at is not null or verified_by is not null)
  ) then
    raise exception 'A direct Mira completion retained verification metadata';
  end if;

  begin
    perform public.verify_work(direct_work);
    raise exception 'The completing user should not verify the same Work';
  exception when others then
    if sqlerrm <> 'work_verification_requires_different_supervisor' then
      raise;
    end if;
  end;

  perform public.block_work(blocked_work, 'Falta una refacción');

  if not (
    select verification_required
    from public.tasks
    where id = blocked_work
  ) then
    raise exception 'A blocked Work did not become verification-required';
  end if;

  perform public.start_work(blocked_work);
  blocked_result := public.complete_work(
    blocked_work,
    jsonb_build_object('occurredAt', now(), 'note', 'Mantenimiento realizado tras el bloqueo')
  );

  if blocked_result->>'status' <> 'completada' then
    raise exception 'A previously blocked Work should await verification';
  end if;

  if not exists (
    select 1
    from public.tasks
    where id = blocked_work
      and status = 'completada'::public.task_status
      and verified_at is null
      and verified_by is null
  ) then
    raise exception 'A previously blocked Work retained automatic verification metadata';
  end if;
end
$$;

rollback;
