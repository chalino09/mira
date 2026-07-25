-- mira - 30 Function grant hardening
-- Ejecutar despues de 28_rls_hardening.sql.
-- Corrige grants explicitos que pueden quedar heredados para anon.
-- No modifica datos ni policies.

do $$
declare
  helper_signature text;
begin
  foreach helper_signature in array array[
    'public.current_user_role(uuid)',
    'public.is_company_member(uuid)',
    'public.can_manage_company(uuid)',
    'public.can_write_company(uuid)',
    'public.shares_company_with(uuid)',
    'public.can_access_greenhouse(uuid, uuid)',
    'public.is_task_assignee(uuid)',
    'public.can_view_operational_task(uuid)',
    'public.storage_object_company_id(text)'
  ]
  loop
    if to_regprocedure(helper_signature) is not null then
      execute format('revoke execute on function %s from public', helper_signature);
      execute format('revoke execute on function %s from anon', helper_signature);
      execute format('grant execute on function %s to authenticated', helper_signature);
    end if;
  end loop;
end $$;

do $$
declare
  private_signature text;
begin
  foreach private_signature in array array[
    'public.handle_new_user()',
    'public.handle_new_company()'
  ]
  loop
    if to_regprocedure(private_signature) is not null then
      execute format('revoke execute on function %s from public', private_signature);
      execute format('revoke execute on function %s from anon', private_signature);
      execute format('revoke execute on function %s from authenticated', private_signature);
    end if;
  end loop;
end $$;
