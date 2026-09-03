# Grok Bot + WhatsApp Web

Mira entrega eventos estructurados a una rutina de Grok Bot. Grok usa exclusivamente WhatsApp Web para hablar con los encargados y devuelve callbacks autenticados con un token distinto por actividad.

## 1. Preparar la rutina

1. Crea la rutina `Mira nuevas actividades` en Grok Bot.
2. Copia su `POST URL` y `sender key` desde la app de escritorio.
3. Vincula el número dedicado en `web.whatsapp.com` mediante QR.

Los encargados con cuenta se administran desde `Ajustes → Usuarios y permisos → Editar perfil`.
Guarda ahí su teléfono de WhatsApp; no los vuelvas a crear como encargados internos porque eso duplicaría a la persona.

Mira genera automáticamente el token de cada callback. No necesitas guardar ningún secreto dentro de Grok.

## 2. Configurar Supabase

```bash
supabase secrets set \
  GROK_ROUTINE_URL="https://..." \
  GROK_ROUTINE_SENDER_KEY="..." \
  GROK_CALLBACK_URL="https://<PROJECT_REF>.supabase.co/functions/v1/grok-callback"

supabase functions deploy grok-dispatch --no-verify-jwt
supabase functions deploy grok-callback --no-verify-jwt
```

## 3. Instrucciones de la rutina

```text
Eres el encargado de comunicación operativa de Mira.

Cuando recibas un evento:
1. Valida schema_version, event_id, company_id, company_name, activity_id, assignee y phone.
2. Envía la actividad una sola vez por WhatsApp Web al número exacto recibido e inicia el mensaje con la empresa indicada en company_name.
3. Conserva callback_token solo para este evento y devuélvelo sin modificar en cada llamada a callback_url.
4. Después del envío, llama callback_url con status=sent y un callback_id nuevo.
5. Revisa respuestas pendientes cada 10 minutos en horario laboral.
6. Guarda el texto original completo:
   - LISTO: reúne los datos técnicos requeridos y llama status=completed.
   - PROBLEMA: reúne el motivo y llama status=blocked.
   - Otro mensaje: llama status=responded y pide aclaración si hace falta.
7. Nunca cambies responsable, planeación, fecha programada ni materiales.
8. Si WhatsApp falla, llama status=failed con el motivo.
9. Reutiliza el mismo callback_id al reintentar exactamente el mismo callback.
```

## 4. Formato del callback

```json
{
  "event_id": "uuid-del-evento",
  "callback_token": "token-recibido-en-el-evento",
  "callback_id": "uuid-nuevo-por-respuesta",
  "status": "sent|responded|completed|blocked|failed",
  "reply_text": "Texto original del encargado",
  "payload": {
    "occurredAt": "2026-08-27"
  }
}
```

Envía el callback como JSON a `callback_url`. No inventes, compartas ni reutilices el token en otra actividad.

Para riego, `payload` requiere `durationMin` y `estimatedLiters`; para nutrición, `method`; para cosecha, `kilograms`. Aplicaciones requieren materiales planeados y su categoría.

## 5. Piloto

Prueba con dos encargados: envío nuevo, modificación, duplicado, teléfono faltante, `LISTO`, `PROBLEMA`, sesión vencida de WhatsApp y callback repetido. Un `200` del webhook de Grok solo confirma recepción: Mira muestra `Grok recibió` y cambia a `WhatsApp enviado` cuando llega el callback `sent`.
