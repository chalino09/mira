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
  const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, disable_web_page_preview: true, parse_mode: "HTML", reply_markup: replyMarkup, text })
  });
  if (!result.ok) throw new Error(`telegram_send_${result.status}`);
  const payload = await result.json().catch(() => null);
  return Number.isSafeInteger(payload?.result?.message_id) ? payload.result.message_id : null;
}

async function editTelegramMessage(token: string, chatId: string, messageId: number, text: string, replyMarkup?: Record<string, unknown>) {
  const result = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      disable_web_page_preview: true,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      text
    })
  });
  if (!result.ok) throw new Error(`telegram_edit_${result.status}`);
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
      { text: "✅ Sí, terminar", callback_data: "flow:yes" },
      { text: "Cancelar", callback_data: "flow:no" }
    ]]
  };
}

function cancelKeyboard() {
  return {
    inline_keyboard: [[{ text: "Cancelar", callback_data: "flow:cancel" }]]
  };
}

function taskActionsKeyboard(taskId: string, planId: string, page = 0) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Listo", callback_data: `task:complete:${taskId}` },
        { text: "🚧 Problema", callback_data: `task:block:${taskId}` }
      ],
      [{ text: "⬅️ Regresar", callback_data: `menu:page:${planId}:${page}` }]
    ]
  };
}

function backToMenuKeyboard(planId?: string, page = 0) {
  return planId
    ? { inline_keyboard: [[{ text: "⬅️ Regresar", callback_data: `menu:page:${planId}:${page}` }]] }
    : undefined;
}

function problemTypeKeyboard(taskId: string) {
  return {
    inline_keyboard: [
      [{ text: "📦 Falta producto o material", callback_data: `block:material:${taskId}` }],
      [{ text: "🚧 Otro problema", callback_data: `block:other:${taskId}` }],
      [{ text: "⬅️ Regresar", callback_data: `task:view:${taskId}` }]
    ]
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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

const applicationCategoryAliases: Record<string, string> = {
  fertilizante: "fertilizante",
  bioestimulante: "bioestimulante",
  corrector: "corrector",
  "acondicionador de agua": "acondicionador_agua",
  acondicionador_agua: "acondicionador_agua",
  adyuvante: "adyuvante_coadyuvante",
  coadyuvante: "adyuvante_coadyuvante",
  adyuvante_coadyuvante: "adyuvante_coadyuvante",
  microorganismos: "microorganismos",
  fungicida: "fungicida",
  insecticida: "insecticida",
  acaricida: "acaricida",
  nematicida: "nematicida",
  bactericida: "bactericida",
  sanitizante: "sanitizante_desinfectante",
  desinfectante: "sanitizante_desinfectante",
  sanitizante_desinfectante: "sanitizante_desinfectante",
  "regulador de crecimiento": "regulador_crecimiento",
  regulador_crecimiento: "regulador_crecimiento"
};

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
  if (normalized.includes("desarrollo") || normalized.includes("crecimiento")) return "desarrollo";
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
  const category = Object.entries(applicationCategoryAliases).find(([alias]) => normalized.includes(alias))?.[1];
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
  const boxCount = matchNumber(normalized, [
    /(\d+(?:[\.,]\d+)?)\s*cajas?\b/,
    /\bcosecha\s+(\d+(?:[\.,]\d+)?)\s*cajas?\b/
  ]) ?? 0;
  const boxWeightKg = matchNumber(normalized, [
    /(\d+(?:[\.,]\d+)?)\s*kg\s*(?:\/|por)?\s*caja\b/,
    /\bde\s+(\d+(?:[\.,]\d+)?)\s*kg\b/
  ]) ?? 20;
  const firstQualityBoxes = matchNumber(normalized, [/\b(?:primera|1ra)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const secondQualityBoxes = matchNumber(normalized, [/\b(?:segunda|2da)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const thirdQualityBoxes = matchNumber(normalized, [/\b(?:tercera|3ra)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const mermaBoxes = matchNumber(normalized, [/\b(?:merma|descarte)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const fallbackKilograms = matchNumber(normalized, [
    /(\d+(?:[\.,]\d+)?)\s*(?:kg|kilos)\b/,
    /\bcosecha\s+(\d+(?:[\.,]\d+)?)/
  ]) ?? 0;
  const firstQualityPrice = matchNumber(normalized, [/\b(?:precio1|precio primera|precio 1ra)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const secondQualityPrice = matchNumber(normalized, [/\b(?:precio2|precio segunda|precio 2da)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const thirdQualityPrice = matchNumber(normalized, [/\b(?:precio3|precio tercera|precio 3ra)\s+(\d+(?:[\.,]\d+)?)/]) ?? 0;
  const destination = matchTextAfter(normalized, ["destino"]) || "";
  const kilograms = boxCount ? boxCount * boxWeightKg : fallbackKilograms;
  const firstQualityKg = firstQualityBoxes * boxWeightKg;
  const secondQualityKg = secondQualityBoxes * boxWeightKg;
  const thirdQualityKg = thirdQualityBoxes * boxWeightKg;
  const mermaKg = mermaBoxes * boxWeightKg;
  const commercialKg = firstQualityKg + secondQualityKg + thirdQualityKg;
  const estimatedRevenue =
    firstQualityKg * firstQualityPrice +
    secondQualityKg * secondQualityPrice +
    thirdQualityKg * thirdQualityPrice;
  const estimatedPrice = commercialKg ? estimatedRevenue / commercialKg : 0;

  if (!kilograms) {
    return {
      ok: false,
      message: "Para completar cosecha responde las cajas. Ejemplo: cosecha 500 cajas de 20 kg primera 400 segunda 80 tercera 20 precio1 18 precio2 12 precio3 8 destino central"
    };
  }

  return {
    ok: true,
    payload: {
      occurredAt: localIsoDate(),
      kilograms,
      boxCount,
      boxWeightKg,
      firstQualityKg,
      secondQualityKg,
      thirdQualityKg,
      mermaKg,
      firstQualityBoxes,
      secondQualityBoxes,
      thirdQualityBoxes,
      mermaBoxes,
      firstQualityPrice,
      secondQualityPrice,
      thirdQualityPrice,
      estimatedPrice,
      destination,
      notes: text
    },
    summary: [
      boxCount ? `${boxCount} cajas` : `${kilograms} kg`,
      boxCount ? `${kilograms} kg` : "",
      firstQualityBoxes ? `1ra ${firstQualityBoxes}` : "",
      secondQualityBoxes ? `2da ${secondQualityBoxes}` : "",
      thirdQualityBoxes ? `3ra ${thirdQualityBoxes}` : "",
      mermaBoxes ? `merma ${mermaBoxes}` : ""
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
  if (task.type === "cosecha") return "Responde: cosecha 500 cajas de 20 kg primera 400 segunda 80 tercera 20 precio1 18 precio2 12 precio3 8 destino central";
  return "";
}

function hasCaptureSignal(task: any, text: string) {
  const normalized = normalizeText(text);
  if (task.type === "riego") {
    return /\d+(?:[\.,]\d+)?\s*(?:min|minutos)\b/.test(normalized)
      && /\d+(?:[\.,]\d+)?\s*(?:l|litros)\b/.test(normalized);
  }
  if (task.type === "aplicacion_foliar") {
    return Object.keys(applicationCategoryAliases).some((alias) => normalized.includes(alias));
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
    .select("id, company_id, weekly_plan_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, instructions, technical_plan")
    .eq("company_id", connection.company_id)
    .in("id", allowedIds)
    .not("status", "in", "(completada,verificada,cancelada,bloqueada)")
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

async function loadPlanTaskContext(adminClient: any, connection: any, planId: string) {
  const { data: assignments } = await adminClient
    .from("task_assignments")
    .select("task_id")
    .eq("company_id", connection.company_id)
    .eq("user_id", connection.user_id);
  const taskIds = (assignments ?? []).map((row: any) => row.task_id).filter(Boolean);
  if (!taskIds.length) return { tasks: [], greenhouseById: new Map() };

  const { data: tasks } = await adminClient
    .from("tasks")
    .select("id, company_id, weekly_plan_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, instructions, technical_plan")
    .eq("company_id", connection.company_id)
    .eq("weekly_plan_id", planId)
    .in("id", taskIds)
    .not("status", "in", "(completada,verificada,cancelada,bloqueada)")
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  const greenhouseIds = Array.from(new Set((tasks ?? []).map((task: any) => task.greenhouse_id).filter(Boolean)));
  const { data: greenhouses } = greenhouseIds.length
    ? await adminClient.from("greenhouses").select("id, name").eq("company_id", connection.company_id).in("id", greenhouseIds)
    : { data: [] };
  return { tasks: tasks ?? [], greenhouseById: new Map((greenhouses ?? []).map((greenhouse: any) => [greenhouse.id, greenhouse.name])) };
}

function taskMenuKeyboard(tasks: any[], planId: string, page: number) {
  const rows = tasks.map((task: any, index: number) => [{
    text: `${index + 1} · ${String(task.title).slice(0, 34)}`,
    callback_data: `task:view:${task.id}`
  }]);
  const nav = [];
  if (page > 0) nav.push({ text: "⬅️ Anterior", callback_data: `menu:page:${planId}:${page - 1}` });
  if (tasks.length === 5) nav.push({ text: "Siguiente ➡️", callback_data: `menu:page:${planId}:${page + 1}` });
  if (nav.length) rows.push(nav);
  return { inline_keyboard: rows };
}

async function showPlanMenu({ adminClient, botToken, chatId, connection, messageId, planId, page }: any) {
  const { tasks, greenhouseById } = await loadPlanTaskContext(adminClient, connection, planId);
  const pageSize = 5;
  const start = page * pageSize;
  const visibleTasks = tasks.slice(start, start + pageSize);
  if (!visibleTasks.length && page > 0) return showPlanMenu({ adminClient, botToken, chatId, connection, messageId, planId, page: page - 1 });
  const lines = visibleTasks.map((task: any, index: number) => {
    const time = task.scheduled_time ? task.scheduled_time.slice(0, 5) : "Sin hora";
    return `<b>${index + 1}. ${escapeHtml(activityLabel(task))} · ${escapeHtml(time)}</b>\n${escapeHtml(task.title)}\n📍 ${escapeHtml(greenhouseById.get(task.greenhouse_id) ?? "Invernadero")}`;
  });
  const text = tasks.length
    ? [`<b>🌱 MIRA · ACTIVIDADES ACTIVAS</b>`, `<b>${tasks.length} pendientes</b>`, ...lines, "<b>Selecciona una actividad:</b>"].join("\n\n")
    : "<b>✓ No tienes actividades pendientes.</b>";
  const keyboard = tasks.length ? taskMenuKeyboard(visibleTasks, planId, page) : undefined;
  await editTelegramMessage(botToken, chatId, messageId, text, keyboard);
}

async function loadMaterials(adminClient: any, task: any) {
  const { data } = await adminClient
    .from("task_materials")
    .select("id, product_id, product_name, composition, dose, unit, notes")
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

async function executeTelegramWorkAction(
  adminClient: any,
  connection: any,
  task: any,
  action: "block" | "complete",
  note: string | null,
  executionPayload: any = {}
) {
  if (action === "complete") {
    const { error: verificationError } = await adminClient
      .from("tasks")
      .update({ verification_required: true })
      .eq("id", task.id)
      .eq("company_id", task.company_id);
    if (verificationError) throw verificationError;
  }

  const { error } = await adminClient.rpc("execute_telegram_work_action", {
    target_work_id: task.id,
    target_actor_user_id: connection.user_id,
    target_action: action,
    target_note: note,
    target_payload: executionPayload
  });
  if (error) throw error;
}

async function executeConfirmedAction(adminClient: any, connection: any, payload: any) {
  const { tasks } = await loadTaskContext(adminClient, connection, [payload.taskId]);
  const task = tasks[0];
  if (!task) throw new Error("task_not_found");

  if (payload.action === "block") {
    await executeTelegramWorkAction(adminClient, connection, task, "block", payload.note || "Telegram: actividad bloqueada");
    return { task, message: "Bloqueo reportado." };
  }

  if (payload.executionPayload) {
    await executeTelegramWorkAction(
      adminClient,
      connection,
      task,
      "complete",
      "Telegram: registro técnico confirmado",
      payload.executionPayload
    );
    return { task, message: "Actividad completada y registro tecnico guardado." };
  }

  await executeTelegramWorkAction(adminClient, connection, task, "complete", "Telegram: actividad completada");
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
  executionSummary,
  messageId,
  planId,
  page = 0
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
  messageId?: number;
  planId?: string;
  page?: number;
}) {
  const payload = {
    action,
    taskId: task.id,
    note,
    executionPayload,
    planId,
    page
  };

  const verb = action === "block" ? "reportar el problema" : "terminar";
  const extra = executionSummary ? `\nDatos: ${executionSummary}` : "";
  const text = `<b>¿Confirmas ${verb}?</b>\n${escapeHtml(taskLine(task, greenhouseName))}${escapeHtml(extra)}\n\nToca una opción.`;
  if (messageId) {
    const saved = await saveSession(adminClient, connection, chatId, "confirmation", { ...payload, messageId });
    if (!saved) {
      await editTelegramMessage(botToken, chatId, messageId, "No pude guardar la confirmación. Intenta desde Mira.");
      return;
    }
    await editTelegramMessage(botToken, chatId, messageId, text, confirmationKeyboard());
    return;
  }

  const confirmationMessageId = await sendTelegramMessage(botToken, chatId, text, confirmationKeyboard());
  const saved = await saveSession(adminClient, connection, chatId, "confirmation", { ...payload, messageId: confirmationMessageId });
  if (!saved && confirmationMessageId) {
    await editTelegramMessage(botToken, chatId, confirmationMessageId, "No pude guardar la confirmación. Intenta desde Mira.");
  }
}

async function startActionForTask({
  adminClient,
  botToken,
  chatId,
  connection,
  greenhouseName,
  task,
  parsed,
  originalText,
  messageId,
  planId,
  page = 0
}: {
  adminClient: any;
  botToken: string;
  chatId: string;
  connection: any;
  greenhouseName: string;
  task: any;
  parsed: any;
  originalText: string;
  messageId?: number;
  planId?: string;
  page?: number;
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
      note: `Telegram: ${parsed.note || originalText}`,
      messageId,
      planId,
      page
    });
    return;
  }

  const parser = captureParserForTask(task);
  if (!parser) {
    await askConfirmation({ adminClient, botToken, chatId, connection, greenhouseName, task, action: "complete", messageId, planId, page });
    return;
  }

  if (task.type === "aplicacion_foliar" || task.type === "fertirriego" || task.type === "fertilizacion") {
    const materials = await loadMaterials(adminClient, task);
    if (!materials.length) {
      const text = "<b>Esta actividad no tiene insumos planeados.</b>\nCompleta o edita la actividad desde Mira.";
      if (messageId) {
        await editTelegramMessage(botToken, chatId, messageId, text, backToMenuKeyboard(planId, page));
      } else {
        await sendTelegramMessage(botToken, chatId, text);
      }
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
      executionSummary: parsedCapture.summary,
      messageId,
      planId,
      page
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
      executionSummary: plannedExecution.summary,
      messageId,
      planId,
      page
    });
    return;
  }

  const saved = await saveSession(adminClient, connection, chatId, "capture_required", {
    action: "complete",
    taskId: task.id,
    messageId,
    planId,
    page
  });
  if (!saved) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "No pude guardar la captura pendiente. Revisa que el SQL 19 este ejecutado en Supabase."
    );
    return;
  }
  const captureText = `Antes de completar necesito la captura minima.\n${taskLine(task, greenhouseName)}\n\n${capturePromptForTask(task)}`;
  if (messageId) {
    await editTelegramMessage(botToken, chatId, messageId, captureText, cancelKeyboard());
  } else {
    await sendTelegramMessage(botToken, chatId, captureText, cancelKeyboard());
  }
}

async function handleMenuCallback({ adminClient, botToken, chatId, connection, callbackData, messageId }: any) {
  const match = callbackData.match(/^menu:page:([0-9a-f-]{36}):(\d{1,3})$/i);
  if (!match) return false;
  await clearSession(adminClient, connection);
  await showPlanMenu({ adminClient, botToken, chatId, connection, messageId, planId: match[1], page: Number(match[2]) });
  return true;
}

async function handleFlowCallback({ adminClient, botToken, chatId, connection, callbackData, messageId }: any) {
  if (!/^flow:(yes|no|cancel)$/.test(callbackData)) return false;
  const session = await loadSession(adminClient, connection);
  if (!session || session.payload?.messageId !== messageId) return true;

  if (callbackData === "flow:cancel" || callbackData === "flow:no") {
    await clearSession(adminClient, connection);
    if (session.payload?.planId) {
      await showPlanMenu({ adminClient, botToken, chatId, connection, messageId, planId: session.payload.planId, page: session.payload.page ?? 0 });
    } else {
      await editTelegramMessage(botToken, chatId, messageId, "<b>Sin cambios.</b>");
    }
    return true;
  }

  if (session.session_type !== "confirmation") return true;
  await clearSession(adminClient, connection);
  try {
    const result = await executeConfirmedAction(adminClient, connection, session.payload);
    const planId = session.payload?.planId ?? result.task.weekly_plan_id;
    if (planId) {
      await showPlanMenu({
        adminClient,
        botToken,
        chatId,
        connection,
        messageId,
        planId,
        page: session.payload?.page ?? 0
      });
    } else {
      await editTelegramMessage(botToken, chatId, messageId, `<b>✅ Actividad terminada</b>\n${escapeHtml(result.task.title)}`);
    }
  } catch (_caught) {
    if (session.payload?.planId) {
      await showPlanMenu({ adminClient, botToken, chatId, connection, messageId, planId: session.payload.planId, page: session.payload.page ?? 0 });
    } else {
      await editTelegramMessage(botToken, chatId, messageId, "<b>No pude guardar el cambio.</b> Intenta desde Mira.");
    }
  }
  return true;
}

async function handleBlockReasonCallback({ adminClient, botToken, chatId, connection, callbackData, messageId }: any) {
  const match = callbackData.match(/^block:(material|other):([0-9a-f-]{36})$/i);
  if (!match) return false;

  const { tasks } = await loadTaskContext(adminClient, connection, [match[2]]);
  const task = tasks[0];
  if (!task) {
    await clearSession(adminClient, connection);
    await editTelegramMessage(botToken, chatId, messageId, "Esta actividad ya no está pendiente o ya no está asignada a ti.");
    return true;
  }

  await clearSession(adminClient, connection);
  const note = match[1] === "material"
    ? "Telegram: Falta producto o material"
    : "Telegram: Problema reportado por encargado; requiere revisión de admin";
  try {
    await executeTelegramWorkAction(adminClient, connection, task, "block", note);
    await showPlanMenu({ adminClient, botToken, chatId, connection, messageId, planId: task.weekly_plan_id, page: 0 });
  } catch (_caught) {
    await editTelegramMessage(botToken, chatId, messageId, "No pude registrar el problema. Intenta desde Mira.");
  }
  return true;
}

async function handleTaskCallback({
  adminClient,
  botToken,
  chatId,
  connection,
  callbackData,
  messageId
}: {
  adminClient: any;
  botToken: string;
  chatId: string;
  connection: any;
  callbackData: string;
  messageId: number;
}) {
  const match = callbackData.match(/^task:(view|complete|block):([0-9a-f-]{36})$/i);
  if (!match) return false;

  const action = match[1];
  const taskId = match[2];
  const { tasks, greenhouseById } = await loadTaskContext(adminClient, connection, [taskId]);
  const task = tasks[0];
  if (!task) {
    await clearSession(adminClient, connection);
    await sendTelegramMessage(botToken, chatId, "Esta actividad ya no está pendiente o ya no está asignada a ti.");
    return true;
  }

  const greenhouseName = greenhouseById.get(task.greenhouse_id) ?? "Invernadero";
  const planId = task.weekly_plan_id;
  const existingSession = await loadSession(adminClient, connection);
  if (existingSession?.session_type === "confirmation" && existingSession.payload?.messageId === messageId) {
    return true;
  }
  await clearSession(adminClient, connection);

  if (action === "view") {
    const detail = [
      "<b>📋 ACTIVIDAD</b>",
      `<b>${escapeHtml(task.title)}</b>`,
      `${escapeHtml(task.scheduled_date)} · ${escapeHtml(task.scheduled_time ? task.scheduled_time.slice(0, 5) : "Sin hora")}`,
      `📍 ${escapeHtml(greenhouseName)}`,
      task.instructions ? `📝 ${escapeHtml(task.instructions)}` : ""
    ].filter(Boolean).join("\n\n");
    await editTelegramMessage(botToken, chatId, messageId, detail, taskActionsKeyboard(task.id, planId));
    return true;
  }

  if (action === "block") {
    await editTelegramMessage(botToken, chatId, messageId, `<b>¿Qué pasó?</b>\n${escapeHtml(task.title)}`, problemTypeKeyboard(task.id));
    return true;
  }

  const parser = captureParserForTask(task);
  if (!parser) {
    await askConfirmation({ adminClient, botToken, chatId, connection, greenhouseName, task, action: "complete", messageId, planId });
    return true;
  }
  await startActionForTask({
    adminClient,
    botToken,
    chatId,
    connection,
    greenhouseName,
    task,
    parsed: { action: "complete", note: null, query: "" },
    originalText: "",
    messageId,
    planId
  });
  return true;
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

    if (session.payload?.action === "block") {
      const reason = String(text ?? "").trim();
      if (reason.length < 3) {
        await sendTelegramMessage(botToken, chatId, "Escribe brevemente el motivo del bloqueo o cancela.", cancelKeyboard());
        return true;
      }
      await askConfirmation({
        adminClient,
        botToken,
        chatId,
        connection,
        greenhouseName: greenhouseById.get(task.greenhouse_id) ?? "Invernadero",
        task,
        action: "block",
        note: `Telegram: ${reason.slice(0, 500)}`,
        messageId: session.payload?.messageId,
        planId: session.payload?.planId
      });
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
      executionSummary: parsedCapture.summary,
      messageId: session.payload?.messageId,
      planId: session.payload?.planId,
      page: session.payload?.page
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
    .not("status", "in", "(completada,verificada,cancelada,bloqueada)")
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
    const { data: activeMembership } = await adminClient
      .from("company_members")
      .select("id")
      .eq("company_id", activeConnection.company_id)
      .eq("user_id", activeConnection.user_id)
      .eq("role", "manager")
      .eq("status", "active")
      .maybeSingle();

    if (!activeMembership) {
      await adminClient
        .from("notification_connections")
        .update({ status: "disabled" })
        .eq("id", activeConnection.id);
      await sendTelegramMessage(botToken, chatId, "Tu acceso de Telegram quedo desactivado. Pide a un owner o admin que revise tu usuario en Mira.");
      return response({ ok: true });
    }

    const callbackData = String(callbackQuery?.data ?? "");
    const messageId = Number(callbackMessage?.message_id ?? 0);
    const handledCallback = callbackData && messageId
      ? await handleMenuCallback({ adminClient, botToken, chatId, connection: activeConnection, callbackData, messageId })
        || await handleFlowCallback({ adminClient, botToken, chatId, connection: activeConnection, callbackData, messageId })
        || await handleBlockReasonCallback({ adminClient, botToken, chatId, connection: activeConnection, callbackData, messageId })
        || await handleTaskCallback({ adminClient, botToken, chatId, connection: activeConnection, callbackData, messageId })
      : false;
    if (!handledCallback) {
      await handleOperationalReply({ adminClient, botToken, chatId, connection: activeConnection, text });
    }
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
    .select("id, company_id, user_id")
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

  const { data: pendingMembership } = await adminClient
    .from("company_members")
    .select("id")
    .eq("company_id", connection.company_id)
    .eq("user_id", connection.user_id)
    .eq("role", "manager")
    .eq("status", "active")
    .maybeSingle();

  if (!pendingMembership) {
    await adminClient
      .from("notification_connections")
      .update({
        verification_code_hash: null,
        verification_expires_at: null,
        status: "disabled"
      })
      .eq("id", connection.id);
    await sendTelegramMessage(botToken, chatId, "Este enlace ya no esta vigente. Pide a un owner o admin que revise tu acceso en Mira.");
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
