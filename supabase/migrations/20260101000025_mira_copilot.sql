-- mira - 25 Mira Copilot
-- Ejecutar después de 24_weather_snapshots.sql.
-- Capa de auditoría y borradores para Mira Copilot. V1 recomienda y prepara
-- acciones; no ejecuta cambios críticos sin aprobación humana.

create table if not exists public.copilot_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid references public.greenhouses(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  run_type text not null default 'daily_pulse',
  model text,
  status text not null default 'completed',
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  constraint copilot_runs_type_check
    check (run_type in ('daily_pulse', 'technical_review', 'weekly_plan', 'telegram_parse', 'manual')),
  constraint copilot_runs_status_check
    check (status in ('pending', 'completed', 'failed'))
);

create table if not exists public.copilot_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid references public.greenhouses(id) on delete cascade,
  run_id uuid references public.copilot_runs(id) on delete set null,
  source_type text not null default 'operation',
  source_id uuid,
  title text not null,
  detail text not null,
  severity text not null default 'medium',
  recommended_action text,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copilot_insights_source_type_check
    check (source_type in ('operation', 'weather', 'nutrition', 'lab', 'costs', 'report', 'telegram')),
  constraint copilot_insights_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint copilot_insights_status_check
    check (status in ('new', 'reviewed', 'dismissed', 'resolved'))
);

create table if not exists public.copilot_task_suggestions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid not null,
  insight_id uuid references public.copilot_insights(id) on delete set null,
  suggested_type public.task_type not null default 'otro',
  suggested_title text not null,
  suggested_date date,
  suggested_time time,
  suggested_priority public.task_priority not null default 'normal',
  suggested_instructions text,
  suggested_technical_plan jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  approved_by uuid references auth.users(id) on delete set null,
  approved_task_id uuid references public.tasks(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete cascade,
  constraint copilot_task_suggestions_status_check
    check (status in ('draft', 'approved', 'dismissed'))
);

create table if not exists public.copilot_manager_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid references public.greenhouses(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  insight_id uuid references public.copilot_insights(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  channel public.notification_channel not null default 'telegram',
  message_body text not null,
  status text not null default 'draft',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copilot_manager_messages_status_check
    check (status in ('draft', 'approved', 'sent', 'dismissed'))
);

alter table public.copilot_runs enable row level security;
alter table public.copilot_insights enable row level security;
alter table public.copilot_task_suggestions enable row level security;
alter table public.copilot_manager_messages enable row level security;

drop policy if exists "copilot_runs_managerial" on public.copilot_runs;
create policy "copilot_runs_managerial"
on public.copilot_runs for all
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_insights_managerial" on public.copilot_insights;
create policy "copilot_insights_managerial"
on public.copilot_insights for all
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_task_suggestions_managerial" on public.copilot_task_suggestions;
create policy "copilot_task_suggestions_managerial"
on public.copilot_task_suggestions for all
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_manager_messages_managerial" on public.copilot_manager_messages;
create policy "copilot_manager_messages_managerial"
on public.copilot_manager_messages for all
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop trigger if exists set_copilot_insights_updated_at on public.copilot_insights;
create trigger set_copilot_insights_updated_at
before update on public.copilot_insights
for each row execute function public.set_updated_at();

drop trigger if exists set_copilot_task_suggestions_updated_at on public.copilot_task_suggestions;
create trigger set_copilot_task_suggestions_updated_at
before update on public.copilot_task_suggestions
for each row execute function public.set_updated_at();

drop trigger if exists set_copilot_manager_messages_updated_at on public.copilot_manager_messages;
create trigger set_copilot_manager_messages_updated_at
before update on public.copilot_manager_messages
for each row execute function public.set_updated_at();

create index if not exists copilot_insights_company_status_idx
on public.copilot_insights(company_id, status, created_at desc);

create index if not exists copilot_task_suggestions_company_status_idx
on public.copilot_task_suggestions(company_id, status, created_at desc);

create index if not exists copilot_manager_messages_company_status_idx
on public.copilot_manager_messages(company_id, status, created_at desc);
