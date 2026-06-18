import { ActiveGreenhousePanel } from "@/components/overview/ActiveGreenhousePanel";
import { AttentionBlock } from "@/components/overview/AttentionBlock";
import { EditorialMetrics } from "@/components/overview/EditorialMetrics";
import { GreenhouseHealthMap } from "@/components/overview/GreenhouseHealthMap";
import { RecentActivityBlock } from "@/components/overview/RecentActivityBlock";
import { greetingForNow, overviewDateLabel } from "@/lib/date";
import type {
  Activity,
  ApplicationRecord,
  CurrentUser,
  Greenhouse,
  IrrigationRecord,
  Organization,
  PestAlert,
  Task
} from "@/types";

type OverviewHeroProps = {
  greenhouse: Greenhouse;
  pendingAlerts: number;
  alerts: PestAlert[];
  tasks: Task[];
  activities: Activity[];
  organization: Organization;
  currentUser: CurrentUser;
  lastIrrigation?: IrrigationRecord;
  lastApplication?: ApplicationRecord;
  onCompleteTask: (taskId: string) => void;
};

export function OverviewHero({
  greenhouse,
  pendingAlerts,
  alerts,
  tasks,
  activities,
  organization,
  currentUser,
  lastIrrigation,
  lastApplication,
  onCompleteTask
}: OverviewHeroProps) {
  const firstName = currentUser.fullName.split(" ")[0] || "Usuario";
  const greeting = greetingForNow();
  const reviewZones = Math.max(
    pendingAlerts,
    tasks.filter((task) => task.status !== "Completada").length
  );

  return (
    <section className="pt-12 md:pt-16">
      <div className="max-w-5xl">
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

      <div className="mt-16">
        <EditorialMetrics
          estimatedProductionKg={greenhouse.estimatedProductionKg}
          pendingAlerts={pendingAlerts}
          plants={greenhouse.plants}
          transplantDays={greenhouse.daysSinceTransplant}
        />
      </div>

      <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.7fr)] lg:items-stretch">
        <GreenhouseHealthMap beds={greenhouse.beds} reviewZones={reviewZones} />
        <ActiveGreenhousePanel
          greenhouse={greenhouse}
          lastApplication={lastApplication}
          lastIrrigation={lastIrrigation}
        />
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <AttentionBlock alerts={alerts} onCompleteTask={onCompleteTask} tasks={tasks} />
        <RecentActivityBlock activities={activities} />
      </div>
    </section>
  );
}
