"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, FlaskConical, Plus, Save, Sprout, Trash2, Upload, WandSparkles } from "lucide-react";
import { Field, SelectInput, TextInput } from "@/components/forms/FormControls";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { appErrorMessage } from "@/lib/errors";
import { uploadPrivateCompanyFile } from "@/lib/storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";

type LabStudyType = "suelo" | "agua" | "fertilidad" | "pasta_saturada" | "solucion_suelo_avanzada" | "foliar";
type LabDiagnosticStatus = "sin_clasificar" | "adecuado" | "atencion" | "critico";
type LabValueStatus = "bajo" | "adecuado" | "alto" | "critico" | "sin_clasificar";
type LabReviewStatus = "draft" | "reviewed" | "approved";
type LabAiStatus = "not_requested" | "pending" | "completed" | "failed";
type LabParameterGroup = "datos_generales" | "aniones" | "cationes" | "micronutrientes" | "relaciones" | "foliar" | "otros";

type LabParameterDraft = {
  id: string;
  parameterKey: string;
  parameterGroup: LabParameterGroup;
  parameterLabel: string;
  valueText: string;
  unit: string;
  valueSecondaryText: string;
  secondaryUnit: string;
  rangeMin: string;
  rangeMax: string;
  rangeText: string;
  idealLevelText: string;
  status: LabValueStatus;
  sourceLabel: string;
  confidence: string;
  sourcePage: string;
  observation: string;
};

type LabValueRow = {
  id: string;
  study_id: string;
  parameter_group: LabParameterGroup;
  parameter_key: string | null;
  parameter_label: string;
  value_text: string;
  unit: string | null;
  value_secondary_text: string | null;
  secondary_unit: string | null;
  range_min: number | string | null;
  range_max: number | string | null;
  range_text: string | null;
  ideal_level_text: string | null;
  status: LabValueStatus;
  source_label: string | null;
  confidence: number | string | null;
  source_page: number | string | null;
  observation: string | null;
  sort_order: number;
};

type LabFileRow = {
  id: string;
  study_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
  file_kind: "pdf" | "imagen" | "otro";
};

type LabStudyRow = {
  id: string;
  greenhouse_id: string;
  study_type: LabStudyType;
  sample_date: string;
  lab_name: string | null;
  folio: string | null;
  diagnostic_status: LabDiagnosticStatus;
  review_status: LabReviewStatus;
  ai_extraction_status: LabAiStatus;
  summary: string | null;
  diagnosis: string | null;
  recommended_actions: string | null;
  notes: string | null;
  created_at: string;
  values: LabValueRow[];
  files: LabFileRow[];
};

const studyTypeOptions: Array<{ id: LabStudyType; label: string; detail: string }> = [
  { id: "suelo", label: "Suelo", detail: "Caracterización química/física del suelo." },
  { id: "agua", label: "Agua", detail: "Calidad de agua para riego." },
  { id: "fertilidad", label: "Fertilidad", detail: "Disponibilidad nutrimental y reservas." },
  { id: "pasta_saturada", label: "Pasta saturada", detail: "Extracto de pasta saturada." },
  { id: "solucion_suelo_avanzada", label: "Solución de suelo avanzada", detail: "Solución de suelo con lectura ampliada." },
  { id: "foliar", label: "Foliar", detail: "Análisis de hoja/planta con ppm, porcentaje y niveles." }
];

const valueStatusOptions: Array<{ id: LabValueStatus; label: string }> = [
  { id: "sin_clasificar", label: "Sin clasificar" },
  { id: "bajo", label: "Bajo" },
  { id: "adecuado", label: "Adecuado" },
  { id: "alto", label: "Alto" },
  { id: "critico", label: "Crítico" }
];

const parameterGroupOptions: Array<{ id: LabParameterGroup; label: string }> = [
  { id: "datos_generales", label: "Datos generales" },
  { id: "aniones", label: "Aniones" },
  { id: "cationes", label: "Cationes" },
  { id: "micronutrientes", label: "Micronutrientes" },
  { id: "relaciones", label: "Relaciones" },
  { id: "foliar", label: "Foliar" },
  { id: "otros", label: "Otros" }
];

const aiStatusLabels: Record<LabAiStatus, string> = {
  not_requested: "Pendiente",
  pending: "Extrayendo",
  completed: "Listo para revisar",
  failed: "Error"
};

const reviewStatusLabels: Record<LabReviewStatus, string> = {
  draft: "Borrador",
  reviewed: "Revisar",
  approved: "Verificado"
};

const diagnosticStatusOptions: Array<{ id: LabDiagnosticStatus; label: string }> = [
  { id: "sin_clasificar", label: "Sin clasificar" },
  { id: "adecuado", label: "Adecuado" },
  { id: "atencion", label: "Requiere atención" },
  { id: "critico", label: "Crítico" }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newDraftParameter(parameter?: { key: string; label: string; unit: string; secondaryUnit?: string }, group: LabParameterGroup = "otros"): LabParameterDraft {
  return {
    id: crypto.randomUUID(),
    parameterKey: parameter?.key ?? "",
    parameterGroup: group,
    parameterLabel: parameter?.label ?? "",
    valueText: "",
    unit: parameter?.unit ?? "",
    valueSecondaryText: "",
    secondaryUnit: parameter?.secondaryUnit ?? "",
    rangeMin: "",
    rangeMax: "",
    rangeText: "",
    idealLevelText: "",
    status: "sin_clasificar",
    sourceLabel: "",
    confidence: "",
    sourcePage: "",
    observation: ""
  };
}

function studyTypeLabel(type: LabStudyType) {
  return studyTypeOptions.find((option) => option.id === type)?.label ?? type;
}

function statusLabel(status: LabDiagnosticStatus | LabValueStatus) {
  return [...diagnosticStatusOptions, ...valueStatusOptions].find((option) => option.id === status)?.label ?? status;
}

function isHistoricalStudy(sampleDate: string) {
  const sampleYear = new Date(`${sampleDate}T00:00:00`).getFullYear();
  return Number.isFinite(sampleYear) && sampleYear < new Date().getFullYear();
}

function studyStatusLabel(study: LabStudyRow) {
  if (isHistoricalStudy(study.sample_date) && study.diagnostic_status === "atencion") return "Hallazgo histórico";
  return statusLabel(study.diagnostic_status);
}

function parameterGroupLabel(group: LabParameterGroup) {
  return parameterGroupOptions.find((option) => option.id === group)?.label ?? group;
}

function confidenceLabel(value: number | string | null) {
  if (value === null || value === "") return "--";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed * 100)}%` : "--";
}

function statusClass(status: LabDiagnosticStatus | LabValueStatus) {
  if (status === "critico") return "border-[#E3BDBD] bg-app-red text-[#7B2A2A]";
  if (status === "atencion" || status === "bajo" || status === "alto") return "border-[#E3D7B6] bg-[#FFF8E6] text-[#725A1A]";
  if (status === "adecuado") return "border-[#C8DFC9] bg-app-soft text-app-green";
  return "border-app-border bg-white text-app-muted";
}

function fileKind(file: File): "pdf" | "imagen" | "otro" {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "imagen";
  return "otro";
}

function toNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function draftFromValue(value: LabValueRow): LabParameterDraft {
  return {
    id: value.id,
    parameterKey: value.parameter_key ?? "",
    parameterGroup: value.parameter_group ?? "otros",
    parameterLabel: value.parameter_label,
    valueText: value.value_text ?? "",
    unit: value.unit ?? "",
    valueSecondaryText: value.value_secondary_text ?? "",
    secondaryUnit: value.secondary_unit ?? "",
    rangeMin: value.range_min === null ? "" : String(value.range_min),
    rangeMax: value.range_max === null ? "" : String(value.range_max),
    rangeText: value.range_text ?? "",
    idealLevelText: value.ideal_level_text ?? "",
    status: value.status,
    sourceLabel: value.source_label ?? "",
    confidence: value.confidence === null ? "" : String(value.confidence),
    sourcePage: value.source_page === null ? "" : String(value.source_page),
    observation: value.observation ?? ""
  };
}

export function TechnicalLabSection() {
  const { currentUser, greenhouses, organization, selectedGreenhouseId } = useGreenhouseStore();
  const initialGreenhouseId = selectedGreenhouseId || greenhouses[0]?.id || "";
  const [greenhouseId, setGreenhouseId] = useState(initialGreenhouseId);
  const [studyType, setStudyType] = useState<LabStudyType>("suelo");
  const [sampleDate, setSampleDate] = useState(todayIso());
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [history, setHistory] = useState<LabStudyRow[]>([]);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [editingStudyId, setEditingStudyId] = useState<string | null>(null);
  const [editParameters, setEditParameters] = useState<LabParameterDraft[]>([]);
  const [filterType, setFilterType] = useState<LabStudyType | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notice, setNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [isSavingEdits, setIsSavingEdits] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const canUseLab = currentUser.role === "owner" || currentUser.role === "admin";
  const activeGreenhouse = useMemo(
    () => greenhouses.find((greenhouse) => greenhouse.id === greenhouseId) ?? greenhouses[0] ?? null,
    [greenhouseId, greenhouses]
  );
  const activeGreenhouseId = activeGreenhouse?.id ?? "";
  const selectedStudy = history.find((study) => study.id === selectedStudyId) ?? history[0] ?? null;
  const selectedStudyGreenhouse = selectedStudy
    ? greenhouses.find((greenhouse) => greenhouse.id === selectedStudy.greenhouse_id) ?? activeGreenhouse
    : null;
  const groupedSelectedValues = useMemo(() => {
    const groups = new Map<LabParameterGroup, LabValueRow[]>();
    (selectedStudy?.values ?? []).forEach((value) => {
      const group = value.parameter_group ?? "otros";
      const current = groups.get(group) ?? [];
      current.push(value);
      groups.set(group, current);
    });

    return parameterGroupOptions
      .map((group) => ({ ...group, values: groups.get(group.id) ?? [] }))
      .filter((group) => group.values.length);
  }, [selectedStudy?.values]);

  const resetForm = useCallback(() => {
    setSampleDate(todayIso());
    setSelectedFile(null);
    setNotice(null);
  }, []);

  useEffect(() => {
    if (!greenhouseId && initialGreenhouseId) {
      setGreenhouseId(initialGreenhouseId);
    }
  }, [greenhouseId, initialGreenhouseId]);

  const loadHistory = useCallback(async () => {
    if (!canUseLab || !organization.id || !activeGreenhouseId) {
      setHistory([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setHistory([]);
      return;
    }

    setIsLoading(true);
    try {
      let query = supabase
        .from("technical_lab_studies")
        .select("id, greenhouse_id, study_type, sample_date, lab_name, folio, diagnostic_status, review_status, ai_extraction_status, summary, diagnosis, recommended_actions, notes, created_at")
        .eq("company_id", organization.id)
        .eq("greenhouse_id", activeGreenhouseId)
        .order("sample_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (filterType !== "all") query = query.eq("study_type", filterType);
      if (dateFrom) query = query.gte("sample_date", dateFrom);
      if (dateTo) query = query.lte("sample_date", dateTo);

      const { data: studyRows, error: studyError } = await query;
      if (studyError) throw studyError;

      const ids = (studyRows ?? []).map((study: any) => study.id);
      const [valuesResponse, filesResponse] = ids.length
        ? await Promise.all([
            supabase
              .from("technical_lab_study_values")
              .select("id, study_id, parameter_group, parameter_key, parameter_label, value_text, unit, value_secondary_text, secondary_unit, range_min, range_max, range_text, ideal_level_text, status, source_label, confidence, source_page, observation, sort_order")
              .in("study_id", ids)
              .order("sort_order", { ascending: true }),
            supabase
              .from("technical_lab_study_files")
              .select("id, study_id, file_name, mime_type, file_size_bytes, storage_path, file_kind")
              .in("study_id", ids)
              .order("created_at", { ascending: false })
          ])
        : [{ data: [], error: null }, { data: [], error: null }];

      if (valuesResponse.error) throw valuesResponse.error;
      if (filesResponse.error) throw filesResponse.error;

      const valuesByStudy = new Map<string, LabValueRow[]>();
      (valuesResponse.data ?? []).forEach((value: any) => {
        const current = valuesByStudy.get(value.study_id) ?? [];
        current.push(value);
        valuesByStudy.set(value.study_id, current);
      });

      const filesByStudy = new Map<string, LabFileRow[]>();
      (filesResponse.data ?? []).forEach((file: any) => {
        const current = filesByStudy.get(file.study_id) ?? [];
        current.push(file);
        filesByStudy.set(file.study_id, current);
      });

      const mapped = (studyRows ?? []).map((study: any) => ({
        ...study,
        values: valuesByStudy.get(study.id) ?? [],
        files: filesByStudy.get(study.id) ?? []
      })) as LabStudyRow[];

      setHistory(mapped);
      setSelectedStudyId((current) => current && mapped.some((study) => study.id === current) ? current : mapped[0]?.id ?? null);
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo cargar el historial de laboratorio.") });
    } finally {
      setIsLoading(false);
    }
  }, [activeGreenhouseId, canUseLab, dateFrom, dateTo, filterType, organization.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleStudyTypeChange = (nextType: LabStudyType) => {
    setStudyType(nextType);
  };

  const updateEditParameter = (id: string, patch: Partial<LabParameterDraft>) => {
    setEditParameters((current) => current.map((parameter) => parameter.id === id ? { ...parameter, ...patch } : parameter));
  };

  const startEditingStudy = (study: LabStudyRow) => {
    setEditingStudyId(study.id);
    setEditParameters(study.values.length ? study.values.map(draftFromValue) : [newDraftParameter()]);
  };

  const createStudyDraft = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id || !activeGreenhouse) {
      setNotice({ tone: "red", message: "No hay conexión o invernadero activo." });
      return null;
    }

    const { data: study, error: studyError } = await supabase
      .from("technical_lab_studies")
      .insert({
        company_id: organization.id,
        greenhouse_id: activeGreenhouse.id,
        study_type: studyType,
        sample_date: sampleDate,
        lab_name: null,
        folio: null,
        diagnostic_status: "sin_clasificar",
        review_status: "draft",
        summary: null,
        diagnosis: null,
        recommended_actions: null,
        notes: null,
        created_by: currentUser.id || null
      })
      .select("id")
      .single();

    if (studyError) throw studyError;

    const studyId = study.id as string;
    if (selectedFile) {
      const storagePath = await uploadPrivateCompanyFile({
        bucket: "technical-lab-files",
        companyId: organization.id,
        file: selectedFile,
        supabase,
        type: "lab"
      });

      const { error: fileError } = await supabase.from("technical_lab_study_files").insert({
        company_id: organization.id,
        study_id: studyId,
        file_name: selectedFile.name,
        mime_type: selectedFile.type || "application/octet-stream",
        file_size_bytes: selectedFile.size,
        storage_path: storagePath,
        file_kind: fileKind(selectedFile),
        created_by: currentUser.id || null
      });

      if (fileError) throw fileError;
    }

    return studyId;
  };

  const saveStudyCorrections = async () => {
    if (!selectedStudy) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) {
      setNotice({ tone: "red", message: "No hay conexión con Supabase." });
      return;
    }

    const cleanParameters = editParameters
      .map((parameter, index) => ({ ...parameter, sortOrder: index }))
      .filter((parameter) => parameter.parameterLabel.trim() || parameter.valueText.trim());

    if (!cleanParameters.length) {
      setNotice({ tone: "red", message: "Deja al menos un parámetro antes de guardar correcciones." });
      return;
    }

    setIsSavingEdits(true);
    setNotice(null);

    try {
      const { error: deleteError } = await supabase
        .from("technical_lab_study_values")
        .delete()
        .eq("study_id", selectedStudy.id);

      if (deleteError) throw deleteError;

      const { error: valuesError } = await supabase.from("technical_lab_study_values").insert(
        cleanParameters.map((parameter) => ({
          company_id: organization.id,
          study_id: selectedStudy.id,
          parameter_group: parameter.parameterGroup,
          parameter_key: parameter.parameterKey.trim() || null,
          parameter_label: parameter.parameterLabel.trim(),
          value_text: parameter.valueText.trim(),
          unit: parameter.unit.trim() || null,
          value_secondary_text: parameter.valueSecondaryText.trim() || null,
          secondary_unit: parameter.secondaryUnit.trim() || null,
          range_min: toNullableNumber(parameter.rangeMin),
          range_max: toNullableNumber(parameter.rangeMax),
          range_text: parameter.rangeText.trim() || null,
          ideal_level_text: parameter.idealLevelText.trim() || null,
          status: parameter.status,
          source_label: parameter.sourceLabel.trim() || null,
          confidence: toNullableNumber(parameter.confidence),
          source_page: toNullableNumber(parameter.sourcePage),
          observation: parameter.observation.trim() || null,
          sort_order: parameter.sortOrder
        }))
      );

      if (valuesError) throw valuesError;

      const { error: studyError } = await supabase
        .from("technical_lab_studies")
        .update({ review_status: "reviewed" })
        .eq("id", selectedStudy.id);

      if (studyError) throw studyError;

      await loadHistory();
      setSelectedStudyId(selectedStudy.id);
      setEditingStudyId(null);
      setNotice({ tone: "green", message: "Correcciones guardadas. Revisa antes de aprobar." });
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudieron guardar las correcciones.") });
    } finally {
      setIsSavingEdits(false);
    }
  };

  const extractWithAi = async () => {
    if (!selectedFile) {
      setNotice({ tone: "red", message: "Sube un PDF o imagen antes de extraer con IA." });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice({ tone: "red", message: "No hay conexión con Supabase." });
      return;
    }

    setIsExtracting(true);
    setNotice(null);

    try {
      const studyId = await createStudyDraft();
      if (!studyId) return;

      const { error } = await supabase.functions.invoke("lab-extract", {
        body: { study_id: studyId }
      });

      if (error) throw error;

      await loadHistory();
      resetForm();
      setSelectedStudyId(studyId);
      setNotice({ tone: "green", message: "Extracción IA lista para revisar." });
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo extraer el estudio con IA.") });
    } finally {
      setIsExtracting(false);
    }
  };

  const approveStudy = async (study: LabStudyRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const greenhouseName = greenhouses.find((greenhouse) => greenhouse.id === study.greenhouse_id)?.name ?? "este invernadero";
    const confirmed = window.confirm(`Vas a verificar este estudio y guardarlo como listo en: ${greenhouseName}. ¿Confirmas?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from("technical_lab_studies")
      .update({ review_status: "approved" })
      .eq("id", study.id);

    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo aprobar el estudio.") });
      return;
    }

    await loadHistory();
    setNotice({ tone: "green", message: `Estudio verificado en ${greenhouseName}.` });
  };

  const openPrivateFile = async (file: LabFileRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data, error } = await supabase.storage.from("technical-lab-files").createSignedUrl(file.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo abrir el archivo.") });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (!canUseLab) {
    return <EmptyState icon={FlaskConical} title="Laboratorio disponible para owner y admin." />;
  }

  if (!greenhouses.length || !activeGreenhouse) {
    return <EmptyState icon={Sprout} title="No hay invernaderos disponibles para laboratorio." />;
  }

  return (
    <section>
      {notice ? (
        <div
          className={cn(
            "mb-5 border px-3 py-2 text-sm",
            notice.tone === "green" && "border-[#C8DFC9] bg-app-soft text-app-green",
            notice.tone === "red" && "border-[#E3BDBD] bg-app-red text-[#7B2A2A]"
          )}
          role={notice.tone === "red" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-10 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
        <div className="min-w-0">
          <div className="mb-6 flex items-center justify-between gap-4 border-y border-app-border py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">Nuevo análisis</p>
              <p className="mt-2 text-sm text-app-muted">Sube el PDF o imagen. La IA detecta tipo, folio, valores y rangos.</p>
            </div>
            <Upload className="h-4 w-4 shrink-0 text-app-green" />
          </div>

          <div className="grid gap-3">
            <Field label="Invernadero">
              <SelectInput value={activeGreenhouse.id} onChange={(event) => setGreenhouseId(event.target.value)}>
                {greenhouses.map((greenhouse) => (
                  <option key={greenhouse.id} value={greenhouse.id}>
                    {greenhouse.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div className="border border-app-border bg-app-sidebar px-3 py-3 text-sm leading-6 text-app-text">
              <span className="font-medium">Destino:</span> este estudio se guardará en {activeGreenhouse.name}.
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Fecha de muestra">
                <TextInput value={sampleDate} onChange={(event) => setSampleDate(event.target.value)} type="date" />
              </Field>
              <Field label="Tipo esperado">
                <SelectInput value={studyType} onChange={(event) => handleStudyTypeChange(event.target.value as LabStudyType)}>
                  {studyTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="PDF o imagen">
              <TextInput
                accept="application/pdf,image/*"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </Field>
            <div className="min-h-5 text-xs leading-5 text-app-muted">
              {selectedFile ? `${selectedFile.name} · ${fileSizeLabel(selectedFile.size)}` : "El archivo queda privado y se usa solo para extraer el estudio."}
            </div>
            <Button
              className="w-full"
              disabled={isExtracting || !selectedFile}
              icon={<WandSparkles className="h-4 w-4" />}
              onClick={extractWithAi}
              type="button"
              variant="primary"
            >
              {isExtracting ? "Extrayendo" : "Extraer con IA"}
            </Button>
            <p className="text-xs leading-5 text-app-muted">Después de extraer puedes corregir resultados y aprobar el estudio.</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-6 flex items-center justify-between gap-4 border-y border-app-border py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">Historial</p>
              <p className="mt-2 text-sm text-app-muted">{history.length} estudios en filtros actuales</p>
            </div>
            <FileText className="h-4 w-4 text-app-green" />
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Field label="Tipo">
              <SelectInput value={filterType} onChange={(event) => setFilterType(event.target.value as LabStudyType | "all")}>
                <option value="all">Todos</option>
                {studyTypeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Desde">
              <TextInput value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" />
            </Field>
            <Field label="Hasta">
              <TextInput value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" />
            </Field>
          </div>

          <div className="border-b border-app-border">
            {isLoading ? <p className="border-t border-app-border py-4 text-sm text-app-muted">Cargando estudios...</p> : null}
            {!isLoading && !history.length ? (
              <p className="border-t border-app-border py-4 text-sm text-app-muted">Sin estudios guardados.</p>
            ) : null}
            {history.map((study) => (
              <button
                key={study.id}
                className={cn(
                  "w-full border-t border-app-border px-2 py-4 text-left transition hover:bg-app-sidebar",
                  selectedStudy?.id === study.id && "bg-app-soft"
                )}
                onClick={() => {
                  setSelectedStudyId(study.id);
                  setEditingStudyId(null);
                }}
                type="button"
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-app-text">{studyTypeLabel(study.study_type)}</p>
                    <p className="mt-1 text-xs leading-5 text-app-muted">
                      {formatDate(study.sample_date)}{study.lab_name ? ` · ${study.lab_name}` : ""}{study.folio ? ` · ${study.folio}` : ""}
                    </p>
                    {study.summary ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-app-muted">{study.summary}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                    <span className={cn("border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusClass(study.diagnostic_status))}>
                      {studyStatusLabel(study)}
                    </span>
                    <span className="border border-app-border bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                      {aiStatusLabels[study.ai_extraction_status]} · {reviewStatusLabels[study.review_status]}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedStudy ? (
        <article className="mt-10 border-y border-app-border py-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                {studyTypeLabel(selectedStudy.study_type)}
              </p>
              <h3 className="mt-2 text-3xl font-light text-app-text">{formatDate(selectedStudy.sample_date)}</h3>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                {selectedStudy.lab_name || "Laboratorio sin nombre"}{selectedStudy.folio ? ` · ${selectedStudy.folio}` : ""}
              </p>
              <div className="mt-4 border border-app-border bg-app-sidebar px-3 py-3 text-sm leading-6 text-app-text">
                <span className="font-medium">Invernadero destino:</span> {selectedStudyGreenhouse?.name ?? "Sin invernadero identificado"}.
                <span className="text-app-muted"> Verifica esto antes de marcar el estudio como listo.</span>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2 xl:justify-end">
              <span className={cn("border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", statusClass(selectedStudy.diagnostic_status))}>
                {studyStatusLabel(selectedStudy)}
              </span>
              {selectedStudy.review_status !== "approved" ? (
                <Button
                  disabled={!selectedStudy.values.length}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  onClick={() => approveStudy(selectedStudy)}
                  type="button"
                  variant="primary"
                >
                  Verificar estudio
                </Button>
              ) : (
                <span className="inline-flex h-10 items-center border border-[#C8DFC9] bg-app-soft px-3 text-sm font-medium text-app-green">
                  Estudio verificado
                </span>
              )}
              <Button
                icon={<Save className="h-4 w-4" />}
                onClick={() => startEditingStudy(selectedStudy)}
                type="button"
                variant="secondary"
              >
                Editar resultados
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="border-t border-app-border py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">IA</p>
              <p className="mt-1 text-sm text-app-text">{aiStatusLabels[selectedStudy.ai_extraction_status]}</p>
            </div>
            <div className="border-t border-app-border py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">Revisión</p>
              <p className="mt-1 text-sm text-app-text">{reviewStatusLabels[selectedStudy.review_status]}</p>
            </div>
            <div className="border-t border-app-border py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">Parámetros</p>
              <p className="mt-1 text-sm text-app-text">{selectedStudy.values.length}</p>
            </div>
          </div>

          <section className="mt-6 border-t border-app-border pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Diagnóstico</p>
            <p className="mt-3 max-w-5xl text-sm leading-6 text-app-text">{selectedStudy.diagnosis || "Sin diagnóstico capturado."}</p>
            {selectedStudy.recommended_actions ? (
              <div className="mt-4 max-w-5xl bg-app-sidebar px-3 py-3 text-sm leading-6 text-app-muted">
                {selectedStudy.recommended_actions}
              </div>
            ) : null}
          </section>

          <section className="mt-6 border-t border-app-border pt-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Resultados extraídos</p>
            <div className="grid gap-6">
              {groupedSelectedValues.map((group) => (
                <div key={group.id} className="border-b border-app-border">
                  <p className="border-t border-app-border py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                    {group.label}
                  </p>
                  <div className="hidden border-t border-app-border py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted lg:grid lg:grid-cols-[minmax(160px,1.15fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(110px,0.55fr)_70px] lg:gap-4">
                    <span>Parámetro</span>
                    <span>Resultado</span>
                    <span>Rango / fuente</span>
                    <span>Estado</span>
                    <span>Conf.</span>
                  </div>
                  {group.values.map((value) => (
                    <div key={value.id} className="grid min-w-0 gap-3 border-t border-app-border py-3 lg:grid-cols-[minmax(160px,1.15fr)_minmax(120px,0.7fr)_minmax(150px,0.9fr)_minmax(110px,0.55fr)_70px] lg:gap-4">
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted lg:hidden">Parámetro</p>
                        <p className="break-words text-sm font-medium text-app-text">{value.parameter_label}</p>
                        {value.observation ? <p className="mt-1 break-words text-xs leading-5 text-app-muted">{value.observation}</p> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted lg:hidden">Resultado</p>
                        <p className="break-words text-sm text-app-text">{value.value_text} {value.unit ?? ""}</p>
                        {value.value_secondary_text ? (
                          <p className="mt-1 break-words text-xs text-app-muted">
                            {value.value_secondary_text} {value.secondary_unit ?? ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-0 text-xs leading-5 text-app-muted">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted lg:hidden">Rango / fuente</p>
                        {value.range_text ? <p className="break-words">Rango {value.range_text}</p> : null}
                        {value.ideal_level_text ? <p className="break-words">Nivel {value.ideal_level_text}</p> : null}
                        {!value.range_text && !value.ideal_level_text && (value.range_min !== null || value.range_max !== null) ? (
                          <p>Rango {value.range_min ?? "--"} - {value.range_max ?? "--"}</p>
                        ) : null}
                        {value.source_label ? <p className="break-words">Fuente {value.source_label}</p> : null}
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted lg:hidden">Estado</p>
                        <span className={cn("inline-flex h-fit w-fit border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusClass(value.status))}>
                          {statusLabel(value.status)}
                        </span>
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted lg:hidden">Conf.</p>
                        <p className="text-xs text-app-muted">{confidenceLabel(value.confidence)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {!groupedSelectedValues.length ? (
                <p className="border-t border-app-border py-4 text-sm text-app-muted">Sin parámetros extraídos todavía.</p>
              ) : null}
            </div>
          </section>

          {editingStudyId === selectedStudy.id ? (
            <section className="mt-6 border-t border-app-border pt-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Corrección de resultados</p>
                  <p className="mt-1 text-xs leading-5 text-app-muted">Ajusta solo lo necesario antes de aprobar. Esta zona reemplaza el respaldo manual largo.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon={<Plus className="h-4 w-4" />}
                    onClick={() => setEditParameters((current) => [...current, newDraftParameter()])}
                    type="button"
                    variant="secondary"
                  >
                    Agregar
                  </Button>
                  <Button disabled={isSavingEdits} onClick={() => setEditingStudyId(null)} type="button" variant="ghost">
                    Cancelar
                  </Button>
                  <Button
                    disabled={isSavingEdits}
                    icon={<Save className="h-4 w-4" />}
                    onClick={saveStudyCorrections}
                    type="button"
                    variant="primary"
                  >
                    {isSavingEdits ? "Guardando" : "Guardar correcciones"}
                  </Button>
                </div>
              </div>
              <div className="grid gap-5">
                {editParameters.map((parameter) => (
                  <div key={parameter.id} className="border-t border-app-border pt-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(100px,0.55fr)_minmax(90px,0.45fr)_minmax(130px,0.7fr)_40px]">
                      <Field label="Parámetro">
                        <TextInput value={parameter.parameterLabel} onChange={(event) => updateEditParameter(parameter.id, { parameterLabel: event.target.value })} />
                      </Field>
                      <Field label="Valor">
                        <TextInput value={parameter.valueText} onChange={(event) => updateEditParameter(parameter.id, { valueText: event.target.value })} />
                      </Field>
                      <Field label="Unidad">
                        <TextInput value={parameter.unit} onChange={(event) => updateEditParameter(parameter.id, { unit: event.target.value })} />
                      </Field>
                      <Field label="Estado">
                        <SelectInput value={parameter.status} onChange={(event) => updateEditParameter(parameter.id, { status: event.target.value as LabValueStatus })}>
                          {valueStatusOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <button
                        aria-label="Eliminar parámetro"
                        className="flex h-11 w-11 items-center justify-center self-end border border-app-border text-app-muted hover:bg-app-sidebar hover:text-app-text"
                        onClick={() => setEditParameters((current) => current.filter((item) => item.id !== parameter.id))}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(130px,0.7fr)_minmax(100px,0.5fr)_minmax(90px,0.45fr)_minmax(140px,0.75fr)_minmax(140px,0.75fr)]">
                      <Field label="Grupo">
                        <SelectInput value={parameter.parameterGroup} onChange={(event) => updateEditParameter(parameter.id, { parameterGroup: event.target.value as LabParameterGroup })}>
                          {parameterGroupOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label="Valor 2">
                        <TextInput value={parameter.valueSecondaryText} onChange={(event) => updateEditParameter(parameter.id, { valueSecondaryText: event.target.value })} />
                      </Field>
                      <Field label="Unidad 2">
                        <TextInput value={parameter.secondaryUnit} onChange={(event) => updateEditParameter(parameter.id, { secondaryUnit: event.target.value })} />
                      </Field>
                      <Field label="Rango">
                        <TextInput value={parameter.rangeText} onChange={(event) => updateEditParameter(parameter.id, { rangeText: event.target.value })} />
                      </Field>
                      <Field label="Nivel ideal">
                        <TextInput value={parameter.idealLevelText} onChange={(event) => updateEditParameter(parameter.id, { idealLevelText: event.target.value })} />
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(90px,0.35fr)_minmax(90px,0.35fr)_minmax(0,1fr)]">
                      <Field label="Mín.">
                        <TextInput inputMode="decimal" value={parameter.rangeMin} onChange={(event) => updateEditParameter(parameter.id, { rangeMin: event.target.value })} />
                      </Field>
                      <Field label="Máx.">
                        <TextInput inputMode="decimal" value={parameter.rangeMax} onChange={(event) => updateEditParameter(parameter.id, { rangeMax: event.target.value })} />
                      </Field>
                      <Field label="Observación">
                        <TextInput value={parameter.observation} onChange={(event) => updateEditParameter(parameter.id, { observation: event.target.value })} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-6 border-t border-app-border pt-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Archivos privados</p>
            {selectedStudy.files.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {selectedStudy.files.map((file) => (
                  <button
                    key={file.id}
                    className="flex min-w-0 items-center justify-between gap-4 border border-app-border px-3 py-2 text-left text-sm hover:bg-app-sidebar"
                    onClick={() => openPrivateFile(file)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-app-text">{file.file_name}</span>
                      <span className="text-xs text-app-muted">{file.file_kind} · {fileSizeLabel(file.file_size_bytes)}</span>
                    </span>
                    <ExternalLink className="h-4 w-4 shrink-0 text-app-green" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-app-muted">Sin archivos adjuntos.</p>
            )}
          </section>
        </article>
      ) : null}
    </section>
  );
}
