import { cn, formatNumber } from "@/lib/utils";

type EditorialMetric = {
  label: string;
  value: string;
};

type EditorialMetricsProps = {
  plants: number;
  transplantDays: number;
  estimatedProductionKg: number;
  pendingAlerts: number;
};

export function EditorialMetrics({
  plants,
  transplantDays,
  estimatedProductionKg,
  pendingAlerts
}: EditorialMetricsProps) {
  const metrics: EditorialMetric[] = [
    { label: "Plantas activas", value: formatNumber(plants) },
    { label: "Días desde trasplante", value: formatNumber(transplantDays) },
    { label: "Producción estimada", value: `${formatNumber(estimatedProductionKg)} kg` },
    { label: "Alertas pendientes", value: formatNumber(pendingAlerts) }
  ];

  return (
    <div className="grid gap-0 border-y border-app-border py-8 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={cn(
            "px-0 py-5 sm:px-8 xl:py-2",
            index > 0 && "border-t border-app-border sm:border-l sm:border-t-0"
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-app-muted">
            {metric.label}
          </p>
          <p className="mt-6 text-5xl font-light tracking-normal text-app-text sm:text-6xl">
            {metric.value}
          </p>
        </div>
      ))}
    </div>
  );
}
