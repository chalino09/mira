import assert from "node:assert/strict";
import test from "node:test";
import { calculatedCostAmount } from "./cost-entry.ts";

test("calculates a cost from formatted quantity and unit price", () => {
  assert.equal(calculatedCostAmount("1,250.5", "$24.30"), 30387.15);
});

test("keeps manual amount available when detail is incomplete", () => {
  assert.equal(calculatedCostAmount("2", ""), null);
  assert.equal(calculatedCostAmount("", "450"), null);
});
