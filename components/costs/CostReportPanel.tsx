"use client";

import { ChevronDown, FileText, Filter, Printer, RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";

export type CostReportRecord = {
  id: string;
  date: string;
  category: string;
  amount: number;
  notes: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  sectorName?: string | null;
  origin?: string | null;
  sourceReference?: string | null;
  invoiceReference?: string | null;
};

export type CostReportSector = { id: string; name: string };

export type CostReportPanelProps = {
  greenhouseName: string;
  records: CostReportRecord[];
  sectors: CostReportSector[];
};

type ReportFilters = {
  startDate: string;
  endDate: string;
  category: string;
  sector: string;
  origin: string;
  concept: string;
};

const EMPTY_FILTERS: ReportFilters = {
  startDate: "",
  endDate: "",
  category: "",
  sector: "",
  origin: "",
  concept: ""
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sectorLabel(record: CostReportRecord) {
  return record.sectorName?.trim() || "General / sin módulo";
}

function originLabel(origin?: string | null) {
  return {
    manual: "Manual",
    inventory: "Inventario",
    resource: "Recurso",
    reversal: "Reversión"
  }[origin ?? ""] ?? origin?.trim() ?? "Sin origen";
}

function recordConcept(record: CostReportRecord) {
  return record.notes?.trim() || record.category?.trim() || "Sin concepto";
}

function groupRecords(records: CostReportRecord[], getLabel: (record: CostReportRecord) => string) {
  const groups = new Map<string, { label: string; amount: number; count: number }>();
  records.forEach((record) => {
    const label = getLabel(record);
    const current = groups.get(label) ?? { label, amount: 0, count: 0 };
    current.amount = Math.round((current.amount + (Number(record.amount) || 0)) * 100) / 100;
    current.count += 1;
    groups.set(label, current);
  });
  return Array.from(groups.values()).sort((left, right) => right.amount - left.amount);
}

export function CostReportPanel({ greenhouseName, records, sectors }: CostReportPanelProps) {
  const instanceId = useId().replace(/:/g, "");
  const reportTitleId = `cost-report-title-${instanceId}`;
  const reportContentId = `cost-report-content-${instanceId}`;
  const [expanded, setExpanded] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);

  const categories = useMemo(
    () => Array.from(new Set(records.map((record) => record.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es-MX")),
    [records]
  );
  const origins = useMemo(
    () => Array.from(new Set(records.map((record) => record.origin?.trim()).filter((origin): origin is string => Boolean(origin)))).sort((a, b) => a.localeCompare(b, "es-MX")),
    [records]
  );
  const sectorOptions = useMemo(() => {
    const knownNames = sectors.map((sector) => sector.name.trim()).filter(Boolean);
    const recordNames = records.map((record) => record.sectorName?.trim()).filter((name): name is string => Boolean(name));
    return Array.from(new Set([...knownNames, ...recordNames])).sort((a, b) => a.localeCompare(b, "es-MX"));
  }, [records, sectors]);

  const filteredRecords = useMemo(() => {
    const concept = normalizeText(filters.concept);
    return records.filter((record) => {
      const date = record.date.slice(0, 10);
      return (!filters.startDate || date >= filters.startDate)
        && (!filters.endDate || date <= filters.endDate)
        && (!filters.category || record.category === filters.category)
        && (!filters.sector || sectorLabel(record) === filters.sector)
        && (!filters.origin || (record.origin?.trim() || "") === filters.origin)
        && (!concept || normalizeText(recordConcept(record)).includes(concept));
    });
  }, [filters, records]);

  const total = useMemo(
    () => filteredRecords.reduce((sum, record) => sum + Math.round((Number(record.amount) || 0) * 100), 0) / 100,
    [filteredRecords]
  );
  const categoryGroups = useMemo(() => groupRecords(filteredRecords, (record) => record.category || "Sin categoría"), [filteredRecords]);
  const sectorGroups = useMemo(() => groupRecords(filteredRecords, sectorLabel), [filteredRecords]);
  const updateFilter = (key: keyof ReportFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <section className="cost-report-print-root mt-6 rounded-app border border-app-border bg-white" aria-labelledby={reportTitleId}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-app-text" id={reportTitleId}>Reporte de gastos</h2>
          <p className="mt-1 text-sm text-app-muted">{greenhouseName} · Consulta los gastos por módulo y su detalle.</p>
        </div>
        <button aria-controls={reportContentId} aria-expanded={expanded} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-app-green bg-app-green px-4 text-sm font-medium text-white transition-colors hover:bg-[#244B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/30 focus-visible:ring-offset-2 print:hidden" onClick={() => setExpanded((current) => !current)} type="button">
          <FileText aria-hidden="true" className="h-4 w-4" />
          {expanded ? "Ocultar reporte" : "Generar reporte"}
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-app-border p-4 sm:p-5" id={reportContentId}>
          <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
            <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-app-border bg-white px-3 text-sm font-medium text-app-text transition-colors hover:bg-app-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" onClick={() => window.print()} type="button">
              <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir reporte
            </button>
            <span className="text-xs text-app-muted" role="status" aria-live="polite">{filteredRecords.length} registros · {formatCurrency(total)}</span>
          </div>

          <div className="mt-5 rounded-xl bg-app-sidebar/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-app-text"><Filter aria-hidden="true" className="h-4 w-4" /> Filtros</h3>
              <button className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-app-muted transition-colors hover:bg-white hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" onClick={() => setFilters(EMPTY_FILTERS)} type="button"><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Limpiar</button>
            </div>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Desde<input className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Hasta<input className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Categoría<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}><option value="">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Módulo<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={filters.sector} onChange={(event) => updateFilter("sector", event.target.value)}><option value="">Todos</option><option value="General / sin módulo">General / sin módulo</option>{sectorOptions.filter((sector) => sector !== "General / sin módulo").map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Origen<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={filters.origin} onChange={(event) => updateFilter("origin", event.target.value)}><option value="">Todos</option>{origins.map((origin) => <option key={origin} value={origin}>{originLabel(origin)}</option>)}</select></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Concepto<input className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" type="search" placeholder="Buscar concepto" value={filters.concept} onChange={(event) => updateFilter("concept", event.target.value)} /></label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-app-border p-4"><p className="text-xs text-app-muted">Total</p><p className="mt-1 text-xl font-semibold text-app-text">{formatCurrency(total)}</p></div>
            <div className="rounded-xl border border-app-border p-4"><p className="text-xs text-app-muted">Registros</p><p className="mt-1 text-xl font-semibold text-app-text">{filteredRecords.length.toLocaleString("es-MX")}</p></div>
            <div className="rounded-xl border border-app-border p-4"><p className="text-xs text-app-muted">Promedio</p><p className="mt-1 text-xl font-semibold text-app-text">{formatCurrency(filteredRecords.length ? total / filteredRecords.length : 0)}</p></div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {[{ title: "Por categoría", groups: categoryGroups }, { title: "Por módulo", groups: sectorGroups }].map(({ title, groups }) => (
              <section className="rounded-xl border border-app-border p-4" key={title} aria-labelledby={`group-${title}`}>
                <h3 className="text-sm font-semibold text-app-text" id={`group-${title}`}>{title}</h3>
                <div className="mt-3 divide-y divide-app-border">{groups.length ? groups.map((group) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={group.label}><span className="min-w-0 truncate text-app-text">{group.label}</span><span className="shrink-0 text-right text-app-muted">{formatCurrency(group.amount)} <span className="text-xs">· {group.count}</span></span></div>) : <p className="py-2 text-sm text-app-muted">Sin registros.</p>}</div>
              </section>
            ))}
          </div>

          <section className="mt-5" aria-labelledby="cost-report-detail-title">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-app-text" id="cost-report-detail-title">Detalle</h3><span className="text-xs text-app-muted">{filteredRecords.length} registros</span></div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-app-border">
              <table className="min-w-[760px] w-full border-collapse text-left text-sm"><caption className="sr-only">Detalle de gastos de {greenhouseName}</caption><thead className="bg-app-sidebar text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted"><tr><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Concepto</th><th className="px-3 py-3">Categoría</th><th className="px-3 py-3">Módulo</th><th className="px-3 py-3">Origen</th><th className="px-3 py-3 text-right">Importe</th></tr></thead><tbody className="divide-y divide-app-border">{filteredRecords.length ? filteredRecords.map((record) => <tr className="align-top" key={record.id}><td className="whitespace-nowrap px-3 py-3 text-app-muted">{formatDate(record.date)}</td><td className="max-w-[240px] px-3 py-3 text-app-text">{recordConcept(record)}</td><td className="px-3 py-3 text-app-text">{record.category || "Sin categoría"}</td><td className="px-3 py-3 text-app-text">{sectorLabel(record)}</td><td className="px-3 py-3 text-app-muted">{originLabel(record.origin)}</td><td className="whitespace-nowrap px-3 py-3 text-right font-medium text-app-text">{formatCurrency(record.amount)}</td></tr>) : <tr><td className="px-3 py-8 text-center text-app-muted" colSpan={6}>No hay gastos con estos filtros.</td></tr>}</tbody></table>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
