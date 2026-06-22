# mira

Dashboard operativo para invernaderos de jitomate.

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

No subas archivos `.env` reales. Usa `.env.example` solo como plantilla.
