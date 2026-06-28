-- mira - 34 Pest alert follow-up history
-- Ejecutar despues de 33_mira_copilot_memory_chat.sql.
-- Convierte las alertas sanitarias en expedientes con historial de seguimiento.

alter table public.pest_alerts
add column if not exists case_status text not null default 'open';

alter table public.pest_alerts
drop constraint if exists pest_alerts_case_status_check;

alter table public.pest_alerts
add constraint pest_alerts_case_status_check
check (case_status in ('open', 'review_required', 'in_management', 'under_watch', 'sanitary_close'));

do $$ begin
  alter table public.pest_alerts
  add constraint pest_alerts_id_company_unique unique (id, company_id);
exception when duplicate_object then null;
end $$;

create table if not exists public.pest_alert_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pest_alert_id uuid not null,
  greenhouse_id uuid not null,
  update_status text not null default 'review_required',
  severity public.risk_level not null default 'baja',
  action_type text not null default 'review',
  notes text,
  next_review_date date,
  photo_storage_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pest_alert_updates_id_company_unique unique (id, company_id),
  constraint pest_alert_updates_status_check
    check (update_status in ('review_required', 'under_observation', 'treatment_applied', 'under_watch', 'no_progress', 'visible_improvement', 'sanitary_close')),
  constraint pest_alert_updates_action_check
    check (action_type in ('review', 'sanitary_pruning', 'application', 'cleaning', 'zone_isolation', 'other')),
  constraint pest_alert_updates_alert_company_fk
    foreign key (pest_alert_id, company_id)
    references public.pest_alerts(id, company_id)
    on delete cascade,
  constraint pest_alert_updates_greenhouse_company_fk
    foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade
);

alter table public.pest_alert_updates enable row level security;

drop policy if exists "pest_alert_updates_select_scoped" on public.pest_alert_updates;
create policy "pest_alert_updates_select_scoped"
on public.pest_alert_updates for select
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "pest_alert_updates_insert_scoped" on public.pest_alert_updates;
create policy "pest_alert_updates_insert_scoped"
on public.pest_alert_updates for insert
to authenticated
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "pest_alert_updates_update_scoped" on public.pest_alert_updates;
create policy "pest_alert_updates_update_scoped"
on public.pest_alert_updates for update
to authenticated
using (public.can_access_greenhouse(company_id, greenhouse_id))
with check (public.can_access_greenhouse(company_id, greenhouse_id));

drop policy if exists "pest_alert_updates_delete_owner_admin" on public.pest_alert_updates;
create policy "pest_alert_updates_delete_owner_admin"
on public.pest_alert_updates for delete
to authenticated
using (public.can_manage_company(company_id));

drop trigger if exists set_pest_alert_updates_updated_at on public.pest_alert_updates;
create trigger set_pest_alert_updates_updated_at
before update on public.pest_alert_updates
for each row execute function public.set_updated_at();

create index if not exists pest_alert_updates_alert_created_idx
on public.pest_alert_updates(company_id, pest_alert_id, created_at desc);

create index if not exists pest_alert_updates_greenhouse_created_idx
on public.pest_alert_updates(company_id, greenhouse_id, created_at desc);
