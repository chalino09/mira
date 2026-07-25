-- mira - 10 Simplified task flow
-- Ejecutar después de 09_manager_experience.sql.
-- Elimina el paso manual "En progreso": la actividad queda pendiente hasta completarse o bloquearse.

update public.tasks
set status = 'pendiente',
    started_at = null,
    updated_at = now()
where status = 'en_progreso';

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

  if target_company_id is null then
    raise exception 'task_not_found';
  end if;

  if not public.can_manage_company(target_company_id)
    and not public.is_task_assignee(target_task_id)
    and target_responsible_user_id is distinct from auth.uid() then
    raise exception 'not_allowed';
  end if;

  if next_status not in ('bloqueada', 'completada', 'cancelada') then
    raise exception 'invalid_task_status';
  end if;

  if next_status = 'bloqueada' and nullif(trim(update_note), '') is null then
    raise exception 'blocked_reason_required';
  end if;

  update public.tasks
  set status = next_status::public.task_status,
      blocked_reason = case when next_status = 'bloqueada' then nullif(trim(update_note), '') else null end,
      started_at = null,
      completed_at = case when next_status = 'completada' then now() else null end
  where id = target_task_id;

  update_kind := case next_status
    when 'bloqueada' then 'blocked'::public.task_update_type
    when 'completada' then 'completed'::public.task_update_type
    else 'cancelled'::public.task_update_type
  end;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note)
  values (target_company_id, target_task_id, auth.uid(), update_kind, nullif(trim(update_note), ''));
end;
$$;

revoke all on function public.update_operational_task_status(uuid, text, text) from public;
grant execute on function public.update_operational_task_status(uuid, text, text) to authenticated;
