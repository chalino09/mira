"use client";

import {
  AlertTriangle,
  Ban,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  MessageCircle,
  Minus,
  Plus,
  Send,
  Users
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CopilotInlineSuggestions } from "@/components/copilot/MiraCopilot";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { Field, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { addDays, startOfIsoWeek, weekOfYear } from "@/lib/date";
import { appErrorMessage } from "@/lib/errors";
import { greenhouseDisplayName } from "@/lib/crop-ddt";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import type { CopilotInsight } from "@/lib/mira-copilot";
import type { ApplicationRecord, CropCatalogItem, CropStage, Greenhouse, HarvestRecord, IrrigationRecord, NutritionRecord } from "@/types";

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

type MaterialRow = {
  id: string;
  task_id: string;
  product_name: string;
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

type OperationGreenhouseOption = {
  id: string;
  name: string;
};

type MaterialDraft = {
  productName: string;
  dose: string;
  unit: string;
  notes: string;
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
  stage: CropStage;
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
  "Bioestimulante",
  "Fungicida",
  "Insecticida",
  "Fertilizante",
  "Microorganismos",
  "Corrector"
];

const doseUnitOptions = ["ml/L", "g/L", "L/ha", "kg/ha", "ml/20 L", "g/20 L", "cc/L", "%"];

const applicationEffectivenessOptions = [
  "Pendiente de revisión",
  "Funcionó",
  "Requiere reaplicación",
  "Subió población de plaga"
];

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
  Bioestimulante: "bioestimulante",
  Fungicida: "fungicida",
  Insecticida: "insecticida",
  Fertilizante: "fertilizante",
  Microorganismos: "microorganismos",
  Corrector: "corrector"
};

const nutritionMethodToDb: Record<NutritionRecord["method"], string> = {
  Fertirriego: "fertirriego",
  Foliar: "foliar",
  Drench: "drench"
};

const cropStageToDb: Record<CropStage, string> = {
  Vegetativo: "vegetativo",
  Floración: "floracion",
  Cuajado: "cuajado",
  Producción: "produccion"
};

const nutritionObjectiveToDb: Record<NutritionRecord["objective"], string> = {
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

function emptyMaterial(): MaterialDraft {
  return { productName: "", dose: "", unit: "", notes: "" };
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
      objective: plan.objective ?? "Calidad",
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
  const textValue = String(value ?? "").trim();
  return textValue ? Number(textValue) : null;
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
  task,
  assignments,
  materials
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: ActivityPayload) => Promise<void>;
  saving: boolean;
  weekDays: Date[];
  greenhouses: Array<Pick<Greenhouse, "id" | "name" | "cropId">>;
  crops: CropCatalogItem[];
  managers: ManagerOption[];
  task: OperationTaskRow | null;
  assignments: AssignmentRow[];
  materials: MaterialRow[];
}) {
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialDraft[]>([emptyMaterial()]);
  const [activityType, setActivityType] = useState("fertirriego");
  const [technicalPlan, setTechnicalPlan] = useState<TechnicalPlan>({});
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAssigneeIds(task ? assignments.filter((item) => item.task_id === task.id).map((item) => item.user_id) : []);
    const taskMaterials = task
      ? materials
          .filter((item) => item.task_id === task.id)
          .sort((a, b) => (a.mixing_order ?? 0) - (b.mixing_order ?? 0))
          .map((item) => ({
            productName: item.product_name,
            dose: item.dose ?? "",
            unit: item.unit ?? "",
            notes: item.notes ?? ""
          }))
      : [];
    setMaterialRows(taskMaterials.length ? taskMaterials : [emptyMaterial()]);
    setActivityType(task?.type === "otro" && task.technical_plan?.cycleWorkType ? "preparacion_ciclo" : task?.type ?? "fertirriego");
    setTechnicalPlan(task?.technical_plan ?? {});
    setFormError("");
  }, [assignments, materials, open, task]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (!assigneeIds.length) {
      setFormError("Selecciona al menos un encargado.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const dbActivityType = activityType === "preparacion_ciclo" ? "otro" : activityType;
    await onSave({
      greenhouseId: String(form.get("greenhouseId")),
      type: dbActivityType,
      title: String(form.get("title")),
      scheduledDate: String(form.get("scheduledDate")),
      scheduledTime: String(form.get("scheduledTime") ?? ""),
      priority: String(form.get("priority")) as TaskPriority,
      instructions: String(form.get("instructions") ?? ""),
      executionMode: String(form.get("executionMode")) as ExecutionMode,
      crewSize: String(form.get("crewSize") ?? "").trim() ? Number(form.get("crewSize")) : null,
      assigneeIds,
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
            <SelectInput name="greenhouseId" defaultValue={task?.greenhouse_id ?? greenhouses[0]?.id} required>
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
            <SelectInput name="scheduledDate" defaultValue={task?.scheduled_date ?? dateKey(weekDays[0])}>
              {weekDays.map((date) => (
                <option key={dateKey(date)} value={dateKey(date)}>{dayLabel(date)}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Hora">
            <TextInput name="scheduledTime" type="time" defaultValue={task?.scheduled_time?.slice(0, 5) ?? ""} />
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
            <TextInput min={0} name="crewSize" type="number" defaultValue={task?.crew_size ?? ""} />
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
                <TextInput min={1} onChange={(event) => updateTechnicalPlan({ plannedDurationMin: event.target.value })} type="number" value={technicalPlan.plannedDurationMin ?? ""} />
              </Field>
              <Field label="Litros planeados">
                <TextInput min={0} onChange={(event) => updateTechnicalPlan({ plannedLiters: event.target.value })} step="0.01" type="number" value={technicalPlan.plannedLiters ?? ""} />
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
                  value={technicalPlan.objective ?? "Calidad"}
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
            {!managers.length ? <p className="text-sm text-app-muted">No hay managers activos para asignar.</p> : null}
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
                <TextInput
                  aria-label={`Producto ${index + 1}`}
                  onChange={(event) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, productName: event.target.value } : item
                  ))}
                  placeholder="Producto"
                  value={material.productName}
                />
                <TextInput
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
          <Button disabled={saving || !managers.length} type="submit" variant="primary">
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
          composition: "",
          safetyInterval: "",
          reentryInterval: "",
          effectiveness: "Pendiente de revisión",
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
    <Modal open={Boolean(task)} onClose={onClose} title="Confirmar aplicación realizada">
      <form className="grid gap-6" onSubmit={handleSubmit}>
        <div className="border-l-2 border-app-green pl-3">
          <p className="text-sm font-medium text-app-text">{task?.title}</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            {greenhouseName}. La receta planeada se conserva y estos datos quedarán en Registros técnicos.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real de aplicación">
            <TextInput onChange={(event) => setOccurredAt(event.target.value)} required type="date" value={occurredAt} />
          </Field>
          <Field label="Área aplicada">
            <TextInput onChange={(event) => setAppliedArea(event.target.value)} placeholder="Área completa o sección 1" value={appliedArea} />
          </Field>
        </div>

        <div className="grid gap-5 border-t border-app-border pt-5">
          {applications.map((application, index) => (
            <section key={application.materialId} className="grid gap-3 border-b border-app-border pb-5 last:border-b-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`Producto ${index + 1}`}>
                  <TextInput
                    onChange={(event) => updateApplication(index, { productName: event.target.value })}
                    required
                    value={application.productName}
                  />
                </Field>
                <Field label="Dosis real">
                  <TextInput
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
                <Field label="Ingrediente activo o composición">
                  <TextInput
                    onChange={(event) => updateApplication(index, { composition: event.target.value })}
                    placeholder="Se llenará desde catálogo cuando esté disponible"
                    value={application.composition}
                  />
                </Field>
                <Field label="Intervalo de seguridad (antes de cosecha)">
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
                <Field label="Revisión de eficacia">
                  <SelectInput
                    onChange={(event) => updateApplication(index, { effectiveness: event.target.value })}
                    value={application.effectiveness}
                  >
                    {applicationEffectivenessOptions.map((option) => <option key={option}>{option}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Fecha de revisión">
                  <TextInput
                    onChange={(event) => updateApplication(index, { reviewDate: event.target.value })}
                    type="date"
                    value={application.reviewDate}
                  />
                </Field>
                <Field label="Fecha de reaplicación">
                  <TextInput
                    onChange={(event) => updateApplication(index, { reapplicationDate: event.target.value })}
                    type="date"
                    value={application.reapplicationDate}
                  />
                </Field>
                <Field label="Observaciones">
                  <TextInput
                    onChange={(event) => updateApplication(index, { notes: event.target.value })}
                    placeholder="Población, daño o condición observada"
                    value={application.notes}
                  />
                </Field>
              </div>
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
      durationMin: Number(form.get("durationMin")),
      liters: Number(form.get("liters")),
      sector: String(form.get("sector") ?? ""),
      ph: optionalFormNumber(form.get("ph")),
      ec: optionalFormNumber(form.get("ec")),
      notes: String(form.get("notes") ?? "")
    });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} title="Confirmar riego realizado">
      <form className="grid gap-5" key={task?.id ?? "irrigation-completion"} onSubmit={handleSubmit}>
        <p className="text-sm text-app-muted">{task?.title} · {greenhouseName}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real"><TextInput name="date" required type="date" defaultValue={dateKey(new Date())} /></Field>
          <Field label="Duración min"><TextInput min={1} name="durationMin" required type="number" defaultValue={task?.technical_plan?.plannedDurationMin ?? ""} /></Field>
          <Field label="Litros estimados"><TextInput min={0.01} name="liters" required step="0.01" type="number" defaultValue={task?.technical_plan?.plannedLiters ?? ""} /></Field>
          <Field label="Sector o válvula"><TextInput name="sector" defaultValue={task?.technical_plan?.sector ?? ""} /></Field>
          <Field label="pH"><TextInput name="ph" step="0.1" type="number" defaultValue={task?.technical_plan?.targetPh ?? ""} /></Field>
          <Field label="CE"><TextInput name="ec" step="0.1" type="number" defaultValue={task?.technical_plan?.targetEc ?? ""} /></Field>
          <Field className="sm:col-span-2" label="Observaciones"><TextArea name="notes" defaultValue={task?.instructions ?? ""} /></Field>
        </div>
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
  defaultStage,
  saving,
  onClose,
  onSave
}: {
  task: OperationTaskRow | null;
  materials: MaterialRow[];
  greenhouseName: string;
  defaultStage: CropStage;
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
      stage: String(form.get("stage")) as CropStage,
      objective: String(form.get("objective")) as NutritionRecord["objective"],
      ph: optionalFormNumber(form.get("ph")),
      ec: optionalFormNumber(form.get("ec")),
      notes: String(form.get("notes") ?? ""),
      products
    });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} title="Confirmar nutrición realizada">
      <form className="grid gap-5" key={task?.id ?? "nutrition-completion"} onSubmit={handleSubmit}>
        <p className="text-sm text-app-muted">{task?.title} · {greenhouseName}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real"><TextInput name="date" required type="date" defaultValue={dateKey(new Date())} /></Field>
          <Field label="Método">
            <SelectInput name="method" defaultValue={task?.technical_plan?.method ?? "Fertirriego"}>
              {Object.keys(nutritionMethodToDb).map((method) => <option key={method}>{method}</option>)}
            </SelectInput>
          </Field>
          <Field label="Etapa">
            <SelectInput name="stage" defaultValue={defaultStage}>{Object.keys(cropStageToDb).map((stage) => <option key={stage}>{stage}</option>)}</SelectInput>
          </Field>
          <Field label="Objetivo">
            <SelectInput name="objective" defaultValue={task?.technical_plan?.objective ?? "Calidad"}>{Object.keys(nutritionObjectiveToDb).map((objective) => <option key={objective}>{objective}</option>)}</SelectInput>
          </Field>
          <Field label="pH"><TextInput name="ph" step="0.1" type="number" defaultValue={task?.technical_plan?.targetPh ?? ""} /></Field>
          <Field label="CE"><TextInput name="ec" step="0.1" type="number" defaultValue={task?.technical_plan?.targetEc ?? ""} /></Field>
        </div>
        <div className="grid gap-3 border-t border-app-border pt-4">
          {products.map((product, index) => (
            <div key={product.materialId} className="grid gap-2 sm:grid-cols-2">
              <TextInput
                aria-label={`Producto ${index + 1}`}
                onChange={(event) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productName: event.target.value } : item))}
                required
                value={product.productName}
              />
              <TextInput
                aria-label={`Dosis real ${index + 1}`}
                onChange={(event) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dose: event.target.value } : item))}
                required
                value={product.dose}
              />
            </div>
          ))}
        </div>
        <Field label="Observaciones"><TextArea name="notes" defaultValue={task?.instructions ?? ""} /></Field>
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
      kilograms: Number(form.get("kilograms")),
      firstQuality: Number(form.get("firstQuality") || 0),
      secondQuality: Number(form.get("secondQuality") || 0),
      discard: Number(form.get("discard") || 0),
      estimatedPrice: Number(form.get("estimatedPrice") || 0),
      destination: String(form.get("destination") ?? ""),
      notes: String(form.get("notes") ?? "")
    });
  };

  return (
    <Modal open={Boolean(task)} onClose={onClose} title="Confirmar cosecha realizada">
      <form className="grid gap-5" key={task?.id ?? "harvest-completion"} onSubmit={handleSubmit}>
        <p className="text-sm text-app-muted">
          {task?.title} · {greenhouseName}{task?.technical_plan?.harvestZone ? ` · ${task.technical_plan.harvestZone}` : ""}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha real"><TextInput name="date" required type="date" defaultValue={dateKey(new Date())} /></Field>
          <Field label="Kilogramos totales"><TextInput min={0.01} name="kilograms" required step="0.01" type="number" /></Field>
          <Field label="Primera calidad"><TextInput min={0} name="firstQuality" step="0.01" type="number" defaultValue={0} /></Field>
          <Field label="Segunda calidad"><TextInput min={0} name="secondQuality" step="0.01" type="number" defaultValue={0} /></Field>
          <Field label="Descarte"><TextInput min={0} name="discard" step="0.01" type="number" defaultValue={0} /></Field>
          <Field label="Precio estimado"><TextInput min={0} name="estimatedPrice" step="0.01" type="number" defaultValue={0} /></Field>
          <Field className="sm:col-span-2" label="Cliente o destino"><TextInput name="destination" /></Field>
          <Field className="sm:col-span-2" label="Observaciones"><TextArea name="notes" defaultValue={task?.instructions ?? ""} /></Field>
        </div>
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
  onCreateCopilotTask,
  onPrepareCopilotMessage
}: {
  copilotInsights?: CopilotInsight[];
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
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
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

  const loadOperations = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;

    setLoading(true);
    setSetupRequired(false);
    const [planResponse, tasksResponse, membersResponse] = await Promise.all([
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
        .eq("status", "active")
    ]);

    const baseError = planResponse.error ?? tasksResponse.error ?? membersResponse.error;
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

    const [assignmentsResponse, materialsResponse, profilesResponse, greenhousesResponse] = await Promise.all([
      taskIds.length
        ? supabase.from("task_assignments").select("id, task_id, user_id").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("task_materials").select("id, task_id, product_name, dose, unit, mixing_order, notes").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      managerIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", managerIds)
        : Promise.resolve({ data: [], error: null }),
      taskGreenhouseIds.length
        ? supabase.from("greenhouses").select("id, name").eq("company_id", organization.id).in("id", taskGreenhouseIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const detailError = assignmentsResponse.error ?? materialsResponse.error ?? profilesResponse.error ?? greenhousesResponse.error;
    if (detailError) {
      setNotice({ tone: "red", message: appErrorMessage(detailError, "Faltan detalles de algunas actividades.") });
    }

    const profileMap = new Map((profilesResponse.data ?? []).map((profile: any) => [profile.id, profile]));
    setPlan((planResponse.data as WeeklyPlanRow | null) ?? null);
    setTasks(taskRows);
    setAssignments((assignmentsResponse.data ?? []) as AssignmentRow[]);
    setMaterials((materialsResponse.data ?? []) as MaterialRow[]);
    setOperationGreenhouses((greenhousesResponse.data ?? []) as OperationGreenhouseOption[]);
    setManagers(managerIds.map((id) => {
      const profile = profileMap.get(id);
      return {
        id,
        name: profile?.full_name ?? profile?.email?.split("@")[0] ?? "Encargado",
        email: profile?.email ?? ""
      };
    }));
    setLoading(false);
  }, [organization.id, weekEndKey, weekStartKey]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  const assignmentsForTask = (taskId: string) => assignments.filter((item) => item.task_id === taskId);
  const materialsForTask = (taskId: string) => materials.filter((item) => item.task_id === taskId);
  const managerName = (userId: string) => managers.find((manager) => manager.id === userId)?.name ?? "Encargado";
  const greenhouseName = (greenhouseId: string) =>
    (greenhouses.find((item) => item.id === greenhouseId)
      ? greenhouseDisplayName(greenhouses.find((item) => item.id === greenhouseId)!, crops)
      : operationGreenhouses.find((item) => item.id === greenhouseId)?.name) ??
    "Área productiva";

  const saveActivity = async (payload: ActivityPayload) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSaving(true);
    setNotice(null);
    try {
      const rpcName = editingTask ? "update_operational_task_with_plan" : "create_operational_task_with_plan";
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
            target_materials: payload.materials.map((material, index) => ({ ...material, mixingOrder: index + 1 })),
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
            target_materials: payload.materials.map((material, index) => ({ ...material, mixingOrder: index + 1 })),
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

  const completeTask = async (task: OperationTaskRow) => {
    if (task.type === "aplicacion_foliar") {
      if (!materialsForTask(task.id).length) {
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
      if (!materialsForTask(task.id).length) {
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
  };

  const completeApplication = async (payload: ApplicationExecutionPayload) => {
    if (!applicationTask) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCompleting(true);
    setNotice(null);
    const { error } = await supabase.rpc("complete_application_task", {
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

    addApplicationRecords(payload.applications.map((application) => ({
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
    const { error } = await supabase.rpc("complete_irrigation_task", {
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
    const { error } = await supabase.rpc("complete_nutrition_task", {
      target_task_id: nutritionTask.id,
      target_occurred_at: payload.date,
      target_method: nutritionMethodToDb[payload.method],
      target_crop_stage: cropStageToDb[payload.stage],
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

    payload.products.forEach((product) => addNutrition({
      greenhouseId: nutritionTask.greenhouse_id,
      date: payload.date,
      product: product.productName,
      dose: product.dose,
      method: payload.method,
      ph: payload.ph ?? 0,
      ec: payload.ec ?? 0,
      stage: payload.stage,
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
    const { error } = await supabase.rpc("complete_harvest_task", {
      target_task_id: harvestTask.id,
      target_occurred_at: payload.date,
      target_kilograms: payload.kilograms,
      target_first_quality_kg: payload.firstQuality,
      target_second_quality_kg: payload.secondQuality,
      target_discard_kg: payload.discard,
      target_estimated_price: payload.estimatedPrice,
      target_destination: payload.destination || null,
      target_notes: payload.notes || null
    });
    setCompleting(false);
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo guardar la cosecha técnica.") });
      return;
    }

    addHarvest({ ...payload, greenhouseId: harvestTask.greenhouse_id });
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
  const unassignedCount = tasks.filter((task) => !assignmentsForTask(task.id).length).length;

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
                        const taskMaterials = materialsForTask(task.id);
                        const planSummary = technicalPlanSummary(task);
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
                            {taskAssignments.length ? (
                              <p className="mt-2 break-words text-xs leading-5 text-app-muted">
                                {taskAssignments.map((assignment) => managerName(assignment.user_id)).join(", ")}
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

          <div className="mt-10 grid gap-4 border-t border-app-border py-6 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 text-app-green" />
              <div><p className="text-sm font-medium">Planeación enviada</p><p className="mt-1 text-xs leading-5 text-app-muted">Al publicar, Mira prepara y envía la semana a los encargados.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-4 w-4 text-app-green" />
              <div><p className="text-sm font-medium">Responsable operativo</p><p className="mt-1 text-xs leading-5 text-app-muted">El manager coordina también a la cuadrilla.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 h-4 w-4 text-app-green" />
              <div><p className="text-sm font-medium">Canal de avisos</p><p className="mt-1 text-xs leading-5 text-app-muted">Los encargados conectados reciben sus actividades asignadas.</p></div>
            </div>
          </div>
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
        saving={saving}
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
        defaultStage={greenhouses.find((greenhouse) => greenhouse.id === nutritionTask?.greenhouse_id)?.stage ?? "Producción"}
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
