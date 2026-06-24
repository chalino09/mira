"use client";

import { BarChart3, CalendarDays, FlaskConical, Home, Menu, Send, Sprout, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BrandMark } from "@/components/layout/Sidebar";
import { navigationItemsForRole } from "@/data/navigation";
import { cn } from "@/lib/utils";
import { useGreenhouseStore } from "@/lib/store";
import type { SectionId } from "@/types";

const primaryIds: SectionId[] = ["overview", "greenhouses", "calendar", "monitoring", "reports"];
const iconFallback = {
  overview: Home,
  greenhouses: Sprout,
  calendar: CalendarDays,
  monitoring: FlaskConical,
  reports: BarChart3
};

export function MobileNav({ onOpenTelegram }: { onOpenTelegram?: () => void }) {
  const [open, setOpen] = useState(false);
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const setActiveSection = useGreenhouseStore((state) => state.setActiveSection);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const navigationItems = useMemo(() => navigationItemsForRole(currentUser.role), [currentUser.role]);
  const primary = useMemo(
    () => primaryIds.map((id) => navigationItems.find((item) => item.id === id)).filter(Boolean),
    [navigationItems]
  );

  const selectSection = (id: SectionId) => {
    setActiveSection(id);
    setOpen(false);
  };

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute left-16 top-4 max-h-[calc(100vh-2rem)] w-[min(68vw,260px)] overflow-y-auto rounded-xl border border-app-border bg-app-sidebar p-3 shadow-xl transition duration-200 ease-out"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex h-10 items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Menú</p>
              <button
                aria-label="Cerrar menú"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-app-border bg-white text-app-muted"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-app-muted transition hover:bg-white hover:text-app-text",
                    activeSection === item.id && "bg-app-sidebar text-app-text"
                  )}
                  onClick={() => selectSection(item.id)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
            {currentUser.role === "manager" ? (
              <button
                className="mt-3 flex h-10 w-full items-center gap-3 border-t border-app-border px-3 pt-3 text-sm font-medium text-app-green"
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
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-0 left-0 top-0 z-50 flex w-14 flex-col border-r border-app-border bg-app-sidebar px-2 py-3 lg:hidden">
        <div className="mb-5 flex justify-center">
          <BrandMark />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {primary.map((item) => {
            if (!item) {
              return null;
            }
            const Icon = iconFallback[item.id as keyof typeof iconFallback] ?? item.icon;
            return (
              <button
                key={item.id}
                aria-label={item.label}
                className={cn(
                  "flex h-11 w-10 items-center justify-center rounded-lg border border-transparent text-app-muted transition",
                  activeSection === item.id && "border-app-border bg-white text-app-text"
                )}
                onClick={() => selectSection(item.id)}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <div className="pb-[env(safe-area-inset-bottom)]">
          <button
            aria-label="Más"
            className={cn(
              "flex h-11 w-10 items-center justify-center rounded-lg border text-app-muted transition",
              open ? "border-app-border bg-white text-app-text" : "border-transparent"
            )}
            onClick={() => setOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </nav>
    </>
  );
}
