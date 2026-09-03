-- Mira - one-time callback credentials for Grok dispatches
-- Replaces the shared Grok callback secret with a different token per dispatch.

alter table public.agent_dispatches
add column if not exists callback_token_hash text;

do $$ begin
  alter table public.agent_dispatches
  add constraint agent_dispatches_callback_token_hash_check
  check (callback_token_hash is null or callback_token_hash ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null;
end $$;

do $$
begin
  if to_regprocedure('public.process_grok_work_callback(uuid,text,text,text,jsonb)') is not null
    and to_regprocedure('public.process_grok_work_callback_internal(uuid,text,text,text,jsonb)') is null then
    alter function public.process_grok_work_callback(uuid, text, text, text, jsonb)
    rename to process_grok_work_callback_internal;
  end if;
end
$$;

revoke all on function public.process_grok_work_callback_internal(uuid, text, text, text, jsonb)
from public, anon, authenticated, service_role;

create or replace function public.process_grok_work_callback(
  target_dispatch_id uuid,
  target_callback_token text,
  target_callback_id text,
  target_status text,
  target_message text default null,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_hash text;
begin
  if auth.role() <> 'service_role' then raise exception 'not_allowed'; end if;

  select callback_token_hash into expected_hash
  from public.agent_dispatches
  where id = target_dispatch_id;

  if expected_hash is null
    or nullif(trim(target_callback_token), '') is null
    or length(target_callback_token) > 160
    or encode(extensions.digest(convert_to(target_callback_token, 'UTF8'), 'sha256'), 'hex') <> expected_hash then
    raise exception 'invalid_agent_callback_token';
  end if;

  return public.process_grok_work_callback_internal(
    target_dispatch_id,
    target_callback_id,
    target_status,
    target_message,
    target_payload
  );
end;
$$;

revoke all on function public.process_grok_work_callback(uuid, text, text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.process_grok_work_callback(uuid, text, text, text, text, jsonb)
to service_role;
