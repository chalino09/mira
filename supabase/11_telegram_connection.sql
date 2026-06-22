-- mira - 11 Telegram connection
-- Ejecutar después de 10_simplified_task_flow.sql.
-- Endurece la vinculación de Telegram con códigos temporales administrados por Edge Functions.

alter table public.notification_connections
add column if not exists verification_expires_at timestamptz,
add column if not exists external_username text,
add column if not exists external_display_name text;

drop policy if exists "notification_connections_write_own" on public.notification_connections;

create unique index if not exists notification_connections_verification_hash_idx
on public.notification_connections(verification_code_hash)
where verification_code_hash is not null;

create unique index if not exists notification_connections_active_chat_idx
on public.notification_connections(channel, external_chat_id)
where status = 'active' and external_chat_id is not null;
