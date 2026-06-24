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

async function sendTelegramMessage(token: string, chatId: string, text: string, replyMarkup?: Record<string, unknown>) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, disable_web_page_preview: true, reply_markup: replyMarkup, text })
  });
}

async function answerCallbackQuery(token: string, callbackQueryId: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

function selectionKeyboard(count: number) {
  const numberButtons = Array.from({ length: count }, (_item, index) => ({
    text: String(index + 1),
    callback_data: `op:sel:${index + 1}`
  }));
  const rows = [];
  for (let index = 0; index < numberButtons.length; index += 3) {
    rows.push(numberButtons.slice(index, index + 3));
  }
  rows.push([{ text: "Cancelar", callback_data: "op:cancel" }]);
  return { inline_keyboard: rows };
}

function confirmationKeyboard() {
  return {
    inline_keyboard: [[
      { text: "SI", callback_data: "op:yes" },
      { text: "NO", callback_data: "op:no" }
    ]]
  };
}

function cancelKeyboard() {
  return {
    inline_keyboard: [[{ text: "Cancelar", callback_data: "op:cancel" }]]
  };
}

function callbackText(data: string) {
  const selectionMatch = data.match(/^op:sel:(\d{1,2})$/);
  if (selectionMatch) return selectionMatch[1];
  if (data === "op:yes") return "SI";
  if (data === "op:no") return "NO";
  if (data === "op:cancel") return "cancelar";
  return data;
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

const applicationCategories = new Set([
  "bioestimulante",
  "fungicida",
  "insecticida",
  "fertilizante",
  "microorganismos",
  "corrector"
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.,:-]/g, " ")
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

function expiresAt(minutes = 20) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function activityLabel(task: any) {
  if (task.type === "otro" && task.technical_plan?.cycleWorkType) return "Preparacion de ciclo";
  return activityLabels[task.type] ?? task.type;
}

function taskLine(task: any, greenhouseName = "Invernadero") {
  const date = task.scheduled_date ?? "Sin fecha";
  const time = task.scheduled_time ? task.scheduled_time.slice(0, 5) : "Sin hora";
  return `${date} ${time} · ${activityLabel(task)} · ${task.title} · ${greenhouseName}`;
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

function parseNumber(value: string) {
  const match = normalizeText(value).match(/^(\d{1,2})\.?$/);
  return match ? Number(match[1]) : null;
}

function parseYesNo(value: string) {
  const normalized = normalizeText(value);
  if (/^(si|s|yes|y|ok|okay|va|confirmo|confirmar|listo)$/.test(normalized)) return "yes";
  if (/^(no|n|cancelar|cancela|cancelado|mejor no)$/.test(normalized)) return "no";
  return null;
}

function isCancel(value: string) {
  return /^(cancelar|cancela|salir|olvidar)$/i.test(normalizeText(value));
}

function numeric(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function intNumeric(value: string | null | undefined) {
  const parsed = numeric(value);
  return parsed === null ? null : Math.round(parsed);
}

function matchNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = numeric(match?.[1]);
    if (value !== null) return value;
  }
  return null;
}

function matchTextAfter(text: string, keys: string[]) {
  const keyPattern = keys.join("|");
  const stopPattern = "(?:\\bph\\b|\\bce\\b|\\bec\\b|\\bkg\\b|\\bkilos\\b|\\blitros\\b|\\bl\\b|\\bmin\\b|\\bminutos\\b|\\bcategoria\\b|\\bprecio\\b|\\bdestino\\b)";
  const match = text.match(new RegExp(`\\b(?:${keyPattern})\\b\\s+(.+?)(?=\\s+${stopPattern}|$)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function dbMethod(value: string | undefined, fallback = "fertirriego") {
  const normalized = normalizeText(value ?? "");
  if (normalized.includes("foliar")) return "foliar";
  if (normalized.includes("drench")) return "drench";
  if (normalized.includes("fertirriego")) return "fertirriego";
  return fallback;
}

function dbStage(value: string | undefined) {
  const normalized = normalizeText(value ?? "");
  if (normalized.includes("vegetativo")) return "vegetativo";
  if (normalized.includes("floracion")) return "floracion";
  if (normalized.includes("cuajado")) return "cuajado";
  if (normalized.includes("produccion")) return "produccion";
  if (normalized.includes("descanso")) return "descanso";
  return null;
}

function dbObjective(value: string | undefined) {
  const normalized = normalizeText(value ?? "");
  if (normalized.includes("raiz")) return "raiz";
  if (normalized.includes("floracion")) return "floracion";
  if (normalized.includes("cuajado")) return "cuajado";
  if (normalized.includes("engorde")) return "engorde";
  if (normalized.includes("calidad")) return "calidad";
  return null;
}

function parseIrrigationCapture(text: string, task: any) {
  const normalized = normalizeText(text);
  const durationMin = intNumeric(normalized.match(/(\d+(?:[\.,]\d+)?)\s*(?:min|minutos)\b/)?.[1]);
  const liters = matchNumber(normalized, [
    /(\d+(?:[\.,]\d+)?)\s*(?:l|litros)\b/,
    /\blitros?\s+(\d+(?:[\.,]\d+)?)/
  ]);
  const ph = matchNumber(normalized, [/\bph\s*:?\s*(\d+(?:[\.,]\d+)?)/]);
  const ec = matchNumber(normalized, [/\b(?:ce|ec)\s*:?\s*(\d+(?:[\.,]\d+)?)/]);
  const sector = matchTextAfter(normalized, ["sector", "valvula", "cama"]) || task.technical_plan?.sector || "";

  if (!durationMin || !liters) {
    return {
      ok: false,
      message: "Para completar riego responde con duracion y litros. Ejemplo: riego 45 min 1200 L sector 2 ph 6.1 ce 2.4"
    };
  }

  return {
    ok: true,
    payload: {
      occurredAt: localIsoDate(),
      durationMin,
      estimatedLiters: liters,
      sector,
      ph,
      ec,
      notes: text
    },
    summary: [
      `${durationMin} min`,
      `${liters} L`,
      sector ? `sector ${sector}` : "",
      ph !== null ? `pH ${ph}` : "",
      ec !== null ? `CE ${ec}` : ""
    ].filter(Boolean).join(" · ")
  };
}

function parseApplicationCapture(text: string, task: any) {
  const normalized = normalizeText(text);
  const category = Array.from(applicationCategories).find((item) => normalized.includes(item));
  const appliedArea = matchTextAfter(normalized, ["area", "zona", "sector"]) || task.technical_plan?.appliedArea || "";

  if (!category) {
    return {
      ok: false,
      message: "Para completar aplicacion responde la categoria. Ejemplo: aplicacion categoria fungicida area nave norte"
    };
  }

  return {
    ok: true,
    payload: {
      occurredAt: localIsoDate(),
      appliedArea,
      category,
      notes: text
    },
    summary: [`categoria ${category}`, appliedArea ? `area ${appliedArea}` : ""].filter(Boolean).join(" · ")
  };
}

function parseNutritionCapture(text: string, task: any) {
  const normalized = normalizeText(text);
  const ph = matchNumber(normalized, [/\bph\s*:?\s*(\d+(?:[\.,]\d+)?)/]);
  const ec = matchNumber(normalized, [/\b(?:ce|ec)\s*:?\s*(\d+(?:[\.,]\d+)?)/]);
  const method = dbMethod(normalized, task.type === "fertirriego" ? "fertirriego" : dbMethod(task.technical_plan?.method));
  const stage = dbStage(normalized) ?? dbStage(task.technical_plan?.stage);
  const objective = dbObjective(normalized) ?? dbObjective(task.technical_plan?.objective);

  return {
    ok: true,
    payload: {
      occurredAt: localIsoDate(),
      method,
      cropStage: stage,
      objective,
      ph,
      ec,
      notes: text
    },
    summary: [
      `metodo ${method}`,
      ph !== null ? `pH ${ph}` : "",
      ec !== null ? `CE ${ec}` : "",
      objective ? `objetivo ${objective}` : ""
    ].filter(Boolean).join(" · ")
  };
}

function parseHarvestCapture(text: string, task: any) {
  const normalized = normalizeText(text);
  const kilograms = matchNumber(normalized, [
    /(\d+(?:[\.,]\d+)?)\s*(?:kg|kilos)\b/,
    /\bcosecha\s+(\d+(?:[\.,]\d+)?)/
  ]);
  const firstQualityKg = matchNumber(normalized, [/\b(?:primera|calidad)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const secondQualityKg = matchNumber(normalized, [/\bsegunda\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const discardKg = matchNumber(normalized, [/\b(?:descarte|merma)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const estimatedPrice = matchNumber(normalized, [/\bprecio\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const destination = matchTextAfter(normalized, ["destino"]) || "";

  if (!kilograms) {
    return {
      ok: false,
      message: "Para completar cosecha responde los kilos. Ejemplo: cosecha 120 kg primera 100 segunda 15 descarte 5 precio 18 destino central"
    };
  }

  return {
    ok: true,
    payload: {
      occurredAt: localIsoDate(),
      kilograms,
      firstQualityKg,
      secondQualityKg,
      discardKg,
      estimatedPrice,
      destination,
      notes: text
    },
    summary: [
      `${kilograms} kg`,
      firstQualityKg ? `primera ${firstQualityKg}` : "",
      secondQualityKg ? `segunda ${secondQualityKg}` : "",
      discardKg ? `descarte ${discardKg}` : "",
      estimatedPrice ? `precio ${estimatedPrice}` : ""
    ].filter(Boolean).join(" · ")
  };
}

function captureParserForTask(task: any) {
  if (task.type === "riego") return parseIrrigationCapture;
  if (task.type === "aplicacion_foliar") return parseApplicationCapture;
  if (task.type === "fertirriego" || task.type === "fertilizacion") return parseNutritionCapture;
  if (task.type === "cosecha") return parseHarvestCapture;
  return null;
}

function capturePromptForTask(task: any) {
  if (task.type === "riego") return "Responde: riego 45 min 1200 L sector 2 ph 6.1 ce 2.4";
  if (task.type === "aplicacion_foliar") return "Responde: aplicacion categoria fungicida area nave norte";
  if (task.type === "fertirriego" || task.type === "fertilizacion") return "Responde: nutricion ph 5.8 ce 2.4. Si no tienes pH/CE, responde: nutricion ok";
  if (task.type === "cosecha") return "Responde: cosecha 120 kg primera 100 segunda 15 descarte 5 precio 18 destino central";
  return "";
}

function hasCaptureSignal(task: any, text: string) {
  const normalized = normalizeText(text);
  if (task.type === "riego") {
    return /\d+(?:[\.,]\d+)?\s*(?:min|minutos)\b/.test(normalized)
      && /\d+(?:[\.,]\d+)?\s*(?:l|litros)\b/.test(normalized);
  }
  if (task.type === "aplicacion_foliar") {
    return Array.from(applicationCategories).some((item) => normalized.includes(item));
  }
  if (task.type === "fertirriego" || task.type === "fertilizacion") {
    return /\b(?:ph|ce|ec)\b/.test(normalized) || /\bnutricion\s+ok\b/.test(normalized);
  }
  if (task.type === "cosecha") {
    return /\d+(?:[\.,]\d+)?\s*(?:kg|kilos)\b/.test(normalized);
  }
  return false;
}

async function loadSession(adminClient: any, connection: any) {
  const { data, error } = await adminClient
    .from("telegram_operational_sessions")
    .select("id, session_type, payload, expires_at")
    .eq("company_id", connection.company_id)
    .eq("user_id", connection.user_id)
    .eq("channel", "telegram")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("telegram_session_load_failed", error);
  }

  return data ?? null;
}

async function saveSession(adminClient: any, connection: any, chatId: string, sessionType: string, payload: Record<string, unknown>) {
  const { error } = await adminClient.from("telegram_operational_sessions").upsert({
    company_id: connection.company_id,
    user_id: connection.user_id,
    channel: "telegram",
    external_chat_id: chatId,
    session_type: sessionType,
    payload,
    expires_at: expiresAt()
  }, { onConflict: "company_id,user_id,channel" });

  if (error) {
    console.error("telegram_session_save_failed", error);
    return false;
  }

  return true;
}

async function clearSession(adminClient: any, connection: any) {
  const { error } = await adminClient
    .from("telegram_operational_sessions")
    .delete()
    .eq("company_id", connection.company_id)
    .eq("user_id", connection.user_id)
    .eq("channel", "telegram");

  if (error) {
    console.error("telegram_session_clear_failed", error);
  }
}

async function loadTaskContext(adminClient: any, connection: any, taskIds: string[]) {
  if (!taskIds.length) return { tasks: [], greenhouseById: new Map() };

  const { data: assigned } = await adminClient
    .from("task_assignments")
    .select("task_id")
    .eq("company_id", connection.company_id)
    .eq("user_id", connection.user_id)
    .in("task_id", taskIds);
  const allowedIds = (assigned ?? []).map((row: any) => row.task_id);
  if (!allowedIds.length) return { tasks: [], greenhouseById: new Map() };

  const { data: tasks } = await adminClient
    .from("tasks")
    .select("id, company_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, instructions, technical_plan")
    .eq("company_id", connection.company_id)
    .in("id", allowedIds)
    .not("status", "in", "(completada,cancelada)")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });

  const greenhouseIds = Array.from(new Set((tasks ?? []).map((task: any) => task.greenhouse_id).filter(Boolean)));
  const { data: greenhouses } = greenhouseIds.length
    ? await adminClient
        .from("greenhouses")
        .select("id, name")
        .eq("company_id", connection.company_id)
        .in("id", greenhouseIds)
    : { data: [] };

  return {
    tasks: tasks ?? [],
    greenhouseById: new Map((greenhouses ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name]))
  };
}

async function loadMaterials(adminClient: any, task: any) {
  const { data } = await adminClient
    .from("task_materials")
    .select("id, product_id, product_name, dose, unit, notes")
    .eq("company_id", task.company_id)
    .eq("task_id", task.id)
    .order("mixing_order", { ascending: true });

  const materials = data ?? [];
  const productIds = materials.map((material: any) => material.product_id).filter(Boolean);
  if (!productIds.length) return materials;

  const { data: products } = await adminClient
    .from("products")
    .select("id, category")
    .eq("company_id", task.company_id)
    .in("id", productIds);
  const categoryByProductId = new Map((products ?? []).map((product: any) => [product.id, product.category]));

  return materials.map((material: any) => ({
    ...material,
    product_category: categoryByProductId.get(material.product_id) ?? null
  }));
}

function recordDose(material: any) {
  return [material.dose, material.unit].filter(Boolean).join(" ") || "No especificada";
}

function plannedNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  return numeric(value);
}

async function plannedExecutionForTask(adminClient: any, task: any) {
  const plan = task.technical_plan ?? {};

  if (task.type === "riego") {
    const durationMin = intNumeric(plan.plannedDurationMin);
    const estimatedLiters = plannedNumber(plan.plannedLiters);
    if (!durationMin || !estimatedLiters) return null;

    const ph = plannedNumber(plan.targetPh);
    const ec = plannedNumber(plan.targetEc);
    return {
      payload: {
        occurredAt: localIsoDate(),
        durationMin,
        estimatedLiters,
        sector: plan.sector ?? "",
        ph,
        ec,
        notes: "Telegram: completado con plan tecnico"
      },
      summary: [
        "segun plan",
        `${durationMin} min`,
        `${estimatedLiters} L`,
        plan.sector ? `sector ${plan.sector}` : "",
        ph !== null ? `pH ${ph}` : "",
        ec !== null ? `CE ${ec}` : ""
      ].filter(Boolean).join(" · ")
    };
  }

  if (task.type === "aplicacion_foliar") {
    const materials = await loadMaterials(adminClient, task);
    if (!materials.length || materials.some((material: any) => !material.product_category)) return null;

    return {
      payload: {
        occurredAt: localIsoDate(),
        appliedArea: plan.appliedArea ?? "",
        category: null,
        notes: "Telegram: completado con productos planeados"
      },
      summary: [
        "productos planeados",
        plan.appliedArea ? `area ${plan.appliedArea}` : "",
        `${materials.length} insumo${materials.length === 1 ? "" : "s"}`
      ].filter(Boolean).join(" · ")
    };
  }

  if (task.type === "fertirriego" || task.type === "fertilizacion") {
    const materials = await loadMaterials(adminClient, task);
    if (!materials.length) return null;

    const ph = plannedNumber(plan.targetPh);
    const ec = plannedNumber(plan.targetEc);
    const method = dbMethod(plan.method, task.type === "fertirriego" ? "fertirriego" : "fertirriego");
    const objective = dbObjective(plan.objective);
    return {
      payload: {
        occurredAt: localIsoDate(),
        method,
        cropStage: dbStage(plan.stage),
        objective,
        ph,
        ec,
        notes: "Telegram: completado con productos planeados"
      },
      summary: [
        "productos planeados",
        `metodo ${method}`,
        ph !== null ? `pH ${ph}` : "",
        ec !== null ? `CE ${ec}` : "",
        objective ? `objetivo ${objective}` : "",
        `${materials.length} insumo${materials.length === 1 ? "" : "s"}`
      ].filter(Boolean).join(" · ")
    };
  }

  return null;
}

async function setTaskStatus(adminClient: any, connection: any, task: any, nextStatus: string, note: string | null) {
  const patch = nextStatus === "completada"
    ? {
        blocked_reason: null,
        completed_at: new Date().toISOString(),
        started_at: null,
        status: nextStatus,
        updated_at: new Date().toISOString()
      }
    : {
        blocked_reason: note,
        completed_at: null,
        started_at: null,
        status: nextStatus,
        updated_at: new Date().toISOString()
      };

  const { error } = await adminClient
    .from("tasks")
    .update(patch)
    .eq("id", task.id)
    .eq("company_id", connection.company_id);

  if (error) throw error;

  await adminClient.from("task_updates").insert({
    actor_user_id: connection.user_id,
    company_id: connection.company_id,
    note,
    task_id: task.id,
    update_type: nextStatus === "completada" ? "completed" : "blocked",
    metadata: { source: "telegram" }
  });
}

async function completeTechnicalTask(adminClient: any, connection: any, task: any, executionPayload: any) {
  if (task.type === "riego") {
    const { error } = await adminClient.from("irrigation_records").upsert({
      company_id: task.company_id,
      greenhouse_id: task.greenhouse_id,
      occurred_at: executionPayload.occurredAt,
      duration_min: executionPayload.durationMin,
      estimated_liters: executionPayload.estimatedLiters,
      sector: executionPayload.sector || null,
      ph: executionPayload.ph,
      ec: executionPayload.ec,
      notes: executionPayload.notes || task.instructions || null,
      responsible_user_id: connection.user_id,
      created_by: connection.user_id,
      source_task_id: task.id
    }, { onConflict: "source_task_id" });
    if (error) throw error;
  }

  if (task.type === "aplicacion_foliar") {
    const materials = await loadMaterials(adminClient, task);
    if (!materials.length) throw new Error("application_materials_required");
    const rows = materials.map((material: any) => ({
      company_id: task.company_id,
      greenhouse_id: task.greenhouse_id,
      product_id: material.product_id,
      category: material.product_category ?? executionPayload.category,
      product_name: material.product_name,
      composition: null,
      dose: recordDose(material),
      applied_area: executionPayload.appliedArea || null,
      safety_interval: null,
      reentry_interval: null,
      occurred_at: executionPayload.occurredAt,
      notes: executionPayload.notes || material.notes || task.instructions || null,
      responsible_user_id: connection.user_id,
      created_by: connection.user_id,
      source_task_id: task.id,
      source_task_material_id: material.id
    }));
    const { error } = await adminClient
      .from("application_records")
      .upsert(rows, { onConflict: "source_task_material_id" });
    if (error) throw error;
  }

  if (task.type === "fertirriego" || task.type === "fertilizacion") {
    const materials = await loadMaterials(adminClient, task);
    if (!materials.length) throw new Error("nutrition_products_required");
    const rows = materials.map((material: any) => ({
      company_id: task.company_id,
      greenhouse_id: task.greenhouse_id,
      product_id: material.product_id,
      product_name: material.product_name,
      dose: recordDose(material),
      method: executionPayload.method,
      ph: executionPayload.ph,
      ec: executionPayload.ec,
      occurred_at: executionPayload.occurredAt,
      crop_stage: executionPayload.cropStage,
      objective: executionPayload.objective,
      notes: executionPayload.notes || material.notes || task.instructions || null,
      responsible_user_id: connection.user_id,
      created_by: connection.user_id,
      source_task_id: task.id,
      source_task_material_id: material.id
    }));
    const { error } = await adminClient
      .from("nutrition_records")
      .upsert(rows, { onConflict: "source_task_material_id" });
    if (error) throw error;
  }

  if (task.type === "cosecha") {
    const { error } = await adminClient.from("harvest_records").upsert({
      company_id: task.company_id,
      greenhouse_id: task.greenhouse_id,
      occurred_at: executionPayload.occurredAt,
      kilograms: executionPayload.kilograms,
      first_quality_kg: executionPayload.firstQualityKg ?? 0,
      second_quality_kg: executionPayload.secondQualityKg ?? 0,
      discard_kg: executionPayload.discardKg ?? 0,
      estimated_price: executionPayload.estimatedPrice ?? 0,
      destination: executionPayload.destination || null,
      notes: executionPayload.notes || task.instructions || null,
      responsible_user_id: connection.user_id,
      created_by: connection.user_id,
      source_task_id: task.id
    }, { onConflict: "source_task_id" });
    if (error) throw error;
  }

  await setTaskStatus(adminClient, connection, task, "completada", "Telegram: registro tecnico confirmado");
}

async function executeConfirmedAction(adminClient: any, connection: any, payload: any) {
  const { tasks } = await loadTaskContext(adminClient, connection, [payload.taskId]);
  const task = tasks[0];
  if (!task) throw new Error("task_not_found");

  if (payload.action === "block") {
    await setTaskStatus(adminClient, connection, task, "bloqueada", payload.note || "Telegram: actividad bloqueada");
    return { task, message: "Bloqueo reportado." };
  }

  if (payload.executionPayload) {
    await completeTechnicalTask(adminClient, connection, task, payload.executionPayload);
    return { task, message: "Actividad completada y registro tecnico guardado." };
  }

  await setTaskStatus(adminClient, connection, task, "completada", "Telegram: actividad completada");
  return { task, message: "Actividad completada." };
}

async function askConfirmation({
  adminClient,
  botToken,
  chatId,
  connection,
  greenhouseName,
  task,
  action,
  note,
  executionPayload,
  executionSummary
}: {
  adminClient: any;
  botToken: string;
  chatId: string;
  connection: any;
  greenhouseName: string;
  task: any;
  action: string;
  note?: string;
  executionPayload?: any;
  executionSummary?: string;
}) {
  const saved = await saveSession(adminClient, connection, chatId, "confirmation", {
    action,
    taskId: task.id,
    note,
    executionPayload
  });

  if (!saved) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "No pude guardar la confirmacion. Revisa que el SQL 19 este ejecutado en Supabase."
    );
    return;
  }

  const verb = action === "block" ? "bloquear" : "completar";
  const extra = executionSummary ? `\nDatos: ${executionSummary}` : "";
  await sendTelegramMessage(
    botToken,
    chatId,
    `Confirmas ${verb} esta actividad?\n${taskLine(task, greenhouseName)}${extra}\n\nToca SI o NO.`,
    confirmationKeyboard()
  );
}

async function startActionForTask({
  adminClient,
  botToken,
  chatId,
  connection,
  greenhouseName,
  task,
  parsed,
  originalText
}: {
  adminClient: any;
  botToken: string;
  chatId: string;
  connection: any;
  greenhouseName: string;
  task: any;
  parsed: any;
  originalText: string;
}) {
  if (parsed.action === "block") {
    await askConfirmation({
      adminClient,
      botToken,
      chatId,
      connection,
      greenhouseName,
      task,
      action: "block",
      note: `Telegram: ${parsed.note || originalText}`
    });
    return;
  }

  const parser = captureParserForTask(task);
  if (!parser) {
    await askConfirmation({ adminClient, botToken, chatId, connection, greenhouseName, task, action: "complete" });
    return;
  }

  if (task.type === "aplicacion_foliar" || task.type === "fertirriego" || task.type === "fertilizacion") {
    const materials = await loadMaterials(adminClient, task);
    if (!materials.length) {
      await sendTelegramMessage(botToken, chatId, "Esta actividad no tiene insumos planeados. Completa o edita la actividad desde Mira.");
      return;
    }
  }

  const parsedCapture = parser(originalText, task);
  if (parsedCapture.ok && hasCaptureSignal(task, originalText)) {
    await askConfirmation({
      adminClient,
      botToken,
      chatId,
      connection,
      greenhouseName,
      task,
      action: "complete",
      executionPayload: parsedCapture.payload,
      executionSummary: parsedCapture.summary
    });
    return;
  }

  const plannedExecution = await plannedExecutionForTask(adminClient, task);
  if (plannedExecution) {
    await askConfirmation({
      adminClient,
      botToken,
      chatId,
      connection,
      greenhouseName,
      task,
      action: "complete",
      executionPayload: plannedExecution.payload,
      executionSummary: plannedExecution.summary
    });
    return;
  }

  const saved = await saveSession(adminClient, connection, chatId, "capture_required", {
    action: "complete",
    taskId: task.id
  });
  if (!saved) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "No pude guardar la captura pendiente. Revisa que el SQL 19 este ejecutado en Supabase."
    );
    return;
  }
  await sendTelegramMessage(
    botToken,
    chatId,
    `Antes de completar necesito la captura minima.\n${taskLine(task, greenhouseName)}\n\n${capturePromptForTask(task)}`,
    cancelKeyboard()
  );
}

async function handleSessionReply({ adminClient, botToken, chatId, connection, session, text }: any) {
  if (isCancel(text)) {
    await clearSession(adminClient, connection);
    await sendTelegramMessage(botToken, chatId, "Listo, cancele la operacion en curso.");
    return true;
  }

  if (session.session_type === "task_selection") {
    const selectedNumber = parseNumber(text);
    const taskIds = session.payload?.taskIds ?? [];
    if (!selectedNumber || selectedNumber < 1 || selectedNumber > taskIds.length) {
      await sendTelegramMessage(
        botToken,
        chatId,
        `Toca un numero del 1 al ${taskIds.length}, o cancela.`,
        selectionKeyboard(taskIds.length)
      );
      return true;
    }

    const { tasks, greenhouseById } = await loadTaskContext(adminClient, connection, [taskIds[selectedNumber - 1]]);
    const task = tasks[0];
    if (!task) {
      await clearSession(adminClient, connection);
      await sendTelegramMessage(botToken, chatId, "Esa actividad ya no esta pendiente. Intenta de nuevo.");
      return true;
    }

    await startActionForTask({
      adminClient,
      botToken,
      chatId,
      connection,
      greenhouseName: greenhouseById.get(task.greenhouse_id) ?? "Invernadero",
      task,
      parsed: { action: session.payload.action, note: session.payload.note, query: "" },
      originalText: session.payload.note ?? ""
    });
    return true;
  }

  if (session.session_type === "capture_required") {
    const { tasks, greenhouseById } = await loadTaskContext(adminClient, connection, [session.payload?.taskId]);
    const task = tasks[0];
    if (!task) {
      await clearSession(adminClient, connection);
      await sendTelegramMessage(botToken, chatId, "Esa actividad ya no esta pendiente. Intenta de nuevo.");
      return true;
    }

    const parser = captureParserForTask(task);
    const parsedCapture = parser?.(text, task);
    if (!parsedCapture?.ok) {
      await sendTelegramMessage(botToken, chatId, parsedCapture?.message ?? capturePromptForTask(task));
      return true;
    }

    await askConfirmation({
      adminClient,
      botToken,
      chatId,
      connection,
      greenhouseName: greenhouseById.get(task.greenhouse_id) ?? "Invernadero",
      task,
      action: "complete",
      executionPayload: parsedCapture.payload,
      executionSummary: parsedCapture.summary
    });
    return true;
  }

  if (session.session_type === "confirmation") {
    const answer = parseYesNo(text);
    if (!answer) {
      await sendTelegramMessage(botToken, chatId, "Toca SI para confirmar o NO para cancelar.", confirmationKeyboard());
      return true;
    }

    if (answer === "no") {
      await clearSession(adminClient, connection);
      await sendTelegramMessage(botToken, chatId, "Sin cambios. No actualice la actividad.");
      return true;
    }

    try {
      const result = await executeConfirmedAction(adminClient, connection, session.payload);
      await clearSession(adminClient, connection);
      await sendTelegramMessage(botToken, chatId, `${result.message}\n${taskLine(result.task)}`);
    } catch (_caught) {
      await clearSession(adminClient, connection);
      await sendTelegramMessage(botToken, chatId, "No pude guardar el cambio. Intenta desde Mira.");
    }
    return true;
  }

  return false;
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
  const session = await loadSession(adminClient, connection);
  if (session && await handleSessionReply({ adminClient, botToken, chatId, connection, session, text })) {
    return;
  }

  const parsed = parseOperationalReply(text);
  if (parsed.action === "help") {
    await sendTelegramMessage(
      botToken,
      chatId,
      [
        "Puedes responder: completado riego de hoy.",
        "Si hay varias opciones, te pedire el numero.",
        "Antes de guardar te pedire SI o NO.",
        "Para cancelar un flujo escribe: cancelar."
      ].join("\n")
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
    if (!candidates.length) {
      await sendTelegramMessage(botToken, chatId, "No encontre una actividad que coincida. Intenta con el nombre, por ejemplo: completado riego.");
      return;
    }

    const visibleCandidates = candidates.slice(0, 9);
    const saved = await saveSession(adminClient, connection, chatId, "task_selection", {
      action: parsed.action,
      note: parsed.note,
      taskIds: visibleCandidates.map((task: any) => task.id)
    });
    if (!saved) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "No pude guardar la seleccion. Revisa que el SQL 19 este ejecutado en Supabase."
      );
      return;
    }
    const lines = visibleCandidates.map((task: any, index: number) =>
      `${index + 1}. ${taskLine(task, greenhouseById.get(task.greenhouse_id) ?? "Invernadero")}`
    );
    await sendTelegramMessage(
      botToken,
      chatId,
      `Tengo varias posibles actividades. Toca el numero:\n${lines.join("\n")}\n\nO cancela.`,
      selectionKeyboard(visibleCandidates.length)
    );
    return;
  }

  const task = candidates[0];
  await startActionForTask({
    adminClient,
    botToken,
    chatId,
    connection,
    greenhouseName: greenhouseById.get(task.greenhouse_id) ?? "Invernadero",
    task,
    parsed,
    originalText: text
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
  const callbackQuery = update?.callback_query;
  const callbackMessage = callbackQuery?.message;

  if (callbackQuery?.id) {
    await answerCallbackQuery(botToken, String(callbackQuery.id));
  }

  const chat = message?.chat ?? callbackMessage?.chat;
  if (!chat?.id || chat.type !== "private") return response({ ok: true });

  const chatId = String(chat.id);
  const text = callbackQuery?.data
    ? callbackText(String(callbackQuery.data))
    : String(message?.text ?? "").trim();
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

  if (callbackQuery) {
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
    await sendTelegramMessage(botToken, chatId, "Este enlace vencio o ya fue usado. Genera uno nuevo desde Mira.");
    return response({ ok: true });
  }

  const displayName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ");
  const { error } = await adminClient
    .from("notification_connections")
    .update({
      external_chat_id: chatId,
      external_username: message?.from?.username ?? null,
      external_display_name: displayName || null,
      verification_code_hash: null,
      verification_expires_at: null,
      status: "active",
      verified_at: new Date().toISOString()
    })
    .eq("id", connection.id)
    .eq("status", "pending");

  if (error) {
    await sendTelegramMessage(botToken, chatId, "No pudimos completar la conexion. Intenta generar otro enlace desde Mira.");
    return response({ ok: true });
  }

  await sendTelegramMessage(botToken, chatId, "Telegram quedo conectado con Mira. Aqui recibiras tus actividades operativas.");
  return response({ ok: true });
});
