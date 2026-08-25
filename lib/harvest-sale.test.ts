import assert from "node:assert/strict";
import test from "node:test";
import { calculateHarvestSale } from "./harvest-sale.ts";

test("desglosa bruto, comisión, flete, empaque y venta neta", () => {
  const result = calculateHarvestSale({
    lines: [
      { quality: "Segunda", boxCount: 81, grossPricePerBox: 110 },
      { quality: "Tercera", boxCount: 50, grossPricePerBox: 70 }
    ],
    commissionPerBox: 25,
    freightPerBox: 15,
    packagingPerBox: 2.885496
  });

  assert.equal(result.grossAmount, 12410);
  assert.equal(result.soldBoxes, 131);
  assert.equal(result.netAmount, 6792);
});

test("rechaza deducciones mayores al precio de alguna calidad", () => {
  const result = calculateHarvestSale({
    lines: [{ quality: "Tercera", boxCount: "10", grossPricePerBox: "30" }],
    commissionPerBox: "20",
    freightPerBox: "10",
    packagingPerBox: "5"
  });

  assert.equal(result.isValid, false);
});
