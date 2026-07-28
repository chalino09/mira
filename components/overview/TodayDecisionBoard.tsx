"use client";

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
  ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  buildTodayDecisions,
  type TodayDecision,
  type TodayDecisionAction,
  type TodayDecisionGroup
} from "@/lib/today-decisions";
import { cn } from "@/lib/utils";
import type { CurrentUser, Greenhouse, Organization, PestAlert, Task } from "@/types";

type TodayDecisionBoardProps = {
  tasks: Task[];
  alerts: PestAlert[];
  greenhouses: Greenhouse[];
  organization: Organization;
  currentUser: CurrentUser;
  busyTaskId?: string | null;
  onCompleteTask: (taskId: string) => void;
  onVerifyTask: (taskId: string) => void;
  onOpenWork: (
    taskId: string,
    view: "calendar" | "execution" | "verification",
    intent: "details" | "evidence"
  ) => void;
  onOpenOperations: () => void;
  onOpenPests: () => void;
};

const groupCopy: Record<TodayDecisionGroup, { label: string; description: string }> = {
  decision: {
    label: "Requiere tu decisión",
    description: "Resultados que esperan tu criterio para avanzar."
  },
  blocking: {
    label: "Bloquea la operación",
    description: "Excepciones que están frenando trabajo o elevando el riesgo."
  },
  next: {
    label: "Tu siguiente acción",
    description: "Work asignado que puedes resolver ahora."
  }
};

const roleLabels: Record<CurrentUser["role"], string> = {
  owner: "Owner",
  admin: "Administración",
  manager: "Operación"
};

function todayLabel() {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
}

function GroupIcon({ group, className }: { group: TodayDecisionGroup; className?: string }) {
  const props = { "aria-hidden": true, className, strokeWidth: 2 };
  if (group === "decision") return <BadgeCheck {...props} />;
  if (group === "blocking") return <ShieldAlert {...props} />;
  return <ListChecks {...props} />;
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
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]", inverse ? "text-white/65" : "text-app-muted")}>
      <span className="inline-flex items-center gap-1.5">
        <Clock3 aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.75} />
        {decision.timing}
      </span>
      <span className={cn("h-1 w-1 rounded-full", inverse ? "bg-white/30" : "bg-app-border")} />
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
    <article className="relative overflow-hidden rounded-[28px] bg-app-green px-5 py-6 text-white shadow-[0_0_0_1px_rgba(13,13,13,0.04),0_18px_50px_-28px_rgba(13,13,13,0.55)] sm:px-8 sm:py-8 lg:px-10 lg:py-10">
      <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/[0.045] blur-2xl" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-3 text-[13px] font-medium text-[#D6E7D9]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
              <DecisionIcon className="h-5 w-5" kind={decision.kind} />
            </span>
            <span>{groupCopy[decision.group].label}</span>
          </div>
          <h2 className="mt-7 max-w-3xl text-balance text-3xl font-medium leading-[1.08] tracking-[-0.035em] sm:text-4xl lg:text-[44px]">
            {decision.title}
          </h2>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-white/75">
            {decision.reason}
          </p>
          <div className="mt-6">
            <DecisionMeta decision={decision} inverse />
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.075] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)]">
          <p className="text-[13px] font-medium text-[#D6E7D9]">Qué cambia al resolverlo</p>
          <p className="mt-2 text-sm leading-6 text-white/75">{decision.impact}</p>
          <div className="mt-5 grid gap-2">
            <Button
              className="min-h-12 w-full border-white bg-white text-app-green shadow-sm transition-[scale,background-color] duration-150 ease-out hover:bg-[#F1F6F2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.96]"
              disabled={busy}
              icon={<ActionIcon action={decision.primaryAction.type} className="h-4 w-4" />}
              onClick={() => onAction(decision.primaryAction.type, decision)}
            >
              {busy ? "Resolviendo…" : decision.primaryAction.label}
            </Button>
            {decision.secondaryAction ? (
              <Button
                className="min-h-11 w-full border-transparent bg-transparent text-white/70 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                icon={<ArrowRight aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />}
                onClick={() => onAction(decision.secondaryAction!.type, decision)}
                variant="ghost"
              >
                {decision.secondaryAction.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function DecisionRow({
  decision,
  busy,
  onAction
}: {
  decision: TodayDecision;
  busy: boolean;
  onAction: (action: TodayDecisionAction, decision: TodayDecision) => void;
}) {
  return (
    <article className="group rounded-2xl bg-white px-4 py-5 shadow-[0_0_0_1px_rgba(13,13,13,0.06),0_2px_5px_rgba(13,13,13,0.035)] transition-[box-shadow] duration-150 ease-out hover:shadow-[0_0_0_1px_rgba(13,13,13,0.09),0_8px_24px_-14px_rgba(13,13,13,0.2)] sm:px-5">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              decision.priority === "critical" && "bg-app-red text-[#7B2A2A]",
              decision.priority === "high" && "bg-app-amber text-[#715318]",
              decision.priority === "normal" && "bg-app-soft text-app-green"
            )}
          >
            <DecisionIcon className="h-5 w-5" kind={decision.kind} />
          </span>
          <div className="min-w-0">
            <h3 className="text-balance text-lg font-semibold leading-6 tracking-[-0.015em] text-app-text">
              {decision.title}
            </h3>
            <p className="mt-1.5 max-w-2xl text-pretty text-sm leading-6 text-app-muted">
              {decision.reason}
            </p>
            <div className="mt-3">
              <DecisionMeta decision={decision} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 ps-14 sm:ps-0">
          {decision.secondaryAction ? (
            <Button
              className="min-h-10 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
              onClick={() => onAction(decision.secondaryAction!.type, decision)}
              variant="ghost"
            >
              {decision.secondaryAction.label}
            </Button>
          ) : null}
          <Button
            className="min-h-10 px-3 transition-[scale,background-color] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green active:scale-[0.96]"
            disabled={busy}
            icon={<ActionIcon action={decision.primaryAction.type} className="h-4 w-4" />}
            onClick={() => onAction(decision.primaryAction.type, decision)}
            variant="secondary"
          >
            {busy ? "Resolviendo…" : decision.primaryAction.label}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function TodayDecisionBoard({
  tasks,
  alerts,
  greenhouses,
  organization,
  currentUser,
  busyTaskId,
  onCompleteTask,
  onVerifyTask,
  onOpenWork,
  onOpenOperations,
  onOpenPests
}: TodayDecisionBoardProps) {
  const decisions = buildTodayDecisions({ tasks, alerts, greenhouses, currentUser });
  const focusDecision = decisions[0];
  const remainingDecisions = decisions.slice(1, 8);
  const firstName = currentUser.fullName.split(" ")[0] || "Usuario";
  const decisionCountCopy = decisions.length === 1
    ? "Hay 1 decisión que necesita tu atención."
    : `Hay ${decisions.length} decisiones que necesitan tu atención.`;

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

  return (
    <section className="mx-auto max-w-[1180px] pb-12 pt-9 sm:pt-14">
      <header className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-app-muted">
            <span>{organization.name}</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-app-border" />
            <span>{roleLabels[currentUser.role]}</span>
          </div>
          <h1 className="mt-5 text-balance text-5xl font-medium leading-[0.94] tracking-[-0.055em] text-app-text sm:text-6xl lg:text-7xl">
            Hoy
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-app-muted sm:text-lg">
            {focusDecision
              ? `${firstName}, ${decisionCountCopy} Están ordenadas por impacto y urgencia.`
              : `${firstName}, no hay decisiones pendientes en este alcance.`}
          </p>
        </div>
        <div className="flex items-center gap-3 lg:pb-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-soft text-app-green">
            <Clock3 aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[13px] font-medium capitalize text-app-text">{todayLabel()}</p>
            <p className="mt-0.5 text-[13px] text-app-muted">Prioridad actualizada</p>
          </div>
        </div>
      </header>

      {focusDecision ? (
        <>
          <div className="mt-10 sm:mt-12">
            <FocusDecision
              busy={busyTaskId === focusDecision.sourceId}
              decision={focusDecision}
              onAction={onAction}
            />
          </div>

          {remainingDecisions.length ? (
            <div className="mt-12 space-y-12">
              {(["decision", "blocking", "next"] as TodayDecisionGroup[]).map((group) => {
                const groupDecisions = remainingDecisions.filter((decision) => decision.group === group);
                if (!groupDecisions.length) return null;
                return (
                  <section aria-labelledby={`today-${group}`} key={group}>
                    <div className="mb-5 flex items-start gap-3">
                      <GroupIcon className="mt-0.5 h-5 w-5 text-app-green" group={group} />
                      <div>
                        <h2 className="text-lg font-semibold tracking-[-0.015em] text-app-text" id={`today-${group}`}>
                          {groupCopy[group].label}
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-app-muted">{groupCopy[group].description}</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {groupDecisions.map((decision) => (
                        <DecisionRow
                          busy={busyTaskId === decision.sourceId}
                          decision={decision}
                          key={decision.id}
                          onAction={onAction}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}

          {decisions.length > 8 ? (
            <div className="mt-8 flex justify-end">
              <Button
                icon={<ChevronRight aria-hidden="true" className="h-4 w-4" />}
                onClick={onOpenOperations}
                variant="ghost"
              >
                Ver {decisions.length - 8} decisiones más en Work
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-10 rounded-[28px] bg-white px-6 py-12 text-center shadow-[0_0_0_1px_rgba(13,13,13,0.06),0_12px_40px_-28px_rgba(13,13,13,0.25)] sm:mt-12 sm:px-10 sm:py-16">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-app-soft text-app-green">
            <CircleCheckBig aria-hidden="true" className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <h2 className="mt-6 text-2xl font-semibold tracking-[-0.025em] text-app-text">Todo resuelto por ahora</h2>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-6 text-app-muted">
            Cuando un Work necesite tu decisión, una excepción bloquee la operación o aparezca una aprobación, la verás aquí.
          </p>
          <Button
            className="mt-7 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
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
