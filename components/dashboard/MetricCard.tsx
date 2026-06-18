import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "default" | "soft" | "warn";
  footer?: ReactNode;
};

export function MetricCard({ label, value, detail, icon: Icon, tone = "default", footer }: MetricCardProps) {
  return (
    <article
      className={cn(
        "border-t border-app-border bg-transparent py-5",
        tone === "soft" && "bg-transparent",
        tone === "warn" && "border-app-amber"
      )}
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">{label}</p>
          <p className="mt-4 text-3xl font-light tracking-normal text-app-text">{value}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-app-border bg-white text-app-green">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {detail ? <p className="mt-3 text-sm leading-5 text-app-muted">{detail}</p> : null}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </article>
  );
}
