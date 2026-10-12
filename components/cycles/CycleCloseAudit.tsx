"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { appErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/utils";

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_name: string;
  action: "closed" | "close_adjusted";
  reason: string | null;
  previous_end: string | null;
  new_end: string | null;
};
const pageSize = 10;
const dateLabel = (date: string | null) => date ? formatDate(date) : "Por confirmar";

export function CycleCloseAudit({ companyId, greenhouseId, cycleId, version }: {
  companyId: string; greenhouseId: string; cycleId: string; version: number;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const key = `${companyId}:${greenhouseId}:${cycleId}:${version}:${page}:${retry}`;
  const [snapshot, setSnapshot] = useState<{ key: string; rows: AuditRow[]; count: number; error: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let current = true;
    void Promise.resolve(supabase.from("crop_cycle_close_audit")
      .select("id, occurred_at, actor_name, action, reason, previous_end, new_end", { count: "exact" })
      .eq("company_id", companyId).eq("greenhouse_id", greenhouseId).eq("crop_cycle_id", cycleId)
      .order("occurred_at", { ascending: false }).order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1))
      .then((response) => {
        if (current) setSnapshot({ key, rows: response.data ?? [], count: response.count ?? 0,
          error: response.error ? appErrorMessage(response.error, "No se pudo cargar la auditoría del cierre.") : "" });
      }).catch((error) => {
        if (current) setSnapshot({ key, rows: [], count: 0, error: appErrorMessage(error, "No se pudo cargar la auditoría del cierre.") });
      });
    return () => { current = false; };
  }, [open, companyId, greenhouseId, cycleId, key, page]);
  const ready = snapshot?.key === key;
  return <details key={cycleId} className="group border-b border-app-border" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm text-app-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green [&::-webkit-details-marker]:hidden">
      Historial del cierre
      <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
    </summary>
    {open ? <div className="pb-5">
      {!ready ? <p role="status" className="py-4 text-sm text-app-muted">Cargando historial…</p> : snapshot.error ? <div role="alert"><p className="text-sm">{snapshot.error}</p><Button className="mt-3" onClick={() => setRetry((value) => value + 1)}>Reintentar</Button></div> : <DataTable
        data={snapshot.rows}
        getRowKey={(row) => row.id}
        emptyLabel="Este ciclo se cerró antes de habilitar la auditoría. Los próximos ajustes quedarán registrados."
        columns={[
          { key: "date", label: "Fecha y responsable", render: (row) => <div><p className="text-sm">{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(row.occurred_at))}</p><p className="mt-1 text-xs text-app-muted">{row.actor_name}</p></div> },
          { key: "change", label: "Cambio", render: (row) => <div className="text-sm"><p>{row.action === "closed" ? "Ciclo finalizado" : "Cierre ajustado"}</p><p className="mt-1 text-xs text-app-muted">{row.action === "closed" ? dateLabel(row.new_end) : `${dateLabel(row.previous_end)} → ${dateLabel(row.new_end)}`}</p></div> },
          { key: "reason", label: "Motivo", render: (row) => <p className="max-w-md whitespace-pre-wrap text-sm">{row.reason ?? "Datos del ciclo revisados y confirmados."}</p> }
        ]}
        pagination={snapshot.count > pageSize ? { page, pageSize, total: snapshot.count, onPageChange: setPage } : undefined}
      />}
    </div> : null}
  </details>;
}
