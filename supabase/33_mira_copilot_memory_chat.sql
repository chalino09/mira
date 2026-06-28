-- mira - 33 Mira Copilot memory and chat
-- Ejecutar despues de 32_owner_only_role_management.sql.
-- Capa aditiva: conversaciones, mensajes, memoria operativa y decisiones.

create table if not exists public.copilot_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid,
  requested_by uuid references auth.users(id) on delete set null,
  title text not null default 'Conversacion con Mira',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  constraint copilot_conversations_status_check
    check (status in ('active', 'archived')),
  constraint copilot_conversations_greenhouse_company_fk
    foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete set null (greenhouse_id)
);

create table if not exists public.copilot_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null,
  role text not null,
  content text not null,
  evidence jsonb not null default '[]'::jsonb,
  suggested_actions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  constraint copilot_messages_role_check
    check (role in ('user', 'assistant', 'system')),
  constraint copilot_messages_conversation_company_fk
    foreign key (conversation_id, company_id)
    references public.copilot_conversations(id, company_id)
    on delete cascade
);

create table if not exists public.copilot_memory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  greenhouse_id uuid,
  module text not null default 'operation',
  entity_type text,
  entity_id uuid,
  memory_type text not null,
  summary text not null,
  evidence jsonb not null default '[]'::jsonb,
  confidence numeric(4,3) not null default 0.5,
  last_seen_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  constraint copilot_memory_type_check
    check (memory_type in ('pattern', 'preference', 'risk', 'decision', 'note')),
  constraint copilot_memory_module_check
    check (module in ('operation', 'weather', 'nutrition', 'lab', 'costs', 'production', 'telegram', 'report')),
  constraint copilot_memory_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint copilot_memory_greenhouse_company_fk
    foreign key (greenhouse_id, company_id)
    references public.greenhouses(id, company_id)
    on delete set null (greenhouse_id)
);

create table if not exists public.copilot_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid,
  message_id uuid,
  insight_id uuid,
  decision_type text not null,
  proposed_action jsonb not null default '{}'::jsonb,
  status text not null default 'proposed',
  outcome text,
  approved_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  constraint copilot_decisions_type_check
    check (decision_type in ('message', 'task', 'review', 'dismissal')),
  constraint copilot_decisions_status_check
    check (status in ('proposed', 'approved', 'rejected', 'executed', 'dismissed')),
  constraint copilot_decisions_conversation_company_fk
    foreign key (conversation_id, company_id)
    references public.copilot_conversations(id, company_id)
    on delete set null (conversation_id),
  constraint copilot_decisions_message_company_fk
    foreign key (message_id, company_id)
    references public.copilot_messages(id, company_id)
    on delete set null (message_id),
  constraint copilot_decisions_insight_company_fk
    foreign key (insight_id, company_id)
    references public.copilot_insights(id, company_id)
    on delete set null (insight_id)
);

alter table public.copilot_conversations enable row level security;
alter table public.copilot_messages enable row level security;
alter table public.copilot_memory enable row level security;
alter table public.copilot_decisions enable row level security;

drop policy if exists "copilot_conversations_select_managerial" on public.copilot_conversations;
create policy "copilot_conversations_select_managerial"
on public.copilot_conversations for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_conversations_insert_managerial" on public.copilot_conversations;
create policy "copilot_conversations_insert_managerial"
on public.copilot_conversations for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_conversations_update_managerial" on public.copilot_conversations;
create policy "copilot_conversations_update_managerial"
on public.copilot_conversations for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_conversations_delete_managerial" on public.copilot_conversations;
create policy "copilot_conversations_delete_managerial"
on public.copilot_conversations for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_messages_select_managerial" on public.copilot_messages;
create policy "copilot_messages_select_managerial"
on public.copilot_messages for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_messages_insert_managerial" on public.copilot_messages;
create policy "copilot_messages_insert_managerial"
on public.copilot_messages for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_messages_update_managerial" on public.copilot_messages;
create policy "copilot_messages_update_managerial"
on public.copilot_messages for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_messages_delete_managerial" on public.copilot_messages;
create policy "copilot_messages_delete_managerial"
on public.copilot_messages for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_memory_select_managerial" on public.copilot_memory;
create policy "copilot_memory_select_managerial"
on public.copilot_memory for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_memory_insert_managerial" on public.copilot_memory;
create policy "copilot_memory_insert_managerial"
on public.copilot_memory for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_memory_update_managerial" on public.copilot_memory;
create policy "copilot_memory_update_managerial"
on public.copilot_memory for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_memory_delete_managerial" on public.copilot_memory;
create policy "copilot_memory_delete_managerial"
on public.copilot_memory for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_decisions_select_managerial" on public.copilot_decisions;
create policy "copilot_decisions_select_managerial"
on public.copilot_decisions for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_decisions_insert_managerial" on public.copilot_decisions;
create policy "copilot_decisions_insert_managerial"
on public.copilot_decisions for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_decisions_update_managerial" on public.copilot_decisions;
create policy "copilot_decisions_update_managerial"
on public.copilot_decisions for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_decisions_delete_managerial" on public.copilot_decisions;
create policy "copilot_decisions_delete_managerial"
on public.copilot_decisions for delete
to authenticated
using (public.can_manage_company(company_id));

drop trigger if exists set_copilot_conversations_updated_at on public.copilot_conversations;
create trigger set_copilot_conversations_updated_at
before update on public.copilot_conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_copilot_memory_updated_at on public.copilot_memory;
create trigger set_copilot_memory_updated_at
before update on public.copilot_memory
for each row execute function public.set_updated_at();

drop trigger if exists set_copilot_decisions_updated_at on public.copilot_decisions;
create trigger set_copilot_decisions_updated_at
before update on public.copilot_decisions
for each row execute function public.set_updated_at();

create index if not exists copilot_conversations_company_status_idx
on public.copilot_conversations(company_id, status, updated_at desc);

create index if not exists copilot_messages_conversation_created_idx
on public.copilot_messages(conversation_id, created_at);

create index if not exists copilot_memory_company_scope_idx
on public.copilot_memory(company_id, greenhouse_id, module, last_seen_at desc);

create index if not exists copilot_decisions_company_status_idx
on public.copilot_decisions(company_id, status, created_at desc);
