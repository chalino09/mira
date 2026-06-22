// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
  const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!webhookSecret || !safeEqual(receivedSecret, webhookSecret)) {
    return response({ error: "invalid_webhook_secret" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    return response({ error: "telegram_not_configured" }, 503);
  }

  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (!message?.chat?.id || message.chat.type !== "private") return response({ ok: true });

  const chatId = String(message.chat.id);
  const text = String(message.text ?? "").trim();
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: activeConnection } = await adminClient
    .from("notification_connections")
    .select("id")
    .eq("channel", "telegram")
    .eq("external_chat_id", chatId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (activeConnection) {
    await sendTelegramMessage(botToken, chatId, "Tu cuenta de Telegram ya está conectada con Mira.");
    return response({ ok: true });
  }

  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{20,64}))?$/);
  const token = startMatch?.[1];
  if (!token) {
    await sendTelegramMessage(botToken, chatId, "Abre Mira y pulsa Conectar Telegram para generar un enlace seguro.");
    return response({ ok: true });
  }

  const tokenHash = await sha256(token);
  const { data: connection } = await adminClient
    .from("notification_connections")
    .select("id")
    .eq("channel", "telegram")
    .eq("verification_code_hash", tokenHash)
    .eq("status", "pending")
    .gt("verification_expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (!connection) {
    await sendTelegramMessage(botToken, chatId, "Este enlace venció o ya fue usado. Genera uno nuevo desde Mira.");
    return response({ ok: true });
  }

  const displayName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ");
  const { error } = await adminClient
    .from("notification_connections")
    .update({
      external_chat_id: chatId,
      external_username: message.from?.username ?? null,
      external_display_name: displayName || null,
      verification_code_hash: null,
      verification_expires_at: null,
      status: "active",
      verified_at: new Date().toISOString()
    })
    .eq("id", connection.id)
    .eq("status", "pending");

  if (error) {
    await sendTelegramMessage(botToken, chatId, "No pudimos completar la conexión. Intenta generar otro enlace desde Mira.");
    return response({ ok: true });
  }

  await sendTelegramMessage(botToken, chatId, "Telegram quedó conectado con Mira. Aquí recibirás tus actividades operativas.");
  return response({ ok: true });
});
