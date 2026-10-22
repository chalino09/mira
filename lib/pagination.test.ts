import assert from "node:assert/strict";
import test from "node:test";
import { loadAllPages, paginationWindow } from "./pagination.ts";

test("loads all nursery sales and movements beyond the former 100-record limit", async () => {
  for (const total of [219, 260, 1205]) {
    const records = Array.from({ length: total }, (_, id) => ({ id, amount: 10 }));
    const result = await loadAllPages((from, to) => Promise.resolve({ data: records.slice(from, to + 1), count: total, error: null }));
    assert.deepEqual(result.data, records);
    assert.equal(result.data?.reduce((sum, row) => sum + row.amount, 0), total * 10);
  }
});

test("continues loading when the API caps a batch below the requested size", async () => {
  const records = Array.from({ length: 260 }, (_, id) => id);
  const result = await loadAllPages((from, to) => Promise.resolve({
    data: records.slice(from, Math.min(from + 100, to + 1)), count: records.length, error: null
  }));
  assert.deepEqual(result.data, records);
});

test("does not expose incomplete totals when a later batch fails", async () => {
  const error = { message: "Connection failed" };
  const result = await loadAllPages((from) => Promise.resolve(from === 0
    ? { data: [1, 2], count: 3, error: null }
    : { data: null, count: null, error }), 2);
  assert.equal(result.error, error);
  assert.equal(result.data, null);
});

test("visible pages reach every record without changing the complete dataset", () => {
  const records = Array.from({ length: 219 }, (_, id) => id);
  const visible: number[] = [];
  for (let page = 1; page <= 11; page++) {
    const window = paginationWindow(records.length, page, 20);
    visible.push(...records.slice(window.offset, window.end));
  }
  assert.deepEqual(visible, records);
  assert.deepEqual(paginationWindow(219, 11, 20), { page: 11, pageCount: 11, offset: 200, end: 219, total: 219 });
  assert.equal(paginationWindow(5, 11, 20).page, 1);
  assert.deepEqual(paginationWindow(0, 2, 20), { page: 1, pageCount: 1, offset: 0, end: 0, total: 0 });
});
