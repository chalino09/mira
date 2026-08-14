-- Recupera el cierre de actividades vencidas sin eliminar tareas, materiales
-- ni registros históricos. Las actividades pueden registrarse directamente
-- desde pendiente o bloqueada cuando ya fueron realizadas en campo.

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
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then raise exception 'invalid_work_payload'; end if;

  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_operate_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status not in ('pendiente'::public.task_status, 'en_progreso'::public.task_status, 'bloqueada'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;
  if target_work.type in ('riego'::public.task_type, 'fertirriego'::public.task_type,
    'fertilizacion'::public.task_type, 'aplicacion_foliar'::public.task_type,
    'cosecha'::public.task_type) then raise exception 'technical_completion_required'; end if;

  begin
    occurred_at_value := coalesce(nullif(trim(target_payload->>'occurredAt'), '')::timestamptz, now());
  exception when invalid_text_representation then raise exception 'invalid_work_occurred_at';
  end;
  note_value := coalesce(nullif(trim(target_payload->>'note'), ''), 'Actividad registrada desde Mira.');

  update public.tasks
  set status = 'completada', blocked_reason = null, completed_at = now(), occurred_at = occurred_at_value,
      verified_at = null, verified_by = null, updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_work.company_id, target_work.id, auth.uid(), 'completed', note_value,
    jsonb_build_object('source', 'work', 'occurred_at', target_work.occurred_at, 'direct_overdue_recovery', true));

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status,
    'occurredAt', target_work.occurred_at, 'verificationRequired', true);
end;
$$;

-- Los adaptadores técnicos heredados ya guardan el registro y cambian el Work
-- a completada. La versión anterior exigía todavía en_progreso y hacía fallar
-- toda la transacción, por lo que se revertía incluso el registro técnico.
create or replace function public.finish_technical_work(
  target_work_id uuid, target_occurred_at date, target_note text default null,
  target_actor_user_id uuid default auth.uid(), target_source text default 'technical_adapter'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
begin
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if target_occurred_at is null then raise exception 'work_occurred_at_required'; end if;
  if target_work.status not in ('pendiente'::public.task_status, 'en_progreso'::public.task_status,
    'bloqueada'::public.task_status, 'completada'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;

  update public.tasks
  set status = 'completada', blocked_reason = null, completed_at = coalesce(completed_at, now()),
      occurred_at = target_occurred_at::timestamptz, verified_at = null, verified_by = null, updated_at = now()
  where id = target_work_id
  returning * into target_work;

  -- Los escritores técnicos históricos ya crearon el evento "completed".
  -- Solo se agrega uno aquí cuando finish_technical_work se invoca directamente.
  if not exists (
    select 1 from public.task_updates update_row
    where update_row.task_id = target_work_id
      and update_row.update_type = 'completed'::public.task_update_type
  ) then
    insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
    values (target_work.company_id, target_work.id, target_actor_user_id, 'completed', nullif(trim(target_note), ''),
      jsonb_build_object('source', target_source, 'occurred_at', target_work.occurred_at));
  end if;

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'occurredAt', target_work.occurred_at);
end;
$$;

revoke all on function public.complete_work(uuid, jsonb) from public, anon;
grant execute on function public.complete_work(uuid, jsonb) to authenticated;
revoke all on function public.finish_technical_work(uuid, date, text, uuid, text) from public, anon, authenticated;
