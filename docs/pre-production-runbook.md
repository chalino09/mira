# Pre-production runbook

Este runbook es la lista corta para pasar de "funciona en mi proyecto Supabase" a "lo puedo probar con datos reales sin jugar con fuego".

## Objetivo

Validar antes de produccion:

- aislamiento multiempresa,
- RLS y permisos de storage,
- funciones Edge con `service_role` acotado por `company_id`,
- flujos criticos por rol,
- plan de rollback si algo falla.

## Antes de tocar produccion

1. Confirma que `.env`, `.env.local` y secretos reales no estan en Git.
2. Toma un backup o snapshot desde Supabase antes de correr SQL nuevo.
3. Ejecuta `npm run check` en local.
4. Despliega las Edge Functions tocadas.
5. Corre `supabase/29_pre_production_checks.sql` en Supabase SQL Editor.
6. Si el diagnostico marca helpers con `anon_execute = true`, corre `supabase/30_function_grant_hardening.sql` y repite el diagnostico.
7. Si el diagnostico marca `operational rpc returns` en `review`, corre `supabase/31_operation_completion_result_ids.sql` y repite el diagnostico.
8. Si el diagnostico marca `member role hardening` en `review`, corre `supabase/32_owner_only_role_management.sql` y repite el diagnostico.
9. Si vas a habilitar chat y memoria de Mira, corre `supabase/33_mira_copilot_memory_chat.sql` y repite el diagnostico.
10. Si vas a habilitar historial sanitario por alerta, corre `supabase/34_pest_alert_followup_history.sql` y repite el diagnostico.
11. Haz smoke test manual con owner/admin, manager activo y manager desactivado.

## Orden de SQL

En un proyecto nuevo, ejecuta `supabase/01_schema.sql` hasta `supabase/34_pest_alert_followup_history.sql` en orden.

Si el proyecto ya tiene los SQL aplicados, no repitas todo por costumbre. Aplica solo los archivos nuevos que falten y despues corre:

```text
supabase/29_pre_production_checks.sql
```

`29_pre_production_checks.sql` es solo lectura. No crea, actualiza ni borra datos.

Si el diagnostico muestra `helper grants` en `review` por `anon_execute = true`, aplica:

```text
supabase/30_function_grant_hardening.sql
```

Si muestra `operational rpc returns` en `review`, aplica:

```text
supabase/31_operation_completion_result_ids.sql
```

Si muestra `member role hardening` en `review`, aplica:

```text
supabase/32_owner_only_role_management.sql
```

Para habilitar conversaciones y memoria de Mira, aplica despues:

```text
supabase/33_mira_copilot_memory_chat.sql
```

Para habilitar historial por alerta sanitaria, aplica despues:

```text
supabase/34_pest_alert_followup_history.sql
```

## Deploy de funciones

Configura secretos en Supabase, nunca en variables `NEXT_PUBLIC_`:

```bash
supabase secrets set OPENAI_API_KEY=sk-proj_...
supabase secrets set OPENAI_COPILOT_MODEL=gpt-5.5
supabase secrets set OPENAI_LAB_MODEL=gpt-5.5
supabase secrets set TELEGRAM_BOT_TOKEN="token_de_botfather"
supabase secrets set TELEGRAM_BOT_USERNAME="username_del_bot"
supabase secrets set TELEGRAM_WEBHOOK_SECRET="secreto_largo"
```

Confirma que las funciones tienen acceso a:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Despliega:

```bash
supabase functions deploy mira-copilot
supabase functions deploy mira-chat
supabase functions deploy lab-extract
supabase functions deploy telegram-dispatch
supabase functions deploy telegram-link
supabase functions deploy telegram-webhook --no-verify-jwt
```

Despues registra o actualiza el webhook de Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query"]'
```

## Checks SQL

Corre `supabase/29_pre_production_checks.sql` completo en SQL Editor.

Interpreta resultados asi:

- `ok`: esperado.
- `review`: existe, pero no coincide con el hardening esperado.
- `missing`: falta el objeto.

Si aparece `review` o `missing`, no avances a datos reales hasta entenderlo.

## Smoke tests manuales

Owner/admin:

1. Inicia sesion y confirma que ve empresa, invernaderos, miembros y costos.
2. Crea o edita un invernadero.
3. Crea un plan semanal y publica.
4. Sube un archivo de laboratorio y ejecuta extraccion.
5. Ejecuta Mira Copilot para la empresa y para un invernadero.
6. Pregunta algo en el chat de Mira y confirma que guarda conversacion, evidencia y acciones sugeridas.
7. Confirma que puede ver adjuntos privados mediante URLs firmadas.

Manager activo:

1. Inicia sesion y confirma que solo ve su invernadero asignado.
2. Registra riego, nutricion, aplicacion, cosecha y alerta sanitaria.
3. Sube una foto sanitaria y confirma que se muestra despues de refrescar.
4. Agrega seguimiento a una alerta sanitaria y confirma que aparece en el historial.
5. Vincula Telegram y responde una tarea asignada.
6. Confirma que no ve costos, laboratorio, monitoreo nutrimental administrativo ni Copilot.

Manager desactivado:

1. Con owner/admin, cambia el miembro a `inactive`.
2. Envia un mensaje al bot con ese usuario de Telegram.
3. Debe recibir respuesta de acceso desactivado o no poder operar.
4. Publica o reprocesa una semana.
5. Confirma que no se le envian nuevas tareas y que la cola queda fallida para ese usuario.

Multiempresa:

1. Crea dos empresas con usuarios distintos.
2. Intenta usar IDs de la empresa A dentro de registros de empresa B.
3. Debe fallar por RLS o por FK compuesta.
4. Confirma que storage usa paths con prefijo `company_id/`.

## Rollback

SQL:

- Para cambios P0/P1 ya aplicados, el rollback realista es restaurar snapshot o backup.
- Si el problema es una policy concreta, crea un SQL de reparacion pequeno y revisado.
- Evita borrar constraints a ciegas en produccion.

Funciones:

- Redeploy del commit anterior de la funcion afectada.
- Si hubo fuga o exposicion accidental, rota secretos antes de redeploy.

Frontend:

- Rollback del deploy de Next.js desde el proveedor.
- Verifica que el rollback no espere columnas nuevas que solo existen en la BD actual.

## Criterio de salida

Puedes pasar a beta controlada cuando:

- `npm run check` pasa.
- `29_pre_production_checks.sql` no muestra `missing` y los `review` estan justificados.
- Owner/admin y manager activo pasan smoke test.
- Manager desactivado no puede operar por Telegram.
- Adjuntos privados no cargan por URL publica directa.
- Hay backup reciente y sabes como restaurarlo.
