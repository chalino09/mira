"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, MoreVertical, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { cropLabelForId } from "@/lib/crop-ddt";
import { mapCropCycle, summarizeGreenhouseCycles, type CropCycle } from "@/lib/crop-cycles";
import { appErrorMessage } from "@/lib/errors";
import { appRoute, greenhouseCyclesRoute, greenhouseRoute, publicEntityId } from "@/lib/routes";
import { useGreenhouseStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import type { Greenhouse } from "@/types";

const focusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green";
const rowColumns = "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_7rem_15rem]";
type CycleFilter = "all" | "active" | "inactive";

function AreaActionsMenu({ greenhouse, canManage, operationHref, onDetails, onEdit }: {
  greenhouse: Greenhouse;
  canManage: boolean;
  operationHref: string;
  onDetails: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const items = [
    { label: "Datos del área", onClick: onDetails },
    ...(canManage ? [{ label: "Editar área", onClick: onEdit }] : []),
    { label: "Abrir operación", href: operationHref }
  ];

  useEffect(() => {
    if (!open) return;
    const outsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outsideClick);
    return () => document.removeEventListener("pointerdown", outsideClick);
  }, [open]);
  useEffect(() => {
    if (open) menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']")[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  function close() {
    triggerRef.current?.focus();
    setOpen(false);
  }
  return <div className="relative shrink-0" ref={rootRef}>
    <button
      aria-label={`Acciones de ${greenhouse.name}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      className={cn("inline-flex min-h-11 w-11 items-center justify-center rounded-xl border border-app-border bg-white text-app-text transition-colors hover:bg-app-sidebar", focusClass)}
      onClick={() => { setFocusedIndex(0); setOpen((value) => !value); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setFocusedIndex(event.key === "ArrowDown" ? 0 : items.length - 1);
          setOpen(true);
        }
      }}
      ref={triggerRef}
      type="button"
    ><MoreVertical aria-hidden="true" className="h-4 w-4" /></button>
    {open ? <div
      aria-label={`Acciones de ${greenhouse.name}`}
      className="absolute right-0 top-[calc(100%+8px)] z-30 w-52 rounded-xl border border-app-border bg-white p-1.5 shadow-xl"
      id={menuId}
      ref={menuRef}
      role="menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setFocusedIndex((value) => (value + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length); }
        else if (event.key === "Home" || event.key === "End") { event.preventDefault(); setFocusedIndex(event.key === "Home" ? 0 : items.length - 1); }
        else if (event.key === "Tab") setOpen(false);
      }}
    >{items.map((item, index) => {
      const className = "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-app-text outline-none hover:bg-app-sidebar focus-visible:bg-app-soft";
      return "href" in item ? <Link className={className} href={item.href!} key={item.label} onClick={close} role="menuitem" tabIndex={focusedIndex === index ? 0 : -1}>{item.label}</Link>
        : <button className={className} key={item.label} onClick={() => { close(); item.onClick(); }} role="menuitem" tabIndex={focusedIndex === index ? 0 : -1} type="button">{item.label}</button>;
    })}</div> : null}
  </div>;
}

export function GreenhousesSection() {
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const crops = useGreenhouseStore((state) => state.crops);
  const openModal = useGreenhouseStore((state) => state.openModal);
  const setSelectedGreenhouseId = useGreenhouseStore((state) => state.setSelectedGreenhouseId);
  const [filter, setFilter] = useState<CycleFilter>("all");
  const [search, setSearch] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; cycles: CropCycle[]; error: string } | null>(null);
  const searchId = useId();
  const key = `${organization.id}:${currentUser.id}:${greenhouses.map((greenhouse) => greenhouse.id).join(",")}:${retry}`;
  const ready = snapshot?.key === key;
  const cycles = ready ? snapshot.cycles : [];
  const canManage = currentUser.role === "owner" || currentUser.role === "admin";
  const organizationName = organization.slug ?? organization.name;
  const surface = greenhouses.reduce((total, greenhouse) => total + (greenhouse.surfaceM2 ?? 0), 0);
  const areas = greenhouses.map((greenhouse) => ({ greenhouse, ...summarizeGreenhouseCycles(cycles, greenhouse.id) }));
  const activeCount = areas.filter((area) => area.active).length;
  const query = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const visibleAreas = areas.filter((area) => {
    const text = `${area.greenhouse.name} ${area.latest?.variety ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    return (!query || text.includes(query)) && (filter === "all" || (filter === "active" ? Boolean(area.active) : !area.active));
  });
  const details = greenhouses.find((greenhouse) => greenhouse.id === detailsId);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) throw new Error("No se pudo conectar con la base de datos.");
        const allCycles: CropCycle[] = [];
        for (let offset = 0; ; offset += 1000) {
          const response = await supabase.from("crop_cycles")
            .select("id, greenhouse_id, crop_id, variety, status, started_at, transplant_date, ended_at, created_at")
            .eq("company_id", organization.id)
            .order("created_at", { ascending: false }).order("id", { ascending: false })
            .range(offset, offset + 999);
          if (response.error) throw response.error;
          if (!current) return;
          allCycles.push(...(response.data ?? []).map(mapCropCycle));
          if ((response.data?.length ?? 0) < 1000) break;
        }
        if (current) setSnapshot({ key, cycles: allCycles, error: "" });
      } catch (caught) {
        if (current) setSnapshot({ key, cycles: [], error: appErrorMessage(caught, "No se pudieron cargar los ciclos. Reintenta en unos momentos.") });
      }
    }
    void load();
    return () => { current = false; };
  }, [organization.id, key]);

  function editArea(greenhouseId: string) {
    setDetailsId(null);
    setSelectedGreenhouseId(greenhouseId);
    openModal("editGreenhouse");
  }

  return <section>
    <div className="flex flex-wrap items-end justify-between gap-5 pb-7 pt-4 md:pt-6">
      <div>
        <MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" />
        <PageTitle className="sm:text-4xl md:text-4xl">Áreas productivas</PageTitle>
        <p className="mt-3 text-sm text-app-muted">{formatNumber(greenhouses.length)} {greenhouses.length === 1 ? "área" : "áreas"}{surface ? ` · ${formatNumber(surface)} m²` : ""}</p>
      </div>
      {canManage ? <Button icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={() => openModal("greenhouse")}>Nueva área</Button> : null}
    </div>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-app-border">
      <nav aria-label="Filtrar áreas por ciclo" className="flex max-w-full flex-wrap gap-x-5">
        {([
          { value: "all", label: "Todas", count: greenhouses.length },
          { value: "active", label: "Con ciclo activo", count: activeCount },
          { value: "inactive", label: "Sin ciclo activo", count: greenhouses.length - activeCount }
        ] as const).map((item) => <button
          aria-pressed={filter === item.value}
          className={cn("inline-flex min-h-11 items-center gap-2 border-b-2 pb-3 text-xs sm:text-sm", focusClass, filter === item.value ? "border-app-green font-medium text-app-green" : "border-transparent text-app-muted hover:text-app-text")}
          disabled={!ready || Boolean(snapshot?.error)}
          key={item.value}
          onClick={() => setFilter(item.value)}
          type="button"
        >{item.label}<span className="tabular-nums text-app-muted">{ready && !snapshot?.error ? item.count : "…"}</span></button>)}
      </nav>
      <div className="relative mb-3 w-full sm:w-64">
        <label className="sr-only" htmlFor={searchId}>Buscar área</label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-app-muted" />
        <input className={cn("min-h-11 w-full rounded-xl border border-app-border bg-white pl-10 pr-3 text-base outline-none placeholder:text-app-muted sm:text-sm", focusClass)} id={searchId} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar área" type="search" value={search} />
      </div>
    </div>
    {!ready ? <div role="status" className="py-8 text-sm text-app-muted">Cargando áreas y ciclos…</div> : snapshot.error ? <div role="alert" className="py-5"><p className="text-sm text-app-muted">{snapshot.error}</p><Button className="mt-3" onClick={() => setRetry((value) => value + 1)}>Reintentar</Button></div> : <>
      <div aria-hidden="true" className={cn("hidden gap-5 border-y border-app-border px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted xl:grid", rowColumns)}>
        <span>Área</span><span>Ciclo</span><span>Estado</span><span>Inicio</span><span />
      </div>
      <div aria-label="Áreas productivas" className="border-t border-app-border xl:border-t-0">
        {visibleAreas.map(({ greenhouse, active, latest, number }) => {
          const cyclesHref = greenhouseCyclesRoute(organizationName, greenhouse.publicId ?? publicEntityId("gh", greenhouse.id));
          const startedAt = active?.startedAt || active?.transplantDate;
          return <article className={cn("grid gap-x-5 gap-y-3 border-b border-app-border px-1 py-6 sm:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:px-4", rowColumns)} key={greenhouse.id}>
            <h2 className="text-xl font-light text-app-text sm:col-start-1 sm:row-start-1 xl:row-start-1">{greenhouse.name}</h2>
            <div className="min-w-0 sm:col-start-1 sm:row-start-2 xl:col-start-2 xl:row-start-1">
              <p className="text-sm font-medium text-app-text">{latest ? `${active ? "Ciclo" : "Último: ciclo"} ${number} · ${latest.variety || "Sin variedad"}` : "Sin ciclos registrados"}</p>
              <p className="mt-1 text-xs text-app-muted">{active ? cropLabelForId(active.cropId, crops) : latest ? `${latest.status === "cancelled" ? "Cancelado" : "Finalizado"} · ${latest.endedAt ? formatDate(latest.endedAt) : "fecha por confirmar"}` : "Inicia el primer ciclo de producción"}</p>
            </div>
            <div className="sm:col-start-1 sm:row-start-3 xl:col-start-3 xl:row-start-1"><StatusBadge tone={active ? "green" : "neutral"}>{active ? "Activo" : "Sin ciclo activo"}</StatusBadge></div>
            <p className={cn("text-xs text-app-muted sm:col-start-1 sm:row-start-4 xl:col-start-4 xl:row-start-1 xl:text-sm xl:text-app-text", !active && "hidden xl:block")}><span className="xl:hidden">Inicio: </span>{active ? startedAt ? formatDate(startedAt) : "Por confirmar" : "—"}</p>
            <div className="flex items-start gap-2 pt-2 sm:col-start-2 sm:row-span-4 sm:row-start-1 sm:items-center sm:justify-end sm:pt-0 xl:col-start-5 xl:row-span-1">
              <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
                <Link
                  aria-label={active || !canManage ? `Ver ciclos de ${greenhouse.name}` : `Nuevo ciclo de ${greenhouse.name}`}
                  className={cn("inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-app-green bg-app-green px-3 text-sm font-medium text-white transition-colors hover:bg-[#244B37]", focusClass)}
                  href={!active && canManage ? `${cyclesHref}?action=new` : cyclesHref}
                >{active || !canManage ? <CalendarDays aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}{active || !canManage ? "Ver ciclos" : "Nuevo ciclo"}</Link>
                {!active && canManage && latest ? <Link aria-label={`Ver historial de ${greenhouse.name}`} className={cn("mt-1 inline-flex min-h-11 w-full items-center justify-center text-xs text-app-green underline-offset-4 hover:underline", focusClass)} href={cyclesHref}>Ver historial</Link> : null}
              </div>
              <AreaActionsMenu canManage={canManage} greenhouse={greenhouse} onDetails={() => setDetailsId(greenhouse.id)} onEdit={() => editArea(greenhouse.id)} operationHref={appRoute(organizationName, { section: "calendar", greenhouseId: greenhouse.id })} />
            </div>
          </article>;
        })}
        {!visibleAreas.length ? <div className="py-12 text-center"><p className="text-sm text-app-muted">{greenhouses.length ? "No hay áreas con estos filtros." : "Registra tu primera área productiva."}</p>{greenhouses.length ? <Button className="mt-4" onClick={() => { setSearch(""); setFilter("all"); }} variant="ghost">Limpiar filtros</Button> : null}</div> : null}
      </div>
    </>}
    <Modal onClose={() => setDetailsId(null)} open={Boolean(details)} panelClassName="sm:max-w-xl" title={`Datos de ${details?.name ?? "área"}`}>
      {details ? <>
        <dl className="grid gap-6 text-sm sm:grid-cols-2">
          {[
            { label: "Ubicación", value: details.location || "Por confirmar" },
            { label: "Superficie", value: details.surfaceM2 ? `${formatNumber(details.surfaceM2)} m²` : details.surface || "Por confirmar" },
            { label: "Responsable", value: details.manager || "Por asignar" },
            ...(details.latitude != null && details.longitude != null ? [{ label: "Coordenadas", value: `${details.latitude}, ${details.longitude}` }] : [])
          ].map((item) => <div key={item.label}><dt className="text-xs text-app-muted">{item.label}</dt><dd className="mt-2 break-words text-app-text">{item.value}</dd></div>)}
        </dl>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-5">
          <Link className={cn("inline-flex min-h-11 items-center text-xs text-app-green underline-offset-4 hover:underline", focusClass)} href={greenhouseRoute(organizationName, details.publicId ?? publicEntityId("gh", details.id))}>Ver ficha del área</Link>
          {canManage ? <Button onClick={() => editArea(details.id)}>Editar área</Button> : null}
        </div>
      </> : null}
    </Modal>
  </section>;
}
