import { AlertTriangle, ArrowRight, CalendarRange, CheckCircle2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Task } from "@/types";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusTone(status: Task["status"]): "neutral" | "green" | "amber" | "red" {
  if (status === "Completada") return "green";
  if (status === "Bloqueada") return "red";
  if (status === "En progreso") return "amber";
  return "neutral";
}

export function TodayOperationsBlock({
  tasks,
  onCompleteTask,
  onOpenOperations
}: {
  tasks: Task[];
  onCompleteTask: (taskId: string) => void;
  onOpenOperations: () => void;
}) {
  const today = localDateKey();
  const activeTasks = tasks.filter((task) => task.status !== "Completada" && task.status !== "Cancelada");
  const todayTasks = activeTasks.filter((task) => task.date === today);
  const overdueTasks = activeTasks.filter((task) => task.date < today);
  const blockedTasks = activeTasks.filter((task) => task.status === "Bloqueada");
  const visibleTasks = [...blockedTasks, ...overdueTasks, ...todayTasks]
    .filter((task, index, items) => items.findIndex((item) => item.id === task.id) === index)
    .slice(0, 4);

  return (
    <section className="mt-14 border-y border-app-border py-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-app-border bg-white text-app-green">
            <CalendarRange className="h-4 w-4" />
          </span>
          <div>
            <p className="text-base font-medium text-app-text">Operación de hoy</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">
              {todayTasks.length} para hoy · {overdueTasks.length} atrasadas · {blockedTasks.length} bloqueadas
            </p>
          </div>
        </div>
        <Button icon={<ArrowRight className="h-4 w-4" />} onClick={onOpenOperations} variant="ghost">
          Ver semana
        </Button>
      </div>

      {visibleTasks.length ? (
        <div className="mt-5 grid border-t border-app-border lg:grid-cols-2">
          {visibleTasks.map((task, index) => (
            <article key={task.id} className={`py-4 lg:px-4 ${index % 2 ? "lg:border-l" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">
                    {task.status === "Bloqueada" ? <AlertTriangle className="h-3.5 w-3.5 text-[#7B2A2A]" /> : <Clock3 className="h-3.5 w-3.5" />}
                    {task.time || "Sin hora"} · {task.type}
                  </p>
                  <p className="mt-2 truncate text-sm font-medium text-app-text">{task.title}</p>
                </div>
                <StatusBadge tone={statusTone(task.status)}>{task.status}</StatusBadge>
              </div>
              {task.status !== "Bloqueada" ? (
                <Button
                  className="mt-3 h-8 px-2 text-xs"
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  onClick={() => onCompleteTask(task.id)}
                  variant="ghost"
                >
                  Completar
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 border-t border-app-border pt-4 text-sm text-app-muted">Sin pendientes operativos para hoy.</p>
      )}
    </section>
  );
}
