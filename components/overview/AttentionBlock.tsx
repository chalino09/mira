import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PestAlert, Task } from "@/types";
import { formatDate } from "@/lib/utils";

type AttentionBlockProps = {
  alerts: PestAlert[];
  tasks: Task[];
  onCompleteTask: (taskId: string) => void;
};

export function AttentionBlock({ alerts, tasks, onCompleteTask }: AttentionBlockProps) {
  const alert = alerts.find((item) => item.severity !== "Baja") ?? alerts[0];
  const task = tasks.find((item) => item.status !== "Completada" && item.status !== "Cancelada");

  return (
    <section className="border-t border-app-border pt-5">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-app-border bg-app-amber text-app-text">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-base font-medium text-app-text">Necesita atención</p>
            {!alert && task ? (
              <Button
                className="h-8 self-start rounded-lg px-2 text-xs"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                onClick={() => onCompleteTask(task.id)}
                variant="ghost"
              >
                Completar
              </Button>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            {alert
              ? `${alert.problem} · ${alert.zone}`
              : task
                ? `${task.type} · ${formatDate(task.date)}`
                : "Sin pendientes críticos"}
          </p>
        </div>
      </div>
    </section>
  );
}
