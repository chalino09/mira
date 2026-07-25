-- mira - 53 Work schema contract
-- Ejecutar después de 52_p0_authorization_revocation.sql.
-- The app calls this RPC before a Work transition. Do not replace it with a
-- client-side status update: an incomplete schema must fail closed.

create or replace function public.assert_work_schema_ready()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  missing_contract text[];
begin
  select array_agg(required.signature order by required.signature)
  into missing_contract
  from (
    values
      ('public.can_operate_work(uuid)'),
      ('public.start_work(uuid)'),
      ('public.block_work(uuid, text)'),
      ('public.complete_work(uuid, jsonb)'),
      ('public.verify_work(uuid, text)'),
      ('public.reopen_work(uuid, text)')
  ) as required(signature)
  where to_regprocedure(required.signature) is null;

  if missing_contract is not null then
    raise exception 'work_schema_update_required'
      using detail = format('Missing Work database contract: %s', array_to_string(missing_contract, ', ')),
            hint = 'Apply migrations through 53_work_schema_contract.sql before retrying the Work operation.';
  end if;

  return jsonb_build_object(
    'minimumSchemaVersion', 53,
    'currentSchemaVersion', 53,
    'contract', 'work'
  );
end;
$$;

revoke all on function public.assert_work_schema_ready() from public, anon;
grant execute on function public.assert_work_schema_ready() to authenticated;
