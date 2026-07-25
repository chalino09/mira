-- mira - 32 Owner-only role management
-- Ejecutar despues de 31_operation_completion_result_ids.sql.
-- Evita que admins puedan crear, elevar, degradar o eliminar owners/admins.
-- Los admins solo pueden invitar managers y activar/desactivar managers via RPC.

drop policy if exists "company_members_insert_owner_admin" on public.company_members;
create policy "company_members_insert_owner_admin"
on public.company_members for insert
to authenticated
with check (public.current_user_role(company_id) = 'owner');

drop policy if exists "company_members_update_owner_admin" on public.company_members;
create policy "company_members_update_owner_admin"
on public.company_members for update
to authenticated
using (public.current_user_role(company_id) = 'owner')
with check (public.current_user_role(company_id) = 'owner');

drop policy if exists "company_members_delete_owner_admin" on public.company_members;
create policy "company_members_delete_owner_admin"
on public.company_members for delete
to authenticated
using (public.current_user_role(company_id) = 'owner');

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
  actor_role public.member_role;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  requested_role := coalesce(requested_role, 'manager'::public.member_role);

  select public.current_user_role(target_company_id) into actor_role;

  if actor_role not in ('owner', 'admin') then
    raise exception 'not_allowed';
  end if;

  if actor_role <> 'owner' and requested_role <> 'manager' then
    raise exception 'owner_required';
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
  actor_role public.member_role;
  old_role public.member_role;
  old_status public.member_status;
  active_owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if requested_role is null or requested_status is null then
    raise exception 'invalid_member_access';
  end if;

  select company_id, role, status
  into target_company_id, old_role, old_status
  from public.company_members
  where id = target_member_id;

  if target_company_id is null then
    raise exception 'member_not_found';
  end if;

  select public.current_user_role(target_company_id) into actor_role;

  if actor_role not in ('owner', 'admin') then
    raise exception 'not_allowed';
  end if;

  if actor_role <> 'owner'
    and (old_role <> 'manager' or requested_role <> 'manager') then
    raise exception 'owner_required';
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
revoke all on function public.invite_company_member(uuid, text, public.member_role) from anon;
revoke all on function public.update_company_member_access(uuid, public.member_role, public.member_status) from public;
revoke all on function public.update_company_member_access(uuid, public.member_role, public.member_status) from anon;

grant execute on function public.invite_company_member(uuid, text, public.member_role) to authenticated;
grant execute on function public.update_company_member_access(uuid, public.member_role, public.member_status) to authenticated;
