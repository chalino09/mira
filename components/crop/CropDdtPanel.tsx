import { CalendarDays, Sprout } from "lucide-react";
import {
  NUTRIENT_COLORS,
  getCropDdtStatus
} from "@/lib/crop-ddt";
import { cn, formatNumber } from "@/lib/utils";
import type { Greenhouse } from "@/types";

type CropDdtPanelProps = {
  greenhouse: Greenhouse;
  compact?: boolean;
};

export function CropDdtPanel({ greenhouse, compact = false }: CropDdtPanelProps) {
  const status = getCropDdtStatus(
    greenhouse.cropId,
    greenhouse.transplantDate,
    greenhouse.daysSinceTransplant
  );
  const visibleStage = status.stage ?? status.nextStage;

  return (
    <section className="border-t border-app-border py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            Etapa por DDT
          </p>
          <h3 className="mt-3 text-3xl font-light tracking-normal text-app-text">
            {status.status === "missing-date" ? "Sin trasplante" : `${formatNumber(status.ddt)} DDT`}
          </h3>
          <p className="mt-2 text-sm text-app-muted">{status.label} · {status.detail}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center border border-app-border bg-white text-app-green">
          {status.status === "missing-date" ? <CalendarDays className="h-4 w-4" /> : <Sprout className="h-4 w-4" />}
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden bg-app-border">
        <div
          className="h-full bg-app-green transition-all"
          style={{ width: `${Math.round(status.progress * 100)}%` }}
        />
      </div>

      {!compact ? (
        <div className="mt-5 grid grid-cols-6 gap-px overflow-hidden border border-app-border bg-app-border text-center text-[10px] font-semibold uppercase tracking-normal">
          {status.stages.map((stage) => (
            <div
              key={stage.id}
              className={cn(
                "bg-white px-2 py-2 text-app-muted",
                status.stage?.number === stage.number && "bg-[#FFF600] text-app-text"
              )}
            >
              <p>{stage.label.replace("Etapa ", "")}</p>
              <p className="mt-1 font-normal normal-case">{stage.ddtStart}-{stage.ddtEnd}</p>
            </div>
          ))}
        </div>
      ) : null}

      {visibleStage ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
              Unidad fertilizante
            </p>
            <p className="text-[11px] text-app-muted">{visibleStage.durationDays} dias</p>
          </div>
          <div className="grid grid-cols-5 gap-px overflow-hidden border border-app-border bg-app-border">
            {visibleStage.fertilizerUnitRanges.map((fertilizer) => (
              <div key={fertilizer.nutrient} className="bg-white">
                <p className={cn("px-2 py-1 text-center text-xs font-bold", NUTRIENT_COLORS[fertilizer.nutrient])}>
                  {fertilizer.nutrient}
                </p>
                <p className="px-1 py-3 text-center text-sm font-semibold tracking-normal text-app-text">
                  {fertilizer.display}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
