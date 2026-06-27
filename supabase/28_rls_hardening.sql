-- mira - 28 RLS hardening
-- Ejecutar despues de 27_tenant_integrity_constraints.sql.
-- Endurece permisos sin cambiar el flujo funcional: helpers con grants
-- explicitos, policies por operacion y storage resistente a paths malformados.

create or replace function public.storage_object_company_id(object_name text)
returns uuid
language sql
stable
set search_path = public
as $$
  select case
    when ((storage.foldername(object_name))[1]) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(object_name))[1])::uuid
    else null
  end
$$;

revoke all on function public.current_user_role(uuid) from public;
revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.can_manage_company(uuid) from public;
revoke all on function public.can_write_company(uuid) from public;
revoke all on function public.shares_company_with(uuid) from public;
revoke all on function public.can_access_greenhouse(uuid, uuid) from public;
revoke all on function public.is_task_assignee(uuid) from public;
revoke all on function public.can_view_operational_task(uuid) from public;
revoke all on function public.storage_object_company_id(text) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_company() from public;

grant execute on function public.current_user_role(uuid) to authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.can_manage_company(uuid) to authenticated;
grant execute on function public.can_write_company(uuid) to authenticated;
grant execute on function public.shares_company_with(uuid) to authenticated;
grant execute on function public.can_access_greenhouse(uuid, uuid) to authenticated;
grant execute on function public.is_task_assignee(uuid) to authenticated;
grant execute on function public.can_view_operational_task(uuid) to authenticated;
grant execute on function public.storage_object_company_id(text) to authenticated;

drop policy if exists "weekly_plans_write_managerial" on public.weekly_plans;
drop policy if exists "weekly_plans_insert_managerial" on public.weekly_plans;
create policy "weekly_plans_insert_managerial"
on public.weekly_plans for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "weekly_plans_update_managerial" on public.weekly_plans;
create policy "weekly_plans_update_managerial"
on public.weekly_plans for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "weekly_plans_delete_managerial" on public.weekly_plans;
create policy "weekly_plans_delete_managerial"
on public.weekly_plans for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "task_assignments_write_managerial" on public.task_assignments;
drop policy if exists "task_assignments_insert_managerial" on public.task_assignments;
create policy "task_assignments_insert_managerial"
on public.task_assignments for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "task_assignments_update_managerial" on public.task_assignments;
create policy "task_assignments_update_managerial"
on public.task_assignments for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "task_assignments_delete_managerial" on public.task_assignments;
create policy "task_assignments_delete_managerial"
on public.task_assignments for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "task_materials_write_managerial" on public.task_materials;
drop policy if exists "task_materials_insert_managerial" on public.task_materials;
create policy "task_materials_insert_managerial"
on public.task_materials for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "task_materials_update_managerial" on public.task_materials;
create policy "task_materials_update_managerial"
on public.task_materials for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "task_materials_delete_managerial" on public.task_materials;
create policy "task_materials_delete_managerial"
on public.task_materials for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "notification_connections_write_own" on public.notification_connections;
drop policy if exists "notification_connections_insert_own" on public.notification_connections;
create policy "notification_connections_insert_own"
on public.notification_connections for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_company_member(company_id)
);

drop policy if exists "notification_connections_update_own" on public.notification_connections;
create policy "notification_connections_update_own"
on public.notification_connections for update
to authenticated
using (
  public.can_manage_company(company_id)
  or (user_id = auth.uid() and public.is_company_member(company_id))
)
with check (
  public.can_manage_company(company_id)
  or (user_id = auth.uid() and public.is_company_member(company_id))
);

drop policy if exists "notification_connections_delete_own" on public.notification_connections;
create policy "notification_connections_delete_own"
on public.notification_connections for delete
to authenticated
using (
  public.can_manage_company(company_id)
  or (user_id = auth.uid() and public.is_company_member(company_id))
);

drop policy if exists "telegram_operational_sessions_select_own" on public.telegram_operational_sessions;
create policy "telegram_operational_sessions_select_own"
on public.telegram_operational_sessions for select
to authenticated
using (
  public.can_manage_company(company_id)
  or (user_id = auth.uid() and public.is_company_member(company_id))
);

drop policy if exists "telegram_operational_sessions_delete_own" on public.telegram_operational_sessions;
create policy "telegram_operational_sessions_delete_own"
on public.telegram_operational_sessions for delete
to authenticated
using (
  public.can_manage_company(company_id)
  or (user_id = auth.uid() and public.is_company_member(company_id))
);

drop policy if exists "copilot_runs_managerial" on public.copilot_runs;
drop policy if exists "copilot_runs_select_managerial" on public.copilot_runs;
create policy "copilot_runs_select_managerial"
on public.copilot_runs for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_runs_insert_managerial" on public.copilot_runs;
create policy "copilot_runs_insert_managerial"
on public.copilot_runs for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_runs_update_managerial" on public.copilot_runs;
create policy "copilot_runs_update_managerial"
on public.copilot_runs for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_runs_delete_managerial" on public.copilot_runs;
create policy "copilot_runs_delete_managerial"
on public.copilot_runs for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_insights_managerial" on public.copilot_insights;
drop policy if exists "copilot_insights_select_managerial" on public.copilot_insights;
create policy "copilot_insights_select_managerial"
on public.copilot_insights for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_insights_insert_managerial" on public.copilot_insights;
create policy "copilot_insights_insert_managerial"
on public.copilot_insights for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_insights_update_managerial" on public.copilot_insights;
create policy "copilot_insights_update_managerial"
on public.copilot_insights for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_insights_delete_managerial" on public.copilot_insights;
create policy "copilot_insights_delete_managerial"
on public.copilot_insights for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_task_suggestions_managerial" on public.copilot_task_suggestions;
drop policy if exists "copilot_task_suggestions_select_managerial" on public.copilot_task_suggestions;
create policy "copilot_task_suggestions_select_managerial"
on public.copilot_task_suggestions for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_task_suggestions_insert_managerial" on public.copilot_task_suggestions;
create policy "copilot_task_suggestions_insert_managerial"
on public.copilot_task_suggestions for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_task_suggestions_update_managerial" on public.copilot_task_suggestions;
create policy "copilot_task_suggestions_update_managerial"
on public.copilot_task_suggestions for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_task_suggestions_delete_managerial" on public.copilot_task_suggestions;
create policy "copilot_task_suggestions_delete_managerial"
on public.copilot_task_suggestions for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_manager_messages_managerial" on public.copilot_manager_messages;
drop policy if exists "copilot_manager_messages_select_managerial" on public.copilot_manager_messages;
create policy "copilot_manager_messages_select_managerial"
on public.copilot_manager_messages for select
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "copilot_manager_messages_insert_managerial" on public.copilot_manager_messages;
create policy "copilot_manager_messages_insert_managerial"
on public.copilot_manager_messages for insert
to authenticated
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_manager_messages_update_managerial" on public.copilot_manager_messages;
create policy "copilot_manager_messages_update_managerial"
on public.copilot_manager_messages for update
to authenticated
using (public.can_manage_company(company_id))
with check (public.can_manage_company(company_id));

drop policy if exists "copilot_manager_messages_delete_managerial" on public.copilot_manager_messages;
create policy "copilot_manager_messages_delete_managerial"
on public.copilot_manager_messages for delete
to authenticated
using (public.can_manage_company(company_id));

drop policy if exists "company_assets_select_member" on storage.objects;
create policy "company_assets_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'company-assets'
  and public.is_company_member(public.storage_object_company_id(name))
);

drop policy if exists "company_assets_insert_writer" on storage.objects;
create policy "company_assets_insert_writer"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and public.can_write_company(public.storage_object_company_id(name))
);

drop policy if exists "company_assets_update_writer" on storage.objects;
create policy "company_assets_update_writer"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-assets'
  and public.can_write_company(public.storage_object_company_id(name))
)
with check (
  bucket_id = 'company-assets'
  and public.can_write_company(public.storage_object_company_id(name))
);

drop policy if exists "technical_lab_files_select_managerial" on storage.objects;
create policy "technical_lab_files_select_managerial"
on storage.objects for select
to authenticated
using (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(public.storage_object_company_id(name))
);

drop policy if exists "technical_lab_files_insert_managerial" on storage.objects;
create policy "technical_lab_files_insert_managerial"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(public.storage_object_company_id(name))
);

drop policy if exists "technical_lab_files_update_managerial" on storage.objects;
create policy "technical_lab_files_update_managerial"
on storage.objects for update
to authenticated
using (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(public.storage_object_company_id(name))
)
with check (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(public.storage_object_company_id(name))
);

drop policy if exists "technical_lab_files_delete_managerial" on storage.objects;
create policy "technical_lab_files_delete_managerial"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'technical-lab-files'
  and public.can_manage_company(public.storage_object_company_id(name))
);

drop policy if exists "pest_photos_select_member" on storage.objects;
create policy "pest_photos_select_member"
on storage.objects for select
to authenticated
using (
  bucket_id = 'pest-photos'
  and public.is_company_member(public.storage_object_company_id(name))
);

drop policy if exists "pest_photos_insert_writer" on storage.objects;
create policy "pest_photos_insert_writer"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pest-photos'
  and public.can_write_company(public.storage_object_company_id(name))
);

drop policy if exists "pest_photos_update_writer" on storage.objects;
create policy "pest_photos_update_writer"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pest-photos'
  and public.can_write_company(public.storage_object_company_id(name))
)
with check (
  bucket_id = 'pest-photos'
  and public.can_write_company(public.storage_object_company_id(name))
);
