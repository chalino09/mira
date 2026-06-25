"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calculator, Download, FlaskConical, GitCompare, History, LineChart as LineChartIcon, Save, Sprout } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
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
  nutritionInputUnitFor,
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

function analyteLabel(key: NutritionAnalyteKey) {
  return NUTRITION_ANALYTES.find((analyte) => analyte.key === key)?.shortLabel ?? key;
}

function statusRank(status: NutritionDiagnosticStatus) {
  if (status === "Bajo") return 0;
  if (status === "Adecuado") return 1;
  return 2;
}

function trendLabel(delta: number) {
  if (Math.abs(delta) < 0.0001) return "Sin cambio";
  return delta > 0 ? "Subio" : "Bajo";
}

function eventValue(event: SavedMonitoringEvent, sampleType: NutritionSampleType, analyteKey: NutritionAnalyteKey) {
  return event.values.find((value) => value.sampleType === sampleType && value.analyteKey === analyteKey);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
          {SAMPLE_TYPE_LABELS[sampleType]}
        </p>
        <FlaskConical className="h-4 w-4 text-app-green" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {NUTRITION_CAPTURE_KEYS.map((key) => {
          const analyte = NUTRITION_ANALYTES.find((item) => item.key === key);
          const unit = nutritionInputUnitFor(sampleType, key);

          return (
            <Field key={`${sampleType}-${key}`} label={`${analyte?.shortLabel ?? key} · ${unit}`} preserveCase>
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

function MiniMetric({
  className,
  label,
  value,
  detail,
}: {
  className?: string;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className={cn("border-t border-app-border py-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">{label}</p>
      <p className="mt-2 text-2xl font-light text-app-text">{value}</p>
      {detail ? <p className="mt-1 text-xs text-app-muted">{detail}</p> : null}
    </div>
  );
}

export function NutritionMonitoringSection({ embedded = false }: { embedded?: boolean }) {
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedAnalyte, setSelectedAnalyte] = useState<NutritionAnalyteKey>("n_no3");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [activeMonitoringTab, setActiveMonitoringTab] = useState<"current" | "history">("current");

  const canUseMonitoring = currentUser.role === "owner" || currentUser.role === "admin";

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
    setCompareIds([]);
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
    setCompareIds([]);
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
    if (!canUseMonitoring || !activeGreenhouseId || !organization.id) {
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
      let eventsQuery = supabase
        .from("nutrition_monitoring_events")
        .select("id, sample_date, ddt, notes, created_at")
        .eq("company_id", organization.id)
        .eq("greenhouse_id", activeGreenhouseId)
        .order("sample_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (dateFrom) eventsQuery = eventsQuery.gte("sample_date", dateFrom);
      if (dateTo) eventsQuery = eventsQuery.lte("sample_date", dateTo);

      const { data: eventRows, error: eventsError } = await eventsQuery;

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
  }, [activeGreenhouseId, canUseMonitoring, dateFrom, dateTo, organization.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const chronologicalEvents = useMemo(
    () => [...savedEvents].sort((left, right) => left.sampleDate.localeCompare(right.sampleDate)),
    [savedEvents]
  );

  const trendData = useMemo(
    () =>
      chronologicalEvents.map((event) => {
        const petiole = eventValue(event, "petiole_cell_extract", selectedAnalyte);
        const soil = eventValue(event, "soil_solution", selectedAnalyte);
        return {
          date: event.sampleDate.slice(5),
          ddt: event.ddt,
          petiole: petiole?.diagnosticValue ?? null,
          soil: soil?.diagnosticValue ?? null,
          rangeMin: petiole?.rangeMin ?? soil?.rangeMin ?? null,
          rangeMax: petiole?.rangeMax ?? soil?.rangeMax ?? null
        };
      }),
    [chronologicalEvents, selectedAnalyte]
  );

  const selectedRange = useMemo(() => {
    const ranges = trendData.filter((row) => row.rangeMin !== null && row.rangeMax !== null);
    return ranges[0] ?? null;
  }, [trendData]);

  const repeatedAlerts = useMemo(() => {
    const alerts: Array<{ key: string; label: string; detail: string; status: NutritionDiagnosticStatus; count: number }> = [];

    NUTRITION_ANALYTES.forEach((analyte) => {
      sampleTypes.forEach((sampleType) => {
        const series = chronologicalEvents
          .map((event) => ({ event, value: eventValue(event, sampleType, analyte.key) }))
          .filter((item) => item.value);

        const latest = series[series.length - 1]?.value;
        if (!latest || latest.diagnosticStatus === "Adecuado") return;

        let count = 0;
        for (let index = series.length - 1; index >= 0; index -= 1) {
          if (series[index].value?.diagnosticStatus !== latest.diagnosticStatus) break;
          count += 1;
        }

        if (count >= 2) {
          alerts.push({
            key: `${sampleType}-${analyte.key}`,
            label: `${analyte.shortLabel} ${sampleType === "petiole_cell_extract" ? "ECP" : "suelo"}`,
            detail: `${latest.diagnosticStatus} por ${count} monitoreos seguidos`,
            status: latest.diagnosticStatus,
            count
          });
        }
      });
    });

    return alerts.sort((left, right) => right.count - left.count);
  }, [chronologicalEvents]);

  const compareEvents = useMemo(
    () => compareIds.map((id) => savedEvents.find((event) => event.id === id)).filter((event): event is SavedMonitoringEvent => Boolean(event)),
    [compareIds, savedEvents]
  );

  const compareRows = useMemo(() => {
    if (compareEvents.length !== 2) return [];
    const [older, newer] = [...compareEvents].sort((left, right) => left.sampleDate.localeCompare(right.sampleDate));

    return NUTRITION_ANALYTES.flatMap((analyte) =>
      sampleTypes.map((sampleType) => {
        const before = eventValue(older, sampleType, analyte.key);
        const after = eventValue(newer, sampleType, analyte.key);
        const delta = (after?.diagnosticValue ?? 0) - (before?.diagnosticValue ?? 0);
        return {
          key: `${sampleType}-${analyte.key}`,
          analyte,
          sampleType,
          before,
          after,
          delta,
          statusChange: before && after ? `${before.diagnosticStatus} -> ${after.diagnosticStatus}` : "--",
          improved: before && after ? statusRank(after.diagnosticStatus) === 1 && statusRank(before.diagnosticStatus) !== 1 : false,
          worsened: before && after ? statusRank(after.diagnosticStatus) !== 1 && statusRank(before.diagnosticStatus) === 1 : false
        };
      })
    );
  }, [compareEvents]);

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

  const toggleCompare = (eventId: string) => {
    setCompareIds((current) => {
      if (current.includes(eventId)) return current.filter((id) => id !== eventId);
      return [eventId, ...current].slice(0, 2);
    });
  };

  const exportHistory = () => {
    const rows = [
      ["fecha", "ddt", "muestra", "nutrimento", "valor", "unidad", "rango_min", "rango_max", "estado", "notas"]
    ];

    savedEvents.forEach((event) => {
      event.values.forEach((value) => {
        rows.push([
          event.sampleDate,
          String(event.ddt),
          SAMPLE_TYPE_LABELS[value.sampleType],
          value.analyteLabel,
          String(value.diagnosticValue),
          value.diagnosticUnit,
          value.rangeMin === null ? "" : String(value.rangeMin),
          value.rangeMax === null ? "" : String(value.rangeMax),
          value.diagnosticStatus,
          event.notes
        ]);
      });
    });

    downloadCsv(`monitoreo-nutrimental-${activeGreenhouse?.name ?? "invernadero"}.csv`, rows);
  };

  const exportCompare = () => {
    if (compareEvents.length !== 2) return;
    const rows = [
      ["nutrimento", "muestra", "fecha_base", "estado_base", "valor_base", "fecha_comparada", "estado_comparado", "valor_comparado", "delta"]
    ];
    const [older, newer] = [...compareEvents].sort((left, right) => left.sampleDate.localeCompare(right.sampleDate));

    compareRows.forEach((row) => {
      rows.push([
        row.analyte.shortLabel,
        row.sampleType === "petiole_cell_extract" ? "ECP" : "Suelo",
        older.sampleDate,
        row.before?.diagnosticStatus ?? "",
        row.before ? String(row.before.diagnosticValue) : "",
        newer.sampleDate,
        row.after?.diagnosticStatus ?? "",
        row.after ? String(row.after.diagnosticValue) : "",
        String(row.delta)
      ]);
    });

    downloadCsv(`comparativo-nutrimental-${older.sampleDate}-${newer.sampleDate}.csv`, rows);
  };

  const saveMonitoring = async () => {
    if (!activeGreenhouse || !organization.id || !canUseMonitoring) return;
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

  if (!canUseMonitoring) {
    return <EmptyState icon={FlaskConical} title="Monitoreo nutrimental disponible para owner y admin." />;
  }

  if (!greenhouses.length || !activeGreenhouse) {
    return <EmptyState icon={Sprout} title="No hay invernaderos disponibles para monitoreo." />;
  }

  return (
    <section>
      {!embedded ? (
        <div className="mb-10 border-b border-app-border pb-7 pt-8 md:pt-10">
          <div>
            <div>
              <MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">Monitoreo</p>
              <h1 className="mt-3 text-4xl font-light leading-none tracking-normal text-app-text md:text-6xl">
                Nutrimental
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">
                Captura, compara y exporta extracto celular de peciolo y solucion de suelo con rangos por DDT.
              </p>
            </div>
          </div>
        </div>
      ) : null}

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

      <div className="mb-8 flex flex-col gap-4 border-b border-app-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Secciones de monitoreo nutrimental">
          <button
            type="button"
            role="tab"
            aria-selected={activeMonitoringTab === "current"}
            className={cn(
              "border px-4 py-3 text-left transition",
              activeMonitoringTab === "current"
                ? "border-app-green bg-app-soft text-app-green"
                : "border-app-border bg-white text-app-muted hover:text-app-text"
            )}
            onClick={() => setActiveMonitoringTab("current")}
          >
            <span className="block text-sm font-medium text-app-text">Monitoreo actual</span>
            <span className="mt-1 block text-xs">Captura y diagnostico</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeMonitoringTab === "history"}
            className={cn(
              "border px-4 py-3 text-left transition",
              activeMonitoringTab === "history"
                ? "border-app-green bg-app-soft text-app-green"
                : "border-app-border bg-white text-app-muted hover:text-app-text"
            )}
            onClick={() => setActiveMonitoringTab("history")}
          >
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-app-text">
              Historial y analisis
              <span className="border border-app-border bg-white px-2 py-0.5 text-[11px] font-semibold text-app-muted">
                {savedEvents.length}
              </span>
              {repeatedAlerts.length ? (
                <span className="border border-[#E3BDBD] bg-app-red px-2 py-0.5 text-[11px] font-semibold text-[#7B2A2A]">
                  {repeatedAlerts.length} alertas
                </span>
              ) : null}
            </span>
            <span className="mt-1 block text-xs">Graficas y comparativo</span>
          </button>
        </div>

        {activeMonitoringTab === "current" ? (
          <Button
            disabled={isSaving || !result.complete}
            icon={<Save className="h-4 w-4" />}
            onClick={saveMonitoring}
            variant="primary"
          >
            {isSaving ? "Guardando" : "Guardar monitoreo"}
          </Button>
        ) : (
          <Button
            disabled={!savedEvents.length}
            icon={<Download className="h-4 w-4" />}
            onClick={exportHistory}
            variant="secondary"
          >
            Exportar historial
          </Button>
        )}
      </div>

      {activeMonitoringTab === "current" ? (
      <div className="grid gap-12 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
        <div>
          <div className="mb-6 flex items-center justify-between gap-4 border-y border-app-border py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">Captura</p>
              <p className="mt-2 text-sm text-app-muted">Datos de la muestra actual</p>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">01</span>
          </div>

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
            <MiniMetric label="DDT" value={ddt} />
            <MiniMetric className="sm:col-span-2" label="Trasplante" value={formatDate(activeGreenhouse.transplantDate)} />
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
        </div>

        <div>
          <div className="mb-5 border-y border-app-border py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                  Diagnostico
                </p>
                <h2 className="mt-3 text-3xl font-light text-app-text">{activeGreenhouse.name}</h2>
                <p className="mt-2 text-sm text-app-muted">{activeGreenhouse.variety} · {NUTRITION_SOURCE_LABEL}</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-app-border bg-white text-app-green">
                <Calculator className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="grid gap-3 border-b border-app-border pb-6 sm:grid-cols-3">
            <MiniMetric label="Monitoreos" value={savedEvents.length} detail="En filtros actuales" />
            <MiniMetric label="Alertas repetidas" value={repeatedAlerts.length} detail="Bajos/altos consecutivos" />
            <MiniMetric label="Comparativo" value={`${compareEvents.length}/2`} detail="Fechas seleccionadas" />
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
                      <p className="text-[11px] font-semibold tracking-[0.22em] text-app-muted">
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
                            Rango {petiole ? `${formatMeasurement(petiole.range.min)}-${formatMeasurement(petiole.range.max)} ${petiole.diagnosticUnit}` : "--"}
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
                            Rango {soil ? `${formatMeasurement(soil.range.min)}-${formatMeasurement(soil.range.max)} ${soil.diagnosticUnit}` : "--"}
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
      ) : (

      <div>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">Historial y analisis</p>
            <h2 className="mt-2 text-3xl font-light text-app-text">Evolucion nutrimental</h2>
          </div>
        </div>

        <div className="grid gap-10 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.35fr)]">
          <section className="border-y border-app-border py-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                Historial guardado
              </p>
              <History className="h-4 w-4 text-app-green" />
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <Field label="Desde">
                <TextInput value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} type="date" />
              </Field>
              <Field label="Hasta">
                <TextInput value={dateTo} onChange={(event) => setDateTo(event.target.value)} type="date" />
              </Field>
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
                  const isCompared = compareIds.includes(event.id);

                  return (
                    <div
                      key={event.id}
                      className={cn(
                        "grid gap-3 border-t border-app-border py-4",
                        selectedHistoryId === event.id && "bg-app-soft"
                      )}
                    >
                      <button
                        className="text-left"
                        onClick={() => {
                          applySavedMonitoring(event);
                          setActiveMonitoringTab("current");
                        }}
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
                            Usar
                          </span>
                        </div>
                        {event.notes ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-app-muted">{event.notes}</p> : null}
                      </button>
                      <button
                        className={cn(
                          "h-8 border px-2 text-xs font-semibold uppercase tracking-[0.14em]",
                          isCompared ? "border-app-green bg-app-soft text-app-green" : "border-app-border text-app-muted"
                        )}
                        onClick={() => toggleCompare(event.id)}
                        type="button"
                      >
                        {isCompared ? "En comparativo" : "Comparar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <div className="grid gap-8">
            <section className="border-y border-app-border py-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                    Tendencia
                  </p>
                  <h3 className="mt-2 text-2xl font-light text-app-text">{analyteLabel(selectedAnalyte)}</h3>
                </div>
                <LineChartIcon className="h-4 w-4 text-app-green" />
              </div>
              <Field label="Nutrimento">
                <SelectInput value={selectedAnalyte} onChange={(event) => setSelectedAnalyte(event.target.value as NutritionAnalyteKey)}>
                  {NUTRITION_ANALYTES.map((analyte) => (
                    <option key={analyte.key} value={analyte.key}>
                      {analyte.shortLabel}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <div className="mt-4 h-72 border-t border-app-border pt-4">
                {trendData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid stroke="#E6E6E2" vertical={false} />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                      <Tooltip />
                      {selectedRange ? (
                        <ReferenceArea y1={selectedRange.rangeMin ?? undefined} y2={selectedRange.rangeMax ?? undefined} fill="#E7F0E7" />
                      ) : null}
                      <Line dataKey="petiole" name="ECP" stroke="#1C3A2A" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line dataKey="soil" name="Suelo" stroke="#8A6F3D" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-12 text-sm text-app-muted">Sin datos para graficar.</p>
                )}
              </div>
            </section>

            <section className="border-b border-app-border pb-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                  Alertas por repeticion
                </p>
                <AlertTriangle className="h-4 w-4 text-app-green" />
              </div>
              {repeatedAlerts.length ? (
                <div className="grid gap-2">
                  {repeatedAlerts.map((alert) => (
                    <div key={alert.key} className="flex items-center justify-between gap-4 border-t border-app-border py-3">
                      <div>
                        <p className="text-sm font-medium text-app-text">{alert.label}</p>
                        <p className="mt-1 text-xs text-app-muted">{alert.detail}</p>
                      </div>
                      <StatusPill status={alert.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="border-t border-app-border py-4 text-sm text-app-muted">Sin repeticiones críticas en el historial filtrado.</p>
              )}
            </section>

            <section className="border-b border-app-border pb-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
                    Comparativo entre fechas
                  </p>
                  {compareEvents.length === 2 ? (
                    <p className="mt-2 text-sm text-app-muted">
                      {[...compareEvents].sort((left, right) => left.sampleDate.localeCompare(right.sampleDate)).map((event) => formatDate(event.sampleDate)).join(" vs ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button disabled={compareEvents.length !== 2} icon={<Download className="h-4 w-4" />} onClick={exportCompare} variant="secondary">
                    Exportar
                  </Button>
                  <GitCompare className="mt-3 h-4 w-4 text-app-green sm:mt-0" />
                </div>
              </div>
              {compareEvents.length !== 2 ? (
                <p className="border-t border-app-border py-4 text-sm text-app-muted">Selecciona dos monitoreos del historial.</p>
              ) : (
                <div className="border-b border-app-border">
                  {compareRows.map((row) => (
                    <div key={row.key} className="grid gap-3 border-t border-app-border py-4 lg:grid-cols-[120px_1fr_1fr_120px]">
                      <div>
                        <p className="text-[11px] font-semibold tracking-[0.18em] text-app-muted">
                          {row.analyte.shortLabel}
                        </p>
                        <p className="mt-1 text-xs text-app-muted">{row.sampleType === "petiole_cell_extract" ? "ECP" : "Suelo"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-app-text">{formatMeasurement(row.before?.diagnosticValue)} {row.before?.diagnosticUnit ?? ""}</p>
                        <StatusPill status={row.before?.diagnosticStatus} />
                      </div>
                      <div>
                        <p className="text-sm text-app-text">{formatMeasurement(row.after?.diagnosticValue)} {row.after?.diagnosticUnit ?? ""}</p>
                        <StatusPill status={row.after?.diagnosticStatus} />
                      </div>
                      <div>
                        <p className={cn("text-sm font-medium", row.improved && "text-app-green", row.worsened && "text-[#7B2A2A]", !row.improved && !row.worsened && "text-app-muted")}>
                          {trendLabel(row.delta)}
                        </p>
                        <p className="mt-1 text-xs text-app-muted">{row.statusChange}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      )}
    </section>
  );
}
