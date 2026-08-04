-- mira - 54 Separación obligatoria entre ejecución y verificación
-- Ejecutar manualmente después de 53_work_schema_contract.sql.
-- La migración equivalente para instalaciones nuevas está en
-- migrations/20260803000000_p0_work_completion_separation.sql.

create or replace function public.prevent_automatic_work_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'completada'::public.task_status and new.status = 'verificada'::public.task_status then
    new.status := 'completada'::public.task_status;
    new.verified_at := null;
    new.verified_by := null;
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_automatic_work_verification() from public, anon, authenticated;
drop trigger if exists tasks_prevent_automatic_verification on public.tasks;
create trigger tasks_prevent_automatic_verification before update of status on public.tasks
for each row execute function public.prevent_automatic_work_verification();

create or replace function public.skip_automatic_work_verification_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.update_type = 'verified'::public.task_update_type
    and coalesce((new.metadata ->> 'automatic')::boolean, false) then return null; end if;
  return new;
end;
$$;
revoke all on function public.skip_automatic_work_verification_event() from public, anon, authenticated;
drop trigger if exists task_updates_skip_automatic_verification on public.task_updates;
create trigger task_updates_skip_automatic_verification before insert on public.task_updates
for each row execute function public.skip_automatic_work_verification_event();

create or replace function public.complete_work(target_work_id uuid, target_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target_work public.tasks%rowtype; occurred_at_value timestamptz; note_value text;
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then raise exception 'invalid_work_payload'; end if;
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_operate_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status <> 'en_progreso'::public.task_status then raise exception 'invalid_work_transition'; end if;
  if target_work.type in ('riego'::public.task_type, 'fertirriego'::public.task_type, 'fertilizacion'::public.task_type, 'aplicacion_foliar'::public.task_type, 'cosecha'::public.task_type) then raise exception 'technical_completion_required'; end if;
  begin occurred_at_value := coalesce(nullif(trim(target_payload->>'occurredAt'), '')::timestamptz, now());
  exception when invalid_text_representation then raise exception 'invalid_work_occurred_at'; end;
  note_value := nullif(trim(target_payload->>'note'), '');
  if note_value is null then raise exception 'work_completion_note_required'; end if;
  update public.tasks set status = 'completada', blocked_reason = null, completed_at = now(), occurred_at = occurred_at_value,
    verified_at = null, verified_by = null, updated_at = now() where id = target_work_id returning * into target_work;
  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_work.company_id, target_work.id, auth.uid(), 'completed', note_value, jsonb_build_object('source', 'work', 'occurred_at', target_work.occurred_at));
  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'occurredAt', target_work.occurred_at, 'verificationRequired', true);
end;
$$;

create or replace function public.finish_technical_work(
  target_work_id uuid, target_occurred_at date, target_note text default null,
  target_actor_user_id uuid default auth.uid(), target_source text default 'technical_adapter'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare target_work public.tasks%rowtype;
begin
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if target_occurred_at is null then raise exception 'work_occurred_at_required'; end if;
  if target_work.status <> 'en_progreso'::public.task_status then raise exception 'invalid_work_transition'; end if;
  update public.tasks set status = 'completada', blocked_reason = null, completed_at = coalesce(completed_at, now()),
    occurred_at = target_occurred_at::timestamptz, verified_at = null, verified_by = null, updated_at = now()
  where id = target_work_id returning * into target_work;
  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_work.company_id, target_work.id, target_actor_user_id, 'completed', nullif(trim(target_note), ''),
    jsonb_build_object('source', target_source, 'occurred_at', target_work.occurred_at));
  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'occurredAt', target_work.occurred_at);
end;
$$;

create or replace function public.verify_work(target_work_id uuid, target_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target_work public.tasks%rowtype; note_value text := nullif(trim(target_note), ''); completed_by uuid;
begin
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_verify_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status <> 'completada'::public.task_status then raise exception 'invalid_work_transition'; end if;
  select actor_user_id into completed_by from public.task_updates
  where task_id = target_work_id and update_type = 'completed'::public.task_update_type order by created_at desc limit 1;
  if completed_by is null then raise exception 'work_completion_audit_missing'; end if;
  if completed_by = auth.uid() then raise exception 'work_verification_requires_different_supervisor'; end if;
  update public.tasks set status = 'verificada', verified_at = now(), verified_by = auth.uid(), updated_at = now()
  where id = target_work_id returning * into target_work;
  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_work.company_id, target_work.id, auth.uid(), 'verified', note_value, jsonb_build_object('source', 'work', 'automatic', false));
  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'verifiedAt', target_work.verified_at);
end;
$$;

create or replace function public.undo_work_completion(target_work_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare target_work public.tasks%rowtype; completion_event public.task_updates%rowtype;
begin
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if target_work.type in ('riego'::public.task_type, 'fertirriego'::public.task_type, 'fertilizacion'::public.task_type, 'aplicacion_foliar'::public.task_type, 'cosecha'::public.task_type) then raise exception 'technical_work_requires_reopen'; end if;
  if target_work.status <> 'completada'::public.task_status then raise exception 'invalid_work_transition'; end if;
  select * into completion_event from public.task_updates
  where task_id = target_work_id and update_type = 'completed'::public.task_update_type order by created_at desc limit 1;
  if completion_event.actor_user_id <> auth.uid() or completion_event.created_at < now() - interval '30 seconds' then raise exception 'work_completion_undo_expired'; end if;
  update public.tasks set status = 'en_progreso', completed_at = null, occurred_at = null, verified_at = null, verified_by = null, updated_at = now()
  where id = target_work_id returning * into target_work;
  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_work.company_id, target_work.id, auth.uid(), 'reopened', 'Se deshizo la finalización.', jsonb_build_object('source', 'work', 'undo', true));
  return jsonb_build_object('workId', target_work.id, 'status', target_work.status);
end;
$$;
revoke all on function public.undo_work_completion(uuid) from public, anon;
grant execute on function public.undo_work_completion(uuid) to authenticated;
