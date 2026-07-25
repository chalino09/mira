"use client";

import { Building2, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { navigationItemsForRole } from "@/data/navigation";
import { appRoute } from "@/lib/routes";
import { useGreenhouseStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function roleLabel(role: "owner" | "admin" | "manager") {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Manager";
}

export function OrganizationSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const organization = useGreenhouseStore((state) => state.organization);
  const memberships = useGreenhouseStore((state) => state.memberships);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);

  if (memberships.length <= 1) {
    return <p className={cn("truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted", className)}>{organization.name}</p>;
  }

  const changeOrganization = (companyId: string) => {
    const membership = memberships.find((item) => item.companyId === companyId);
    if (!membership || membership.companyId === organization.id) return;

    const canOpenCurrentSection = navigationItemsForRole(membership.role).some((item) => item.id === activeSection);
    router.push(appRoute(membership.organization.slug ?? membership.organization.name, {
      section: canOpenCurrentSection ? activeSection : "overview",
      period: selectedPeriod
    }));
  };

  return (
    <label className={cn("relative flex min-w-0 items-center", className)}>
      <Building2 className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-app-green" />
      <span className="sr-only">Empresa activa</span>
      <select
        aria-label="Empresa activa"
        className="h-8 min-w-0 w-full appearance-none truncate rounded-lg border border-app-border bg-white pl-7 pr-6 text-[11px] font-semibold text-app-text outline-none transition focus:border-app-green"
        onChange={(event) => changeOrganization(event.target.value)}
        value={organization.id}
      >
        {memberships.map((membership) => (
          <option key={membership.id} value={membership.companyId}>
            {membership.organization.name} · {roleLabel(membership.role)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-app-muted" />
    </label>
  );
}
