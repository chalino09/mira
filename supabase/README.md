# mira Supabase SQL

Ejecuta estos archivos en Supabase SQL Editor en este orden:

1. `01_schema.sql`
2. `02_rls_policies.sql`
3. `03_onboarding_rpc.sql`
4. `04_storage_assets.sql`
5. `05_user_management.sql`
6. `06_onboarding_improvements.sql`
7. `07_greenhouse_coordinates.sql`
8. `08_operational_planning.sql`
9. `09_manager_experience.sql`
10. `10_simplified_task_flow.sql`
11. `11_telegram_connection.sql`
12. `12_operation_technical_records.sql`
13. `13_greenhouse_manager_scope.sql`
14. `14_greenhouse_budget.sql`
15. `15_greenhouse_crop_details.sql`
16. `16_crop_ddt_stages.sql`
17. `17_nutrition_monitoring.sql`
18. `18_assigned_task_greenhouse_visibility.sql`
19. `19_telegram_operational_sessions.sql`
20. `20_nutrition_monitoring_admin_scope.sql`
21. `21_technical_lab_studies.sql`
22. `22_cost_categories.sql`
23. `03_seed_template.sql` solo si quieres datos demo manuales.

Si quieres que la empresa, nombre de usuario y primer invernadero se creen desde la app, ejecuta `03_onboarding_rpc.sql` y no ejecutes `03_seed_template.sql`. Entra con el usuario de Supabase Auth y completa la pantalla de onboarding.

Roles disponibles:

- `owner`: dueños de la empresa. Puede ver, crear, editar, borrar y administrar miembros.
- `admin`: administrador operativo. Puede ver, crear, editar, borrar y administrar miembros.
- `manager`: encargado. Puede ver y capturar registros solo del invernadero donde esté asignado como responsable.

Nota: primero crea los usuarios desde Supabase Auth. Después usa sus `auth.users.id` en `03_seed_template.sql`.

Si ya ejecutaste `02_rls_policies.sql` antes de agregar onboarding, puedes volver a ejecutarlo sin problema.

Para gestionar usuarios desde la app, ejecuta también `05_user_management.sql`. Ese archivo permite invitar miembros por correo, aceptar invitaciones al iniciar sesión y cambiar rol/estado sin dejar a la empresa sin owner activo.

Para que el primer acceso guarde variedad, etapa, trasplante, superficie, plantas y camas desde el onboarding, ejecuta también `06_onboarding_improvements.sql`.

Para exigir y guardar latitud, longitud y precisión por invernadero, ejecuta también `07_greenhouse_coordinates.sql`.

Para activar planeación semanal, asignaciones, trazabilidad operativa y la cola preparada para Telegram, ejecuta `08_operational_planning.sql`.

Para pedir el nombre real al primer acceso y limitar información administrativa para managers, ejecuta `09_manager_experience.sql`.

Para usar el flujo simple pendiente, completada o bloqueada sin registrar inicio manual, ejecuta `10_simplified_task_flow.sql`.

Para permitir que cada manager vincule su chat de Telegram, ejecuta `11_telegram_connection.sql`.

Para guardar la planeación técnica dinámica y registrar automáticamente aplicaciones, riegos, nutriciones y cosechas al completarlas, sin duplicarlas, ejecuta `12_operation_technical_records.sql`.

Para que cada encargado vea únicamente su invernadero asignado y no los demás, ejecuta `13_greenhouse_manager_scope.sql`.

Para agregar presupuesto opcional por invernadero/ciclo y compararlo contra costos reales, ejecuta `14_greenhouse_budget.sql`.

Para guardar si el cultivo va a un tallo o doble tallo y si usa injerto, ejecuta `15_greenhouse_crop_details.sql`.

Para agregar la base multi-cultivo, ciclos, etapas DDT, rangos nutrimentales y plantillas por cultivo, ejecuta `16_crop_ddt_stages.sql`.

Para guardar monitoreo nutrimental de extracto celular de peciolo y solución de suelo, con observaciones fijas y recomendaciones editables por parámetro, ejecuta `17_nutrition_monitoring.sql`.

Para que los encargados vean el nombre del invernadero en actividades donde fueron asignados, aunque no sean el responsable principal del invernadero, ejecuta `18_assigned_task_greenhouse_visibility.sql`.

Para que Telegram recuerde selección por número, captura mínima y confirmación SI/NO antes de completar o bloquear actividades, ejecuta `19_telegram_operational_sessions.sql`.

Para restringir el monitoreo nutrimental a owner/admin y ocultarlo a managers, ejecuta `20_nutrition_monitoring_admin_scope.sql`.

Para agregar Laboratorio dentro de Monitoreo con estudios técnicos, parámetros editables y archivos privados de laboratorio, ejecuta `21_technical_lab_studies.sql`.

Para agregar categorías rápidas de costos como refrescos, renta y gasolina, ejecuta `22_cost_categories.sql`.

Laboratorio usa IA para extraer PDFs/imágenes con la función `lab-extract`. Configura secretos antes de usarla:

```bash
supabase secrets set OPENAI_API_KEY=sk-proj_...
supabase secrets set OPENAI_LAB_MODEL=gpt-5.5
supabase functions deploy lab-extract
```

## Conectar Telegram

1. En Telegram abre `@BotFather`, ejecuta `/newbot` y guarda el token y username entregados.
2. Genera un secreto para validar el webhook:

```bash
openssl rand -hex 32
```

3. Vincula Supabase CLI con el proyecto usando el identificador que aparece en la URL del proyecto:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
```

4. Guarda los tres valores como secretos de Edge Functions. El username va sin `@`:

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN="token_de_botfather" \
  TELEGRAM_BOT_USERNAME="username_del_bot" \
  TELEGRAM_WEBHOOK_SECRET="secreto_generado"
```

5. Despliega las funciones:

```bash
supabase functions deploy telegram-link
supabase functions deploy telegram-dispatch
supabase functions deploy telegram-webhook --no-verify-jwt
```

6. Registra el webhook reemplazando los valores entre `< >`:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query"]'
```

Después, el manager entra a Mira, pulsa `Telegram`, abre el enlace y presiona `Iniciar` dentro del bot. Cuando un owner o admin publica una semana en `Operación`, `telegram-dispatch` procesa la cola y envía las actividades asignadas a cada chat conectado. Los tokens y secretos nunca deben usar el prefijo `NEXT_PUBLIC_` ni guardarse en Git.
