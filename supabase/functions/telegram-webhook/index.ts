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

const activityLabels: Record<string, string> = {
  riego: "Riego",
  fertirriego: "Fertirriego",
  fertilizacion: "Fertilizacion",
  aplicacion_foliar: "Aplicacion foliar",
  revision_plagas: "Revision de plagas y enfermedades",
  poda: "Deschuponado",
  tutoreo: "Manejo de rafia",
  deshoje: "Deshoje",
  cosecha: "Cosecha",
  limpieza: "Limpieza",
  mantenimiento: "Mantenimiento",
  otro: "Otra"
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localIsoDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Mexico_City",
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function activityLabel(task: any) {
  if (task.type === "otro" && task.technical_plan?.cycleWorkType) return "Preparacion de ciclo";
  return activityLabels[task.type] ?? task.type;
}

function parseOperationalReply(text: string) {
  const normalized = normalizeText(text);
  if (!normalized || normalized === "/start" || normalized === "ayuda" || normalized === "help") {
    return { action: "help", query: "", note: "" };
  }

  const completeMatch = normalized.match(/\b(completad[oa]?|terminad[oa]?|termine|hecho|lista?|realizad[oa]?)\b/);
  if (completeMatch) {
    return {
      action: "complete",
      note: text,
      query: normalized
        .replace(/\b(completad[oa]?|terminad[oa]?|termine|hecho|lista?|realizad[oa]?)\b/g, " ")
        .replace(/\b(de|del|la|el|hoy|actividad|tarea|ya)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    };
  }

  const blockedMatch = normalized.match(/\b(bloquead[oa]?|bloquear|no puedo|no se puede|problema|falta)\b/);
  if (blockedMatch) {
    return {
      action: "block",
      note: text,
      query: normalized
        .replace(/\b(bloquead[oa]?|bloquear|no puedo|no se puede|problema|falta)\b/g, " ")
        .replace(/\b(de|del|la|el|hoy|actividad|tarea|por|porque|ya)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    };
  }

  return { action: "unknown", query: normalized, note: text };
}

function taskSearchText(task: any, greenhouseName = "") {
  return normalizeText([
    task.title,
    activityLabel(task),
    task.instructions,
    greenhouseName,
    task.technical_plan?.sector,
    task.technical_plan?.appliedArea,
    task.technical_plan?.rafiaSector,
    task.technical_plan?.maintenanceSector,
    task.technical_plan?.cycleSector,
    task.technical_plan?.harvestZone
  ].filter(Boolean).join(" "));
}

function scoreTask(task: any, query: string, greenhouseName = "") {
  const tokens = query.split(" ").filter((token) => token.length > 2);
  if (!tokens.length) return 0;
  const haystack = taskSearchText(task, greenhouseName);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function taskLine(task: any, greenhouseName = "Invernadero") {
  const time = task.scheduled_time ? task.scheduled_time.slice(0, 5) : "Sin hora";
  return `${time} · ${activityLabel(task)} · ${task.title} · ${greenhouseName}`;
}

async function handleOperationalReply({
  adminClient,
  botToken,
  chatId,
  connection,
  text
}: {
  adminClient: any;
  botToken: string;
  chatId: string;
  connection: any;
  text: string;
}) {
  const parsed = parseOperationalReply(text);
  if (parsed.action === "help") {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Puedes responder: completado riego de hoy. Tambien: bloqueado deshoje por falta de material."
    );
    return;
  }

  if (parsed.action === "unknown") {
    await sendTelegramMessage(
      botToken,
      chatId,
      "No entendi la respuesta. Usa algo como: completado riego de hoy."
    );
    return;
  }

  const { data: assignments, error: assignmentsError } = await adminClient
    .from("task_assignments")
    .select("task_id")
    .eq("company_id", connection.company_id)
    .eq("user_id", connection.user_id);

  if (assignmentsError) {
    await sendTelegramMessage(botToken, chatId, "No pude consultar tus actividades. Intenta desde Mira.");
    return;
  }

  const taskIds = (assignments ?? []).map((assignment: any) => assignment.task_id).filter(Boolean);
  if (!taskIds.length) {
    await sendTelegramMessage(botToken, chatId, "No tienes actividades asignadas.");
    return;
  }

  const today = localIsoDate();
  const lowerText = normalizeText(text);
  const dateStart = lowerText.includes("hoy") ? today : addDays(today, -2);
  const dateEnd = lowerText.includes("manana") ? localIsoDate(1) : addDays(today, 10);

  const { data: tasks, error: tasksError } = await adminClient
    .from("tasks")
    .select("id, company_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, instructions, technical_plan")
    .eq("company_id", connection.company_id)
    .in("id", taskIds)
    .not("status", "in", "(completada,cancelada)")
    .gte("scheduled_date", dateStart)
    .lte("scheduled_date", dateEnd)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  if (tasksError) {
    await sendTelegramMessage(botToken, chatId, "No pude leer tus actividades. Intenta desde Mira.");
    return;
  }

  if (!tasks?.length) {
    await sendTelegramMessage(botToken, chatId, "No encontre actividades pendientes para completar o bloquear.");
    return;
  }

  const greenhouseIds = Array.from(new Set(tasks.map((task: any) => task.greenhouse_id).filter(Boolean)));
  const { data: greenhouses } = greenhouseIds.length
    ? await adminClient
        .from("greenhouses")
        .select("id, name")
        .eq("company_id", connection.company_id)
        .in("id", greenhouseIds)
    : { data: [] };
  const greenhouseById = new Map((greenhouses ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name]));

  let candidates = tasks;
  if (lowerText.includes("hoy")) {
    candidates = candidates.filter((task: any) => task.scheduled_date === today);
  } else if (lowerText.includes("manana")) {
    const tomorrow = localIsoDate(1);
    candidates = candidates.filter((task: any) => task.scheduled_date === tomorrow);
  }

  if (parsed.query) {
    const scored = candidates
      .map((task: any) => ({
        score: scoreTask(task, parsed.query, greenhouseById.get(task.greenhouse_id) ?? ""),
        task
      }))
      .filter((item: any) => item.score > 0)
      .sort((left: any, right: any) => right.score - left.score);
    const bestScore = scored[0]?.score ?? 0;
    candidates = scored.filter((item: any) => item.score === bestScore).map((item: any) => item.task);
  }

  if (candidates.length !== 1) {
    const lines = candidates.slice(0, 5).map((task: any, index: number) =>
      `${index + 1}. ${taskLine(task, greenhouseById.get(task.greenhouse_id) ?? "Invernadero")}`
    );
    await sendTelegramMessage(
      botToken,
      chatId,
      candidates.length
        ? `Tengo varias posibles actividades. Responde con mas detalle:\n${lines.join("\n")}`
        : "No encontre una actividad que coincida. Intenta con el nombre, por ejemplo: completado riego."
    );
    return;
  }

  const task = candidates[0];
  const nextStatus = parsed.action === "complete" ? "completada" : "bloqueada";
  const updatePatch = parsed.action === "complete"
    ? {
        blocked_reason: null,
        completed_at: new Date().toISOString(),
        started_at: null,
        status: nextStatus,
        updated_at: new Date().toISOString()
      }
    : {
        blocked_reason: parsed.note,
        completed_at: null,
        started_at: null,
        status: nextStatus,
        updated_at: new Date().toISOString()
      };

  const { error: updateError } = await adminClient
    .from("tasks")
    .update(updatePatch)
    .eq("id", task.id)
    .eq("company_id", connection.company_id);

  if (updateError) {
    await sendTelegramMessage(botToken, chatId, "No pude actualizar la actividad. Intenta desde Mira.");
    return;
  }

  await adminClient.from("task_updates").insert({
    actor_user_id: connection.user_id,
    company_id: connection.company_id,
    note: `Telegram: ${text}`,
    task_id: task.id,
    update_type: parsed.action === "complete" ? "completed" : "blocked"
  });

  await sendTelegramMessage(
    botToken,
    chatId,
    parsed.action === "complete"
      ? `Listo. Marque como completada: ${taskLine(task, greenhouseById.get(task.greenhouse_id) ?? "Invernadero")}`
      : `Listo. Reporte bloqueo en: ${taskLine(task, greenhouseById.get(task.greenhouse_id) ?? "Invernadero")}`
  );
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
    .select("id, company_id, user_id")
    .eq("channel", "telegram")
    .eq("external_chat_id", chatId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (activeConnection) {
    await handleOperationalReply({ adminClient, botToken, chatId, connection: activeConnection, text });
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
