"use client";

import { ChevronDown, LogOut, Send } from "lucide-react";
import { MiraWordmark, PortalMark } from "@/components/brand/MiraBrand";
import { navigationItemsForRole } from "@/data/navigation";
import { cn, getInitials } from "@/lib/utils";
import { useGreenhouseStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SectionId } from "@/types";

export function BrandMark() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-app-border bg-white">
      <PortalMark className="h-5 w-7" />
    </div>
  );
}

type NavButtonProps = {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function NavButton({ id, label, icon: Icon }: NavButtonProps) {
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const setActiveSection = useGreenhouseStore((state) => state.setActiveSection);
  const active = activeSection === id;

  return (
    <button
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted transition",
        active ? "border border-app-border bg-white text-app-text" : "border border-transparent hover:bg-white hover:text-app-text"
      )}
      onClick={() => setActiveSection(id)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function Sidebar({ onOpenTelegram }: { onOpenTelegram?: () => void }) {
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const organization = useGreenhouseStore((state) => state.organization);
  const initials = getInitials(currentUser.fullName);
  const roleLabel = currentUser.role === "owner" ? "Owner" : currentUser.role === "admin" ? "Admin" : "Manager";
  const navigationItems = navigationItemsForRole(currentUser.role);

  const handleSignOut = async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    window.location.reload();
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-app-border bg-app-sidebar p-2.5 lg:flex lg:flex-col">
      <div className="flex items-center gap-2.5 px-2 py-2">
        <BrandMark />
        <div className="min-w-0">
          <MiraWordmark className="block truncate text-sm tracking-[0.34em]" />
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">{organization.name}</p>
        </div>
      </div>

      <nav className="mt-5 flex-1 space-y-0.5">
        {navigationItems.map((item) => (
          <NavButton key={item.id} id={item.id} icon={item.icon} label={item.label} />
        ))}
      </nav>

      <div className="rounded-xl border border-app-border bg-white p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-app-border bg-app-soft text-xs font-semibold text-app-green">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-xs font-medium text-app-text">{currentUser.fullName}</p>
              <span className="shrink-0 rounded-full border border-app-border bg-app-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-app-green">
                {roleLabel}
              </span>
            </div>
            <p className="truncate text-[11px] text-app-muted">{currentUser.email}</p>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-app-muted" />
        </div>
        {currentUser.role === "manager" ? (
          <button
            className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-app-border text-[11px] font-semibold uppercase tracking-[0.12em] text-app-green transition hover:bg-app-soft"
            onClick={onOpenTelegram}
            type="button"
          >
            <Send className="h-3.5 w-3.5" />
            Telegram
          </button>
        ) : null}
        <button
          className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-app-border text-[11px] font-semibold uppercase tracking-[0.12em] text-app-muted transition hover:bg-app-sidebar hover:text-app-text"
          onClick={handleSignOut}
          type="button"
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>
    </aside>
  );
}
