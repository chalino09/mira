"use client";

import {
  AlertTriangle,
  Ban,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  MessageCircle,
  Minus,
  Play,
  Plus,
  Send,
  Users
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { Field, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { addDays, startOfIsoWeek, weekOfYear } from "@/lib/date";
import { appErrorMessage } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";

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
};

type AssignmentRow = {
  id: string;
  task_id: string;
  user_id: string;
  acknowledged_at: string | null;
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

type MaterialDraft = {
  productName: string;
  dose: string;
  unit: string;
  notes: string;
};

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
};

const activityTypes = [
  { value: "riego", label: "Riego" },
  { value: "fertirriego", label: "Fertirriego" },
  { value: "fertilizacion", label: "Fertilización" },
  { value: "aplicacion_foliar", label: "Aplicación foliar" },
  { value: "revision_plagas", label: "Revisión de plagas" },
  { value: "poda", label: "Poda" },
  { value: "tutoreo", label: "Tutoreo" },
  { value: "deshoje", label: "Deshoje" },
  { value: "cosecha", label: "Cosecha" },
  { value: "limpieza", label: "Limpieza" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "otro", label: "Otra actividad" }
];

const activityLabels = Object.fromEntries(activityTypes.map((item) => [item.value, item.label]));

const statusLabels: Record<OperationStatus, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  bloqueada: "Bloqueada",
  completada: "Completada",
  cancelada: "Cancelada"
};

const statusTones: Record<OperationStatus, "neutral" | "green" | "amber" | "red"> = {
  pendiente: "neutral",
  en_progreso: "amber",
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

function isOperationsSetupError(error: any) {
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(error?.code);
}

function emptyMaterial(): MaterialDraft {
  return { productName: "", dose: "", unit: "", notes: "" };
}

function ActivityFormModal({
  open,
  onClose,
  onSave,
  saving,
  weekDays,
  greenhouses,
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
  greenhouses: Array<{ id: string; name: string }>;
  managers: ManagerOption[];
  task: OperationTaskRow | null;
  assignments: AssignmentRow[];
  materials: MaterialRow[];
}) {
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [materialRows, setMaterialRows] = useState<MaterialDraft[]>([emptyMaterial()]);
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
    await onSave({
      greenhouseId: String(form.get("greenhouseId")),
      type: String(form.get("type")),
      title: String(form.get("title")),
      scheduledDate: String(form.get("scheduledDate")),
      scheduledTime: String(form.get("scheduledTime") ?? ""),
      priority: String(form.get("priority")) as TaskPriority,
      instructions: String(form.get("instructions") ?? ""),
      executionMode: String(form.get("executionMode")) as ExecutionMode,
      crewSize: String(form.get("crewSize") ?? "").trim() ? Number(form.get("crewSize")) : null,
      assigneeIds,
      materials: materialRows.filter((item) => item.productName.trim())
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? "Editar actividad" : "Nueva actividad semanal"}>
      <form className="grid gap-6" key={task?.id ?? "new-operation"} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invernadero">
            <SelectInput name="greenhouseId" defaultValue={task?.greenhouse_id ?? greenhouses[0]?.id} required>
              {greenhouses.map((greenhouse) => (
                <option key={greenhouse.id} value={greenhouse.id}>{greenhouse.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Actividad">
            <SelectInput name="type" defaultValue={task?.type ?? "fertirriego"}>
              {activityTypes.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field className="sm:col-span-2" label="Título">
            <TextInput name="title" defaultValue={task?.title ?? ""} placeholder="Fertirriego matutino Casa 1" required />
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
                <TextInput
                  aria-label={`Unidad ${index + 1}`}
                  onChange={(event) => setMaterialRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, unit: event.target.value } : item
                  ))}
                  placeholder="Unidad"
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

export function OperationsSection() {
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek());
  const [plan, setPlan] = useState<WeeklyPlanRow | null>(null);
  const [tasks, setTasks] = useState<OperationTaskRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<OperationTaskRow | null>(null);
  const [blockedTask, setBlockedTask] = useState<OperationTaskRow | null>(null);
  const [blockedReason, setBlockedReason] = useState("");

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
        .select("id, weekly_plan_id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, priority, instructions, execution_mode, crew_size, blocked_reason")
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
    const managerIds = (membersResponse.data ?? [])
      .map((member: any) => member.user_id)
      .filter((id: string | null): id is string => Boolean(id));

    const [assignmentsResponse, materialsResponse, profilesResponse] = await Promise.all([
      taskIds.length
        ? supabase.from("task_assignments").select("id, task_id, user_id, acknowledged_at").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? supabase.from("task_materials").select("id, task_id, product_name, dose, unit, mixing_order, notes").in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      managerIds.length
        ? supabase.from("profiles").select("id, full_name, email").in("id", managerIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    const detailError = assignmentsResponse.error ?? materialsResponse.error ?? profilesResponse.error;
    if (detailError) {
      setNotice({ tone: "red", message: appErrorMessage(detailError, "Faltan detalles de algunas actividades.") });
    }

    const profileMap = new Map((profilesResponse.data ?? []).map((profile: any) => [profile.id, profile]));
    setPlan((planResponse.data as WeeklyPlanRow | null) ?? null);
    setTasks(taskRows);
    setAssignments((assignmentsResponse.data ?? []) as AssignmentRow[]);
    setMaterials((materialsResponse.data ?? []) as MaterialRow[]);
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
  const greenhouseName = (greenhouseId: string) => greenhouses.find((item) => item.id === greenhouseId)?.name ?? "Invernadero";

  const saveActivity = async (payload: ActivityPayload) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSaving(true);
    setNotice(null);
    try {
      const rpcName = editingTask ? "update_operational_task" : "create_operational_task";
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
            target_materials: payload.materials.map((material, index) => ({ ...material, mixingOrder: index + 1 }))
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
            target_materials: payload.materials.map((material, index) => ({ ...material, mixingOrder: index + 1 }))
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
    const { error } = await supabase.rpc("publish_weekly_plan", { target_plan_id: plan.id });
    setPublishing(false);
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo publicar la semana.") });
      return;
    }
    setNotice({ tone: "green", message: "Semana publicada y notificaciones preparadas." });
    await loadOperations();
  };

  const runTaskAction = async (task: OperationTaskRow, action: "acknowledge" | "start" | "complete") => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setNotice(null);
    const { error } = action === "acknowledge"
      ? await supabase.rpc("acknowledge_operational_task", { target_task_id: task.id })
      : await supabase.rpc("update_operational_task_status", {
          target_task_id: task.id,
          next_status: action === "start" ? "en_progreso" : "completada",
          update_note: null
        });

    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo actualizar la actividad.") });
      return;
    }
    setNotice({ tone: "green", message: action === "acknowledge" ? "Actividad confirmada." : "Estado actualizado." });
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
                  ? "La semana está publicada. Los cambios posteriores quedan en el historial."
                  : "Publica cuando instrucciones y responsables estén listos."}
              </p>
              <Button
                disabled={publishing || plan.status === "published"}
                icon={<Send className="h-4 w-4" />}
                onClick={publishPlan}
                variant="secondary"
              >
                {publishing ? "Publicando..." : plan.status === "published" ? "Semana publicada" : "Publicar semana"}
              </Button>
            </div>
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
                        const ownAssignment = taskAssignments.find((item) => item.user_id === currentUser.id);
                        const managerReady = canPlan || !ownAssignment || Boolean(ownAssignment.acknowledged_at);
                        return (
                          <article key={task.id} className="min-w-0 border-t border-app-border pt-4">
                            <div className="grid min-w-0 gap-2">
                              <p className="min-w-0 break-words text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">
                                {task.scheduled_time?.slice(0, 5) || "Sin hora"} · {activityLabels[task.type] ?? task.type}
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
                              {!canPlan && ownAssignment && !ownAssignment.acknowledged_at ? (
                                <Button aria-label="Confirmar actividad" className="h-8 w-8 px-0" icon={<Check className="h-3.5 w-3.5" />} onClick={() => runTaskAction(task, "acknowledge")} title="Confirmar actividad" variant="ghost" />
                              ) : null}
                              {task.status === "pendiente" || task.status === "bloqueada" ? (
                                <Button aria-label="Iniciar actividad" className="h-8 w-8 px-0" disabled={!managerReady} icon={<Play className="h-3.5 w-3.5" />} onClick={() => runTaskAction(task, "start")} title="Iniciar actividad" variant="ghost" />
                              ) : null}
                              {task.status !== "completada" && task.status !== "cancelada" ? (
                                <>
                                  <Button aria-label="Bloquear actividad" className="h-8 w-8 px-0" disabled={!managerReady} icon={<Ban className="h-3.5 w-3.5" />} onClick={() => openBlockedTask(task)} title="Bloquear actividad" variant="ghost" />
                                  <Button aria-label="Completar actividad" className="h-8 w-8 px-0" disabled={!managerReady} icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => runTaskAction(task, "complete")} title="Completar actividad" variant="ghost" />
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
              <div><p className="text-sm font-medium">Recordatorio diario</p><p className="mt-1 text-xs leading-5 text-app-muted">La cola queda preparada para Telegram.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-4 w-4 text-app-green" />
              <div><p className="text-sm font-medium">Responsable operativo</p><p className="mt-1 text-xs leading-5 text-app-muted">El manager coordina también a la cuadrilla.</p></div>
            </div>
            <div className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 h-4 w-4 text-app-green" />
              <div><p className="text-sm font-medium">Canal conversacional</p><p className="mt-1 text-xs leading-5 text-app-muted">Telegram se conectará en la siguiente entrega.</p></div>
            </div>
          </div>
        </>
      )}

      <ActivityFormModal
        assignments={assignments}
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
