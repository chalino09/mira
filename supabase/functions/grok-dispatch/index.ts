// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const terminalStatuses = new Set(["accepted", "sent", "responded", "completed", "blocked"]);

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function nullableUuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function normalizePhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith("521")) digits = `52${digits.slice(3)}`;
  if (digits.length === 10) digits = `52${digits}`;
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  return `+${digits}`;
}

function safeString(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function createCallbackToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashCallbackToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function dueAt(task: any) {
  const time = task.scheduled_time ? String(task.scheduled_time).slice(0, 8) : "09:00:00";
  return `${task.scheduled_date}T${time}-06:00`;
}

function dedupeKey(task: any, recipient: any, eventType: string, force: boolean) {
  const version = force ? crypto.randomUUID() : task.updated_at;
  return [eventType, task.id, recipient.kind, recipient.id, version].join(":");
}

function payloadFor({ callbackUrl, company, dispatchId, eventType, greenhouseName, materials, recipient, task }: any) {
  return {
    schema_version: 1,
    event_id: dispatchId,
    event_type: eventType,
    company_id: company.id,
    company_name: company.name,
    company_slug: company.slug,
    activity_id: task.id,
    title: task.title,
    activity_type: task.type,
    priority: task.priority,
    instructions: task.instructions,
    assignee: recipient.name,
    assignee_type: recipient.kind,
    assignee_id: recipient.id,
    phone: recipient.phone,
    due_at: dueAt(task),
    scheduled_date: task.scheduled_date,
    scheduled_time: task.scheduled_time,
    site: greenhouseName,
    greenhouse_id: task.greenhouse_id,
    materials,
    technical_plan: task.technical_plan ?? {},
    callback_url: callbackUrl,
    expected_replies: ["LISTO", "PROBLEMA: <motivo>"],
    source: "mira"
  };
}

async function postToGrok(url: string, senderKey: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const result = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${senderKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await result.text().catch(() => "");
    if (!result.ok) throw new Error(`grok_http_${result.status}:${body.slice(0, 240)}`);
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const grokRoutineUrl = Deno.env.get("GROK_ROUTINE_URL");
  const grokSenderKey = Deno.env.get("GROK_ROUTINE_SENDER_KEY");
  const grokCallbackUrl = Deno.env.get("GROK_CALLBACK_URL")
    ?? (supabaseUrl ? `${supabaseUrl}/functions/v1/grok-callback` : null);
  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!supabaseUrl || !serviceRoleKey || !grokRoutineUrl || !grokSenderKey || !grokCallbackUrl) {
    return response({ error: "grok_not_configured" }, 503);
  }
  try {
    if (new URL(grokRoutineUrl).protocol !== "https:") return response({ error: "grok_not_configured" }, 503);
    if (new URL(grokCallbackUrl).protocol !== "https:") return response({ error: "grok_not_configured" }, 503);
  } catch (_error) {
    return response({ error: "grok_not_configured" }, 503);
  }
  if (!authorization || !accessToken) return response({ error: "not_authenticated" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);
  if (authError || !authData.user) return response({ error: "not_authenticated" }, 401);

  const body = await request.json().catch(() => ({}));
  const weeklyPlanId = nullableUuid(body.weeklyPlanId);
  if (!weeklyPlanId) return response({ error: "plan_not_found" }, 400);

  const requestedTaskIds = Array.isArray(body.taskIds)
    ? Array.from(new Set(body.taskIds.map(nullableUuid).filter(Boolean))).slice(0, 100)
    : [];
  const force = body.mode === "active" || body.force === true;
  const eventType = force ? "work_resend" : requestedTaskIds.length ? "work_updated" : "work_assigned";

  const { data: plan, error: planError } = await adminClient
    .from("weekly_plans")
    .select("id, company_id, status")
    .eq("id", weeklyPlanId)
    .maybeSingle();
  if (planError || !plan) return response({ error: "plan_not_found" }, 404);
  if (plan.status !== "published") return response({ error: "plan_not_published" }, 409);

  const { data: company, error: companyError } = await adminClient
    .from("companies")
    .select("id, name, slug")
    .eq("id", plan.company_id)
    .maybeSingle();
  if (companyError || !company) return response({ error: "company_not_found" }, 404);

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

  let tasksQuery = adminClient
    .from("tasks")
    .select("id, company_id, weekly_plan_id, greenhouse_id, type, title, scheduled_date, scheduled_time, priority, instructions, technical_plan, updated_at")
    .eq("company_id", plan.company_id)
    .eq("weekly_plan_id", plan.id)
    .not("status", "in", "(completada,verificada,cancelada)")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  if (requestedTaskIds.length) tasksQuery = tasksQuery.in("id", requestedTaskIds);

  const { data: tasks, error: tasksError } = await tasksQuery;
  if (tasksError) return response({ error: "grok_dispatch_failed" }, 500);
  if (!(tasks ?? []).length) {
    return response({ ok: true, accepted: 0, failed: 0, missingPhone: 0, skipped: 0, message: "no_active_tasks" });
  }

  const taskIds = (tasks ?? []).map((task: any) => task.id);
  const greenhouseIds = Array.from(new Set((tasks ?? []).map((task: any) => task.greenhouse_id).filter(Boolean)));
  const [userAssignmentsResult, staffAssignmentsResult, greenhousesResult, materialsResult] = await Promise.all([
    adminClient.from("task_assignments").select("task_id, user_id").eq("company_id", plan.company_id).in("task_id", taskIds),
    adminClient.from("task_staff_assignments").select("task_id, staff_id").eq("company_id", plan.company_id).in("task_id", taskIds),
    greenhouseIds.length
      ? adminClient.from("greenhouses").select("id, name").eq("company_id", plan.company_id).in("id", greenhouseIds)
      : Promise.resolve({ data: [], error: null }),
    adminClient
      .from("task_materials")
      .select("task_id, product_name, composition, dose, unit, mixing_order, notes")
      .eq("company_id", plan.company_id)
      .in("task_id", taskIds)
      .order("mixing_order", { ascending: true })
  ]);

  const baseError = userAssignmentsResult.error ?? staffAssignmentsResult.error ?? greenhousesResult.error ?? materialsResult.error;
  if (baseError) return response({ error: "grok_dispatch_failed" }, 500);

  const userIds = Array.from(new Set((userAssignmentsResult.data ?? []).map((row: any) => row.user_id).filter(Boolean)));
  const staffIds = Array.from(new Set((staffAssignmentsResult.data ?? []).map((row: any) => row.staff_id).filter(Boolean)));
  const [profilesResult, staffResult, membersResult] = await Promise.all([
    userIds.length
      ? adminClient.from("profiles").select("id, full_name, email, phone").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    staffIds.length
      ? adminClient.from("company_staff").select("id, full_name, phone, linked_user_id, status").eq("company_id", plan.company_id).in("id", staffIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? adminClient.from("company_members").select("user_id, status").eq("company_id", plan.company_id).in("user_id", userIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (profilesResult.error || staffResult.error || membersResult.error) {
    return response({ error: "grok_dispatch_failed" }, 500);
  }

  const activeUserIds = new Set((membersResult.data ?? []).filter((row: any) => row.status === "active").map((row: any) => row.user_id));
  const profileById = new Map((profilesResult.data ?? []).map((profile: any) => [profile.id, profile]));
  const staffById = new Map((staffResult.data ?? []).filter((staff: any) => staff.status === "active").map((staff: any) => [staff.id, staff]));
  const greenhouseById = new Map((greenhousesResult.data ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name]));
  const userIdsByTask = new Map<string, string[]>();
  const staffIdsByTask = new Map<string, string[]>();
  const materialsByTask = new Map<string, any[]>();

  for (const assignment of userAssignmentsResult.data ?? []) {
    if (!activeUserIds.has(assignment.user_id)) continue;
    const ids = userIdsByTask.get(assignment.task_id) ?? [];
    ids.push(assignment.user_id);
    userIdsByTask.set(assignment.task_id, ids);
  }
  for (const assignment of staffAssignmentsResult.data ?? []) {
    if (!staffById.has(assignment.staff_id)) continue;
    const ids = staffIdsByTask.get(assignment.task_id) ?? [];
    ids.push(assignment.staff_id);
    staffIdsByTask.set(assignment.task_id, ids);
  }
  for (const material of materialsResult.data ?? []) {
    const rows = materialsByTask.get(material.task_id) ?? [];
    rows.push({
      product_name: material.product_name,
      composition: material.composition,
      dose: material.dose,
      unit: material.unit,
      mixing_order: material.mixing_order,
      notes: material.notes
    });
    materialsByTask.set(material.task_id, rows);
  }

  let accepted = 0;
  let failed = 0;
  let missingPhone = 0;
  let skipped = 0;

  for (const task of tasks ?? []) {
    const assignedUsers = new Set(userIdsByTask.get(task.id) ?? []);
    const recipients: any[] = [];
    for (const userId of assignedUsers) {
      const profile = profileById.get(userId);
      recipients.push({
        kind: "user",
        id: userId,
        name: safeString(profile?.full_name ?? profile?.email?.split("@")[0] ?? "Encargado", 160),
        phone: normalizePhone(profile?.phone)
      });
    }
    for (const staffId of staffIdsByTask.get(task.id) ?? []) {
      const staff = staffById.get(staffId);
      if (!staff || (staff.linked_user_id && assignedUsers.has(staff.linked_user_id))) continue;
      recipients.push({
        kind: "staff",
        id: staffId,
        name: safeString(staff.full_name ?? "Encargado", 160),
        phone: normalizePhone(staff.phone)
      });
    }

    const seenPhones = new Set<string>();
    for (const recipient of recipients) {
      if (recipient.phone && seenPhones.has(recipient.phone)) {
        skipped += 1;
        continue;
      }
      if (recipient.phone) seenPhones.add(recipient.phone);

      const dispatchId = crypto.randomUUID();
      const callbackToken = createCallbackToken();
      const callbackTokenHash = await hashCallbackToken(callbackToken);
      const key = dedupeKey(task, recipient, eventType, force);
      const payload = payloadFor({
        callbackUrl: grokCallbackUrl,
        company,
        dispatchId,
        eventType,
        greenhouseName: greenhouseById.get(task.greenhouse_id) ?? "Invernadero",
        materials: materialsByTask.get(task.id) ?? [],
        recipient,
        task
      });

      const { data: existing } = await adminClient
        .from("agent_dispatches")
        .select("id, status, attempts")
        .eq("company_id", plan.company_id)
        .eq("dedupe_key", key)
        .maybeSingle();
      if (existing && terminalStatuses.has(existing.status)) {
        skipped += 1;
        continue;
      }

      const rowId = existing?.id ?? dispatchId;
      const row = {
        company_id: plan.company_id,
        work_id: task.id,
        weekly_plan_id: plan.id,
        recipient_user_id: recipient.kind === "user" ? recipient.id : null,
        recipient_staff_id: recipient.kind === "staff" ? recipient.id : null,
        recipient_name: recipient.name,
        recipient_phone: recipient.phone,
        provider: "grok",
        channel: "whatsapp_web",
        event_type: eventType,
        dedupe_key: key,
        payload: { ...payload, event_id: rowId },
        callback_token_hash: callbackTokenHash,
        status: recipient.phone ? "processing" : "failed",
        attempts: Number(existing?.attempts ?? 0) + 1,
        last_error: recipient.phone ? null : "recipient_phone_missing"
      };
      const saveResult = existing
        ? await adminClient
            .from("agent_dispatches")
            .update(row)
            .eq("id", rowId)
            .eq("company_id", plan.company_id)
        : await adminClient
            .from("agent_dispatches")
            .insert({ id: rowId, ...row });
      const saveError = saveResult.error;
      if (saveError) {
        failed += 1;
        continue;
      }
      if (!recipient.phone) {
        missingPhone += 1;
        continue;
      }

      try {
        await postToGrok(grokRoutineUrl, grokSenderKey, {
          ...row.payload,
          callback_token: callbackToken
        });
        await adminClient
          .from("agent_dispatches")
          .update({ status: "accepted", accepted_at: new Date().toISOString(), last_error: null })
          .eq("id", rowId)
          .eq("company_id", plan.company_id);
        accepted += 1;
      } catch (caught) {
        await adminClient
          .from("agent_dispatches")
          .update({
            status: "failed",
            last_error: caught instanceof Error ? caught.message.slice(0, 500) : "grok_dispatch_failed"
          })
          .eq("id", rowId)
          .eq("company_id", plan.company_id);
        failed += 1;
      }
    }
  }

  return response({ ok: true, accepted, failed, missingPhone, skipped });
});
