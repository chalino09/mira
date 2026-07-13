-- mira - 40 Work core
-- Evoluciona tasks al concepto de Work sin renombrar la tabla ni alterar
-- todavía los resultados técnicos. Ejecutar después de 39_nutrition_development_objective.sql.

do $$ begin
  create type public.work_origin as enum ('planned', 'unplanned', 'copilot', 'telegram', 'migrated');
exception when duplicate_object then null;
end $$;

alter type public.task_status add value if not exists 'verificada' after 'completada';
alter type public.task_update_type add value if not exists 'verified' after 'completed';
alter type public.task_update_type add value if not exists 'reopened' after 'verified';

alter table public.tasks
add column if not exists origin public.work_origin not null default 'planned',
add column if not exists occurred_at timestamptz,
add column if not exists verification_required boolean not null default false,
add column if not exists verified_at timestamptz,
add column if not exists verified_by uuid references auth.users(id),
add column if not exists reopened_at timestamptz,
add column if not exists reopened_by uuid references auth.users(id),
add column if not exists reopen_reason text;

create index if not exists tasks_company_status_idx
on public.tasks(company_id, status, scheduled_date);

create index if not exists tasks_company_origin_idx
on public.tasks(company_id, origin);

create or replace view public.work_events
with (security_invoker = true)
as
select
  id,
  company_id,
  task_id as work_id,
  actor_user_id,
  update_type,
  note,
  metadata,
  created_at
from public.task_updates;

grant select on public.work_events to authenticated;

create or replace function public.can_operate_work(target_work_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks work
    where work.id = target_work_id
      and (
        public.can_manage_company(work.company_id)
        or work.responsible_user_id = auth.uid()
        or public.is_task_assignee(work.id)
      )
  )
$$;

create or replace function public.can_verify_work(target_work_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks work
    where work.id = target_work_id
      and public.can_manage_company(work.company_id)
  )
$$;

create or replace function public.start_work(target_work_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
begin
  select * into target_work
  from public.tasks
  where id = target_work_id
  for update;

  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_operate_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status not in ('pendiente'::public.task_status, 'bloqueada'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;

  update public.tasks
  set status = 'en_progreso',
      started_at = coalesce(started_at, now()),
      blocked_reason = null,
      updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata)
  values (
    target_work.company_id,
    target_work.id,
    auth.uid(),
    'started',
    jsonb_build_object('source', 'work')
  );

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'startedAt', target_work.started_at);
end;
$$;

create or replace function public.block_work(target_work_id uuid, target_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  reason_value text := nullif(trim(target_reason), '');
begin
  select * into target_work
  from public.tasks
  where id = target_work_id
  for update;

  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_operate_work(target_work_id) then raise exception 'not_allowed'; end if;
  if reason_value is null then raise exception 'blocked_reason_required'; end if;
  if target_work.status not in ('pendiente'::public.task_status, 'en_progreso'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;

  update public.tasks
  set status = 'bloqueada',
      blocked_reason = reason_value,
      updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (
    target_work.company_id,
    target_work.id,
    auth.uid(),
    'blocked',
    reason_value,
    jsonb_build_object('source', 'work')
  );

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'blockedReason', target_work.blocked_reason);
end;
$$;

create or replace function public.complete_work(target_work_id uuid, target_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  occurred_at_value timestamptz;
  note_value text;
  final_status public.task_status;
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'invalid_work_payload';
  end if;

  select * into target_work
  from public.tasks
  where id = target_work_id
  for update;

  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_operate_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status not in ('pendiente'::public.task_status, 'en_progreso'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;
  if target_work.type in (
    'riego'::public.task_type,
    'fertirriego'::public.task_type,
    'fertilizacion'::public.task_type,
    'aplicacion_foliar'::public.task_type,
    'cosecha'::public.task_type
  ) then
    raise exception 'technical_completion_required';
  end if;

  begin
    occurred_at_value := coalesce(nullif(trim(target_payload->>'occurredAt'), '')::timestamptz, now());
  exception when invalid_text_representation then
    raise exception 'invalid_work_occurred_at';
  end;
  note_value := nullif(trim(target_payload->>'note'), '');
  final_status := case when target_work.verification_required then 'completada'::public.task_status else 'verificada'::public.task_status end;

  update public.tasks
  set status = final_status,
      blocked_reason = null,
      started_at = coalesce(started_at, now()),
      completed_at = now(),
      occurred_at = occurred_at_value,
      verified_at = case when final_status = 'verificada'::public.task_status then now() else null end,
      verified_by = case when final_status = 'verificada'::public.task_status then auth.uid() else null end,
      updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (
    target_work.company_id,
    target_work.id,
    auth.uid(),
    'completed',
    note_value,
    jsonb_build_object('source', 'work', 'occurred_at', target_work.occurred_at)
  );

  if final_status = 'verificada'::public.task_status then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, metadata)
    values (
      target_work.company_id,
      target_work.id,
      auth.uid(),
      'verified',
      jsonb_build_object('source', 'work', 'automatic', true)
    );
  end if;

  return jsonb_build_object(
    'workId', target_work.id,
    'status', target_work.status,
    'occurredAt', target_work.occurred_at,
    'verificationRequired', target_work.verification_required
  );
end;
$$;

create or replace function public.verify_work(target_work_id uuid, target_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  note_value text := nullif(trim(target_note), '');
begin
  select * into target_work
  from public.tasks
  where id = target_work_id
  for update;

  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_verify_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status <> 'completada'::public.task_status then raise exception 'invalid_work_transition'; end if;

  update public.tasks
  set status = 'verificada',
      verified_at = now(),
      verified_by = auth.uid(),
      updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (
    target_work.company_id,
    target_work.id,
    auth.uid(),
    'verified',
    note_value,
    jsonb_build_object('source', 'work', 'automatic', false)
  );

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'verifiedAt', target_work.verified_at);
end;
$$;

create or replace function public.reopen_work(target_work_id uuid, target_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  reason_value text := nullif(trim(target_reason), '');
begin
  select * into target_work
  from public.tasks
  where id = target_work_id
  for update;

  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_verify_work(target_work_id) then raise exception 'not_allowed'; end if;
  if reason_value is null then raise exception 'work_reopen_reason_required'; end if;
  if target_work.status not in ('completada'::public.task_status, 'verificada'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;

  update public.tasks
  set status = 'en_progreso',
      blocked_reason = null,
      completed_at = null,
      occurred_at = null,
      verified_at = null,
      verified_by = null,
      reopened_at = now(),
      reopened_by = auth.uid(),
      reopen_reason = reason_value,
      updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (
    target_work.company_id,
    target_work.id,
    auth.uid(),
    'reopened',
    reason_value,
    jsonb_build_object('source', 'work')
  );

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'reopenedAt', target_work.reopened_at);
end;
$$;

create or replace function public.cancel_work(target_work_id uuid, target_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  note_value text := nullif(trim(target_note), '');
begin
  select * into target_work
  from public.tasks
  where id = target_work_id
  for update;

  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_operate_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status in ('completada'::public.task_status, 'verificada'::public.task_status, 'cancelada'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;

  update public.tasks
  set status = 'cancelada',
      blocked_reason = null,
      updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (
    target_work.company_id,
    target_work.id,
    auth.uid(),
    'cancelled',
    note_value,
    jsonb_build_object('source', 'work')
  );

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status);
end;
$$;

create or replace function public.update_operational_task_status(
  target_task_id uuid,
  next_status text,
  update_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_responsible_user_id uuid;
  update_kind public.task_update_type;
begin
  select company_id, responsible_user_id into target_company_id, target_responsible_user_id
  from public.tasks
  where id = target_task_id;

  if target_company_id is null then raise exception 'task_not_found'; end if;
  if not public.can_manage_company(target_company_id)
    and not public.is_task_assignee(target_task_id)
    and target_responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;
  if next_status not in ('bloqueada', 'completada', 'cancelada') then raise exception 'invalid_task_status'; end if;
  if next_status = 'bloqueada' and nullif(trim(update_note), '') is null then raise exception 'blocked_reason_required'; end if;

  update public.tasks
  set status = next_status::public.task_status,
      blocked_reason = case when next_status = 'bloqueada' then nullif(trim(update_note), '') else null end,
      started_at = case when next_status = 'completada' then started_at else null end,
      completed_at = case when next_status = 'completada' then now() else null end,
      occurred_at = case when next_status = 'completada' then coalesce(occurred_at, now()) else occurred_at end,
      updated_at = now()
  where id = target_task_id;

  update_kind := case next_status
    when 'bloqueada' then 'blocked'::public.task_update_type
    when 'completada' then 'completed'::public.task_update_type
    else 'cancelled'::public.task_update_type
  end;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_company_id, target_task_id, auth.uid(), update_kind, nullif(trim(update_note), ''), jsonb_build_object('source', 'legacy'));
end;
$$;

revoke all on function public.can_operate_work(uuid) from public;
revoke all on function public.can_verify_work(uuid) from public;
revoke all on function public.start_work(uuid) from public;
revoke all on function public.block_work(uuid, text) from public;
revoke all on function public.complete_work(uuid, jsonb) from public;
revoke all on function public.verify_work(uuid, text) from public;
revoke all on function public.reopen_work(uuid, text) from public;
revoke all on function public.cancel_work(uuid, text) from public;

grant execute on function public.can_operate_work(uuid) to authenticated;
grant execute on function public.can_verify_work(uuid) to authenticated;
grant execute on function public.start_work(uuid) to authenticated;
grant execute on function public.block_work(uuid, text) to authenticated;
grant execute on function public.complete_work(uuid, jsonb) to authenticated;
grant execute on function public.verify_work(uuid, text) to authenticated;
grant execute on function public.reopen_work(uuid, text) to authenticated;
grant execute on function public.cancel_work(uuid, text) to authenticated;
