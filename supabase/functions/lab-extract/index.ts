// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const studyTypes = new Set(["suelo", "agua", "fertilidad", "pasta_saturada", "solucion_suelo_avanzada", "foliar"]);
const diagnosticStatuses = new Set(["sin_clasificar", "adecuado", "atencion", "critico"]);
const valueStatuses = new Set(["bajo", "adecuado", "alto", "critico", "sin_clasificar"]);
const parameterGroups = new Set(["datos_generales", "aniones", "cationes", "micronutrientes", "relaciones", "foliar", "otros"]);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function normalizeStudyType(value: unknown) {
  const text = String(value ?? "suelo").trim();
  return studyTypes.has(text) ? text : "suelo";
}

function normalizeDiagnosticStatus(value: unknown) {
  const text = String(value ?? "sin_clasificar").trim();
  return diagnosticStatuses.has(text) ? text : "sin_clasificar";
}

function normalizeValueStatus(value: unknown) {
  const text = String(value ?? "sin_clasificar").trim();
  return valueStatuses.has(text) ? text : "sin_clasificar";
}

function normalizeGroup(value: unknown) {
  const text = String(value ?? "otros").trim();
  return parameterGroups.has(text) ? text : "otros";
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableInteger(value: unknown) {
  const parsed = nullableNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

async function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function extractionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["study_type", "sample_date", "lab_name", "folio", "diagnostic_status", "summary", "diagnosis", "recommended_actions", "parameters"],
    properties: {
      study_type: { type: "string", enum: [...studyTypes] },
      sample_date: { type: ["string", "null"], description: "Fecha de muestra en formato YYYY-MM-DD si aparece." },
      lab_name: { type: ["string", "null"] },
      folio: { type: ["string", "null"] },
      diagnostic_status: { type: "string", enum: [...diagnosticStatuses] },
      summary: { type: ["string", "null"] },
      diagnosis: { type: ["string", "null"] },
      recommended_actions: { type: ["string", "null"] },
      parameters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "parameter_group",
            "parameter_key",
            "parameter_label",
            "value_text",
            "unit",
            "value_secondary_text",
            "secondary_unit",
            "range_text",
            "ideal_level_text",
            "status",
            "source_label",
            "confidence",
            "source_page",
            "observation"
          ],
          properties: {
            parameter_group: { type: "string", enum: [...parameterGroups] },
            parameter_key: { type: ["string", "null"] },
            parameter_label: { type: "string" },
            value_text: { type: ["string", "null"] },
            unit: { type: ["string", "null"] },
            value_secondary_text: { type: ["string", "null"] },
            secondary_unit: { type: ["string", "null"] },
            range_text: { type: ["string", "null"] },
            ideal_level_text: { type: ["string", "null"] },
            status: { type: "string", enum: [...valueStatuses] },
            source_label: { type: ["string", "null"] },
            confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
            source_page: { type: ["integer", "null"] },
            observation: { type: ["string", "null"] }
          }
        }
      }
    }
  };
}

function prompt() {
  return `Extrae un estudio tecnico agricola de laboratorio.

Devuelve solo datos visibles o inferencias de tipo/estado muy conservadoras.
Tipos validos: suelo, agua, fertilidad, pasta_saturada, solucion_suelo_avanzada, foliar.
Grupos validos: datos_generales, aniones, cationes, micronutrientes, relaciones, foliar, otros.

Reglas:
- Conserva unidades tal como aparecen: ppm, %, me/L, mg/L, dS/m, mS/cm.
- Si hay dos columnas de resultado como me/L y ppm, usa value_text/unit para la primera y value_secondary_text/secondary_unit para la segunda.
- Si hay columnas de niveles/rangos, colocalas en range_text o ideal_level_text.
- En Phytomonitor foliar, usa grupo foliar y conserva ppm y %.
- En Fertilab extracto de saturacion separa aniones y cationes.
- En fertilidad de suelo agrega relaciones como Ca/Mg, Mg/K, Ca+Mg/K y saturacion de bases cuando aparezcan.
- confidence debe reflejar que tan seguro estas leyendo el dato del documento.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_LAB_MODEL") || "gpt-5.5";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "missing_supabase_env" }, 500);
  if (!openaiKey) return json({ error: "missing_openai_api_key" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing_authorization" }, 401);

  const { study_id } = await req.json().catch(() => ({}));
  if (!study_id) return json({ error: "study_id_required" }, 400);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userResult, error: userError } = await userClient.auth.getUser();
  if (userError || !userResult?.user) return json({ error: "invalid_user" }, 401);

  const { data: study, error: studyError } = await adminClient
    .from("technical_lab_studies")
    .select("id, company_id, greenhouse_id")
    .eq("id", study_id)
    .single();

  if (studyError || !study) return json({ error: "study_not_found" }, 404);

  const { data: membership, error: membershipError } = await adminClient
    .from("company_members")
    .select("role, status")
    .eq("company_id", study.company_id)
    .eq("user_id", userResult.user.id)
    .eq("status", "active")
    .single();

  if (membershipError || !["owner", "admin"].includes(membership?.role)) {
    return json({ error: "forbidden" }, 403);
  }

  const { data: files, error: filesError } = await adminClient
    .from("technical_lab_study_files")
    .select("id, file_name, mime_type, storage_path, file_kind")
    .eq("study_id", study_id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (filesError) return json({ error: "file_lookup_failed" }, 500);
  const file = files?.[0];
  if (!file) return json({ error: "study_file_required" }, 400);

  await adminClient
    .from("technical_lab_studies")
    .update({ ai_extraction_status: "pending", review_status: "draft" })
    .eq("id", study_id);

  try {
    const { data: fileBytes, error: downloadError } = await adminClient.storage
      .from("technical-lab-files")
      .download(file.storage_path);

    if (downloadError || !fileBytes) throw downloadError ?? new Error("download_failed");

    const base64 = await arrayBufferToBase64(await fileBytes.arrayBuffer());
    const fileContent = file.file_kind === "pdf"
      ? { type: "input_file", filename: file.file_name, file_data: `data:${file.mime_type};base64,${base64}` }
      : { type: "input_image", image_url: `data:${file.mime_type};base64,${base64}` };

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
            fileContent,
            { type: "input_text", text: prompt() }
          ]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "lab_study_extraction",
            strict: true,
            schema: extractionSchema()
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
    const extracted = JSON.parse(outputText);

    await adminClient.from("technical_lab_study_values").delete().eq("study_id", study_id);

    const studyPatch: Record<string, unknown> = {
      study_type: normalizeStudyType(extracted.study_type),
      lab_name: nullableText(extracted.lab_name),
      folio: nullableText(extracted.folio),
      diagnostic_status: normalizeDiagnosticStatus(extracted.diagnostic_status),
      summary: nullableText(extracted.summary),
      diagnosis: nullableText(extracted.diagnosis),
      recommended_actions: nullableText(extracted.recommended_actions),
      ai_summary: nullableText(extracted.summary),
      extracted_text: outputText,
      ai_extraction_status: "completed",
      review_status: "reviewed"
    };

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(extracted.sample_date ?? ""))) {
      studyPatch.sample_date = extracted.sample_date;
    }

    await adminClient
      .from("technical_lab_studies")
      .update(studyPatch)
      .eq("id", study_id);

    const rows = (extracted.parameters ?? [])
      .filter((parameter: any) => String(parameter?.parameter_label ?? "").trim())
      .map((parameter: any, index: number) => ({
        company_id: study.company_id,
        study_id,
        parameter_group: normalizeGroup(parameter.parameter_group),
        parameter_key: nullableText(parameter.parameter_key),
        parameter_label: String(parameter.parameter_label).trim(),
        value_text: nullableText(parameter.value_text) ?? "",
        unit: nullableText(parameter.unit),
        value_secondary_text: nullableText(parameter.value_secondary_text),
        secondary_unit: nullableText(parameter.secondary_unit),
        range_text: nullableText(parameter.range_text),
        ideal_level_text: nullableText(parameter.ideal_level_text),
        status: normalizeValueStatus(parameter.status),
        source_label: nullableText(parameter.source_label),
        confidence: nullableNumber(parameter.confidence),
        source_page: nullableInteger(parameter.source_page),
        observation: nullableText(parameter.observation),
        sort_order: index
      }));

    if (rows.length) {
      const { error: insertError } = await adminClient.from("technical_lab_study_values").insert(rows);
      if (insertError) throw insertError;
    }

    return json({ ok: true, parameters: rows.length });
  } catch (caught) {
    await adminClient
      .from("technical_lab_studies")
      .update({ ai_extraction_status: "failed" })
      .eq("id", study_id);

    return json({ error: caught?.message ?? "lab_extraction_failed" }, 500);
  }
});
