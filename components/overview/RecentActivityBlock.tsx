import { Square } from "lucide-react";
import type { Activity } from "@/types";

type RecentActivityBlockProps = {
  activities: Activity[];
};

export function RecentActivityBlock({ activities }: RecentActivityBlockProps) {
  const visible = activities.slice(0, 3);

  return (
    <section className="border-t border-app-border pt-5">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-app-border bg-app-text text-white">
          <Square className="h-3 w-3 fill-current" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-medium text-app-text">Actividad reciente</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            Últimos {visible.length} eventos
          </p>
          <div className="mt-5 space-y-3">
            {visible.map((activity) => (
              <div key={activity.id}>
                <p className="truncate text-sm text-app-text">{activity.title}</p>
                <p className="mt-0.5 truncate text-xs text-app-muted">{activity.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
