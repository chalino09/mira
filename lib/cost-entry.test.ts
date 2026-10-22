import assert from "node:assert/strict";
import test from "node:test";
import { calculatedCostAmount, costGreenhouseError } from "./cost-entry.ts";

test("requires a productive area available to the user before saving costs", () => {
  const greenhouses = [{ id: "area-1" }, { id: "area-2" }];
  for (const id of ["", "__all__", "unknown", "null"]) assert.ok(costGreenhouseError(id, greenhouses));
  assert.ok(costGreenhouseError("area-1", []));
  assert.equal(costGreenhouseError("area-1", greenhouses), "");
  assert.equal(costGreenhouseError("area-2", greenhouses), "");
});

test("calculates a cost from formatted quantity and unit price", () => {
  assert.equal(calculatedCostAmount("1,250.5", "$24.30"), 30387.15);
});

test("keeps manual amount available when detail is incomplete", () => {
  assert.equal(calculatedCostAmount("2", ""), null);
  assert.equal(calculatedCostAmount("", "450"), null);
});
