-- Mira - Grok WhatsApp work events
-- Adds an agent-first delivery contract without using the WhatsApp API.

alter table public.task_updates
add column if not exists actor_staff_id uuid;

do $$ begin
  alter table public.task_updates
  add constraint task_updates_actor_staff_company_fk
  foreign key (actor_staff_id, company_id)
  references public.company_staff(id, company_id);
exception when duplicate_object then null;
end $$;

create or replace view public.work_events
with (security_invoker = true)
as
select
  id,
  company_id,
  task_id as work_id,
  actor_user_id,
  update_type,
  note,
  metadata,
  created_at,
  actor_staff_id
from public.task_updates;

grant select on public.work_events to authenticated;

create table if not exists public.agent_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  work_id uuid not null,
  weekly_plan_id uuid,
  recipient_user_id uuid references auth.users(id),
  recipient_staff_id uuid,
  recipient_name text not null,
  recipient_phone text,
  provider text not null default 'grok',
  channel text not null default 'whatsapp_web',
  event_type text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  callback_token_hash text,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  accepted_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  last_inbound_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, dedupe_key),
  foreign key (work_id, company_id)
    references public.tasks(id, company_id)
    on delete cascade,
  foreign key (weekly_plan_id, company_id)
    references public.weekly_plans(id, company_id)
    on delete cascade,
  foreign key (recipient_staff_id, company_id)
    references public.company_staff(id, company_id),
  constraint agent_dispatches_recipient_check check (
    (recipient_user_id is not null)::integer + (recipient_staff_id is not null)::integer = 1
  ),
  constraint agent_dispatches_provider_check check (provider = 'grok'),
  constraint agent_dispatches_channel_check check (channel = 'whatsapp_web'),
  constraint agent_dispatches_event_type_check check (event_type in ('work_assigned', 'work_updated', 'work_resend')),
  constraint agent_dispatches_status_check check (
    status in ('pending', 'processing', 'accepted', 'sent', 'responded', 'completed', 'blocked', 'failed', 'cancelled')
  ),
  constraint agent_dispatches_phone_check check (
    recipient_phone is null or recipient_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  constraint agent_dispatches_callback_token_hash_check check (
    callback_token_hash is null or callback_token_hash ~ '^[0-9a-f]{64}$'
  )
);

create index if not exists agent_dispatches_company_work_idx
on public.agent_dispatches(company_id, work_id, created_at desc);

create index if not exists agent_dispatches_pending_idx
on public.agent_dispatches(status, created_at)
where status in ('pending', 'failed');

drop trigger if exists set_agent_dispatches_updated_at on public.agent_dispatches;
create trigger set_agent_dispatches_updated_at
before update on public.agent_dispatches
for each row execute function public.set_updated_at();

alter table public.agent_dispatches enable row level security;

drop policy if exists "agent_dispatches_select_operational" on public.agent_dispatches;
create policy "agent_dispatches_select_operational"
on public.agent_dispatches for select
to authenticated
using (
  public.can_manage_company(company_id)
  or recipient_user_id = auth.uid()
);

create table if not exists public.agent_callback_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dispatch_id uuid not null references public.agent_dispatches(id) on delete cascade,
  callback_id text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (dispatch_id, callback_id)
);

create index if not exists agent_callback_receipts_company_idx
on public.agent_callback_receipts(company_id, created_at desc);

alter table public.agent_callback_receipts enable row level security;

drop policy if exists "agent_callback_receipts_select_managerial" on public.agent_callback_receipts;
create policy "agent_callback_receipts_select_managerial"
on public.agent_callback_receipts for select
to authenticated
using (public.can_manage_company(company_id));

create or replace function public.process_grok_work_callback_internal(
  target_dispatch_id uuid,
  target_callback_id text,
  target_status text,
  target_message text default null,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_dispatch public.agent_dispatches%rowtype;
  target_work public.tasks%rowtype;
  material public.task_materials%rowtype;
  receipt_id uuid;
  result_id uuid;
  result_ids jsonb := '[]'::jsonb;
  message_value text := nullif(trim(target_message), '');
  occurred_on date;
  actor_user_id uuid;
  actor_staff_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'not_allowed'; end if;
  if nullif(trim(target_callback_id), '') is null then raise exception 'agent_callback_id_required'; end if;
  if target_status not in ('accepted', 'sent', 'responded', 'completed', 'blocked', 'failed') then
    raise exception 'invalid_agent_callback_status';
  end if;
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'invalid_work_payload';
  end if;

  select * into target_dispatch
  from public.agent_dispatches
  where id = target_dispatch_id
  for update;

  if target_dispatch.id is null then raise exception 'agent_dispatch_not_found'; end if;

  insert into public.agent_callback_receipts (
    company_id,
    dispatch_id,
    callback_id,
    status,
    payload
  ) values (
    target_dispatch.company_id,
    target_dispatch.id,
    trim(target_callback_id),
    target_status,
    target_payload || jsonb_build_object('message', message_value)
  )
  on conflict (dispatch_id, callback_id) do nothing
  returning id into receipt_id;

  if receipt_id is null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'dispatchId', target_dispatch.id);
  end if;

  if target_dispatch.status = 'cancelled' then raise exception 'agent_dispatch_cancelled'; end if;

  if target_status = 'accepted' then
    update public.agent_dispatches
    set status = 'accepted', accepted_at = coalesce(accepted_at, now()), last_error = null
    where id = target_dispatch.id;
    return jsonb_build_object('ok', true, 'dispatchId', target_dispatch.id, 'status', 'accepted');
  end if;

  if target_status = 'sent' then
    update public.agent_dispatches
    set status = 'sent', accepted_at = coalesce(accepted_at, now()), sent_at = coalesce(sent_at, now()), last_error = null
    where id = target_dispatch.id;
    return jsonb_build_object('ok', true, 'dispatchId', target_dispatch.id, 'status', 'sent');
  end if;

  if target_status = 'failed' then
    update public.agent_dispatches
    set status = 'failed', last_error = coalesce(message_value, 'grok_callback_failed')
    where id = target_dispatch.id;
    return jsonb_build_object('ok', true, 'dispatchId', target_dispatch.id, 'status', 'failed');
  end if;

  select * into target_work
  from public.tasks
  where id = target_dispatch.work_id
    and company_id = target_dispatch.company_id
  for update;

  if target_work.id is null then raise exception 'task_not_found'; end if;

  actor_user_id := target_dispatch.recipient_user_id;
  actor_staff_id := target_dispatch.recipient_staff_id;

  if actor_user_id is not null and not exists (
    select 1
    from public.task_assignments assignment
    join public.company_members member
      on member.company_id = assignment.company_id
     and member.user_id = assignment.user_id
     and member.status = 'active'
    where assignment.company_id = target_work.company_id
      and assignment.task_id = target_work.id
      and assignment.user_id = actor_user_id
  ) then raise exception 'not_allowed'; end if;

  if actor_staff_id is not null and not exists (
    select 1
    from public.task_staff_assignments assignment
    join public.company_staff staff
      on staff.company_id = assignment.company_id
     and staff.id = assignment.staff_id
     and staff.status = 'active'
    where assignment.company_id = target_work.company_id
      and assignment.task_id = target_work.id
      and assignment.staff_id = actor_staff_id
  ) then raise exception 'not_allowed'; end if;

  update public.agent_dispatches
  set responded_at = coalesce(responded_at, now()),
      last_inbound_text = message_value,
      status = case target_status
        when 'responded' then 'responded'
        when 'completed' then 'completed'
        else 'blocked'
      end,
      last_error = null
  where id = target_dispatch.id;

  if target_status = 'responded' then
    if message_value is null then raise exception 'agent_reply_required'; end if;
    insert into public.task_updates (
      company_id, task_id, actor_user_id, actor_staff_id, update_type, note, metadata
    ) values (
      target_work.company_id,
      target_work.id,
      actor_user_id,
      actor_staff_id,
      'answer',
      message_value,
      jsonb_build_object(
        'source', 'grok_whatsapp',
        'dispatch_id', target_dispatch.id,
        'phone', target_dispatch.recipient_phone
      )
    );
    return jsonb_build_object('ok', true, 'dispatchId', target_dispatch.id, 'status', 'responded');
  end if;

  if target_status = 'blocked' then
    if message_value is null then raise exception 'blocked_reason_required'; end if;
    update public.tasks
    set status = 'bloqueada', blocked_reason = message_value, updated_at = now()
    where id = target_work.id;
    insert into public.task_updates (
      company_id, task_id, actor_user_id, actor_staff_id, update_type, note, metadata
    ) values (
      target_work.company_id,
      target_work.id,
      actor_user_id,
      actor_staff_id,
      'blocked',
      message_value,
      jsonb_build_object(
        'source', 'grok_whatsapp',
        'dispatch_id', target_dispatch.id,
        'phone', target_dispatch.recipient_phone
      )
    );
    return jsonb_build_object('ok', true, 'dispatchId', target_dispatch.id, 'workId', target_work.id, 'status', 'bloqueada');
  end if;

  if target_work.status not in ('pendiente'::public.task_status, 'en_progreso'::public.task_status) then
    raise exception 'invalid_work_transition';
  end if;

  begin
    occurred_on := coalesce(nullif(trim(target_payload->>'occurredAt'), '')::date, current_date);
  exception when invalid_text_representation then
    raise exception 'invalid_work_occurred_at';
  end;

  if target_work.type = 'riego'::public.task_type then
    if nullif(trim(target_payload->>'durationMin'), '') is null
      or nullif(trim(target_payload->>'estimatedLiters'), '') is null then
      raise exception 'irrigation_actuals_required';
    end if;
    insert into public.irrigation_records (
      company_id, greenhouse_id, occurred_at, duration_min, estimated_liters, sector, ph, ec, notes,
      responsible_user_id, created_by, source_task_id
    ) values (
      target_work.company_id, target_work.greenhouse_id, occurred_on,
      (target_payload->>'durationMin')::integer, (target_payload->>'estimatedLiters')::numeric,
      nullif(trim(target_payload->>'sector'), ''), nullif(trim(target_payload->>'ph'), '')::numeric,
      nullif(trim(target_payload->>'ec'), '')::numeric,
      coalesce(nullif(trim(target_payload->>'notes'), ''), message_value, target_work.instructions),
      actor_user_id, actor_user_id, target_work.id
    ) on conflict on constraint irrigation_records_source_task_unique do update set
      occurred_at = excluded.occurred_at, duration_min = excluded.duration_min,
      estimated_liters = excluded.estimated_liters, sector = excluded.sector, ph = excluded.ph,
      ec = excluded.ec, notes = excluded.notes, responsible_user_id = excluded.responsible_user_id,
      updated_at = now() returning id into result_id;
    result_ids := jsonb_build_array(result_id);
  elsif target_work.type = 'aplicacion_foliar'::public.task_type then
    for material in
      select * from public.task_materials where task_id = target_work.id order by mixing_order, created_at
    loop
      insert into public.application_records (
        company_id, greenhouse_id, product_id, category, product_name, composition, dose, applied_area,
        safety_interval, reentry_interval, occurred_at, notes, responsible_user_id, created_by,
        source_task_id, source_task_material_id
      ) values (
        target_work.company_id, target_work.greenhouse_id, material.product_id,
        coalesce(
          (select product.category::text from public.products product where product.id = material.product_id),
          nullif(trim(target_payload->>'category'), '')
        )::public.application_category,
        material.product_name, material.composition, coalesce(nullif(trim(material.dose), ''), 'No especificada'),
        nullif(trim(target_payload->>'appliedArea'), ''), null, null, occurred_on,
        coalesce(nullif(trim(target_payload->>'notes'), ''), material.notes, message_value, target_work.instructions),
        actor_user_id, actor_user_id, target_work.id, material.id
      ) on conflict on constraint application_records_source_material_unique do update set
        occurred_at = excluded.occurred_at, dose = excluded.dose, applied_area = excluded.applied_area,
        notes = excluded.notes, responsible_user_id = excluded.responsible_user_id, updated_at = now()
      returning id into result_id;
      result_ids := result_ids || jsonb_build_array(result_id);
    end loop;
    if jsonb_array_length(result_ids) = 0 then raise exception 'application_materials_required'; end if;
  elsif target_work.type in ('fertirriego'::public.task_type, 'fertilizacion'::public.task_type) then
    if nullif(trim(target_payload->>'method'), '') is null then raise exception 'nutrition_method_required'; end if;
    for material in
      select * from public.task_materials where task_id = target_work.id order by mixing_order, created_at
    loop
      insert into public.nutrition_records (
        company_id, greenhouse_id, product_id, product_name, dose, method, ph, ec, occurred_at,
        crop_stage, objective, notes, responsible_user_id, created_by, source_task_id, source_task_material_id
      ) values (
        target_work.company_id, target_work.greenhouse_id, material.product_id, material.product_name,
        coalesce(nullif(trim(material.dose), ''), 'No especificada'),
        (target_payload->>'method')::public.nutrition_method,
        nullif(trim(target_payload->>'ph'), '')::numeric, nullif(trim(target_payload->>'ec'), '')::numeric,
        occurred_on, nullif(trim(target_payload->>'cropStage'), '')::public.crop_stage,
        nullif(trim(target_payload->>'objective'), '')::public.nutrition_objective,
        coalesce(nullif(trim(target_payload->>'notes'), ''), material.notes, message_value, target_work.instructions),
        actor_user_id, actor_user_id, target_work.id, material.id
      ) on conflict on constraint nutrition_records_source_material_unique do update set
        occurred_at = excluded.occurred_at, dose = excluded.dose, method = excluded.method,
        ph = excluded.ph, ec = excluded.ec, crop_stage = excluded.crop_stage, objective = excluded.objective,
        notes = excluded.notes, responsible_user_id = excluded.responsible_user_id, updated_at = now()
      returning id into result_id;
      result_ids := result_ids || jsonb_build_array(result_id);
    end loop;
    if jsonb_array_length(result_ids) = 0 then raise exception 'nutrition_products_required'; end if;
  elsif target_work.type = 'cosecha'::public.task_type then
    if nullif(trim(target_payload->>'kilograms'), '') is null then raise exception 'harvest_kilograms_required'; end if;
    insert into public.harvest_records (
      company_id, greenhouse_id, occurred_at, kilograms, box_count, box_weight_kg, first_quality_kg,
      second_quality_kg, third_quality_kg, discard_kg, merma_kg, first_quality_boxes, second_quality_boxes,
      third_quality_boxes, merma_boxes, first_quality_price, second_quality_price, third_quality_price,
      estimated_price, destination, notes, responsible_user_id, created_by, source_task_id
    ) values (
      target_work.company_id, target_work.greenhouse_id, occurred_on, (target_payload->>'kilograms')::numeric,
      coalesce((target_payload->>'boxCount')::numeric, 0), coalesce((target_payload->>'boxWeightKg')::numeric, 20),
      coalesce((target_payload->>'firstQualityKg')::numeric, 0), coalesce((target_payload->>'secondQualityKg')::numeric, 0),
      coalesce((target_payload->>'thirdQualityKg')::numeric, 0), coalesce((target_payload->>'mermaKg')::numeric, 0),
      coalesce((target_payload->>'mermaKg')::numeric, 0), coalesce((target_payload->>'firstQualityBoxes')::numeric, 0),
      coalesce((target_payload->>'secondQualityBoxes')::numeric, 0), coalesce((target_payload->>'thirdQualityBoxes')::numeric, 0),
      coalesce((target_payload->>'mermaBoxes')::numeric, 0), coalesce((target_payload->>'firstQualityPrice')::numeric, 0),
      coalesce((target_payload->>'secondQualityPrice')::numeric, 0), coalesce((target_payload->>'thirdQualityPrice')::numeric, 0),
      coalesce((target_payload->>'estimatedPrice')::numeric, 0), nullif(trim(target_payload->>'destination'), ''),
      coalesce(nullif(trim(target_payload->>'notes'), ''), message_value, target_work.instructions),
      actor_user_id, actor_user_id, target_work.id
    ) on conflict on constraint harvest_records_source_task_unique do update set
      occurred_at = excluded.occurred_at, kilograms = excluded.kilograms, box_count = excluded.box_count,
      box_weight_kg = excluded.box_weight_kg, first_quality_kg = excluded.first_quality_kg,
      second_quality_kg = excluded.second_quality_kg, third_quality_kg = excluded.third_quality_kg,
      discard_kg = excluded.discard_kg, merma_kg = excluded.merma_kg,
      estimated_price = excluded.estimated_price, destination = excluded.destination, notes = excluded.notes,
      responsible_user_id = excluded.responsible_user_id, updated_at = now() returning id into result_id;
    result_ids := jsonb_build_array(result_id);
  end if;

  update public.tasks
  set status = 'completada', blocked_reason = null, started_at = coalesce(started_at, now()),
      completed_at = now(), occurred_at = occurred_on::timestamptz,
      verified_at = null, verified_by = null, updated_at = now()
  where id = target_work.id;

  insert into public.task_updates (
    company_id, task_id, actor_user_id, actor_staff_id, update_type, note, metadata
  ) values (
    target_work.company_id,
    target_work.id,
    actor_user_id,
    actor_staff_id,
    'completed',
    coalesce(message_value, 'Actividad reportada como terminada por WhatsApp.'),
    jsonb_build_object(
      'source', 'grok_whatsapp',
      'dispatch_id', target_dispatch.id,
      'phone', target_dispatch.recipient_phone,
      'occurred_at', occurred_on
    )
  );

  return jsonb_build_object(
    'ok', true,
    'dispatchId', target_dispatch.id,
    'workId', target_work.id,
    'status', 'completada',
    'recordIds', result_ids
  );
end;
$$;

revoke all on function public.process_grok_work_callback_internal(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.process_grok_work_callback(
  target_dispatch_id uuid,
  target_callback_token text,
  target_callback_id text,
  target_status text,
  target_message text default null,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_hash text;
begin
  if auth.role() <> 'service_role' then raise exception 'not_allowed'; end if;

  select callback_token_hash into expected_hash
  from public.agent_dispatches
  where id = target_dispatch_id;

  if expected_hash is null
    or nullif(trim(target_callback_token), '') is null
    or length(target_callback_token) > 160
    or encode(extensions.digest(convert_to(target_callback_token, 'UTF8'), 'sha256'), 'hex') <> expected_hash then
    raise exception 'invalid_agent_callback_token';
  end if;

  return public.process_grok_work_callback_internal(
    target_dispatch_id,
    target_callback_id,
    target_status,
    target_message,
    target_payload
  );
end;
$$;

revoke all on function public.process_grok_work_callback(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.process_grok_work_callback(uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.verify_work(target_work_id uuid, target_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  note_value text := nullif(trim(target_note), '');
  completed_by_user uuid;
  completed_by_staff uuid;
begin
  select * into target_work from public.tasks where id = target_work_id for update;
  if target_work.id is null then raise exception 'task_not_found'; end if;
  if not public.can_verify_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status <> 'completada'::public.task_status then raise exception 'invalid_work_transition'; end if;

  select actor_user_id, actor_staff_id into completed_by_user, completed_by_staff
  from public.task_updates
  where task_id = target_work_id and update_type = 'completed'::public.task_update_type
  order by created_at desc limit 1;

  if completed_by_user is null and completed_by_staff is null then raise exception 'work_completion_audit_missing'; end if;
  if completed_by_user = auth.uid() then raise exception 'work_verification_requires_different_supervisor'; end if;

  update public.tasks
  set status = 'verificada', verified_at = now(), verified_by = auth.uid(), updated_at = now()
  where id = target_work_id
  returning * into target_work;

  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (
    target_work.company_id,
    target_work.id,
    auth.uid(),
    'verified',
    note_value,
    jsonb_build_object('source', 'work', 'automatic', false)
  );

  return jsonb_build_object('workId', target_work.id, 'status', target_work.status, 'verifiedAt', target_work.verified_at);
end;
$$;

revoke all on function public.verify_work(uuid, text) from public, anon;
grant execute on function public.verify_work(uuid, text) to authenticated;
