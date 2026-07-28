-- Keep one operational Telegram menu per weekly plan and assigned manager.
-- Notification outbox rows remain the audit trail; this table only stores
-- the Telegram message that is safe to refresh in place.
create table if not exists public.telegram_weekly_menus (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null,
  message_id bigint not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, weekly_plan_id, user_id)
);

create index if not exists telegram_weekly_menus_lookup_idx
on public.telegram_weekly_menus(company_id, weekly_plan_id, user_id);

drop trigger if exists set_telegram_weekly_menus_updated_at on public.telegram_weekly_menus;
create trigger set_telegram_weekly_menus_updated_at
before update on public.telegram_weekly_menus
for each row execute function public.set_updated_at();

alter table public.telegram_weekly_menus enable row level security;

drop policy if exists "telegram_weekly_menus_select_operational" on public.telegram_weekly_menus;
create policy "telegram_weekly_menus_select_operational"
on public.telegram_weekly_menus for select
to authenticated
using (user_id = auth.uid() or public.can_manage_company(company_id));
