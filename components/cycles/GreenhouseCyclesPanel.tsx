"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, Edit3, Package, Plus, Sprout, WalletCards, X } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CropDdtPanel } from "@/components/crop/CropDdtPanel";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { SelectionMenu } from "@/components/ui/SelectionMenu";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Field, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { DatePickerInput } from "@/components/forms/DateTimeInputs";
import { CycleCloseAudit } from "@/components/cycles/CycleCloseAudit";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { appErrorMessage } from "@/lib/errors";
import { localDateKey } from "@/lib/mira-copilot";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { cycleResources, cycleTotalsFor, greenhouseForCycle, mapCropCycle, suggestedCycleForDate, type CropCycle, type CycleTotal } from "@/lib/crop-cycles";
import type { Greenhouse } from "@/types";

type CaptureRow = Record<string, any> & { id: string; crop_cycle_id: string | null };
type RecordPage = { key: string; rows: CaptureRow[]; count: number; error: string; table: string };
const pending = "__pending__";
const pageSize = 25;
const focusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green";

export function GreenhouseCyclesPanel({ greenhouse, initialAction }: { greenhouse: Greenhouse; initialAction?: "start" }) {
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const crops = useGreenhouseStore((state) => state.crops);
  const updateGreenhouse = useGreenhouseStore((state) => state.updateGreenhouse);
  const canManage = currentUser.role === "owner" || currentUser.role === "admin";
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; cycles: CropCycle[]; totals: CycleTotal[]; error: string } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useState<"summary" | "records" | "pending">("summary");
  const [resourceIndex, setResourceIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [recordSnapshot, setRecordSnapshot] = useState<RecordPage | null>(null);
  const [recordPages, setRecordPages] = useState<Record<string, RecordPage>>({});
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [assignmentId, setAssignmentId] = useState("");
  const [modal, setModal] = useState<"start" | "close" | "edit" | null>(() => initialAction === "start" && canManage ? "start" : null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [unknownEnd, setUnknownEnd] = useState(false);
  const [dataConfirmed, setDataConfirmed] = useState(false);
  const [reviewUpdatedAt, setReviewUpdatedAt] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewportFloor, setViewportFloor] = useState(0);
  const workspaceKey = `${organization.id}:${greenhouse.id}:${version}`;
  const ready = Boolean(snapshot?.key.startsWith(`${organization.id}:${greenhouse.id}:`));
  const cyclesUpdating = ready && snapshot?.key !== workspaceKey;
  const cycles = ready ? snapshot!.cycles : [];
  const totals = ready ? snapshot!.totals : [];
  const active = cycles.find((cycle) => cycle.status === "active");
  const contextSelection = cycles.some((cycle) => cycle.id === selectedId) ? selectedId : active?.id ?? cycles[0]?.id ?? pending;
  const selection = view === "pending" ? pending : contextSelection;
  const selected = cycles.find((cycle) => cycle.id === contextSelection);
  const selectedTotals = cycleTotalsFor(totals, selected?.id ?? null);
  const pendingTotals = cycleTotalsFor(totals, null);
  const resource = cycleResources[resourceIndex];
  const recordsKey = `${workspaceKey}:${selection}:${resource.table}:${page}`;
  const currentRecords = recordPages[recordsKey];
  const recordsReady = Boolean(currentRecords);
  const visibleRecords = currentRecords ?? (recordSnapshot?.key.startsWith(`${organization.id}:${greenhouse.id}:`) ? recordSnapshot : null);
  const rows = visibleRecords?.rows ?? [];
  const visibleResource = cycleResources.find((item) => item.table === visibleRecords?.table) ?? resource;
  const count = currentRecords?.count ?? Number(totals.find((total) => total.resource === resource.table && total.cycleId === (selection === pending ? null : selection))?.count ?? 0);

  function visibleViewportHeight() {
    const panel = panelRef.current;
    if (!panel) return 0;
    const main = panel.closest("main");
    const bottomPadding = main ? Number.parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
    return Math.max(0, window.innerHeight - panel.getBoundingClientRect().top - bottomPadding);
  }
  function preserveViewport() {
    // Keep only the currently visible viewport, not the previous list's height.
    // A shorter result must not clamp scroll and move the tabs under the pointer.
    setViewportFloor(visibleViewportHeight());
  }
  useEffect(() => {
    if (!viewportFloor) return;
    const releaseViewport = () => setViewportFloor((height) => Math.min(height, visibleViewportHeight()));
    window.addEventListener("scroll", releaseViewport, { passive: true });
    window.addEventListener("resize", releaseViewport);
    return () => {
      window.removeEventListener("scroll", releaseViewport);
      window.removeEventListener("resize", releaseViewport);
    };
  }, [viewportFloor]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let current = true;
    void Promise.all([
      supabase.from("crop_cycles").select("*").eq("company_id", organization.id).eq("greenhouse_id", greenhouse.id).order("created_at", { ascending: false }).order("id", { ascending: false }),
      supabase.rpc("get_greenhouse_cycle_totals", { target_greenhouse_id: greenhouse.id })
    ]).then(([cycleResponse, totalsResponse]) => {
      if (!current) return;
      const failure = cycleResponse.error ?? totalsResponse.error;
      setSnapshot({ key: workspaceKey, cycles: failure ? [] : (cycleResponse.data ?? []).map(mapCropCycle), totals: failure ? [] : totalsResponse.data ?? [],
        error: failure ? appErrorMessage(failure, "No se pudo cargar el historial. Reintenta en unos momentos.") : "" });
    }).catch((caught) => {
      if (current) setSnapshot({ key: workspaceKey, cycles: [], totals: [], error: appErrorMessage(caught, "No se pudo cargar el historial de ciclos.") });
    });
    return () => { current = false; };
  }, [organization.id, greenhouse.id, workspaceKey]);

  useEffect(() => {
    if (!ready || snapshot?.error) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let current = true;
    let query = supabase.from(resource.table).select(resource.columns, { count: "exact" }).eq("company_id", organization.id).eq("greenhouse_id", greenhouse.id);
    query = selection === pending ? query.is("crop_cycle_id", null) : query.eq("crop_cycle_id", selection);
    void Promise.resolve(query.order(resource.date, { ascending: false }).order("id", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)).then((response) => {
      if (!current) return;
      const result: RecordPage = { key: recordsKey, table: resource.table, rows: (response.data ?? []) as unknown as CaptureRow[], count: response.count ?? 0,
        error: response.error ? appErrorMessage(response.error, "No se pudieron cargar los registros.") : "" };
      setRecordSnapshot(result);
      setRecordPages((cached) => ({ ...Object.fromEntries(Object.entries(cached).filter(([key]) => key !== recordsKey).slice(-19)), [recordsKey]: result }));
    }).catch((caught) => {
      if (!current) return;
      const result: RecordPage = { key: recordsKey, table: resource.table, rows: [], count: 0, error: appErrorMessage(caught, "No se pudieron cargar los registros.") };
      setRecordSnapshot(result); setRecordPages((cached) => ({ ...cached, [recordsKey]: result }));
    });
    return () => { current = false; };
  }, [ready, snapshot?.error, organization.id, greenhouse.id, recordsKey, selection, resource, page]);

  function changeSelection(id: string) {
    preserveViewport();
    if (view === "pending") setView("records");
    setSelectedId(id); setPage(1); setSelectedRecords([]); setNotice(""); setError("");
  }
  function changeView(nextView: "summary" | "records" | "pending") {
    if (nextView === view) return;
    preserveViewport();
    setView(nextView); setPage(1); setSelectedRecords([]); setNotice(""); setError("");
  }
  function cycleLabel(cycle: CropCycle) {
    return `Ciclo ${cycles.length - cycles.findIndex((item) => item.id === cycle.id)} · ${cycle.variety || "Sin variedad"}`;
  }
  function cyclePeriod(cycle: CropCycle) {
    const start = cycle.startedAt || cycle.transplantDate;
    return `${start ? formatDate(start) : "Inicio por confirmar"} – ${cycle.status === "active" ? "En curso" : cycle.endedAt ? formatDate(cycle.endedAt) : "Cierre por confirmar"}`;
  }
  function openEditor(kind: "start" | "close" | "edit") {
    if (kind === "edit" && selected?.status !== "active") return;
    setUnknownEnd(kind === "close" && selected?.status === "closed" && !selected.endedAt);
    setDataConfirmed(false); setReviewUpdatedAt(selected?.updatedAt ?? "");
    setModal(kind); setError(""); setNotice("");
  }
  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (modal === "close" && selected) {
        const endDate = unknownEnd ? null : String(form.get("endDate") ?? "") || null;
        if (!unknownEnd && !endDate) throw new Error("Selecciona la fecha de cierre.");
        if (selected.status === "active" && !dataConfirmed) throw new Error("Confirma los datos antes de finalizar el ciclo.");
        const response = selected.status === "active"
          ? await supabase.rpc("close_greenhouse_cycle", { target_cycle_id: selected.id, target_end: endDate, target_confirmed: dataConfirmed, target_expected_updated_at: reviewUpdatedAt })
          : await supabase.rpc("adjust_greenhouse_cycle_close", { target_cycle_id: selected.id, target_end: endDate, target_reason: String(form.get("reason") ?? "").trim(), target_expected_updated_at: reviewUpdatedAt });
        if (response.error) throw response.error;
        setNotice(selected.status === "active" ? unknownEnd ? "Ciclo finalizado · fecha por confirmar." : "Ciclo finalizado." : "Ajuste de cierre guardado.");
      } else {
        if (modal === "edit" && selected?.status !== "active") throw new Error("Los datos de un ciclo finalizado no se pueden editar.");
        const params = {
          target_crop_id: String(form.get("cropId")), target_variety: String(form.get("variety")).trim(),
          target_start: String(form.get("startDate")) || null, target_plants: Number(form.get("plants")),
          target_stems: form.get("stems") ? Number(form.get("stems")) : null,
          target_grafted: form.get("grafted") === "" ? null : form.get("grafted") === "true",
          target_budget: form.get("budget") ? Number(form.get("budget")) : null,
          target_beds: Number(form.get("beds") || 0), target_notes: String(form.get("notes") ?? "").trim() || null
        };
        const response = modal === "edit" && selected
          ? await supabase.rpc("update_greenhouse_cycle_details", { target_cycle_id: selected.id, ...params })
          : await supabase.rpc("start_greenhouse_cycle", { target_greenhouse_id: greenhouse.id, ...params });
        if (response.error) throw response.error;
        const id = modal === "edit" ? selected!.id : String(response.data);
        // Update the operational context only for the active cycle, never when viewing history.
        if (modal === "start" || selected?.status === "active") {
          const responseCycle = await supabase.from("crop_cycles").select("*").eq("company_id", organization.id).eq("id", id).single();
          if (responseCycle.error) throw responseCycle.error;
          updateGreenhouse(greenhouseForCycle(greenhouse, mapCropCycle(responseCycle.data)));
        }
        setSelectedId(id); setPage(1); setSelectedRecords([]);
        setNotice(modal === "edit" ? "Datos guardados." : "Nuevo ciclo iniciado.");
      }
      setModal(null); setView("summary"); setVersion((value) => value + 1);
    } catch (caught) {
      const message = appErrorMessage(caught, "No se pudo guardar el ciclo.");
      setError(message);
      if (message.includes("Los datos cambiaron") || message.includes("El cierre cambió")) {
        setModal(null); setDataConfirmed(false); setVersion((value) => value + 1);
      }
    }
    finally { setBusy(false); }
  }
  async function assignRecords() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy || !assignmentId || !selectedRecords.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await supabase.rpc("assign_records_to_cycle", { target_cycle_id: assignmentId, target_table: resource.table, target_record_ids: selectedRecords });
      if (response.error) throw response.error;
      setNotice(`${response.data} ${response.data === 1 ? "registro asignado" : "registros asignados"}.`);
      setSelectedRecords([]); setPage(1); setVersion((value) => value + 1);
    } catch (caught) { setError(appErrorMessage(caught, "No se pudieron asignar los registros.")); }
    finally { setBusy(false); }
  }

  if (!getSupabaseBrowserClient()) return <p role="alert">No se pudo conectar con la base de datos.</p>;
  if (!ready) return <p role="status" className="py-8 text-sm text-app-muted">Cargando ciclos…</p>;
  if (snapshot!.error) return <div role="alert" className="py-5"><p>{snapshot!.error}</p><Button className="mt-3" onClick={() => setVersion((value) => value + 1)}>Reintentar</Button></div>;

  return (
    <div ref={panelRef} className="grid content-start gap-7" style={viewportFloor ? { minHeight: viewportFloor } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {selected ? <SelectionMenu
            ariaLabel="Consultar ciclo"
            buttonClassName="min-h-11 text-sm"
            className="w-64 max-w-full"
            disabled={cyclesUpdating}
            onChange={changeSelection}
            options={cycles.map((cycle) => ({ value: cycle.id, label: cycleLabel(cycle), description: cycle.status === "active" ? "Activo" : "Finalizado" }))}
            value={selection}
          /> : <h2 className="text-xl font-light">Sin ciclo activo</h2>}
          {selected ? <StatusBadge tone={selected.status === "active" ? "green" : "neutral"}>{selected.status === "active" ? "Activo" : selected.status === "closed" ? "Finalizado" : "Cancelado"}</StatusBadge> : null}
        </div>
        {canManage ? <div className="flex flex-wrap gap-2">
          {selected?.status === "active" ? <Button icon={<Edit3 aria-hidden="true" className="h-4 w-4" />} disabled={busy || cyclesUpdating} onClick={() => openEditor("edit")} variant="ghost">Editar datos</Button> : null}
          {selected && selected.status !== "cancelled" ? <Button
            disabled={busy || cyclesUpdating}
            icon={<CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            onClick={() => openEditor("close")}
            variant={selected.status === "active" ? "primary" : "secondary"}
          >{selected.status === "active" ? "Finalizar ciclo" : "Ajustar cierre"}</Button> : null}
          {!active ? <Button disabled={busy || cyclesUpdating} icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={() => openEditor("start")} variant="primary">Nuevo ciclo</Button> : null}
        </div> : null}
      </div>
      {selected ? <p className="-mt-4 text-xs text-app-muted">{crops.find((crop) => crop.id === selected.cropId)?.name ?? "Cultivo"} · {cyclePeriod(selected)}</p> : null}
      {(notice || (error && !modal)) ? <div className={cn("fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg lg:bottom-6", error ? "border-red-200 text-red-700" : "border-app-border text-app-green")}>
        <p aria-live={error ? "assertive" : "polite"} role={error ? "alert" : "status"} className="min-w-0 flex-1 text-sm">{error || notice}</p>
        <Button aria-label="Cerrar aviso" className="h-11 w-11 shrink-0 px-0" icon={<X aria-hidden="true" className="h-4 w-4" />} onClick={() => { setError(""); setNotice(""); }} variant="ghost" />
      </div> : null}
      <nav aria-label="Vista del ciclo" className="flex flex-wrap gap-5 border-b border-app-border">
        {[
          { label: "Resumen", active: view === "summary", view: "summary" as const },
          { label: "Registros", active: view === "records", view: "records" as const },
          { label: `Sin ciclo (${formatNumber(pendingTotals.count)})`, active: view === "pending", view: "pending" as const }
        ].map((item) => <button
          aria-pressed={item.active}
          className={cn("min-h-11 border-b-2 px-1 pb-3 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none", focusClass, item.active ? "border-app-green text-app-green" : "border-transparent text-app-muted hover:text-app-text")}
          key={item.label}
          onClick={() => changeView(item.view)}
          type="button"
        >{item.label}</button>)}
      </nav>
      {view === "summary" ? <>
        {selected ? <>
          <div className="grid grid-cols-2 gap-x-6 lg:grid-cols-4">
            <MetricCard label="Plantas" value={formatNumber(selected.plants)} detail={`${formatNumber(selected.beds)} camas`} icon={Sprout} emphasis />
            <MetricCard label="Cosecha" value={`${formatNumber(selectedTotals.kilograms)} kg`} icon={Package} />
            <MetricCard label="Gastos" value={formatCurrency(selectedTotals.expenses)} icon={WalletCards} />
            <MetricCard label="Ventas netas" value={formatCurrency(selectedTotals.income)} icon={WalletCards} />
          </div>
          <details className="group border-y border-app-border">
            <summary className={cn("flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm text-app-muted [&::-webkit-details-marker]:hidden", focusClass)}>
              Datos del cultivo
              <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <dl className="grid gap-x-8 gap-y-5 pb-5 text-sm sm:grid-cols-3">
              {[
                { label: "Tallos", value: selected.stemCount ? String(selected.stemCount) : "Por confirmar" },
                { label: "Injerto", value: selected.isGrafted === null ? "Por confirmar" : selected.isGrafted ? "Sí" : "No" },
                { label: "Presupuesto", value: selected.budgetAmount === null ? "Por confirmar" : formatCurrency(selected.budgetAmount) }
              ].map((item) => <div key={item.label}><dt className="text-xs text-app-muted">{item.label}</dt><dd className="mt-1 tabular-nums">{item.value}</dd></div>)}
              {selected.notes ? <div className="sm:col-span-3"><dt className="text-xs text-app-muted">Notas</dt><dd className="mt-1 whitespace-pre-wrap">{selected.notes}</dd></div> : null}
            </dl>
            {selected.status === "active" || selected.endedAt ? <div className="pb-3">
              {selected.status !== "active" ? <p className="text-xs text-app-muted">Detalle al cierre · {formatDate(selected.endedAt)}</p> : null}
              <CropDdtPanel greenhouse={greenhouseForCycle(greenhouse, selected, selected.status === "active" ? undefined : selected.endedAt)} />
            </div> : null}
          </details>
          {selected.status === "closed" ? <CycleCloseAudit key={selected.id} companyId={organization.id} greenhouseId={greenhouse.id} cycleId={selected.id} version={version} /> : null}
        </> : <p className="py-4 text-sm text-app-muted">Inicia un ciclo para registrar su cultivo y producción.</p>}
        <section aria-labelledby="cycle-history-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="cycle-history-title" className="text-xl font-light">Historial de ciclos</h2><span className="text-xs text-app-muted">{cycles.length} {cycles.length === 1 ? "ciclo" : "ciclos"}</span></div>
          <DataTable
            data={cycles}
            emptyLabel="Todavía no hay ciclos registrados."
            getRowKey={(cycle) => cycle.id}
            columns={[
              { key: "cycle", label: "Ciclo", render: (cycle) => <button aria-pressed={selection === cycle.id} className={cn("inline-flex min-h-11 items-center gap-2 text-left font-medium underline-offset-4 hover:underline", focusClass, selection === cycle.id ? "text-app-green" : "text-app-text")} onClick={() => changeSelection(cycle.id)}><span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", selection === cycle.id ? "bg-app-green" : "bg-app-border")} />{cycleLabel(cycle)}</button> },
              { key: "period", label: "Periodo", render: (cycle) => <div className="text-xs leading-5"><p>{cyclePeriod(cycle)}</p><span className={cycle.status === "active" ? "text-app-green" : "text-app-muted"}>{cycle.status === "active" ? "Activo" : cycle.status === "closed" ? "Finalizado" : "Cancelado"}</span></div> },
              { key: "harvest", label: "Cosecha", className: "tabular-nums", render: (cycle) => `${formatNumber(cycleTotalsFor(totals, cycle.id).kilograms)} kg` },
              { key: "expenses", label: "Gastos", className: "tabular-nums", render: (cycle) => formatCurrency(cycleTotalsFor(totals, cycle.id).expenses) },
              { key: "income", label: "Ventas netas", className: "tabular-nums", render: (cycle) => formatCurrency(cycleTotalsFor(totals, cycle.id).income) }
            ]}
          />
        </section>
      </> : <section aria-label={view === "pending" ? "Registros sin ciclo" : "Registros del ciclo"} aria-busy={!recordsReady} className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SelectionMenu
            ariaLabel="Tipo de registro"
            buttonClassName="min-h-11"
            className="w-56 max-w-full"
            onChange={(value) => { preserveViewport(); setResourceIndex(Number(value)); setPage(1); setSelectedRecords([]); }}
            options={cycleResources.map((item, index) => ({ value: String(index), label: `${item.label} (${totals.find((total) => total.resource === item.table && total.cycleId === (selection === pending ? null : selection))?.count ?? 0})` }))}
            value={String(resourceIndex)}
          />
          <div className="flex min-h-11 flex-wrap items-center gap-4 text-xs text-app-muted">
            <p className="min-w-[8rem] tabular-nums">{!recordsReady ? "Actualizando…" : <>{formatNumber(count)} {count === 1 ? "registro" : "registros"}{view === "pending" ? " sin ciclo" : ""}</>}</p>
            {canManage ? <label className="flex min-h-11 items-center gap-2"><input disabled={!recordsReady || !rows.length || busy} type="checkbox" className="h-4 w-4 accent-app-green disabled:opacity-40" checked={recordsReady && rows.length > 0 && rows.every((row) => selectedRecords.includes(row.id))} onChange={(event) => setSelectedRecords(event.target.checked ? rows.map((row) => row.id) : [])} />Seleccionar página</label> : null}
          </div>
        </div>
        {canManage && selectedRecords.length ? <div aria-label="Asignar registros seleccionados" role="group" className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-xl border border-app-border bg-white px-4 py-3 shadow-lg lg:bottom-6">
          <span className="text-sm font-medium">{selectedRecords.length} {selectedRecords.length === 1 ? "seleccionado" : "seleccionados"}</span>
          <SelectionMenu
            ariaLabel="Asignar a ciclo"
            dropUp
            className="w-64 max-w-full sm:ml-auto"
            buttonClassName="min-h-11"
            disabled={busy}
            onChange={setAssignmentId}
            options={[{ value: "", label: "Seleccionar ciclo" }, ...cycles.filter((cycle) => cycle.status !== "cancelled").map((cycle) => ({ value: cycle.id, label: cycleLabel(cycle) }))]}
            value={assignmentId}
          />
          <Button disabled={busy || !assignmentId} onClick={assignRecords} variant="primary">Asignar</Button>
          <Button disabled={busy} onClick={() => setSelectedRecords([])} variant="ghost">Cancelar</Button>
        </div> : null}
        <span role="status" className="sr-only">{!recordsReady ? "Cargando registros…" : ""}</span>
        {currentRecords?.error ? <p role="alert" className="text-sm text-red-700">{currentRecords.error}</p> : null}
        <div className={cn("transition-opacity duration-150 motion-reduce:transition-none", !recordsReady && "opacity-50")}>
          <DataTable
            desktopLayout="fixed"
            data={rows}
            emptyLabel={!recordsReady ? "Cargando registros…" : `Sin ${resource.label.toLowerCase()} en ${selection === pending ? "registros sin ciclo" : "este ciclo"}.`}
            getRowKey={(row) => row.id}
            columns={[
              ...(canManage ? [{ key: "select", label: "Seleccionar", className: "md:w-24", render: (row: CaptureRow) => <label className="inline-flex min-h-11 min-w-11 items-center justify-center"><span className="sr-only">Seleccionar registro del {formatDate(row[visibleResource.date])}</span><input disabled={!recordsReady || busy} type="checkbox" className="h-4 w-4 accent-app-green" checked={selectedRecords.includes(row.id)} onChange={(event) => setSelectedRecords((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} /></label> }] : []),
              { key: "date", label: "Fecha", className: "md:w-32", render: (row) => formatDate(row[visibleResource.date]) },
              { key: "record", label: "Registro", render: (row) => <div className="break-words"><p>{row[visibleResource.description] || visibleResource.label}{row.kilograms != null ? ` · ${formatNumber(Number(row.kilograms))} kg` : ""}{row.amount != null ? ` · ${formatCurrency(Number(row.amount))}` : ""}</p>{row.notes ? <details className="mt-1 text-xs text-app-muted"><summary className={cn("cursor-pointer", focusClass)}>Ver nota</summary><p className="mt-2 max-w-xl whitespace-pre-wrap leading-5">{row.notes}</p></details> : null}</div> },
              { key: "cycle", label: "Ciclo", className: "md:w-48", render: (row: CaptureRow) => { const assigned = cycles.find((cycle) => cycle.id === row.crop_cycle_id); const suggestion = !row.crop_cycle_id ? cycles.find((cycle) => cycle.id === suggestedCycleForDate(cycles, String(row[visibleResource.date] ?? ""))) : undefined; return <div className="text-xs text-app-muted"><p>{assigned ? cycleLabel(assigned) : suggestion ? cycleLabel(suggestion) : "Revisar fechas"}</p>{!assigned && suggestion ? <p className="mt-1">Sugerido</p> : null}</div>; } }
            ]}
            pagination={count > pageSize ? { page, pageSize, total: count, onPageChange: (value) => { preserveViewport(); setPage(value); setSelectedRecords([]); } } : undefined}
          />
        </div>
      </section>}
      <Modal busy={busy} open={canManage && modal !== null && (modal !== "start" || !active) && (modal !== "edit" || selected?.status === "active")} onClose={() => { if (!busy) { setModal(null); setError(""); } }} title={modal === "close" ? selected?.status === "active" ? "Finalizar ciclo" : "Ajustar cierre" : modal === "edit" ? "Editar ciclo" : "Nuevo ciclo"} panelClassName={modal === "close" ? "sm:max-w-lg" : "sm:max-w-2xl"}>
        <form onSubmit={saveCycle} className="grid gap-5">
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            {modal === "close" ? <>
              {selected?.status === "active" ? <>
                <p className="text-sm leading-6 text-app-muted sm:col-span-2">Revisa estos datos. Al finalizar, quedarán bloqueados.</p>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-app-border p-4 text-sm sm:col-span-2">
                  {[
                    { label: "Cultivo", value: crops.find((crop) => crop.id === selected.cropId)?.name ?? "Por confirmar" },
                    { label: "Variedad", value: selected.variety || "Por confirmar" },
                    { label: "Trasplante", value: selected.transplantDate ? formatDate(selected.transplantDate) : "Por confirmar" },
                    { label: "Inicio", value: selected.startedAt ? formatDate(selected.startedAt) : "Por confirmar" },
                    { label: "Etapa", value: selected.stage },
                    { label: "Plantas", value: formatNumber(selected.plants) },
                    { label: "Tallos", value: selected.stemCount ?? "Por confirmar" },
                    { label: "Injerto", value: selected.isGrafted === null ? "Por confirmar" : selected.isGrafted ? "Sí" : "No" },
                    { label: "Camas", value: formatNumber(selected.beds) },
                    { label: "Presupuesto", value: selected.budgetAmount === null ? "Por confirmar" : formatCurrency(selected.budgetAmount) }
                  ].map((item) => <div key={item.label}><dt className="text-xs text-app-muted">{item.label}</dt><dd className="mt-1">{item.value}</dd></div>)}
                  {selected.notes ? <div className="col-span-2"><dt className="text-xs text-app-muted">Notas</dt><dd className="mt-1 whitespace-pre-wrap">{selected.notes}</dd></div> : null}
                </dl>
              </> : <p className="text-sm leading-6 text-app-muted sm:col-span-2">El ajuste quedará en el historial con tu nombre y el motivo.</p>}
              <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2"><input className="h-4 w-4 accent-app-green" type="checkbox" checked={unknownEnd} onChange={(event) => setUnknownEnd(event.target.checked)} />Fecha de cierre por confirmar</label>
              {!unknownEnd ? <Field label="Fecha de cierre" className="sm:col-span-2"><DatePickerInput aria-label="Fecha de cierre" inlineCalendar name="endDate" required max={localDateKey()} min={selected?.startedAt || selected?.transplantDate || undefined} defaultValue={selected?.endedAt || localDateKey()} /></Field> : null}
              {selected?.status === "closed" ? <Field label="Motivo del ajuste" className="sm:col-span-2"><TextArea autoGrow name="reason" required minLength={5} maxLength={1000} placeholder="Explica por qué cambia la fecha de cierre" /></Field> : <label className="flex min-h-11 items-start gap-3 py-2 text-sm sm:col-span-2"><input className="mt-0.5 h-4 w-4 shrink-0 accent-app-green" type="checkbox" required checked={dataConfirmed} onChange={(event) => setDataConfirmed(event.target.checked)} /><span>Confirmo los datos del ciclo y entiendo que ya no podré editarlos.</span></label>}
            </> : <>
              <Field label="Cultivo"><SelectInput name="cropId" required defaultValue={modal === "edit" ? selected?.cropId : greenhouse.cropId ?? crops[0]?.id}>{crops.filter((crop) => crop.isActive || crop.id === selected?.cropId).map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}</SelectInput></Field>
              <Field label="Variedad"><TextInput name="variety" required maxLength={120} defaultValue={modal === "edit" ? selected?.variety : ""} /></Field>
              <Field label="Fecha de trasplante (opcional)"><DatePickerInput aria-label="Fecha de trasplante" inlineCalendar name="startDate" max={localDateKey()} defaultValue={modal === "edit" ? selected?.startedAt || selected?.transplantDate : ""} /></Field>
              <Field label="Número de plantas"><TextInput name="plants" type="number" required min={modal === "edit" ? 0 : 1} step={1} defaultValue={modal === "edit" ? selected?.plants : undefined} /></Field>
              <Field label="Tallos"><SelectInput name="stems" defaultValue={modal === "edit" ? String(selected?.stemCount ?? "") : ""}><option value="">Por confirmar</option><option value="1">Un tallo</option><option value="2">Dos tallos</option></SelectInput></Field>
              <Field label="Injerto"><SelectInput name="grafted" defaultValue={modal === "edit" && selected?.isGrafted != null ? String(selected.isGrafted) : ""}><option value="">Por confirmar</option><option value="true">Sí</option><option value="false">No</option></SelectInput></Field>
              <Field label="Presupuesto del ciclo"><TextInput name="budget" type="number" min={0} step="0.01" defaultValue={modal === "edit" ? selected?.budgetAmount ?? "" : ""} /></Field>
              <Field label="Camas"><TextInput name="beds" type="number" min={0} step={1} defaultValue={modal === "edit" ? selected?.beds : greenhouse.beds} /></Field>
              <Field label="Notas" className="sm:col-span-2"><TextArea name="notes" defaultValue={modal === "edit" ? selected?.notes : ""} /></Field>
              <p className="text-xs leading-5 text-app-muted sm:col-span-2">Sin fecha de trasplante, elige el ciclo al capturar registros.</p>
            </>}
          </fieldset>
          <div className="flex flex-col-reverse gap-2 border-t border-app-border pt-5 sm:flex-row sm:justify-end">
            <Button type="button" disabled={busy} onClick={() => { setModal(null); setError(""); }}>Cancelar</Button>
            <Button variant="primary" type="submit" disabled={busy || (modal === "close" && selected?.status === "active" && !dataConfirmed)} icon={<CalendarDays aria-hidden="true" className="h-4 w-4" />}>{busy ? "Guardando…" : modal === "close" ? selected?.status === "active" ? "Confirmar y finalizar" : "Guardar ajuste" : modal === "edit" ? "Guardar datos" : "Iniciar ciclo"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
