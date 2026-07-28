-- Route reported exceptions through the existing Work verification state.
-- Telegram completions set verification_required before invoking their existing
-- RPC; this trigger makes the same rule durable for every blocking channel.

create or replace function public.require_verification_after_work_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tasks
  set verification_required = true,
      updated_at = now()
  where id = new.task_id
    and company_id = new.company_id
    and verification_required = false;

  return new;
end;
$$;

revoke all on function public.require_verification_after_work_block() from public, anon, authenticated;

drop trigger if exists task_updates_require_verification_after_block on public.task_updates;
create trigger task_updates_require_verification_after_block
after insert on public.task_updates
for each row
when (new.update_type = 'blocked'::public.task_update_type)
execute function public.require_verification_after_work_block();

-- Preserve the rule for Work that had already been blocked before this migration.
update public.tasks work
set verification_required = true,
    updated_at = now()
where verification_required = false
  and exists (
    select 1
    from public.task_updates event
    where event.task_id = work.id
      and event.company_id = work.company_id
      and event.update_type = 'blocked'::public.task_update_type
  );
