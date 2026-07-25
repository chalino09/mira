-- Run after 53_work_schema_contract.sql as postgres or authenticated.
do $$
declare
  result jsonb;
begin
  result := public.assert_work_schema_ready();
  if (result->>'minimumSchemaVersion')::integer <> 53 then
    raise exception 'Unexpected Work schema version: %', result;
  end if;
end
$$;
