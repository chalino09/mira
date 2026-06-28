// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const sourceTypes = new Set(["operation", "weather", "nutrition", "lab", "costs", "report", "telegram"]);
const severities = new Set(["low", "medium", "high", "critical"]);
const modules = new Set(["operation", "weather", "nutrition", "lab", "costs", "production", "telegram", "report"]);
const memoryTypes = new Set(["pattern", "preference", "risk", "decision", "note"]);

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
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

function compactText(value: unknown, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function nullableUuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function nullableNumber(value: unknown, fallback = 0.5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeEvidence(entries: any[] = []) {
  return entries.slice(0, 8).map((entry) => ({
    label: compactText(entry?.label, "Evidencia"),
    value: compactText(entry?.value, ""),
    source_type: sourceTypes.has(String(entry?.source_type)) ? String(entry.source_type) : "report",
    source_id: nullableUuid(entry?.source_id),
    greenhouse_id: nullableUuid(entry?.greenhouse_id)
  })).filter((entry) => entry.value);
}

function normalizeAction(action: any, index = 0) {
  const severity = String(action?.severity ?? "medium");
  const sourceType = String(action?.source_type ?? "operation");
  return {
    id: compactText(action?.id, `chat-action-${index}`),
    kind: ["message", "task", "review", "dismissal"].includes(String(action?.kind)) ? String(action.kind) : "review",
    title: compactText(action?.title, "Accion sugerida"),
    detail: compactText(action?.detail, "Revisar evidencia antes de actuar."),
    severity: severities.has(severity) ? severity : "medium",
    recommended_action: compactText(action?.recommended_action, "") || null,
    source_type: sourceTypes.has(sourceType) ? sourceType : "operation",
    source_id: nullableUuid(action?.source_id),
    greenhouse_id: nullableUuid(action?.greenhouse_id),
    evidence: normalizeEvidence(action?.evidence ?? [])
  };
}

function normalizeMemoryUpdate(update: any) {
  const module = String(update?.module ?? "operation");
  const memoryType = String(update?.memory_type ?? "note");
  return {
    module: modules.has(module) ? module : "operation",
    memory_type: memoryTypes.has(memoryType) ? memoryType : "note",
    greenhouse_id: nullableUuid(update?.greenhouse_id),
    entity_type: compactText(update?.entity_type, "") || null,
    entity_id: nullableUuid(update?.entity_id),
    summary: compactText(update?.summary, ""),
    evidence: normalizeEvidence(update?.evidence ?? []),
    confidence: nullableNumber(update?.confidence, 0.55)
  };
}

function chatSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["answer", "evidence", "suggested_actions", "memory_updates"],
    properties: {
      answer: { type: "string", maxLength: 700 },
      evidence: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value", "source_type", "source_id", "greenhouse_id"],
          properties: {
            label: { type: "string" },
            value: { type: "string" },
            source_type: { type: "string", enum: [...sourceTypes] },
            source_id: { type: ["string", "null"] },
            greenhouse_id: { type: ["string", "null"] }
          }
        }
      },
      suggested_actions: {
        type: "array",
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "title", "detail", "severity", "recommended_action", "source_type", "source_id", "greenhouse_id", "evidence"],
          properties: {
            kind: { type: "string", enum: ["message", "task", "review", "dismissal"] },
            title: { type: "string" },
            detail: { type: "string" },
            severity: { type: "string", enum: [...severities] },
            recommended_action: { type: ["string", "null"] },
            source_type: { type: "string", enum: [...sourceTypes] },
            source_id: { type: ["string", "null"] },
            greenhouse_id: { type: ["string", "null"] },
            evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value", "source_type", "source_id", "greenhouse_id"], properties: {
              label: { type: "string" },
              value: { type: "string" },
              source_type: { type: "string", enum: [...sourceTypes] },
              source_id: { type: ["string", "null"] },
              greenhouse_id: { type: ["string", "null"] }
            } } }
          }
        }
      },
      memory_updates: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["memory_type", "module", "greenhouse_id", "entity_type", "entity_id", "summary", "evidence", "confidence"],
          properties: {
            memory_type: { type: "string", enum: [...memoryTypes] },
            module: { type: "string", enum: [...modules] },
            greenhouse_id: { type: ["string", "null"] },
            entity_type: { type: ["string", "null"] },
            entity_id: { type: ["string", "null"] },
            summary: { type: "string" },
            evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "value", "source_type", "source_id", "greenhouse_id"], properties: {
              label: { type: "string" },
              value: { type: "string" },
              source_type: { type: "string", enum: [...sourceTypes] },
              source_id: { type: ["string", "null"] },
              greenhouse_id: { type: ["string", "null"] }
            } } },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          }
        }
      }
    }
  };
}

function systemPrompt() {
  return `Eres Mira Copilot, una capa de mando agricola con memoria operativa.

Responde en espanol, corto y natural, como un copiloto operativo hablando con el owner.
Maximo 3 frases o 700 caracteres. No uses encabezados como "Por que importa" o "Accion segura" salvo que el usuario pida detalle.
No inventes datos. Si falta informacion, dilo breve y di cual seria el siguiente paso.
Cuando haya memoria o historial, compara contra patrones en una frase.
Puedes sugerir mensajes o tareas, pero nunca ejecutes cambios criticos.
Si una alerta sanitaria dice "Desconocido", llamala "alerta sanitaria sin clasificar".`;
}

function greenhouseName(context: any, id: string | null) {
  return context.greenhouseById[id ?? ""] ?? "Area productiva";
}

function operationLabel(type: string) {
  const labels: Record<string, string> = {
    riego: "Riego",
    fertirriego: "Fertirriego",
    fertilizacion: "Fertirriego",
    aplicacion_foliar: "Aplicacion foliar",
    revision_plagas: "Revision sanitaria",
    poda: "Deschuponado",
    tutoreo: "Manejo de rafia",
    deshoje: "Deshoje",
    cosecha: "Cosecha",
    limpieza: "Limpieza",
    mantenimiento: "Mantenimiento",
    otro: "Otra actividad"
  };
  return labels[type] ?? type;
}

function pestProblemLabel(problem: unknown) {
  const text = compactText(problem, "");
  return !text || text.toLowerCase() === "desconocido" ? "Alerta sanitaria sin clasificar" : text;
}

function trimAnswer(value: string) {
  const text = compactText(value);
  return text.length > 700 ? `${text.slice(0, 680).trim()}...` : text;
}

function localFallback(message: string, context: any, memories: any[]) {
  const today = context.today;
  const overdue = context.tasks.filter((task: any) => task.scheduled_date < today && !["completada", "cancelada"].includes(task.status));
  const blocked = context.tasks.filter((task: any) => task.status === "bloqueada");
  const weatherRisk = context.weather.filter((item: any) => ["amber", "red"].includes(item.risk_tone));
  const pests = context.pests.filter((item: any) => item.severity !== "baja" && !item.is_resolved);
  const labRisk = context.lab.filter((item: any) => ["atencion", "critico"].includes(item.diagnostic_status));
  const nutritionRisk = context.nutritionObservations.filter((item: any) => ["alta", "critica"].includes(String(item.severity)));

  const evidence = [
    overdue[0] ? { label: "Pendiente", value: `${overdue[0].title} (${overdue[0].scheduled_date})`, source_type: "operation", source_id: overdue[0].id, greenhouse_id: overdue[0].greenhouse_id } : null,
    blocked[0] ? { label: "Bloqueo", value: blocked[0].blocked_reason || blocked[0].title, source_type: "operation", source_id: blocked[0].id, greenhouse_id: blocked[0].greenhouse_id } : null,
    weatherRisk[0] ? { label: "Clima", value: weatherRisk[0].risk_label || weatherRisk[0].risk_tone, source_type: "weather", source_id: weatherRisk[0].id, greenhouse_id: weatherRisk[0].greenhouse_id } : null,
    pests[0] ? { label: "Sanidad", value: `${pestProblemLabel(pests[0].problem)} en ${pests[0].affected_zone || greenhouseName(context, pests[0].greenhouse_id)}`, source_type: "operation", source_id: pests[0].id, greenhouse_id: pests[0].greenhouse_id } : null,
    labRisk[0] ? { label: "Laboratorio", value: labRisk[0].summary || labRisk[0].diagnosis || labRisk[0].diagnostic_status, source_type: "lab", source_id: labRisk[0].id, greenhouse_id: labRisk[0].greenhouse_id } : null,
    nutritionRisk[0] ? { label: "Nutricion", value: nutritionRisk[0].observation_text, source_type: "nutrition", source_id: nutritionRisk[0].id, greenhouse_id: null } : null,
    memories[0] ? { label: "Memoria", value: memories[0].summary, source_type: "report", source_id: memories[0].id, greenhouse_id: memories[0].greenhouse_id } : null
  ].filter(Boolean);

  const topic = compactText(message).toLowerCase();
  const wantsPattern = topic.includes("patron") || topic.includes("pasado") || topic.includes("antes") || topic.includes("semana");
  let answer = "";
  if (!evidence.length) {
    answer = "No veo atrasos, bloqueos o alertas fuertes con los datos cargados. Todavia no hay memoria suficiente para patrones finos; seguiria alimentando cierres, clima, laboratorio y nutricion.";
  } else if (wantsPattern && memories.length) {
    answer = `Si veo un antecedente: ${memories[0].summary} Hoy lo conectaria con ${evidence[0].value}. Confirmaria avance y dejaria seguimiento solo si no se cierra hoy.`;
  } else {
    const lead = overdue[0]
      ? `Me preocupa ${greenhouseName(context, overdue[0].greenhouse_id)} porque ${operationLabel(overdue[0].type).toLowerCase()} quedo pendiente desde ${overdue[0].scheduled_date}`
      : blocked[0]
        ? `Me preocupa ${greenhouseName(context, blocked[0].greenhouse_id)} porque hay un bloqueo activo`
        : `Me preocupa el contexto operativo porque hay ${evidence.length} senal(es) que conviene revisar`;
    const extra = [weatherRisk.length ? "clima con riesgo" : "", pests.length ? "presion sanitaria" : "", labRisk.length ? "laboratorio con atencion" : ""].filter(Boolean).join(", ");
    answer = `${lead}${extra ? ` y tambien aparece ${extra}` : ""}. Pediria confirmacion al responsable y solo crearia seguimiento si no hay cierre antes de terminar el dia.`;
  }
  answer = trimAnswer(answer);

  const first = evidence[0];
  const suggested_actions = first ? [
    normalizeAction({
      kind: "message",
      title: "Preparar mensaje al responsable",
      detail: answer,
      severity: overdue.length || blocked.length ? "high" : "medium",
      recommended_action: "Guardar borrador para aprobacion antes de enviar.",
      source_type: first.source_type,
      source_id: first.source_id,
      greenhouse_id: first.greenhouse_id,
      evidence
    }, 0),
    normalizeAction({
      kind: "task",
      title: "Crear seguimiento operativo",
      detail: answer,
      severity: overdue.length || blocked.length ? "high" : "medium",
      recommended_action: "Crear una tarea de seguimiento para hoy.",
      source_type: first.source_type,
      source_id: first.source_id,
      greenhouse_id: first.greenhouse_id,
      evidence
    }, 1)
  ] : [];

  const repeated = repeatedTaskMemory(context);
  return {
    answer,
    evidence: normalizeEvidence(evidence),
    suggested_actions,
    memory_updates: repeated ? [repeated] : []
  };
}

function repeatedTaskMemory(context: any) {
  const today = context.today;
  const groups = new Map();
  for (const task of context.tasks) {
    if (task.scheduled_date >= today || ["completada", "cancelada"].includes(task.status)) continue;
    const key = `${task.greenhouse_id}:${task.type}`;
    const current = groups.get(key) ?? [];
    current.push(task);
    groups.set(key, current);
  }
  const repeated = [...groups.values()].find((tasks) => tasks.length >= 2);
  if (!repeated) return null;
  const first = repeated[0];
  return normalizeMemoryUpdate({
    memory_type: "pattern",
    module: "operation",
    greenhouse_id: first.greenhouse_id,
    entity_type: "task_type",
    entity_id: null,
    summary: `${greenhouseName(context, first.greenhouse_id)} acumula ${repeated.length} atrasos recientes en ${operationLabel(first.type).toLowerCase()}.`,
    confidence: Math.min(0.9, 0.5 + repeated.length * 0.1),
    evidence: repeated.slice(0, 3).map((task: any) => ({
      label: "Actividad atrasada",
      value: `${task.title} (${task.scheduled_date})`,
      source_type: "operation",
      source_id: task.id,
      greenhouse_id: task.greenhouse_id
    }))
  });
}

async function aiAnswer(openaiKey: string, model: string, message: string, context: any, memories: any[], history: any[]) {
  const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: systemPrompt() },
          { type: "input_text", text: JSON.stringify({ message, context, memories, recent_conversation: history }) }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "mira_chat_response",
          strict: true,
          schema: chatSchema()
        }
      }
    })
  });

  const openaiJson = await openaiResponse.json();
  if (!openaiResponse.ok) throw new Error(openaiJson?.error?.message ?? "openai_request_failed");
  const outputText = openaiJson.output_text
    ?? openaiJson.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("empty_openai_output");
  const parsed = JSON.parse(outputText);
  return {
    answer: trimAnswer(parsed.answer || "No pude generar una respuesta confiable con la evidencia disponible."),
    evidence: normalizeEvidence(parsed.evidence ?? []),
    suggested_actions: (parsed.suggested_actions ?? []).map(normalizeAction),
    memory_updates: (parsed.memory_updates ?? []).map(normalizeMemoryUpdate).filter((item: any) => item.summary)
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_COPILOT_MODEL") || Deno.env.get("OPENAI_AGENT_MODEL") || "gpt-5.5";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ error: "missing_supabase_env" }, 500);

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization) return response({ error: "not_authenticated" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response({ error: "not_authenticated" }, 401);

  const body = await request.json().catch(() => ({}));
  const companyId = nullableUuid(body.company_id ?? body.companyId);
  const rawGreenhouseId = String(body.greenhouse_id ?? body.greenhouseId ?? "").trim();
  const greenhouseId = rawGreenhouseId ? nullableUuid(rawGreenhouseId) : null;
  const conversationId = nullableUuid(body.conversation_id ?? body.conversationId);
  const message = compactText(body.message, "");

  if (!companyId) return response({ error: "company_required" }, 400);
  if (rawGreenhouseId && !greenhouseId) return response({ error: "invalid_greenhouse" }, 400);
  if (!message) return response({ error: "message_required" }, 400);

  const { data: membership } = await adminClient
    .from("company_members")
    .select("role, status")
    .eq("company_id", companyId)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return response({ error: "not_allowed" }, 403);
  }

  if (greenhouseId) {
    const { data: greenhouse } = await adminClient
      .from("greenhouses")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", greenhouseId)
      .maybeSingle();
    if (!greenhouse) return response({ error: "greenhouse_not_found" }, 404);
  }

  let conversation = null;
  if (conversationId) {
    const { data, error } = await adminClient
      .from("copilot_conversations")
      .select("id, greenhouse_id, title, status")
      .eq("company_id", companyId)
      .eq("id", conversationId)
      .maybeSingle();
    if (error || !data) return response({ error: "conversation_not_found" }, 404);
    conversation = data;
  } else {
    const title = message.length > 72 ? `${message.slice(0, 69)}...` : message;
    const { data, error } = await adminClient
      .from("copilot_conversations")
      .insert({
        company_id: companyId,
        greenhouse_id: greenhouseId,
        requested_by: authData.user.id,
        title
      })
      .select("id, greenhouse_id, title, status")
      .maybeSingle();
    if (error || !data) return response({ error: "conversation_create_failed" }, 500);
    conversation = data;
  }

  const effectiveGreenhouseId = greenhouseId || conversation.greenhouse_id || null;

  await adminClient.from("copilot_messages").insert({
    company_id: companyId,
    conversation_id: conversation.id,
    role: "user",
    content: message,
    created_by: authData.user.id
  });

  const today = localIsoDate();
  const lookbackStart = addDays(today, -30);
  const lookaheadEnd = addDays(today, 7);

  const tasksQuery = adminClient
    .from("tasks")
    .select("id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, priority, instructions, blocked_reason")
    .eq("company_id", companyId)
    .gte("scheduled_date", lookbackStart)
    .lte("scheduled_date", lookaheadEnd)
    .order("scheduled_date", { ascending: true })
    .limit(80);
  if (effectiveGreenhouseId) tasksQuery.eq("greenhouse_id", effectiveGreenhouseId);

  const greenhousesQuery = adminClient.from("greenhouses").select("id, name").eq("company_id", companyId);
  if (effectiveGreenhouseId) greenhousesQuery.eq("id", effectiveGreenhouseId);

  const weatherQuery = adminClient
    .from("weather_snapshots")
    .select("id, greenhouse_id, recorded_at, temperature_c, relative_humidity_percent, precipitation_mm, precipitation_probability_percent, risk_label, risk_tone")
    .eq("company_id", companyId)
    .gte("recorded_at", `${lookbackStart}T00:00:00Z`)
    .order("recorded_at", { ascending: false })
    .limit(30);
  if (effectiveGreenhouseId) weatherQuery.eq("greenhouse_id", effectiveGreenhouseId);

  const pestsQuery = adminClient
    .from("pest_alerts")
    .select("id, greenhouse_id, problem, severity, affected_zone, detected_at, follow_up, is_resolved")
    .eq("company_id", companyId)
    .gte("detected_at", lookbackStart)
    .order("detected_at", { ascending: false })
    .limit(30);
  if (effectiveGreenhouseId) pestsQuery.eq("greenhouse_id", effectiveGreenhouseId);

  const labQuery = adminClient
    .from("technical_lab_studies")
    .select("id, greenhouse_id, study_type, sample_date, diagnostic_status, summary, diagnosis, recommended_actions")
    .eq("company_id", companyId)
    .gte("sample_date", lookbackStart)
    .order("sample_date", { ascending: false })
    .limit(12);
  if (effectiveGreenhouseId) labQuery.eq("greenhouse_id", effectiveGreenhouseId);

  const nutritionEventsQuery = adminClient
    .from("nutrition_monitoring_events")
    .select("id, greenhouse_id, sample_date, ddt, notes, source_label")
    .eq("company_id", companyId)
    .gte("sample_date", lookbackStart)
    .order("sample_date", { ascending: false })
    .limit(12);
  if (effectiveGreenhouseId) nutritionEventsQuery.eq("greenhouse_id", effectiveGreenhouseId);

  const harvestQuery = adminClient
    .from("harvest_records")
    .select("id, greenhouse_id, occurred_at, kilograms, first_quality_kg, second_quality_kg, discard_kg, destination")
    .eq("company_id", companyId)
    .gte("occurred_at", lookbackStart)
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (effectiveGreenhouseId) harvestQuery.eq("greenhouse_id", effectiveGreenhouseId);

  const costsQuery = adminClient
    .from("cost_records")
    .select("id, greenhouse_id, category, amount, occurred_at, supplier, notes")
    .eq("company_id", companyId)
    .gte("occurred_at", lookbackStart)
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (effectiveGreenhouseId) costsQuery.eq("greenhouse_id", effectiveGreenhouseId);

  const memoryQuery = adminClient
    .from("copilot_memory")
    .select("id, greenhouse_id, module, entity_type, entity_id, memory_type, summary, evidence, confidence, last_seen_at")
    .eq("company_id", companyId)
    .order("last_seen_at", { ascending: false })
    .limit(12);
  if (effectiveGreenhouseId) memoryQuery.or(`greenhouse_id.eq.${effectiveGreenhouseId},greenhouse_id.is.null`);

  const historyQuery = adminClient
    .from("copilot_messages")
    .select("role, content, evidence, suggested_actions, created_at")
    .eq("company_id", companyId)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const [tasksResult, greenhousesResult, weatherResult, pestsResult, labResult, nutritionResult, harvestResult, costsResult, memoryResult, historyResult] = await Promise.all([
    tasksQuery,
    greenhousesQuery,
    weatherQuery,
    pestsQuery,
    labQuery,
    nutritionEventsQuery,
    harvestQuery,
    costsQuery,
    memoryQuery,
    historyQuery
  ]);

  if (tasksResult.error) return response({ error: tasksResult.error.message }, 500);
  if (greenhousesResult.error) return response({ error: greenhousesResult.error.message }, 500);

  const nutritionEventIds = (nutritionResult.data ?? []).map((item: any) => item.id);
  const nutritionObservations = nutritionEventIds.length
    ? await adminClient
      .from("nutrition_monitoring_observations")
      .select("id, event_id, analyte_key, analyte_label, observation_text, recommendation_text, severity")
      .eq("company_id", companyId)
      .in("event_id", nutritionEventIds)
      .limit(30)
    : { data: [], error: null };

  const context = {
    today,
    greenhouseById: Object.fromEntries((greenhousesResult.data ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name])),
    tasks: tasksResult.data ?? [],
    weather: weatherResult.error ? [] : weatherResult.data ?? [],
    pests: pestsResult.error ? [] : pestsResult.data ?? [],
    lab: labResult.error ? [] : labResult.data ?? [],
    nutritionEvents: nutritionResult.error ? [] : nutritionResult.data ?? [],
    nutritionObservations: nutritionObservations.error ? [] : nutritionObservations.data ?? [],
    harvest: harvestResult.error ? [] : harvestResult.data ?? [],
    costs: costsResult.error ? [] : costsResult.data ?? []
  };

  const memories = memoryResult.error ? [] : memoryResult.data ?? [];
  const history = (historyResult.data ?? []).reverse();
  let source = "deterministic";
  let aiError = null;
  let result = localFallback(message, context, memories);

  if (openaiKey) {
    try {
      result = await aiAnswer(openaiKey, model, message, context, memories, history);
      source = "openai";
    } catch (caught) {
      aiError = caught?.message ?? "openai_request_failed";
      result = localFallback(message, context, memories);
    }
  }

  const { data: assistantMessage, error: messageError } = await adminClient
    .from("copilot_messages")
    .insert({
      company_id: companyId,
      conversation_id: conversation.id,
      role: "assistant",
      content: result.answer,
      evidence: result.evidence,
      suggested_actions: result.suggested_actions,
      metadata: { source, model: source === "openai" ? model : null, ai_error: aiError },
      created_by: authData.user.id
    })
    .select("id")
    .maybeSingle();

  if (messageError) return response({ error: "message_save_failed" }, 500);

  const existingSummaries = new Set(memories.map((memory: any) => compactText(memory.summary).toLowerCase()));
  const memoryUpdates = result.memory_updates
    .map(normalizeMemoryUpdate)
    .filter((memory: any) => memory.summary && !existingSummaries.has(memory.summary.toLowerCase()))
    .slice(0, 3);

  if (memoryUpdates.length) {
    await adminClient.from("copilot_memory").insert(memoryUpdates.map((memory: any) => ({
      company_id: companyId,
      greenhouse_id: memory.greenhouse_id,
      module: memory.module,
      entity_type: memory.entity_type,
      entity_id: memory.entity_id,
      memory_type: memory.memory_type,
      summary: memory.summary,
      evidence: memory.evidence,
      confidence: memory.confidence,
      created_by: authData.user.id
    })));
  }

  if (result.suggested_actions.length && assistantMessage?.id) {
    await adminClient.from("copilot_decisions").insert(result.suggested_actions.map((action: any) => ({
      company_id: companyId,
      conversation_id: conversation.id,
      message_id: assistantMessage.id,
      decision_type: action.kind === "task" ? "task" : action.kind === "message" ? "message" : action.kind === "dismissal" ? "dismissal" : "review",
      proposed_action: action,
      status: "proposed",
      created_by: authData.user.id
    })));
  }

  return response({
    ok: true,
    source,
    conversation_id: conversation.id,
    message: {
      id: assistantMessage?.id ?? crypto.randomUUID(),
      role: "assistant",
      content: result.answer,
      evidence: result.evidence,
      suggested_actions: result.suggested_actions,
      metadata: { source, model: source === "openai" ? model : null, ai_error: aiError }
    },
    memory_updates: memoryUpdates
  });
});
