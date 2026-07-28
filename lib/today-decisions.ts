import type { CurrentUser, Greenhouse, PestAlert, Task } from "@/types";

export type TodayDecisionGroup = "decision" | "blocking" | "next";
export type TodayDecisionKind = "approval" | "blocked-work" | "pest-exception" | "assigned-work";
export type TodayDecisionAction = "verify" | "complete" | "open-work" | "open-pest";

export type TodayDecision = {
  id: string;
  sourceId: string;
  kind: TodayDecisionKind;
  group: TodayDecisionGroup;
  title: string;
  reason: string;
  impact: string;
  context: string;
  timing: string;
  priority: "critical" | "high" | "normal";
  primaryAction: {
    type: TodayDecisionAction;
    label: string;
  };
  secondaryAction?: {
    type: TodayDecisionAction;
    label: string;
  };
  score: number;
};

type BuildTodayDecisionsInput = {
  tasks: Task[];
  alerts: PestAlert[];
  greenhouses: Greenhouse[];
  currentUser: CurrentUser;
  today?: string;
};

const closedStatuses: Task["status"][] = ["Verificada", "Cancelada"];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function ageScore(from: string, today: string) {
  return Math.min(daysBetween(from.slice(0, 10), today), 99);
}

function greenhouseName(greenhouseId: string, greenhouses: Greenhouse[]) {
  return greenhouses.find((item) => item.id === greenhouseId)?.name ?? "Área productiva";
}

function taskTiming(task: Task, today: string) {
  if (task.date < today) {
    const overdueDays = daysBetween(task.date, today);
    return overdueDays === 1 ? "Venció ayer" : `Venció hace ${overdueDays} días`;
  }

  return task.time ? `Hoy, ${task.time}` : "Para hoy";
}

function pestTiming(alert: PestAlert) {
  const date = new Date(alert.detectedAt);
  if (Number.isNaN(date.getTime())) return "Seguimiento pendiente";

  return `Detectada ${new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short"
  }).format(date)}`;
}

function isActivePestException(alert: PestAlert) {
  const lastUpdate = alert.updates?.at(-1);
  return alert.severity === "Alta"
    || alert.caseStatus === "Revisión requerida"
    || lastUpdate?.status === "Sin avance"
    || lastUpdate?.status === "Revisión requerida";
}

function approvalDecision(task: Task, greenhouses: Greenhouse[], today: string): TodayDecision {
  return {
    id: `approval:${task.id}`,
    sourceId: task.id,
    kind: "approval",
    group: "decision",
    title: `Verificar ${task.title}`,
    reason: "La actividad fue completada y espera tu criterio antes de cerrarse.",
    impact: "Al verificarlo, el resultado queda aprobado para el equipo.",
    context: `${greenhouseName(task.greenhouseId, greenhouses)} · ${task.type}`,
    timing: task.date < today ? "Verificación pendiente" : "Completado hoy",
    priority: "high",
    primaryAction: { type: "verify", label: "Verificar" },
    secondaryAction: { type: "open-work", label: "Revisar actividad" },
    score: 300 + ageScore(task.date, today)
  };
}

function blockedDecision(task: Task, greenhouses: Greenhouse[], today: string): TodayDecision {
  return {
    id: `blocked:${task.id}`,
    sourceId: task.id,
    kind: "blocked-work",
    group: "blocking",
    title: `Desbloquear ${task.title}`,
    reason: "La actividad está detenida y necesita una decisión para poder continuar.",
    impact: "Resolver el bloqueo evita que el plan operativo siga acumulando retraso.",
    context: `${greenhouseName(task.greenhouseId, greenhouses)} · ${task.responsible}`,
    timing: taskTiming(task, today),
    priority: "critical",
    primaryAction: { type: "open-work", label: "Resolver" },
    score: 400 + ageScore(task.date, today)
  };
}

function pestDecision(alert: PestAlert, greenhouses: Greenhouse[], today: string): TodayDecision {
  const lastUpdate = alert.updates?.at(-1);
  const stalled = lastUpdate?.status === "Sin avance";
  const isCritical = alert.severity === "Alta" || stalled;

  return {
    id: `pest:${alert.id}`,
    sourceId: alert.id,
    kind: "pest-exception",
    group: "blocking",
    title: `Revisar ${alert.problem}`,
    reason: stalled
      ? "El último seguimiento reporta que no hay avance."
      : "La severidad o el estado del caso requieren una revisión.",
    impact: alert.zone
      ? `La excepción afecta ${alert.zone} y necesita una respuesta operativa.`
      : "La excepción necesita una respuesta operativa.",
    context: `${greenhouseName(alert.greenhouseId, greenhouses)} · ${alert.caseStatus ?? "Caso abierto"}`,
    timing: pestTiming(alert),
    priority: isCritical ? "critical" : "high",
    primaryAction: { type: "open-pest", label: "Revisar caso" },
    score: (isCritical ? 500 : 350) + ageScore(alert.detectedAt, today)
  };
}

function assignedWorkDecision(task: Task, greenhouses: Greenhouse[], today: string): TodayDecision {
  const overdue = task.date < today;

  return {
    id: `work:${task.id}`,
    sourceId: task.id,
    kind: "assigned-work",
    group: "next",
    title: task.title,
    reason: overdue
      ? "Esta actividad está vencida y sigue esperando ejecución."
      : "Es la siguiente acción asignada para hoy.",
    impact: overdue
      ? "Completarlo recupera el ritmo del plan operativo."
      : "Resolverlo mantiene la jornada dentro del plan.",
    context: `${greenhouseName(task.greenhouseId, greenhouses)} · ${task.type}`,
    timing: taskTiming(task, today),
    priority: overdue ? "high" : "normal",
    primaryAction: { type: "complete", label: "Completar" },
    secondaryAction: { type: "open-work", label: "Abrir actividad" },
    score: (overdue ? 200 : 100) + ageScore(task.date, today)
  };
}

export function buildTodayDecisions({
  tasks,
  alerts,
  greenhouses,
  currentUser,
  today = localDateKey()
}: BuildTodayDecisionsInput) {
  const canVerify = currentUser.role === "owner" || currentUser.role === "admin";
  const decisions: TodayDecision[] = [];

  tasks.forEach((task) => {
    if (closedStatuses.includes(task.status)) return;

    if (task.status === "Completada") {
      if (canVerify) decisions.push(approvalDecision(task, greenhouses, today));
      return;
    }

    if (task.status === "Bloqueada") {
      decisions.push(blockedDecision(task, greenhouses, today));
      return;
    }

    if (task.date <= today) {
      decisions.push(assignedWorkDecision(task, greenhouses, today));
    }
  });

  alerts
    .filter(isActivePestException)
    .forEach((alert) => decisions.push(pestDecision(alert, greenhouses, today)));

  return decisions
    .filter((decision, index, items) =>
      items.findIndex((candidate) => candidate.id === decision.id) === index
    )
    .sort((left, right) => right.score - left.score);
}
