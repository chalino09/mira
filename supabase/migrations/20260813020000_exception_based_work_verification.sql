-- Las actividades realizadas conforme al plan quedan completadas sin revisión
-- individual. Solo los cierres con cambios, bloqueos o canales que ya la exigen
-- pasan a la bandeja de revisión.

create or replace function public.require_work_verification(target_work_id uuid)
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
  if target_work.status not in (
    'pendiente'::public.task_status,
    'en_progreso'::public.task_status,
    'bloqueada'::public.task_status
  ) then raise exception 'invalid_work_transition'; end if;

  update public.tasks
  set verification_required = true,
      updated_at = now()
  where id = target_work_id;

  return jsonb_build_object('workId', target_work_id, 'verificationRequired', true);
end;
$$;

revoke all on function public.require_work_verification(uuid) from public, anon;
grant execute on function public.require_work_verification(uuid) to authenticated;
