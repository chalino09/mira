import type { Activity } from "@/types";

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <div className="rounded-app border border-app-border bg-white">
      <div className="border-b border-app-border px-4 py-3">
        <h3 className="text-sm font-semibold text-app-text">Actividad reciente</h3>
      </div>
      <div className="divide-y divide-app-border">
        {activities.map((activity) => (
          <div key={activity.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-app-text">{activity.title}</p>
                <p className="mt-1 text-sm text-app-muted">{activity.detail}</p>
              </div>
              <span className="shrink-0 text-xs text-app-muted">{activity.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
