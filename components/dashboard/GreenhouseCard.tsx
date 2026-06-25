"use client";

import { CalendarDays, MapPin, Sprout, UserRound } from "lucide-react";
import { RiskBadge } from "@/components/ui/StatusBadge";
import { cropLabelForId, getCropDdtStatus } from "@/lib/crop-ddt";
import { useGreenhouseStore } from "@/lib/store";
import { formatDate, formatNumber } from "@/lib/utils";
import type { Greenhouse } from "@/types";

type GreenhouseCardProps = {
  greenhouse: Greenhouse;
  selected?: boolean;
  onSelect?: () => void;
};

export function GreenhouseCard({ greenhouse, selected, onSelect }: GreenhouseCardProps) {
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
      className="w-full border-t border-app-border bg-transparent py-5 text-left transition hover:bg-white/55"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-light tracking-normal text-app-text">{greenhouse.name}</h3>
            {selected ? (
              <span className="rounded-full bg-app-green px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                Activo
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
          <MapPin className="h-4 w-4" />
          {greenhouse.location}
        </span>
        <span className="flex items-center gap-2">
          <Sprout className="h-4 w-4" />
          {formatNumber(greenhouse.plants)} plantas
        </span>
        <span className="flex items-center gap-2">
          <UserRound className="h-4 w-4" />
          Encargado: {greenhouse.manager}
        </span>
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {formatDate(greenhouse.transplantDate)}
        </span>
      </div>
    </button>
  );
}
