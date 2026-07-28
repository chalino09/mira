// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const activityLabels: Record<string, string> = {
  riego: "Riego",
  fertirriego: "Fertirriego",
  fertilizacion: "Fertilización",
  aplicacion_foliar: "Aplicación foliar",
  revision_plagas: "Revisión de plagas y enfermedades",
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
  critical: "Crítica"
};

const maxTasksPerMessage = 5;

type TelegramMessage = {
  text: string;
  tasks?: any[];
  totalTasks?: number;
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function nullableUuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
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
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${iso}T12:00:00Z`));
}

function dayHeading(iso: string) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${iso}T12:00:00Z`)).replaceAll(".", "").replace(",", "").toUpperCase();
}

function weekLabel(weekStart: string) {
  return `${dateLabel(weekStart)} – ${dateLabel(addDays(weekStart, 6))}`;
}

function activityLabel(task: any) {
  if (task.type === "otro" && task.technical_plan?.cycleWorkType) return "Preparación de ciclo";
  return activityLabels[task.type] ?? task.type;
}

function taskTime(task: any) {
  return task.scheduled_time ? task.scheduled_time.slice(0, 5) : "Sin hora";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function conciseText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function materialLine(material: any) {
  return [
    conciseText(material.product_name, 100),
    material.dose ? `· ${conciseText(material.dose, 40)}` : "",
    material.unit ? conciseText(material.unit, 30) : ""
  ].filter(Boolean).join(" ");
}

function sortedTasks(tasks: any[]) {
  return [...tasks].sort((left, right) => {
    const dateCompare = String(left.scheduled_date).localeCompare(String(right.scheduled_date));
    if (dateCompare) return dateCompare;
    return String(left.scheduled_time ?? "").localeCompare(String(right.scheduled_time ?? ""));
  });
}

function taskBlock({
  greenhouseById,
  materialsByTaskId,
  numberByTaskId,
  task
}: {
  greenhouseById: Map<string, string>;
  materialsByTaskId: Map<string, any[]>;
  numberByTaskId?: Map<string, number>;
  task: any;
}) {
  const greenhouseName = greenhouseById.get(task.greenhouse_id) ?? "Invernadero";
  const taskNumber = numberByTaskId?.get(task.id);
  const priority = task.priority && task.priority !== "normal"
    ? ` · ${task.priority === "critical" ? "🔴" : task.priority === "high" ? "🟠" : "🔵"} ${priorityLabels[task.priority] ?? task.priority}`
    : "";
  const lines = [
    `<b>${taskNumber ? `${taskNumber}. ` : ""}${escapeHtml(activityLabel(task))} · ${escapeHtml(taskTime(task))}${escapeHtml(priority)}</b>`,
    `<b>${escapeHtml(conciseText(task.title, 180))}</b>`,
    `📍 ${escapeHtml(conciseText(greenhouseName, 120))}`
  ];

  const materials = materialsByTaskId.get(task.id) ?? [];
  if (materials.length) {
    const visibleMaterials = materials.slice(0, 6).map(materialLine);
    const remaining = materials.length - visibleMaterials.length;
    lines.push(`🧪 ${escapeHtml(visibleMaterials.join("; "))}${remaining ? `; +${remaining} más` : ""}`);
  }

  return lines.join("\n");
}

function groupTasksByDay(tasks: any[]) {
  const groups = new Map<string, any[]>();
  for (const task of sortedTasks(tasks)) {
    const rows = groups.get(task.scheduled_date) ?? [];
    rows.push(task);
    groups.set(task.scheduled_date, rows);
  }
  return groups;
}

function chunkTasks(tasks: any[], size = maxTasksPerMessage) {
  const chunks: any[][] = [];
  for (let index = 0; index < tasks.length; index += size) {
    chunks.push(tasks.slice(index, index + size));
  }
  return chunks;
}

function actionPrompt() {
  return "<b>Selecciona una actividad:</b>";
}

function taskNumberMap(tasks: any[]) {
  return new Map(tasks.map((task, index) => [task.id, index + 1]));
}

function daySection({
  date,
  greenhouseById,
  materialsByTaskId,
  numberByTaskId,
  tasks
}: {
  date: string;
  greenhouseById: Map<string, string>;
  materialsByTaskId: Map<string, any[]>;
  numberByTaskId: Map<string, number>;
  tasks: any[];
}) {
  return [
    `<b>📅 ${escapeHtml(dayHeading(date))}</b>`,
    ...tasks.map((task) => taskBlock({ greenhouseById, materialsByTaskId, numberByTaskId, task }))
  ].join("\n\n");
}

function buildWeeklyMessages({
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
  const orderedTasks = sortedTasks(tasks);
  const summary = [
    "<b>🌱 MIRA · ACTIVIDADES DE LA SEMANA</b>",
    escapeHtml(weekLabel(weekStart)),
    `<b>${orderedTasks.length} ${orderedTasks.length === 1 ? "actividad" : "actividades"}</b>`
  ].join("\n");
  const groups = groupTasksByDay(orderedTasks);

  if (orderedTasks.length <= maxTasksPerMessage) {
    const numberByTaskId = taskNumberMap(orderedTasks);
    const sections = Array.from(groups.entries()).map(([date, dayTasks]) =>
      daySection({ date, greenhouseById, materialsByTaskId, numberByTaskId, tasks: dayTasks })
    );
    return [{ text: [summary, ...sections, actionPrompt()].join("\n\n"), tasks: orderedTasks }];
  }

  const visibleTasks = orderedTasks.slice(0, maxTasksPerMessage);
  const visibleGroups = groupTasksByDay(visibleTasks);
  const sections = Array.from(visibleGroups.entries()).map(([date, dayTasks]) =>
    daySection({ date, greenhouseById, materialsByTaskId, numberByTaskId: taskNumberMap(visibleTasks), tasks: dayTasks })
  );
  return [{ text: [summary, ...sections, actionPrompt()].join("\n\n"), tasks: visibleTasks, totalTasks: orderedTasks.length }];
}

function buildChangedTasksMessages({
  greenhouseById,
  materialsByTaskId,
  tasks
}: {
  greenhouseById: Map<string, string>;
  materialsByTaskId: Map<string, any[]>;
  tasks: any[];
}) {
  const orderedTasks = sortedTasks(tasks);
  const summary = [
    "<b>🔔 MIRA · CAMBIOS PENDIENTES</b>",
    `<b>${orderedTasks.length} ${orderedTasks.length === 1 ? "actividad nueva o modificada" : "actividades nuevas o modificadas"}</b>`
  ].join("\n");
  const groups = groupTasksByDay(orderedTasks);

  if (orderedTasks.length <= maxTasksPerMessage) {
    const numberByTaskId = taskNumberMap(orderedTasks);
    const sections = Array.from(groups.entries()).map(([date, dayTasks]) =>
      daySection({ date, greenhouseById, materialsByTaskId, numberByTaskId, tasks: dayTasks })
    );
    return [{
      text: [summary, ...sections, actionPrompt()].join("\n\n"),
      tasks: orderedTasks
    }];
  }
  const visibleTasks = orderedTasks.slice(0, maxTasksPerMessage);
  const visibleGroups = groupTasksByDay(visibleTasks);
  const sections = Array.from(visibleGroups.entries()).map(([date, dayTasks]) =>
    daySection({ date, greenhouseById, materialsByTaskId, numberByTaskId: taskNumberMap(visibleTasks), tasks: dayTasks })
  );
  return [{ text: [summary, ...sections, actionPrompt()].join("\n\n"), tasks: visibleTasks, totalTasks: orderedTasks.length }];
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

function taskActionsKeyboard(taskId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Completar", callback_data: `task:complete:${taskId}` },
        { text: "🚧 Bloquear", callback_data: `task:block:${taskId}` }
      ],
      [{ text: "👁 Ver detalle", callback_data: `task:view:${taskId}` }]
    ]
  };
}

function notificationKeyboard(tasks: any[], weeklyPlanId: string, totalTasks = tasks.length) {
  if (tasks.length === 1) return taskActionsKeyboard(tasks[0].id);
  if (!tasks.length) return undefined;
  const rows = tasks.map((task, index) => [{
      text: `${index + 1} · ${conciseText(task.title || activityLabel(task), 36)}`,
      callback_data: `task:view:${task.id}`
    }]);
  if (totalTasks > tasks.length) rows.push([{ text: "Ver todas ➡️", callback_data: `menu:page:${weeklyPlanId}:0` }]);
  return { inline_keyboard: rows };
}

async function sendTelegramMessages(token: string, chatId: string, weeklyPlanId: string, messages: TelegramMessage[]) {
  let menuMessageId: number | null = null;
  for (const message of messages) {
    const chunks = splitMessage(message.text);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          disable_web_page_preview: true,
          parse_mode: "HTML",
          reply_markup: chunkIndex === chunks.length - 1
            ? notificationKeyboard(message.tasks ?? [], weeklyPlanId, message.totalTasks)
            : undefined,
          text: chunk
        })
      });

      if (!result.ok) {
        const errorText = await result.text().catch(() => "");
        throw new Error(errorText || `telegram_http_${result.status}`);
      }
      const payload = await result.json().catch(() => null);
      if (chunkIndex === chunks.length - 1 && Number.isSafeInteger(payload?.result?.message_id)) {
        menuMessageId = payload.result.message_id;
      }
    }
  }
  if (!menuMessageId) throw new Error("telegram_message_id_missing");
  return menuMessageId;
}

async function editTelegramMenu(token: string, chatId: string, messageId: number, weeklyPlanId: string, message: TelegramMessage) {
  const result = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      disable_web_page_preview: true,
      parse_mode: "HTML",
      reply_markup: notificationKeyboard(message.tasks ?? [], weeklyPlanId, message.totalTasks),
      text: message.text
    })
  });
  if (!result.ok) {
    const errorText = await result.text().catch(() => "");
    throw new Error(errorText || `telegram_edit_${result.status}`);
  }
}

async function updateOutbox(adminClient: any, rows: any[], patch: Record<string, unknown>, companyId?: string) {
  if (!rows.length) return;
  const attempts = Math.max(...rows.map((row) => row.attempts ?? 0)) + 1;
  let query = adminClient
    .from("notification_outbox")
    .update({ ...patch, attempts })
    .in("id", rows.map((row) => row.id));

  if (companyId) query = query.eq("company_id", companyId);
  await query;
}

async function loadWeeklyMenuContext(adminClient: any, plan: any, userId: string) {
  const { data: assignments, error: assignmentsError } = await adminClient
    .from("task_assignments")
    .select("task_id")
    .eq("company_id", plan.company_id)
    .eq("user_id", userId);
  if (assignmentsError) throw assignmentsError;

  const assignedTaskIds = (assignments ?? []).map((assignment: any) => assignment.task_id).filter(Boolean);
  if (!assignedTaskIds.length) return { tasks: [], greenhouseById: new Map(), materialsByTaskId: new Map() };

  const { data: tasks, error: tasksError } = await adminClient
    .from("tasks")
    .select("id, greenhouse_id, type, title, scheduled_date, scheduled_time, priority, instructions, technical_plan")
    .eq("company_id", plan.company_id)
    .eq("weekly_plan_id", plan.id)
    .in("id", assignedTaskIds)
    .not("status", "in", "(completada,verificada,cancelada,bloqueada)")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (tasksError) throw tasksError;

  const activeTasks = tasks ?? [];
  const taskIds = activeTasks.map((task: any) => task.id);
  const greenhouseIds = Array.from(new Set(activeTasks.map((task: any) => task.greenhouse_id).filter(Boolean)));
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
  if (greenhousesResult.error) throw greenhousesResult.error;
  if (materialsResult.error) throw materialsResult.error;

  const materialsByTaskId = new Map<string, any[]>();
  for (const material of materialsResult.data ?? []) {
    const rows = materialsByTaskId.get(material.task_id) ?? [];
    rows.push(material);
    materialsByTaskId.set(material.task_id, rows);
  }
  return {
    tasks: activeTasks,
    greenhouseById: new Map((greenhousesResult.data ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name])),
    materialsByTaskId
  };
}

async function sendOrUpdateWeeklyMenu({ adminClient, botToken, chatId, plan, userId }: any) {
  const context = await loadWeeklyMenuContext(adminClient, plan, userId);
  const [message] = buildWeeklyMessages({ ...context, weekStart: plan.week_start });
  if (!message) return { delivery: "skipped" };

  const { data: savedMenu, error: savedMenuError } = await adminClient
    .from("telegram_weekly_menus")
    .select("id, chat_id, message_id, revision")
    .eq("company_id", plan.company_id)
    .eq("weekly_plan_id", plan.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (savedMenuError) throw savedMenuError;

  if (savedMenu?.chat_id === chatId && savedMenu.message_id) {
    try {
      await editTelegramMenu(botToken, chatId, savedMenu.message_id, plan.id, message);
    } catch (editError) {
      if (String(editError).toLowerCase().includes("message is not modified")) {
        return { delivery: "unchanged" };
      }
      // The user may have deleted the message or Telegram may no longer allow editing it.
      // Sending a replacement keeps the operational menu available.
      const messageId = await sendTelegramMessages(botToken, chatId, plan.id, [message]);
      const { error } = await adminClient
        .from("telegram_weekly_menus")
        .upsert({
          company_id: plan.company_id,
          weekly_plan_id: plan.id,
          user_id: userId,
          chat_id: chatId,
          message_id: messageId,
          revision: (savedMenu.revision ?? 0) + 1
        }, { onConflict: "company_id,weekly_plan_id,user_id" });
      if (error) throw error;
      return { delivery: "replaced" };
    }
    const { error } = await adminClient
      .from("telegram_weekly_menus")
      .update({ revision: (savedMenu.revision ?? 1) + 1 })
      .eq("id", savedMenu.id)
      .eq("company_id", plan.company_id);
    if (error) throw error;
    return { delivery: "updated" };
  }

  const messageId = await sendTelegramMessages(botToken, chatId, plan.id, [message]);
  const { error } = await adminClient
    .from("telegram_weekly_menus")
    .upsert({
      company_id: plan.company_id,
      weekly_plan_id: plan.id,
      user_id: userId,
      chat_id: chatId,
      message_id: messageId,
      revision: (savedMenu?.revision ?? 0) + 1
    }, { onConflict: "company_id,weekly_plan_id,user_id" });
  if (error) throw error;
  return { delivery: "sent" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!supabaseUrl || !serviceRoleKey || !botToken) {
    return response({ error: "telegram_not_configured" }, 503);
  }
  if (!authorization || !accessToken) return response({ error: "not_authenticated" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);

  if (authError || !authData.user) return response({ error: "not_authenticated" }, 401);

  const body = await request.json().catch(() => ({}));
  const weeklyPlanId = nullableUuid(body.weeklyPlanId);
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

  if (body.mode === "active") {
    const { data: activeTasks, error: activeTasksError } = await adminClient
      .from("tasks")
      .select("id, greenhouse_id, type, title, scheduled_date, scheduled_time, priority, instructions, technical_plan")
      .eq("company_id", plan.company_id)
      .eq("weekly_plan_id", plan.id)
      .not("status", "in", "(completada,verificada,cancelada,bloqueada)")
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true });
    const activeTaskIds = (activeTasks ?? []).map((task: any) => task.id);
    if (activeTasksError) return response({ error: "telegram_dispatch_failed" }, 500);
    if (!activeTaskIds.length) return response({ ok: true, sent: 0, failed: 0, pendingWithoutConnection: 0, message: "no_active_tasks" });

    const [{ data: assignments }, { data: connections }, { data: members }] = await Promise.all([
      adminClient.from("task_assignments").select("task_id, user_id").eq("company_id", plan.company_id).in("task_id", activeTaskIds),
      adminClient.from("notification_connections").select("user_id, external_chat_id").eq("company_id", plan.company_id).eq("channel", "telegram").eq("status", "active"),
      adminClient.from("company_members").select("user_id").eq("company_id", plan.company_id).eq("role", "manager").eq("status", "active")
    ]);
    const managerIds = new Set((members ?? []).map((member: any) => member.user_id));
    const connectionByUserId = new Map((connections ?? []).filter((item: any) => managerIds.has(item.user_id)).map((item: any) => [item.user_id, item]));
    const taskById = new Map((activeTasks ?? []).map((task: any) => [task.id, task]));
    const taskIdsByUser = new Map<string, string[]>();
    for (const assignment of assignments ?? []) {
      if (!managerIds.has(assignment.user_id)) continue;
      const ids = taskIdsByUser.get(assignment.user_id) ?? [];
      ids.push(assignment.task_id);
      taskIdsByUser.set(assignment.user_id, ids);
    }
    let sent = 0;
    let failed = 0;
    let pendingWithoutConnection = 0;
    for (const [userId, taskIds] of taskIdsByUser.entries()) {
      const connection = connectionByUserId.get(userId);
      if (!connection?.external_chat_id) { pendingWithoutConnection += 1; continue; }
      const userTasks = Array.from(new Set(taskIds)).map((taskId) => taskById.get(taskId)).filter(Boolean);
      if (!userTasks.length) continue;
      try {
        await sendOrUpdateWeeklyMenu({ adminClient, botToken, chatId: connection.external_chat_id, plan, userId });
        sent += 1;
      } catch (_caught) {
        failed += 1;
      }
    }
    return response({ ok: true, sent, failed, pendingWithoutConnection });
  }

  const { data: pendingRows, error: pendingError } = await adminClient
    .from("notification_outbox")
    .select("id, company_id, user_id, task_id, weekly_plan_id, event_type, attempts")
    .eq("company_id", plan.company_id)
    .eq("weekly_plan_id", weeklyPlanId)
    .eq("channel", "telegram")
    .in("event_type", ["weekly_plan_published", "task_updated"])
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
    .eq("company_id", plan.company_id)
    .eq("weekly_plan_id", weeklyPlanId)
    .in("id", outboxRows.map((row: any) => row.id));

  const taskIds = Array.from(new Set(outboxRows.map((row: any) => row.task_id).filter(Boolean)));
  const userIds = Array.from(new Set(outboxRows.map((row: any) => row.user_id).filter(Boolean)));

  const [tasksResult, connectionsResult, membershipsResult] = await Promise.all([
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
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? adminClient
          .from("company_members")
          .select("user_id")
          .eq("company_id", plan.company_id)
          .eq("role", "manager")
          .eq("status", "active")
          .in("user_id", userIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (tasksResult.error || connectionsResult.error || membershipsResult.error) {
    await updateOutbox(adminClient, outboxRows, { status: "failed", last_error: "telegram_dispatch_failed" }, plan.company_id);
    return response({ error: "telegram_dispatch_failed" }, 500);
  }

  const tasks = tasksResult.data ?? [];
  const activeManagerUserIds = new Set((membershipsResult.data ?? []).map((member: any) => member.user_id));
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
    await updateOutbox(adminClient, outboxRows, { status: "failed", last_error: "telegram_dispatch_failed" }, plan.company_id);
    return response({ error: "telegram_dispatch_failed" }, 500);
  }

  const taskById = new Map(tasks.map((task: any) => [task.id, task]));
  const connectionByUserId = new Map(
    (connectionsResult.data ?? [])
      .filter((connection: any) => activeManagerUserIds.has(connection.user_id))
      .map((connection: any) => [connection.user_id, connection])
  );
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
    if (!activeManagerUserIds.has(userId)) {
      failed += 1;
      await updateOutbox(adminClient, rows, { status: "failed", last_error: "telegram_user_not_active" }, plan.company_id);
      continue;
    }

    const connection = connectionByUserId.get(userId);
    if (!connection?.external_chat_id) {
      pendingWithoutConnection += 1;
      await updateOutbox(adminClient, rows, { status: "pending", last_error: "telegram_not_connected" }, plan.company_id);
      continue;
    }

    const userTaskIds = Array.from(new Set(rows.map((row) => row.task_id).filter(Boolean)));
    const userTasks = userTaskIds.map((taskId) => taskById.get(taskId)).filter(Boolean);
    if (!userTasks.length) {
      failed += 1;
      await updateOutbox(adminClient, rows, { status: "failed", last_error: "tasks_not_found" }, plan.company_id);
      continue;
    }

    try {
      await sendOrUpdateWeeklyMenu({ adminClient, botToken, chatId: connection.external_chat_id, plan, userId });
      sent += 1;
      await updateOutbox(adminClient, rows, {
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null
      }, plan.company_id);
    } catch (caught) {
      failed += 1;
      await updateOutbox(adminClient, rows, {
        status: "failed",
        last_error: caught instanceof Error ? caught.message.slice(0, 500) : "telegram_send_failed"
      }, plan.company_id);
    }
  }

  return response({ ok: true, sent, failed, pendingWithoutConnection });
});
