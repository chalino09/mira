"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  ExternalLink,
  Leaf,
  ListChecks,
  Sprout,
  Waves
} from "lucide-react";
import { PortalMark } from "@/components/brand/MiraBrand";
import { Button } from "@/components/ui/Button";
import { cropLabelForId, getCropDdtStatus } from "@/lib/crop-ddt";
import { greetingForNow } from "@/lib/date";
import {
  buildTodayDecisions,
  type TodayDecision,
  type TodayDecisionAction
} from "@/lib/today-decisions";
import { useGreenhouseStore } from "@/lib/store";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import type {
  ApplicationRecord,
  CurrentUser,
  Greenhouse,
  IrrigationRecord,
  Organization,
  PestAlert,
  Task
} from "@/types";

type TodayDecisionBoardProps = {
  tasks: Task[];
  alerts: PestAlert[];
  greenhouse: Greenhouse;
  greenhouses: Greenhouse[];
  organization: Organization;
  currentUser: CurrentUser;
  lastIrrigation?: IrrigationRecord;
  lastApplication?: ApplicationRecord;
  busyTaskId?: string | null;
  onCompleteTask: (taskId: string) => void;
  onVerifyTask: (taskId: string) => void;
  onOpenWork: (
    taskId: string,
    view: "calendar" | "execution" | "verification",
    intent: "details" | "evidence"
  ) => void;
  onOpenGreenhouse: () => void;
  onOpenMonitoring: () => void;
  onOpenOperations: () => void;
  onOpenPests: () => void;
};

const roleLabels: Record<CurrentUser["role"], string> = {
  owner: "Owner",
  admin: "Administración",
  manager: "Operación"
};

const groupLabels: Record<TodayDecision["group"], string> = {
  decision: "Decisión",
  blocking: "Bloqueo",
  next: "Siguiente acción"
};

function todayLabel() {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
}

function DecisionIcon({ kind, className }: { kind: TodayDecision["kind"]; className?: string }) {
  const props = { "aria-hidden": true, className, strokeWidth: 2 };
  if (kind === "approval") return <BadgeCheck {...props} />;
  if (kind === "blocked-work") return <AlertOctagon {...props} />;
  if (kind === "pest-exception") return <Leaf {...props} />;
  return <Clock3 {...props} />;
}

function ActionIcon({ action, className }: { action: TodayDecisionAction; className?: string }) {
  const props = { "aria-hidden": true, className, strokeWidth: 2 };
  if (action === "verify") return <Check {...props} />;
  if (action === "complete") return <CircleCheckBig {...props} />;
  if (action === "open-pest") return <Leaf {...props} />;
  return <ExternalLink {...props} />;
}

function DecisionMeta({ decision, inverse = false }: { decision: TodayDecision; inverse?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]",
        inverse ? "text-white/65" : "text-app-muted"
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <Clock3 aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
        {decision.timing}
      </span>
      <span aria-hidden="true" className={cn("h-1 w-1 rounded-full", inverse ? "bg-white/30" : "bg-app-border")} />
      <span>{decision.context}</span>
    </div>
  );
}

function FocusDecision({
  decision,
  busy,
  onAction
}: {
  decision: TodayDecision;
  busy: boolean;
  onAction: (action: TodayDecisionAction, decision: TodayDecision) => void;
}) {
  return (
    <article className="relative min-h-[320px] overflow-hidden rounded-[26px] bg-app-green px-5 py-6 text-white shadow-[0_0_0_1px_rgba(13,13,13,0.04),0_18px_50px_-30px_rgba(13,13,13,0.6)] sm:px-7 sm:py-7">
      <div aria-hidden="true" className="absolute -end-24 -top-24 h-64 w-64 rounded-full bg-white/[0.045] blur-2xl" />
      <div className="relative flex min-h-[272px] flex-col justify-between gap-8">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D6E7D9]">
              Primero · {groupLabels[decision.group]}
            </p>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              <DecisionIcon className="h-[18px] w-[18px]" kind={decision.kind} />
            </span>
          </div>
          <h2 className="mt-5 max-w-2xl text-balance text-[30px] font-medium leading-[1.08] tracking-[-0.035em] sm:text-[34px]">
            {decision.title}
          </h2>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-white/72">
            {decision.reason}
          </p>
          <div className="mt-4">
            <DecisionMeta decision={decision} inverse />
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D6E7D9]">
              Al resolverlo
            </p>
            <p className="mt-1.5 text-sm leading-5 text-white/72">{decision.impact}</p>
          </div>
          <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {decision.secondaryAction ? (
              <Button
                className="min-h-11 min-w-0 border-transparent bg-transparent px-2 text-[13px] text-white/75 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-3 sm:text-sm"
                onClick={() => onAction(decision.secondaryAction!.type, decision)}
                variant="ghost"
              >
                {decision.secondaryAction.label}
              </Button>
            ) : null}
            <Button
              className="min-h-11 min-w-0 border-white bg-white px-2 text-[13px] text-app-green shadow-sm transition-[scale,background-color] duration-150 ease-out hover:bg-[#F1F6F2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.96] sm:px-4 sm:text-sm"
              disabled={busy}
              icon={<ActionIcon action={decision.primaryAction.type} className="h-4 w-4" />}
              onClick={() => onAction(decision.primaryAction.type, decision)}
            >
              {busy ? "Resolviendo…" : decision.primaryAction.label}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function NextDecision({
  decision,
  onSelect,
  className
}: {
  decision: TodayDecision;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <li className={className}>
      <button
        aria-controls="today-focus-decision"
        className={cn(
          "group flex min-h-[88px] w-full items-start gap-3 rounded-2xl px-3 py-3 text-start outline-offset-2 transition-[background-color] duration-100 ease-out hover:bg-app-sidebar focus-visible:bg-app-sidebar"
        )}
        onClick={onSelect}
        type="button"
      >
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            decision.priority === "critical" && "bg-app-red text-[#7B2A2A]",
            decision.priority === "high" && "bg-app-amber text-[#715318]",
            decision.priority === "normal" && "bg-app-soft text-app-green"
          )}
        >
          <DecisionIcon className="h-[18px] w-[18px]" kind={decision.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.13em] text-app-muted">
            {groupLabels[decision.group]} · {decision.timing}
          </span>
          <span className="mt-1.5 line-clamp-2 block text-sm font-semibold leading-5 text-app-text">
            {decision.title}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="mt-2 h-4 w-4 shrink-0 text-app-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          strokeWidth={1.75}
        />
      </button>
    </li>
  );
}

export function TodayDecisionBoard({
  tasks,
  alerts,
  greenhouse,
  greenhouses,
  organization,
  currentUser,
  lastIrrigation,
  lastApplication,
  busyTaskId,
  onCompleteTask,
  onVerifyTask,
  onOpenWork,
  onOpenGreenhouse,
  onOpenMonitoring,
  onOpenOperations,
  onOpenPests
}: TodayDecisionBoardProps) {
  const crops = useGreenhouseStore((state) => state.crops);
  const cropStages = useGreenhouseStore((state) => state.cropStages);
  const decisions = useMemo(
    () => buildTodayDecisions({ tasks, alerts, greenhouses, currentUser }),
    [alerts, currentUser, greenhouses, tasks]
  );
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(decisions[0]?.id ?? null);
  const selectedDecision = decisions.find((decision) => decision.id === selectedDecisionId) ?? decisions[0];
  const nextDecisions = decisions.filter((decision) => decision.id !== selectedDecision?.id).slice(0, 3);
  const firstName = currentUser.fullName.split(" ")[0] || "Usuario";
  const pendingAlerts = alerts.filter((alert) => alert.caseStatus !== "Cierre sanitario").length;
  const cropStatus = getCropDdtStatus(
    greenhouse.cropId,
    greenhouse.transplantDate,
    greenhouse.daysSinceTransplant,
    cropStages
  );
  const cropName = cropLabelForId(greenhouse.cropId, crops);
  const lastActivity = !lastApplication || (lastIrrigation && lastIrrigation.date >= lastApplication.date)
    ? lastIrrigation
      ? {
          label: "Último riego",
          value: `${formatNumber(lastIrrigation.liters)} L · ${formatDate(lastIrrigation.date)}`,
          icon: Waves
        }
      : null
    : {
        label: "Última aplicación",
        value: `${lastApplication.product} · ${formatDate(lastApplication.date)}`,
        icon: ListChecks
      };
  const visibleDecisionCount = selectedDecision ? 1 + nextDecisions.length : 0;
  const hiddenDecisionCount = Math.max(0, decisions.length - visibleDecisionCount);

  useEffect(() => {
    if (!decisions.length) {
      setSelectedDecisionId(null);
      return;
    }
    if (!decisions.some((decision) => decision.id === selectedDecisionId)) {
      setSelectedDecisionId(decisions[0].id);
    }
  }, [decisions, selectedDecisionId]);

  const onAction = (action: TodayDecisionAction, decision: TodayDecision) => {
    if (action === "verify") return onVerifyTask(decision.sourceId);
    if (action === "complete") return onCompleteTask(decision.sourceId);
    if (action === "open-pest") return onOpenPests();
    if (decision.kind === "approval") {
      return onOpenWork(decision.sourceId, "verification", "evidence");
    }
    if (decision.kind === "blocked-work") {
      return onOpenWork(decision.sourceId, "execution", "details");
    }
    return onOpenWork(decision.sourceId, "calendar", "details");
  };

  const pulseItems = [
    {
      label: "Cultivo",
      value: cropStatus.status === "missing-catalog"
        ? cropName
        : `${cropStatus.ddt} DDT · ${cropStatus.stage?.name ?? cropStatus.detail}`,
      icon: Sprout,
      onClick: onOpenGreenhouse
    },
    {
      label: lastActivity?.label ?? "Actividad reciente",
      value: lastActivity?.value ?? "Aún sin registros",
      icon: lastActivity?.icon ?? Waves,
      onClick: onOpenMonitoring
    },
    {
      label: "Sanidad",
      value: pendingAlerts
        ? `${pendingAlerts} ${pendingAlerts === 1 ? "alerta requiere" : "alertas requieren"} atención`
        : "Sin alertas pendientes",
      icon: Leaf,
      onClick: onOpenPests
    }
  ];

  return (
    <section className="mx-auto max-w-[1180px] pb-10 pt-4 sm:pt-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">
            <PortalMark className="h-4 w-7 shrink-0 text-app-green" />
            <span>Hoy · <span className="capitalize">{todayLabel()}</span></span>
          </div>
          <h1 className="mt-3 text-balance text-4xl font-light leading-[0.98] tracking-normal text-app-text sm:text-5xl">
            {greetingForNow()}, {firstName}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-app-muted">
            {selectedDecision
              ? `Tienes ${decisions.length} ${decisions.length === 1 ? "decisión" : "decisiones"}. Empieza por la de mayor impacto.`
              : "No hay decisiones pendientes en este alcance."}
          </p>
        </div>
        <div className="hidden shrink-0 text-end sm:block">
          <p className="text-sm font-medium text-app-text">{organization.name}</p>
          <p className="mt-1 text-[13px] text-app-muted">{roleLabels[currentUser.role]} · {greenhouse.name}</p>
        </div>
      </header>

      <section aria-labelledby="today-pulse-title" className="mt-6">
        <h2 className="sr-only" id="today-pulse-title">Pulso del alcance</h2>
        <div className="grid grid-cols-3 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(13,13,13,0.055),0_4px_16px_-12px_rgba(13,13,13,0.18)]">
          {pulseItems.map(({ label, value, icon: Icon, onClick }, index) => (
            <button
              className={cn(
                "group flex min-h-[98px] min-w-0 flex-col items-start gap-2 px-3 py-3 text-start outline-offset-[-3px] transition-[background-color] duration-100 ease-out hover:bg-app-sidebar focus-visible:bg-app-sidebar sm:min-h-[72px] sm:flex-row sm:items-center sm:gap-3 sm:px-4",
                index > 0 && "border-s border-app-border"
              )}
              key={label}
              onClick={onClick}
              type="button"
            >
              <span className="flex w-full items-center justify-between gap-2 sm:w-auto">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-app-soft text-app-green sm:h-9 sm:w-9 sm:rounded-xl">
                  <Icon aria-hidden="true" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={1.75} />
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-app-muted sm:hidden" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold uppercase tracking-[0.13em] text-app-muted">{label}</span>
                <span className="mt-1 line-clamp-2 block text-xs font-medium leading-4 text-app-text sm:truncate sm:text-sm sm:leading-5" title={value}>{value}</span>
              </span>
              <ChevronRight aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-app-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5 sm:block" />
            </button>
          ))}
        </div>
      </section>

      {selectedDecision ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.8fr)]">
          <div aria-atomic="true" className="sr-only" role="status">
            Decisión prioritaria: {selectedDecision.title}
          </div>
          <div id="today-focus-decision">
            <FocusDecision
              busy={busyTaskId === selectedDecision.sourceId}
              decision={selectedDecision}
              onAction={onAction}
            />
          </div>

          <aside className="rounded-[26px] bg-white p-3 shadow-[0_0_0_1px_rgba(13,13,13,0.055),0_8px_30px_-24px_rgba(13,13,13,0.24)] sm:p-4" aria-labelledby="next-decisions-title">
            <div className="flex items-center justify-between gap-4 px-2 pb-2 pt-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">En cola</p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-app-text" id="next-decisions-title">
                  Después
                </h2>
              </div>
              <span className="tabular-nums text-sm text-app-muted">{nextDecisions.length}</span>
            </div>
            <ul className="mt-1 grid gap-1">
              {nextDecisions.map((decision, index) => (
                <NextDecision
                  className={cn(index === 2 && "hidden sm:list-item lg:list-item")}
                  decision={decision}
                  key={decision.id}
                  onSelect={() => setSelectedDecisionId(decision.id)}
                />
              ))}
            </ul>
            <Button
              className="mt-2 min-h-10 w-full justify-between px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
              icon={<ArrowRight aria-hidden="true" className="order-2 h-4 w-4" />}
              onClick={onOpenOperations}
              variant="ghost"
            >
              {hiddenDecisionCount
                ? `Ver ${hiddenDecisionCount} ${hiddenDecisionCount === 1 ? "decisión más" : "decisiones más"} en Work`
                : "Abrir Work"}
            </Button>
          </aside>
        </div>
      ) : (
        <div className="mt-6 rounded-[26px] bg-white px-6 py-10 text-center shadow-[0_0_0_1px_rgba(13,13,13,0.055),0_12px_40px_-28px_rgba(13,13,13,0.25)]">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-app-soft text-app-green">
            <CircleCheckBig aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-app-text">Todo resuelto por ahora</h2>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-6 text-app-muted">
            Si aparece una aprobación, un bloqueo o una excepción, la verás aquí.
          </p>
          <Button
            className="mt-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
            icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
            onClick={onOpenOperations}
            variant="secondary"
          >
            Abrir Work
          </Button>
        </div>
      )}
    </section>
  );
}
