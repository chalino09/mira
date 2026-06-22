import { Clock3 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Task } from "@/types";

export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-app border border-app-border bg-white">
      <div className="border-b border-app-border px-4 py-3">
        <h3 className="text-sm font-semibold text-app-text">Tareas de hoy</h3>
      </div>
      <div className="divide-y divide-app-border">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-app-text">{task.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-app-muted">
                <Clock3 className="h-3.5 w-3.5" />
                {task.time} · {task.responsible}
              </p>
            </div>
            <StatusBadge tone={task.status === "Completada" ? "green" : task.status === "Bloqueada" ? "red" : "neutral"}>
              {task.status}
            </StatusBadge>
          </div>
        ))}
      </div>
    </div>
  );
}
