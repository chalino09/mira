-- mira - 19 Telegram operational sessions
-- Ejecutar después de 18_assigned_task_greenhouse_visibility.sql.
-- Guarda el estado temporal de conversaciones operativas por Telegram:
-- selección por número, captura mínima y confirmación SI/NO.

create table if not exists public.telegram_operational_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel public.notification_channel not null default 'telegram',
  external_chat_id text not null,
  session_type text not null,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, channel),
  constraint telegram_operational_sessions_type_check
    check (session_type in ('task_selection', 'capture_required', 'confirmation'))
);

alter table public.telegram_operational_sessions enable row level security;

drop policy if exists "telegram_operational_sessions_select_own" on public.telegram_operational_sessions;
create policy "telegram_operational_sessions_select_own"
on public.telegram_operational_sessions for select
to authenticated
using (user_id = auth.uid() or public.can_manage_company(company_id));

drop policy if exists "telegram_operational_sessions_delete_own" on public.telegram_operational_sessions;
create policy "telegram_operational_sessions_delete_own"
on public.telegram_operational_sessions for delete
to authenticated
using (user_id = auth.uid() or public.can_manage_company(company_id));

drop trigger if exists set_telegram_operational_sessions_updated_at on public.telegram_operational_sessions;
create trigger set_telegram_operational_sessions_updated_at
before update on public.telegram_operational_sessions
for each row execute function public.set_updated_at();

create index if not exists telegram_operational_sessions_expiry_idx
on public.telegram_operational_sessions(expires_at);
