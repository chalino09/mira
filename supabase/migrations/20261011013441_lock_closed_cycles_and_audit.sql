-- Closed crop snapshots are immutable; closure corrections remain traceable.
begin;
create schema if not exists cycle_internal;
revoke all on schema cycle_internal from public, anon, authenticated;

create table public.crop_cycle_close_audit (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null,
 greenhouse_id uuid not null,
 crop_cycle_id uuid not null,
 actor_id uuid not null,
 actor_name text not null,
 occurred_at timestamptz not null default clock_timestamp(),
 action text not null check (action in ('closed', 'close_adjusted')),
 reason text,
 previous_end date,
 new_end date,
 confirmed_snapshot jsonb not null,
 foreign key (crop_cycle_id, company_id, greenhouse_id)
  references public.crop_cycles (id, company_id, greenhouse_id),
 check (action <> 'close_adjusted' or length(trim(reason)) between 5 and 1000)
);
create index crop_cycle_close_audit_history_idx
 on public.crop_cycle_close_audit (company_id, greenhouse_id, crop_cycle_id, occurred_at desc, id desc);
alter table public.crop_cycle_close_audit enable row level security;
revoke all on public.crop_cycle_close_audit from public, anon, authenticated;
grant select on public.crop_cycle_close_audit to authenticated;
create policy crop_cycle_close_audit_read on public.crop_cycle_close_audit
 for select to authenticated using (public.can_access_greenhouse(company_id, greenhouse_id));

create function cycle_internal.guard_cycle_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if tg_op = 'DELETE' then
  if old.status <> 'active' then raise exception 'El historial de un ciclo finalizado no se puede eliminar.'; end if;
  return old;
 end if;
 if old.status <> 'active' then
  if (to_jsonb(new) - array['ended_at','updated_at']) is distinct from
     (to_jsonb(old) - array['ended_at','updated_at']) then
   raise exception 'Los datos de un ciclo finalizado no se pueden editar.';
  end if;
  if new.ended_at is distinct from old.ended_at then
   if old.status <> 'closed' or length(trim(coalesce(current_setting('mira.close_adjustment_reason',true),''))) not between 5 and 1000
    or current_setting('mira.adjusted_cycle',true) is distinct from old.id::text then
    raise exception 'Ajusta el cierre con un motivo para conservar la auditoría.';
   end if;
  end if;
 elsif new.status = 'closed' then
  if current_setting('mira.confirmed_cycle',true) is distinct from old.id::text then
   raise exception 'Confirma los datos antes de finalizar el ciclo.';
  end if;
  if (to_jsonb(new) - array['status','ended_at','updated_at']) is distinct from
     (to_jsonb(old) - array['status','ended_at','updated_at']) then
   raise exception 'Revisa los datos del ciclo antes de finalizarlo.';
  end if;
 end if;
 return new;
end $$;
revoke all on function cycle_internal.guard_cycle_history() from public, anon, authenticated;
create trigger crop_cycle_history_guard before update or delete on public.crop_cycles
 for each row execute function cycle_internal.guard_cycle_history();

-- The trigger alone can append audit rows. Clients can only read them.
-- Definer is limited to this private trigger and verifies the authenticated actor.
create function cycle_internal.audit_cycle_close()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_label text;
begin
 if (old.status = 'active' and new.status = 'closed') or
    (old.status = 'closed' and new.ended_at is distinct from old.ended_at) then
  if actor is null or not public.can_manage_company(new.company_id) then
   raise exception 'No tienes permiso para administrar ciclos.';
  end if;
  select coalesce(nullif(trim(full_name),''),id::text) into actor_label from public.profiles where id=actor;
  insert into public.crop_cycle_close_audit
   (company_id,greenhouse_id,crop_cycle_id,actor_id,actor_name,action,reason,previous_end,new_end,confirmed_snapshot)
  values (new.company_id,new.greenhouse_id,new.id,actor,coalesce(actor_label,actor::text),
   case when old.status='active' then 'closed' else 'close_adjusted' end,
   case when old.status='closed' then trim(current_setting('mira.close_adjustment_reason',true)) else null end,
   old.ended_at,new.ended_at,to_jsonb(new));
 end if;
 return new;
end $$;
revoke all on function cycle_internal.audit_cycle_close() from public, anon, authenticated;
create trigger crop_cycle_close_audit after update on public.crop_cycles
 for each row execute function cycle_internal.audit_cycle_close();

drop function public.close_greenhouse_cycle(uuid,date);
create or replace function public.close_greenhouse_cycle(target_cycle_id uuid, target_end date,
 target_confirmed boolean default false, target_expected_updated_at timestamptz default null)
returns void language plpgsql security invoker set search_path = public as $$
declare c public.crop_cycles;
begin
 -- Same lock order as start prevents simultaneous close/start races.
 perform 1 from public.greenhouses where id = (select greenhouse_id from public.crop_cycles where id = target_cycle_id) for update;
 select * into c from public.crop_cycles where id = target_cycle_id for update;
 if c.id is null or not public.can_manage_company(c.company_id) then raise exception 'No tienes permiso para administrar ciclos.'; end if;
 if c.status <> 'active' then raise exception 'El ciclo está finalizado. Usa Ajustar cierre.'; end if;
 if target_confirmed is distinct from true then raise exception 'Confirma los datos antes de finalizar el ciclo.'; end if;
 if target_expected_updated_at is distinct from c.updated_at then raise exception 'Los datos cambiaron. Vuelve a revisar el ciclo antes de finalizarlo.'; end if;
 perform set_config('mira.confirmed_cycle', c.id::text, true);
 if target_end > current_date or target_end < coalesce(c.started_at, c.transplant_date, target_end) then
  raise exception 'La fecha de cierre no es válida.';
 end if;
 if exists (select 1 from public.crop_cycles other where other.greenhouse_id=c.greenhouse_id and other.id<>c.id and other.status<>'cancelled' and coalesce(other.started_at,other.transplant_date)>coalesce(c.started_at,c.transplant_date,'0001-01-01') and coalesce(other.started_at,other.transplant_date)<=target_end) then raise exception 'El cierre debe ser anterior al inicio del siguiente ciclo.'; end if;
 update public.crop_cycles set status = 'closed', ended_at = target_end, updated_at = now() where id = c.id;
 perform set_config('mira.confirmed_cycle', '', true);
end $$;


revoke all on function public.close_greenhouse_cycle(uuid,date,boolean,timestamptz) from public, anon;
grant execute on function public.close_greenhouse_cycle(uuid,date,boolean,timestamptz) to authenticated;

create function public.adjust_greenhouse_cycle_close(target_cycle_id uuid, target_end date,
 target_reason text, target_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path = public as $$
declare c public.crop_cycles;
begin
 perform 1 from public.greenhouses where id=(select greenhouse_id from public.crop_cycles where id=target_cycle_id) for update;
 select * into c from public.crop_cycles where id=target_cycle_id for update;
 if c.id is null or not public.can_manage_company(c.company_id) then raise exception 'No tienes permiso para ajustar este cierre.'; end if;
 if c.status <> 'closed' then raise exception 'Solo se puede ajustar el cierre de un ciclo finalizado.'; end if;
 if target_expected_updated_at is distinct from c.updated_at then raise exception 'El cierre cambió. Vuelve a revisar el ciclo.'; end if;
 if length(trim(coalesce(target_reason,''))) not between 5 and 1000 then raise exception 'Escribe un motivo de entre 5 y 1000 caracteres.'; end if;
 if target_end is not distinct from c.ended_at then raise exception 'Selecciona una fecha de cierre diferente.'; end if;
 if target_end > current_date or target_end < coalesce(c.started_at,c.transplant_date,target_end) then raise exception 'La fecha de cierre no es válida.'; end if;
 if exists (select 1 from public.crop_cycles other where other.greenhouse_id=c.greenhouse_id and other.id<>c.id and other.status<>'cancelled' and coalesce(other.started_at,other.transplant_date)>coalesce(c.started_at,c.transplant_date,'0001-01-01') and coalesce(other.started_at,other.transplant_date)<=target_end) then raise exception 'El cierre debe ser anterior al inicio del siguiente ciclo.'; end if;
 perform set_config('mira.adjusted_cycle',c.id::text,true);
 perform set_config('mira.close_adjustment_reason',trim(target_reason),true);
 update public.crop_cycles set ended_at=target_end,updated_at=clock_timestamp() where id=c.id;
 perform set_config('mira.adjusted_cycle','',true);
 perform set_config('mira.close_adjustment_reason','',true);
end $$;
revoke all on function public.adjust_greenhouse_cycle_close(uuid,date,text,timestamptz) from public, anon;
grant execute on function public.adjust_greenhouse_cycle_close(uuid,date,text,timestamptz) to authenticated;

create or replace function public.update_greenhouse_cycle_details(target_cycle_id uuid, target_crop_id uuid,
 target_variety text, target_start date, target_plants integer, target_stems integer default null,
 target_grafted boolean default null, target_budget numeric default null, target_beds integer default 0,
 target_notes text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare c public.crop_cycles;
begin
 perform 1 from public.greenhouses where id=(select greenhouse_id from public.crop_cycles where id=target_cycle_id) for update;
 select * into c from public.crop_cycles where id=target_cycle_id for update;
 if c.id is null or not public.can_manage_company(c.company_id) then raise exception 'No tienes permiso para editar este ciclo.'; end if;
 if c.status <> 'active' then raise exception 'Los datos de un ciclo finalizado no se pueden editar.'; end if;
 if target_start > current_date or target_start > c.ended_at or target_plants is null or target_plants < 0 or nullif(trim(target_variety),'') is null then raise exception 'Revisa la fecha, variedad y plantas.'; end if;
 if exists (select 1 from public.crop_cycles other where other.greenhouse_id=c.greenhouse_id and other.id<>c.id and other.status<>'cancelled' and other.ended_at>=target_start and coalesce(other.started_at,other.transplant_date)<=target_start) then raise exception 'La fecha coincide con otro ciclo.'; end if;
 update public.crop_cycles set crop_id=target_crop_id, variety=trim(target_variety), started_at=target_start,
 transplant_date=target_start, plants_count=target_plants, stem_count=target_stems,is_grafted=target_grafted,
 budget_amount=target_budget,beds_count=target_beds,notes=target_notes,updated_at=now() where id=c.id;
 if c.status='active' then
  update public.greenhouses set crop_id=target_crop_id,crop_variety=trim(target_variety),
   tomato_variety=case when target_crop_id='7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1' then trim(target_variety) else null end,
   transplant_date=target_start,plants_count=target_plants,stem_count=target_stems,is_grafted=target_grafted,
   budget_amount=target_budget,beds_count=target_beds,updated_at=now() where id=c.greenhouse_id;
 end if;
end $$;
revoke all on function public.update_greenhouse_cycle_details(uuid,uuid,text,date,integer,integer,boolean,numeric,integer,text) from public;
grant execute on function public.update_greenhouse_cycle_details(uuid,uuid,text,date,integer,integer,boolean,numeric,integer,text) to authenticated;


notify pgrst, 'reload schema';
commit;
