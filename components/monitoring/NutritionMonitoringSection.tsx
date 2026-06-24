"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, FlaskConical, History, Save, Sprout } from "lucide-react";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { Field, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { INITIAL_CROP_ID } from "@/lib/crop-ddt";
import { appErrorMessage } from "@/lib/errors";
import {
  calculateNutritionMonitoring,
  NUTRITION_ANALYTES,
  NUTRITION_CAPTURE_KEYS,
  NUTRITION_SOURCE_LABEL,
  SAMPLE_TYPE_LABELS,
  sampleValue,
  statusTone,
  type NutritionAnalyteKey,
  type NutritionDiagnosticStatus,
  type NutritionRawValues,
  type NutritionSampleType
} from "@/lib/nutrition-monitoring";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";

const sampleTypes: NutritionSampleType[] = ["petiole_cell_extract", "soil_solution"];

type MonitoringEventRow = {
  id: string;
  sample_date: string;
  ddt: number;
  notes: string | null;
  created_at: string;
};

type MonitoringValueRow = {
  event_id: string;
  sample_type: NutritionSampleType;
  analyte_key: NutritionAnalyteKey;
  analyte_label: string;
  raw_value: number | string;
  raw_unit: string;
  diagnostic_value: number | string;
  diagnostic_unit: string;
  range_min: number | string | null;
  range_max: number | string | null;
  diagnostic_status: NutritionDiagnosticStatus;
};

type MonitoringObservationRow = {
  event_id: string;
  analyte_key: NutritionAnalyteKey;
  analyte_label: string;
  petiole_status: NutritionDiagnosticStatus;
  soil_status: NutritionDiagnosticStatus;
  observation_text: string;
  recommendation_text: string | null;
  severity: "baja" | "media" | "alta";
};

type SavedMonitoringValue = {
  sampleType: NutritionSampleType;
  analyteKey: NutritionAnalyteKey;
  analyteLabel: string;
  rawValue: number;
  rawUnit: string;
  diagnosticValue: number;
  diagnosticUnit: string;
  rangeMin: number | null;
  rangeMax: number | null;
  diagnosticStatus: NutritionDiagnosticStatus;
};

type SavedMonitoringObservation = {
  analyteKey: NutritionAnalyteKey;
  analyteLabel: string;
  petioleStatus: NutritionDiagnosticStatus;
  soilStatus: NutritionDiagnosticStatus;
  observationText: string;
  recommendationText: string;
  severity: "baja" | "media" | "alta";
};

type SavedMonitoringEvent = {
  id: string;
  sampleDate: string;
  ddt: number;
  notes: string;
  createdAt: string;
  values: SavedMonitoringValue[];
  observations: SavedMonitoringObservation[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function formatMeasurement(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  const decimals = Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0;
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0
  }).format(value);
}

function numericCell(value: number | string | null) {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function analyteOrder(key: NutritionAnalyteKey) {
  return NUTRITION_ANALYTES.find((analyte) => analyte.key === key)?.sortOrder ?? 99;
}

function StatusPill({ status }: { status?: NutritionDiagnosticStatus }) {
  if (!status) {
    return <span className="inline-flex border border-app-border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">--</span>;
  }

  return (
    <span className={cn("inline-flex border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", statusTone(status))}>
      {status}
    </span>
  );
}

function RawInputsBlock({
  sampleType,
  values,
  onChange
}: {
  sampleType: NutritionSampleType;
  values: NutritionRawValues;
  onChange: (key: NutritionAnalyteKey, value: string) => void;
}) {
  return (
    <section className="border-t border-app-border py-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
            {SAMPLE_TYPE_LABELS[sampleType]}
          </p>
        </div>
        <FlaskConical className="h-4 w-4 text-app-green" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {NUTRITION_CAPTURE_KEYS.map((key) => {
          const analyte = NUTRITION_ANALYTES.find((item) => item.key === key);
          const unit = sampleType === "petiole_cell_extract"
            ? key === "n_no3"
              ? "ppm NO3-"
              : key === "ph"
                ? "adim."
                : key === "ec"
                  ? "mS/cm"
                  : "ppm"
            : key === "n_no3"
              ? "ppm NO3-"
              : key === "ph"
                ? "adim."
                : key === "ec"
                  ? "mS/cm"
                  : "ppm";

          return (
            <Field key={`${sampleType}-${key}`} label={`${analyte?.shortLabel ?? key} · ${unit}`}>
              <TextInput
                inputMode="decimal"
                onChange={(event) => onChange(key, event.target.value)}
                placeholder="0"
                type="number"
                step="any"
                value={String(values[key] ?? "")}
              />
            </Field>
          );
        })}
      </div>
    </section>
  );
}

export function NutritionMonitoringSection() {
  const { currentUser, greenhouses, organization, selectedGreenhouseId } = useGreenhouseStore();
  const initialGreenhouseId = selectedGreenhouseId || greenhouses[0]?.id || "";
  const [greenhouseId, setGreenhouseId] = useState(initialGreenhouseId);
  const [sampleDate, setSampleDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [petioleValues, setPetioleValues] = useState<NutritionRawValues>({});
  const [soilValues, setSoilValues] = useState<NutritionRawValues>({});
  const [recommendations, setRecommendations] = useState<Partial<Record<NutritionAnalyteKey, string>>>({});
  const [notice, setNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedEvents, setSavedEvents] = useState<SavedMonitoringEvent[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const resetDraft = useCallback(() => {
    setSampleDate(todayIso());
    setNotes("");
    setPetioleValues({});
    setSoilValues({});
    setRecommendations({});
    setNotice(null);
  }, []);

  const handleGreenhouseChange = (nextGreenhouseId: string) => {
    setGreenhouseId(nextGreenhouseId);
    setSelectedHistoryId(null);
    resetDraft();
  };

  useEffect(() => {
    if (!greenhouseId && initialGreenhouseId) {
      setGreenhouseId(initialGreenhouseId);
    }
  }, [greenhouseId, initialGreenhouseId]);

  const activeGreenhouse = useMemo(
    () => greenhouses.find((greenhouse) => greenhouse.id === greenhouseId) ?? greenhouses[0] ?? null,
    [greenhouseId, greenhouses]
  );
  const activeGreenhouseId = activeGreenhouse?.id ?? "";

  useEffect(() => {
    setSelectedHistoryId(null);
  }, [activeGreenhouseId]);

  const ddt = useMemo(
    () => daysBetween(activeGreenhouse?.transplantDate, sampleDate),
    [activeGreenhouse?.transplantDate, sampleDate]
  );

  const result = useMemo(
    () =>
      calculateNutritionMonitoring({
        cropId: activeGreenhouse?.cropId,
        ddt,
        petioleValues,
        soilValues,
        recommendations
      }),
    [activeGreenhouse?.cropId, ddt, petioleValues, recommendations, soilValues]
  );

  const loadHistory = useCallback(async () => {
    if (!activeGreenhouseId || !organization.id) {
      setSavedEvents([]);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSavedEvents([]);
      return;
    }

    setIsLoadingHistory(true);
    setHistoryError("");

    try {
      const { data: eventRows, error: eventsError } = await supabase
        .from("nutrition_monitoring_events")
        .select("id, sample_date, ddt, notes, created_at")
        .eq("company_id", organization.id)
        .eq("greenhouse_id", activeGreenhouseId)
        .order("sample_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);

      if (eventsError) throw eventsError;

      const events = (eventRows ?? []) as MonitoringEventRow[];
      const eventIds = events.map((event) => event.id);

      if (!eventIds.length) {
        setSavedEvents([]);
        return;
      }

      const [valuesResult, observationsResult] = await Promise.all([
        supabase
          .from("nutrition_monitoring_values")
          .select("event_id, sample_type, analyte_key, analyte_label, raw_value, raw_unit, diagnostic_value, diagnostic_unit, range_min, range_max, diagnostic_status")
          .eq("company_id", organization.id)
          .in("event_id", eventIds),
        supabase
          .from("nutrition_monitoring_observations")
          .select("event_id, analyte_key, analyte_label, petiole_status, soil_status, observation_text, recommendation_text, severity")
          .eq("company_id", organization.id)
          .in("event_id", eventIds)
      ]);

      if (valuesResult.error) throw valuesResult.error;
      if (observationsResult.error) throw observationsResult.error;

      const values = ((valuesResult.data ?? []) as MonitoringValueRow[]).map((value) => ({
        eventId: value.event_id,
        sampleType: value.sample_type,
        analyteKey: value.analyte_key,
        analyteLabel: value.analyte_label,
        rawValue: numericCell(value.raw_value) ?? 0,
        rawUnit: value.raw_unit,
        diagnosticValue: numericCell(value.diagnostic_value) ?? 0,
        diagnosticUnit: value.diagnostic_unit,
        rangeMin: numericCell(value.range_min),
        rangeMax: numericCell(value.range_max),
        diagnosticStatus: value.diagnostic_status
      }));
      const observations = ((observationsResult.data ?? []) as MonitoringObservationRow[]).map((observation) => ({
        eventId: observation.event_id,
        analyteKey: observation.analyte_key,
        analyteLabel: observation.analyte_label,
        petioleStatus: observation.petiole_status,
        soilStatus: observation.soil_status,
        observationText: observation.observation_text,
        recommendationText: observation.recommendation_text ?? "",
        severity: observation.severity
      }));

      setSavedEvents(
        events.map((event) => ({
          id: event.id,
          sampleDate: event.sample_date,
          ddt: event.ddt,
          notes: event.notes ?? "",
          createdAt: event.created_at,
          values: values
            .filter((value) => value.eventId === event.id)
            .map(({ eventId, ...value }) => value)
            .sort((left, right) => analyteOrder(left.analyteKey) - analyteOrder(right.analyteKey)),
          observations: observations
            .filter((observation) => observation.eventId === event.id)
            .map(({ eventId, ...observation }) => observation)
            .sort((left, right) => analyteOrder(left.analyteKey) - analyteOrder(right.analyteKey))
        }))
      );
    } catch (caught) {
      setHistoryError(appErrorMessage(caught, "No se pudo cargar el historial."));
    } finally {
      setIsLoadingHistory(false);
    }
  }, [activeGreenhouseId, organization.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const applySavedMonitoring = (event: SavedMonitoringEvent) => {
    const nextPetioleValues: NutritionRawValues = {};
    const nextSoilValues: NutritionRawValues = {};
    const nextRecommendations: Partial<Record<NutritionAnalyteKey, string>> = {};

    event.values.forEach((value) => {
      if (!NUTRITION_CAPTURE_KEYS.includes(value.analyteKey)) return;
      if (value.sampleType === "petiole_cell_extract") {
        nextPetioleValues[value.analyteKey] = String(value.rawValue);
      } else {
        nextSoilValues[value.analyteKey] = String(value.rawValue);
      }
    });

    event.observations.forEach((observation) => {
      nextRecommendations[observation.analyteKey] = observation.recommendationText;
    });

    setSampleDate(event.sampleDate);
    setNotes(event.notes);
    setPetioleValues(nextPetioleValues);
    setSoilValues(nextSoilValues);
    setRecommendations(nextRecommendations);
    setSelectedHistoryId(event.id);
    setNotice(null);
  };

  const updateRawValue = (
    sampleType: NutritionSampleType,
    key: NutritionAnalyteKey,
    value: string
  ) => {
    setNotice(null);
    if (sampleType === "petiole_cell_extract") {
      setPetioleValues((current) => ({ ...current, [key]: value }));
      return;
    }
    setSoilValues((current) => ({ ...current, [key]: value }));
  };

  const saveMonitoring = async () => {
    if (!activeGreenhouse || !organization.id) return;
    setNotice(null);
    setIsSaving(true);

    try {
      if (!result.complete) {
        throw new Error("Completa los valores crudos de ambos bloques.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("No se pudo conectar con Supabase.");
      }

      const { data: eventRow, error: eventError } = await supabase
        .from("nutrition_monitoring_events")
        .insert({
          company_id: organization.id,
          greenhouse_id: activeGreenhouse.id,
          crop_id: activeGreenhouse.cropId ?? INITIAL_CROP_ID,
          sample_date: sampleDate,
          ddt,
          notes: notes.trim() || null,
          source_label: "manual",
          created_by: currentUser.id || null
        })
        .select("id")
        .single();

      if (eventError) throw eventError;
      const eventId = eventRow?.id;
      if (!eventId) {
        throw new Error("No se pudo crear el monitoreo.");
      }

      const { error: valuesError } = await supabase.from("nutrition_monitoring_values").insert(
        result.values.map((value) => ({
          company_id: organization.id,
          event_id: eventId,
          sample_type: value.sampleType,
          analyte_key: value.analyteKey,
          analyte_label: value.analyteLabel,
          raw_value: value.rawValue,
          raw_unit: value.rawUnit,
          diagnostic_value: value.diagnosticValue,
          diagnostic_unit: value.diagnosticUnit,
          range_min: value.range.min,
          range_max: value.range.max,
          diagnostic_status: value.diagnosticStatus,
          metadata: {
            ...value.metadata,
            estimated: value.estimated
          }
        }))
      );

      if (valuesError) throw valuesError;

      const { error: observationsError } = await supabase.from("nutrition_monitoring_observations").insert(
        result.observations.map((observation) => ({
          company_id: organization.id,
          event_id: eventId,
          analyte_key: observation.analyteKey,
          analyte_label: observation.analyteLabel,
          observation_context: observation.observationContext,
          petiole_status: observation.petioleStatus,
          soil_status: observation.soilStatus,
          observation_text: observation.observationText,
          recommendation_text: observation.recommendationText.trim() || null,
          severity: observation.severity
        }))
      );

      if (observationsError) throw observationsError;

      setSelectedHistoryId(eventId);
      await loadHistory();
      setNotice({ tone: "green", message: "Monitoreo nutrimental guardado." });
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo guardar el monitoreo.") });
    } finally {
      setIsSaving(false);
    }
  };

  if (!greenhouses.length || !activeGreenhouse) {
    return <EmptyState icon={Sprout} title="No hay invernaderos disponibles para monitoreo." />;
  }

  return (
    <section>
      <div className="mb-10 border-b border-app-border pb-7 pt-8 md:pt-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">Monitoreo</p>
            <h1 className="mt-3 text-4xl font-light leading-none tracking-normal text-app-text md:text-6xl">
              Nutrimental
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">
              Captura de extracto celular de peciolo y solución de suelo con rangos por DDT.
            </p>
          </div>
          <Button
            disabled={isSaving || !result.complete}
            icon={<Save className="h-4 w-4" />}
            onClick={saveMonitoring}
            variant="primary"
          >
            {isSaving ? "Guardando" : "Guardar monitoreo"}
          </Button>
        </div>
      </div>

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

      <div className="grid gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Invernadero">
              <SelectInput value={activeGreenhouse.id} onChange={(event) => handleGreenhouseChange(event.target.value)}>
                {greenhouses.map((greenhouse) => (
                  <option key={greenhouse.id} value={greenhouse.id}>
                    {greenhouse.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Fecha de muestra">
              <TextInput value={sampleDate} onChange={(event) => setSampleDate(event.target.value)} type="date" />
            </Field>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="border-t border-app-border py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">DDT</p>
              <p className="mt-2 text-3xl font-light text-app-text">{ddt}</p>
            </div>
            <div className="border-t border-app-border py-4 sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Trasplante</p>
              <p className="mt-2 text-lg font-medium text-app-text">{formatDate(activeGreenhouse.transplantDate)}</p>
            </div>
          </div>

          {sampleTypes.map((sampleType) => (
            <RawInputsBlock
              key={sampleType}
              sampleType={sampleType}
              values={sampleType === "petiole_cell_extract" ? petioleValues : soilValues}
              onChange={(key, value) => updateRawValue(sampleType, key, value)}
            />
          ))}

          <Field className="border-y border-app-border py-6" label="Notas">
            <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>

          <section className="border-b border-app-border py-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                  Historial guardado
                </p>
              </div>
              <History className="h-4 w-4 text-app-green" />
            </div>
            {historyError ? (
              <div className="border border-[#E3BDBD] bg-app-red px-3 py-2 text-sm text-[#7B2A2A]">
                {historyError}
              </div>
            ) : null}
            {isLoadingHistory ? (
              <p className="border-t border-app-border py-4 text-sm text-app-muted">Cargando historial...</p>
            ) : null}
            {!isLoadingHistory && !savedEvents.length ? (
              <p className="border-t border-app-border py-4 text-sm text-app-muted">Sin monitoreos guardados.</p>
            ) : null}
            {!isLoadingHistory && savedEvents.length ? (
              <div className="border-b border-app-border">
                {savedEvents.map((event) => {
                  const alerts = event.observations.filter((observation) => observation.severity !== "baja").length;
                  const recommendationCount = event.observations.filter((observation) => observation.recommendationText).length;

                  return (
                    <button
                      key={event.id}
                      className={cn(
                        "grid w-full gap-2 border-t border-app-border py-4 text-left transition hover:bg-white/60",
                        selectedHistoryId === event.id && "bg-app-soft"
                      )}
                      onClick={() => applySavedMonitoring(event)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-app-text">
                            {formatDate(event.sampleDate)} · {event.ddt} DDT
                          </p>
                          <p className="mt-1 text-xs text-app-muted">
                            {alerts} alertas · {recommendationCount} recomendaciones
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                          Ver
                        </span>
                      </div>
                      {event.notes ? <p className="line-clamp-2 text-xs leading-5 text-app-muted">{event.notes}</p> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        <div>
          <div className="mb-5 border-y border-app-border py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                  Diagnóstico
                </p>
                <h2 className="mt-3 text-3xl font-light text-app-text">{activeGreenhouse.name}</h2>
                <p className="mt-2 text-sm text-app-muted">{activeGreenhouse.variety} · {NUTRITION_SOURCE_LABEL}</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-app-border bg-white text-app-green">
                <Calculator className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="border-b border-app-border">
            {NUTRITION_ANALYTES.map((analyte) => {
              const petiole = sampleValue(result.values, "petiole_cell_extract", analyte.key);
              const soil = sampleValue(result.values, "soil_solution", analyte.key);
              const observation = result.observations.find((item) => item.analyteKey === analyte.key);

              return (
                <article key={analyte.key} className="border-t border-app-border py-5">
                  <div className="grid gap-5 lg:grid-cols-[120px_minmax(0,1fr)]">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                        {analyte.shortLabel}
                      </p>
                      <p className="mt-2 text-sm font-medium text-app-text">{analyte.label}</p>
                    </div>
                    <div className="grid gap-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="border-l border-app-border pl-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">ECP</p>
                            <StatusPill status={petiole?.diagnosticStatus} />
                          </div>
                          <p className="mt-2 text-xl font-light text-app-text">
                            {formatMeasurement(petiole?.diagnosticValue)} {petiole?.diagnosticUnit ?? ""}
                          </p>
                          <p className="mt-1 text-xs text-app-muted">
                            Rango {petiole ? `${formatMeasurement(petiole.range.min)}-${formatMeasurement(petiole.range.max)}` : "--"}
                          </p>
                        </div>
                        <div className="border-l border-app-border pl-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Suelo</p>
                            <StatusPill status={soil?.diagnosticStatus} />
                          </div>
                          <p className="mt-2 text-xl font-light text-app-text">
                            {formatMeasurement(soil?.diagnosticValue)} {soil?.diagnosticUnit ?? ""}
                          </p>
                          <p className="mt-1 text-xs text-app-muted">
                            Rango {soil ? `${formatMeasurement(soil.range.min)}-${formatMeasurement(soil.range.max)}` : "--"}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="bg-app-sidebar px-3 py-3 text-sm leading-6 text-app-muted">
                          {observation?.observationText || "Pendiente de valores completos."}
                        </div>
                        <Field label="Recomendación">
                          <TextArea
                            className="min-h-20"
                            value={recommendations[analyte.key] ?? ""}
                            onChange={(event) =>
                              setRecommendations((current) => ({
                                ...current,
                                [analyte.key]: event.target.value
                              }))
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
