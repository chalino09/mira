"use client";

import { Plus, Search } from "lucide-react";
import { MiraCopilotCommand } from "@/components/copilot/MiraCopilot";
import { Button } from "@/components/ui/Button";
import { greenhouseDisplayName } from "@/lib/crop-ddt";
import { useGreenhouseStore } from "@/lib/store";
import { getInitials, todayLabel } from "@/lib/utils";

export function Topbar({
  copilotInsightCount = 0,
  onOpenCopilot
}: {
  copilotInsightCount?: number;
  onOpenCopilot?: () => void;
}) {
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const crops = useGreenhouseStore((state) => state.crops);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const setSelectedGreenhouseId = useGreenhouseStore((state) => state.setSelectedGreenhouseId);
  const setActiveSection = useGreenhouseStore((state) => state.setActiveSection);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const initials = getInitials(currentUser.fullName);

  return (
    <header className="sticky top-0 z-20 border-b border-app-border bg-app-background/90 px-4 py-2.5 backdrop-blur lg:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <select
            aria-label="Área productiva"
            className="h-9 min-w-0 rounded-lg border border-app-border bg-white px-3 text-xs font-medium text-app-text outline-none focus:border-app-green focus:ring-2 focus:ring-app-green/10"
            value={selectedGreenhouseId}
            onChange={(event) => setSelectedGreenhouseId(event.target.value)}
          >
            {greenhouses.map((greenhouse) => (
              <option key={greenhouse.id} value={greenhouse.id}>
                {greenhouseDisplayName(greenhouse, crops)}
              </option>
            ))}
          </select>
          <div className="hidden h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-xs text-app-muted sm:flex">
            <Search className="h-3.5 w-3.5" />
            <span>Buscar registros</span>
          </div>
          {onOpenCopilot ? (
            <MiraCopilotCommand insightCount={copilotInsightCount} onOpen={onOpenCopilot} />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2.5">
          <span className="hidden text-xs capitalize text-app-muted md:inline">{todayLabel()}</span>
          {currentUser.role === "owner" || currentUser.role === "admin" ? (
            <Button
              className="h-9 rounded-lg px-3 text-xs"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setActiveSection("calendar")}
              variant="secondary"
            >
              Planeación
            </Button>
          ) : null}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-app-border bg-white text-xs font-semibold text-app-green">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
