"use client";

import { ActiveGreenhousePanel } from "@/components/overview/ActiveGreenhousePanel";
import { AttentionBlock } from "@/components/overview/AttentionBlock";
import { TodayOperationsBlock } from "@/components/overview/TodayOperationsBlock";
import { CalendarContributionGrid } from "@/components/dashboard/CalendarContributionGrid";
import { cropLabelForId, getCropDdtStatus } from "@/lib/crop-ddt";
import { greetingForNow, overviewDateLabel } from "@/lib/date";
import { useGreenhouseStore } from "@/lib/store";
import { cn, formatNumber } from "@/lib/utils";
import type {
  ApplicationRecord,
  CurrentUser,
  Greenhouse,
  IrrigationRecord,
  Organization,
  PestAlert,
  Task
} from "@/types";

function CropStatusRail({
  greenhouse,
  pendingAlerts
}: {
  greenhouse: Greenhouse;
  pendingAlerts: number;
}) {
  const crops = useGreenhouseStore((state) => state.crops);
  const cropStages = useGreenhouseStore((state) => state.cropStages);
  const status = getCropDdtStatus(
    greenhouse.cropId,
    greenhouse.transplantDate,
    greenhouse.daysSinceTransplant,
    cropStages
  );
  const cropLabel = cropLabelForId(greenhouse.cropId, crops);
  const stageLabel = status.stage?.name ?? status.detail;

  const metrics = [
    ["Cultivo", cropLabel],
    ["Variedad", greenhouse.variety],
    ["Plantas", formatNumber(greenhouse.plants)],
    ["Responsable", greenhouse.manager],
    ["Producción", `${formatNumber(greenhouse.estimatedProductionKg)} kg`],
    ["Alertas", formatNumber(pendingAlerts)]
  ];

  return (
    <section className="border-t border-app-border py-5">
      <div className="border-l-4 border-app-green bg-app-soft/70 px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
              Estado del cultivo
            </p>
            <h2 className="mt-3 text-3xl font-light tracking-normal text-app-text">
              {status.status === "missing-catalog"
                ? "Sin catálogo"
                : status.status === "missing-date"
                  ? "Sin DDT"
                  : `${formatNumber(status.ddt)} DDT`}
            </h2>
            <p className="mt-2 text-sm text-app-muted">{stageLabel}</p>
          </div>
          <span
            className={cn(
              "mt-1 h-2.5 w-2.5 rounded-full",
              pendingAlerts > 0 ? "bg-app-amber" : "bg-app-green"
            )}
          />
        </div>

        {status.status !== "missing-catalog" ? (
        <div className="mt-5 h-1.5 overflow-hidden bg-white">
          <div
            className="h-full bg-app-green transition-all"
            style={{ width: `${Math.round(status.progress * 100)}%` }}
          />
        </div>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 border-y border-app-border">
        {metrics.map(([label, value], index) => (
          <div
            key={label}
            className={cn(
              "min-w-0 py-3",
              index % 2 === 1 && "border-l border-app-border pl-4",
              index % 2 === 0 && "pr-4",
              index > 1 && "border-t border-app-border",
              label === "Alertas" && pendingAlerts > 0 && "text-[#7A5700]"
            )}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-app-muted">{label}</p>
            <p className={cn("mt-1 truncate text-sm font-medium text-app-text", label === "Alertas" && pendingAlerts > 0 && "text-[#7A5700]")}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

type OverviewHeroProps = {
  greenhouse: Greenhouse;
  pendingAlerts: number;
  alerts: PestAlert[];
  tasks: Task[];
  organization: Organization;
  currentUser: CurrentUser;
  lastIrrigation?: IrrigationRecord;
  lastApplication?: ApplicationRecord;
  onCompleteTask: (taskId: string) => void;
  operationsTasks?: Task[];
  onOpenOperations: () => void;
};

export function OverviewHero({
  greenhouse,
  pendingAlerts,
  alerts,
  tasks,
  organization,
  currentUser,
  lastIrrigation,
  lastApplication,
  onCompleteTask,
  operationsTasks = tasks,
  onOpenOperations
}: OverviewHeroProps) {
  const firstName = currentUser.fullName.split(" ")[0] || "Usuario";
  const greeting = greetingForNow();

  return (
    <section className="pt-12 md:pt-16">
      <div className="max-w-7xl">
        <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.32em] text-app-muted">
          {organization.name}
        </p>
        <h1 className="text-6xl font-light leading-[0.95] tracking-normal text-app-text sm:text-7xl lg:text-8xl">
          {greeting}, {firstName}
        </h1>
        <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.32em] text-app-muted">
          {overviewDateLabel()}
        </p>
      </div>

      <div className="mt-12 grid gap-12 xl:grid-cols-[minmax(0,1.58fr)_360px] xl:items-start">
        <div className="min-w-0">
          <TodayOperationsBlock
            className="mt-0"
            onCompleteTask={onCompleteTask}
            onOpenOperations={onOpenOperations}
            tasks={operationsTasks}
          />

          <div className="mt-10">
            <AttentionBlock alerts={alerts} onCompleteTask={onCompleteTask} tasks={tasks} />
          </div>

          <div className="mt-12">
            <CalendarContributionGrid tasks={operationsTasks} />
          </div>
        </div>

        <div className="min-w-0 space-y-8 xl:sticky xl:top-6">
          <CropStatusRail greenhouse={greenhouse} pendingAlerts={pendingAlerts} />
          <ActiveGreenhousePanel
            greenhouse={greenhouse}
            lastApplication={lastApplication}
            lastIrrigation={lastIrrigation}
            showDdtReading={false}
            variant="rail"
          />
        </div>
      </div>
    </section>
  );
}
