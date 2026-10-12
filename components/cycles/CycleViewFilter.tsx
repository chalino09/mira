"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SelectionMenu } from "@/components/ui/SelectionMenu";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { appRoute, parseAppRoute } from "@/lib/routes";

export function CycleViewFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const greenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const organization = useGreenhouseStore((state) => state.organization);
  const [snapshot, setSnapshot] = useState<{ key: string; rows: { id: string; variety: string | null; status: string }[] } | null>(null);
  const key = `${organization.id}:${greenhouseId}`;
  const route = parseAppRoute(pathname, new URLSearchParams(searchParams.toString()));
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let current = true;
    void supabase.from("crop_cycles").select("id,variety,status").eq("company_id", organization.id).eq("greenhouse_id", greenhouseId).order("created_at", { ascending: false }).order("id", { ascending: false }).then((response) => {
      if (current) setSnapshot({ key, rows: response.data ?? [] });
    });
    return () => { current = false; };
  }, [organization.id, greenhouseId, key]);
  return <div className="flex h-11 items-center rounded-lg border border-app-border bg-white px-2 text-xs sm:h-9">
    <SelectionMenu ariaLabel="Ciclo de producción" value={route.list?.cycle ?? "__all__"}
      buttonClassName="h-full min-h-0 border-0 bg-transparent shadow-none"
      options={[
        { value: "__all__", label: "Todos los ciclos" },
        ...(snapshot?.key === key ? snapshot.rows : []).map((row) => ({ value: row.id, label: `${row.variety || "Sin variedad"} · ${row.status === "active" ? "Activo" : "Finalizado"}` })),
        { value: "__pending__", label: "Pendientes de asignar" }
      ]}
      onChange={(cycle) => router.push(appRoute(organization.slug ?? organization.name, { ...route, greenhouseId, list: { ...route.list, cycle: cycle === "__all__" ? undefined : cycle, page: undefined } }))}
    />
  </div>;
}
