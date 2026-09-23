import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateCostReport,
  compareCostRecords,
  costAmountToCents,
  normalizeCostAmount,
  normalizeCostConcept,
  normalizeCostDate,
  toCostComparisonRows
} from "./cost-report.ts";

test("normaliza fechas mexicanas, fechas ISO y seriales de Excel", () => {
  assert.equal(normalizeCostDate("31/01/2026"), "2026-01-31");
  assert.equal(normalizeCostDate("2026-02-03T18:30:00"), "2026-02-03");
  assert.equal(normalizeCostDate(46056), "2026-02-03");
});

test("normaliza conceptos y montos con separadores locales a centavos", () => {
  assert.equal(normalizeCostConcept("  Fertilizantes / Nitrato de calcio "), "fertilizantes nitrato de calcio");
  assert.equal(normalizeCostAmount("$1.234,50"), 1234.5);
  assert.equal(normalizeCostAmount("1,234.50"), 1234.5);
  assert.equal(costAmountToCents("$1.234,50"), 123450);
});

test("empareja por referencia exacta antes de fecha y concepto", () => {
  const result = compareCostRecords(
    [{ id: "s-1", date: "2026-02-03", concept: "Fertilizante", amount: "$100.00", sourceReference: "INV-7" }],
    [{ rowNumber: 8, date: "2026-02-04", concept: "Otro texto", amount: "100,00", invoiceReference: "INV-7" }]
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.status, "matched");
  assert.equal(result.items[0]?.excel?.rowNumber, 8);
});

test("empareja por fecha y concepto cuando ambas filas no tienen referencia", () => {
  const result = compareCostRecords(
    [{ date: "03/02/2026", concept: "Ácido nítrico", amount: 12.34 }],
    [{ rowNumber: 4, date: "2026-02-03", concept: " acido nitrico ", amount: "12.340" }]
  );

  assert.equal(result.summary.matched, 1);
  assert.equal(result.items[0]?.amountDifferenceCents, 0);
});

test("compara por centavos y conserva diferencias", () => {
  const result = compareCostRecords(
    [{ id: "s-1", date: "2026-02-03", concept: "Gasolina", amount: "10.00" }],
    [{ rowNumber: 2, date: "2026-02-03", concept: "Gasolina", amount: "10.01" }]
  );

  assert.equal(result.summary.amount_mismatch, 1);
  assert.equal(result.items[0]?.amountDifferenceCents, 1);
  assert.equal(result.totals.differenceCents, 1);
});

test("clasifica faltantes, inválidos y no empareja candidatos ambiguos", () => {
  const result = compareCostRecords(
    [
      { id: "s-1", date: "2026-02-03", concept: "Gasolina", amount: 10 },
      { id: "s-2", date: "2026-02-03", concept: "Gasolina", amount: 10 },
      { id: "s-3", date: "no es fecha", concept: "Renta", amount: 5 },
      { id: "s-4", date: "2026-02-03", concept: "Solo sistema", amount: 8 }
    ],
    [
      { rowNumber: 12, date: "2026-02-03", concept: "Gasolina", amount: 10 },
      { rowNumber: 13, date: "2026-02-03", concept: "Gasolina", amount: 10 },
      { rowNumber: 14, date: "2026-02-03", concept: "Solo Excel", amount: 9 },
      { rowNumber: 15, date: "2026-02-03", concept: "Fila inválida", amount: "x" }
    ]
  );

  assert.equal(result.summary.ambiguous, 1);
  assert.equal(result.summary.invalid, 2);
  assert.equal(result.summary.only_system, 1);
  assert.equal(result.summary.only_excel, 1);
  assert.equal(result.ambiguous[0]?.systemRecords?.length, 2);
  assert.equal(result.ambiguous[0]?.excelRecords?.[1]?.rowNumber, 13);
  assert.equal(result.ambiguous[0]?.amountDifferenceCents, undefined);
});

test("requiere concepto aunque la fila tenga referencia", () => {
  const result = compareCostRecords(
    [{ date: "2026-02-03", concept: "Fertilizante", amount: 10, sourceReference: "INV-9" }],
    [{ rowNumber: 7, date: "2026-02-03", concept: "", amount: 10, invoiceReference: "INV-9" }]
  );

  assert.equal(result.summary.invalid, 1);
  assert.equal(result.summary.only_system, 1);
});

test("agrega total, categorías y sectores omitiendo filas inválidas", () => {
  const report = aggregateCostReport([
    { date: "2026-02-01", concept: "A", amount: "10.10", category: "Gasolina", sector: "Módulo 1" },
    { date: "2026-02-02", concept: "B", amount: "2.90", category: "Gasolina", sector: "Módulo 1" },
    { date: "2026-02-03", concept: "C", amount: "5.00", category: "Renta" },
    { date: "bad", concept: "D", amount: 100, category: "Otro" }
  ]);

  assert.equal(report.totalCents, 1800);
  assert.equal(report.total, 18);
  assert.equal(report.invalidCount, 1);
  assert.deepEqual(report.byCategory.map((bucket) => [bucket.label, bucket.amount]), [["Gasolina", 13], ["Renta", 5]]);
  assert.equal(report.bySector.find((bucket) => bucket.label === "General / sin módulo")?.amount, 5);
});

test("aplana filas de comparación conservando el número de fila de Excel", () => {
  const result = compareCostRecords(
    [{ date: "2026-02-03", concept: "A", amount: 1 }],
    [{ rowNumber: 22, date: "2026-02-03", concept: "A", amount: 2 }]
  );
  const rows = toCostComparisonRows(result);
  assert.equal(rows[0]?.status, "amount_mismatch");
  assert.equal(rows[0]?.excelRowNumber, 22);
});
