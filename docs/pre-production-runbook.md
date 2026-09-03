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
3. Ejecuta `npm run check:ci` en local.
4. Ejecuta `npm run test:db` para validar la cadena de migraciones y regresiones de RLS, Work, inventario y multiempresa en una base local limpia.
5. Despliega las Edge Functions tocadas.
6. Corre `supabase/29_pre_production_checks.sql` en Supabase SQL Editor.
7. Haz smoke test manual con owner/admin, manager activo y manager desactivado.

## Orden de SQL

En un proyecto nuevo, aplica exclusivamente los archivos en `supabase/migrations/`, en orden. Para reproducirlo localmente usa `supabase db reset --local` o `npm run test:db`.

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
supabase secrets set GROK_ROUTINE_URL="https://..."
supabase secrets set GROK_ROUTINE_SENDER_KEY="sender_key_de_la_rutina"
supabase secrets set GROK_CALLBACK_URL="https://<PROJECT_REF>.supabase.co/functions/v1/grok-callback"
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
supabase functions deploy grok-dispatch --no-verify-jwt
supabase functions deploy grok-callback --no-verify-jwt
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
5. Confirma que Grok envía por WhatsApp Web y que `LISTO` aparece en la bitácora de la actividad.
6. Confirma que no ve costos, laboratorio, monitoreo nutrimental administrativo ni Copilot.

Manager desactivado:

1. Con owner/admin, cambia el miembro a `inactive`.
2. Envía un callback para una actividad de ese encargado.
3. Mira debe rechazarlo porque la asignación ya no está activa.
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

- `npm run check:ci` pasa.
- `npm run test:db` pasa.
- `29_pre_production_checks.sql` no muestra `missing` y los `review` estan justificados.
- Owner/admin y manager activo pasan smoke test.
- Manager desactivado no puede operar mediante callbacks de Grok.
- Adjuntos privados no cargan por URL publica directa.
- Hay backup reciente y sabes como restaurarlo.
