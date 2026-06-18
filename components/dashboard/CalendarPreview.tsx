import type { Task } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { weekOfYear } from "@/lib/date";
import { formatDate } from "@/lib/utils";

export function CalendarPreview({ tasks }: { tasks: Task[] }) {
  const currentWeek = weekOfYear();

  return (
    <div className="border-y border-app-border bg-transparent py-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Calendario agrícola</h3>
        <StatusBadge tone="green">{`Semana ${currentWeek}`}</StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
          <div
            key={`${day}-${index}`}
            className="flex h-10 items-center justify-center border border-app-border bg-white/55 text-xs font-medium text-app-muted"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {tasks.slice(0, 4).map((task) => (
          <div key={task.id} className="border-t border-app-border py-3">
            <p className="text-sm font-medium text-app-text">{task.type}</p>
            <p className="mt-1 text-xs text-app-muted">{formatDate(task.date)} · {task.time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
