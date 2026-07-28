-- mira - 54 Weekly notification refresh
-- Ejecutar después de 53_work_schema_contract.sql.
-- Mantiene la cola de Telegram alineada con las asignaciones actuales para
-- enviar únicamente actividades nuevas o modificadas.

create or replace function public.skip_duplicate_pending_notification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending'
    and exists (
      select 1
      from public.notification_outbox queued
      where queued.company_id = new.company_id
        and queued.user_id = new.user_id
        and queued.task_id is not distinct from new.task_id
        and queued.weekly_plan_id is not distinct from new.weekly_plan_id
        and queued.channel = new.channel
        and queued.event_type = new.event_type
        and queued.status = 'pending'
    ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists skip_duplicate_pending_notification on public.notification_outbox;
create trigger skip_duplicate_pending_notification
before insert on public.notification_outbox
for each row execute function public.skip_duplicate_pending_notification();

create or replace function public.sync_published_task_assignment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan_id uuid;
  target_plan_status public.weekly_plan_status;
begin
  if tg_op = 'DELETE' then
    update public.notification_outbox
    set status = 'cancelled',
        last_error = 'assignment_removed'
    where company_id = old.company_id
      and task_id = old.task_id
      and user_id = old.user_id
      and channel = 'telegram'
      and event_type in ('weekly_plan_published', 'task_updated')
      and status = 'pending';

    return old;
  end if;

  select task.weekly_plan_id, plan.status
  into target_plan_id, target_plan_status
  from public.tasks task
  left join public.weekly_plans plan
    on plan.id = task.weekly_plan_id
   and plan.company_id = task.company_id
  where task.id = new.task_id
    and task.company_id = new.company_id;

  if target_plan_id is null or target_plan_status <> 'published' then
    return new;
  end if;

  if not exists (
    select 1
    from public.company_members member
    where member.company_id = new.company_id
      and member.user_id = new.user_id
      and member.role = 'manager'
      and member.status = 'active'
  ) then
    return new;
  end if;

  insert into public.notification_outbox (
    company_id,
    user_id,
    task_id,
    weekly_plan_id,
    channel,
    event_type,
    payload
  )
  values (
    new.company_id,
    new.user_id,
    new.task_id,
    target_plan_id,
    'telegram',
    'task_updated',
    jsonb_build_object('task_id', new.task_id)
  );

  return new;
end;
$$;

drop trigger if exists sync_published_task_assignment_insert on public.task_assignments;
create trigger sync_published_task_assignment_insert
after insert on public.task_assignments
for each row execute function public.sync_published_task_assignment_notification();

drop trigger if exists sync_published_task_assignment_delete on public.task_assignments;
create trigger sync_published_task_assignment_delete
after delete on public.task_assignments
for each row execute function public.sync_published_task_assignment_notification();

revoke all on function public.skip_duplicate_pending_notification() from public, anon, authenticated;
revoke all on function public.sync_published_task_assignment_notification() from public, anon, authenticated;

create index if not exists notification_outbox_pending_plan_task_user_idx
on public.notification_outbox(weekly_plan_id, task_id, user_id)
where status = 'pending' and channel = 'telegram';
