"use client";

import { CalendarDays, FlaskConical, Home, Menu, Send, Sprout, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { navigationItemsForRole } from "@/data/navigation";
import { cn } from "@/lib/utils";
import { useGreenhouseStore } from "@/lib/store";
import { appRoute } from "@/lib/routes";
import type { SectionId } from "@/types";
import { OrganizationSwitcher } from "@/components/layout/OrganizationSwitcher";

const primaryIds: SectionId[] = ["overview", "calendar", "monitoring"];
const iconFallback = {
  overview: Home,
  greenhouses: Sprout,
  calendar: CalendarDays,
  monitoring: FlaskConical
};

export function MobileNav({ onOpenTelegram }: { onOpenTelegram?: () => void }) {
  const [open, setOpen] = useState(false);
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const organization = useGreenhouseStore((state) => state.organization);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const navigationItems = useMemo(() => navigationItemsForRole(currentUser.role), [currentUser.role]);
  const mobileNavigationItems = useMemo(
    () => navigationItems.filter((item) => item.id !== "settings"),
    [navigationItems]
  );
  const primary = useMemo(
    () => primaryIds.map((id) => navigationItems.find((item) => item.id === id)).filter(Boolean),
    [navigationItems]
  );

  const sectionHref = (section: SectionId) => appRoute(organization.slug ?? organization.name, {
    section,
    greenhouseId: selectedGreenhouseId,
    period: selectedPeriod
  });

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[60] bg-black/30 lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[min(76vh,620px)] overflow-y-auto rounded-t-2xl border border-app-border bg-app-sidebar px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex h-11 items-center justify-between border-b border-app-border">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Más secciones</p>
              <button
                aria-label="Cerrar menú"
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-app-border bg-white text-app-muted"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <OrganizationSwitcher className="mb-3" />
            {currentUser.role === "manager" ? (
              <button
                className="mb-3 flex min-h-12 w-full items-center gap-3 rounded-lg border border-app-green/25 bg-app-soft px-3 text-sm font-medium text-app-green"
                onClick={() => {
                  setOpen(false);
                  onOpenTelegram?.();
                }}
                type="button"
              >
                <Send className="h-4 w-4" />
                Conectar Telegram
              </button>
            ) : null}
            {mobileNavigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-app-muted transition hover:bg-white hover:text-app-text",
                    activeSection === item.id && "bg-white text-app-text"
                  )}
                  href={sectionHref(item.id)}
                  onClick={() => setOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-app-border bg-app-sidebar/95 px-2 pt-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex h-16 max-w-lg items-start justify-between gap-1 pb-[env(safe-area-inset-bottom)]">
          {primary.map((item) => {
            if (!item) {
              return null;
            }
            const Icon = iconFallback[item.id as keyof typeof iconFallback] ?? item.icon;
            return (
              <Link
                key={item.id}
                className={cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-transparent px-1 text-[10px] font-medium text-app-muted transition",
                  activeSection === item.id && "border-app-border bg-white text-app-text"
                )}
                href={sectionHref(item.id)}
              >
                <Icon className="h-4 w-4" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            className={cn(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-[10px] font-medium text-app-muted transition",
              open ? "border-app-border bg-white text-app-text" : "border-transparent"
            )}
            onClick={() => setOpen(true)}
          >
            <Menu className="h-4 w-4" />
            <span>Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
