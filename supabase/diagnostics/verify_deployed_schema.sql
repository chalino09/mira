-- Run after `supabase db push` or `supabase db reset --local`.
-- Any row with status other than `ok` requires investigation before release.
with expected_migrations(version) as (
  values
    ('20260101000001'), ('20260101000002'), ('20260101000003'),
    ('20260101000004'), ('20260101000005'), ('20260101000006'),
    ('20260101000007'), ('20260101000008'), ('20260101000009'),
    ('20260101000010'), ('20260101000011'), ('20260101000012'),
    ('20260101000013'), ('20260101000014'), ('20260101000015'),
    ('20260101000016'), ('20260101000017'), ('20260101000018'),
    ('20260101000019'), ('20260101000020'), ('20260101000021'),
    ('20260101000022'), ('20260101000023'), ('20260101000024'),
    ('20260101000025'), ('20260101000026'), ('20260101000027'),
    ('20260101000028'), ('20260101000029'), ('20260101000030'),
    ('20260101000031'), ('20260101000032'), ('20260101000033'),
    ('20260101000034'), ('20260101000035'), ('20260101000036'),
    ('20260101000037'), ('20260101000038'), ('20260101000039'),
    ('20260101000040'), ('20260101000041'), ('20260101000042'),
    ('20260101000043'), ('20260101000044'), ('20260101000045'),
    ('20260101000046'), ('20260101000047'), ('20260101000048'),
    ('20260101000049'), ('20260101000050'), ('20260101000051'),
    ('20260101000052'), ('20260101000053'), ('20260625000000')
),
migration_checks as (
  select
    'migration history'::text as check_group,
    expected.version as check_name,
    case when actual.version is null then 'missing' else 'ok' end as status,
    coalesce(actual.name, '') as detail
  from expected_migrations expected
  left join supabase_migrations.schema_migrations actual
    on actual.version = expected.version
),
object_checks as (
  select
    'schema objects'::text as check_group,
    expected.name as check_name,
    case when expected.object_oid is null then 'missing' else 'ok' end as status,
    coalesce(expected.object_oid::regprocedure::text, '') as detail
  from (
    values
      ('public.is_active_company_member(uuid)', to_regprocedure('public.is_active_company_member(uuid)')),
      ('public.can_operate_work(uuid)', to_regprocedure('public.can_operate_work(uuid)')),
      ('public.assert_work_schema_ready()', to_regprocedure('public.assert_work_schema_ready()')),
      ('public.get_view_operational_aggregates(uuid, uuid, date, date)', to_regprocedure('public.get_view_operational_aggregates(uuid, uuid, date, date)'))
  ) as expected(name, object_oid)
),
policy_checks as (
  select
    'P0 policies'::text as check_group,
    expected.schemaname || '.' || expected.tablename || '.' || expected.policyname as check_name,
    case when policy.policyname is null then 'missing' else 'ok' end as status,
    coalesce(policy.schemaname || '.' || policy.tablename || ' ' || policy.cmd, '') as detail
  from (values
    ('public', 'tasks', 'tasks_select_operational'),
    ('public', 'greenhouses', 'greenhouses_select_scoped'),
    ('public', 'work_evidence', 'work_evidence_select_company_member'),
    ('storage', 'objects', 'work_evidence_select_company_member'),
    ('storage', 'objects', 'work_evidence_insert_work_operator')
  ) as expected(schemaname, tablename, policyname)
  left join pg_policies policy
    on policy.schemaname = expected.schemaname
   and policy.tablename = expected.tablename
   and policy.policyname = expected.policyname
)
select * from migration_checks
union all select * from object_checks
union all select * from policy_checks
order by status, check_group, check_name;
