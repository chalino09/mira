"use client";

import {
  AlertTriangle,
  Ban,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Minus,
  Plus,
  Send
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CopilotInlineSuggestions } from "@/components/copilot/MiraCopilot";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { DatePickerInput, TimePickerInput } from "@/components/forms/DateTimeInputs";
import { Field, FormattedNumberInput, FormattedQuantityInput, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { HarvestCaptureFields } from "@/components/forms/HarvestCaptureFields";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { addDays, startOfIsoWeek, weekOfYear } from "@/lib/date";
import { appErrorMessage } from "@/lib/errors";
import { cropStageFromDdt, cropStageToDbValue, greenhouseDisplayName } from "@/lib/crop-ddt";
import { harvestValuesFromForm } from "@/lib/harvest";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { cn, parseNumericInput } from "@/lib/utils";
import type { CopilotInsight } from "@/lib/mira-copilot";
import type { ApplicationRecord, CropCatalogItem, Greenhouse, HarvestRecord, IrrigationRecord, NutritionRecord } from "@/types";

type PlanStatus = "draft" | "published" | "closed";
type TaskPriority = "low" | "normal" | "high" | "critical";
type ExecutionMode = "manager" | "crew" | "both";
type OperationStatus = "pendiente" | "en_progreso" | "bloqueada" | "completada" | "cancelada";

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
  technical_plan: TechnicalPlan;
};

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

type ProductOption = {
  id: string;
  name: string;
  composition: string | null;
};

type TechnicalPlan = {
  plannedDurationMin?: string;
  plannedLiters?: string;
  sector?: string;
  targetPh?: string;
  targetEc?: string;
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
  productName: string;
  dose: string;
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
  productName: string;
  dose: string;
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

const activityLabels: Record<string, string> = {
  ...Object.fromEntries(activityTypes.map((item) => [item.value, item.label])),
  fertilizacion: "Fertirriego"
};

const statusLabels: Record<OperationStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "Pendiente",
  bloqueada: "Bloqueada",
  completada: "Completada",
  cancelada: "Cancelada"
};

const statusTones: Record<OperationStatus, "neutral" | "green" | "amber" | "red"> = {
  pendiente: "neutral",
  en_progreso: "neutral",
  bloqueada: "red",
  completada: "green",
  cancelada: "neutral"
};

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

const applicationCategories: ApplicationRecord["category"][] = [
  "Fertilizante",
  "Bioestimulante",
  "Corrector",
  "Acondicionador de agua",
  "Adyuvante / Coadyuvante",
  "Microorganismos",
  "Fungicida",
  "Insecticida",
  "Acaricida",
  "Nematicida",
  "Bactericida",
  "Sanitizante / Desinfectante",
  "Regulador de crecimiento"
];

const doseUnitOptions = ["ml/L", "g/L", "L/ha", "kg/ha", "ml/20 L", "g/20 L", "cc/L", "%"];

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

const applicationCategoryToDb: Record<ApplicationRecord["category"], string> = {
  Fertilizante: "fertilizante",
  Bioestimulante: "bioestimulante",
  Corrector: "corrector",
  "Acondicionador de agua": "acondicionador_agua",
  "Adyuvante / Coadyuvante": "adyuvante_coadyuvante",
  Microorganismos: "microorganismos",
  Fungicida: "fungicida",
  Insecticida: "insecticida",
  Acaricida: "acaricida",
  Nematicida: "nematicida",
  Bactericida: "bactericida",
  "Sanitizante / Desinfectante": "sanitizante_desinfectante",
  "Regulador de crecimiento": "regulador_crecimiento"
};

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

function normalizedProductName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
}

function ProductCombobox({
  material,
  products,
  onChange,
  index
}: {
  material: MaterialDraft;
  products: ProductOption[];
  onChange: (patch: Partial<MaterialDraft>) => void;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const query = normalizedProductName(material.productName);
  const exactMatch = products.find((product) => normalizedProductName(product.name) === query);
  const matches = query
    ? products
        .filter((product) => normalizedProductName(product.name).includes(query))
        .slice(0, 8)
    : products.slice(0, 8);

  const selectProduct = (product: ProductOption) => {
    onChange({
      productId: product.id,
      productName: product.name,
      composition: product.composition ?? ""
    });
    setOpen(false);
  };

  const useManualProduct = () => {
    onChange({ productId: "", composition: "" });
    setOpen(false);
  };

  return (
    <div className="relative">
      <TextInput
        aria-label={`Producto ${index + 1}`}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          const nextName = event.target.value;
          const nextMatch = products.find((product) => normalizedProductName(product.name) === normalizedProductName(nextName));
          onChange({
            productId: nextMatch?.id ?? "",
            productName: nextName,
            composition: nextMatch?.composition ?? ""
          });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar producto"
        value={material.productName}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto border border-app-border bg-white shadow-lg">
          {matches.map((product) => (
            <button
              className="block w-full px-3 py-2 text-left hover:bg-app-sidebar"
              key={product.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectProduct(product)}
              type="button"
            >
              <span className="block truncate text-sm font-medium text-app-text">{product.name}</span>
              {product.composition ? (
                <span className="block truncate text-xs text-app-muted">{product.composition}</span>
              ) : null}
            </button>
          ))}
          {material.productName.trim() && !exactMatch ? (
            <button
              className="block w-full border-t border-app-border px-3 py-2 text-left text-sm font-medium text-app-green hover:bg-app-soft"
              onMouseDown={(event) => event.preventDefault()}
              onClick={useManualProduct}
              type="button"
            >
              Agregar otro: {material.productName.trim()}
            </button>
          ) : null}
          {!matches.length && !material.productName.trim() ? (
            <p className="px-3 py-2 text-sm text-app-muted">Escribe para buscar o agregar otro.</p>
          ) : null}
        </div>
      ) : null}
      {material.composition ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">{material.composition}</p>
      ) : null}
    </div>
  );
}

function technicalPlanForType(type: string, plan: TechnicalPlan): TechnicalPlan {
  if (type === "riego") {
    return {
      plannedDurationMin: plan.plannedDurationMin ?? "",
      plannedLiters: plan.plannedLiters ?? "",
      sector: plan.sector ?? "",
      targetPh: plan.targetPh ?? "",
      targetEc: plan.targetEc ?? ""
    };
  }
  if (type === "fertirriego" || type === "fertilizacion") {
    return {
      method: plan.method ?? "Fertirriego",
      objective: plan.objective ?? "Desarrollo",
      targetPh: plan.targetPh ?? "",
      targetEc: plan.targetEc ?? ""
    };
  }
  if (type === "aplicacion_foliar") return { appliedArea: plan.appliedArea ?? "" };
  if (type === "tutoreo") {
    return {
      rafiaWorkType: plan.rafiaWorkType ?? "Enredado",
      rafiaSector: plan.rafiaSector ?? ""
    };
  }
  if (type === "mantenimiento") {
    return {
      maintenanceWorkType: plan.maintenanceWorkType ?? "Sistema de riego",
      maintenanceSector: plan.maintenanceSector ?? ""
    };
  }
  if (type === "preparacion_ciclo") {
    return {
      cycleWorkType: plan.cycleWorkType ?? "Preparación de camas",
      cycleSector: plan.cycleSector ?? ""
    };
  }
  if (type === "cosecha") return { harvestZone: plan.harvestZone ?? "" };
  return {};
}

function activityLabel(task: OperationTaskRow) {
  if (task.type === "otro" && task.technical_plan?.cycleWorkType) return "Preparación de ciclo";
  return activityLabels[task.type] ?? task.type;
}

function optionalFormNumber(value: FormDataEntryValue | null) {
  return parseNumericInput(String(value ?? ""));
}

function requiredFormNumber(value: FormDataEntryValue | null) {
  return optionalFormNumber(value) ?? 0;
}

function telegramDispatchMessage(data: any) {
  const sent = Number(data?.sent ?? 0);
  const failed = Number(data?.failed ?? 0);
  const pendingWithoutConnection = Number(data?.pendingWithoutConnection ?? 0);

  if (!sent && !failed && !pendingWithoutConnection) {
    return "No hay notificaciones pendientes para esta semana.";
  }

  return [
    sent ? `${sent} encargado${sent === 1 ? "" : "s"} notificado${sent === 1 ? "" : "s"}` : "",
    pendingWithoutConnection ? `${pendingWithoutConnection} encargado${pendingWithoutConnection === 1 ? "" : "s"} sin conexión` : "",
    failed ? `${failed} fallo${failed === 1 ? "" : "s"}` : ""
  ].filter(Boolean).join(" · ");
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
      materials: ["fertirriego", "fertilizacion", "aplicacion_foliar"].includes(activityType)
        ? materialRows.filter((item) => item.productName.trim())
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
            <div className="grid grid-cols-7 gap-1.5">
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

        {["fertirriego", "fertilizacion", "aplicacion_foliar"].includes(activityType) ? (
        <section className="border-t border-app-border pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Productos y mezcla</p>
              <p className="mt-2 text-xs text-app-muted">Opcional para fertirriego, foliar y preparaciones.</p>
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
                <ProductCombobox
                  index={index}
                  material={material}
                  products={productOptions}
                  onChange={(patch) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, ...patch } : item
                  ))}
                />
                <FormattedNumberInput
                  aria-label={`Dosis ${index + 1}`}
                  onChange={(event) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, dose: event.target.value } : item
                  ))}
                  placeholder="Dosis"
                  value={material.dose}
                />
                <SelectInput
                  aria-label={`Unidad ${index + 1}`}
                  onChange={(event) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, unit: event.target.value } : item
                  ))}
                  value={material.unit}
                >
                  <option value="">Unidad</option>
                  {doseUnitOptions.map((unit) => <option key={unit}>{unit}</option>)}
                </SelectInput>
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
  greenhouseName,
  saving,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  materials: MaterialRow[];
  greenhouseName: string;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: ApplicationExecutionPayload) => Promise<void>;
}) {
  const [occurredAt, setOccurredAt] = useState(() => dateKey(new Date()));
  const [appliedArea, setAppliedArea] = useState("");
  const [applications, setApplications] = useState<ApplicationExecutionDraft[]>([]);

  useEffect(() => {
    if (!task) return;
    setOccurredAt(dateKey(new Date()));
    setAppliedArea(task.technical_plan?.appliedArea ?? "");
    setApplications(
      materials
        .slice()
        .sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0))
        .map((material) => ({
          materialId: material.id,
          productName: material.product_name,
          dose: [material.dose, material.unit].filter(Boolean).join(" "),
          category: "",
          composition: material.composition ?? "",
          safetyInterval: "",
          reentryInterval: "",
          effectiveness: "",
          reviewDate: "",
          reapplicationDate: "",
          notes: material.notes ?? ""
        }))
    );
  }, [materials, task]);

  const updateApplication = (index: number, patch: Partial<ApplicationExecutionDraft>) => {
    setApplications((current) => current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    ));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({ occurredAt, appliedArea, applications });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} panelClassName="sm:self-start sm:mt-8" title="Confirmar aplicación realizada">
      <form className="grid gap-6" onSubmit={handleSubmit}>
        <div className="border-l-2 border-app-green pl-3">
          <p className="text-sm font-medium text-app-text">
            {task ? activityLabels[task.type] ?? "Aplicación" : "Aplicación"} · {greenhouseName}
          </p>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            Confirma solo lo necesario. La receta planeada se conserva en Registros técnicos.
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
          {applications.map((application, index) => (
            <section key={application.materialId} className="grid gap-3 border-b border-app-border pb-5 last:border-b-0">
              <div className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.9fr]">
                <Field label={`Producto ${index + 1}`}>
                  <TextInput
                    onChange={(event) => updateApplication(index, { productName: event.target.value })}
                    required
                    value={application.productName}
                  />
                </Field>
                <Field label="Dosis real">
                  <FormattedQuantityInput
                    onChange={(event) => updateApplication(index, { dose: event.target.value })}
                    required
                    value={application.dose}
                  />
                </Field>
                <Field label="Categoría">
                  <SelectInput
                    onChange={(event) => updateApplication(index, {
                      category: event.target.value as ApplicationExecutionDraft["category"]
                    })}
                    required
                    value={application.category}
                  >
                    <option value="">Selecciona el tipo</option>
                    {applicationCategories.map((category) => <option key={category}>{category}</option>)}
                  </SelectInput>
                </Field>
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
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-app-border pt-5 sm:flex-row sm:justify-end">
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving || !applications.length} type="submit" variant="primary">
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
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  greenhouseName: string;
  saving: boolean;
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
  greenhouseName,
  saving,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  materials: MaterialRow[];
  greenhouseName: string;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: NutritionExecutionPayload) => Promise<void>;
}) {
  const [products, setProducts] = useState<NutritionExecutionDraft[]>([]);

  useEffect(() => {
    if (!task) return;
    setProducts(materials.slice().sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0)).map((material) => ({
      materialId: material.id,
      productName: material.product_name,
      dose: [material.dose, material.unit].filter(Boolean).join(" ")
    })));
  }, [materials, task]);

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
          {products.map((product, index) => (
            <div key={product.materialId} className="grid gap-2 sm:grid-cols-2">
              <Field label={`Producto ${index + 1}`}>
                <TextInput
                  onChange={(event) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productName: event.target.value } : item))}
                  required
                  value={product.productName}
                />
              </Field>
              <Field label="Dosis real">
                <FormattedQuantityInput
                  onChange={(event) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dose: event.target.value } : item))}
                  required
                  value={product.dose}
                />
              </Field>
            </div>
          ))}
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
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving || !products.length} type="submit" variant="primary">{saving ? "Guardando..." : "Completar y guardar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CompleteHarvestModal({
  task,
  greenhouseName,
  saving,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  greenhouseName: string;
  saving: boolean;
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
          <Button disabled={saving} onClick={onClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando..." : "Completar y guardar"}</Button>
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
  onCreateCopilotTask,
  onPrepareCopilotMessage
}: {
  copilotInsights?: CopilotInsight[];
  operationRefreshKey?: number;
  pendingCompletionTask?: { id: string; date: string } | null;
  onPendingCompletionConsumed?: () => void;
  onCreateCopilotTask?: (insight: CopilotInsight) => void;
  onPrepareCopilotMessage?: (insight: CopilotInsight) => void;
}) {
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const crops = useGreenhouseStore((state) => state.crops);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const addApplicationRecords = useGreenhouseStore((state) => state.addApplicationRecords);
  const addIrrigation = useGreenhouseStore((state) => state.addIrrigation);
  const addNutrition = useGreenhouseStore((state) => state.addNutrition);
  const addHarvest = useGreenhouseStore((state) => state.addHarvest);
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek());
  const [plan, setPlan] = useState<WeeklyPlanRow | null>(null);
  const [tasks, setTasks] = useState<OperationTaskRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignmentRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [operationGreenhouses, setOperationGreenhouses] = useState<OperationGreenhouseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dispatchingTelegram, setDispatchingTelegram] = useState(false);
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
  const [dismissedCopilotIds, setDismissedCopilotIds] = useState<string[]>([]);

  const canPlan = currentUser.role === "owner" || currentUser.role === "admin";
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekStartKey = dateKey(weekStart);
  const weekEndKey = dateKey(weekDays[6]);
  const todayKey = dateKey(new Date());

  useEffect(() => {
    if (!pendingCompletionTask?.date) return;
    const targetWeekStart = startOfIsoWeek(dateFromKey(pendingCompletionTask.date));
    const targetWeekStartKey = dateKey(targetWeekStart);
    if (targetWeekStartKey !== weekStartKey) {
      setWeekStart(targetWeekStart);
    }
  }, [pendingCompletionTask?.date, weekStartKey]);

  const loadOperations = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;

    setLoading(true);
    setSetupRequired(false);
    const [planResponse, tasksResponse, membersResponse, staffResponse, productsResponse] = await Promise.all([
      supabase
        .from("weekly_plans")
        .select("id, week_start, status, published_at")
        .eq("company_id", organization.id)
        .eq("week_start", weekStartKey)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("id, weekly_plan_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, priority, instructions, execution_mode, crew_size, blocked_reason, technical_plan")
        .eq("company_id", organization.id)
        .gte("scheduled_date", weekStartKey)
        .lte("scheduled_date", weekEndKey)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true }),
      supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", organization.id)
        .eq("role", "manager")
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
        .select("id, name, composition")
        .eq("company_id", organization.id)
        .order("name", { ascending: true })
    ]);

    const baseError = planResponse.error ?? tasksResponse.error ?? membersResponse.error ?? staffResponse.error ?? productsResponse.error;
    if (baseError) {
      setSetupRequired(isOperationsSetupError(baseError));
      setNotice({ tone: "red", message: appErrorMessage(baseError, "No se pudo cargar la operación semanal.") });
      setLoading(false);
      return;
    }

    const taskRows = (tasksResponse.data ?? []) as OperationTaskRow[];
    const taskIds = taskRows.map((task) => task.id);
    const taskGreenhouseIds = Array.from(new Set(taskRows.map((task) => task.greenhouse_id).filter(Boolean)));
    const managerIds = (membersResponse.data ?? [])
      .map((member: any) => member.user_id)
      .filter((id: string | null): id is string => Boolean(id));

    const [assignmentsResponse, staffAssignmentsResponse, materialsResponse, profilesResponse, greenhousesResponse] = await Promise.all([
      taskIds.length
        ? supabase.from("task_assignments").select("id, task_id, user_id").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("task_staff_assignments").select("id, task_id, staff_id").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("task_materials").select("id, task_id, product_id, product_name, composition, dose, unit, mixing_order, notes").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      managerIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", managerIds)
        : Promise.resolve({ data: [], error: null }),
      taskGreenhouseIds.length
        ? supabase.from("greenhouses").select("id, name").eq("company_id", organization.id).in("id", taskGreenhouseIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const detailError = assignmentsResponse.error ?? staffAssignmentsResponse.error ?? materialsResponse.error ?? profilesResponse.error ?? greenhousesResponse.error;
    if (detailError) {
      setNotice({ tone: "red", message: appErrorMessage(detailError, "Faltan detalles de algunas actividades.") });
    }

    const profileMap = new Map((profilesResponse.data ?? []).map((profile: any) => [profile.id, profile]));
    setPlan((planResponse.data as WeeklyPlanRow | null) ?? null);
    setTasks(taskRows);
    setAssignments((assignmentsResponse.data ?? []) as AssignmentRow[]);
    setStaffAssignments((staffAssignmentsResponse.data ?? []) as StaffAssignmentRow[]);
    setMaterials((materialsResponse.data ?? []) as MaterialRow[]);
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
    setLoading(false);
  }, [organization.id, weekEndKey, weekStartKey]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations, operationRefreshKey]);

  const assignmentsForTask = (taskId: string) => assignments.filter((item) => item.task_id === taskId);
  const staffAssignmentsForTask = (taskId: string) => staffAssignments.filter((item) => item.task_id === taskId);
  const materialsForTask = (taskId: string) => materials.filter((item) => item.task_id === taskId);
  const managerName = (userId: string) => managers.find((manager) => manager.id === userId)?.name ?? "Encargado";
  const staffName = (staffId: string) => staff.find((person) => person.id === staffId)?.name ?? "Encargado";
  const greenhouseName = (greenhouseId: string) =>
    (greenhouses.find((item) => item.id === greenhouseId)
      ? greenhouseDisplayName(greenhouses.find((item) => item.id === greenhouseId)!, crops)
      : operationGreenhouses.find((item) => item.id === greenhouseId)?.name) ??
    "Área productiva";

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
      const { error } = await supabase.rpc(rpcName, rpcPayload);
      if (error) throw error;

      setNotice({ tone: "green", message: editingTask ? "Actividad actualizada." : "Actividad agregada a la semana." });
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

      const { data, error: dispatchError } = await supabase.functions.invoke("telegram-dispatch", {
        body: { weeklyPlanId: plan.id }
      });

      if (dispatchError) {
        setNotice({
          tone: "red",
          message: `Semana publicada, pero no se pudo enviar la notificación: ${appErrorMessage(dispatchError, "revisa la funcion de envio.")}`
        });
      } else {
        setNotice({ tone: "green", message: `Semana publicada. ${telegramDispatchMessage(data)}` });
      }
      await loadOperations();
    } catch (caught) {
      setNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo publicar la semana.") });
    } finally {
      setPublishing(false);
    }
  };

  const sendTelegramForPlan = async () => {
    if (!plan) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setDispatchingTelegram(true);
    setNotice(null);
    const { data, error } = await supabase.functions.invoke("telegram-dispatch", {
      body: { weeklyPlanId: plan.id }
    });
    setDispatchingTelegram(false);

    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo reenviar la semana.") });
      return;
    }

    setNotice({ tone: "green", message: telegramDispatchMessage(data) });
  };

  const completeTask = useCallback(async (task: OperationTaskRow) => {
    if (task.type === "aplicacion_foliar") {
      if (!materials.some((material) => material.task_id === task.id)) {
        setNotice({
          tone: "red",
          message: "Agrega al menos un producto y su dosis antes de completar la aplicación."
        });
        return;
      }
      setApplicationTask(task);
      return;
    }
    if (task.type === "riego") {
      setIrrigationTask(task);
      return;
    }
    if (task.type === "fertirriego" || task.type === "fertilizacion") {
      if (!materials.some((material) => material.task_id === task.id)) {
        setNotice({
          tone: "red",
          message: "Agrega al menos un producto y su dosis antes de completar la nutrición."
        });
        return;
      }
      setNutritionTask(task);
      return;
    }
    if (task.type === "cosecha") {
      setHarvestTask(task);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error } = await supabase.rpc("update_operational_task_status", {
      target_task_id: task.id,
      next_status: "completada",
      update_note: null
    });
    setCompleting(false);

    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo actualizar la actividad.") });
      return;
    }
    setNotice({ tone: "green", message: "Actividad completada." });
    await loadOperations();
  }, [loadOperations, materials]);

  useEffect(() => {
    if (!pendingCompletionTask?.id || loading || completing) return;
    const targetTask = tasks.find((task) => task.id === pendingCompletionTask.id);
    if (!targetTask) return;
    onPendingCompletionConsumed?.();
    completeTask(targetTask);
  }, [completeTask, completing, loading, onPendingCompletionConsumed, pendingCompletionTask?.id, tasks]);

  const completeApplication = async (payload: ApplicationExecutionPayload) => {
    if (!applicationTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { data, error } = await supabase.rpc("complete_application_task", {
      target_task_id: applicationTask.id,
      target_occurred_at: payload.occurredAt,
      target_applied_area: payload.appliedArea || null,
      target_applications: payload.applications.map((application) => ({
        materialId: application.materialId,
        productName: application.productName,
        dose: application.dose,
        category: applicationCategoryToDb[application.category as ApplicationRecord["category"]],
        composition: application.composition,
        safetyInterval: application.safetyInterval,
        reentryInterval: application.reentryInterval,
        notes: applicationNotesWithFollowUp(application)
      }))
    });
    setCompleting(false);

    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo guardar el registro técnico.") });
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
      dose: application.dose,
      area: payload.appliedArea,
      responsible: currentUser.fullName,
      safetyInterval: application.safetyInterval,
      reentry: application.reentryInterval,
      notes: applicationNotesWithFollowUp(application)
    })));
    setApplicationTask(null);
    setNotice({ tone: "green", message: "Aplicación completada y guardada en Registros técnicos." });
    await loadOperations();
  };

  const completeIrrigation = async (payload: IrrigationExecutionPayload) => {
    if (!irrigationTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
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
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo guardar el riego técnico.") });
      return;
    }

    addIrrigation({
      ...payload,
      id: rpcRecordId(data),
      greenhouseId: irrigationTask.greenhouse_id,
      responsible: currentUser.fullName
    });
    setIrrigationTask(null);
    setNotice({ tone: "green", message: "Riego completado y guardado en Registros técnicos." });
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
    const { data, error } = await supabase.rpc("complete_nutrition_task", {
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
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo guardar la nutrición técnica.") });
      return;
    }

    const recordIds = rpcRecordIds(data);
    payload.products.forEach((product, index) => addNutrition({
      id: recordIds[index],
      greenhouseId: nutritionTask.greenhouse_id,
      date: payload.date,
      product: product.productName,
      dose: product.dose,
      method: payload.method,
      ph: payload.ph ?? 0,
      ec: payload.ec ?? 0,
      stage: cropStage,
      objective: payload.objective,
      notes: payload.notes
    }));
    setNutritionTask(null);
    setNotice({ tone: "green", message: "Nutrición completada y guardada en Registros técnicos." });
    await loadOperations();
  };

  const completeHarvest = async (payload: HarvestExecutionPayload) => {
    if (!harvestTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
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
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo guardar la cosecha técnica.") });
      return;
    }

    addHarvest({ ...payload, id: rpcRecordId(data), greenhouseId: harvestTask.greenhouse_id });
    setHarvestTask(null);
    setNotice({ tone: "green", message: "Cosecha completada y guardada en Registros técnicos." });
    await loadOperations();
  };

  const blockTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!blockedTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { error } = await supabase.rpc("update_operational_task_status", {
      target_task_id: blockedTask.id,
      next_status: "bloqueada",
      update_note: blockedReason
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

  const completedCount = tasks.filter((task) => task.status === "completada").length;
  const blockedCount = tasks.filter((task) => task.status === "bloqueada").length;
  const todayCount = tasks.filter((task) => task.scheduled_date === todayKey && task.status !== "completada").length;
  const unassignedCount = tasks.filter((task) =>
    !assignmentsForTask(task.id).length && !staffAssignmentsForTask(task.id).length
  ).length;

  const openNewActivity = () => {
    setEditingTask(null);
    setActivityModalOpen(true);
  };

  const openEditActivity = (task: OperationTaskRow) => {
    setEditingTask(task);
    setActivityModalOpen(true);
  };

  const openBlockedTask = (task: OperationTaskRow) => {
    setBlockedReason("");
    setBlockedTask(task);
  };

  return (
    <section>
      <header className="mb-8 border-b border-app-border pb-7 pt-8 md:pt-10">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" />
            <h1 className="text-4xl font-light leading-none tracking-normal text-app-text md:text-6xl">Operación</h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">
              {canPlan
                ? "Planea la semana, asigna encargados y revisa la ejecución del equipo."
                : "Consulta, confirma y reporta las actividades bajo tu responsabilidad."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-label="Semana anterior"
              className="w-10 px-0"
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => setWeekStart((current) => addDays(current, -7))}
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
              onClick={() => setWeekStart((current) => addDays(current, 7))}
              variant="secondary"
            />
            {canPlan ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={openNewActivity} variant="primary">
                Nueva actividad
              </Button>
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
          <div className="grid border-y border-app-border sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Plan", plan?.status === "published" ? "Publicado" : plan ? "Borrador" : "Sin plan"],
              ["Hoy", String(todayCount)],
              ["Completadas", `${completedCount}/${tasks.length}`],
              ["Bloqueadas", String(blockedCount)],
              [canPlan ? "Sin asignar" : "Mi semana", canPlan ? String(unassignedCount) : String(tasks.length)]
            ].map(([label, value], index) => (
              <div key={label} className={`px-4 py-5 ${index ? "border-t border-app-border sm:border-l sm:border-t-0" : ""}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">{label}</p>
                <p className="mt-3 text-2xl font-light text-app-text">{value}</p>
              </div>
            ))}
          </div>

          {canPlan && plan && tasks.length ? (
            <div className="flex flex-col gap-3 border-b border-app-border py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-app-muted">
                {plan.status === "published"
                  ? "La semana está publicada. Puedes reenviarla si hiciste cambios."
                  : "Publica cuando instrucciones y responsables estén listos."}
              </p>
              {plan.status === "published" ? (
                <Button
                  disabled={dispatchingTelegram}
                  icon={<Send className="h-4 w-4" />}
                  onClick={sendTelegramForPlan}
                  variant="secondary"
                >
                  {dispatchingTelegram ? "Enviando..." : "Reenviar semana"}
                </Button>
              ) : (
                <Button
                  disabled={publishing}
                  icon={<Send className="h-4 w-4" />}
                  onClick={publishPlan}
                  variant="secondary"
                >
                  {publishing ? "Publicando..." : "Publicar semana"}
                </Button>
              )}
            </div>
          ) : null}

          {canPlan ? (
            <CopilotInlineSuggestions
              insights={copilotInsights.filter((insight) => !dismissedCopilotIds.includes(insight.id))}
              onCreateTask={onCreateCopilotTask}
              onDismiss={(insight) => setDismissedCopilotIds((current) => [...current, insight.id])}
              onPrepareMessage={onPrepareCopilotMessage}
            />
          ) : null}

          {loading ? (
            <div className="py-16 text-center text-sm text-app-muted">Cargando operación...</div>
          ) : tasks.length ? (
            <div className="mt-8 max-w-full overflow-x-auto overscroll-x-contain pb-2">
              <div className="grid xl:min-w-full xl:grid-flow-col xl:grid-rows-1 xl:auto-cols-[minmax(260px,1fr)]">
                {weekDays.map((date, dayIndex) => {
                  const key = dateKey(date);
                  const dayTasks = tasks.filter((task) => task.scheduled_date === key);
                  return (
                    <section key={key} className={`min-w-0 border-t border-app-border py-4 xl:px-4 ${dayIndex ? "xl:border-l" : ""}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-app-muted">{dayLabel(date)}</p>
                      {key === todayKey ? <StatusBadge tone="green">Hoy</StatusBadge> : null}
                    </div>
                    <div className="mt-4 grid gap-3">
                      {dayTasks.map((task) => {
                        const taskAssignments = assignmentsForTask(task.id);
                        const taskStaffAssignments = staffAssignmentsForTask(task.id);
                        const taskMaterials = materialsForTask(task.id);
                        const planSummary = technicalPlanSummary(task);
                        const assignedNames = [
                          ...taskAssignments.map((assignment) => managerName(assignment.user_id)),
                          ...taskStaffAssignments.map((assignment) => staffName(assignment.staff_id))
                        ];
                        return (
                          <article key={task.id} className="min-w-0 border-t border-app-border pt-4">
                            <div className="grid min-w-0 gap-2">
                              <p className="min-w-0 break-words text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
                                {task.scheduled_time?.slice(0, 5) || "Sin hora"} · {activityLabel(task)}
                              </p>
                              <div className="justify-self-start">
                                <StatusBadge tone={statusTones[task.status]}>{statusLabels[task.status]}</StatusBadge>
                              </div>
                            </div>
                            <h3 className="mt-3 break-words text-sm font-medium leading-5 text-app-text">{task.title}</h3>
                            <p className="mt-1 break-words text-xs leading-5 text-app-muted">
                              {greenhouseName(task.greenhouse_id)} · {executionLabels[task.execution_mode]}
                            </p>
                            {assignedNames.length ? (
                              <p className="mt-2 break-words text-xs leading-5 text-app-muted">
                                {assignedNames.join(", ")}
                              </p>
                            ) : <p className="mt-2 text-xs text-[#8A2E2E]">Sin encargado</p>}
                            {task.instructions ? <p className="mt-3 break-words text-xs leading-5 text-app-text">{task.instructions}</p> : null}
                            {planSummary ? <p className="mt-2 break-words text-xs leading-5 text-app-muted">{planSummary}</p> : null}
                            {taskMaterials.length ? (
                              <div className="mt-3 break-words border-l-2 border-app-green pl-2 text-xs leading-5 text-app-muted">
                                {taskMaterials
                                  .sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0))
                                  .map((material) => (
                                    <p key={material.id}>{material.product_name}{material.dose ? ` · ${material.dose}` : ""}{material.unit ? ` ${material.unit}` : ""}</p>
                                  ))}
                              </div>
                            ) : null}
                            {task.blocked_reason ? (
                              <p className="mt-3 flex gap-2 text-xs leading-5 text-[#7B2A2A]">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                {task.blocked_reason}
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-1">
                              {canPlan ? (
                                <Button
                                  aria-label={`Editar ${task.title}`}
                                  className="h-8 w-8 px-0"
                                  icon={<Edit3 className="h-3.5 w-3.5" />}
                                  onClick={() => openEditActivity(task)}
                                  title="Editar actividad"
                                  variant="ghost"
                                />
                              ) : null}
                              {task.status !== "completada" && task.status !== "cancelada" ? (
                                <>
                                  <Button aria-label="Bloquear actividad" className="h-8 w-8 px-0" disabled={completing} icon={<Ban className="h-3.5 w-3.5" />} onClick={() => openBlockedTask(task)} title="Bloquear actividad" variant="ghost" />
                                  <Button aria-label="Completar actividad" className="h-8 w-8 px-0" disabled={completing} icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => completeTask(task)} title="Completar actividad" variant="ghost" />
                                </>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                      {!dayTasks.length ? <p className="py-4 text-xs text-app-muted">Sin actividades</p> : null}
                    </div>
                  </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <EmptyState
                actionLabel={canPlan ? "Agregar actividad" : undefined}
                icon={CalendarRange}
                onAction={canPlan ? openNewActivity : undefined}
                title={canPlan ? "La semana todavía no tiene actividades." : "No tienes actividades asignadas esta semana."}
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

      <CompleteApplicationModal
        greenhouseName={applicationTask ? greenhouseName(applicationTask.greenhouse_id) : ""}
        materials={applicationTask ? materialsForTask(applicationTask.id) : []}
        onClose={() => setApplicationTask(null)}
        onSave={completeApplication}
        saving={completing}
        task={applicationTask}
      />

      <CompleteIrrigationModal
        greenhouseName={irrigationTask ? greenhouseName(irrigationTask.greenhouse_id) : ""}
        onClose={() => setIrrigationTask(null)}
        onSave={completeIrrigation}
        saving={completing}
        task={irrigationTask}
      />

      <CompleteNutritionModal
        greenhouseName={nutritionTask ? greenhouseName(nutritionTask.greenhouse_id) : ""}
        materials={nutritionTask ? materialsForTask(nutritionTask.id) : []}
        onClose={() => setNutritionTask(null)}
        onSave={completeNutrition}
        saving={completing}
        task={nutritionTask}
      />

      <CompleteHarvestModal
        greenhouseName={harvestTask ? greenhouseName(harvestTask.greenhouse_id) : ""}
        onClose={() => setHarvestTask(null)}
        onSave={completeHarvest}
        saving={completing}
        task={harvestTask}
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
    </section>
  );
}
