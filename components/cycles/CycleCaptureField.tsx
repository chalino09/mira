"use client";

import { useEffect, useState } from "react";
import { Field, SelectInput } from "@/components/forms/FormControls";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

/** Explicit membership allows late captures even when the previous close is unknown. */
export function CycleCaptureField({ greenhouseId, value, onChange }: {
  greenhouseId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const companyId = useGreenhouseStore((state) => state.organization.id);
  const [snapshot, setSnapshot] = useState<{ key: string; error: string; rows: { id: string; variety: string | null; status: string; started_at: string | null }[] } | null>(null);
  const key = `${companyId}:${greenhouseId}`;
  const ready = snapshot?.key === key;
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !greenhouseId || greenhouseId === "__all__") return;
    let current = true;
    void supabase.from("crop_cycles").select("id, variety, status, started_at").eq("company_id", companyId).eq("greenhouse_id", greenhouseId).neq("status", "cancelled").order("created_at", { ascending: false }).order("id", { ascending: false }).then((response) => {
      if (current) setSnapshot({ key, rows: response.data ?? [], error: response.error ? "No se pudieron consultar los ciclos. Puedes dejar la asignación por fecha." : "" });
    });
    return () => { current = false; };
  }, [companyId, greenhouseId, key]);
  if (!greenhouseId || greenhouseId === "__all__") return null;
  const rows = ready ? snapshot.rows : [];
  return <Field label="Ciclo de producción">
    <SelectInput name="cropCycleId" value={rows.some((row) => row.id === value) ? value : ""} disabled={!ready} onChange={(event) => onChange(event.target.value)}>
      <option value="">Según fecha · pendiente si hay dudas</option>
      {rows.map((row) => <option key={row.id} value={row.id}>{row.variety || "Sin variedad"} · {row.status === "active" ? "Activo" : "Finalizado"}{row.started_at ? ` · ${formatDate(row.started_at)}` : " · Inicio por confirmar"}</option>)}
    </SelectInput>
    <span className="text-xs leading-5 text-app-muted">{ready && snapshot.error ? snapshot.error : "Para capturar información de un ciclo anterior, selecciónalo aquí."}</span>
  </Field>;
}
