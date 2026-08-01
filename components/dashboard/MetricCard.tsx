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
  emphasis?: boolean;
};

export function MetricCard({ label, value, detail, icon: Icon, tone = "default", footer, emphasis = false }: MetricCardProps) {
  return (
    <article
      className={cn(
        "border-t border-app-border bg-transparent py-5",
        tone === "soft" && "bg-transparent",
        tone === "warn" && "border-app-amber",
        emphasis && "border-t-2 border-app-green pt-[19px]"
      )}
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">{label}</p>
          <p className={cn("mt-4 font-light tracking-normal text-app-text", emphasis ? "text-3xl sm:text-4xl" : "text-3xl")}>{value}</p>
        </div>
        <span className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center border bg-white text-app-green",
          emphasis ? "border-app-green/30 bg-app-sidebar" : "border-app-border"
        )}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
      {detail ? <p className="mt-3 text-sm leading-5 text-app-muted">{detail}</p> : null}
      {footer ? <div className="mt-4">{footer}</div> : null}
    </article>
  );
}
