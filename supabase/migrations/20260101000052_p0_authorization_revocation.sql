-- mira - 52 P0 Authorization revocation
-- A manager's authorization is derived from an active company_members row on
-- every request. Assignments and greenhouse ownership are never credentials.

create or replace function public.is_active_company_member(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members member
    where member.company_id = target_company_id
      and member.user_id = auth.uid()
      and member.status = 'active'
  )
$$;

create or replace function public.can_access_greenhouse(
  target_company_id uuid,
  target_greenhouse_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.can_manage_company(target_company_id), false)
    or (
      public.current_user_role(target_company_id) = 'manager'::public.member_role
      and exists (
        select 1
        from public.greenhouses greenhouse
        where greenhouse.company_id = target_company_id
          and greenhouse.id = target_greenhouse_id
          and greenhouse.manager_user_id = auth.uid()
          and greenhouse.is_active = true
      )
    )
$$;

create or replace function public.is_task_assignee(target_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.task_assignments assignment
    join public.tasks task
      on task.id = assignment.task_id
     and task.company_id = assignment.company_id
    where assignment.task_id = target_task_id
      and assignment.user_id = auth.uid()
      and public.is_active_company_member(task.company_id)
  )
  or exists (
    select 1
    from public.tasks task
    join public.greenhouses greenhouse
      on greenhouse.id = task.greenhouse_id
     and greenhouse.company_id = task.company_id
    where task.id = target_task_id
      and greenhouse.manager_user_id = auth.uid()
      and greenhouse.is_active = true
      and public.current_user_role(task.company_id) = 'manager'::public.member_role
  )
$$;

create or replace function public.can_view_operational_task(target_task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks task
    where task.id = target_task_id
      and (
        public.can_manage_company(task.company_id)
        or (task.responsible_user_id = auth.uid() and public.is_active_company_member(task.company_id))
        or public.is_task_assignee(task.id)
        or public.can_access_greenhouse(task.company_id, task.greenhouse_id)
      )
  )
$$;

create or replace function public.can_operate_work(target_work_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks work
    where work.id = target_work_id
      and (
        public.can_manage_company(work.company_id)
        or (work.responsible_user_id = auth.uid() and public.is_active_company_member(work.company_id))
        or public.is_task_assignee(work.id)
      )
  )
$$;

-- Tasks, records, and operational metadata must all consume the same active
-- membership-aware helpers. This replaces older policies that matched IDs only.
drop policy if exists "tasks_select_operational" on public.tasks;
create policy "tasks_select_operational"
on public.tasks for select to authenticated
using (public.can_view_operational_task(id));

drop policy if exists "greenhouses_select_scoped" on public.greenhouses;
create policy "greenhouses_select_scoped"
on public.greenhouses for select to authenticated
using (
  public.can_manage_company(company_id)
  or public.can_access_greenhouse(company_id, id)
  or (
    public.is_active_company_member(company_id)
    and exists (
      select 1
      from public.tasks task
      join public.task_assignments assignment
        on assignment.task_id = task.id
       and assignment.company_id = task.company_id
      where task.company_id = greenhouses.company_id
        and task.greenhouse_id = greenhouses.id
        and assignment.user_id = auth.uid()
    )
  )
);

drop policy if exists "work_evidence_select_company_member" on public.work_evidence;
create policy "work_evidence_select_company_member"
on public.work_evidence for select to authenticated
using (public.can_view_operational_task(work_id));

-- Storage policies already use is_company_member/can_write_company. Recreate
-- the Work bucket explicitly so its reads follow Work scope rather than only a
-- broad company membership.
drop policy if exists "work_evidence_select_company_member" on storage.objects;
create policy "work_evidence_select_company_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'work-evidence'
  and public.is_active_company_member(public.storage_object_company_id(name))
  and exists (
    select 1
    from public.work_evidence evidence
    where evidence.storage_path = name
      and public.can_view_operational_task(evidence.work_id)
  )
);

drop policy if exists "work_evidence_insert_work_operator" on storage.objects;
create policy "work_evidence_insert_work_operator"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-evidence'
  and public.is_active_company_member(public.storage_object_company_id(name))
  and exists (
    select 1
    from public.tasks work
    where work.company_id = public.storage_object_company_id(name)
      and public.can_operate_work(work.id)
  )
);

-- Public technical RPCs must authorize before delegating to their legacy
-- writers, whose historical checks allowed a disabled responsible user.
create or replace function public.complete_application_task(
  target_task_id uuid, target_occurred_at date, target_applied_area text default null,
  target_applications jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;
  result := public.legacy_complete_application_task(target_task_id, target_occurred_at, target_applied_area, target_applications);
  perform public.finish_technical_work(target_task_id, target_occurred_at, 'Aplicación confirmada y guardada en registros técnicos');
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

create or replace function public.complete_irrigation_task(
  target_task_id uuid, target_occurred_at date, target_duration_min integer,
  target_estimated_liters numeric, target_sector text default null, target_ph numeric default null,
  target_ec numeric default null, target_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;
  result := public.legacy_complete_irrigation_task(target_task_id, target_occurred_at, target_duration_min, target_estimated_liters, target_sector, target_ph, target_ec, target_notes);
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Riego confirmado y guardado en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

create or replace function public.complete_nutrition_task(
  target_task_id uuid, target_occurred_at date, target_method text,
  target_crop_stage text default null, target_objective text default null,
  target_ph numeric default null, target_ec numeric default null, target_notes text default null,
  target_products jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;
  result := public.legacy_complete_nutrition_task(target_task_id, target_occurred_at, target_method, target_crop_stage, target_objective, target_ph, target_ec, target_notes, target_products);
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Nutrición confirmada y guardada en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

create or replace function public.complete_harvest_task(
  target_task_id uuid, target_occurred_at date, target_kilograms numeric,
  target_first_quality_kg numeric default 0, target_second_quality_kg numeric default 0,
  target_merma_kg numeric default 0, target_estimated_price numeric default 0,
  target_destination text default null, target_notes text default null,
  target_box_count numeric default 0, target_box_weight_kg numeric default 20,
  target_first_quality_boxes numeric default 0, target_second_quality_boxes numeric default 0,
  target_third_quality_boxes numeric default 0, target_merma_boxes numeric default 0,
  target_third_quality_kg numeric default 0, target_first_quality_price numeric default 0,
  target_second_quality_price numeric default 0, target_third_quality_price numeric default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;
  result := public.legacy_complete_harvest_task(target_task_id, target_occurred_at, target_kilograms, target_first_quality_kg, target_second_quality_kg, target_merma_kg, target_estimated_price, target_destination, target_notes, target_box_count, target_box_weight_kg, target_first_quality_boxes, target_second_quality_boxes, target_third_quality_boxes, target_merma_boxes, target_third_quality_kg, target_first_quality_price, target_second_quality_price, target_third_quality_price);
  perform public.finish_technical_work(target_task_id, target_occurred_at, coalesce(target_notes, 'Cosecha confirmada y guardada en registros técnicos'));
  return result || jsonb_build_object('workId', target_task_id);
end;
$$;

revoke all on function public.legacy_complete_application_task(uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.legacy_complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.legacy_complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.legacy_complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

create or replace function public.update_operational_task_status(
  target_task_id uuid,
  next_status text,
  update_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  update_kind public.task_update_type;
begin
  select company_id into target_company_id from public.tasks where id = target_task_id;
  if target_company_id is null then raise exception 'task_not_found'; end if;
  if not public.can_operate_work(target_task_id) then raise exception 'not_allowed'; end if;
  if next_status not in ('bloqueada', 'completada', 'cancelada') then raise exception 'invalid_task_status'; end if;
  if next_status = 'bloqueada' and nullif(trim(update_note), '') is null then raise exception 'blocked_reason_required'; end if;

  update public.tasks
  set status = next_status::public.task_status,
      blocked_reason = case when next_status = 'bloqueada' then nullif(trim(update_note), '') else null end,
      started_at = case when next_status = 'completada' then started_at else null end,
      completed_at = case when next_status = 'completada' then now() else null end,
      occurred_at = case when next_status = 'completada' then coalesce(occurred_at, now()) else occurred_at end,
      updated_at = now()
  where id = target_task_id;

  update_kind := case next_status
    when 'bloqueada' then 'blocked'::public.task_update_type
    when 'completada' then 'completed'::public.task_update_type
    else 'cancelled'::public.task_update_type
  end;
  insert into public.task_updates (company_id, task_id, actor_user_id, update_type, note, metadata)
  values (target_company_id, target_task_id, auth.uid(), update_kind, nullif(trim(update_note), ''), jsonb_build_object('source', 'legacy'));
end;
$$;

create or replace function public.sync_work_execution_materials(
  target_work_id uuid,
  target_materials jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_work public.tasks%rowtype;
  material_item jsonb;
  material_index bigint;
  material_id_text text;
  material_id uuid;
  selected_product_id uuid;
  result_material_ids jsonb := '[]'::jsonb;
begin
  select * into target_work from public.tasks where id = target_work_id;
  if target_work.id is null then raise exception 'work_not_found'; end if;
  if not public.can_operate_work(target_work_id) then raise exception 'not_allowed'; end if;
  if target_work.status in ('completada'::public.task_status, 'verificada'::public.task_status, 'cancelada'::public.task_status) then raise exception 'work_is_closed'; end if;
  if jsonb_typeof(target_materials) <> 'array' or jsonb_array_length(target_materials) = 0 then raise exception 'work_materials_required'; end if;

  for material_item, material_index in select value, ordinality from jsonb_array_elements(target_materials) with ordinality loop
    selected_product_id := nullif(trim(material_item->>'productId'), '')::uuid;
    material_id_text := nullif(trim(material_item->>'materialId'), '');
    if selected_product_id is null or not exists (select 1 from public.products product where product.id = selected_product_id and product.company_id = target_work.company_id) then raise exception 'invalid_material_product'; end if;
    if nullif(trim(material_item->>'productName'), '') is null then raise exception 'work_material_product_required'; end if;
    if material_id_text is null or material_id_text like 'new:%' then
      insert into public.task_materials (company_id, task_id, product_id, product_name, composition, dose, unit, mixing_order, notes)
      values (target_work.company_id, target_work.id, selected_product_id, trim(material_item->>'productName'), nullif(trim(material_item->>'composition'), ''), nullif(trim(material_item->>'dose'), ''), nullif(trim(material_item->>'unit'), ''), material_index::integer, nullif(trim(material_item->>'notes'), ''))
      returning id into material_id;
    else
      material_id := material_id_text::uuid;
      update public.task_materials set product_id = selected_product_id, product_name = trim(material_item->>'productName'), composition = nullif(trim(material_item->>'composition'), ''), dose = nullif(trim(material_item->>'dose'), ''), unit = nullif(trim(material_item->>'unit'), ''), mixing_order = material_index::integer
      where id = material_id and task_id = target_work.id and company_id = target_work.company_id
      returning id into material_id;
      if material_id is null then raise exception 'invalid_work_material'; end if;
    end if;
    result_material_ids := result_material_ids || jsonb_build_array(material_id);
  end loop;
  return jsonb_build_object('workId', target_work.id, 'materialIds', result_material_ids);
end;
$$;

revoke all on function public.is_active_company_member(uuid) from public, anon;
grant execute on function public.is_active_company_member(uuid) to authenticated;
