"use client";

import {
  AlertTriangle,
  Ban,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Ellipsis,
  ExternalLink,
  History,
  Minus,
  Paperclip,
  Plus,
  Play,
  RotateCcw,
  Send
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CopilotInlineSuggestions } from "@/components/copilot/MiraCopilot";
import { DatePickerInput, TimePickerInput } from "@/components/forms/DateTimeInputs";
import { Field, FormattedNumberInput, SelectInput, TextArea, TextInput, UnitSelectInput } from "@/components/forms/FormControls";
import { HarvestCaptureFields } from "@/components/forms/HarvestCaptureFields";
import { ProductCatalogCombobox, type ProductCatalogOption } from "@/components/forms/ProductCatalogCombobox";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  applicationCategories,
  applicationCategoryFromDb,
  applicationCategoryToDb
} from "@/lib/application-categories";
import { addDays, startOfIsoWeek, weekOfYear } from "@/lib/date";
import { appErrorMessage } from "@/lib/errors";
import { executionCatalogProduct } from "@/lib/execution-products";
import { cropStageFromDdt, cropStageToDbValue, greenhouseDisplayName } from "@/lib/crop-ddt";
import { harvestValuesFromForm } from "@/lib/harvest";
import { normalizedProductName } from "@/lib/product-search";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createPrivateCompanyFileUrl, uploadPrivateCompanyFile } from "@/lib/storage";
import { useGreenhouseStore } from "@/lib/store";
import { cn, formatDate, parseNumericInput } from "@/lib/utils";
import type { CopilotInsight } from "@/lib/mira-copilot";
import type { ApplicationRecord, CropCatalogItem, Greenhouse, HarvestRecord, IrrigationRecord, NutritionRecord } from "@/types";

type PlanStatus = "draft" | "published" | "closed";
type TaskPriority = "low" | "normal" | "high" | "critical";
type ExecutionMode = "manager" | "crew" | "both";
type OperationStatus = "pendiente" | "en_progreso" | "bloqueada" | "completada" | "verificada" | "cancelada";

type WeeklyPlanRow = {
  id: string;
  week_start: string;
  status: PlanStatus;
  published_at: string | null;
};

type OperationTaskRow = {
  id: string;
  weekly_plan_id: string | null;
  greenhouse_id: string;
  type: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: OperationStatus;
  priority: TaskPriority;
  instructions: string | null;
  execution_mode: ExecutionMode;
  crew_size: number | null;
  blocked_reason: string | null;
  origin: "planned" | "unplanned" | "copilot" | "telegram" | "migrated";
  occurred_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  verification_required: boolean;
  technical_plan: TechnicalPlan;
};

type WorkEvidenceRow = {
  id: string;
  work_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type WorkEventRow = {
  id: string;
  work_id: string;
  actor_user_id: string | null;
  actor_staff_id: string | null;
  update_type: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AgentDispatchRow = {
  work_id: string;
  recipient_user_id: string | null;
  recipient_staff_id: string | null;
  status: "pending" | "processing" | "accepted" | "sent" | "responded" | "completed" | "blocked" | "failed" | "cancelled";
  last_error: string | null;
  created_at: string;
};

type OperationView = "calendar" | "plan" | "execution" | "verification" | "history";
type HistoryTechnicalKind = "riego" | "nutricion" | "aplicaciones" | "cosecha";

type HistoryTechnicalResult = {
  kind: HistoryTechnicalKind;
  label: string;
  detail: string;
  occurredAt: string;
};

const workEventLabels: Record<string, string> = {
  created: "Actividad planeada",
  assigned: "Responsable asignado",
  published: "Actividad enviada",
  acknowledged: "Actividad confirmada",
  started: "Actividad iniciada",
  blocked: "Actividad bloqueada",
  completed: "Actividad completada",
  verified: "Actividad verificada",
  reopened: "Actividad reabierta",
  cancelled: "Actividad cancelada",
  comment: "Comentario agregado",
  question: "Pregunta enviada",
  answer: "Respuesta recibida"
};

function workEventSource(metadata: Record<string, unknown> | null) {
  const source = typeof metadata?.source === "string" ? metadata.source : "";
  if (source === "grok_whatsapp") return "WhatsApp · Grok";
  if (source === "telegram") return "Telegram";
  if (source === "technical_adapter") return "App web";
  if (source === "work") return "App web";
  if (source === "backfill" || source === "migration") return "Migración";
  return "Sistema";
}

function formatWorkEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function WorkTimeline({
  events,
  evidence,
  actorName,
  onOpenEvidence
}: {
  events: WorkEventRow[];
  evidence: WorkEvidenceRow[];
  actorName: (userId: string | null, staffId?: string | null) => string;
  onOpenEvidence: (evidence: WorkEvidenceRow) => void;
}) {
  const entries = [
    ...events.map((event) => ({ kind: "event" as const, date: event.created_at, event })),
    ...evidence.map((item) => ({ kind: "evidence" as const, date: item.created_at, evidence: item }))
  ].sort((left, right) => left.date.localeCompare(right.date));

  return (
    <details className="mt-3 border-y border-app-border py-1">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-xs font-medium text-app-text outline-none transition-colors hover:bg-app-sidebar focus-visible:ring-2 focus-visible:ring-app-green/25">
        <span className="flex items-center gap-2"><History aria-hidden="true" className="h-4 w-4 text-app-muted" />Bitácora</span>
        <span className="font-mono text-[10px] text-app-muted">{entries.length} movimiento{entries.length === 1 ? "" : "s"}</span>
      </summary>
      {entries.length ? (
        <ol className="ml-2 mt-2 border-l border-app-border pb-2 pl-4" aria-label="Historial de la actividad">
          {entries.map((entry) => {
            if (entry.kind === "evidence") {
              const item = entry.evidence;
              return (
                <li className="relative pb-4 last:pb-0" key={`evidence-${item.id}`}>
                  <span aria-hidden="true" className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-app-amber ring-4 ring-white" />
                  <p className="text-xs font-medium text-app-text">Evidencia adjuntada</p>
                  <p className="mt-1 text-[11px] leading-5 text-app-muted">{actorName(item.created_by)} · {formatWorkEventDate(item.created_at)} · App web</p>
                  {item.note ? <p className="mt-1 break-words text-xs leading-5 text-app-text">{item.note}</p> : null}
                  <Button className="mt-1 min-h-8 px-2 text-xs" icon={<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => onOpenEvidence(item)} variant="ghost">Abrir {item.file_name}</Button>
                </li>
              );
            }

            const event = entry.event;
            return (
              <li className="relative pb-4 last:pb-0" key={event.id}>
                <span aria-hidden="true" className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-app-green ring-4 ring-white" />
                <p className="text-xs font-medium text-app-text">{workEventLabels[event.update_type] ?? "Actividad actualizada"}</p>
                <p className="mt-1 text-[11px] leading-5 text-app-muted">{actorName(event.actor_user_id, event.actor_staff_id)} · {formatWorkEventDate(event.created_at)} · {workEventSource(event.metadata)}</p>
                {event.note ? <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-app-text">{event.note}</p> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="px-1 pb-2 pt-1 text-xs leading-5 text-app-muted">La bitácora aparecerá cuando se registre la primera acción.</p>
      )}
    </details>
  );
}

type AssignmentRow = {
  id: string;
  task_id: string;
  user_id: string;
};

type StaffAssignmentRow = {
  id: string;
  task_id: string;
  staff_id: string;
};

type MaterialRow = {
  id: string;
  task_id: string;
  product_id: string | null;
  product_name: string;
  composition: string | null;
  dose: string | null;
  unit: string | null;
  mixing_order: number | null;
  notes: string | null;
};

type ManagerOption = {
  id: string;
  name: string;
  email: string;
};

type StaffOption = {
  id: string;
  name: string;
  detail: string;
};

type OperationGreenhouseOption = {
  id: string;
  name: string;
};

type MaterialDraft = {
  productId: string;
  productName: string;
  composition: string;
  dose: string;
  unit: string;
  notes: string;
};

type ProductOption = ProductCatalogOption;

type TechnicalPlan = {
  plannedDurationMin?: string;
  plannedLiters?: string;
  sector?: string;
  targetPh?: string;
  targetEc?: string;
  energyKwh?: string;
  laborHours?: string;
  method?: NutritionRecord["method"];
  objective?: NutritionRecord["objective"];
  appliedArea?: string;
  rafiaWorkType?: string;
  rafiaSector?: string;
  maintenanceWorkType?: string;
  maintenanceSector?: string;
  cycleWorkType?: string;
  cycleSector?: string;
  harvestZone?: string;
};

type ApplicationExecutionDraft = {
  materialId: string;
  productId: string;
  productName: string;
  dose: string;
  unit: string;
  category: ApplicationRecord["category"] | "";
  composition: string;
  safetyInterval: string;
  reentryInterval: string;
  effectiveness: string;
  reviewDate: string;
  reapplicationDate: string;
  notes: string;
};

type ApplicationExecutionPayload = {
  occurredAt: string;
  appliedArea: string;
  applications: ApplicationExecutionDraft[];
};

type IrrigationExecutionPayload = Omit<IrrigationRecord, "id" | "greenhouseId" | "responsible">;

type NutritionExecutionDraft = {
  materialId: string;
  productId: string;
  productName: string;
  composition: string;
  dose: string;
  unit: string;
};

type NutritionExecutionPayload = {
  date: string;
  method: NutritionRecord["method"];
  objective: NutritionRecord["objective"];
  ph: number | null;
  ec: number | null;
  notes: string;
  products: NutritionExecutionDraft[];
};

type HarvestExecutionPayload = Omit<HarvestRecord, "id" | "greenhouseId">;

type ActivityPayload = {
  greenhouseId: string;
  type: string;
  title: string;
  scheduledDate: string;
  scheduledTime: string;
  priority: TaskPriority;
  instructions: string;
  executionMode: ExecutionMode;
  crewSize: number | null;
  assigneeIds: string[];
  staffAssigneeIds: string[];
  materials: MaterialDraft[];
  technicalPlan: TechnicalPlan;
};

const activityTypes = [
  { value: "riego", label: "Riego" },
  { value: "fertirriego", label: "Fertirriego" },
  { value: "aplicacion_foliar", label: "Aplicación foliar" },
  { value: "revision_plagas", label: "Revisión de plagas y enfermedades" },
  { value: "poda", label: "Deschuponado" },
  { value: "tutoreo", label: "Manejo de rafia" },
  { value: "deshoje", label: "Deshoje" },
  { value: "cosecha", label: "Cosecha" },
  { value: "limpieza", label: "Limpieza" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "preparacion_ciclo", label: "Preparación de ciclo" },
  { value: "otro", label: "Otra actividad" }
];

const productActivityTypes = [
  "fertirriego",
  "fertilizacion",
  "aplicacion_foliar",
  "limpieza",
  "preparacion_ciclo"
];

const activityLabels: Record<string, string> = {
  ...Object.fromEntries(activityTypes.map((item) => [item.value, item.label])),
  fertilizacion: "Fertirriego"
};

const statusLabels: Record<OperationStatus, string> = {
  pendiente: "Planeado",
  en_progreso: "En ejecución",
  bloqueada: "Bloqueada",
  completada: "Completada",
  verificada: "Verificada",
  cancelada: "Cancelada"
};

const statusTones: Record<OperationStatus, "neutral" | "blue" | "green" | "amber" | "red"> = {
  pendiente: "neutral",
  en_progreso: "blue",
  bloqueada: "red",
  completada: "amber",
  verificada: "green",
  cancelada: "neutral"
};

const operationViewAccents: Record<OperationView, string> = {
  calendar: "bg-[#35654A]",
  plan: "bg-[#8A7650]",
  execution: "bg-[#52757D]",
  verification: "bg-[#76627B]",
  history: "bg-[#687061]"
};

function workStatusIcon(status: OperationStatus) {
  if (status === "en_progreso") return <Play className="h-3 w-3" />;
  if (status === "bloqueada") return <Ban className="h-3 w-3" />;
  if (status === "completada" || status === "verificada") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "cancelada") return <Ban className="h-3 w-3" />;
  return <CalendarRange className="h-3 w-3" />;
}

const priorityLabels: Record<TaskPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica"
};

const executionLabels: Record<ExecutionMode, string> = {
  manager: "Encargado",
  crew: "Cuadrilla",
  both: "Encargado y cuadrilla"
};

const rafiaWorkTypes = [
  "Anillado",
  "Enredado",
  "Colocación de rafia",
  "Cambio de rafia",
  "Retiro por fin de ciclo"
];

const maintenanceWorkTypes = [
  "Cambio de plástico",
  "Cambio de malacates",
  "Sistema de riego",
  "Estructura/área",
  "Otro mantenimiento"
];

const cyclePreparationTypes = [
  "Tractor",
  "Preparación de camas",
  "Colocación de cinta",
  "Desinfección/acondicionamiento",
  "Otro inicio de ciclo"
];

const nutritionMethodToDb: Record<NutritionRecord["method"], string> = {
  Fertirriego: "fertirriego",
  Foliar: "foliar",
  Drench: "drench"
};

const nutritionObjectiveToDb: Record<NutritionRecord["objective"], string> = {
  Desarrollo: "desarrollo",
  Raíz: "raiz",
  Floración: "floracion",
  Cuajado: "cuajado",
  Engorde: "engorde",
  Calidad: "calidad"
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function daysBetween(startDate?: string | null, endDate?: string | null) {
  if (!startDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = endDate ? new Date(`${endDate}T12:00:00`) : new Date();
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function weekLabel(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const start = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(weekStart);
  const end = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(weekEnd);
  return `${start} – ${end}`.replaceAll(".", "");
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric" })
    .format(date)
    .replace(".", "")
    .toUpperCase();
}

function technicalPlanSummary(task: OperationTaskRow) {
  const plan = task.technical_plan ?? {};
  if (task.type === "riego") {
    return [
      plan.plannedDurationMin ? `${plan.plannedDurationMin} min` : "",
      plan.plannedLiters ? `${plan.plannedLiters} L` : "",
      plan.sector,
      plan.targetPh ? `pH ${plan.targetPh}` : "",
      plan.targetEc ? `CE ${plan.targetEc}` : ""
    ].filter(Boolean).join(" · ");
  }
  if (task.type === "fertirriego" || task.type === "fertilizacion") {
    return [plan.method, plan.objective, plan.targetPh ? `pH ${plan.targetPh}` : "", plan.targetEc ? `CE ${plan.targetEc}` : ""]
      .filter(Boolean).join(" · ");
  }
  if (task.type === "aplicacion_foliar") return plan.appliedArea ?? "";
  if (task.type === "tutoreo") return [plan.rafiaWorkType, plan.rafiaSector].filter(Boolean).join(" · ");
  if (task.type === "mantenimiento") return [plan.maintenanceWorkType, plan.maintenanceSector].filter(Boolean).join(" · ");
  if (task.type === "otro" && plan.cycleWorkType) return [plan.cycleWorkType, plan.cycleSector].filter(Boolean).join(" · ");
  if (task.type === "cosecha") return plan.harvestZone ?? "";
  return "";
}

function isOperationsSetupError(error: any) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code);
}

function rpcRecordId(data: unknown) {
  if (data && typeof data === "object" && "recordId" in data) {
    const id = (data as { recordId?: unknown }).recordId;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function rpcRecordIds(data: unknown) {
  if (data && typeof data === "object" && "recordIds" in data) {
    const ids = (data as { recordIds?: unknown }).recordIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  }
  return [];
}

function emptyMaterial(): MaterialDraft {
  return { productId: "", productName: "", composition: "", dose: "", unit: "", notes: "" };
}

function canonicalNumericText(value?: string | null) {
  const parsed = parseNumericInput(value ?? "");
  return parsed === null ? "" : String(parsed);
}

function doseWithUnit(dose?: string | null, unit?: string | null) {
  const normalizedDose = dose?.trim() ?? "";
  const normalizedUnit = unit?.trim() ?? "";
  if (!normalizedUnit || !normalizedDose) return normalizedDose || normalizedUnit;
  return normalizedDose.toLocaleLowerCase("es-MX").endsWith(normalizedUnit.toLocaleLowerCase("es-MX"))
    ? normalizedDose
    : `${normalizedDose} ${normalizedUnit}`;
}

function technicalPlanForType(type: string, plan: TechnicalPlan): TechnicalPlan {
  const resourcePlan = {
    energyKwh: canonicalNumericText(plan.energyKwh),
    laborHours: canonicalNumericText(plan.laborHours)
  };
  if (type === "riego") {
    return {
      plannedDurationMin: canonicalNumericText(plan.plannedDurationMin),
      plannedLiters: canonicalNumericText(plan.plannedLiters),
      sector: plan.sector ?? "",
      targetPh: canonicalNumericText(plan.targetPh),
      targetEc: canonicalNumericText(plan.targetEc),
      ...resourcePlan
    };
  }
  if (type === "fertirriego" || type === "fertilizacion") {
    return {
      method: plan.method ?? "Fertirriego",
      objective: plan.objective ?? "Desarrollo",
      targetPh: canonicalNumericText(plan.targetPh),
      targetEc: canonicalNumericText(plan.targetEc),
      ...resourcePlan
    };
  }
  if (type === "aplicacion_foliar") return { appliedArea: plan.appliedArea ?? "", ...resourcePlan };
  if (type === "tutoreo") {
    return {
      rafiaWorkType: plan.rafiaWorkType ?? "Enredado",
      rafiaSector: plan.rafiaSector ?? "",
      ...resourcePlan
    };
  }
  if (type === "mantenimiento") {
    return {
      maintenanceWorkType: plan.maintenanceWorkType ?? "Sistema de riego",
      maintenanceSector: plan.maintenanceSector ?? "",
      ...resourcePlan
    };
  }
  if (type === "preparacion_ciclo") {
    return {
      cycleWorkType: plan.cycleWorkType ?? "Preparación de camas",
      cycleSector: plan.cycleSector ?? "",
      ...resourcePlan
    };
  }
  if (type === "cosecha") return { harvestZone: plan.harvestZone ?? "", ...resourcePlan };
  return resourcePlan;
}

function activityLabel(task: OperationTaskRow) {
  if (task.type === "otro" && task.technical_plan?.cycleWorkType) return "Preparación de ciclo";
  return activityLabels[task.type] ?? task.type;
}

function historyKindForTask(task: OperationTaskRow): HistoryTechnicalKind | null {
  if (task.type === "riego") return "riego";
  if (task.type === "fertirriego" || task.type === "fertilizacion") return "nutricion";
  if (task.type === "aplicacion_foliar") return "aplicaciones";
  if (task.type === "cosecha") return "cosecha";
  return null;
}

function historyKindLabel(kind: HistoryTechnicalKind) {
  return {
    riego: "Riego",
    nutricion: "Nutrición",
    aplicaciones: "Aplicaciones",
    cosecha: "Cosecha"
  }[kind];
}

function optionalFormNumber(value: FormDataEntryValue | null) {
  return parseNumericInput(String(value ?? ""));
}

function requiredFormNumber(value: FormDataEntryValue | null) {
  return optionalFormNumber(value) ?? 0;
}

function grokDispatchMessage(data: any) {
  const accepted = Number(data?.accepted ?? 0);
  const failed = Number(data?.failed ?? 0);
  const missingPhone = Number(data?.missingPhone ?? 0);
  const skipped = Number(data?.skipped ?? 0);

  if (!accepted && !failed && !missingPhone && !skipped) {
    return "No hay actividades nuevas para enviar.";
  }

  return [
    accepted ? `${accepted} aviso${accepted === 1 ? "" : "s"} recibido${accepted === 1 ? "" : "s"}` : "",
    missingPhone ? `${missingPhone} encargado${missingPhone === 1 ? "" : "s"} sin teléfono` : "",
    failed ? `${failed} envío${failed === 1 ? "" : "s"} fallido${failed === 1 ? "" : "s"}` : "",
    skipped ? `${skipped} sin cambios` : ""
  ].filter(Boolean).join(" · ");
}

async function grokInvokeErrorMessage(error: unknown, fallback: string) {
  const response = (error as { context?: Response } | null)?.context;
  if (response && typeof response.clone === "function") {
    const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
    if (payload?.error) return appErrorMessage({ message: payload.error }, fallback);
  }
  return appErrorMessage(error, fallback);
}

function ActivityFormModal({
  open,
  onClose,
  onSave,
  saving,
  weekDays,
  greenhouses,
  crops,
  managers,
  staff,
  productOptions,
  task,
  assignments,
  staffAssignments,
  materials
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: ActivityPayload) => Promise<void>;
  saving: boolean;
  weekDays: Date[];
  greenhouses: Array<Pick<Greenhouse, "id" | "name" | "cropId" | "managerUserId" | "managerStaffId">>;
  crops: CropCatalogItem[];
  managers: ManagerOption[];
  staff: StaffOption[];
  productOptions: ProductOption[];
  task: OperationTaskRow | null;
  assignments: AssignmentRow[];
  staffAssignments: StaffAssignmentRow[];
  materials: MaterialRow[];
}) {
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [staffAssigneeIds, setStaffAssigneeIds] = useState<string[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialDraft[]>([emptyMaterial()]);
  const [activityType, setActivityType] = useState("fertirriego");
  const [technicalPlan, setTechnicalPlan] = useState<TechnicalPlan>({});
  const [scheduledDate, setScheduledDate] = useState("");
  const [selectedGreenhouseId, setSelectedGreenhouseId] = useState("");
  const [formError, setFormError] = useState("");

  const applyGreenhouseDefaultAssignee = useCallback((greenhouseId: string) => {
    const greenhouse = greenhouses.find((item) => item.id === greenhouseId);
    setAssigneeIds(greenhouse?.managerUserId ? [greenhouse.managerUserId] : []);
    setStaffAssigneeIds(greenhouse?.managerStaffId ? [greenhouse.managerStaffId] : []);
  }, [greenhouses]);

  useEffect(() => {
    if (!open) return;
    const defaultGreenhouseId = task?.greenhouse_id ?? greenhouses[0]?.id ?? "";
    setScheduledDate(task?.scheduled_date ?? dateKey(weekDays[0]));
    setSelectedGreenhouseId(defaultGreenhouseId);
    if (task) {
      setAssigneeIds(assignments.filter((item) => item.task_id === task.id).map((item) => item.user_id));
      setStaffAssigneeIds(staffAssignments.filter((item) => item.task_id === task.id).map((item) => item.staff_id));
    } else {
      applyGreenhouseDefaultAssignee(defaultGreenhouseId);
    }
    const taskMaterials = task
      ? materials
          .filter((item) => item.task_id === task.id)
          .sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0))
          .map((item) => ({
            productId: item.product_id ?? "",
            productName: item.product_name,
            composition: item.composition ?? "",
            dose: item.dose ?? "",
            unit: item.unit ?? "",
            notes: item.notes ?? ""
          }))
      : [];
    setMaterialRows(taskMaterials.length ? taskMaterials : [emptyMaterial()]);
    setActivityType(task?.type === "otro" && task.technical_plan?.cycleWorkType ? "preparacion_ciclo" : task?.type ?? "fertirriego");
    setTechnicalPlan(task?.technical_plan ?? {});
    setFormError("");
  }, [applyGreenhouseDefaultAssignee, assignments, greenhouses, materials, open, staffAssignments, task, weekDays]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (!assigneeIds.length && !staffAssigneeIds.length) {
      setFormError("Selecciona al menos un encargado.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const dbActivityType = activityType === "preparacion_ciclo" ? "otro" : activityType;
    await onSave({
      greenhouseId: selectedGreenhouseId,
      type: dbActivityType,
      title: String(form.get("title")),
      scheduledDate,
      scheduledTime: String(form.get("scheduledTime") ?? ""),
      priority: String(form.get("priority")) as TaskPriority,
      instructions: String(form.get("instructions") ?? ""),
      executionMode: String(form.get("executionMode")) as ExecutionMode,
      crewSize: optionalFormNumber(form.get("crewSize")),
      assigneeIds,
      staffAssigneeIds,
      materials: productActivityTypes.includes(activityType)
        ? materialRows
          .filter((item) => item.productName.trim())
          .map((item) => ({ ...item, dose: item.dose.trim(), unit: item.unit.trim() }))
        : [],
      technicalPlan: technicalPlanForType(activityType, technicalPlan)
    });
  };

  const updateTechnicalPlan = (patch: Partial<TechnicalPlan>) => {
    setTechnicalPlan((current) => ({ ...current, ...patch }));
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? "Editar actividad" : "Nueva actividad semanal"}>
      <form className="grid gap-6" key={task?.id ?? "new-operation"} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Área productiva">
            <SelectInput
              name="greenhouseId"
              onChange={(event) => {
                setSelectedGreenhouseId(event.target.value);
                if (!task) applyGreenhouseDefaultAssignee(event.target.value);
              }}
              value={selectedGreenhouseId}
              required
            >
              {greenhouses.map((greenhouse) => (
                <option key={greenhouse.id} value={greenhouse.id}>{greenhouseDisplayName(greenhouse, crops)}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Actividad">
            <SelectInput name="type" onChange={(event) => setActivityType(event.target.value)} value={activityType}>
              {activityTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field className="sm:col-span-2" label="Título">
            <TextInput name="title" defaultValue={task?.title ?? ""} placeholder="Fertirriego matutino Hectárea 1" required />
          </Field>
          <Field label="Día">
            <input name="scheduledDate" type="hidden" value={scheduledDate} />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-1.5">
              {weekDays.map((date) => {
                const key = dateKey(date);
                const selected = key === scheduledDate;

                return (
                  <button
                    className={cn(
                      "grid h-12 place-items-center rounded-lg border px-1 text-center transition",
                      selected
                        ? "border-app-green bg-app-green text-white"
                        : "border-app-border bg-white text-app-text hover:bg-app-sidebar"
                    )}
                    key={key}
                    onClick={() => setScheduledDate(key)}
                    type="button"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
                      {new Intl.DateTimeFormat("es-MX", { weekday: "short" }).format(date).replace(".", "")}
                    </span>
                    <span className="text-sm font-semibold">{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Hora">
            <TimePickerInput name="scheduledTime" defaultValue={task?.scheduled_time?.slice(0, 5) ?? ""} />
          </Field>
          <Field label="Prioridad">
            <SelectInput name="priority" defaultValue={task?.priority ?? "normal"}>
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Ejecución">
            <SelectInput name="executionMode" defaultValue={task?.execution_mode ?? "crew"}>
              {Object.entries(executionLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Personas en cuadrilla">
            <FormattedNumberInput min={0} name="crewSize" defaultValue={task?.crew_size ?? ""} />
          </Field>
          <Field className="sm:col-span-2" label="Instrucciones">
            <TextArea
              name="instructions"
              defaultValue={task?.instructions ?? ""}
              placeholder="Preparación, orden, zona y criterios para terminar."
            />
          </Field>
          <div className="grid gap-4 border-t border-app-border pt-4 sm:col-span-2 sm:grid-cols-2">
            <Field label="Energía estimada (kWh)">
              <FormattedNumberInput min={0} onChange={(event) => updateTechnicalPlan({ energyKwh: event.target.value })} step="0.01" value={technicalPlan.energyKwh ?? ""} />
            </Field>
            <Field label="Horas por persona">
              <FormattedNumberInput min={0} onChange={(event) => updateTechnicalPlan({ laborHours: event.target.value })} step="0.25" value={technicalPlan.laborHours ?? ""} />
            </Field>
            <p className="sm:col-span-2 text-xs leading-5 text-app-muted">Si configuras sus tarifas en Inventario, estos valores generan costos automáticos al completar la actividad.</p>
          </div>
          {activityType === "riego" ? (
            <div className="grid gap-4 border-t border-app-border pt-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Duración planeada (min)">
                <FormattedNumberInput min={1} onChange={(event) => updateTechnicalPlan({ plannedDurationMin: event.target.value })} value={technicalPlan.plannedDurationMin ?? ""} />
              </Field>
              <Field label="Litros planeados">
                <FormattedNumberInput min={0} onChange={(event) => updateTechnicalPlan({ plannedLiters: event.target.value })} step="0.01" value={technicalPlan.plannedLiters ?? ""} />
              </Field>
              <Field label="Sector o válvula">
                <TextInput onChange={(event) => updateTechnicalPlan({ sector: event.target.value })} value={technicalPlan.sector ?? ""} />
              </Field>
              <Field label="pH objetivo">
                <TextInput onChange={(event) => updateTechnicalPlan({ targetPh: event.target.value })} step="0.1" type="number" value={technicalPlan.targetPh ?? ""} />
              </Field>
              <Field label="CE objetivo">
                <TextInput onChange={(event) => updateTechnicalPlan({ targetEc: event.target.value })} step="0.1" type="number" value={technicalPlan.targetEc ?? ""} />
              </Field>
            </div>
          ) : null}
          {activityType === "fertirriego" || activityType === "fertilizacion" ? (
            <div className="grid gap-4 border-t border-app-border pt-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Método">
                <SelectInput
                  onChange={(event) => updateTechnicalPlan({ method: event.target.value as NutritionRecord["method"] })}
                  value={technicalPlan.method ?? "Fertirriego"}
                >
                  {Object.keys(nutritionMethodToDb).map((method) => <option key={method}>{method}</option>)}
                </SelectInput>
              </Field>
              <Field label="Objetivo">
                <SelectInput
                  onChange={(event) => updateTechnicalPlan({ objective: event.target.value as NutritionRecord["objective"] })}
                  value={technicalPlan.objective ?? "Desarrollo"}
                >
                  {Object.keys(nutritionObjectiveToDb).map((objective) => <option key={objective}>{objective}</option>)}
                </SelectInput>
              </Field>
              <Field label="pH objetivo">
                <TextInput onChange={(event) => updateTechnicalPlan({ targetPh: event.target.value })} step="0.1" type="number" value={technicalPlan.targetPh ?? ""} />
              </Field>
              <Field label="CE objetivo">
                <TextInput onChange={(event) => updateTechnicalPlan({ targetEc: event.target.value })} step="0.1" type="number" value={technicalPlan.targetEc ?? ""} />
              </Field>
            </div>
          ) : null}
          {activityType === "aplicacion_foliar" ? (
            <Field className="border-t border-app-border pt-4 sm:col-span-2" label="Área planeada">
              <TextInput onChange={(event) => updateTechnicalPlan({ appliedArea: event.target.value })} placeholder="Área completa o sección 1" value={technicalPlan.appliedArea ?? ""} />
            </Field>
          ) : null}
          {activityType === "tutoreo" ? (
            <div className="grid gap-4 border-t border-app-border pt-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Tipo de manejo">
                <SelectInput
                  onChange={(event) => updateTechnicalPlan({ rafiaWorkType: event.target.value })}
                  value={technicalPlan.rafiaWorkType ?? "Enredado"}
                >
                  {rafiaWorkTypes.map((item) => <option key={item}>{item}</option>)}
                </SelectInput>
              </Field>
              <Field label="Sector o módulo">
                <TextInput
                  onChange={(event) => updateTechnicalPlan({ rafiaSector: event.target.value })}
                  placeholder="Sector 1, módulo A o línea 3"
                  value={technicalPlan.rafiaSector ?? ""}
                />
              </Field>
            </div>
          ) : null}
          {activityType === "mantenimiento" ? (
            <div className="grid gap-4 border-t border-app-border pt-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Tipo de mantenimiento">
                <SelectInput
                  onChange={(event) => updateTechnicalPlan({ maintenanceWorkType: event.target.value })}
                  value={technicalPlan.maintenanceWorkType ?? "Sistema de riego"}
                >
                  {maintenanceWorkTypes.map((item) => <option key={item}>{item}</option>)}
                </SelectInput>
              </Field>
              <Field label="Sector o módulo">
                <TextInput
                  onChange={(event) => updateTechnicalPlan({ maintenanceSector: event.target.value })}
                  placeholder="Sector 1, módulo A o línea principal"
                  value={technicalPlan.maintenanceSector ?? ""}
                />
              </Field>
            </div>
          ) : null}
          {activityType === "preparacion_ciclo" ? (
            <div className="grid gap-4 border-t border-app-border pt-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Tipo de preparación">
                <SelectInput
                  onChange={(event) => updateTechnicalPlan({ cycleWorkType: event.target.value })}
                  value={technicalPlan.cycleWorkType ?? "Preparación de camas"}
                >
                  {cyclePreparationTypes.map((item) => <option key={item}>{item}</option>)}
                </SelectInput>
              </Field>
              <Field label="Sector o módulo">
                <TextInput
                  onChange={(event) => updateTechnicalPlan({ cycleSector: event.target.value })}
                  placeholder="Hectárea 1, cama norte o módulo B"
                  value={technicalPlan.cycleSector ?? ""}
                />
              </Field>
            </div>
          ) : null}
          {activityType === "cosecha" ? (
            <Field className="border-t border-app-border pt-4 sm:col-span-2" label="Zona de cosecha">
              <TextInput onChange={(event) => updateTechnicalPlan({ harvestZone: event.target.value })} placeholder="Área completa o sección 1" value={technicalPlan.harvestZone ?? ""} />
            </Field>
          ) : null}
        </div>

        <section className="border-t border-app-border pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Encargados</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {managers.map((manager) => {
              const checked = assigneeIds.includes(manager.id);
              return (
                <label
                  key={manager.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 border border-app-border bg-white px-3 py-2"
                >
                  <input
                    checked={checked}
                    className="h-4 w-4 accent-app-green"
                    onChange={() => setAssigneeIds((current) =>
                      checked ? current.filter((id) => id !== manager.id) : [...current, manager.id]
                    )}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-app-text">{manager.name}</span>
                    <span className="block truncate text-xs text-app-muted">{manager.email}</span>
                  </span>
                </label>
              );
            })}
            {!managers.length && !staff.length ? <p className="text-sm text-app-muted">No hay managers activos para asignar.</p> : null}
            {staff.map((person) => {
              const checked = staffAssigneeIds.includes(person.id);
              return (
                <label
                  key={person.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 border border-app-border bg-white px-3 py-2"
                >
                  <input
                    checked={checked}
                    className="h-4 w-4 accent-app-green"
                    onChange={() => setStaffAssigneeIds((current) =>
                      checked ? current.filter((id) => id !== person.id) : [...current, person.id]
                    )}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-app-text">{person.name}</span>
                    <span className="block truncate text-xs text-app-muted">{person.detail}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {productActivityTypes.includes(activityType) ? (
        <section className="border-t border-app-border pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Productos y mezcla</p>
              <p className="mt-2 text-xs text-app-muted">Busca en el catálogo completo y registra la dosis planeada.</p>
            </div>
            <Button
              className="h-8"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setMaterialRows((current) => [...current, emptyMaterial()])}
              type="button"
              variant="ghost"
            >
              Producto
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {materialRows.map((material, index) => (
              <div key={index} className="grid gap-2 border-t border-app-border pt-3 sm:grid-cols-[1.3fr_0.7fr_0.55fr_auto]">
                <ProductCatalogCombobox
                  ariaLabel={`Producto ${index + 1}`}
                  composition={material.composition}
                  productId={material.productId}
                  products={productOptions}
                  value={material.productName}
                  onChange={(selection) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? {
                      ...item,
                      productId: selection.productId,
                      productName: selection.productName,
                      composition: selection.composition
                    } : item
                  ))}
                />
                <TextInput
                  aria-label={`Dosis ${index + 1}`}
                  inputMode="decimal"
                  onChange={(event) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, dose: event.target.value } : item
                  ))}
                  placeholder="Dosis"
                  value={material.dose}
                />
                <UnitSelectInput
                  aria-label={`Unidad ${index + 1}`}
                  onChange={(event) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, unit: event.target.value } : item
                  ))}
                  value={material.unit}
                />
                <Button
                  aria-label={`Quitar producto ${index + 1}`}
                  className="h-11 w-11 px-0"
                  icon={<Minus className="h-4 w-4" />}
                  onClick={() => setMaterialRows((current) =>
                    current.length === 1 ? [emptyMaterial()] : current.filter((_, itemIndex) => itemIndex !== index)
                  )}
                  type="button"
                  variant="ghost"
                />
              </div>
            ))}
          </div>
        </section>
        ) : null}

        {formError ? <p className="text-sm text-[#8A2E2E]" role="alert">{formError}</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-app-border pt-5 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving || (!managers.length && !staff.length)} type="submit" variant="primary">
            {saving ? "Guardando..." : task ? "Guardar cambios" : "Agregar actividad"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function applicationNotesWithFollowUp(application: ApplicationExecutionDraft) {
  const followUp = [
    application.effectiveness ? `Resultado: ${application.effectiveness}` : "",
    application.reviewDate ? `Revisar: ${application.reviewDate}` : "",
    application.reapplicationDate ? `Reaplicar: ${application.reapplicationDate}` : ""
  ].filter(Boolean).join(" · ");

  return [application.notes, followUp ? `Seguimiento foliar - ${followUp}` : ""].filter(Boolean).join("\n");
}

function MoreDataDetails({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-[6px] border border-app-border/70 bg-white/40 px-3 py-2">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted transition hover:text-app-text"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", isOpen ? "rotate-90" : "rotate-0")} />
        Más datos
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          isOpen ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-app-border/70 pt-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompleteApplicationModal({
  task,
  materials,
  productOptions,
  greenhouseName,
  saving,
  error,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  materials: MaterialRow[];
  productOptions: ProductOption[];
  greenhouseName: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: ApplicationExecutionPayload) => Promise<void>;
}) {
  const [occurredAt, setOccurredAt] = useState(() => dateKey(new Date()));
  const [appliedArea, setAppliedArea] = useState("");
  const [applications, setApplications] = useState<ApplicationExecutionDraft[]>([]);
  const initializedTaskId = useRef<string | null>(null);

  useEffect(() => {
    if (!task) {
      initializedTaskId.current = null;
      return;
    }
    if (initializedTaskId.current === task.id) return;
    initializedTaskId.current = task.id;
    setOccurredAt(dateKey(new Date()));
    setAppliedArea(task.technical_plan?.appliedArea ?? "");
    setApplications(
      materials
        .slice()
        .sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0))
        .map((material) => {
          const catalogProduct = executionCatalogProduct(productOptions, material.product_id, material.product_name);
          return {
            materialId: material.id,
            productId: catalogProduct?.id ?? "",
            productName: catalogProduct?.name ?? material.product_name,
            dose: material.dose ?? "",
            unit: material.unit ?? "",
            category: applicationCategoryFromDb(catalogProduct?.category),
            composition: material.composition ?? catalogProduct?.composition ?? "",
            safetyInterval: "",
            reentryInterval: "",
            effectiveness: "",
            reviewDate: "",
            reapplicationDate: "",
            notes: material.notes ?? ""
          };
        })
    );
  }, [materials, productOptions, task]);

  const updateApplication = (index: number, patch: Partial<ApplicationExecutionDraft>) => {
    setApplications((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    ));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({
      occurredAt,
      appliedArea,
      applications
    });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} panelClassName="sm:self-start sm:mt-8" title="Confirmar aplicación realizada">
      <form className="grid gap-6" onSubmit={handleSubmit}>
        <div className="border-l-2 border-app-green pl-3">
          <p className="text-sm font-medium text-app-text">
            {task ? activityLabels[task.type] ?? "Aplicación" : "Aplicación"} · {greenhouseName}
          </p>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            Confirma solo lo necesario. La receta planeada y el resultado quedan en el Historial de Operación.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real de aplicación">
            <DatePickerInput onChange={(event) => setOccurredAt(event.target.value)} required value={occurredAt} />
          </Field>
          <Field label="Área aplicada">
            <TextInput onChange={(event) => setAppliedArea(event.target.value)} placeholder="Área completa o sección 1" value={appliedArea} />
          </Field>
        </div>

        <div className="grid gap-5 border-t border-app-border pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Productos aplicados</p>
              <p className="mt-1 text-xs text-app-muted">Busca en el catálogo completo para confirmar o sustituir productos.</p>
            </div>
            <Button
              className="h-8"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setApplications((current) => [...current, {
                materialId: `new:${crypto.randomUUID()}`,
                productId: "",
                productName: "",
                dose: "",
                unit: "",
                category: "",
                composition: "",
                safetyInterval: "",
                reentryInterval: "",
                effectiveness: "",
                reviewDate: "",
                reapplicationDate: "",
                notes: ""
              }])}
              type="button"
              variant="ghost"
            >
              Producto
            </Button>
          </div>
          {applications.map((application, index) => (
            <section key={application.materialId} className="grid gap-3 border-b border-app-border pb-5 last:border-b-0">
              <div className="grid items-start gap-3 sm:grid-cols-[1.2fr_0.65fr_0.55fr_0.9fr_auto]">
                <Field label={`Producto ${index + 1}`}>
                  <ProductCatalogCombobox
                    allowCustom={false}
                    ariaLabel={`Producto ${index + 1}`}
                    composition={application.composition}
                    onChange={(selection) => updateApplication(index, {
                      productId: selection.productId,
                      productName: selection.productName,
                      category: applicationCategoryFromDb(selection.category),
                      composition: selection.composition
                    })}
                    productId={application.productId}
                    products={productOptions}
                    required
                    value={application.productName}
                  />
                  {!application.productId ? <p className="mt-1 text-xs text-app-muted">Selecciona este producto desde el catálogo.</p> : null}
                </Field>
                <Field label="Dosis real">
                  <TextInput
                    inputMode="decimal"
                    onChange={(event) => updateApplication(index, { dose: event.target.value })}
                    required
                    value={application.dose}
                  />
                </Field>
                <Field label="Unidad">
                  <UnitSelectInput
                    onChange={(event) => updateApplication(index, { unit: event.target.value })}
                    required
                    value={application.unit}
                  />
                </Field>
                <Field label="Categoría">
                  <SelectInput
                    aria-describedby={`application-category-help-${index}`}
                    onChange={(event) => updateApplication(index, {
                      category: event.target.value as ApplicationExecutionDraft["category"]
                    })}
                    required
                    value={application.category}
                  >
                    <option value="">Selecciona el tipo</option>
                    {applicationCategories.map((category) => <option key={category}>{category}</option>)}
                  </SelectInput>
                  <span className="text-xs normal-case leading-5 tracking-normal text-app-muted" id={`application-category-help-${index}`}>
                    Se completa desde el producto y, si falta, se recordará para las próximas actividades.
                  </span>
                </Field>
                <Button
                  aria-label={`Quitar ${application.productName || `producto ${index + 1}`} de lo aplicado`}
                  className="mt-[27px] h-11 w-11 px-0"
                  icon={<Minus aria-hidden="true" className="h-4 w-4" />}
                  onClick={() => setApplications((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  title="Quitar de lo aplicado"
                  type="button"
                  variant="ghost"
                />
              </div>

              <MoreDataDetails>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Ingrediente activo o composición">
                    <TextInput
                      onChange={(event) => updateApplication(index, { composition: event.target.value })}
                      placeholder="Se llenará desde catálogo cuando esté disponible"
                      value={application.composition}
                    />
                  </Field>
                  <Field label="Intervalo de seguridad">
                    <TextInput
                      onChange={(event) => updateApplication(index, { safetyInterval: event.target.value })}
                      placeholder="Ej. 3 días"
                      value={application.safetyInterval}
                    />
                  </Field>
                  <Field label="Tiempo de reentrada">
                    <TextInput
                      onChange={(event) => updateApplication(index, { reentryInterval: event.target.value })}
                      placeholder="Ej. 12 horas"
                      value={application.reentryInterval}
                    />
                  </Field>
                  <Field label="Observaciones">
                    <TextInput
                      onChange={(event) => updateApplication(index, { notes: event.target.value })}
                      placeholder="Condición observada o comentario"
                      value={application.notes}
                    />
                  </Field>
                </div>
              </MoreDataDetails>
            </section>
          ))}
          {!applications.length ? (
            <p className="border-l-2 border-app-amber pl-3 text-sm leading-6 text-app-muted" role="status">
              No hay productos aplicados. Cierra este formulario y marca la actividad como no realizada.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-app-border pt-5 sm:flex-row sm:justify-end">
          {error ? <p className="mr-auto text-sm leading-5 text-[#8A2E2E]" role="alert">{error}</p> : null}
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving || !applications.length || applications.some((application) => !application.productName.trim() || !application.dose.trim() || !application.unit || !application.category || !application.productId)} type="submit" variant="primary">
            {saving ? "Guardando..." : "Completar y guardar registro"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteIrrigationModal({
  task,
  greenhouseName,
  saving,
  error,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  greenhouseName: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: IrrigationExecutionPayload) => Promise<void>;
}) {
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({
      date: String(form.get("date")),
      durationMin: requiredFormNumber(form.get("durationMin")),
      liters: requiredFormNumber(form.get("liters")),
      sector: String(form.get("sector") ?? ""),
      ph: optionalFormNumber(form.get("ph")),
      ec: optionalFormNumber(form.get("ec")),
      notes: String(form.get("notes") ?? "")
    });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} panelClassName="sm:self-start sm:mt-8" title="Confirmar riego realizado">
      <form className="grid gap-5" key={task?.id ?? "irrigation-completion"} onSubmit={handleSubmit}>
        <div className="border-l-2 border-app-green pl-3">
          <p className="text-sm font-medium text-app-text">Riego · {greenhouseName}</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">Confirma fecha, duración y volumen aplicado.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real"><DatePickerInput name="date" required defaultValue={dateKey(new Date())} /></Field>
          <Field label="Duración min"><FormattedNumberInput min={1} name="durationMin" required defaultValue={task?.technical_plan?.plannedDurationMin ?? ""} /></Field>
          <Field label="Litros estimados"><FormattedNumberInput min={0.01} name="liters" required step="0.01" defaultValue={task?.technical_plan?.plannedLiters ?? ""} /></Field>
          <Field label="Sector o válvula"><TextInput name="sector" defaultValue={task?.technical_plan?.sector ?? ""} /></Field>
        </div>
        <MoreDataDetails>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="pH"><TextInput name="ph" step="0.1" type="number" defaultValue={task?.technical_plan?.targetPh ?? ""} /></Field>
            <Field label="CE"><TextInput name="ec" step="0.1" type="number" defaultValue={task?.technical_plan?.targetEc ?? ""} /></Field>
            <Field className="sm:col-span-2" label="Observaciones"><TextArea name="notes" defaultValue={task?.instructions ?? ""} /></Field>
          </div>
        </MoreDataDetails>
        <div className="flex justify-end gap-2 border-t border-app-border pt-5">
          {error ? <p className="mr-auto text-sm leading-5 text-[#8A2E2E]" role="alert">{error}</p> : null}
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando..." : "Completar y guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteNutritionModal({
  task,
  materials,
  productOptions,
  greenhouseName,
  saving,
  error,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  materials: MaterialRow[];
  productOptions: ProductOption[];
  greenhouseName: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: NutritionExecutionPayload) => Promise<void>;
}) {
  const [products, setProducts] = useState<NutritionExecutionDraft[]>([]);
  const initializedTaskId = useRef<string | null>(null);

  useEffect(() => {
    if (!task) {
      initializedTaskId.current = null;
      return;
    }
    if (initializedTaskId.current === task.id) return;
    initializedTaskId.current = task.id;
    setProducts(materials.slice().sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0)).map((material) => {
      const catalogProduct = executionCatalogProduct(productOptions, material.product_id, material.product_name);
      return {
        materialId: material.id,
        productId: catalogProduct?.id ?? "",
        productName: catalogProduct?.name ?? material.product_name,
        composition: material.composition ?? catalogProduct?.composition ?? "",
        dose: material.dose ?? "",
        unit: material.unit ?? ""
      };
    }));
  }, [materials, productOptions, task]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({
      date: String(form.get("date")),
      method: String(form.get("method")) as NutritionRecord["method"],
      objective: String(form.get("objective")) as NutritionRecord["objective"],
      ph: optionalFormNumber(form.get("ph")),
      ec: optionalFormNumber(form.get("ec")),
      notes: String(form.get("notes") ?? ""),
      products
    });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} panelClassName="sm:self-start sm:mt-8" title="Confirmar nutrición realizada">
      <form className="grid gap-5" key={task?.id ?? "nutrition-completion"} onSubmit={handleSubmit}>
        <div className="border-l-2 border-app-green pl-3">
          <p className="text-sm font-medium text-app-text">Nutrición · {greenhouseName}</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">Confirma productos, dosis y método real aplicado.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real"><DatePickerInput name="date" required defaultValue={dateKey(new Date())} /></Field>
          <Field label="Método">
            <SelectInput name="method" defaultValue={task?.technical_plan?.method ?? "Fertirriego"}>
              {Object.keys(nutritionMethodToDb).map((method) => <option key={method}>{method}</option>)}
            </SelectInput>
          </Field>
        </div>
        <div className="grid gap-3 border-t border-app-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Productos aplicados</p>
              <p className="mt-1 text-xs text-app-muted">Busca en el catálogo completo para confirmar o sustituir productos.</p>
            </div>
            <Button
              className="h-8"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setProducts((current) => [...current, {
                materialId: `new:${crypto.randomUUID()}`,
                productId: "",
                productName: "",
                composition: "",
                dose: "",
                unit: ""
              }])}
              type="button"
              variant="ghost"
            >
              Producto
            </Button>
          </div>
          {products.map((product, index) => (
            <div key={product.materialId} className="grid items-start gap-2 sm:grid-cols-[1.2fr_0.65fr_0.55fr_auto]">
              <Field label={`Producto ${index + 1}`}>
                <ProductCatalogCombobox
                  allowCustom={false}
                  ariaLabel={`Producto ${index + 1}`}
                  composition={product.composition}
                  onChange={(selection) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? {
                    ...item,
                    productId: selection.productId,
                    productName: selection.productName,
                    composition: selection.composition
                  } : item))}
                  productId={product.productId}
                  products={productOptions}
                  required
                  value={product.productName}
                />
                {!product.productId ? <p className="mt-1 text-xs text-app-muted">Selecciona este producto desde el catálogo.</p> : null}
              </Field>
              <Field label="Dosis real">
                <TextInput
                  inputMode="decimal"
                  onChange={(event) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dose: event.target.value } : item))}
                  required
                  value={product.dose}
                />
              </Field>
              <Field label="Unidad">
                <UnitSelectInput
                  onChange={(event) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item))}
                  required
                  value={product.unit}
                />
              </Field>
              <Button
                aria-label={`Quitar ${product.productName || `producto ${index + 1}`} de lo aplicado`}
                className="mt-[27px] h-11 w-11 px-0"
                icon={<Minus aria-hidden="true" className="h-4 w-4" />}
                onClick={() => setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                title="Quitar de lo aplicado"
                type="button"
                variant="ghost"
              />
            </div>
          ))}
          {!products.length ? (
            <p className="border-l-2 border-app-amber pl-3 text-sm leading-6 text-app-muted" role="status">
              No hay productos aplicados. Cierra este formulario y marca la actividad como no realizada.
            </p>
          ) : null}
        </div>
        <MoreDataDetails>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Objetivo">
              <SelectInput name="objective" defaultValue={task?.technical_plan?.objective ?? "Desarrollo"}>{Object.keys(nutritionObjectiveToDb).map((objective) => <option key={objective}>{objective}</option>)}</SelectInput>
            </Field>
            <Field label="pH"><TextInput name="ph" step="0.1" type="number" defaultValue={task?.technical_plan?.targetPh ?? ""} /></Field>
            <Field label="CE"><TextInput name="ec" step="0.1" type="number" defaultValue={task?.technical_plan?.targetEc ?? ""} /></Field>
            <Field className="sm:col-span-2" label="Observaciones"><TextArea name="notes" defaultValue={task?.instructions ?? ""} /></Field>
          </div>
        </MoreDataDetails>
        <div className="flex justify-end gap-2 border-t border-app-border pt-5">
          {error ? <p className="mr-auto text-sm leading-5 text-[#8A2E2E]" role="alert">{error}</p> : null}
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving || !products.length || products.some((product) => !product.productName.trim() || !product.dose.trim() || !product.unit || !product.productId)} type="submit" variant="primary">{saving ? "Guardando..." : "Completar y guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteHarvestModal({
  task,
  greenhouseName,
  saving,
  error,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  greenhouseName: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: HarvestExecutionPayload) => Promise<void>;
}) {
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({
      date: String(form.get("date")),
      ...harvestValuesFromForm(form),
      destination: String(form.get("destination") ?? ""),
      notes: String(form.get("notes") ?? "")
    });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} panelClassName="sm:self-start sm:mt-8" title="Confirmar cosecha realizada">
      <form className="grid gap-5" key={task?.id ?? "harvest-completion"} onSubmit={handleSubmit}>
        <div className="border-l-2 border-app-green pl-3">
          <p className="text-sm font-medium text-app-text">
            Cosecha · {greenhouseName}{task?.technical_plan?.harvestZone ? ` · ${task.technical_plan.harvestZone}` : ""}
          </p>
          <p className="mt-1 text-xs leading-5 text-app-muted">Confirma cajas, calidades y destino de salida.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real"><DatePickerInput name="date" required defaultValue={dateKey(new Date())} /></Field>
          <HarvestCaptureFields compact />
          <Field className="sm:col-span-2" label="Cliente o destino"><TextInput name="destination" /></Field>
        </div>
        <MoreDataDetails>
          <div>
            <Field label="Observaciones"><TextArea name="notes" defaultValue={task?.instructions ?? ""} /></Field>
          </div>
        </MoreDataDetails>
        <div className="flex justify-end gap-2 border-t border-app-border pt-5">
          {error ? <p className="mr-auto text-sm leading-5 text-[#8A2E2E]" role="alert">{error}</p> : null}
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando..." : "Completar y guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function WorkEvidenceModal({
  task,
  evidence,
  saving,
  onClose,
  onOpenEvidence,
  onSave
}: {
  task: OperationTaskRow | null;
  evidence: WorkEvidenceRow[];
  saving: boolean;
  onClose: () => void;
  onOpenEvidence: (evidence: WorkEvidenceRow) => void;
  onSave: (file: File, note: string) => Promise<void>;
}) {
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return;
    await onSave(file, String(form.get("note") ?? ""));
    event.currentTarget.reset();
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} title="Evidencia privada" panelClassName="sm:max-w-xl">
      <div className="grid gap-5">
        <p className="text-sm leading-6 text-app-muted">Los archivos quedan vinculados a esta actividad y sólo se abren con enlaces temporales para miembros de la empresa.</p>
        <form className="grid gap-4 border-y border-app-border py-4" onSubmit={handleSubmit}>
          <Field label="Archivo"><TextInput accept="image/jpeg,image/png,image/webp,application/pdf" name="file" required type="file" /></Field>
          <Field label="Nota (opcional)"><TextInput name="note" placeholder="Qué confirma esta evidencia" /></Field>
          <div className="flex justify-end"><Button disabled={saving} icon={<Paperclip className="h-4 w-4" />} type="submit" variant="primary">{saving ? "Subiendo..." : "Adjuntar evidencia"}</Button></div>
        </form>
        {evidence.length ? <div className="grid divide-y divide-app-border border-y border-app-border">{evidence.map((item) => <div className="flex items-center justify-between gap-4 py-3" key={item.id}><div className="min-w-0"><p className="truncate text-sm font-medium text-app-text">{item.file_name}</p><p className="mt-1 text-xs text-app-muted">{item.note || "Sin nota"} · {formatDate(item.created_at)}</p></div><Button icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => onOpenEvidence(item)} variant="ghost">Abrir</Button></div>)}</div> : <p className="text-sm text-app-muted">Aún no hay evidencia adjunta.</p>}
        <div className="flex justify-end"><Button onClick={onClose} type="button" variant="secondary">Cerrar</Button></div>
      </div>
    </Modal>
  );
}

function CompleteWorkModal({
  task,
  saving,
  error,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (payload: { occurredAt: string; note: string }) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => dateKey(new Date()));

  useEffect(() => {
    setNote("");
    setOccurredAt(dateKey(new Date()));
  }, [task?.id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({ occurredAt, note: note.trim() });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} title="Registrar actividad realizada">
      <form className="grid gap-5" key={task?.id ?? "complete-work"} onSubmit={handleSubmit}>
        <div>
          <p className="text-sm font-medium text-app-text">{task?.title}</p>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            Se conservará la actividad y su registro quedará en el historial operativo.
          </p>
        </div>
        <Field label="Fecha real">
          <DatePickerInput onChange={(event) => setOccurredAt(event.target.value)} required value={occurredAt} />
        </Field>
        <Field label="Nota (opcional)">
          <TextArea
            autoFocus
            onChange={(event) => setNote(event.target.value)}
            placeholder="Agrega un detalle solo si es necesario."
            value={note}
          />
        </Field>
        {error ? <p className="text-sm leading-5 text-[#8A2E2E]" role="alert">{error}</p> : null}
        <p className="text-xs leading-5 text-app-muted">Puedes adjuntar fotos o documentos desde “Evidencia” antes o después de registrarla.</p>
        <div className="flex flex-col-reverse gap-2 border-t border-app-border pt-5 sm:flex-row sm:justify-end">
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando..." : "Marcar como realizada"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function QuickCompletionModal({
  task,
  greenhouseName,
  plannedSummary,
  canUsePlan,
  unavailableReason,
  saving,
  error,
  onClose,
  onConfirm,
  onChangeDetails
}: {
  task: OperationTaskRow | null;
  greenhouseName: string;
  plannedSummary: string;
  canUsePlan: boolean;
  unavailableReason: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (occurredAt: string) => Promise<void>;
  onChangeDetails: () => void;
}) {
  const [occurredAt, setOccurredAt] = useState(() => dateKey(new Date()));

  useEffect(() => {
    setOccurredAt(dateKey(new Date()));
  }, [task?.id]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onConfirm(occurredAt);
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} panelClassName="sm:max-w-xl" title="Registrar actividad realizada">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="border-l-2 border-app-green pl-3">
          <p className="text-sm font-medium text-app-text">{task?.title}</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">{greenhouseName} · {task ? activityLabel(task) : "Actividad"}</p>
        </div>

        {plannedSummary ? (
          <div className="rounded-xl border border-app-border bg-app-sidebar px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">Datos planeados</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-app-text">{plannedSummary}</p>
          </div>
        ) : null}

        {canUsePlan ? (
          <Field label="Fecha real">
            <DatePickerInput onChange={(event) => setOccurredAt(event.target.value)} required value={occurredAt} />
          </Field>
        ) : (
          <p className="rounded-xl border border-[#E8D2A8] bg-[#FFF9ED] px-4 py-3 text-sm leading-6 text-[#765116]">
            {unavailableReason}
          </p>
        )}

        {error ? <p className="text-sm leading-5 text-[#8A2E2E]" role="alert">{error}</p> : null}

        <div className="flex flex-col-reverse gap-2 border-t border-app-border pt-5 sm:flex-row sm:justify-end">
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving} onClick={onChangeDetails} type="button" variant="secondary">
            {canUsePlan ? "Cambiar datos" : "Completar datos"}
          </Button>
          {canUsePlan ? (
            <Button disabled={saving} icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />} type="submit" variant="primary">
              {saving ? "Guardando..." : "Guardar como se planeó"}
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

export function OperationsSection({
  copilotInsights = [],
  operationRefreshKey = 0,
  pendingCompletionTask,
  onPendingCompletionConsumed,
  pendingOpenWork,
  onPendingOpenWorkConsumed,
  onCreateCopilotTask,
  onPrepareCopilotMessage,
  weekStart: routeWeekStart,
  initialView,
  onWeekStartChange,
  onViewChange,
  workTypeFilter,
  specialtyLabel
}: {
  copilotInsights?: CopilotInsight[];
  operationRefreshKey?: number;
  pendingCompletionTask?: { id: string; date: string } | null;
  onPendingCompletionConsumed?: () => void;
  pendingOpenWork?: { id: string; intent: "details" | "evidence" } | null;
  onPendingOpenWorkConsumed?: () => void;
  onCreateCopilotTask?: (insight: CopilotInsight) => void;
  onPrepareCopilotMessage?: (insight: CopilotInsight) => void;
  weekStart?: string;
  initialView?: OperationView;
  onWeekStartChange?: (weekStart: string) => void;
  onViewChange?: (view: OperationView) => void;
  workTypeFilter?: string[];
  specialtyLabel?: string;
}) {
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const crops = useGreenhouseStore((state) => state.crops);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const addApplicationRecords = useGreenhouseStore((state) => state.addApplicationRecords);
  const addIrrigation = useGreenhouseStore((state) => state.addIrrigation);
  const addNutrition = useGreenhouseStore((state) => state.addNutrition);
  const addHarvest = useGreenhouseStore((state) => state.addHarvest);
  const openModal = useGreenhouseStore((state) => state.openModal);
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek());
  const [plan, setPlan] = useState<WeeklyPlanRow | null>(null);
  const [tasks, setTasks] = useState<OperationTaskRow[]>([]);
  const [historyTasks, setHistoryTasks] = useState<OperationTaskRow[]>([]);
  const [historyResultsByTaskId, setHistoryResultsByTaskId] = useState<Record<string, HistoryTechnicalResult[]>>({});
  const [evidence, setEvidence] = useState<WorkEvidenceRow[]>([]);
  const [historyEvidence, setHistoryEvidence] = useState<WorkEvidenceRow[]>([]);
  const [workEvents, setWorkEvents] = useState<WorkEventRow[]>([]);
  const [agentDispatches, setAgentDispatches] = useState<AgentDispatchRow[]>([]);
  const [historyWorkEvents, setHistoryWorkEvents] = useState<WorkEventRow[]>([]);
  const [auditActorNames, setAuditActorNames] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignmentRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [operationGreenhouses, setOperationGreenhouses] = useState<OperationGreenhouseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dispatchingGrok, setDispatchingGrok] = useState(false);
  const [notice, setNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [applicationTask, setApplicationTask] = useState<OperationTaskRow | null>(null);
  const [irrigationTask, setIrrigationTask] = useState<OperationTaskRow | null>(null);
  const [nutritionTask, setNutritionTask] = useState<OperationTaskRow | null>(null);
  const [harvestTask, setHarvestTask] = useState<OperationTaskRow | null>(null);
  const [editingTask, setEditingTask] = useState<OperationTaskRow | null>(null);
  const [blockedTask, setBlockedTask] = useState<OperationTaskRow | null>(null);
  const [blockedReason, setBlockedReason] = useState("");
  const [notPerformedTask, setNotPerformedTask] = useState<OperationTaskRow | null>(null);
  const [notPerformedReason, setNotPerformedReason] = useState("");
  const [reopenTask, setReopenTask] = useState<OperationTaskRow | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [completionTask, setCompletionTask] = useState<OperationTaskRow | null>(null);
  const [quickCompletionTask, setQuickCompletionTask] = useState<OperationTaskRow | null>(null);
  const [completionError, setCompletionError] = useState("");
  const [undoCompletionTask, setUndoCompletionTask] = useState<OperationTaskRow | null>(null);
  const [evidenceTask, setEvidenceTask] = useState<OperationTaskRow | null>(null);
  const [operationView, setOperationView] = useState<OperationView>("calendar");
  const [overdueExpanded, setOverdueExpanded] = useState(false);
  const [dismissedCopilotIds, setDismissedCopilotIds] = useState<string[]>([]);
  const [historyTypeFilter, setHistoryTypeFilter] = useState<HistoryTechnicalKind | "all">("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [planningMenuOpen, setPlanningMenuOpen] = useState(false);
  const [completedActivityChooserOpen, setCompletedActivityChooserOpen] = useState(false);
  const planningMenuRef = useRef<HTMLDivElement>(null);

  const canPlan = currentUser.role === "owner" || currentUser.role === "admin";
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekStartKey = dateKey(weekStart);
  const weekEndKey = dateKey(weekDays[6]);
  const todayKey = dateKey(new Date());

  useEffect(() => {
    if (!routeWeekStart) return;
    const targetWeekStart = startOfIsoWeek(dateFromKey(routeWeekStart));
    const targetWeekStartKey = dateKey(targetWeekStart);
    if (targetWeekStartKey !== weekStartKey) {
      setWeekStart(targetWeekStart);
    }
  }, [routeWeekStart, weekStartKey]);

  useEffect(() => {
    if (initialView) setOperationView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (!planningMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!planningMenuRef.current?.contains(event.target as Node)) setPlanningMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlanningMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [planningMenuOpen]);

  const selectOperationView = (view: OperationView) => {
    setOperationView(view);
    onViewChange?.(view);
  };

  useEffect(() => {
    if (!pendingCompletionTask?.date) return;
    const targetWeekStart = startOfIsoWeek(dateFromKey(pendingCompletionTask.date));
    const targetWeekStartKey = dateKey(targetWeekStart);
    if (targetWeekStartKey !== weekStartKey) {
      setWeekStart(targetWeekStart);
    }
  }, [pendingCompletionTask?.date, weekStartKey]);

  const loadOperations = useCallback(async (silent = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;

    if (!silent) setLoading(true);
    setSetupRequired(false);
    let tasksQuery = supabase
      .from("tasks")
      .select("id, weekly_plan_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, priority, instructions, execution_mode, crew_size, blocked_reason, origin, occurred_at, completed_at, verified_at, verification_required, technical_plan")
      .eq("company_id", organization.id)
      .or(`and(scheduled_date.gte.${weekStartKey},scheduled_date.lte.${weekEndKey}),and(scheduled_date.lt.${todayKey},status.in.(pendiente,en_progreso,bloqueada)),and(status.eq.completada,verification_required.eq.true)`)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true });

    if (selectedGreenhouseId !== "__all__") {
      tasksQuery = tasksQuery.eq("greenhouse_id", selectedGreenhouseId);
    }

    const [planResponse, tasksResponse, membersResponse, staffResponse, productsResponse] = await Promise.all([
      supabase
        .from("weekly_plans")
        .select("id, week_start, status, published_at")
        .eq("company_id", organization.id)
        .eq("week_start", weekStartKey)
        .maybeSingle(),
      tasksQuery,
      supabase
        .from("company_members")
        .select("user_id, role")
        .eq("company_id", organization.id)
        .eq("status", "active"),
      supabase
        .from("company_staff")
        .select("id, full_name, phone")
        .eq("company_id", organization.id)
        .eq("role", "manager")
        .eq("status", "active")
        .order("full_name", { ascending: true }),
      supabase
        .from("products")
        .select("id, name, category, composition")
        .eq("company_id", organization.id)
        .order("name", { ascending: true })
    ]);

    const baseError = planResponse.error ?? tasksResponse.error ?? membersResponse.error ?? staffResponse.error ?? productsResponse.error;
    if (baseError) {
      setSetupRequired(isOperationsSetupError(baseError));
      setNotice({ tone: "red", message: appErrorMessage(baseError, "No se pudo cargar la operación semanal.") });
      if (!silent) setLoading(false);
      return;
    }

    const taskRows = (tasksResponse.data ?? []) as OperationTaskRow[];
    const taskIds = taskRows.map((task) => task.id);
    const taskGreenhouseIds = Array.from(new Set(taskRows.map((task) => task.greenhouse_id).filter(Boolean)));
    const activeMembers = (membersResponse.data ?? []) as Array<{ user_id: string | null; role: string }>;
    const memberUserIds = activeMembers
      .map((member: any) => member.user_id)
      .filter((id: string | null): id is string => Boolean(id));
    const managerIds = activeMembers
      .filter((member) => member.role === "manager")
      .map((member) => member.user_id)
      .filter((id): id is string => Boolean(id));

    const [assignmentsResponse, staffAssignmentsResponse, materialsResponse, profilesResponse, greenhousesResponse, evidenceResponse, eventsResponse, agentDispatchesResponse] = await Promise.all([
      taskIds.length
        ? supabase.from("task_assignments").select("id, task_id, user_id").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("task_staff_assignments").select("id, task_id, staff_id").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("task_materials").select("id, task_id, product_id, product_name, composition, dose, unit, mixing_order, notes").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      memberUserIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", memberUserIds)
        : Promise.resolve({ data: [], error: null }),
      taskGreenhouseIds.length
        ? supabase.from("greenhouses").select("id, name").eq("company_id", organization.id).in("id", taskGreenhouseIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("work_evidence").select("id, work_id, storage_path, file_name, mime_type, file_size_bytes, note, created_by, created_at").in("work_id", taskIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("work_events").select("id, work_id, actor_user_id, actor_staff_id, update_type, note, metadata, created_at").in("work_id", taskIds).order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase
            .from("agent_dispatches")
            .select("work_id, recipient_user_id, recipient_staff_id, status, last_error, created_at")
            .in("work_id", taskIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null })
    ]);

    const detailError = assignmentsResponse.error ?? staffAssignmentsResponse.error ?? materialsResponse.error ?? profilesResponse.error ?? greenhousesResponse.error ?? evidenceResponse.error ?? eventsResponse.error ?? agentDispatchesResponse.error;
    if (detailError) {
      setNotice({ tone: "red", message: appErrorMessage(detailError, "Faltan detalles de algunas actividades.") });
    }

    const profileMap = new Map((profilesResponse.data ?? []).map((profile: any) => [profile.id, profile]));
    setPlan((planResponse.data as WeeklyPlanRow | null) ?? null);
    setTasks(taskRows);
    setAssignments((assignmentsResponse.data ?? []) as AssignmentRow[]);
    setStaffAssignments((staffAssignmentsResponse.data ?? []) as StaffAssignmentRow[]);
    setMaterials((materialsResponse.data ?? []) as MaterialRow[]);
    setEvidence((evidenceResponse.data ?? []) as WorkEvidenceRow[]);
    setWorkEvents((eventsResponse.data ?? []) as WorkEventRow[]);
    setAgentDispatches((agentDispatchesResponse.data ?? []) as AgentDispatchRow[]);
    setAuditActorNames(Object.fromEntries((profilesResponse.data ?? []).map((profile: any) => [
      profile.id,
      profile.full_name ?? profile.email?.split("@")[0] ?? "Miembro del equipo"
    ])));
    setProductOptions((productsResponse.data ?? []) as ProductOption[]);
    setOperationGreenhouses((greenhousesResponse.data ?? []) as OperationGreenhouseOption[]);
    setManagers(managerIds.map((id) => {
      const profile = profileMap.get(id);
      return {
        id,
        name: profile?.full_name ?? profile?.email?.split("@")[0] ?? "Encargado",
        email: profile?.email ?? ""
      };
    }));
    setStaff((staffResponse.data ?? []).map((person: any) => ({
      id: person.id,
      name: person.full_name,
      detail: person.phone ?? "Sin cuenta"
    })));
    if (!silent) setLoading(false);
  }, [organization.id, selectedGreenhouseId, todayKey, weekEndKey, weekStartKey]);

  const loadWorkHistory = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;

    setHistoryLoading(true);
    let tasksQuery = supabase
      .from("tasks")
      .select("id, weekly_plan_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, priority, instructions, execution_mode, crew_size, blocked_reason, origin, occurred_at, completed_at, verified_at, verification_required, technical_plan")
      .eq("company_id", organization.id)
      .or("status.in.(verificada,cancelada),and(status.eq.completada,verification_required.eq.false)")
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("scheduled_date", { ascending: false })
      .limit(200);

    if (selectedGreenhouseId !== "__all__") {
      tasksQuery = tasksQuery.eq("greenhouse_id", selectedGreenhouseId);
    }

    const { data: historyTaskRows, error: historyTaskError } = await tasksQuery;
    if (historyTaskError) {
      setNotice({ tone: "red", message: appErrorMessage(historyTaskError, "No se pudo cargar el historial operativo.") });
      setHistoryLoading(false);
      return;
    }

    const workRows = (historyTaskRows ?? []) as OperationTaskRow[];
    const workIds = workRows.map((task) => task.id);
    if (!workIds.length) {
      setHistoryTasks([]);
      setHistoryResultsByTaskId({});
      setHistoryEvidence([]);
      setHistoryWorkEvents([]);
      setHistoryLoading(false);
      return;
    }

    const [irrigationResponse, nutritionResponse, applicationsResponse, harvestResponse, evidenceResponse, eventsResponse] = await Promise.all([
      supabase
        .from("irrigation_records")
        .select("source_task_id, occurred_at, duration_min, estimated_liters, sector, ph, ec")
        .in("source_task_id", workIds),
      supabase
        .from("nutrition_records")
        .select("source_task_id, occurred_at, product_name, dose, method, ph, ec")
        .in("source_task_id", workIds),
      supabase
        .from("application_records")
        .select("source_task_id, occurred_at, product_name, dose, applied_area")
        .in("source_task_id", workIds),
      supabase
        .from("harvest_records")
        .select("source_task_id, occurred_at, kilograms, box_count, destination")
        .in("source_task_id", workIds),
      supabase
        .from("work_evidence")
        .select("id, work_id, storage_path, file_name, mime_type, file_size_bytes, note, created_by, created_at")
        .in("work_id", workIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("work_events")
        .select("id, work_id, actor_user_id, actor_staff_id, update_type, note, metadata, created_at")
        .in("work_id", workIds)
        .order("created_at", { ascending: true })
    ]);

    const detailError = irrigationResponse.error
      ?? nutritionResponse.error
      ?? applicationsResponse.error
      ?? harvestResponse.error
      ?? evidenceResponse.error
      ?? eventsResponse.error;
    if (detailError) {
      setNotice({ tone: "red", message: appErrorMessage(detailError, "No se pudieron cargar todos los resultados técnicos.") });
    }

    const resultsByTaskId: Record<string, HistoryTechnicalResult[]> = {};
    const addResult = (taskId: string | null, result: HistoryTechnicalResult) => {
      if (!taskId) return;
      resultsByTaskId[taskId] = [...(resultsByTaskId[taskId] ?? []), result];
    };

    (irrigationResponse.data ?? []).forEach((record: any) => {
      addResult(record.source_task_id, {
        kind: "riego",
        label: "Riego ejecutado",
        detail: [
          record.duration_min != null ? `${record.duration_min} min` : "",
          record.estimated_liters != null ? `${record.estimated_liters} L` : "",
          record.sector,
          record.ph != null ? `pH ${record.ph}` : "",
          record.ec != null ? `CE ${record.ec}` : ""
        ].filter(Boolean).join(" · "),
        occurredAt: record.occurred_at
      });
    });

    (nutritionResponse.data ?? []).forEach((record: any) => {
      addResult(record.source_task_id, {
        kind: "nutricion",
        label: "Nutrición ejecutada",
        detail: [
          [record.product_name, record.dose].filter(Boolean).join(" · "),
          record.method,
          record.ph != null ? `pH ${record.ph}` : "",
          record.ec != null ? `CE ${record.ec}` : ""
        ].filter(Boolean).join(" · "),
        occurredAt: record.occurred_at
      });
    });

    (applicationsResponse.data ?? []).forEach((record: any) => {
      addResult(record.source_task_id, {
        kind: "aplicaciones",
        label: "Aplicación ejecutada",
        detail: [[record.product_name, record.dose].filter(Boolean).join(" · "), record.applied_area].filter(Boolean).join(" · "),
        occurredAt: record.occurred_at
      });
    });

    (harvestResponse.data ?? []).forEach((record: any) => {
      addResult(record.source_task_id, {
        kind: "cosecha",
        label: "Cosecha registrada",
        detail: [
          record.kilograms != null ? `${record.kilograms} kg` : "",
          record.box_count != null ? `${record.box_count} cajas` : "",
          record.destination
        ].filter(Boolean).join(" · "),
        occurredAt: record.occurred_at
      });
    });

    setHistoryTasks(workRows);
    setHistoryResultsByTaskId(resultsByTaskId);
    setHistoryEvidence((evidenceResponse.data ?? []) as WorkEvidenceRow[]);
    setHistoryWorkEvents((eventsResponse.data ?? []) as WorkEventRow[]);
    setHistoryLoading(false);
  }, [organization.id, selectedGreenhouseId]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations, operationRefreshKey]);

  useEffect(() => {
    let refreshing = false;
    const refreshFromAgent = async () => {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      try {
        await loadOperations(true);
      } finally {
        refreshing = false;
      }
    };
    const intervalId = window.setInterval(refreshFromAgent, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadOperations]);

  useEffect(() => {
    if (operationView !== "history") return;
    void loadWorkHistory();
  }, [loadWorkHistory, operationRefreshKey, operationView]);

  const assignmentsForTask = (taskId: string) => assignments.filter((item) => item.task_id === taskId);
  const staffAssignmentsForTask = (taskId: string) => staffAssignments.filter((item) => item.task_id === taskId);
  const materialsForTask = (taskId: string) => materials.filter((item) => item.task_id === taskId);
  const eventsForTask = (taskId: string) => [...workEvents, ...historyWorkEvents].filter((item) => item.work_id === taskId);
  const managerName = (userId: string) => managers.find((manager) => manager.id === userId)?.name ?? "Encargado";
  const staffName = (staffId: string) => staff.find((person) => person.id === staffId)?.name ?? "Encargado";
  const auditActorName = (userId: string | null, staffId?: string | null) => {
    if (userId) return auditActorNames[userId] ?? "Miembro del equipo";
    if (staffId) return staffName(staffId);
    return "Sistema";
  };
  const greenhouseName = (greenhouseId: string) =>
    (greenhouses.find((item) => item.id === greenhouseId)
      ? greenhouseDisplayName(greenhouses.find((item) => item.id === greenhouseId)!, crops)
      : operationGreenhouses.find((item) => item.id === greenhouseId)?.name) ??
    "Área productiva";
  const deliveryStateForTask = (taskId: string) => {
    const latestByRecipient = new Map<string, AgentDispatchRow>();
    for (const dispatch of agentDispatches.filter((item) => item.work_id === taskId)) {
      const key = dispatch.recipient_user_id
        ? `user:${dispatch.recipient_user_id}`
        : `staff:${dispatch.recipient_staff_id}`;
      if (!latestByRecipient.has(key)) latestByRecipient.set(key, dispatch);
    }
    const latest = Array.from(latestByRecipient.values());
    if (!latest.length) return { confirmed: false, label: "Sin enviar", tone: "amber" as const };
    if (latest.some((dispatch) => dispatch.status === "failed")) {
      return { confirmed: false, label: "Falló WhatsApp", tone: "red" as const };
    }
    const confirmedStatuses = new Set(["sent", "responded", "completed", "blocked"]);
    if (latest.every((dispatch) => confirmedStatuses.has(dispatch.status))) {
      return { confirmed: true, label: "WhatsApp enviado", tone: "green" as const };
    }
    return { confirmed: false, label: "En proceso", tone: "amber" as const };
  };

  const ensureMaterialProducts = async (supabase: ReturnType<typeof getSupabaseBrowserClient>, draftMaterials: MaterialDraft[]) => {
    if (!supabase || !organization.id) return draftMaterials;

    const addedProducts: ProductOption[] = [];
    const resolvedMaterials: MaterialDraft[] = [];

    for (const material of draftMaterials) {
      const productName = material.productName.trim();
      if (!productName || material.productId) {
        resolvedMaterials.push(material);
        continue;
      }

      const existingProduct = [...productOptions, ...addedProducts]
        .find((product) => normalizedProductName(product.name) === normalizedProductName(productName));
      if (existingProduct) {
        resolvedMaterials.push({
          ...material,
          productId: existingProduct.id,
          productName: existingProduct.name,
          composition: existingProduct.composition ?? ""
        });
        continue;
      }

      const { data, error } = await supabase
        .from("products")
        .insert({
          company_id: organization.id,
          name: productName,
          composition: material.composition.trim() || null
        })
        .select("id, name, composition")
        .single();

      if (error || !data) {
        resolvedMaterials.push(material);
        continue;
      }

      const newProduct = data as ProductOption;
      addedProducts.push(newProduct);
      resolvedMaterials.push({
        ...material,
        productId: newProduct.id,
        productName: newProduct.name,
        composition: newProduct.composition ?? ""
      });
    }

    if (addedProducts.length) {
      setProductOptions((current) => [...current, ...addedProducts].sort((a, b) => a.name.localeCompare(b.name, "es-MX")));
    }

    return resolvedMaterials;
  };

  const saveActivity = async (payload: ActivityPayload) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSaving(true);
    setNotice(null);
    try {
      const resolvedMaterials = await ensureMaterialProducts(supabase, payload.materials);
      const rpcName = editingTask ? "update_operational_task_with_staff" : "create_operational_task_with_staff";
      const rpcPayload = editingTask
        ? {
            target_task_id: editingTask.id,
            target_greenhouse_id: payload.greenhouseId,
            target_type: payload.type,
            target_title: payload.title,
            target_scheduled_date: payload.scheduledDate,
            target_scheduled_time: payload.scheduledTime || null,
            target_priority: payload.priority,
            target_instructions: payload.instructions || null,
            target_execution_mode: payload.executionMode,
            target_crew_size: payload.crewSize,
            target_assignee_ids: payload.assigneeIds,
            target_staff_assignee_ids: payload.staffAssigneeIds,
            target_materials: resolvedMaterials.map((material, index) => ({ ...material, mixingOrder: index + 1 })),
            target_technical_plan: payload.technicalPlan
          }
        : {
            target_company_id: organization.id,
            target_week_start: weekStartKey,
            target_greenhouse_id: payload.greenhouseId,
            target_type: payload.type,
            target_title: payload.title,
            target_scheduled_date: payload.scheduledDate,
            target_scheduled_time: payload.scheduledTime || null,
            target_priority: payload.priority,
            target_instructions: payload.instructions || null,
            target_execution_mode: payload.executionMode,
            target_crew_size: payload.crewSize,
            target_assignee_ids: payload.assigneeIds,
            target_staff_assignee_ids: payload.staffAssigneeIds,
            target_materials: resolvedMaterials.map((material, index) => ({ ...material, mixingOrder: index + 1 })),
            target_technical_plan: payload.technicalPlan
          };
      const { data: savedTaskId, error } = await supabase.rpc(rpcName, rpcPayload);
      if (error) throw error;

      const workId = editingTask?.id ?? (typeof savedTaskId === "string" ? savedTaskId : null);
      let saveNotice: { tone: "green" | "red"; message: string } = {
        tone: "green",
        message: editingTask ? "Actividad actualizada." : "Actividad agregada a la semana."
      };
      if (plan?.status === "published" && workId) {
        const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
        if (sessionError || !sessionData.session?.access_token) {
          saveNotice = { tone: "red", message: "Actividad guardada, pero la sesión venció antes de avisar a Grok." };
        } else {
          const { data: dispatchData, error: dispatchError } = await supabase.functions.invoke("grok-dispatch", {
            body: { weeklyPlanId: plan.id, taskIds: [workId] },
            headers: { Authorization: `Bearer ${sessionData.session.access_token}` }
          });
          const incomplete = Number(dispatchData?.failed ?? 0) + Number(dispatchData?.missingPhone ?? 0);
          saveNotice = dispatchError || incomplete
            ? {
                tone: "red",
                message: `Actividad guardada, pero no se notificó completamente: ${dispatchError ? await grokInvokeErrorMessage(dispatchError, "revisa la conexión con Grok.") : grokDispatchMessage(dispatchData)}`
              }
            : { tone: "green", message: `Actividad guardada. ${grokDispatchMessage(dispatchData)}` };
        }
      }
      setNotice(saveNotice);
      setActivityModalOpen(false);
      setEditingTask(null);
      await loadOperations();
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo guardar la actividad.") });
    } finally {
      setSaving(false);
    }
  };

  const publishPlan = async () => {
    if (!plan) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setPublishing(true);
    setNotice(null);
    try {
      const { error } = await supabase.rpc("publish_weekly_plan", { target_plan_id: plan.id });
      if (error) throw error;

      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !sessionData.session?.access_token) throw sessionError ?? new Error("not_authenticated");

      const { data, error: dispatchError } = await supabase.functions.invoke("grok-dispatch", {
        body: { weeklyPlanId: plan.id },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` }
      });

      const incomplete = Number(data?.failed ?? 0) + Number(data?.missingPhone ?? 0);
      if (dispatchError || incomplete) {
        setNotice({
          tone: "red",
          message: `Semana publicada, pero no se notificó completamente: ${dispatchError ? await grokInvokeErrorMessage(dispatchError, "revisa la conexión con Grok.") : grokDispatchMessage(data)}`
        });
      } else {
        setNotice({ tone: "green", message: `Semana publicada. ${grokDispatchMessage(data)}` });
      }
      await loadOperations();
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo publicar la semana.") });
    } finally {
      setPublishing(false);
    }
  };

  const resendActiveGrokForPlan = async () => {
    if (!plan) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setDispatchingGrok(true);
    setNotice(null);
    const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
    if (sessionError || !sessionData.session?.access_token) {
      setDispatchingGrok(false);
      setNotice({ tone: "red", message: appErrorMessage(sessionError, "Tu sesión expiró. Vuelve a iniciar sesión.") });
      return;
    }

    const { data, error } = await supabase.functions.invoke("grok-dispatch", {
      body: { weeklyPlanId: plan.id, mode: "active" },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` }
    });
    setDispatchingGrok(false);

    if (error) {
      setNotice({ tone: "red", message: await grokInvokeErrorMessage(error, "No se pudieron reenviar las actividades activas.") });
      return;
    }

    const incomplete = Number(data?.failed ?? 0) + Number(data?.missingPhone ?? 0);
    setNotice({ tone: incomplete ? "red" : "green", message: grokDispatchMessage(data) });
    await loadOperations();
  };

  const openCompletionDetails = useCallback(async (task: OperationTaskRow, completion?: { occurredAt: string; note: string }) => {
    if (task.type === "aplicacion_foliar") {
      setApplicationTask(task);
      setCompletionError("");
      return;
    }
    if (task.type === "riego") {
      setIrrigationTask(task);
      setCompletionError("");
      return;
    }
    if (task.type === "fertirriego" || task.type === "fertilizacion") {
      setNutritionTask(task);
      setCompletionError("");
      return;
    }
    if (task.type === "cosecha") {
      setHarvestTask(task);
      setCompletionError("");
      return;
    }
    if (!completion) {
      setCompletionError("");
      setCompletionTask(task);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error: reviewError } = await supabase.rpc("require_work_verification", { target_work_id: task.id });
    if (reviewError) {
      setCompleting(false);
      const message = appErrorMessage(reviewError, "No se pudo preparar la revisión de esta actividad.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }
    const { data, error } = await supabase.rpc("complete_work", {
      target_work_id: task.id,
      target_payload: { occurredAt: completion.occurredAt, note: completion.note || null }
    });
    setCompleting(false);

    if (error) {
      const message = appErrorMessage(error, "No se pudo actualizar la actividad.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }
    setCompletionTask(null);
    setCompletionError("");
    setUndoCompletionTask(task);
    setNotice({ tone: "green", message: "Actividad completada con cambios. Quedó pendiente de revisión." });
    await loadOperations();
  }, [loadOperations]);

  const plannedCompletionState = useCallback((task: OperationTaskRow) => {
    const taskMaterials = materials.filter((material) => material.task_id === task.id);
    if (task.type === "aplicacion_foliar") {
      const complete = taskMaterials.length > 0 && taskMaterials.every((material) => {
        const product = productOptions.find((option) => option.id === material.product_id);
        return Boolean(material.product_id && material.product_name.trim() && material.dose?.trim()
          && material.unit?.trim() && applicationCategoryFromDb(product?.category));
      });
      return {
        canUsePlan: complete,
        reason: "Falta ligar un producto, dosis, unidad o categoría. Completa esos datos para registrar la aplicación."
      };
    }
    if (task.type === "fertirriego" || task.type === "fertilizacion") {
      const complete = taskMaterials.length > 0 && taskMaterials.every((material) =>
        Boolean(material.product_id && material.product_name.trim() && material.dose?.trim() && material.unit?.trim())
      );
      return {
        canUsePlan: complete,
        reason: "Falta ligar un producto, dosis o unidad. Completa esos datos para registrar la nutrición."
      };
    }
    if (task.type === "riego") {
      const duration = parseNumericInput(task.technical_plan?.plannedDurationMin ?? "");
      const liters = parseNumericInput(task.technical_plan?.plannedLiters ?? "");
      return {
        canUsePlan: duration !== null && duration > 0 && liters !== null && liters > 0,
        reason: "El riego necesita duración y litros reales. Completa esos datos para registrarlo."
      };
    }
    return { canUsePlan: true, reason: "" };
  }, [materials, productOptions]);

  const plannedCompletionSummary = useCallback((task: OperationTaskRow) => {
    const planSummary = technicalPlanSummary(task);
    const materialSummary = materials
      .filter((material) => material.task_id === task.id)
      .sort((left, right) => (left.mixing_order ?? 0) - (right.mixing_order ?? 0))
      .map((material) => `${material.product_name}${material.dose ? ` · ${material.dose}` : ""}${material.unit ? ` ${material.unit}` : ""}`)
      .join("\n");
    return [planSummary, materialSummary].filter(Boolean).join("\n");
  }, [materials]);

  const requestCompletion = useCallback((task: OperationTaskRow) => {
    setCompletionError("");
    if (task.type === "cosecha") {
      setHarvestTask(task);
      return;
    }
    setQuickCompletionTask(task);
  }, []);

  const completeAsPlanned = useCallback(async (task: OperationTaskRow, occurredAt: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const taskMaterials = materials
      .filter((material) => material.task_id === task.id)
      .sort((left, right) => (left.mixing_order ?? 0) - (right.mixing_order ?? 0));
    setCompleting(true);
    setNotice(null);
    setCompletionError("");

    try {
      if (task.type === "aplicacion_foliar") {
        const applications = taskMaterials.map((material) => {
          const product = productOptions.find((option) => option.id === material.product_id);
          const category = applicationCategoryFromDb(product?.category);
          if (!category) throw new Error("application_category_required");
          return {
            material,
            product,
            category
          };
        });
        const { data, error } = await supabase.rpc("complete_application_task", {
          target_task_id: task.id,
          target_occurred_at: occurredAt,
          target_applied_area: task.technical_plan?.appliedArea || null,
          target_applications: applications.map(({ material, product, category }) => ({
            materialId: material.id,
            productName: material.product_name,
            dose: doseWithUnit(material.dose, material.unit),
            category: applicationCategoryToDb[category as ApplicationRecord["category"]],
            composition: material.composition ?? product?.composition ?? "",
            safetyInterval: "",
            reentryInterval: "",
            notes: material.notes ?? task.instructions ?? ""
          }))
        });
        if (error) throw error;
        const recordIds = rpcRecordIds(data);
        addApplicationRecords(applications.map(({ material, product, category }, index) => ({
          id: recordIds[index],
          sourceTaskId: task.id,
          greenhouseId: task.greenhouse_id,
          date: occurredAt,
          category: category as ApplicationRecord["category"],
          product: material.product_name,
          composition: material.composition ?? product?.composition ?? "",
          dose: doseWithUnit(material.dose, material.unit),
          area: task.technical_plan?.appliedArea ?? "",
          responsible: currentUser.fullName,
          safetyInterval: "",
          reentry: "",
          notes: material.notes ?? task.instructions ?? ""
        })));
      } else if (task.type === "fertirriego" || task.type === "fertilizacion") {
        const method = task.technical_plan?.method ?? "Fertirriego";
        const objective = task.technical_plan?.objective ?? "Desarrollo";
        const ph = parseNumericInput(task.technical_plan?.targetPh ?? "");
        const ec = parseNumericInput(task.technical_plan?.targetEc ?? "");
        const targetGreenhouse = greenhouses.find((greenhouse) => greenhouse.id === task.greenhouse_id);
        const cropStage = cropStageFromDdt(daysBetween(targetGreenhouse?.transplantDate, occurredAt));
        const { data, error } = await supabase.rpc("complete_nutrition_task", {
          target_task_id: task.id,
          target_occurred_at: occurredAt,
          target_method: nutritionMethodToDb[method],
          target_crop_stage: cropStageToDbValue(cropStage),
          target_objective: nutritionObjectiveToDb[objective],
          target_ph: ph,
          target_ec: ec,
          target_notes: task.instructions || null,
          target_products: taskMaterials.map((material) => ({
            materialId: material.id,
            productName: material.product_name,
            dose: doseWithUnit(material.dose, material.unit)
          }))
        });
        if (error) throw error;
        const recordIds = rpcRecordIds(data);
        taskMaterials.forEach((material, index) => addNutrition({
          id: recordIds[index],
          sourceTaskId: task.id,
          greenhouseId: task.greenhouse_id,
          date: occurredAt,
          product: material.product_name,
          dose: doseWithUnit(material.dose, material.unit),
          method,
          ph: ph ?? 0,
          ec: ec ?? 0,
          stage: cropStage,
          objective,
          notes: task.instructions ?? ""
        }));
      } else if (task.type === "riego") {
        const durationMin = parseNumericInput(task.technical_plan?.plannedDurationMin ?? "");
        const liters = parseNumericInput(task.technical_plan?.plannedLiters ?? "");
        if (durationMin === null || liters === null) throw new Error("irrigation_actuals_required");
        const payload: IrrigationExecutionPayload = {
          date: occurredAt,
          durationMin,
          liters,
          sector: task.technical_plan?.sector ?? "",
          ph: parseNumericInput(task.technical_plan?.targetPh ?? ""),
          ec: parseNumericInput(task.technical_plan?.targetEc ?? ""),
          notes: task.instructions ?? ""
        };
        const { data, error } = await supabase.rpc("complete_irrigation_task", {
          target_task_id: task.id,
          target_occurred_at: payload.date,
          target_duration_min: payload.durationMin,
          target_estimated_liters: payload.liters,
          target_sector: payload.sector || null,
          target_ph: payload.ph,
          target_ec: payload.ec,
          target_notes: payload.notes || null
        });
        if (error) throw error;
        addIrrigation({
          ...payload,
          id: rpcRecordId(data),
          sourceTaskId: task.id,
          greenhouseId: task.greenhouse_id,
          responsible: currentUser.fullName
        });
      } else {
        const { error } = await supabase.rpc("complete_work", {
          target_work_id: task.id,
          target_payload: { occurredAt, note: "Realizada conforme a lo planeado." }
        });
        if (error) throw error;
        setUndoCompletionTask(task);
      }

      setQuickCompletionTask(null);
      setCompletionError("");
      setNotice({
        tone: "green",
        message: task.verification_required
          ? "Actividad completada con los datos planeados. Quedó pendiente de revisión."
          : "Actividad completada con los datos planeados."
      });
      await loadOperations();
    } catch (caught) {
      const message = appErrorMessage(caught, "No se pudo registrar la actividad como planeada.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
    } finally {
      setCompleting(false);
    }
  }, [addApplicationRecords, addIrrigation, addNutrition, currentUser.fullName, greenhouses, loadOperations, materials, productOptions]);

  const undoCompletion = async () => {
    if (!undoCompletionTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setCompleting(true);
    const { error } = await supabase.rpc("undo_work_completion", { target_work_id: undoCompletionTask.id });
    setCompleting(false);
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "Ya no se pudo deshacer la finalización.") });
      setUndoCompletionTask(null);
      return;
    }
    setUndoCompletionTask(null);
    setNotice({ tone: "green", message: "Se deshizo la finalización. La actividad volvió a estar en ejecución." });
    await loadOperations();
  };

  useEffect(() => {
    if (!undoCompletionTask) return;
    const timeout = window.setTimeout(() => setUndoCompletionTask(null), 30_000);
    return () => window.clearTimeout(timeout);
  }, [undoCompletionTask]);

  const startTask = async (task: OperationTaskRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error } = await supabase.rpc("start_work", { target_work_id: task.id });
    setCompleting(false);
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo iniciar la actividad.") });
      return;
    }
    setNotice({ tone: "green", message: "Actividad iniciada." });
    await loadOperations();
  };

  const verifyTask = async (task: OperationTaskRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error } = await supabase.rpc("verify_work", { target_work_id: task.id, target_note: null });
    setCompleting(false);
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo verificar la actividad.") });
      return;
    }
    setNotice({ tone: "green", message: "Actividad verificada." });
    await loadOperations();
  };

  useEffect(() => {
    if (!pendingCompletionTask?.id || loading || completing) return;
    const targetTask = tasks.find((task) => task.id === pendingCompletionTask.id);
    if (!targetTask) return;
    onPendingCompletionConsumed?.();
    requestCompletion(targetTask);
  }, [completing, loading, onPendingCompletionConsumed, pendingCompletionTask?.id, requestCompletion, tasks]);

  useEffect(() => {
    if (!pendingOpenWork?.id || loading) return;
    const targetTask = [...tasks, ...historyTasks].find((task) => task.id === pendingOpenWork.id);
    if (!targetTask) return;

    if (pendingOpenWork.intent === "evidence") {
      setEvidenceTask(targetTask);
      onPendingOpenWorkConsumed?.();
      return;
    }

    const focusTarget = () => {
      const element = document.getElementById(`work-${pendingOpenWork.id}`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      element?.focus({ preventScroll: true });
      onPendingOpenWorkConsumed?.();
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(focusTarget));
  }, [historyTasks, loading, onPendingOpenWorkConsumed, pendingOpenWork, tasks]);

  const completeApplication = async (payload: ApplicationExecutionPayload) => {
    if (!applicationTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { data, error } = await supabase.rpc("complete_application_execution", {
      target_task_id: applicationTask.id,
      target_occurred_at: payload.occurredAt,
      target_applied_area: payload.appliedArea || null,
      target_applications: payload.applications.map((application) => ({
        ...application,
        category: applicationCategoryToDb[application.category as ApplicationRecord["category"]],
        notes: applicationNotesWithFollowUp(application)
      }))
    });
    setCompleting(false);

    if (error) {
      const message = appErrorMessage(error, "No se pudo guardar el registro técnico.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }

    const recordIds = rpcRecordIds(data);
    addApplicationRecords(payload.applications.map((application, index) => ({
      id: recordIds[index],
      sourceTaskId: applicationTask.id,
      greenhouseId: applicationTask.greenhouse_id,
      date: payload.occurredAt,
      category: application.category as ApplicationRecord["category"],
      product: application.productName,
      composition: application.composition,
      dose: doseWithUnit(application.dose, application.unit),
      area: payload.appliedArea,
      responsible: currentUser.fullName,
      safetyInterval: application.safetyInterval,
      reentry: application.reentryInterval,
      notes: applicationNotesWithFollowUp(application)
    })));
    setApplicationTask(null);
    setCompletionError("");
    setNotice({ tone: "green", message: "Aplicación completada y guardada en el Historial de Operación." });
    await loadOperations();
  };

  const completeIrrigation = async (payload: IrrigationExecutionPayload) => {
    if (!irrigationTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error: reviewError } = await supabase.rpc("require_work_verification", { target_work_id: irrigationTask.id });
    if (reviewError) {
      setCompleting(false);
      const message = appErrorMessage(reviewError, "No se pudo preparar la revisión de este riego.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }
    const { data, error } = await supabase.rpc("complete_irrigation_task", {
      target_task_id: irrigationTask.id,
      target_occurred_at: payload.date,
      target_duration_min: payload.durationMin,
      target_estimated_liters: payload.liters,
      target_sector: payload.sector || null,
      target_ph: payload.ph,
      target_ec: payload.ec,
      target_notes: payload.notes || null
    });
    setCompleting(false);
    if (error) {
      const message = appErrorMessage(error, "No se pudo guardar el riego técnico.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }

    addIrrigation({
      ...payload,
      id: rpcRecordId(data),
      sourceTaskId: irrigationTask.id,
      greenhouseId: irrigationTask.greenhouse_id,
      responsible: currentUser.fullName
    });
    setIrrigationTask(null);
    setCompletionError("");
    setNotice({ tone: "green", message: "Riego completado y guardado en el Historial de Operación." });
    await loadOperations();
  };

  const completeNutrition = async (payload: NutritionExecutionPayload) => {
    if (!nutritionTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const targetGreenhouse = greenhouses.find((greenhouse) => greenhouse.id === nutritionTask.greenhouse_id);
    const cropStage = cropStageFromDdt(daysBetween(targetGreenhouse?.transplantDate, payload.date));
    const { data, error } = await supabase.rpc("complete_nutrition_execution", {
      target_task_id: nutritionTask.id,
      target_occurred_at: payload.date,
      target_method: nutritionMethodToDb[payload.method],
      target_crop_stage: cropStageToDbValue(cropStage),
      target_objective: nutritionObjectiveToDb[payload.objective],
      target_ph: payload.ph,
      target_ec: payload.ec,
      target_notes: payload.notes || null,
      target_products: payload.products
    });
    setCompleting(false);
    if (error) {
      const message = appErrorMessage(error, "No se pudo guardar la nutrición técnica.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }

    const recordIds = rpcRecordIds(data);
    payload.products.forEach((product, index) => addNutrition({
      id: recordIds[index],
      sourceTaskId: nutritionTask.id,
      greenhouseId: nutritionTask.greenhouse_id,
      date: payload.date,
      product: product.productName,
      dose: doseWithUnit(product.dose, product.unit),
      method: payload.method,
      ph: payload.ph ?? 0,
      ec: payload.ec ?? 0,
      stage: cropStage,
      objective: payload.objective,
      notes: payload.notes
    }));
    setNutritionTask(null);
    setCompletionError("");
    setNotice({ tone: "green", message: "Nutrición completada y guardada en el Historial de Operación." });
    await loadOperations();
  };

  const completeHarvest = async (payload: HarvestExecutionPayload) => {
    if (!harvestTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error: reviewError } = await supabase.rpc("require_work_verification", { target_work_id: harvestTask.id });
    if (reviewError) {
      setCompleting(false);
      const message = appErrorMessage(reviewError, "No se pudo preparar la revisión de esta cosecha.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }
    const { data, error } = await supabase.rpc("complete_harvest_task", {
      target_task_id: harvestTask.id,
      target_occurred_at: payload.date,
      target_kilograms: payload.kilograms,
      target_first_quality_kg: payload.firstQuality,
      target_second_quality_kg: payload.secondQuality,
      target_merma_kg: payload.merma,
      target_estimated_price: payload.estimatedPrice,
      target_destination: payload.destination || null,
      target_notes: payload.notes || null,
      target_box_count: payload.boxCount,
      target_box_weight_kg: payload.boxWeightKg,
      target_first_quality_boxes: payload.firstQualityBoxes,
      target_second_quality_boxes: payload.secondQualityBoxes,
      target_third_quality_boxes: payload.thirdQualityBoxes,
      target_merma_boxes: payload.mermaBoxes,
      target_third_quality_kg: payload.thirdQuality,
      target_first_quality_price: payload.firstQualityPrice,
      target_second_quality_price: payload.secondQualityPrice,
      target_third_quality_price: payload.thirdQualityPrice
    });
    setCompleting(false);
    if (error) {
      const message = appErrorMessage(error, "No se pudo guardar la cosecha técnica.");
      setCompletionError(message);
      setNotice({ tone: "red", message });
      return;
    }

    addHarvest({ ...payload, id: rpcRecordId(data), sourceTaskId: harvestTask.id, greenhouseId: harvestTask.greenhouse_id });
    setHarvestTask(null);
    setCompletionError("");
    setNotice({ tone: "green", message: "Cosecha completada y guardada en el Historial de Operación." });
    await loadOperations();
  };

  const blockTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!blockedTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { error } = await supabase.rpc("block_work", {
      target_work_id: blockedTask.id,
      target_reason: blockedReason
    });
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo reportar el bloqueo.") });
      return;
    }
    setBlockedTask(null);
    setBlockedReason("");
    setNotice({ tone: "green", message: "Bloqueo reportado al equipo." });
    await loadOperations();
  };

  const markTaskNotPerformed = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!notPerformedTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error } = await supabase.rpc("cancel_work", {
      target_work_id: notPerformedTask.id,
      target_note: notPerformedReason
    });
    setCompleting(false);
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo marcar la actividad como no realizada.") });
      return;
    }
    setNotPerformedTask(null);
    setNotPerformedReason("");
    setNotice({ tone: "green", message: "Actividad marcada como no realizada. El motivo quedó en el historial." });
    await loadOperations();
  };

  const reopenCompletedWork = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reopenTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error } = await supabase.rpc("reopen_work", {
      target_work_id: reopenTask.id,
      target_reason: reopenReason
    });
    setCompleting(false);
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo reabrir la actividad.") });
      return;
    }
    setReopenTask(null);
    setReopenReason("");
    setNotice({ tone: "green", message: "Actividad reabierta para ejecución." });
    await loadOperations();
  };

  const evidenceForTask = (taskId: string) => [...evidence, ...historyEvidence].filter((item) => item.work_id === taskId);

  const saveEvidence = async (file: File, note: string) => {
    if (!evidenceTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;

    setSaving(true);
    setNotice(null);
    try {
      const storagePath = await uploadPrivateCompanyFile({
        bucket: "work-evidence",
        companyId: organization.id,
        file,
        supabase,
        type: `work-${evidenceTask.id}`
      });
      const { error } = await supabase.from("work_evidence").insert({
        company_id: organization.id,
        work_id: evidenceTask.id,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        note: note.trim() || null
      });
      if (error) throw error;
      setNotice({ tone: "green", message: "Evidencia privada adjuntada a la actividad." });
      await loadOperations();
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo adjuntar la evidencia.") });
    } finally {
      setSaving(false);
    }
  };

  const openEvidence = async (item: WorkEvidenceRow) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    try {
      const signedUrl = await createPrivateCompanyFileUrl({ bucket: "work-evidence", path: item.storage_path, supabase });
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo abrir la evidencia privada.") });
    }
  };

  const weekTasks = tasks.filter((task) => task.scheduled_date >= weekStartKey && task.scheduled_date <= weekEndKey);
  const scopedTasks = workTypeFilter?.length ? weekTasks.filter((task) => workTypeFilter.includes(task.type)) : weekTasks;
  const globalOverdueTasks = tasks.filter((task) =>
    task.scheduled_date < todayKey
    && ["pendiente", "en_progreso", "bloqueada"].includes(task.status)
    && (!workTypeFilter?.length || workTypeFilter.includes(task.type))
  );
  const completedCount = scopedTasks.filter((task) => ["completada", "verificada"].includes(task.status)).length;
  const unassignedCount = scopedTasks.filter((task) =>
    !assignmentsForTask(task.id).length && !staffAssignmentsForTask(task.id).length
  ).length;
  const viewStatuses: Record<Exclude<OperationView, "calendar" | "history" | "verification">, OperationStatus[]> = {
    plan: ["pendiente"],
    execution: ["en_progreso", "bloqueada"]
  };
  const visibleTasks = operationView === "calendar" || operationView === "history"
    ? scopedTasks
    : operationView === "verification"
      ? tasks.filter((task) => task.status === "completada" && task.verification_required && (!workTypeFilter?.length || workTypeFilter.includes(task.type)))
      : scopedTasks.filter((task) => viewStatuses[operationView].includes(task.status));
  const overdueCount = globalOverdueTasks.length;
  const overdueWithoutAssigneeCount = globalOverdueTasks.filter((task) =>
    !assignmentsForTask(task.id).length && !staffAssignmentsForTask(task.id).length
  ).length;
  const overdueBlockedCount = globalOverdueTasks.filter((task) => task.status === "bloqueada").length;
  const overdueWithoutDeliveryCount = globalOverdueTasks.filter((task) => {
    if (!assignmentsForTask(task.id).length && !staffAssignmentsForTask(task.id).length) return false;
    return !deliveryStateForTask(task.id).confirmed;
  }).length;
  const overdueWithIncompleteMaterialsCount = globalOverdueTasks.filter((task) => {
    if (!["aplicacion_foliar", "fertirriego", "fertilizacion"].includes(task.type)) return false;
    const taskMaterials = materialsForTask(task.id);
    return !taskMaterials.length || taskMaterials.some((material) => !material.product_id || !material.dose?.trim() || !material.unit?.trim());
  }).length;
  const blockedScopedCount = scopedTasks.filter((task) => task.status === "bloqueada").length;
  const awaitingVerificationCount = tasks.filter((task) => task.status === "completada" && task.verification_required && (!workTypeFilter?.length || workTypeFilter.includes(task.type))).length;
  const historyScopedTasks = workTypeFilter?.length
    ? historyTasks.filter((task) => workTypeFilter.includes(task.type))
    : historyTasks;
  const normalizedHistoryQuery = historyQuery.trim().toLocaleLowerCase("es-MX");
  const visibleHistoryTasks = historyScopedTasks.filter((task) => {
    const technicalResults = historyResultsByTaskId[task.id] ?? [];
    const matchesType = historyTypeFilter === "all"
      || technicalResults.some((result) => result.kind === historyTypeFilter)
      || historyKindForTask(task) === historyTypeFilter;
    if (!matchesType) return false;
    if (!normalizedHistoryQuery) return true;
    return [
      task.title,
      activityLabel(task),
      greenhouseName(task.greenhouse_id),
      task.instructions,
      technicalPlanSummary(task),
      ...technicalResults.map((result) => `${result.label} ${result.detail}`)
    ].filter(Boolean).join(" ").toLocaleLowerCase("es-MX").includes(normalizedHistoryQuery);
  });
  const quickCompletionState = quickCompletionTask
    ? plannedCompletionState(quickCompletionTask)
    : { canUsePlan: false, reason: "" };
  const operationViews: Array<{ id: OperationView; label: string; count?: number }> = [
    { id: "calendar", label: "Semana", count: scopedTasks.length },
    { id: "plan", label: "Por hacer", count: scopedTasks.filter((task) => task.status === "pendiente").length },
    { id: "execution", label: "En curso", count: scopedTasks.filter((task) => ["en_progreso", "bloqueada"].includes(task.status)).length },
    { id: "verification", label: "Por verificar", count: awaitingVerificationCount },
    { id: "history", label: "Historial", count: historyScopedTasks.length || undefined }
  ];

  const openNewActivity = () => {
    setPlanningMenuOpen(false);
    setEditingTask(null);
    setActivityModalOpen(true);
  };

  const openCompletedActivity = (modal: "irrigation" | "nutrition" | "application" | "harvest") => {
    setCompletedActivityChooserOpen(false);
    openModal(modal);
  };

  const openEditActivity = (task: OperationTaskRow) => {
    setEditingTask(task);
    setActivityModalOpen(true);
  };

  const openBlockedTask = (task: OperationTaskRow) => {
    setBlockedReason("");
    setBlockedTask(task);
  };

  const openNotPerformedTask = (task: OperationTaskRow) => {
    setNotPerformedReason("");
    setNotPerformedTask(task);
  };

  const openReopenTask = (task: OperationTaskRow) => {
    setReopenReason("");
    setReopenTask(task);
  };

  return (
    <section>
      {undoCompletionTask ? (
        <div className="mb-4 flex flex-col gap-3 border border-[#C8DFC9] bg-app-soft px-3 py-3 text-sm text-app-green sm:flex-row sm:items-center sm:justify-between" role="status">
          <span>La actividad quedó pendiente de verificación. Puedes deshacer esta finalización durante 30 segundos.</span>
          <Button disabled={completing} onClick={undoCompletion} variant="secondary">Deshacer finalización</Button>
        </div>
      ) : null}
      <header className="mb-4 border-b border-app-border pb-4 pt-4 md:pt-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <PageTitle>{specialtyLabel ?? "Operación"}</PageTitle>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-app-muted">
              {canPlan
                ? "Planea, ejecuta, verifica y consulta cada actividad operativa desde un solo lugar."
                : "Consulta, confirma, adjunta evidencia y reporta el avance de tus actividades."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-label="Semana anterior"
              className="w-10 px-0"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => {
                const targetWeekStart = addDays(weekStart, -7);
                setWeekStart(targetWeekStart);
                onWeekStartChange?.(dateKey(targetWeekStart));
              }}
              variant="secondary"
            />
            <div className="min-w-48 border border-app-border bg-white px-3 py-2 text-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-app-muted">Semana {weekOfYear(weekStart)}</p>
              <p className="mt-1 text-sm font-medium text-app-text">{weekLabel(weekStart)}</p>
            </div>
            <Button
              aria-label="Semana siguiente"
              className="w-10 px-0"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => {
                const targetWeekStart = addDays(weekStart, 7);
                setWeekStart(targetWeekStart);
                onWeekStartChange?.(dateKey(targetWeekStart));
              }}
              variant="secondary"
            />
            {canPlan ? (
              <div className="relative flex" ref={planningMenuRef}>
                <Button
                  className="min-h-11 rounded-r-none border-r border-r-white/20 pr-4"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={openNewActivity}
                  variant="primary"
                >
                  Planear actividad
                </Button>
                <Button
                  aria-expanded={planningMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Más opciones de actividad"
                  className="min-h-11 rounded-l-none px-3"
                  icon={<ChevronDown className="h-4 w-4" />}
                  onClick={() => setPlanningMenuOpen((current) => !current)}
                  variant="primary"
                />
                {planningMenuOpen ? (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-30 min-w-64 rounded-xl border border-app-border bg-white p-1.5 shadow-xl sm:left-auto sm:right-0" role="menu">
                    <button
                      className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-app-text transition hover:bg-app-sidebar focus:outline-none focus:ring-2 focus:ring-app-green/20"
                      onClick={() => {
                        setPlanningMenuOpen(false);
                        setCompletedActivityChooserOpen(true);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      Registrar actividad realizada
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {notice ? (
        <div
          className={notice.tone === "red"
            ? "mb-5 border border-[#E3BDBD] bg-app-red px-3 py-2 text-sm text-[#7B2A2A]"
            : "mb-5 border border-[#C8DFC9] bg-app-soft px-3 py-2 text-sm text-app-green"}
          role={notice.tone === "red" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      {setupRequired ? (
        <div className="border-y border-app-border py-8">
          <p className="text-sm font-medium text-app-text">Planeación operativa pendiente de activar</p>
          <p className="mt-2 text-sm leading-6 text-app-muted">Ejecuta `supabase/08_operational_planning.sql` para habilitar esta sección.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-y border-app-border py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-medium text-app-text">
                {plan?.status === "published" ? "Publicado" : "Borrador"}
              </span>
              <span className="hidden text-app-border sm:inline" aria-hidden="true">·</span>
              <span className="text-app-muted"><strong className="font-medium text-app-text">{completedCount}/{scopedTasks.length}</strong> completadas</span>
              {operationView !== "history" && overdueCount ? (
                <button className="inline-flex items-center gap-1.5 border-b border-[#D8A7A4] pb-0.5 text-[#7B2A2A] transition-colors hover:border-[#8A2E2E]" onClick={() => setOverdueExpanded(true)} type="button">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <strong>{overdueCount}</strong> vencido{overdueCount === 1 ? "" : "s"}
                </button>
              ) : null}
              {operationView !== "history" && blockedScopedCount ? (
                <button className="inline-flex items-center gap-1.5 border-b border-[#D8A7A4] pb-0.5 text-[#7B2A2A] transition-colors hover:border-[#8A2E2E]" onClick={() => selectOperationView("execution")} type="button">
                  <Ban className="h-3.5 w-3.5" />
                  <strong>{blockedScopedCount}</strong> bloqueado{blockedScopedCount === 1 ? "" : "s"}
                </button>
              ) : null}
              {canPlan && unassignedCount ? (
                <span className="text-[#8A5A16]"><strong>{unassignedCount}</strong> sin asignar</span>
              ) : null}
            </div>
            {operationView !== "history" && canPlan && plan && weekTasks.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {plan.status === "published" ? (
                  <details className="relative">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-app-muted transition hover:bg-app-sidebar hover:text-app-text">
                      <Ellipsis className="h-4 w-4" />
                      <span className="sr-only">Más opciones de publicación</span>
                    </summary>
                    <div className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-56 rounded-xl border border-app-border bg-white p-1.5 shadow-xl">
                      <button
                        className="flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-app-text transition hover:bg-app-sidebar"
                        disabled={dispatchingGrok}
                        onClick={resendActiveGrokForPlan}
                        type="button"
                      >
                        {dispatchingGrok ? "Enviando..." : "Reenviar actividades activas"}
                      </button>
                    </div>
                  </details>
                ) : (
                  <Button
                    className="min-h-9 px-3"
                    disabled={publishing}
                    icon={<Send className="h-3.5 w-3.5" />}
                    onClick={publishPlan}
                    variant="secondary"
                  >
                    {publishing ? "Publicando..." : "Publicar semana"}
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          <div className="border-b border-app-border py-3">
            <div className="max-w-full overflow-x-auto overscroll-x-contain">
              <div className="flex min-w-max overflow-hidden md:min-w-0">
                {operationViews.map((view) => {
                  const active = operationView === view.id;
                  return (
                    <button
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex min-h-12 items-center gap-2 border-r border-app-border/70 bg-app-background px-4 text-sm font-medium transition-colors duration-200 first:border-l first:border-app-border/70 hover:bg-app-sidebar/55 focus:outline-none focus-visible:bg-app-sidebar/70 sm:px-5 md:flex-1 md:justify-center",
                        active ? "text-app-text" : "text-app-muted"
                      )}
                      key={view.id}
                      onClick={() => selectOperationView(view.id)}
                      type="button"
                    >
                      <span>{view.label}</span>
                      {view.count !== undefined ? (
                        <span className="rounded-full border border-app-border bg-white/70 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-app-muted">
                          {view.count}
                        </span>
                      ) : null}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-200",
                          operationViewAccents[view.id],
                          active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {operationView !== "history" && globalOverdueTasks.length && overdueExpanded ? (
            <section className="border-b border-app-border py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-app-text">Actividades vencidas</p>
                  <p className="mt-1 text-xs leading-5 text-app-muted">Se agrupan por causa para no asumir que todas fueron incumplidas.</p>
                </div>
                <Button onClick={() => setOverdueExpanded(false)} variant="ghost">Ocultar</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {overdueWithoutAssigneeCount ? <span className="border border-[#E8D2A8] bg-[#FFF9ED] px-2 py-1 text-[#765116]">{overdueWithoutAssigneeCount} sin encargado</span> : null}
                {overdueWithoutDeliveryCount ? <span className="border border-[#E8D2A8] bg-[#FFF9ED] px-2 py-1 text-[#765116]">{overdueWithoutDeliveryCount} sin envío confirmado</span> : null}
                {overdueWithIncompleteMaterialsCount ? <span className="border border-[#E3BDBD] bg-[#FFF9F8] px-2 py-1 text-[#7B2A2A]">{overdueWithIncompleteMaterialsCount} con datos técnicos incompletos</span> : null}
                {overdueBlockedCount ? <span className="border border-[#E3BDBD] bg-[#FFF9F8] px-2 py-1 text-[#7B2A2A]">{overdueBlockedCount} bloqueadas</span> : null}
              </div>
              <div className="mt-4 grid gap-3">
                {globalOverdueTasks.map((task) => (
                  <article className="flex flex-col gap-3 border border-[#E3BDBD] bg-[#FFF9F8] p-4 outline-none focus-visible:ring-2 focus-visible:ring-app-green/25 lg:flex-row lg:items-center lg:justify-between" id={`work-${task.id}`} key={task.id} tabIndex={-1}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><StatusBadge tone="red">Vencido</StatusBadge><span className="text-xs text-app-muted">{formatDate(task.scheduled_date)} · {activityLabel(task)}</span></div>
                      <p className="mt-2 text-sm font-medium text-app-text">{task.title}</p>
                      <p className="mt-1 text-xs text-app-muted">{greenhouseName(task.greenhouse_id)}{task.blocked_reason ? ` · ${task.blocked_reason}` : ""}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {!assignmentsForTask(task.id).length && !staffAssignmentsForTask(task.id).length ? <StatusBadge tone="amber">Sin encargado</StatusBadge> : null}
                        {(assignmentsForTask(task.id).length || staffAssignmentsForTask(task.id).length) && !deliveryStateForTask(task.id).confirmed ? <StatusBadge tone={deliveryStateForTask(task.id).tone}>{deliveryStateForTask(task.id).label}</StatusBadge> : null}
                        {["aplicacion_foliar", "fertirriego", "fertilizacion"].includes(task.type) && (!materialsForTask(task.id).length || materialsForTask(task.id).some((material) => !material.product_id || !material.dose?.trim() || !material.unit?.trim())) ? <StatusBadge tone="red">Revisar datos técnicos</StatusBadge> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button disabled={completing} icon={<CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => requestCompletion(task)} variant="primary">Marcar como realizada</Button>
                      {canPlan ? (
                        <Button disabled={completing} icon={<Ban aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => openNotPerformedTask(task)} variant="secondary">No se realizó</Button>
                      ) : null}
                      <Button icon={<Paperclip className="h-3.5 w-3.5" />} onClick={() => setEvidenceTask(task)} title="Adjuntar evidencia opcional" variant="ghost">Evidencia</Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {operationView !== "history" && canPlan ? (
            <div className="hidden lg:block">
              <CopilotInlineSuggestions
                insights={copilotInsights.filter((insight) => !dismissedCopilotIds.includes(insight.id))}
                onCreateTask={onCreateCopilotTask}
                onDismiss={(insight) => setDismissedCopilotIds((current) => [...current, insight.id])}
                onPrepareMessage={onPrepareCopilotMessage}
              />
            </div>
          ) : null}

          {operationView === "history" ? (
            <section className="mt-7">
              <div className="flex flex-col gap-4 border-b border-app-border pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-sm font-medium text-app-text">Historial operativo</p>
                  <p className="mt-1 text-sm leading-6 text-app-muted">Cada actividad conserva su planeación, resultado técnico y evidencia en una misma línea.</p>
                </div>
                <div className="w-full lg:max-w-sm">
                  <TextInput
                    aria-label="Buscar en el historial operativo"
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="Buscar actividad, invernadero o resultado"
                    value={historyQuery}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-app-border py-3">
                <Button onClick={() => setHistoryTypeFilter("all")} variant={historyTypeFilter === "all" ? "primary" : "ghost"}>Todos</Button>
                {(["riego", "nutricion", "aplicaciones", "cosecha"] as HistoryTechnicalKind[]).map((kind) => (
                  <Button key={kind} onClick={() => setHistoryTypeFilter(kind)} variant={historyTypeFilter === kind ? "primary" : "ghost"}>
                    {historyKindLabel(kind)}
                  </Button>
                ))}
              </div>

              {historyLoading ? (
                <div className="py-16 text-center text-sm text-app-muted">Cargando historial operativo...</div>
              ) : visibleHistoryTasks.length ? (
                <div className="divide-y divide-app-border border-b border-app-border">
                  {visibleHistoryTasks.map((task) => {
                    const technicalResults = historyResultsByTaskId[task.id] ?? [];
                    const planSummary = technicalPlanSummary(task);
                    const taskEvidence = evidenceForTask(task.id);
                    const resultKinds = Array.from(new Set(technicalResults.map((result) => result.kind)));
                    return (
                      <article className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)_auto] lg:items-start" key={task.id}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge icon={workStatusIcon(task.status)} tone={statusTones[task.status]}>{statusLabels[task.status]}</StatusBadge>
                            <span className="text-xs text-app-muted">{formatDate(task.occurred_at ?? task.completed_at ?? task.scheduled_date)}</span>
                          </div>
                          <h3 className="mt-3 text-base font-medium text-app-text">{task.title}</h3>
                          <p className="mt-1 text-sm text-app-muted">{activityLabel(task)} · {greenhouseName(task.greenhouse_id)} · {task.origin === "planned" ? "Planeado" : "No planeado"}</p>
                          {task.instructions ? <p className="mt-3 text-sm leading-6 text-app-muted">{task.instructions}</p> : null}
                          {planSummary ? <p className="mt-3 border-l-2 border-app-green pl-3 text-sm leading-6 text-app-muted"><span className="font-medium text-app-text">Planeado:</span> {planSummary}</p> : null}
                        </div>

                        <div className="min-w-0 border-l-0 border-app-border pl-0 lg:border-l lg:pl-5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">Resultado técnico</p>
                          {technicalResults.length ? (
                            <div className="mt-3 grid gap-2">
                              {technicalResults.map((result, index) => (
                                <div className="border border-app-border bg-app-sidebar px-3 py-2" key={`${result.kind}-${result.occurredAt}-${index}`}>
                                  <p className="text-sm font-medium text-app-text">{result.label}</p>
                                  <p className="mt-1 text-xs leading-5 text-app-muted">{result.detail || "Sin valores adicionales"}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm leading-6 text-app-muted">
                              {historyKindForTask(task)
                                ? "No se encontró un resultado técnico asociado."
                                : "Esta actividad no requiere un resultado técnico."}
                            </p>
                          )}
                          {resultKinds.length ? <div className="mt-3 flex flex-wrap gap-1.5">{resultKinds.map((kind) => <StatusBadge key={kind} tone="green">{historyKindLabel(kind)}</StatusBadge>)}</div> : null}
                          <WorkTimeline
                            actorName={auditActorName}
                            events={eventsForTask(task.id)}
                            evidence={taskEvidence}
                            onOpenEvidence={openEvidence}
                          />
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button className="min-h-10" icon={<Paperclip className="h-3.5 w-3.5" />} onClick={() => setEvidenceTask(task)} variant="ghost">
                            Evidencia{taskEvidence.length ? ` (${taskEvidence.length})` : ""}
                          </Button>
                          {canPlan && task.status === "verificada" ? (
                            <Button className="min-h-10" disabled={completing} icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => openReopenTask(task)} variant="ghost">Reabrir</Button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-8">
                  <EmptyState
                    icon={CalendarRange}
                    title={historyQuery || historyTypeFilter !== "all" ? "No hay actividades cerradas que coincidan con los filtros." : "Aún no hay actividades cerradas en este alcance."}
                  />
                </div>
              )}
            </section>
          ) : loading ? (
            <div className="py-16 text-center text-sm text-app-muted">Cargando operación...</div>
          ) : visibleTasks.length ? (
            <div className="relative mt-5">
              {operationView !== "verification" ? (
                <p className="mb-2 hidden text-right text-[10px] font-medium uppercase tracking-[0.14em] text-app-muted md:block min-[1720px]:hidden">
                  Desliza para ver los siete días →
                </p>
              ) : null}
              <div className="max-w-full snap-x snap-proximity overflow-x-auto overscroll-x-contain scroll-smooth pb-3">
                <div className={operationView === "verification" ? "grid max-w-3xl gap-3" : "grid md:min-w-[1820px] md:grid-cols-7"}>
                  {(operationView === "verification" ? [weekDays[0]] : weekDays).map((date, dayIndex) => {
                    const key = dateKey(date);
                    const dayTasks = operationView === "verification"
                      ? visibleTasks
                      : visibleTasks.filter((task) => task.scheduled_date === key);
                    return (
                      <section key={key} className={`min-w-0 border-t border-app-border py-3 md:snap-start md:px-2 xl:px-3 ${dayIndex ? "md:border-l" : ""}`}>
                    <div className="flex min-h-7 items-center justify-between gap-3">
                      <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-app-muted">{operationView === "verification" ? "PENDIENTES DE REVISIÓN" : dayLabel(date)}</p>
                      {operationView !== "verification" && key === todayKey ? <StatusBadge tone="green">Hoy</StatusBadge> : null}
                    </div>
                    <div className="mt-3 grid gap-3">
                      {dayTasks.map((task) => {
                        const taskAssignments = assignmentsForTask(task.id);
                        const taskStaffAssignments = staffAssignmentsForTask(task.id);
                        const taskMaterials = materialsForTask(task.id);
                        const deliveryState = deliveryStateForTask(task.id);
                        const planSummary = technicalPlanSummary(task);
                        const assignedNames = [
                          ...taskAssignments.map((assignment) => managerName(assignment.user_id)),
                          ...taskStaffAssignments.map((assignment) => staffName(assignment.staff_id))
                        ];
                        return (
                          <article className="min-w-0 scroll-mt-28 border-t border-app-border pt-3 outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" id={`work-${task.id}`} key={task.id} tabIndex={-1}>
                            <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5">
                              <p className="min-w-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                                {operationView === "verification" ? formatDate(task.scheduled_date) : (task.scheduled_time?.slice(0, 5) || "Sin hora")} · {activityLabel(task)}
                              </p>
                              <div className="shrink-0">
                                <StatusBadge icon={workStatusIcon(task.status)} tone={statusTones[task.status]}>{statusLabels[task.status]}</StatusBadge>
                              </div>
                            </div>
                            <h3 className="mt-2 line-clamp-2 break-words text-sm font-medium leading-5 text-app-text">{task.title}</h3>
                            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-app-muted">
                              {greenhouseName(task.greenhouse_id)} · {executionLabels[task.execution_mode]}
                            </p>
                            {assignedNames.length ? (
                              <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-app-muted">
                                {assignedNames.join(", ")}
                              </p>
                            ) : <p className="mt-1 text-xs text-[#8A2E2E]">Sin encargado</p>}
                            {plan?.status === "published" && assignedNames.length ? (
                              <div className="mt-2">
                                <StatusBadge tone={deliveryState.tone}>{deliveryState.label}</StatusBadge>
                              </div>
                            ) : null}
                            {task.blocked_reason ? (
                              <p className="mt-2 flex gap-1.5 text-xs leading-5 text-[#7B2A2A]">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span className="line-clamp-2">{task.blocked_reason}</span>
                              </p>
                            ) : null}
                            <div className="mt-3">
                              {task.status === "pendiente" ? (
                                <Button className="min-h-9 w-full px-3" disabled={completing} icon={<CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => requestCompletion(task)} variant="primary">Marcar como realizada</Button>
                              ) : task.status === "en_progreso" ? (
                                <Button className="min-h-9 w-full px-3" disabled={completing} icon={<CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => requestCompletion(task)} variant="primary">Marcar como realizada</Button>
                              ) : task.status === "bloqueada" ? (
                                <Button className="min-h-9 w-full px-3" disabled={completing} icon={<Play className="h-3.5 w-3.5" />} onClick={() => startTask(task)} title="Reanudar actividad" variant="primary">Reanudar</Button>
                              ) : canPlan && task.status === "completada" && task.verification_required ? (
                                <Button className="min-h-9 w-full px-3" disabled={completing} icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => verifyTask(task)} variant="primary">Verificar</Button>
                              ) : null}
                            </div>
                            <details className="mt-2 border-t border-app-border pt-1">
                              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium text-app-muted transition hover:text-app-text">
                                <span>Detalles y acciones</span>
                                <Ellipsis className="h-4 w-4" />
                              </summary>
                              <div className="pb-1 pt-2">
                                {task.instructions ? <p className="break-words text-xs leading-5 text-app-text">{task.instructions}</p> : null}
                                {planSummary ? <p className="mt-2 break-words text-xs leading-5 text-app-muted">{planSummary}</p> : null}
                                {taskMaterials.length ? (
                                  <div className="mt-2 break-words border-l-2 border-app-green pl-2 text-xs leading-5 text-app-muted">
                                    {taskMaterials
                                      .sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0))
                                      .map((material) => (
                                        <p key={material.id}>{material.product_name}{material.dose ? ` · ${material.dose}` : ""}{material.unit ? ` ${material.unit}` : ""}</p>
                                      ))}
                                  </div>
                                ) : null}
                                {task.occurred_at ? <p className="mt-2 text-xs text-app-muted">Realizado: {formatDate(task.occurred_at)}</p> : null}
                                {canPlan && task.status === "completada" && task.verification_required ? (
                                  <p className="mt-2 text-xs leading-5 text-app-muted">Revisión pendiente: verifica solo actividades realizadas por otra persona. Si la ejecutaste tú, otro admin u owner debe aprobarla.</p>
                                ) : null}
                                {task.verified_at ? <p className="mt-1 text-xs text-app-muted">Verificado: {formatDate(task.verified_at)}</p> : null}
                                <WorkTimeline
                                  actorName={auditActorName}
                                  events={eventsForTask(task.id)}
                                  evidence={evidenceForTask(task.id)}
                                  onOpenEvidence={openEvidence}
                                />
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {canPlan ? (
                                    <Button
                                      className="min-h-9 px-2.5"
                                      icon={<Edit3 className="h-3.5 w-3.5" />}
                                      onClick={() => openEditActivity(task)}
                                      variant="ghost"
                                    >Editar</Button>
                                  ) : null}
                                  {["pendiente", "en_progreso"].includes(task.status) ? (
                                    <Button className="min-h-9 px-2.5" disabled={completing} icon={<Ban className="h-3.5 w-3.5" />} onClick={() => openBlockedTask(task)} variant="ghost">Bloquear</Button>
                                  ) : null}
                                  {task.status === "pendiente" ? (
                                    <Button className="min-h-9 px-2.5" disabled={completing} icon={<Play className="h-3.5 w-3.5" />} onClick={() => startTask(task)} title="Iniciar sólo si seguirá en curso" variant="ghost">Iniciar</Button>
                                  ) : null}
                                  {canPlan && ["pendiente", "en_progreso", "bloqueada"].includes(task.status) ? (
                                    <Button className="min-h-9 px-2.5" disabled={completing} icon={<Ban aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => openNotPerformedTask(task)} variant="ghost">No se realizó</Button>
                                  ) : null}
                                  <Button className="min-h-9 px-2.5" icon={<Paperclip className="h-3.5 w-3.5" />} onClick={() => setEvidenceTask(task)} title={evidenceForTask(task.id).length ? `Evidencia opcional · ${evidenceForTask(task.id).length}` : "Adjuntar evidencia opcional"} variant="ghost">Evidencia{evidenceForTask(task.id).length ? ` (${evidenceForTask(task.id).length})` : ""}</Button>
                                  {canPlan && ["completada", "verificada"].includes(task.status) ? (
                                    <Button className="min-h-9 px-2.5" disabled={completing} icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => openReopenTask(task)} variant="ghost">Reabrir</Button>
                                  ) : null}
                                </div>
                              </div>
                            </details>
                          </article>
                        );
                      })}
                      {!dayTasks.length ? <p className="py-4 text-xs text-app-muted">Sin actividades en esta vista</p> : null}
                    </div>
                  </section>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <EmptyState
                actionClassName={canPlan ? "hidden lg:inline-flex" : undefined}
                actionLabel={canPlan ? "Agregar actividad" : undefined}
                icon={CalendarRange}
                onAction={canPlan ? openNewActivity : undefined}
                title={canPlan ? "La semana todavía no tiene actividades de este tipo." : "No tienes actividades asignadas de este tipo."}
              />
            </div>
          )}

        </>
      )}

      <ActivityFormModal
        assignments={assignments}
        crops={crops}
        greenhouses={greenhouses}
        managers={managers}
        materials={materials}
        onClose={() => { setActivityModalOpen(false); setEditingTask(null); }}
        onSave={saveActivity}
        open={activityModalOpen}
        productOptions={productOptions}
        saving={saving}
        staff={staff}
        staffAssignments={staffAssignments}
        task={editingTask}
        weekDays={weekDays}
      />

      <Modal
        onClose={() => setCompletedActivityChooserOpen(false)}
        open={completedActivityChooserOpen}
        title="Registrar actividad realizada"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => openCompletedActivity("irrigation")} variant="secondary">Riego</Button>
          <Button onClick={() => openCompletedActivity("nutrition")} variant="secondary">Nutrición</Button>
          <Button onClick={() => openCompletedActivity("application")} variant="secondary">Aplicación</Button>
          <Button onClick={() => openCompletedActivity("harvest")} variant="secondary">Cosecha</Button>
        </div>
      </Modal>

      <QuickCompletionModal
        canUsePlan={quickCompletionState.canUsePlan}
        error={completionError}
        greenhouseName={quickCompletionTask ? greenhouseName(quickCompletionTask.greenhouse_id) : ""}
        onChangeDetails={() => {
          if (!quickCompletionTask) return;
          const targetTask = quickCompletionTask;
          setQuickCompletionTask(null);
          setCompletionError("");
          void openCompletionDetails(targetTask);
        }}
        onClose={() => { setQuickCompletionTask(null); setCompletionError(""); }}
        onConfirm={(occurredAt) => quickCompletionTask
          ? completeAsPlanned(quickCompletionTask, occurredAt)
          : Promise.resolve()}
        plannedSummary={quickCompletionTask ? plannedCompletionSummary(quickCompletionTask) : ""}
        saving={completing}
        task={quickCompletionTask}
        unavailableReason={quickCompletionState.reason}
      />

      <CompleteApplicationModal
        error={completionError}
        greenhouseName={applicationTask ? greenhouseName(applicationTask.greenhouse_id) : ""}
        materials={applicationTask ? materialsForTask(applicationTask.id) : []}
        productOptions={productOptions}
        onClose={() => { setApplicationTask(null); setCompletionError(""); }}
        onSave={completeApplication}
        saving={completing}
        task={applicationTask}
      />

      <CompleteIrrigationModal
        error={completionError}
        greenhouseName={irrigationTask ? greenhouseName(irrigationTask.greenhouse_id) : ""}
        onClose={() => { setIrrigationTask(null); setCompletionError(""); }}
        onSave={completeIrrigation}
        saving={completing}
        task={irrigationTask}
      />

      <CompleteNutritionModal
        error={completionError}
        greenhouseName={nutritionTask ? greenhouseName(nutritionTask.greenhouse_id) : ""}
        materials={nutritionTask ? materialsForTask(nutritionTask.id) : []}
        productOptions={productOptions}
        onClose={() => { setNutritionTask(null); setCompletionError(""); }}
        onSave={completeNutrition}
        saving={completing}
        task={nutritionTask}
      />

      <CompleteHarvestModal
        error={completionError}
        greenhouseName={harvestTask ? greenhouseName(harvestTask.greenhouse_id) : ""}
        onClose={() => { setHarvestTask(null); setCompletionError(""); }}
        onSave={completeHarvest}
        saving={completing}
        task={harvestTask}
      />

      <WorkEvidenceModal
        evidence={evidenceTask ? evidenceForTask(evidenceTask.id) : []}
        onClose={() => setEvidenceTask(null)}
        onOpenEvidence={openEvidence}
        onSave={saveEvidence}
        saving={saving}
        task={evidenceTask}
      />

      <CompleteWorkModal
        error={completionError}
        onClose={() => { setCompletionTask(null); setCompletionError(""); }}
        onSave={(payload) => completionTask ? openCompletionDetails(completionTask, payload) : Promise.resolve()}
        saving={completing}
        task={completionTask}
      />

      <Modal open={Boolean(blockedTask)} onClose={() => { setBlockedTask(null); setBlockedReason(""); }} title="Reportar bloqueo">
        <form className="grid gap-5" onSubmit={blockTask}>
          <div>
            <p className="text-sm font-medium text-app-text">{blockedTask?.title}</p>
            <p className="mt-2 text-sm leading-6 text-app-muted">El motivo quedará visible para owner y admin.</p>
          </div>
          <Field label="Motivo">
            <TextArea
              onChange={(event) => setBlockedReason(event.target.value)}
              placeholder="Falta producto, clima, equipo, personal u otro motivo."
              required
              value={blockedReason}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setBlockedTask(null); setBlockedReason(""); }} type="button" variant="secondary">Cancelar</Button>
            <Button icon={<Ban className="h-4 w-4" />} type="submit" variant="primary">Reportar bloqueo</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(notPerformedTask)} onClose={() => { setNotPerformedTask(null); setNotPerformedReason(""); }} title="Marcar como no realizada">
        <form className="grid gap-5" onSubmit={markTaskNotPerformed}>
          <div>
            <p className="text-sm font-medium text-app-text">{notPerformedTask?.title}</p>
            <p className="mt-2 text-sm leading-6 text-app-muted">La actividad saldrá de pendientes. La planeación y el motivo se conservarán en el historial.</p>
          </div>
          <Field label="Motivo">
            <TextArea
              onChange={(event) => setNotPerformedReason(event.target.value)}
              placeholder="Ej. No fue necesaria, cambió el tratamiento o se reprogramó."
              required
              value={notPerformedReason}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setNotPerformedTask(null); setNotPerformedReason(""); }} type="button" variant="secondary">Volver</Button>
            <Button disabled={completing} icon={<Ban aria-hidden="true" className="h-4 w-4" />} type="submit" variant="primary">
              {completing ? "Guardando..." : "Marcar como no realizada"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(reopenTask)} onClose={() => { setReopenTask(null); setReopenReason(""); }} title="Reabrir actividad">
        <form className="grid gap-5" onSubmit={reopenCompletedWork}>
          <div>
            <p className="text-sm font-medium text-app-text">{reopenTask?.title}</p>
            <p className="mt-2 text-sm leading-6 text-app-muted">La actividad volverá a ejecución y el motivo quedará en su auditoría.</p>
          </div>
          <Field label="Motivo">
            <TextArea
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Describe qué debe corregirse antes de volver a completar la actividad."
              required
              value={reopenReason}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setReopenTask(null); setReopenReason(""); }} type="button" variant="secondary">Cancelar</Button>
            <Button disabled={completing} icon={<RotateCcw className="h-4 w-4" />} type="submit" variant="primary">Reabrir actividad</Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
