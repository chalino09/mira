-- mira - 29 Pre-production checks
-- Ejecutar despues de 28_rls_hardening.sql.
-- Solo lectura. No modifica datos.
--
-- Devuelve una sola tabla consolidada. Revisa cualquier fila con
-- status = 'missing' o status = 'review'.

with
storage_expected(bucket_id, expected_public) as (
  values
    ('company-assets', true),
    ('pest-photos', false),
    ('technical-lab-files', false)
),
storage_checks as (
  select
    'storage buckets'::text as check_group,
    expected.bucket_id::text as check_name,
    jsonb_build_object(
      'public', bucket.public,
      'expected_public', expected.expected_public,
      'file_size_limit', bucket.file_size_limit,
      'allowed_mime_types', bucket.allowed_mime_types
    )::text as detail,
    case
      when bucket.id is null then 'missing'
      when bucket.public is distinct from expected.expected_public then 'review'
      else 'ok'
    end as status
  from storage_expected expected
  left join storage.buckets bucket on bucket.id = expected.bucket_id
),
rls_expected(table_name) as (
  values
    ('profiles'),
    ('companies'),
    ('company_members'),
    ('greenhouses'),
    ('greenhouse_sectors'),
    ('products'),
    ('tasks'),
    ('irrigation_records'),
    ('nutrition_records'),
    ('application_records'),
    ('pest_alerts'),
    ('pest_alert_updates'),
    ('harvest_records'),
    ('cost_records'),
    ('weekly_plans'),
    ('task_assignments'),
    ('task_materials'),
    ('task_updates'),
    ('notification_connections'),
    ('notification_outbox'),
    ('telegram_operational_sessions'),
    ('crops'),
    ('crop_stages'),
    ('crop_cycles'),
    ('nutrient_ranges'),
    ('activity_templates'),
    ('recommendation_templates'),
    ('nutrition_reference_ranges'),
    ('nutrition_observation_rules'),
    ('nutrition_monitoring_events'),
    ('nutrition_monitoring_values'),
    ('nutrition_monitoring_observations'),
    ('technical_lab_studies'),
    ('technical_lab_study_values'),
    ('technical_lab_study_files'),
    ('weather_snapshots'),
    ('copilot_runs'),
    ('copilot_insights'),
    ('copilot_task_suggestions'),
    ('copilot_manager_messages'),
    ('copilot_conversations'),
    ('copilot_messages'),
    ('copilot_memory'),
    ('copilot_decisions')
),
rls_checks as (
  select
    'rls enabled'::text as check_group,
    expected.table_name::text as check_name,
    jsonb_build_object(
      'rls_enabled', coalesce(class.relrowsecurity, false)
    )::text as detail,
    case
      when class.oid is null then 'missing'
      when class.relrowsecurity then 'ok'
      else 'review'
    end as status
  from rls_expected expected
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_class class
    on class.relnamespace = namespace.oid
    and class.relname = expected.table_name
    and class.relkind = 'r'
),
helper_expected(signature, authenticated_expected) as (
  values
    ('public.current_user_role(uuid)', true),
    ('public.is_company_member(uuid)', true),
    ('public.can_manage_company(uuid)', true),
    ('public.can_write_company(uuid)', true),
    ('public.shares_company_with(uuid)', true),
    ('public.can_access_greenhouse(uuid, uuid)', true),
    ('public.is_task_assignee(uuid)', true),
    ('public.can_view_operational_task(uuid)', true),
    ('public.storage_object_company_id(text)', true),
    ('public.handle_new_user()', false),
    ('public.handle_new_company()', false)
),
helper_actual as (
  select
    signature,
    authenticated_expected,
    to_regprocedure(signature) as function_oid
  from helper_expected
),
helper_checks as (
  select
    'helper grants'::text as check_group,
    signature::text as check_name,
    jsonb_build_object(
      'anon_execute',
      case
        when function_oid is null then null
        else has_function_privilege('anon', function_oid, 'EXECUTE')
      end,
      'authenticated_execute',
      case
        when function_oid is null then null
        else has_function_privilege('authenticated', function_oid, 'EXECUTE')
      end,
      'authenticated_expected', authenticated_expected
    )::text as detail,
    case
      when function_oid is null then 'missing'
      when has_function_privilege('anon', function_oid, 'EXECUTE') = false
        and has_function_privilege('authenticated', function_oid, 'EXECUTE') = authenticated_expected then 'ok'
      else 'review'
    end as status
  from helper_actual
),
constraint_expected(conname) as (
  values
    ('products_id_company_unique'),
    ('greenhouse_sectors_id_company_unique'),
    ('greenhouse_sectors_id_greenhouse_company_unique'),
    ('task_materials_id_company_unique'),
    ('copilot_runs_id_company_unique'),
    ('copilot_insights_id_company_unique'),
    ('copilot_conversations_id_company_unique'),
    ('copilot_messages_id_company_unique'),
    ('copilot_memory_id_company_unique'),
    ('copilot_decisions_id_company_unique'),
    ('pest_alerts_id_company_unique'),
    ('pest_alert_updates_id_company_unique'),
    ('tasks_weekly_plan_company_fk'),
    ('cost_records_greenhouse_company_fk'),
    ('tasks_sector_greenhouse_company_fk'),
    ('irrigation_records_sector_greenhouse_company_fk'),
    ('nutrition_records_product_company_fk'),
    ('application_records_product_company_fk'),
    ('task_materials_product_company_fk'),
    ('notification_outbox_task_company_fk'),
    ('notification_outbox_weekly_plan_company_fk'),
    ('application_records_source_task_company_fk'),
    ('application_records_source_material_company_fk'),
    ('irrigation_records_source_task_company_fk'),
    ('nutrition_records_source_task_company_fk'),
    ('nutrition_records_source_material_company_fk'),
    ('harvest_records_source_task_company_fk'),
    ('technical_lab_studies_greenhouse_company_fk'),
    ('nutrition_monitoring_events_crop_cycle_company_fk'),
    ('copilot_runs_greenhouse_company_fk'),
    ('copilot_insights_greenhouse_company_fk'),
    ('copilot_insights_run_company_fk'),
    ('copilot_task_suggestions_insight_company_fk'),
    ('copilot_task_suggestions_approved_task_company_fk'),
    ('copilot_manager_messages_greenhouse_company_fk'),
    ('copilot_manager_messages_task_company_fk'),
    ('copilot_manager_messages_insight_company_fk'),
    ('copilot_conversations_greenhouse_company_fk'),
    ('copilot_messages_conversation_company_fk'),
    ('copilot_memory_greenhouse_company_fk'),
    ('copilot_decisions_conversation_company_fk'),
    ('copilot_decisions_message_company_fk'),
    ('copilot_decisions_insight_company_fk'),
    ('pest_alert_updates_alert_company_fk'),
    ('pest_alert_updates_greenhouse_company_fk')
),
constraint_checks as (
  select
    'tenant constraints'::text as check_group,
    expected.conname::text as check_name,
    jsonb_build_object(
      'table_name', constraint_table.conrelid::regclass::text,
      'constraint_type', constraint_table.contype,
      'validated', constraint_table.convalidated
    )::text as detail,
    case
      when constraint_table.oid is null then 'missing'
      when constraint_table.convalidated then 'ok'
      else 'review'
    end as status
  from constraint_expected expected
  left join pg_constraint constraint_table on constraint_table.conname = expected.conname
),
policy_expected(schemaname, tablename, policyname, cmd) as (
  values
    ('public', 'weekly_plans', 'weekly_plans_insert_managerial', 'INSERT'),
    ('public', 'weekly_plans', 'weekly_plans_update_managerial', 'UPDATE'),
    ('public', 'weekly_plans', 'weekly_plans_delete_managerial', 'DELETE'),
    ('public', 'task_assignments', 'task_assignments_insert_managerial', 'INSERT'),
    ('public', 'task_assignments', 'task_assignments_update_managerial', 'UPDATE'),
    ('public', 'task_assignments', 'task_assignments_delete_managerial', 'DELETE'),
    ('public', 'task_materials', 'task_materials_insert_managerial', 'INSERT'),
    ('public', 'task_materials', 'task_materials_update_managerial', 'UPDATE'),
    ('public', 'task_materials', 'task_materials_delete_managerial', 'DELETE'),
    ('public', 'notification_connections', 'notification_connections_insert_own', 'INSERT'),
    ('public', 'notification_connections', 'notification_connections_update_own', 'UPDATE'),
    ('public', 'notification_connections', 'notification_connections_delete_own', 'DELETE'),
    ('public', 'telegram_operational_sessions', 'telegram_operational_sessions_select_own', 'SELECT'),
    ('public', 'telegram_operational_sessions', 'telegram_operational_sessions_delete_own', 'DELETE'),
    ('public', 'copilot_runs', 'copilot_runs_select_managerial', 'SELECT'),
    ('public', 'copilot_insights', 'copilot_insights_select_managerial', 'SELECT'),
    ('public', 'copilot_task_suggestions', 'copilot_task_suggestions_select_managerial', 'SELECT'),
    ('public', 'copilot_manager_messages', 'copilot_manager_messages_select_managerial', 'SELECT'),
    ('public', 'copilot_conversations', 'copilot_conversations_select_managerial', 'SELECT'),
    ('public', 'copilot_messages', 'copilot_messages_select_managerial', 'SELECT'),
    ('public', 'copilot_memory', 'copilot_memory_select_managerial', 'SELECT'),
    ('public', 'copilot_decisions', 'copilot_decisions_select_managerial', 'SELECT'),
    ('public', 'pest_alert_updates', 'pest_alert_updates_select_scoped', 'SELECT'),
    ('storage', 'objects', 'company_assets_select_member', 'SELECT'),
    ('storage', 'objects', 'company_assets_insert_writer', 'INSERT'),
    ('storage', 'objects', 'company_assets_update_writer', 'UPDATE'),
    ('storage', 'objects', 'technical_lab_files_select_managerial', 'SELECT'),
    ('storage', 'objects', 'technical_lab_files_insert_managerial', 'INSERT'),
    ('storage', 'objects', 'technical_lab_files_update_managerial', 'UPDATE'),
    ('storage', 'objects', 'technical_lab_files_delete_managerial', 'DELETE'),
    ('storage', 'objects', 'pest_photos_select_member', 'SELECT'),
    ('storage', 'objects', 'pest_photos_insert_writer', 'INSERT'),
    ('storage', 'objects', 'pest_photos_update_writer', 'UPDATE')
),
policy_checks as (
  select
    'critical policies'::text as check_group,
    (expected.schemaname || '.' || expected.tablename || '.' || expected.policyname)::text as check_name,
    jsonb_build_object(
      'expected_cmd', expected.cmd,
      'actual_cmd', policy.cmd,
      'roles', policy.roles
    )::text as detail,
    case
      when policy.policyname is null then 'missing'
      when policy.cmd = expected.cmd then 'ok'
      else 'review'
    end as status
  from policy_expected expected
  left join pg_policies policy
    on policy.schemaname = expected.schemaname
    and policy.tablename = expected.tablename
    and policy.policyname = expected.policyname
),
rpc_expected(signature) as (
  values
    ('public.complete_application_task(uuid, date, text, jsonb)'),
    ('public.complete_irrigation_task(uuid, date, integer, numeric, text, numeric, numeric, text)'),
    ('public.complete_nutrition_task(uuid, date, text, text, text, numeric, numeric, text, jsonb)'),
    ('public.complete_harvest_task(uuid, date, numeric, numeric, numeric, numeric, numeric, text, text)')
),
rpc_actual as (
  select
    signature,
    to_regprocedure(signature) as function_oid
  from rpc_expected
),
rpc_checks as (
  select
    'operational rpc returns'::text as check_group,
    signature::text as check_name,
    jsonb_build_object(
      'return_type',
      case
        when function_oid is null then null
        else pg_get_function_result(function_oid)
      end,
      'expected_return_type', 'jsonb'
    )::text as detail,
    case
      when function_oid is null then 'missing'
      when pg_get_function_result(function_oid) = 'jsonb' then 'ok'
      else 'review'
    end as status
  from rpc_actual
),
member_access_function_expected(signature) as (
  values
    ('public.invite_company_member(uuid, text, public.member_role)'),
    ('public.update_company_member_access(uuid, public.member_role, public.member_status)')
),
member_access_function_actual as (
  select
    signature,
    to_regprocedure(signature) as function_oid
  from member_access_function_expected
),
member_access_function_checks as (
  select
    'member role hardening'::text as check_group,
    signature::text as check_name,
    jsonb_build_object(
      'contains_owner_required',
      case
        when function_oid is null then null
        else pg_get_functiondef(function_oid) like '%owner_required%'
      end
    )::text as detail,
    case
      when function_oid is null then 'missing'
      when pg_get_functiondef(function_oid) like '%owner_required%' then 'ok'
      else 'review'
    end as status
  from member_access_function_actual
),
member_policy_expected(policyname, cmd) as (
  values
    ('company_members_insert_owner_admin', 'INSERT'),
    ('company_members_update_owner_admin', 'UPDATE'),
    ('company_members_delete_owner_admin', 'DELETE')
),
member_policy_checks as (
  select
    'member role hardening'::text as check_group,
    ('public.company_members.' || expected.policyname)::text as check_name,
    jsonb_build_object(
      'cmd', policy.cmd,
      'qual', policy.qual,
      'with_check', policy.with_check
    )::text as detail,
    case
      when policy.policyname is null then 'missing'
      when policy.cmd <> expected.cmd then 'review'
      when expected.cmd = 'INSERT'
        and policy.with_check ilike '%current_user_role%'
        and policy.with_check ilike '%owner%'
        and policy.with_check not ilike '%admin%' then 'ok'
      when expected.cmd = 'UPDATE'
        and policy.qual ilike '%current_user_role%'
        and policy.qual ilike '%owner%'
        and policy.qual not ilike '%admin%'
        and policy.with_check ilike '%current_user_role%'
        and policy.with_check ilike '%owner%'
        and policy.with_check not ilike '%admin%' then 'ok'
      when expected.cmd = 'DELETE'
        and policy.qual ilike '%current_user_role%'
        and policy.qual ilike '%owner%'
        and policy.qual not ilike '%admin%' then 'ok'
      else 'review'
    end as status
  from member_policy_expected expected
  left join pg_policies policy
    on policy.schemaname = 'public'
    and policy.tablename = 'company_members'
    and policy.policyname = expected.policyname
),
legacy_pest_photo_checks as (
  select
    'data debt'::text as check_group,
    'legacy public pest photo urls'::text as check_name,
    jsonb_build_object('rows_found', count(*))::text as detail,
    case when count(*) = 0 then 'ok' else 'review' end as status
  from public.pest_alerts
  where photo_url like '%/storage/v1/object/public/pest-photos/%'
),
telegram_connection_checks as (
  select
    'data debt'::text as check_group,
    'active telegram connections without active member'::text as check_name,
    jsonb_build_object('rows_found', count(*))::text as detail,
    case when count(*) = 0 then 'ok' else 'review' end as status
  from public.notification_connections connection
  where connection.channel = 'telegram'
    and connection.status = 'active'
    and not exists (
      select 1
      from public.company_members member
      where member.company_id = connection.company_id
        and member.user_id = connection.user_id
        and member.role = 'manager'
        and member.status = 'active'
    )
),
lab_file_path_checks as (
  select
    'data debt'::text as check_group,
    'lab files with path outside company prefix'::text as check_name,
    jsonb_build_object('rows_found', count(*))::text as detail,
    case when count(*) = 0 then 'ok' else 'review' end as status
  from public.technical_lab_study_files file
  where file.storage_path not like file.company_id::text || '/%'
),
pest_photo_path_checks as (
  select
    'data debt'::text as check_group,
    'pest photos with path outside company prefix'::text as check_name,
    jsonb_build_object('rows_found', count(*))::text as detail,
    case when count(*) = 0 then 'ok' else 'review' end as status
  from public.pest_alerts alert
  where alert.photo_storage_path is not null
    and alert.photo_storage_path not like alert.company_id::text || '/%'
),
all_checks as (
  select * from storage_checks
  union all select * from rls_checks
  union all select * from helper_checks
  union all select * from constraint_checks
  union all select * from policy_checks
  union all select * from rpc_checks
  union all select * from member_access_function_checks
  union all select * from member_policy_checks
  union all select * from legacy_pest_photo_checks
  union all select * from telegram_connection_checks
  union all select * from lab_file_path_checks
  union all select * from pest_photo_path_checks
)
select
  check_group,
  check_name,
  status,
  detail
from all_checks
order by
  case status
    when 'missing' then 1
    when 'review' then 2
    else 3
  end,
  check_group,
  check_name;
