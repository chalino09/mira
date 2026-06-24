// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

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

const priorityLabels: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  critical: "Critica"
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function dateLabel(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${iso}T12:00:00Z`));
}

function weekLabel(weekStart: string) {
  return `${dateLabel(weekStart)} - ${dateLabel(addDays(weekStart, 6))}`;
}

function activityLabel(task: any) {
  if (task.type === "otro" && task.technical_plan?.cycleWorkType) return "Preparacion de ciclo";
  return activityLabels[task.type] ?? task.type;
}

function taskTime(task: any) {
  return task.scheduled_time ? task.scheduled_time.slice(0, 5) : "Sin hora";
}

function materialLine(material: any) {
  return [
    material.product_name,
    material.dose ? `· ${material.dose}` : "",
    material.unit ? material.unit : ""
  ].filter(Boolean).join(" ");
}

function buildWeeklyMessage({
  greenhouseById,
  materialsByTaskId,
  tasks,
  weekStart
}: {
  greenhouseById: Map<string, string>;
  materialsByTaskId: Map<string, any[]>;
  tasks: any[];
  weekStart: string;
}) {
  const sortedTasks = [...tasks].sort((left, right) => {
    const dateCompare = String(left.scheduled_date).localeCompare(String(right.scheduled_date));
    if (dateCompare) return dateCompare;
    return String(left.scheduled_time ?? "").localeCompare(String(right.scheduled_time ?? ""));
  });

  const lines = [
    "Mira - Actividades de la semana",
    weekLabel(weekStart),
    `${sortedTasks.length} ${sortedTasks.length === 1 ? "actividad" : "actividades"}`,
    ""
  ];

  let currentDay = "";
  sortedTasks.forEach((task) => {
    if (task.scheduled_date !== currentDay) {
      currentDay = task.scheduled_date;
      lines.push(dateLabel(currentDay).toUpperCase());
    }

    const greenhouseName = greenhouseById.get(task.greenhouse_id) ?? "Invernadero";
    const priority = task.priority && task.priority !== "normal" ? ` · ${priorityLabels[task.priority] ?? task.priority}` : "";
    lines.push(`- ${taskTime(task)} · ${activityLabel(task)}${priority}`);
    lines.push(`  ${task.title}`);
    lines.push(`  ${greenhouseName}`);

    if (task.instructions) {
      lines.push(`  ${task.instructions}`);
    }

    const materials = materialsByTaskId.get(task.id) ?? [];
    if (materials.length) {
      lines.push(`  Insumos: ${materials.map(materialLine).join("; ")}`);
    }
  });

  lines.push("");
  lines.push("Responde en Mira al completar o bloquear una actividad.");

  return lines.join("\n");
}

function splitMessage(text: string) {
  const chunks: string[] = [];
  let current = "";
  for (const block of text.split("\n\n")) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > 3600 && current) {
      chunks.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  for (const chunk of splitMessage(text)) {
    const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        disable_web_page_preview: true,
        text: chunk
      })
    });

    if (!result.ok) {
      const errorText = await result.text().catch(() => "");
      throw new Error(errorText || `telegram_http_${result.status}`);
    }
  }
}

async function updateOutbox(adminClient: any, rows: any[], patch: Record<string, unknown>) {
  if (!rows.length) return;
  const attempts = Math.max(...rows.map((row) => row.attempts ?? 0)) + 1;
  await adminClient
    .from("notification_outbox")
    .update({ ...patch, attempts })
    .in("id", rows.map((row) => row.id));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken) {
    return response({ error: "telegram_not_configured" }, 503);
  }
  if (!authorization) return response({ error: "not_authenticated" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();

  if (authError || !authData.user) return response({ error: "not_authenticated" }, 401);

  const body = await request.json().catch(() => ({}));
  const weeklyPlanId = String(body.weeklyPlanId ?? "");
  if (!weeklyPlanId) return response({ error: "plan_not_found" }, 400);

  const { data: plan } = await adminClient
    .from("weekly_plans")
    .select("id, company_id, week_start, status")
    .eq("id", weeklyPlanId)
    .maybeSingle();

  if (!plan) return response({ error: "plan_not_found" }, 404);

  const { data: membership } = await adminClient
    .from("company_members")
    .select("role, status")
    .eq("company_id", plan.company_id)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return response({ error: "not_allowed" }, 403);
  }

  const { data: pendingRows, error: pendingError } = await adminClient
    .from("notification_outbox")
    .select("id, company_id, user_id, task_id, weekly_plan_id, event_type, attempts")
    .eq("company_id", plan.company_id)
    .eq("weekly_plan_id", weeklyPlanId)
    .eq("channel", "telegram")
    .eq("event_type", "weekly_plan_published")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(300);

  if (pendingError) return response({ error: "telegram_dispatch_failed" }, 500);
  const outboxRows = pendingRows ?? [];
  if (!outboxRows.length) {
    return response({ ok: true, sent: 0, failed: 0, pendingWithoutConnection: 0, message: "no_pending_notifications" });
  }

  await adminClient
    .from("notification_outbox")
    .update({ status: "processing", last_error: null })
    .in("id", outboxRows.map((row: any) => row.id));

  const taskIds = Array.from(new Set(outboxRows.map((row: any) => row.task_id).filter(Boolean)));
  const userIds = Array.from(new Set(outboxRows.map((row: any) => row.user_id).filter(Boolean)));

  const [tasksResult, connectionsResult] = await Promise.all([
    taskIds.length
      ? adminClient
          .from("tasks")
          .select("id, greenhouse_id, type, title, scheduled_date, scheduled_time, priority, instructions, technical_plan")
          .eq("company_id", plan.company_id)
          .in("id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? adminClient
          .from("notification_connections")
          .select("user_id, external_chat_id")
          .eq("company_id", plan.company_id)
          .eq("channel", "telegram")
          .eq("status", "active")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (tasksResult.error || connectionsResult.error) {
    await updateOutbox(adminClient, outboxRows, { status: "failed", last_error: "telegram_dispatch_failed" });
    return response({ error: "telegram_dispatch_failed" }, 500);
  }

  const tasks = tasksResult.data ?? [];
  const greenhouseIds = Array.from(new Set(tasks.map((task: any) => task.greenhouse_id).filter(Boolean)));
  const [greenhousesResult, materialsResult] = await Promise.all([
    greenhouseIds.length
      ? adminClient.from("greenhouses").select("id, name").eq("company_id", plan.company_id).in("id", greenhouseIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? adminClient
          .from("task_materials")
          .select("task_id, product_name, dose, unit, mixing_order")
          .eq("company_id", plan.company_id)
          .in("task_id", taskIds)
          .order("mixing_order", { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (greenhousesResult.error || materialsResult.error) {
    await updateOutbox(adminClient, outboxRows, { status: "failed", last_error: "telegram_dispatch_failed" });
    return response({ error: "telegram_dispatch_failed" }, 500);
  }

  const taskById = new Map(tasks.map((task: any) => [task.id, task]));
  const connectionByUserId = new Map((connectionsResult.data ?? []).map((connection: any) => [connection.user_id, connection]));
  const greenhouseById = new Map((greenhousesResult.data ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name]));
  const materialsByTaskId = new Map<string, any[]>();

  for (const material of materialsResult.data ?? []) {
    const rows = materialsByTaskId.get(material.task_id) ?? [];
    rows.push(material);
    materialsByTaskId.set(material.task_id, rows);
  }

  const rowsByUser = new Map<string, any[]>();
  for (const row of outboxRows) {
    const rows = rowsByUser.get(row.user_id) ?? [];
    rows.push(row);
    rowsByUser.set(row.user_id, rows);
  }

  let sent = 0;
  let failed = 0;
  let pendingWithoutConnection = 0;

  for (const [userId, rows] of rowsByUser.entries()) {
    const connection = connectionByUserId.get(userId);
    if (!connection?.external_chat_id) {
      pendingWithoutConnection += 1;
      await updateOutbox(adminClient, rows, { status: "pending", last_error: "telegram_not_connected" });
      continue;
    }

    const userTasks = rows.map((row) => taskById.get(row.task_id)).filter(Boolean);
    if (!userTasks.length) {
      failed += 1;
      await updateOutbox(adminClient, rows, { status: "failed", last_error: "tasks_not_found" });
      continue;
    }

    try {
      await sendTelegramMessage(botToken, connection.external_chat_id, buildWeeklyMessage({
        greenhouseById,
        materialsByTaskId,
        tasks: userTasks,
        weekStart: plan.week_start
      }));
      sent += 1;
      await updateOutbox(adminClient, rows, {
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null
      });
    } catch (caught) {
      failed += 1;
      await updateOutbox(adminClient, rows, {
        status: "failed",
        last_error: caught instanceof Error ? caught.message.slice(0, 500) : "telegram_send_failed"
      });
    }
  }

  return response({ ok: true, sent, failed, pendingWithoutConnection });
});
