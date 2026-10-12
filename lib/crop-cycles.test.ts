import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleTotalsFor, greenhouseForCycle, suggestedCycleForDate, summarizeGreenhouseCycles, type CropCycle } from "./crop-cycles.ts";
import type { Greenhouse } from "../types/index.ts";
const cycle = (id: string, status: CropCycle["status"], start: string, end = "") => ({
  id, status, startedAt: start, endedAt: end, transplantDate: start
}) as CropCycle;

test("unknown close dates and overlapping periods never produce a confident suggestion", () => {
  assert.equal(suggestedCycleForDate([cycle("old", "closed", "2026-01-01")], "2026-07-01"), null);
  assert.equal(suggestedCycleForDate([cycle("a", "closed", "2026-01-01", "2026-07-01"), cycle("b", "active", "2026-06-15")], "2026-06-20"), null);
});
test("late records can be suggested for a previous cycle and preparation remains pending", () => {
  const cycles = [cycle("old", "closed", "2026-01-01", "2026-06-01"), cycle("new", "active", "2026-07-01")];
  assert.equal(suggestedCycleForDate(cycles, "2026-05-15"), "old");
  assert.equal(suggestedCycleForDate(cycles, "2026-06-15"), null);
  assert.equal(suggestedCycleForDate(cycles, "2026-07-10"), "new");
});
test("totals isolate cycles, preserve unassigned records, and do not count sales as captures", () => {
  const totals = [
    { cycleId: "old", resource: "harvest_records", count: 2, kilograms: 100, expenses: 0, income: 0 },
    { cycleId: "new", resource: "cost_records", count: 1, kilograms: 0, expenses: 250, income: 0 },
    { cycleId: "old", resource: "sales", count: 1, kilograms: 0, expenses: 0, income: 900 },
    { cycleId: null, resource: "harvest_records", count: 3, kilograms: 200, expenses: 0, income: 0 }
  ];
  assert.deepEqual(cycleTotalsFor(totals, "old"), { count: 2, kilograms: 100, expenses: 0, income: 900 });
  assert.deepEqual(cycleTotalsFor(totals, null), { count: 3, kilograms: 200, expenses: 0, income: 0 });
});
test("area summaries use recorded status and keep unknown closures independent between greenhouses", () => {
  const cycles = [
    { ...cycle("other", "active", "2026-08-01"), greenhouseId: "b" },
    { ...cycle("closed", "closed", "2026-01-01"), greenhouseId: "a" },
    { ...cycle("old", "closed", "2025-01-01", "2025-07-01"), greenhouseId: "a" },
    { ...cycle("imported-closed", "closed", "2025-01-01", "2025-07-01"), greenhouseId: "c" },
    { ...cycle("long-running", "active", "2024-01-01"), greenhouseId: "c" }
  ];
  const a = summarizeGreenhouseCycles(cycles, "a");
  assert.equal(a.active, undefined);
  assert.equal(a.latest?.id, "closed");
  assert.equal(a.latest?.endedAt, "");
  assert.equal(a.number, 2);
  assert.equal(summarizeGreenhouseCycles(cycles, "b").number, 1);
  assert.equal(summarizeGreenhouseCycles(cycles, "c").active?.id, "long-running");
  assert.equal(summarizeGreenhouseCycles(cycles, "c").number, 1);
  assert.equal(summarizeGreenhouseCycles(cycles, "empty").latest, undefined);
});
test("historical agronomic detail freezes DDT at the known closure and leaves the active greenhouse intact", () => {
  const greenhouse = { id: "a", variety: "Actual", plants: 12000 } as Greenhouse;
  const historical = { ...cycle("old", "closed", "2025-01-01", "2025-07-01"), variety: "Anterior", plants: 11000 };
  const detail = greenhouseForCycle(greenhouse, historical, historical.endedAt);
  assert.equal(detail.daysSinceTransplant, 181);
  assert.equal(detail.variety, "Anterior");
  assert.equal(greenhouse.variety, "Actual");
  assert.equal(greenhouse.plants, 12000);
});
