/**
 * Pure helpers used by the cost report and Excel comparison flows.
 *
 * The module deliberately has no dependency on the database or on ExcelJS. A
 * caller can map a database row or an Excel row to CostReportRecord and use
 * the same normalization and comparison rules for both sources.
 */

export type CostReportSide = "system" | "excel";

export type CostReportRecord = {
  id?: string | number | null;
  rowNumber?: number | null;
  row_number?: number | null;
  excelRow?: number | null;
  date?: unknown;
  occurredAt?: unknown;
  occurred_at?: unknown;
  fecha?: unknown;
  amount?: unknown;
  importe?: unknown;
  monto?: unknown;
  total?: unknown;
  cost?: unknown;
  concept?: unknown;
  concepto?: unknown;
  description?: unknown;
  descripcion?: unknown;
  name?: unknown;
  notes?: unknown;
  category?: unknown;
  costCategory?: unknown;
  categoria?: unknown;
  sector?: unknown;
  module?: unknown;
  modulo?: unknown;
  moduleName?: unknown;
  sourceReference?: unknown;
  source_reference?: unknown;
  invoiceReference?: unknown;
  invoice_reference?: unknown;
  [key: string]: unknown;
};

export type CostRecordStatus =
  | "matched"
  | "amount_mismatch"
  | "only_system"
  | "only_excel"
  | "ambiguous"
  | "invalid";

export type NormalizedCostRecord = {
  side: CostReportSide;
  original: unknown;
  id: string | number | null;
  rowNumber: number | null;
  date: string | null;
  concept: string;
  conceptText: string;
  category: string;
  sector: string;
  sourceReference: string | null;
  invoiceReference: string | null;
  references: string[];
  amount: number | null;
  amountCents: number | null;
  isValid: boolean;
  invalidReasons: string[];
};

export type CostComparisonItem = {
  status: CostRecordStatus;
  system?: NormalizedCostRecord;
  excel?: NormalizedCostRecord;
  systemRecords?: NormalizedCostRecord[];
  excelRecords?: NormalizedCostRecord[];
  candidates?: NormalizedCostRecord[];
  amountDifferenceCents?: number | null;
  amountDifference?: number | null;
};

export type CostComparisonSummary = Record<CostRecordStatus, number>;

export type CostComparisonResult = {
  system: NormalizedCostRecord[];
  excel: NormalizedCostRecord[];
  items: CostComparisonItem[];
  rows: CostComparisonItem[];
  summary: CostComparisonSummary;
  counts: CostComparisonSummary;
  totals: {
    systemCents: number;
    excelCents: number;
    differenceCents: number;
    system: number;
    excel: number;
    difference: number;
  };
  matched: CostComparisonItem[];
  amountMismatch: CostComparisonItem[];
  onlySystem: CostComparisonItem[];
  onlyExcel: CostComparisonItem[];
  ambiguous: CostComparisonItem[];
  invalid: CostComparisonItem[];
};

export type CostAggregateBucket = {
  key: string;
  label: string;
  count: number;
  amountCents: number;
  amount: number;
};

export type CostReportAggregation = {
  count: number;
  invalidCount: number;
  totalCents: number;
  total: number;
  byCategory: CostAggregateBucket[];
  bySector: CostAggregateBucket[];
};

export type CostReportExportRow = {
  id: string | number | null;
  rowNumber: number | null;
  date: string | null;
  concept: string;
  category: string;
  sector: string;
  amount: number | null;
  amountCents: number | null;
  sourceReference: string | null;
  invoiceReference: string | null;
};

const EMPTY_SECTOR = "General / sin módulo";

function firstPresent(record: CostReportRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function asText(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function asExactReference(value: unknown) {
  const text = asText(value);
  return text || null;
}

function safeRoundCents(value: number) {
  return Math.round((value + (value >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100);
}

function centsToAmount(cents: number | null) {
  return cents === null ? null : cents / 100;
}

function dateFromParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateFromDateObject(value: Date) {
  if (!Number.isFinite(value.getTime())) return null;
  return dateFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

function dateFromExcelSerial(value: number) {
  // Excel's 1900 date system includes the fictitious 1900-02-29. Using
  // 1899-12-30 gives the expected date for all ordinary spreadsheet dates.
  if (!Number.isFinite(value) || value < 1 || value > 2958465) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
  return dateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Normalizes an ISO, Mexican, Date, or Excel serial date to YYYY-MM-DD. */
export function normalizeCostDate(value: unknown): string | null {
  if (value instanceof Date) return dateFromDateObject(value);

  if (typeof value === "number") {
    return dateFromExcelSerial(value);
  }

  const text = asText(value);
  if (!text) return null;

  const isoLike = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
  if (isoLike) {
    return dateFromParts(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]));
  }

  const localLike = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:$|[T\s])/);
  if (localLike) {
    return dateFromParts(Number(localLike[3]), Number(localLike[2]), Number(localLike[1]));
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return dateFromDateObject(parsed);
}

/** Normalizes concepts for matching while retaining the original text too. */
export function normalizeCostConcept(value: unknown) {
  return asText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Parses common MXN/Excel number formats and returns an exact cent amount. */
export function normalizeCostAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? centsToAmount(safeRoundCents(value)) : null;
  }

  if (value === null || value === undefined) return null;
  let text = String(value).trim();
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/-\s*$/.test(text)) negative = true;
  text = text.replace(/[−-]/g, "").replace(/[^\d.,]/g, "");
  if (!/[\d]/.test(text)) return null;

  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let integerPart = text;
  let decimalPart = "";

  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const separatorIndex = text.lastIndexOf(decimalSeparator);
    integerPart = text.slice(0, separatorIndex).replace(/[.,]/g, "");
    decimalPart = text.slice(separatorIndex + 1).replace(/[.,]/g, "");
  } else if (comma >= 0) {
    const digitsAfter = text.length - comma - 1;
    if (digitsAfter > 0 && digitsAfter <= 2) {
      integerPart = text.slice(0, comma).replace(/\./g, "");
      decimalPart = text.slice(comma + 1);
    } else {
      integerPart = text.replace(/,/g, "");
    }
  } else if (dot >= 0) {
    integerPart = text.slice(0, dot).replace(/,/g, "");
    decimalPart = text.slice(dot + 1).replace(/\./g, "");
  }

  integerPart = integerPart.replace(/\D/g, "") || "0";
  decimalPart = decimalPart.replace(/\D/g, "");
  const numeric = Number(`${negative ? "-" : ""}${integerPart}.${decimalPart || "0"}`);
  if (!Number.isFinite(numeric)) return null;
  return centsToAmount(safeRoundCents(numeric));
}

/** Returns a stable integer amount suitable for exact cent comparisons. */
export function costAmountToCents(value: unknown) {
  const amount = normalizeCostAmount(value);
  return amount === null ? null : safeRoundCents(amount);
}

function rowNumberOf(record: CostReportRecord, fallback: number | null) {
  const value = firstPresent(record, ["rowNumber", "row_number", "excelRow"]);
  if (value === null) return fallback;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : fallback;
}

/** Converts one system or Excel row into the common comparison shape. */
export function normalizeCostRecord(
  input: CostReportRecord,
  options: { side?: CostReportSide; rowNumber?: number | null } = {}
): NormalizedCostRecord {
  const side = options.side ?? "system";
  const record = input ?? {};
  const rawDate = firstPresent(record, ["date", "occurredAt", "occurred_at", "fecha"]);
  const rawAmount = firstPresent(record, ["amount", "importe", "monto", "total", "cost"]);
  const rawConcept = firstPresent(record, [
    "concept",
    "concepto",
    "description",
    "descripcion",
    "name",
    "notes"
  ]);
  const rawCategory = firstPresent(record, ["category", "costCategory", "categoria"]);
  const rawSector = firstPresent(record, ["sector", "module", "modulo", "moduleName"]);
  const sourceReference = asExactReference(firstPresent(record, ["sourceReference", "source_reference"]));
  const invoiceReference = asExactReference(firstPresent(record, ["invoiceReference", "invoice_reference"]));
  const references = Array.from(new Set([sourceReference, invoiceReference].filter((value): value is string => Boolean(value))));
  const date = normalizeCostDate(rawDate);
  const amountCents = costAmountToCents(rawAmount);
  const conceptText = asText(rawConcept);
  const concept = normalizeCostConcept(conceptText);
  const invalidReasons: string[] = [];

  if (!date) invalidReasons.push("date");
  if (amountCents === null) invalidReasons.push("amount");
  if (!concept) invalidReasons.push("concept");

  return {
    side,
    original: input,
    id: (record.id ?? null) as string | number | null,
    rowNumber: rowNumberOf(record, options.rowNumber ?? null),
    date,
    concept,
    conceptText,
    category: asText(rawCategory),
    sector: asText(rawSector),
    sourceReference,
    invoiceReference,
    references,
    amount: centsToAmount(amountCents),
    amountCents,
    isValid: invalidReasons.length === 0,
    invalidReasons
  };
}

export const normalizeCostRow = normalizeCostRecord;

/** Normalizes a list and supplies useful default row numbers for imported Excel data. */
export function normalizeCostRecords(
  records: CostReportRecord[],
  side: CostReportSide = "system"
) {
  return records.map((record, index) =>
    normalizeCostRecord(record, {
      side,
      rowNumber: side === "excel" ? index + 2 : index + 1
    })
  );
}

function referencesMatch(system: NormalizedCostRecord, excel: NormalizedCostRecord) {
  if (system.references.length === 0 || excel.references.length === 0) return false;
  return system.references.some((reference) => excel.references.includes(reference));
}

function recordsCanMatch(system: NormalizedCostRecord, excel: NormalizedCostRecord) {
  if (!system.isValid || !excel.isValid) return false;
  if (system.references.length > 0 || excel.references.length > 0) {
    return referencesMatch(system, excel);
  }
  return system.date === excel.date && system.concept === excel.concept;
}

function makeInvalidItem(record: NormalizedCostRecord): CostComparisonItem {
  return record.side === "system" ? { status: "invalid", system: record } : { status: "invalid", excel: record };
}

function makeUnmatchedItem(record: NormalizedCostRecord): CostComparisonItem {
  return record.side === "system"
    ? { status: "only_system", system: record }
    : { status: "only_excel", excel: record };
}

function amountItem(system: NormalizedCostRecord, excel: NormalizedCostRecord): CostComparisonItem {
  const amountDifferenceCents = (excel.amountCents ?? 0) - (system.amountCents ?? 0);
  const status: CostRecordStatus = amountDifferenceCents === 0 ? "matched" : "amount_mismatch";
  return {
    status,
    system,
    excel,
    amountDifferenceCents,
    amountDifference: amountDifferenceCents / 100
  };
}

function summaryOf(items: CostComparisonItem[]): CostComparisonSummary {
  const summary: CostComparisonSummary = {
    matched: 0,
    amount_mismatch: 0,
    only_system: 0,
    only_excel: 0,
    ambiguous: 0,
    invalid: 0
  };
  items.forEach((item) => {
    summary[item.status] += 1;
  });
  return summary;
}

function connectedComponents(
  system: NormalizedCostRecord[],
  excel: NormalizedCostRecord[],
  candidatesBySystem: Map<number, number[]>,
  candidatesByExcel: Map<number, number[]>
) {
  const components: Array<{ system: number[]; excel: number[] }> = [];
  const seenSystem = new Set<number>();
  const seenExcel = new Set<number>();

  for (let start = 0; start < system.length; start += 1) {
    const candidates = candidatesBySystem.get(start) ?? [];
    if (candidates.length === 0 || seenSystem.has(start)) continue;
    const systemIndexes: number[] = [];
    const excelIndexes: number[] = [];
    const pendingSystem = [start];
    const pendingExcel: number[] = [];

    while (pendingSystem.length || pendingExcel.length) {
      const systemIndex = pendingSystem.pop();
      if (systemIndex !== undefined && !seenSystem.has(systemIndex)) {
        seenSystem.add(systemIndex);
        systemIndexes.push(systemIndex);
        pendingExcel.push(...(candidatesBySystem.get(systemIndex) ?? []));
      }
      const excelIndex = pendingExcel.pop();
      if (excelIndex !== undefined && !seenExcel.has(excelIndex)) {
        seenExcel.add(excelIndex);
        excelIndexes.push(excelIndex);
        pendingSystem.push(...(candidatesByExcel.get(excelIndex) ?? []));
      }
    }

    components.push({ system: systemIndexes, excel: excelIndexes });
  }
  return components;
}

/** Compares system costs with imported Excel rows without changing either input. */
export function compareCostRecords(
  systemRecords: CostReportRecord[] | NormalizedCostRecord[],
  excelRecords: CostReportRecord[] | NormalizedCostRecord[]
): CostComparisonResult {
  const system = systemRecords.map((record, index) =>
    "isValid" in record && "amountCents" in record
      ? (record as NormalizedCostRecord)
      : normalizeCostRecord(record as CostReportRecord, { side: "system", rowNumber: index + 1 })
  );
  const excel = excelRecords.map((record, index) =>
    "isValid" in record && "amountCents" in record
      ? (record as NormalizedCostRecord)
      : normalizeCostRecord(record as CostReportRecord, { side: "excel", rowNumber: index + 2 })
  );
  const items: CostComparisonItem[] = [];
  const candidatesBySystem = new Map<number, number[]>();
  const candidatesByExcel = new Map<number, number[]>();

  system.forEach((systemRecord, systemIndex) => {
    if (!systemRecord.isValid) {
      items.push(makeInvalidItem(systemRecord));
      return;
    }
    const candidates = excel
      .map((excelRecord, excelIndex) => (recordsCanMatch(systemRecord, excelRecord) ? excelIndex : -1))
      .filter((index) => index >= 0);
    candidatesBySystem.set(systemIndex, candidates);
    candidates.forEach((excelIndex) => {
      const opposite = candidatesByExcel.get(excelIndex) ?? [];
      opposite.push(systemIndex);
      candidatesByExcel.set(excelIndex, opposite);
    });
  });

  excel.forEach((excelRecord) => {
    if (!excelRecord.isValid) items.push(makeInvalidItem(excelRecord));
  });

  const matchedExcel = new Set<number>();
  const matchedSystem = new Set<number>();
  const components = connectedComponents(system, excel, candidatesBySystem, candidatesByExcel);

  for (const component of components) {
    const isOneToOne =
      component.system.length === 1 &&
      component.excel.length === 1 &&
      (candidatesBySystem.get(component.system[0]) ?? []).length === 1 &&
      (candidatesByExcel.get(component.excel[0]) ?? []).length === 1;

    if (isOneToOne) {
      const systemIndex = component.system[0];
      const excelIndex = component.excel[0];
      matchedSystem.add(systemIndex);
      matchedExcel.add(excelIndex);
      items.push(amountItem(system[systemIndex], excel[excelIndex]));
      continue;
    }

    const systemRows = component.system.map((index) => system[index]);
    const excelRows = component.excel.map((index) => excel[index]);
    systemRows.sort((left, right) => (left.rowNumber ?? Number.MAX_SAFE_INTEGER) - (right.rowNumber ?? Number.MAX_SAFE_INTEGER));
    excelRows.sort((left, right) => (left.rowNumber ?? Number.MAX_SAFE_INTEGER) - (right.rowNumber ?? Number.MAX_SAFE_INTEGER));
    systemRows.forEach((record) => matchedSystem.add(system.indexOf(record)));
    excelRows.forEach((record) => matchedExcel.add(excel.indexOf(record)));
    items.push({
      status: "ambiguous",
      system: systemRows.length === 1 ? systemRows[0] : undefined,
      excel: excelRows.length === 1 ? excelRows[0] : undefined,
      systemRecords: systemRows,
      excelRecords: excelRows,
      candidates: excelRows
    });
  }

  system.forEach((record, index) => {
    if (record.isValid && !matchedSystem.has(index) && (candidatesBySystem.get(index) ?? []).length === 0) {
      items.push(makeUnmatchedItem(record));
    }
  });
  excel.forEach((record, index) => {
    if (record.isValid && !matchedExcel.has(index) && (candidatesByExcel.get(index) ?? []).length === 0) {
      items.push(makeUnmatchedItem(record));
    }
  });

  // Keep output deterministic even though invalid rows were discovered before
  // matching. Data rows remain in source order within each classification.
  const order = new Map<CostComparisonItem, number>();
  items.forEach((item, index) => order.set(item, index));
  items.sort((left, right) => {
    const leftRow = left.system?.rowNumber ?? left.excel?.rowNumber ?? left.systemRecords?.[0]?.rowNumber ?? left.excelRecords?.[0]?.rowNumber ?? Number.MAX_SAFE_INTEGER;
    const rightRow = right.system?.rowNumber ?? right.excel?.rowNumber ?? right.systemRecords?.[0]?.rowNumber ?? right.excelRecords?.[0]?.rowNumber ?? Number.MAX_SAFE_INTEGER;
    return leftRow - rightRow || (order.get(left) ?? 0) - (order.get(right) ?? 0);
  });

  const summary = summaryOf(items);
  const systemCents = system.reduce((sum, record) => sum + (record.isValid ? record.amountCents ?? 0 : 0), 0);
  const excelCents = excel.reduce((sum, record) => sum + (record.isValid ? record.amountCents ?? 0 : 0), 0);
  const groups = {
    matched: items.filter((item) => item.status === "matched"),
    amountMismatch: items.filter((item) => item.status === "amount_mismatch"),
    onlySystem: items.filter((item) => item.status === "only_system"),
    onlyExcel: items.filter((item) => item.status === "only_excel"),
    ambiguous: items.filter((item) => item.status === "ambiguous"),
    invalid: items.filter((item) => item.status === "invalid")
  };
  return {
    system,
    excel,
    items,
    rows: items,
    summary,
    counts: summary,
    totals: {
      systemCents,
      excelCents,
      differenceCents: excelCents - systemCents,
      system: systemCents / 100,
      excel: excelCents / 100,
      difference: (excelCents - systemCents) / 100
    },
    ...groups
  };
}

export const compareCosts = compareCostRecords;
export const compareCostReport = compareCostRecords;

function addBucket(map: Map<string, CostAggregateBucket>, key: string, amountCents: number) {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.amountCents += amountCents;
    existing.amount = existing.amountCents / 100;
    return;
  }
  map.set(key, { key, label: key, count: 1, amountCents, amount: amountCents / 100 });
}

/** Aggregates valid costs for report cards, tables, or chart data. */
export function aggregateCostReport(
  records: CostReportRecord[] | NormalizedCostRecord[],
  side: CostReportSide = "system"
): CostReportAggregation {
  const normalized = records.map((record, index) =>
    "isValid" in record && "amountCents" in record
      ? (record as NormalizedCostRecord)
      : normalizeCostRecord(record as CostReportRecord, { side, rowNumber: index + 1 })
  );
  const byCategory = new Map<string, CostAggregateBucket>();
  const bySector = new Map<string, CostAggregateBucket>();
  let totalCents = 0;
  let count = 0;

  normalized.forEach((record) => {
    if (!record.isValid || record.amountCents === null) return;
    count += 1;
    totalCents += record.amountCents;
    addBucket(byCategory, record.category || "Sin categoría", record.amountCents);
    addBucket(bySector, record.sector || EMPTY_SECTOR, record.amountCents);
  });

  return {
    count,
    invalidCount: normalized.length - count,
    totalCents,
    total: totalCents / 100,
    byCategory: Array.from(byCategory.values()).sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label, "es-MX")),
    bySector: Array.from(bySector.values()).sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label, "es-MX"))
  };
}

export const aggregateCosts = aggregateCostReport;

/** Produces stable, flat rows suitable for CSV/XLSX/PDF adapters. */
export function toCostReportRows(
  records: CostReportRecord[] | NormalizedCostRecord[],
  side: CostReportSide = "system"
): CostReportExportRow[] {
  return records.map((record, index) => {
    const normalized =
      "isValid" in record && "amountCents" in record
        ? (record as NormalizedCostRecord)
        : normalizeCostRecord(record as CostReportRecord, { side, rowNumber: index + 1 });
    return {
      id: normalized.id,
      rowNumber: normalized.rowNumber,
      date: normalized.date,
      concept: normalized.conceptText,
      category: normalized.category,
      sector: normalized.sector || EMPTY_SECTOR,
      amount: normalized.amount,
      amountCents: normalized.amountCents,
      sourceReference: normalized.sourceReference,
      invoiceReference: normalized.invoiceReference
    };
  });
}

export const exportCostReportRows = toCostReportRows;

/** Flattens comparison items for an export while preserving source row numbers. */
export function toCostComparisonRows(result: CostComparisonResult) {
  return result.items.flatMap((item) => {
    const systemRows = item.systemRecords ?? (item.system ? [item.system] : []);
    const excelRows = item.excelRecords ?? (item.excel ? [item.excel] : []);
    const system = systemRows[0];
    const excel = excelRows[0];
    return [{
      status: item.status,
      systemRowNumber: system?.rowNumber ?? null,
      excelRowNumber: excel?.rowNumber ?? null,
      systemRowNumbers: systemRows.map((record) => record.rowNumber),
      excelRowNumbers: excelRows.map((record) => record.rowNumber),
      systemDate: system?.date ?? null,
      excelDate: excel?.date ?? null,
      systemConcept: system?.conceptText ?? null,
      excelConcept: excel?.conceptText ?? null,
      systemAmount: system?.amount ?? null,
      excelAmount: excel?.amount ?? null,
      amountDifference: item.amountDifference ?? null,
      systemCategory: system?.category ?? null,
      excelCategory: excel?.category ?? null,
      systemSector: system?.sector || EMPTY_SECTOR,
      excelSector: excel?.sector || EMPTY_SECTOR,
      sourceReference: system?.sourceReference ?? excel?.sourceReference ?? null,
      invoiceReference: system?.invoiceReference ?? excel?.invoiceReference ?? null
    }];
  });
}

export const exportCostComparisonRows = toCostComparisonRows;
