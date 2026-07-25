-- mira - 05 User management
-- Ejecutar después de 01_schema.sql, 02_rls_policies.sql, 03_onboarding_rpc.sql y 04_storage_assets.sql.
-- Agrega invitaciones por correo, aceptación automática y administración de roles/estado.

create or replace function public.invite_company_member(
  target_company_id uuid,
  target_email text,
  requested_role public.member_role default 'manager'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(nullif(trim(target_email), ''));
  invited_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if normalized_email is null or position('@' in normalized_email) = 0 then
    raise exception 'invalid_email';
  end if;

  insert into public.company_members (company_id, invited_email, role, status)
  values (target_company_id, normalized_email, requested_role, 'invited')
  on conflict (company_id, invited_email) do update
    set role = excluded.role,
        status = 'invited',
        updated_at = now()
  returning id into invited_member_id;

  return invited_member_id;
end;
$$;

create or replace function public.accept_company_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  accepted_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select lower(email)
  into current_email
  from auth.users
  where id = current_user_id;

  if current_email is null then
    return 0;
  end if;

  update public.company_members invited
  set user_id = current_user_id,
      invited_email = null,
      status = 'active',
      updated_at = now()
  where lower(invited.invited_email) = current_email
    and invited.user_id is null
    and invited.status = 'invited'
    and not exists (
      select 1
      from public.company_members existing
      where existing.company_id = invited.company_id
        and existing.user_id = current_user_id
    );

  get diagnostics accepted_count = row_count;
  return accepted_count;
end;
$$;

create or replace function public.update_company_member_access(
  target_member_id uuid,
  requested_role public.member_role,
  requested_status public.member_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  old_role public.member_role;
  old_status public.member_status;
  active_owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select company_id, role, status
  into target_company_id, old_role, old_status
  from public.company_members
  where id = target_member_id;

  if target_company_id is null then
    raise exception 'member_not_found';
  end if;

  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if old_role = 'owner'
    and old_status = 'active'
    and (requested_role <> 'owner' or requested_status <> 'active') then
    select count(*)
    into active_owner_count
    from public.company_members
    where company_id = target_company_id
      and role = 'owner'
      and status = 'active';

    if active_owner_count <= 1 then
      raise exception 'last_owner_required';
    end if;
  end if;

  update public.company_members
  set role = requested_role,
      status = requested_status,
      updated_at = now()
  where id = target_member_id;
end;
$$;

revoke all on function public.invite_company_member(uuid, text, public.member_role) from public;
revoke all on function public.accept_company_invites() from public;
revoke all on function public.update_company_member_access(uuid, public.member_role, public.member_status) from public;

grant execute on function public.invite_company_member(uuid, text, public.member_role) to authenticated;
grant execute on function public.accept_company_invites() to authenticated;
grant execute on function public.update_company_member_access(uuid, public.member_role, public.member_status) to authenticated;
