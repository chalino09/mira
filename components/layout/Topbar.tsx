"use client";

import { Building2, CalendarDays, Plus, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MiraCopilotCommand } from "@/components/copilot/MiraCopilot";
import { Button } from "@/components/ui/Button";
import { greenhouseDisplayName } from "@/lib/crop-ddt";
import { appRoute, parseAppRoute } from "@/lib/routes";
import { weekOfYear } from "@/lib/date";
import { useGreenhouseStore } from "@/lib/store";
import { getInitials, todayLabel } from "@/lib/utils";

export function Topbar({
  copilotInsightCount = 0,
  onOpenCopilot
}: {
  copilotInsightCount?: number;
  onOpenCopilot?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const crops = useGreenhouseStore((state) => state.crops);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const initials = getInitials(currentUser.fullName);
  const currentRoute = parseAppRoute(pathname, new URLSearchParams(searchParams.toString()));
  const acceptsAll = ["calendar", "records", "pests", "harvest", "costs"].includes(activeSection);
  const acceptsPeriod = ["records", "pests", "harvest", "costs"].includes(activeSection);
  const hasContextPeriod = acceptsPeriod || activeSection === "calendar";
  const isCompanyView = ["inventory", "greenhouses", "settings"].includes(activeSection);
  const periodLabel = activeSection === "calendar"
    ? `Semana ${weekOfYear()}`
    : selectedPeriod === "week" ? `Semana ${weekOfYear()}` : selectedPeriod === "month" ? "Mes actual" : "Todo el historial";
  const navigate = (next: { section?: typeof activeSection; greenhouseId?: string; period?: typeof selectedPeriod }) => {
    const staysInSection = (next.section ?? activeSection) === activeSection;
    router.push(appRoute(organization.slug ?? organization.name, {
      section: next.section ?? activeSection,
      greenhouseId: next.greenhouseId ?? selectedGreenhouseId,
      period: next.period ?? selectedPeriod,
      inventoryView: currentRoute.inventoryView,
      list: staysInSection ? { ...currentRoute.list, page: undefined } : undefined
    }));
  };

  return (
    <header className="sticky top-0 z-20 border-b border-app-border bg-app-background/90 px-4 py-2.5 backdrop-blur lg:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <div className="flex h-11 min-w-0 w-full items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-xs text-app-muted sm:h-9 sm:w-auto">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-app-green" />
            <span className="max-w-28 truncate font-medium text-app-text">{organization.name || "Empresa"}</span>
            <span aria-hidden="true">→</span>
            {isCompanyView ? (
              <span className="font-medium text-app-text">Toda la empresa</span>
            ) : (
              <select
                aria-label="Alcance de invernaderos"
                className="h-full min-w-0 cursor-pointer bg-transparent font-medium text-app-text outline-none focus-visible:ring-2 focus-visible:ring-app-green/25"
                value={selectedGreenhouseId}
                onChange={(event) => navigate({ greenhouseId: event.target.value })}
              >
                {acceptsAll ? <option value="__all__">Todos los invernaderos</option> : null}
                {greenhouses.map((greenhouse) => (
                  <option key={greenhouse.id} value={greenhouse.id}>
                    {greenhouseDisplayName(greenhouse, crops)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {hasContextPeriod ? (
            <div className="flex h-11 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-xs text-app-muted sm:h-9">
              <CalendarDays className="h-3.5 w-3.5 text-app-green" />
              {acceptsPeriod ? (
                <select
                  aria-label="Periodo"
                  className="h-full cursor-pointer bg-transparent font-medium text-app-text outline-none focus-visible:ring-2 focus-visible:ring-app-green/25"
                  value={selectedPeriod}
                  onChange={(event) => navigate({ period: event.target.value as typeof selectedPeriod })}
                >
                  <option value="week">Semana actual</option>
                  <option value="month">Mes actual</option>
                  <option value="all">Todo el historial</option>
                </select>
              ) : <span className="font-medium text-app-text">{periodLabel}</span>}
            </div>
          ) : null}
          <button
            className="hidden h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-xs text-app-muted transition-[background-color,color] duration-150 ease-out hover:bg-app-sidebar hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green sm:flex"
            onClick={() => navigate({ section: "records" })}
            type="button"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Buscar registros</span>
          </button>
          {onOpenCopilot ? (
            <MiraCopilotCommand insightCount={copilotInsightCount} onOpen={onOpenCopilot} />
          ) : null}
        </div>

        <div className="flex w-full items-center justify-between gap-2.5 md:w-auto">
          <span className="hidden text-xs capitalize text-app-muted md:inline">{todayLabel()}</span>
          {currentUser.role === "owner" || currentUser.role === "admin" ? (
            <Button
              className="hidden h-11 rounded-lg px-3 text-xs lg:inline-flex lg:h-9"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => navigate({ section: "calendar" })}
              variant="secondary"
            >
              Planeación
            </Button>
          ) : null}
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-app-border bg-white text-xs font-semibold text-app-green sm:h-9 sm:w-9">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
