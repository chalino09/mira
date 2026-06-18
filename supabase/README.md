# mira Supabase SQL

Ejecuta estos archivos en Supabase SQL Editor en este orden:

1. `01_schema.sql`
2. `02_rls_policies.sql`
3. `03_onboarding_rpc.sql`
4. `04_storage_assets.sql`
5. `05_user_management.sql`
6. `06_onboarding_improvements.sql`
7. `03_seed_template.sql` solo si quieres datos demo manuales.

Si quieres que la empresa, nombre de usuario y primer invernadero se creen desde la app, ejecuta `03_onboarding_rpc.sql` y no ejecutes `03_seed_template.sql`. Entra con el usuario de Supabase Auth y completa la pantalla de onboarding.

Roles disponibles:

- `owner`: dueños de la empresa. Puede ver, crear, editar, borrar y administrar miembros.
- `admin`: administrador operativo. Puede ver, crear, editar, borrar y administrar miembros.
- `manager`: encargado. Puede ver, crear y editar registros operativos, pero no borrar datos ni administrar miembros.

Nota: primero crea los usuarios desde Supabase Auth. Después usa sus `auth.users.id` en `03_seed_template.sql`.

Si ya ejecutaste `02_rls_policies.sql` antes de agregar onboarding, puedes volver a ejecutarlo sin problema.

Para gestionar usuarios desde la app, ejecuta también `05_user_management.sql`. Ese archivo permite invitar miembros por correo, aceptar invitaciones al iniciar sesión y cambiar rol/estado sin dejar a la empresa sin owner activo.

Para que el primer acceso guarde variedad, etapa, trasplante, superficie, plantas y camas desde el onboarding, ejecuta también `06_onboarding_improvements.sql`.
