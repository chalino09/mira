import type { Greenhouse, PestAlert, Task } from "@/types";

export type CopilotSeverity = "low" | "medium" | "high" | "critical";

export type CopilotEvidence = {
  label: string;
  value: string;
};

export type CopilotInsight = {
  id: string;
  sourceType: "operation" | "weather" | "nutrition" | "lab" | "costs" | "report" | "telegram";
  sourceId?: string | null;
  greenhouseId?: string | null;
  title: string;
  detail: string;
  severity: CopilotSeverity;
  recommendedAction: string;
  evidence: CopilotEvidence[];
};

export type CopilotBrief = {
  title: string;
  summary: string;
  recommendation: string;
  actionHint: string;
  severity: CopilotSeverity;
  primaryInsight?: CopilotInsight;
  evidence: CopilotEvidence[];
};

type OperationLikeTask = {
  id: string;
  greenhouseId?: string;
  greenhouse_id?: string;
  type: string;
  title: string;
  date?: string;
  scheduled_date?: string;
  status: string;
  blocked_reason?: string | null;
};

type BuildCopilotPulseInput = {
  greenhouses: Array<Pick<Greenhouse, "id" | "name" | "manager">>;
  tasks: OperationLikeTask[];
  alerts?: PestAlert[];
  activeGreenhouseId?: string | null;
};

const taskTypeLabels: Record<string, string> = {
  Riego: "Riego",
  Fertirriego: "Fertirriego",
  Fertilización: "Fertilizacion",
  "Aplicación foliar": "Aplicacion foliar",
  "Revisión de plagas y enfermedades": "Revision sanitaria",
  Deschuponado: "Deschuponado",
  "Manejo de rafia": "Manejo de rafia",
  Deshoje: "Deshoje",
  Cosecha: "Cosecha",
  Limpieza: "Limpieza",
  Mantenimiento: "Mantenimiento",
  "Preparación de ciclo": "Preparacion de ciclo",
  Otra: "Otra actividad",
  riego: "Riego",
  fertirriego: "Fertirriego",
  fertilizacion: "Fertirriego",
  aplicacion_foliar: "Aplicacion foliar",
  revision_plagas: "Revision sanitaria",
  poda: "Deschuponado",
  tutoreo: "Manejo de rafia",
  deshoje: "Deshoje",
  cosecha: "Cosecha",
  limpieza: "Limpieza",
  mantenimiento: "Mantenimiento",
  otro: "Otra actividad"
};

export function localDateKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function copilotSeverityLabel(severity: CopilotSeverity) {
  if (severity === "critical") return "Critico";
  if (severity === "high") return "Alto";
  if (severity === "medium") return "Medio";
  return "Bajo";
}

export function copilotSeverityClass(severity: CopilotSeverity) {
  if (severity === "critical") return "border-[#51302D] bg-[#2B1512] text-[#FFD8D0]";
  if (severity === "high") return "border-[#E3BDBD] bg-app-red text-[#7B2A2A]";
  if (severity === "medium") return "border-[#E3D7B6] bg-[#FFF8E6] text-[#725A1A]";
  return "border-[#C8DFC9] bg-app-soft text-app-green";
}

export function operationTypeLabel(type: string) {
  return taskTypeLabels[type] ?? type;
}

export function taskGreenhouseId(task: OperationLikeTask) {
  return task.greenhouseId ?? task.greenhouse_id ?? null;
}

export function taskDate(task: OperationLikeTask) {
  return task.date ?? task.scheduled_date ?? "";
}

export function isTaskIncomplete(status: string) {
  const normalized = status.toLowerCase();
  return !["completada", "completado", "cancelada", "cancelado"].includes(normalized);
}

function greenhouseName(greenhouses: BuildCopilotPulseInput["greenhouses"], greenhouseId?: string | null) {
  return greenhouses.find((greenhouse) => greenhouse.id === greenhouseId)?.name ?? "Area productiva";
}

function managerName(greenhouses: BuildCopilotPulseInput["greenhouses"], greenhouseId?: string | null) {
  return greenhouses.find((greenhouse) => greenhouse.id === greenhouseId)?.manager ?? "manager";
}

function insightId(prefix: string, id: string) {
  return `copilot-${prefix}-${id}`;
}

function isClearInsight(insight: CopilotInsight) {
  return insight.id === "copilot-clear" || insight.severity === "low";
}

function naturalList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function strongestSeverity(insights: CopilotInsight[]): CopilotSeverity {
  if (insights.some((insight) => insight.severity === "critical")) return "critical";
  if (insights.some((insight) => insight.severity === "high")) return "high";
  if (insights.some((insight) => insight.severity === "medium")) return "medium";
  return "low";
}

export function buildCopilotBrief(insights: CopilotInsight[]): CopilotBrief {
  const actionable = insights.filter((insight) => !isClearInsight(insight));
  const primary = actionable[0] ?? insights[0];
  const severity = strongestSeverity(actionable.length ? actionable : insights);

  if (!actionable.length) {
    return {
      title: "Pulso estable",
      summary: "Leí el contexto visible y no veo atrasos, bloqueos o alertas que pidan atención inmediata.",
      recommendation: "Mantén el seguimiento normal de la jornada y vuelve a correr Mira cuando cambie el plan o entren nuevos datos.",
      actionHint: "Si quieres, puedo revisar otra hectárea o toda la operación.",
      severity: "low",
      primaryInsight: primary,
      evidence: primary?.evidence ?? []
    };
  }

  const operationCount = actionable.filter((insight) => insight.sourceType === "operation").length;
  const technicalSources = actionable
    .filter((insight) => insight.sourceType !== "operation")
    .map((insight) => {
      if (insight.sourceType === "weather") return "clima";
      if (insight.sourceType === "lab") return "laboratorio";
      if (insight.sourceType === "nutrition") return "nutrición";
      if (insight.sourceType === "costs") return "costos";
      return insight.sourceType;
    });
  const uniqueTechnicalSources = Array.from(new Set(technicalSources));
  const topicSummary = [
    operationCount ? `${operationCount} tema${operationCount === 1 ? "" : "s"} operativo${operationCount === 1 ? "" : "s"}` : "",
    uniqueTechnicalSources.length ? naturalList(uniqueTechnicalSources) : ""
  ].filter(Boolean);

  const intro =
    actionable.length === 1
      ? "Leí la información disponible y encontré un punto que conviene atender."
      : `Leí la información disponible y encontré ${actionable.length} puntos que conviene priorizar.`;
  const context = topicSummary.length ? ` Incluye ${naturalList(topicSummary)}.` : "";
  const priority = primary
    ? ` La prioridad es: ${primary.detail}`
    : " La prioridad es confirmar que no haya pendientes críticos sin cierre.";

  return {
    title: "Recomendación de Mira",
    summary: `${intro}${context}${priority}`,
    recommendation: primary?.recommendedAction || "Recomiendo confirmar el avance con el responsable y dejar seguimiento listo si no se cierra hoy.",
    actionHint: "Puedo preparar un mensaje o un seguimiento para aprobación, sin ejecutar nada por mi cuenta.",
    severity,
    primaryInsight: primary,
    evidence: actionable.flatMap((insight) => insight.evidence.slice(0, 2)).slice(0, 5)
  };
}

export function buildCopilotPulse({
  greenhouses,
  tasks,
  alerts = [],
  activeGreenhouseId
}: BuildCopilotPulseInput): CopilotInsight[] {
  const today = localDateKey();
  const yesterday = localDateKey(-1);
  const scopedTasks = activeGreenhouseId
    ? tasks.filter((task) => taskGreenhouseId(task) === activeGreenhouseId)
    : tasks;
  const scopedAlerts = activeGreenhouseId
    ? alerts.filter((alert) => alert.greenhouseId === activeGreenhouseId)
    : alerts;
  const insights: CopilotInsight[] = [];

  scopedTasks
    .filter((task) => isTaskIncomplete(task.status) && taskDate(task) < today)
    .sort((left, right) => taskDate(left).localeCompare(taskDate(right)))
    .slice(0, 4)
    .forEach((task) => {
      const greenhouseId = taskGreenhouseId(task);
      const status = task.status.toLowerCase();
      const date = taskDate(task);
      const isYesterday = date === yesterday;
      insights.push({
        id: insightId("task", task.id),
        sourceType: "operation",
        sourceId: task.id,
        greenhouseId,
        title: isYesterday ? "Actividad de ayer sin completar" : "Actividad vencida sin cierre",
        detail: `${operationTypeLabel(task.type)} en ${greenhouseName(greenhouses, greenhouseId)} sigue ${task.status}.`,
        severity: status.includes("bloque") ? "high" : isYesterday ? "medium" : "high",
        recommendedAction: `Preparar mensaje para ${managerName(greenhouses, greenhouseId)} o crear una tarea de seguimiento.`,
        evidence: [
          { label: "Actividad", value: task.title },
          { label: "Fecha", value: date },
          { label: "Estado", value: task.status }
        ]
      });
    });

  scopedTasks
    .filter((task) => task.status.toLowerCase().includes("bloque"))
    .slice(0, 3)
    .forEach((task) => {
      if (insights.some((insight) => insight.sourceId === task.id)) return;
      const greenhouseId = taskGreenhouseId(task);
      insights.push({
        id: insightId("blocked", task.id),
        sourceType: "operation",
        sourceId: task.id,
        greenhouseId,
        title: "Bloqueo operativo activo",
        detail: `${task.title} requiere decision antes de continuar.`,
        severity: "high",
        recommendedAction: "Revisar motivo y preparar mensaje al responsable.",
        evidence: [
          { label: "Area", value: greenhouseName(greenhouses, greenhouseId) },
          { label: "Motivo", value: task.blocked_reason || "Sin motivo registrado" }
        ]
      });
    });

  scopedAlerts
    .filter((alert) => alert.severity !== "Baja")
    .slice(0, 3)
    .forEach((alert) => {
      insights.push({
        id: insightId("pest", alert.id),
        sourceType: "operation",
        sourceId: alert.id,
        greenhouseId: alert.greenhouseId,
        title: "Alerta sanitaria pendiente",
        detail: `${alert.problem} en ${alert.zone || greenhouseName(greenhouses, alert.greenhouseId)}.`,
        severity: alert.severity === "Alta" ? "high" : "medium",
        recommendedAction: "Confirmar seguimiento y programar revision si no existe tarea.",
        evidence: [
          { label: "Severidad", value: alert.severity },
          { label: "Fecha", value: alert.detectedAt }
        ]
      });
    });

  if (!insights.length) {
    insights.push({
      id: "copilot-clear",
      sourceType: "report",
      sourceId: null,
      greenhouseId: activeGreenhouseId ?? null,
      title: "Pulso operativo estable",
      detail: "No hay actividades vencidas ni bloqueos activos en el contexto visible.",
      severity: "low",
      recommendedAction: "Mantener seguimiento normal de la jornada.",
      evidence: [
        { label: "Revision", value: today },
        { label: "Pendientes criticos", value: "0" }
      ]
    });
  }

  return insights.slice(0, 6);
}

export function managerMessageForInsight(insight: CopilotInsight) {
  const activity = insight.evidence.find((entry) => entry.label === "Actividad")?.value ?? insight.title;
  return `Mira Copilot detecto pendiente: ${activity}. ${insight.detail} Puedes confirmar avance o motivo del bloqueo?`;
}
