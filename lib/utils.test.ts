import assert from "node:assert/strict";
import test from "node:test";
import { formatDate } from "./utils.ts";

function assertSpanishDate(value: string) {
  assert.match(value, /^15 ene\.? 2026$/i);
}

test("formatDate devuelve un marcador para fechas vacías o inválidas", () => {
  assert.equal(formatDate(), "Sin fecha");
  assert.equal(formatDate(null), "Sin fecha");
  assert.equal(formatDate(""), "Sin fecha");
  assert.equal(formatDate("no-es-una-fecha"), "Sin fecha");
});

test("formatDate conserva el día de una fecha ISO con hora", () => {
  assertSpanishDate(formatDate("2026-01-15T23:30:00.000Z"));
});

test("formatDate acepta valores heredados parseables", () => {
  assertSpanishDate(formatDate("2026/01/15"));
});
