-- mira - 20260829000100 profile contact fields
-- Datos personales operativos en el perfil del usuario, sin crear encargados duplicados.

alter table public.profiles
  add column if not exists address text,
  add column if not exists age smallint;

do $$
begin
  alter table public.profiles
    add constraint profiles_age_check check (age is null or (age >= 0 and age <= 120));
exception when duplicate_object then null;
end $$;

create or replace function public.update_company_member_profile(
  target_company_id uuid,
  target_user_id uuid,
  target_phone text default null,
  target_address text default null,
  target_age smallint default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if not public.can_manage_company(target_company_id) then
    raise exception 'not_allowed';
  end if;

  if not exists (
    select 1
    from public.company_members member
    where member.company_id = target_company_id
      and member.user_id = target_user_id
      and member.status = 'active'
  ) then
    raise exception 'member_not_found';
  end if;

  if target_age is not null and (target_age < 0 or target_age > 120) then
    raise exception 'invalid_profile_age';
  end if;

  update public.profiles
  set phone = nullif(trim(target_phone), ''),
      address = nullif(trim(target_address), ''),
      age = target_age,
      updated_at = now()
  where id = target_user_id
  returning * into updated_profile;

  if not found then
    raise exception 'profile_not_found';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.update_company_member_profile(uuid, uuid, text, text, smallint) from public;
revoke all on function public.update_company_member_profile(uuid, uuid, text, text, smallint) from anon;
grant execute on function public.update_company_member_profile(uuid, uuid, text, text, smallint) to authenticated;
