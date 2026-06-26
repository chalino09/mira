// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

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

function insightSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["insights"],
    properties: {
      insights: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "source_type",
            "source_id",
            "greenhouse_id",
            "title",
            "detail",
            "severity",
            "recommended_action",
            "evidence"
          ],
          properties: {
            source_type: {
              type: "string",
              enum: ["operation", "weather", "nutrition", "lab", "costs", "report", "telegram"]
            },
            source_id: { type: ["string", "null"] },
            greenhouse_id: { type: ["string", "null"] },
            title: { type: "string" },
            detail: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            recommended_action: { type: ["string", "null"] },
            evidence: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "value"],
                properties: {
                  label: { type: "string" },
                  value: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  };
}

function systemPrompt() {
  return `Eres Mira Copilot, el orquestador operativo de una plataforma agricola.

Analiza solo la evidencia entregada. No inventes datos, productos, sensores ni acciones.
V1 es recomendacion con aprobacion humana: sugiere mensajes o tareas, pero no ejecutes.
Prioriza tareas vencidas, bloqueos, riesgos climaticos y hallazgos tecnicos.
Responde con frases breves, concretas y accionables para owner/admin.`;
}

function normalizeInsight(item: any) {
  const sourceType = String(item?.source_type ?? "operation");
  const severity = String(item?.severity ?? "medium");
  return {
    source_type: ["operation", "weather", "nutrition", "lab", "costs", "report", "telegram"].includes(sourceType)
      ? sourceType
      : "operation",
    source_id: nullableUuid(item?.source_id),
    greenhouse_id: nullableUuid(item?.greenhouse_id),
    title: compactText(item?.title, "Atencion operativa"),
    detail: compactText(item?.detail, "Revisar evidencia antes de actuar."),
    severity: ["low", "medium", "high", "critical"].includes(severity) ? severity : "medium",
    recommended_action: compactText(item?.recommended_action, "") || null,
    evidence: Array.isArray(item?.evidence)
      ? item.evidence.slice(0, 6).map((entry: any) => ({
          label: compactText(entry?.label, "Evidencia"),
          value: compactText(entry?.value, "")
        })).filter((entry: any) => entry.value)
      : []
  };
}

function operationLabel(type: string) {
  const labels: Record<string, string> = {
    riego: "Riego",
    fertirriego: "Fertirriego",
    fertilizacion: "Fertilizacion",
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

function deterministicInsights(context: any) {
  const insights: any[] = [];
  const today = context.today;
  const yesterday = addDays(today, -1);
  const greenhouseName = (id: string | null) => context.greenhouseById[id ?? ""] ?? "Area productiva";

  const overdue = context.tasks
    .filter((task: any) => task.scheduled_date < today && !["completada", "cancelada"].includes(task.status))
    .slice(0, 4);

  overdue.forEach((task: any) => {
    const isYesterday = task.scheduled_date === yesterday;
    insights.push({
      source_type: "operation",
      source_id: task.id,
      greenhouse_id: task.greenhouse_id,
      title: isYesterday ? "Actividad de ayer sin completar" : "Actividad vencida sin cierre",
      detail: `${operationLabel(task.type)} en ${greenhouseName(task.greenhouse_id)} quedo ${task.status}.`,
      severity: task.status === "bloqueada" ? "high" : isYesterday ? "medium" : "high",
      recommended_action: "Preparar mensaje al manager o crear una tarea de seguimiento.",
      evidence: [
        { label: "Actividad", value: task.title },
        { label: "Fecha", value: task.scheduled_date },
        { label: "Estado", value: task.status }
      ]
    });
  });

  context.tasks
    .filter((task: any) => task.status === "bloqueada")
    .slice(0, 3)
    .forEach((task: any) => {
      if (insights.some((insight) => insight.source_id === task.id)) return;
      insights.push({
        source_type: "operation",
        source_id: task.id,
        greenhouse_id: task.greenhouse_id,
        title: "Bloqueo operativo activo",
        detail: `${task.title} requiere decision antes de continuar.`,
        severity: "high",
        recommended_action: "Revisar motivo y preparar mensaje al responsable.",
        evidence: [
          { label: "Area", value: greenhouseName(task.greenhouse_id) },
          { label: "Motivo", value: task.blocked_reason || "Sin motivo registrado" }
        ]
      });
    });

  context.weather
    .filter((snapshot: any) => ["amber", "red"].includes(snapshot.risk_tone))
    .slice(0, 3)
    .forEach((snapshot: any) => {
      insights.push({
        source_type: "weather",
        source_id: snapshot.id,
        greenhouse_id: snapshot.greenhouse_id,
        title: snapshot.risk_tone === "red" ? "Riesgo climatico alto" : "Clima requiere atencion",
        detail: `${snapshot.risk_label || "Condicion climatica"} en ${greenhouseName(snapshot.greenhouse_id)}.`,
        severity: snapshot.risk_tone === "red" ? "critical" : "medium",
        recommended_action: "Revisar riegos, aplicaciones y actividades expuestas.",
        evidence: [
          { label: "Temperatura", value: snapshot.temperature_c === null ? "--" : `${snapshot.temperature_c} C` },
          { label: "Humedad", value: snapshot.relative_humidity_percent === null ? "--" : `${snapshot.relative_humidity_percent}%` },
          { label: "Lluvia", value: snapshot.precipitation_mm === null ? "--" : `${snapshot.precipitation_mm} mm` }
        ]
      });
    });

  context.pests
    .filter((alert: any) => alert.severity !== "baja")
    .slice(0, 3)
    .forEach((alert: any) => {
      insights.push({
        source_type: "operation",
        source_id: alert.id,
        greenhouse_id: alert.greenhouse_id,
        title: "Alerta sanitaria pendiente",
        detail: `${alert.problem} en ${alert.affected_zone || greenhouseName(alert.greenhouse_id)}.`,
        severity: alert.severity === "alta" ? "high" : "medium",
        recommended_action: "Confirmar seguimiento y programar revision si no existe tarea.",
        evidence: [
          { label: "Severidad", value: alert.severity },
          { label: "Fecha", value: alert.detected_at }
        ]
      });
    });

  return insights.slice(0, 6).map(normalizeInsight);
}

async function maybeAiInsights(openaiKey: string | undefined, model: string, context: any, fallback: any[]) {
  if (!openaiKey) return { source: "deterministic", insights: fallback };

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
          { type: "input_text", text: JSON.stringify({ ...context, deterministic_baseline: fallback }) }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "mira_copilot_daily_pulse",
          strict: true,
          schema: insightSchema()
        }
      }
    })
  });

  const openaiJson = await openaiResponse.json();
  if (!openaiResponse.ok) {
    throw new Error(openaiJson?.error?.message ?? "openai_request_failed");
  }

  const outputText = openaiJson.output_text
    ?? openaiJson.output?.flatMap((item: any) => item.content ?? []).find((item: any) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("empty_openai_output");

  const parsed = JSON.parse(outputText);
  const insights = (parsed.insights ?? []).map(normalizeInsight).filter((insight: any) => insight.title && insight.detail);
  return { source: "openai", insights: insights.length ? insights : fallback };
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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response({ error: "not_authenticated" }, 401);

  const body = await request.json().catch(() => ({}));
  const companyId = String(body.company_id ?? body.companyId ?? "");
  const greenhouseId = String(body.greenhouse_id ?? body.greenhouseId ?? "");
  if (!companyId) return response({ error: "company_required" }, 400);

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

  const today = localIsoDate();
  const lookbackStart = addDays(today, -10);
  const lookaheadEnd = addDays(today, 7);

  const tasksQuery = adminClient
    .from("tasks")
    .select("id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, priority, instructions, blocked_reason")
    .eq("company_id", companyId)
    .gte("scheduled_date", lookbackStart)
    .lte("scheduled_date", lookaheadEnd)
    .order("scheduled_date", { ascending: true });
  if (greenhouseId) tasksQuery.eq("greenhouse_id", greenhouseId);

  const greenhousesQuery = adminClient
    .from("greenhouses")
    .select("id, name")
    .eq("company_id", companyId);
  if (greenhouseId) greenhousesQuery.eq("id", greenhouseId);

  const weatherQuery = adminClient
    .from("weather_snapshots")
    .select("id, greenhouse_id, recorded_at, temperature_c, relative_humidity_percent, precipitation_mm, risk_label, risk_tone")
    .eq("company_id", companyId)
    .gte("recorded_at", `${lookbackStart}T00:00:00Z`)
    .order("recorded_at", { ascending: false })
    .limit(20);
  if (greenhouseId) weatherQuery.eq("greenhouse_id", greenhouseId);

  const pestsQuery = adminClient
    .from("pest_alerts")
    .select("id, greenhouse_id, problem, severity, affected_zone, detected_at, follow_up")
    .eq("company_id", companyId)
    .gte("detected_at", lookbackStart)
    .order("detected_at", { ascending: false })
    .limit(20);
  if (greenhouseId) pestsQuery.eq("greenhouse_id", greenhouseId);

  const [tasksResult, greenhousesResult, weatherResult, pestsResult] = await Promise.all([
    tasksQuery,
    greenhousesQuery,
    weatherQuery,
    pestsQuery
  ]);

  if (tasksResult.error) return response({ error: tasksResult.error.message }, 500);
  if (greenhousesResult.error) return response({ error: greenhousesResult.error.message }, 500);

  const context = {
    today,
    greenhouseById: Object.fromEntries((greenhousesResult.data ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name])),
    tasks: tasksResult.data ?? [],
    weather: weatherResult.error ? [] : weatherResult.data ?? [],
    pests: pestsResult.error ? [] : pestsResult.data ?? []
  };

  const fallback = deterministicInsights(context);
  let source = "deterministic";
  let insights = fallback;
  let runId = null;
  let runStatus = "completed";
  let errorMessage = null;

  try {
    const aiResult = await maybeAiInsights(openaiKey ?? undefined, model, context, fallback);
    source = aiResult.source;
    insights = aiResult.insights;
  } catch (caught) {
    runStatus = "failed";
    errorMessage = caught?.message ?? "copilot_failed";
    insights = fallback;
  }

  const { data: run } = await adminClient
    .from("copilot_runs")
    .insert({
      company_id: companyId,
      greenhouse_id: greenhouseId || null,
      requested_by: authData.user.id,
      run_type: "daily_pulse",
      model: source === "openai" ? model : null,
      status: runStatus,
      input_summary: {
        task_count: context.tasks.length,
        weather_count: context.weather.length,
        pest_count: context.pests.length
      },
      output_summary: { source, insight_count: insights.length },
      error_message: errorMessage
    })
    .select("id")
    .maybeSingle();

  runId = run?.id ?? null;

  if (insights.length) {
    await adminClient.from("copilot_insights").insert(
      insights.map((insight: any) => ({
        company_id: companyId,
        greenhouse_id: insight.greenhouse_id,
        run_id: runId,
        source_type: insight.source_type,
        source_id: insight.source_id,
        title: insight.title,
        detail: insight.detail,
        severity: insight.severity,
        recommended_action: insight.recommended_action,
        evidence: insight.evidence
      }))
    );
  }

  return response({ ok: true, source, runId, insights });
});
