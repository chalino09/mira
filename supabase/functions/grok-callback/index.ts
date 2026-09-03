// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function nullableUuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > 256_000) return response({ error: "payload_too_large" }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return response({ error: "grok_not_configured" }, 503);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 256_000) {
    return response({ error: "payload_too_large" }, 413);
  }
  const body = (() => {
    try {
      return JSON.parse(rawBody);
    } catch (_error) {
      return null;
    }
  })();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response({ error: "invalid_work_payload" }, 400);
  }

  const dispatchId = nullableUuid(body.event_id ?? body.dispatch_id);
  const callbackToken = String(body.callback_token ?? "").trim();
  const callbackId = String(body.callback_id ?? "").trim().slice(0, 160);
  const status = String(body.status ?? "").trim().toLowerCase();
  const message = String(body.reply_text ?? body.message ?? "").trim().slice(0, 4000) || null;
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload
    : {};

  if (!dispatchId) return response({ error: "agent_dispatch_not_found" }, 400);
  if (!/^[0-9a-f]{64}$/i.test(callbackToken)) {
    return response({ error: "invalid_agent_callback_token" }, 401);
  }
  if (!callbackId) return response({ error: "agent_callback_id_required" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await adminClient.rpc("process_grok_work_callback", {
    target_dispatch_id: dispatchId,
    target_callback_token: callbackToken,
    target_callback_id: callbackId,
    target_status: status,
    target_message: message,
    target_payload: payload
  });

  if (error) {
    if (String(error.message ?? "").includes("invalid_agent_callback_token")) {
      return response({ error: "invalid_agent_callback_token" }, 401);
    }
    const knownClientErrors = new Set([
      "agent_callback_id_required",
      "agent_dispatch_cancelled",
      "agent_dispatch_not_found",
      "agent_reply_required",
      "application_materials_required",
      "blocked_reason_required",
      "harvest_kilograms_required",
      "invalid_agent_callback_status",
      "invalid_work_action",
      "invalid_work_occurred_at",
      "invalid_work_payload",
      "invalid_work_transition",
      "irrigation_actuals_required",
      "nutrition_method_required",
      "nutrition_products_required",
      "task_not_found"
    ]);
    const messageValue = String(error.message ?? "grok_callback_failed");
    const code = Array.from(knownClientErrors).find((candidate) => messageValue.includes(candidate));
    return response({ error: code ?? "grok_callback_failed" }, code ? 409 : 500);
  }

  return response(data ?? { ok: true });
});
