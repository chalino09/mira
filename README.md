# mira

Dashboard operativo multi-cultivo para invernaderos.

## Preparacion local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` a partir de `.env.example` y pega las llaves publicas de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-publica
```

3. Ejecuta los SQL de Supabase en este orden:

```text
supabase/01_schema.sql
supabase/02_rls_policies.sql
supabase/03_onboarding_rpc.sql
supabase/04_storage_assets.sql
supabase/05_user_management.sql
supabase/06_onboarding_improvements.sql
supabase/07_greenhouse_coordinates.sql
supabase/08_operational_planning.sql
supabase/09_manager_experience.sql
supabase/10_simplified_task_flow.sql
supabase/11_telegram_connection.sql
supabase/12_operation_technical_records.sql
supabase/13_greenhouse_manager_scope.sql
supabase/14_greenhouse_budget.sql
supabase/15_greenhouse_crop_details.sql
supabase/16_crop_ddt_stages.sql
supabase/17_nutrition_monitoring.sql
supabase/18_assigned_task_greenhouse_visibility.sql
supabase/19_telegram_operational_sessions.sql
supabase/20_nutrition_monitoring_admin_scope.sql
supabase/21_technical_lab_studies.sql
supabase/22_cost_categories.sql
supabase/23_multi_crop_foundation.sql
supabase/24_weather_snapshots.sql
supabase/25_mira_copilot.sql
supabase/26_private_pest_photos.sql
supabase/27_tenant_integrity_constraints.sql
supabase/28_rls_hardening.sql
supabase/30_function_grant_hardening.sql
```

4. Levanta la app:

```bash
npm run dev
```

## Checklist antes de usar en produccion

Corre este comando antes de desplegar:

```bash
npm run check
```

Ese comando valida lint, TypeScript y build de Next.js.

En el proveedor de deploy configura estas variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Antes de probar con datos reales, sigue el runbook de pre-produccion en `docs/pre-production-runbook.md` y corre el diagnostico de solo lectura:

```text
supabase/29_pre_production_checks.sql
```

Para activar Mira Copilot configura el secreto de OpenAI y despliega la función:

```bash
supabase secrets set OPENAI_API_KEY=sk-proj_...
supabase secrets set OPENAI_COPILOT_MODEL=gpt-5.5
supabase functions deploy mira-copilot
```

No subas archivos `.env` reales. Usa `.env.example` solo como plantilla.
