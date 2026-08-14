"use client";

import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { navigationItemsForRole } from "@/data/navigation";
import { SelectionMenu } from "@/components/ui/SelectionMenu";
import { appRoute } from "@/lib/routes";
import { useGreenhouseStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function roleLabel(role: "owner" | "admin" | "manager") {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Manager";
}

export function OrganizationSwitcher({
  className,
  compact = false,
  showIcon = true
}: {
  className?: string;
  compact?: boolean;
  showIcon?: boolean;
}) {
  const router = useRouter();
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const organization = useGreenhouseStore((state) => state.organization);
  const memberships = useGreenhouseStore((state) => state.memberships);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);

  if (memberships.length <= 1) {
    return (
      <p className={cn(
        "truncate",
        compact
          ? "flex h-full items-center text-xs font-medium normal-case leading-none tracking-normal text-app-text"
          : "text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted",
        className
      )}>
        {organization.name}
      </p>
    );
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
    <div className={cn("relative min-w-0", className)}>
      {showIcon ? <Building2 aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-app-green" /> : null}
      <SelectionMenu
        ariaLabel="Cambiar empresa"
        buttonClassName={cn(
          compact
            ? "min-h-0 h-full border-0 bg-transparent px-1 text-xs shadow-none hover:bg-app-sidebar"
            : "h-8 text-[11px] font-semibold",
          showIcon && !compact && "pl-7"
        )}
        menuClassName="min-w-64"
        onChange={changeOrganization}
        options={memberships.map((membership) => ({
          value: membership.companyId,
          label: membership.organization.name,
          description: roleLabel(membership.role)
        }))}
        value={organization.id}
      />
    </div>
  );
}
