"use client";

import { AlertTriangle, CalendarDays, Ruler, Sprout, UserRound } from "lucide-react";
import { RiskBadge } from "@/components/ui/StatusBadge";
import { cropLabelForId, getCropDdtStatus } from "@/lib/crop-ddt";
import { useGreenhouseStore } from "@/lib/store";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Greenhouse } from "@/types";

type GreenhouseCardProps = {
  greenhouse: Greenhouse;
  issues?: string[];
  selected?: boolean;
  onSelect?: () => void;
};

export function GreenhouseCard({ greenhouse, issues = [], selected, onSelect }: GreenhouseCardProps) {
  const crops = useGreenhouseStore((state) => state.crops);
  const cropStages = useGreenhouseStore((state) => state.cropStages);
  const ddtStatus = getCropDdtStatus(
    greenhouse.cropId,
    greenhouse.transplantDate,
    greenhouse.daysSinceTransplant,
    cropStages
  );
  const cropLabel = cropLabelForId(greenhouse.cropId, crops);
  const ddtLabel = ddtStatus.status === "missing-catalog"
    ? "Sin catálogo DDT"
    : ddtStatus.status === "missing-date"
      ? "Sin DDT"
      : `${ddtStatus.ddt} DDT`;

  return (
    <button
      aria-pressed={selected}
      className={`w-full border-l-2 border-t py-5 pl-4 pr-2 text-left transition-[background-color,border-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green ${
        selected
          ? "border-l-app-green border-t-app-border bg-white/55"
          : "border-l-transparent border-t-app-border bg-transparent hover:bg-white/55"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-light tracking-normal text-app-text">{greenhouse.name}</h3>
            {selected ? (
              <span className="rounded-full bg-app-green px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                Seleccionada
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">
            {cropLabel} · {greenhouse.variety || "Sin variedad"} · {greenhouse.stage} · {ddtLabel}
          </p>
        </div>
        <RiskBadge level={greenhouse.healthStatus} />
      </div>
      <div className="mt-5 grid gap-3 text-sm text-app-muted sm:grid-cols-4">
        <span className="flex items-center gap-2">
          <Ruler aria-hidden="true" className="h-4 w-4" />
          {greenhouse.surfaceM2 ? `${formatNumber(greenhouse.surfaceM2)} m²` : greenhouse.surface || "Sin superficie"}
        </span>
        <span className="flex items-center gap-2">
          <Sprout aria-hidden="true" className="h-4 w-4" />
          {formatNumber(greenhouse.plants)} plantas
        </span>
        <span className="flex items-center gap-2">
          <UserRound aria-hidden="true" className="h-4 w-4" />
          {greenhouse.manager || "Sin responsable"}
        </span>
        <span className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="h-4 w-4" />
          {greenhouse.transplantDate ? formatDate(greenhouse.transplantDate) : "Sin trasplante"}
        </span>
      </div>
      {issues.length ? (
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#725A1A]">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{issues.join(" · ")}</span>
        </p>
      ) : null}
    </button>
  );
}
