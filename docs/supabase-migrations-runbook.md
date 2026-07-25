# Runbook: migraciones Supabase

`supabase/migrations/` es la fuente de verdad para instalaciones nuevas. Los archivos numerados en `supabase/` se conservan como historial legible; no se ejecutan manualmente en instalaciones nuevas.

## Validación local desde cero

```bash
./supabase/scripts/verify-fresh-install.sh
```

El comando inicia Supabase local, borra solo la base local del proyecto y aplica todas las migraciones en orden. Debe terminar sin errores y `supabase db lint --local` no debe informar errores de tipado.

## Despliegue

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push --dry-run
supabase db push
supabase migration list
```

Nunca se usa `db reset` contra una base remota. Antes de `db push`, revisa que la lista de migraciones locales contenga `20260101000001` a `20260101000053` y la reparación `20260625000000`.

## Verificar el esquema desplegado

Después del push, abre el SQL Editor con rol `postgres` y ejecuta [verify_deployed_schema.sql](../supabase/diagnostics/verify_deployed_schema.sql), seguido de [29_pre_production_checks.sql](../supabase/29_pre_production_checks.sql). Ambos diagnósticos deben devolver únicamente filas `ok`; investiga cualquier `missing` o `review`.

Para comprobar la historia de migraciones directamente:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

La comprobación P0 de revocación está en `supabase/tests/p0_authorization_revocation.sql`; se ejecuta solo en una base de prueba, pues crea fixtures temporales y hace rollback.

La migración 53 define el contrato mínimo de Work. La app consulta `assert_work_schema_ready()` antes de completar trabajos simples; si falta, muestra `work_schema_update_required` y no actualiza `tasks.status` directamente.
