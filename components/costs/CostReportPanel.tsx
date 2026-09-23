"use client";

import ExcelJS from "exceljs";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  Filter,
  Printer,
  RotateCcw,
  Upload,
  X
} from "lucide-react";
import { useId, useMemo, useState, type ChangeEvent } from "react";
import {
  compareCostRecords,
  type CostComparisonItem,
  type CostComparisonSummary,
  type CostRecordStatus
} from "@/lib/cost-report";
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

export type CostReportSector = {
  id: string;
  name: string;
};

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

type ParsedSheetRow = {
  rowNumber: number;
  cells: string[];
};

type ParsedSheet = {
  name: string;
  headers: string[];
  rows: ParsedSheetRow[];
};

type ColumnMapping = {
  date: string;
  concept: string;
  amount: string;
  reference: string;
};

type ReportColumnKey = "date" | "concept" | "category" | "sector" | "origin" | "quantity" | "unit" | "unitPrice" | "amount" | "reference";

type ImportedCost = {
  rowNumber: number;
  date: string;
  concept: string;
  amount: number | null;
  reference: string;
  valid: boolean;
};

const EMPTY_FILTERS: ReportFilters = {
  startDate: "",
  endDate: "",
  category: "",
  sector: "",
  origin: "",
  concept: ""
};

const EMPTY_MAPPING: ColumnMapping = {
  date: "",
  concept: "",
  amount: "",
  reference: ""
};

const DATE_ALIASES = ["fecha", "date", "ocurrio", "ocurrido", "dia"];
const CONCEPT_ALIASES = ["concepto", "descripcion", "detalle", "nota", "notas", "gasto", "concept"];
const AMOUNT_ALIASES = ["importe", "monto", "total", "costo", "amount", "price", "precio"];
const REFERENCE_ALIASES = ["referencia", "folio", "factura", "invoice", "ref", "id"];
const REPORT_COLUMNS: Array<{ key: ReportColumnKey; label: string }> = [
  { key: "date", label: "Fecha" },
  { key: "concept", label: "Concepto" },
  { key: "category", label: "Categoría" },
  { key: "sector", label: "Módulo" },
  { key: "origin", label: "Origen" },
  { key: "quantity", label: "Cantidad" },
  { key: "unit", label: "Unidad" },
  { key: "unitPrice", label: "Precio unitario" },
  { key: "amount", label: "Importe" },
  { key: "reference", label: "Referencia" }
];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function textValue(value: unknown) {
  if (value instanceof Date) {
    return dateKey(value);
  }

  if (value && typeof value === "object") {
    const candidate = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (typeof candidate.text === "string") return candidate.text.trim();
    if (candidate.result !== undefined && candidate.result !== null) return textValue(candidate.result);
    if (Array.isArray(candidate.richText)) return candidate.richText.map((part) => String(part.text ?? "")).join("").trim();
  }

  return String(value ?? "").trim();
}

function dateKey(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function normalizeDate(value: unknown) {
  const text = textValue(value);
  if (!text) return "";

  const isoMatch = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;

  const slashMatch = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  const serial = Number(text.replace(/,/g, ""));
  if (Number.isFinite(serial) && serial > 1 && serial < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : dateKey(parsed);
}

function parseAmount(value: unknown) {
  const text = textValue(value).replace(/[$\s]/g, "");
  if (!text) return null;

  const commaPosition = text.lastIndexOf(",");
  const dotPosition = text.lastIndexOf(".");
  const normalized = text.includes(",") && text.includes(".")
    ? commaPosition > dotPosition
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "")
    : text.includes(",")
      ? text.replace(/,/g, ".")
      : text;
  const amount = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function formatExactCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value ?? 0);
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

function recordReference(record: CostReportRecord) {
  return record.sourceReference?.trim() || record.invoiceReference?.trim() || "";
}

function recordConcept(record: CostReportRecord) {
  return record.notes?.trim() || record.category?.trim() || "Sin concepto";
}

function dateForRecord(record: CostReportRecord) {
  return normalizeDate(record.date);
}

function reportValue(record: CostReportRecord, key: ReportColumnKey) {
  return {
    date: dateForRecord(record),
    concept: recordConcept(record),
    category: record.category,
    sector: sectorLabel(record),
    origin: originLabel(record.origin),
    quantity: record.quantity ?? "",
    unit: record.unit || "",
    unitPrice: record.unitPrice ?? "",
    amount: record.amount,
    reference: recordReference(record)
  }[key];
}

function autoMapHeaders(headers: string[]): ColumnMapping {
  const normalizedHeaders = headers.map(normalizeText);
  const find = (aliases: string[]) => {
    const index = normalizedHeaders.findIndex((header) => aliases.some((alias) => header === alias || (alias.length > 2 && header.includes(alias))));
    return index >= 0 ? String(index) : "";
  };
  return {
    date: find(DATE_ALIASES),
    concept: find(CONCEPT_ALIASES),
    amount: find(AMOUNT_ALIASES),
    reference: find(REFERENCE_ALIASES)
  };
}

function statusLabel(status: CostRecordStatus) {
  return {
    matched: "Coincide",
    amount_mismatch: "Diferencia",
    only_system: "Solo en sistema",
    only_excel: "Solo en Excel",
    ambiguous: "Revisar coincidencia",
    invalid: "Fila incompleta"
  }[status];
}

function statusClass(status: CostRecordStatus) {
  return {
    matched: "bg-app-soft text-app-green",
    amount_mismatch: "bg-app-amber text-[#6B5012]",
    only_system: "bg-app-red text-[#7B2C2C]",
    only_excel: "bg-sky-50 text-sky-800",
    ambiguous: "bg-violet-50 text-violet-800",
    invalid: "bg-app-sidebar text-app-muted"
  }[status];
}

const EMPTY_COMPARISON_SUMMARY: CostComparisonSummary = {
  matched: 0,
  amount_mismatch: 0,
  only_system: 0,
  only_excel: 0,
  ambiguous: 0,
  invalid: 0
};

function comparisonSystem(row: CostComparisonItem) {
  return row.system ?? row.systemRecords?.[0];
}

function comparisonExcel(row: CostComparisonItem) {
  return row.excel ?? row.excelRecords?.[0];
}

function ComparisonTableRow({ row, index }: { row: CostComparisonItem; index: number }) {
  const system = comparisonSystem(row);
  const excel = comparisonExcel(row);
  const systemCount = row.systemRecords?.length ?? (row.system ? 1 : 0);
  const excelCount = row.excelRecords?.length ?? (row.excel ? 1 : 0);
  return (
    <tr key={`${row.status}-${excel?.rowNumber ?? system?.id ?? index}`}>
      <td className="px-3 py-3">
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
        {row.status === "ambiguous" ? <span className="mt-1 block text-[11px] text-app-muted">{systemCount} sistema · {excelCount} Excel</span> : null}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-app-muted">{excel?.date || system?.date ? formatDate(excel?.date || system?.date) : "—"}</td>
      <td className="max-w-[250px] px-3 py-3 text-app-text">{excel?.conceptText || system?.conceptText || "—"}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right text-app-text">{system?.amount !== null && system?.amount !== undefined ? formatExactCurrency(system.amount) : "—"}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right text-app-text">{excel?.amount !== null && excel?.amount !== undefined ? formatExactCurrency(excel.amount) : "—"}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-app-text">{row.amountDifference === null || row.amountDifference === undefined ? "—" : formatExactCurrency(row.amountDifference)}</td>
      <td className="px-3 py-3 text-app-muted">{excel?.rowNumber ? `Fila ${excel.rowNumber}` : "—"}</td>
    </tr>
  );
}

function rowCells(worksheet: ExcelJS.Worksheet) {
  const rows: Array<{ rowNumber: number; cells: string[] }> = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = worksheet.getRow(rowNumber).values as unknown[];
    rows.push({ rowNumber, cells: values.slice(1).map(textValue) });
  }
  return rows;
}

function parseSheet(worksheet: ExcelJS.Worksheet): ParsedSheet {
  const rows = rowCells(worksheet);
  const headerIndex = Math.max(0, rows.findIndex((row) => {
    const normalized = row.cells.map(normalizeText);
    return normalized.some((value) => DATE_ALIASES.includes(value) || CONCEPT_ALIASES.includes(value) || AMOUNT_ALIASES.includes(value));
  }));
  const headerRow = rows[headerIndex] ?? { rowNumber: 1, cells: [] };
  const width = Math.max(headerRow.cells.length, ...rows.map((row) => row.cells.length), 0);
  const headers = Array.from({ length: width }, (_, index) => headerRow.cells[index] || `Columna ${index + 1}`);
  return {
    name: worksheet.name,
    headers,
    rows: rows.slice(headerIndex + 1).map((row) => ({
      rowNumber: row.rowNumber,
      cells: Array.from({ length: width }, (_, index) => row.cells[index] ?? "")
    }))
  };
}

function importedCosts(sheet: ParsedSheet | undefined, mapping: ColumnMapping): ImportedCost[] {
  if (!sheet) return [];
  const cell = (row: ParsedSheetRow, column: string) => column === "" ? "" : row.cells[Number(column)] ?? "";
  return sheet.rows
    .filter((row) => row.cells.some(Boolean))
    .map((row) => {
      const date = normalizeDate(cell(row, mapping.date));
      const concept = textValue(cell(row, mapping.concept));
      const amount = parseAmount(cell(row, mapping.amount));
      const reference = textValue(cell(row, mapping.reference));
      return {
        rowNumber: row.rowNumber,
        date,
        concept,
        amount,
        reference,
        valid: Boolean(date && concept && amount !== null)
      };
    })
    .filter((row) => !/^(subtotal|total|gran total)\b/.test(normalizeText(row.concept)));
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

function makeWorkbookDownload(workbook: ExcelJS.Workbook, fileName: string) {
  return workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

export function CostReportPanel({ greenhouseName, records, sectors }: CostReportPanelProps) {
  const instanceId = useId().replace(/:/g, "");
  const reportTitleId = `cost-report-title-${instanceId}`;
  const reportContentId = `cost-report-content-${instanceId}`;
  const [expanded, setExpanded] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [fileName, setFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [reportColumns, setReportColumns] = useState<ReportColumnKey[]>(REPORT_COLUMNS.map((column) => column.key));

  const categories = useMemo(
    () => Array.from(new Set(records.map((record) => record.category).filter(Boolean))).sort((left, right) => left.localeCompare(right, "es-MX")),
    [records]
  );
  const origins = useMemo(
    () => Array.from(new Set(records.map((record) => record.origin?.trim()).filter((origin): origin is string => Boolean(origin)))).sort((left, right) => left.localeCompare(right, "es-MX")),
    [records]
  );
  const sectorOptions = useMemo(() => {
    const knownNames = sectors.map((sector) => sector.name.trim()).filter(Boolean);
    const recordNames = records.map((record) => record.sectorName?.trim()).filter((name): name is string => Boolean(name));
    return Array.from(new Set([...knownNames, ...recordNames])).sort((left, right) => left.localeCompare(right, "es-MX"));
  }, [records, sectors]);

  const filteredRecords = useMemo(() => {
    const concept = normalizeText(filters.concept);
    return records.filter((record) => {
      const date = dateForRecord(record);
      const matchesDate = (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate);
      const matchesCategory = !filters.category || record.category === filters.category;
      const matchesSector = !filters.sector || sectorLabel(record) === filters.sector;
      const matchesOrigin = !filters.origin || (record.origin?.trim() || "") === filters.origin;
      const matchesConcept = !concept || normalizeText(recordConcept(record)).includes(concept);
      return matchesDate && matchesCategory && matchesSector && matchesOrigin && matchesConcept;
    });
  }, [filters, records]);

  const selectedSheet = sheets.find((sheet) => sheet.name === selectedSheetName);
  const imported = useMemo(() => importedCosts(selectedSheet, mapping), [mapping, selectedSheet]);
  const mappingReady = Boolean(mapping.date && mapping.concept && mapping.amount);

  const comparisonResult = useMemo(() => {
    if (!fileName || !mappingReady) return null;
    const systemRows = filteredRecords.map((record) => ({
      id: record.id,
      date: record.date,
      concept: recordConcept(record),
      category: record.category,
      sector: record.sectorName?.trim() || "",
      amount: record.amount,
      sourceReference: record.sourceReference ?? null,
      invoiceReference: record.invoiceReference ?? null
    }));
    const excelRows = imported.map((row) => ({
      rowNumber: row.rowNumber,
      date: row.date,
      concept: row.concept,
      amount: row.amount,
      sourceReference: row.reference || null
    }));
    return compareCostRecords(systemRows, excelRows);
  }, [fileName, filteredRecords, imported, mappingReady]);
  const comparisonRows = comparisonResult?.items ?? [];

  const total = useMemo(
    () => filteredRecords.reduce((sum, record) => sum + Math.round((Number(record.amount) || 0) * 100), 0) / 100,
    [filteredRecords]
  );
  const categoryGroups = useMemo(() => groupRecords(filteredRecords, (record) => record.category || "Sin categoría"), [filteredRecords]);
  const sectorGroups = useMemo(() => groupRecords(filteredRecords, sectorLabel), [filteredRecords]);
  const comparisonSummary = comparisonResult?.summary ?? EMPTY_COMPARISON_SUMMARY;

  const updateFilter = (key: keyof ReportFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError("");
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const parsedSheets = workbook.worksheets.map(parseSheet);
      const firstSheet = parsedSheets[0];
      setSheets(parsedSheets);
      setSelectedSheetName(firstSheet?.name ?? "");
      setMapping(firstSheet ? autoMapHeaders(firstSheet.headers) : EMPTY_MAPPING);
      setFileName(file.name);
      if (!firstSheet) setImportError("El archivo no contiene hojas.");
    } catch {
      setSheets([]);
      setSelectedSheetName("");
      setMapping(EMPTY_MAPPING);
      setFileName("");
      setImportError("No se pudo leer el archivo. Usa un .xlsx válido.");
    }
  };

  const selectSheet = (name: string) => {
    const nextSheet = sheets.find((sheet) => sheet.name === name);
    setSelectedSheetName(name);
    setMapping(nextSheet ? autoMapHeaders(nextSheet.headers) : EMPTY_MAPPING);
  };

  const resetComparison = () => {
    setSheets([]);
    setSelectedSheetName("");
    setMapping(EMPTY_MAPPING);
    setFileName("");
    setImportError("");
  };

  const exportReport = async (comparisonOnly = false) => {
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Mira";
      workbook.created = new Date();
      const reportSheet = workbook.addWorksheet(comparisonOnly ? "Comparación" : "Reporte de gastos");
      reportSheet.views = [{ state: "frozen", ySplit: 5 }];
      reportSheet.addRow([comparisonOnly ? "Comparación de gastos" : "Reporte de gastos", greenhouseName]);
      reportSheet.addRow(["Generado", new Date().toLocaleString("es-MX")]);
      reportSheet.addRow(["Filtro", filters.concept || "Todos los registros"]);
      if (!comparisonOnly) {
        reportSheet.addRow(["Gastos", filteredRecords.length, "Total", total]);
        reportSheet.addRow([]);
        const selectedColumns = REPORT_COLUMNS.filter((column) => reportColumns.includes(column.key));
        reportSheet.addRow(selectedColumns.map((column) => column.label));
        filteredRecords.forEach((record) => reportSheet.addRow(selectedColumns.map((column) => reportValue(record, column.key))));
        const groupsSheet = workbook.addWorksheet("Resumen");
        groupsSheet.addRow(["Categoría", "Gastos", "Importe"]);
        categoryGroups.forEach((group) => groupsSheet.addRow([group.label, group.count, group.amount]));
        groupsSheet.addRow([]);
        groupsSheet.addRow(["Módulo", "Gastos", "Importe"]);
        sectorGroups.forEach((group) => groupsSheet.addRow([group.label, group.count, group.amount]));
      } else {
        reportSheet.addRow(["Estado", "Fecha", "Concepto", "Importe sistema", "Importe Excel", "Diferencia", "Fila Excel"]);
        comparisonRows.forEach((row) => {
          const system = comparisonSystem(row);
          const excel = comparisonExcel(row);
          reportSheet.addRow([
            statusLabel(row.status), excel?.date || system?.date || "",
            excel?.conceptText || system?.conceptText || "", system?.amount ?? "", excel?.amount ?? "",
            row.amountDifference ?? "", excel?.rowNumber ?? ""
          ]);
        });
      }
      reportSheet.getRow(1).font = { bold: true, size: 14 };
      reportSheet.getRow(comparisonOnly ? 5 : 6).font = { bold: true, color: { argb: "FFFFFFFF" } };
      reportSheet.getRow(comparisonOnly ? 5 : 6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF183D2A" } };
      reportSheet.columns.forEach((column) => { column.width = Math.min(Math.max(column.width ?? 12, 12), 32); });
      const safeName = greenhouseName.toLocaleLowerCase("es-MX").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "invernadero";
      await makeWorkbookDownload(workbook, `${comparisonOnly ? "comparacion" : "reporte-gastos"}-${safeName}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="cost-report-print-root mt-6 rounded-app border border-app-border bg-white" aria-labelledby={reportTitleId}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-app-text" id={reportTitleId}>Reporte de gastos</h2>
          <p className="mt-1 text-sm text-app-muted">{greenhouseName} · Revisa diferencias por módulo y exporta el detalle.</p>
        </div>
        <button
          aria-expanded={expanded}
          aria-controls={reportContentId}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-app-green bg-app-green px-4 text-sm font-medium text-white transition hover:bg-[#244B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/30 focus-visible:ring-offset-2 print:hidden"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
          {expanded ? "Ocultar reporte" : "Generar reporte"}
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-app-border p-4 sm:p-5" id={reportContentId}>
          <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" onClick={() => void exportReport()} type="button" disabled={exporting}>
                <Download aria-hidden="true" className="h-4 w-4" /> Exportar Excel
              </button>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" onClick={() => window.print()} type="button">
                <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir
              </button>
            </div>
            <span className="text-xs text-app-muted" role="status" aria-live="polite">{filteredRecords.length} registros · {formatCurrency(total)}</span>
          </div>

          <div className="mt-5 rounded-xl bg-app-sidebar/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-app-text"><Filter aria-hidden="true" className="h-4 w-4" /> Filtros</h3>
              <button className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-app-muted transition hover:bg-white hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" onClick={() => setFilters(EMPTY_FILTERS)} type="button">
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Limpiar
              </button>
            </div>
            <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Desde<input className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" type="date" value={filters.startDate} onChange={(event) => updateFilter("startDate", event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Hasta<input className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" type="date" value={filters.endDate} onChange={(event) => updateFilter("endDate", event.target.value)} /></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Categoría<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}><option value="">Todas</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Módulo<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={filters.sector} onChange={(event) => updateFilter("sector", event.target.value)}><option value="">Todos</option><option value="General / sin módulo">General / sin módulo</option>{sectorOptions.filter((sector) => sector !== "General / sin módulo").map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Origen<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={filters.origin} onChange={(event) => updateFilter("origin", event.target.value)}><option value="">Todos</option>{origins.map((origin) => <option key={origin} value={origin}>{originLabel(origin)}</option>)}</select></label>
              <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text">Concepto<input className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" type="search" placeholder="Buscar concepto" value={filters.concept} onChange={(event) => updateFilter("concept", event.target.value)} /></label>
            </div>
            <details className="mt-3 rounded-lg border border-app-border bg-white px-3 py-2 print:hidden">
              <summary className="cursor-pointer text-xs font-medium text-app-text">Columnas para exportar</summary>
              <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                <legend className="sr-only">Columnas incluidas en el reporte de Excel</legend>
                {REPORT_COLUMNS.map((column) => (
                  <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-xs text-app-text" key={column.key}>
                    <input
                      checked={reportColumns.includes(column.key)}
                      className="h-4 w-4 accent-app-green"
                      onChange={(event) => setReportColumns((current) => event.target.checked
                        ? [...current, column.key]
                        : current.length > 1 ? current.filter((key) => key !== column.key) : current)}
                      type="checkbox"
                    />
                    {column.label}
                  </label>
                ))}
              </fieldset>
            </details>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-app-border p-4"><p className="text-xs text-app-muted">Total</p><p className="mt-1 text-xl font-semibold text-app-text">{formatCurrency(total)}</p></div>
            <div className="rounded-xl border border-app-border p-4"><p className="text-xs text-app-muted">Registros</p><p className="mt-1 text-xl font-semibold text-app-text">{filteredRecords.length.toLocaleString("es-MX")}</p></div>
            <div className="rounded-xl border border-app-border p-4"><p className="text-xs text-app-muted">Promedio</p><p className="mt-1 text-xl font-semibold text-app-text">{formatCurrency(filteredRecords.length ? total / filteredRecords.length : 0)}</p></div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {[
              { title: "Por categoría", groups: categoryGroups },
              { title: "Por módulo", groups: sectorGroups }
            ].map(({ title, groups }) => (
              <section className="rounded-xl border border-app-border p-4" key={title} aria-labelledby={`group-${title}`}>
                <h3 className="text-sm font-semibold text-app-text" id={`group-${title}`}>{title}</h3>
                <div className="mt-3 divide-y divide-app-border">
                  {groups.length ? groups.map((group) => <div className="flex items-center justify-between gap-3 py-2 text-sm" key={group.label}><span className="min-w-0 truncate text-app-text">{group.label}</span><span className="shrink-0 text-right text-app-muted">{formatCurrency(group.amount)} <span className="text-xs">· {group.count}</span></span></div>) : <p className="py-2 text-sm text-app-muted">Sin registros.</p>}
                </div>
              </section>
            ))}
          </div>

          <section className="mt-5" aria-labelledby="cost-report-detail-title">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-app-text" id="cost-report-detail-title">Detalle</h3><span className="text-xs text-app-muted">{filteredRecords.length} registros</span></div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-app-border">
              <table className="min-w-[760px] w-full border-collapse text-left text-sm"><caption className="sr-only">Detalle de gastos de {greenhouseName}</caption><thead className="bg-app-sidebar text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted"><tr><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Concepto</th><th className="px-3 py-3">Categoría</th><th className="px-3 py-3">Módulo</th><th className="px-3 py-3">Origen</th><th className="px-3 py-3 text-right">Importe</th></tr></thead><tbody className="divide-y divide-app-border">{filteredRecords.length ? filteredRecords.map((record) => <tr className="align-top" key={record.id}><td className="whitespace-nowrap px-3 py-3 text-app-muted">{formatDate(record.date)}</td><td className="max-w-[240px] px-3 py-3 text-app-text">{recordConcept(record)}</td><td className="px-3 py-3 text-app-text">{record.category || "Sin categoría"}</td><td className="px-3 py-3 text-app-text">{sectorLabel(record)}</td><td className="px-3 py-3 text-app-muted">{originLabel(record.origin)}</td><td className="whitespace-nowrap px-3 py-3 text-right font-medium text-app-text">{formatCurrency(record.amount)}</td></tr>) : <tr><td className="px-3 py-8 text-center text-app-muted" colSpan={6}>No hay gastos con estos filtros.</td></tr>}</tbody></table>
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-dashed border-app-border p-4 print:hidden" aria-labelledby="cost-comparison-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="flex items-center gap-2 text-sm font-semibold text-app-text" id="cost-comparison-title"><Upload aria-hidden="true" className="h-4 w-4" /> Comparar con Excel</h3><p className="mt-1 text-xs leading-5 text-app-muted">Carga un archivo para encontrar diferencias sin modificar tus gastos.</p></div><label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar focus-within:ring-2 focus-within:ring-app-green/25"><Upload aria-hidden="true" className="h-4 w-4" /> Cargar .xlsx<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void handleFileChange(event)} type="file" /></label></div>
            {importError ? <p className="mt-3 rounded-lg bg-app-red px-3 py-2 text-sm text-[#7B2C2C]" role="alert">{importError}</p> : null}
            {fileName ? <div className="mt-4 rounded-lg bg-app-sidebar/60 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium text-app-text">{fileName}</p><button aria-label="Quitar archivo de comparación" className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-app-muted hover:bg-white hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" onClick={resetComparison} type="button"><X aria-hidden="true" className="h-4 w-4" /></button></div>{sheets.length > 1 ? <label className="mt-3 grid max-w-sm gap-1.5 text-xs font-medium text-app-text">Hoja<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={selectedSheetName} onChange={(event) => selectSheet(event.target.value)}>{sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}</select></label> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["date", "concept", "amount", "reference"] as const).map((field) => <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-text" key={field}>{field === "date" ? "Fecha" : field === "concept" ? "Concepto" : field === "amount" ? "Importe" : "Referencia (opcional)"}<select className="min-h-10 min-w-0 w-full rounded-lg border border-app-border bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" value={mapping[field]} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}><option value="">Seleccionar columna</option>{selectedSheet?.headers.map((header, index) => <option key={`${header}-${index}`} value={String(index)}>{header}</option>)}</select></label>)}</div><p className="mt-3 text-xs text-app-muted" role="status" aria-live="polite">{mappingReady ? `${imported.length} filas leídas.` : "Selecciona fecha, concepto e importe para comparar."}</p>{mappingReady ? <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-app-soft px-2.5 py-1 text-app-green">{comparisonSummary.matched} coinciden</span><span className="rounded-full bg-app-amber px-2.5 py-1 text-[#6B5012]">{comparisonSummary.amount_mismatch} diferencias</span><span className="rounded-full bg-app-red px-2.5 py-1 text-[#7B2C2C]">{comparisonSummary.only_system + comparisonSummary.only_excel} exclusivos</span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-800">{comparisonSummary.ambiguous + comparisonSummary.invalid} por revisar</span></div> : null}</div> : null}
            {mappingReady && comparisonRows.length ? <><div className="mt-4 flex items-center justify-between gap-3"><h4 className="text-sm font-semibold text-app-text">Resultado de comparación</h4><button className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-app-border bg-white px-3 text-xs font-medium text-app-text transition hover:bg-app-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-green/25" disabled={exporting} onClick={() => void exportReport(true)} type="button"><Download aria-hidden="true" className="h-3.5 w-3.5" /> Exportar comparación</button></div><div className="mt-3 overflow-x-auto rounded-xl border border-app-border"><table className="min-w-[800px] w-full border-collapse text-left text-sm"><caption className="sr-only">Comparación de gastos con {fileName}</caption><thead className="bg-app-sidebar text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted"><tr><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Concepto</th><th className="px-3 py-3 text-right">Sistema</th><th className="px-3 py-3 text-right">Excel</th><th className="px-3 py-3 text-right">Diferencia</th><th className="px-3 py-3">Fila</th></tr></thead><tbody className="divide-y divide-app-border">{comparisonRows.map((row, index) => <ComparisonTableRow index={index} key={`${row.status}-${comparisonExcel(row)?.rowNumber ?? comparisonSystem(row)?.id ?? index}`} row={row} />)}</tbody></table></div></> : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
