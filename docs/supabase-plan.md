# mira + Supabase

## Cómo lo haría

Piensa la app como multi-empresa desde el inicio:

- **Empresa / organización**: la empresa de tus papás.
- **Dueños**: tus papás. Tienen rol `owner`.
- **Admin**: tú o alguien de confianza que ayude a configurar usuarios e invernaderos. Rol `admin`.
- **Encargado general**: persona que administra operación diaria y captura registros. Rol `manager`.

La unidad principal de permisos es `organization_id`. Todo lo importante cuelga de esa empresa: invernaderos, tareas, riegos, nutrición, aplicaciones, plagas, cosechas y costos.

## Roles sugeridos

- `owner`: ve y edita todo, invita personas, cambia roles.
- `admin`: casi como owner, útil si tú administras la app.
- `manager`: ve todo y captura/edita operación, pero no cambia dueños.

## Flujo real

1. Creas proyecto en Supabase.
2. Pegas los archivos de `supabase/` en orden: `01_schema.sql`, `02_rls_policies.sql`, `03_seed_template.sql`.
3. Creas usuarios para tus papás desde Auth.
4. Insertas una organización, por ejemplo `Invernaderos Familia`.
5. Metes a tus papás en `organization_members` como `owner`.
6. Metes al encargado como `manager`.
7. Metes encargados como `manager`.
8. Cada tabla queda protegida por RLS para que solo miembros de esa empresa vean la información.

## Siguiente paso de código

Después de crear las tablas, la app debe cambiar de datos mock a Supabase:

- instalar `@supabase/supabase-js`
- crear `lib/supabase/client.ts`
- crear `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- leer `greenhouses`, `tasks`, `irrigation_records`, etc. desde Supabase
- cambiar los formularios para hacer `insert`
