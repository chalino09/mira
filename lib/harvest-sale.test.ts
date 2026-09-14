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

test("permite gastos cuando las calidades sin venta tienen precio cero", () => {
  const result = calculateHarvestSale({
    lines: [
      { quality: "Primera", boxCount: "10", grossPricePerBox: "100" },
      { quality: "Segunda", boxCount: "0", grossPricePerBox: "0" },
      { quality: "Tercera", boxCount: "", grossPricePerBox: "" }
    ],
    commissionPerBox: "1",
    freightPerBox: "2",
    packagingPerBox: "3"
  });

  assert.equal(result.isValid, true);
  assert.equal(result.soldBoxes, 10);
  assert.equal(result.netAmount, 940);
});

test("sigue rechazando gastos excesivos en una calidad vendida aunque otras estén vacías", () => {
  const result = calculateHarvestSale({
    lines: [
      { quality: "Primera", boxCount: "10", grossPricePerBox: "100" },
      { quality: "Segunda", boxCount: "1", grossPricePerBox: "5" },
      { quality: "Tercera", boxCount: "0", grossPricePerBox: "0" }
    ],
    commissionPerBox: "1",
    freightPerBox: "2",
    packagingPerBox: "3"
  });

  assert.equal(result.isValid, false);
});

test("aplica los descuentos por caja a las ventas de Canica y Papel", () => {
  const result = calculateHarvestSale({
    lines: [
      { quality: "Canica", boxCount: 3, grossPricePerBox: 40 },
      { quality: "Papel", boxCount: 4, grossPricePerBox: 20 }
    ],
    commissionPerBox: 2,
    freightPerBox: 3,
    packagingPerBox: 1
  });
  assert.equal(result.soldBoxes, 7);
  assert.equal(result.grossAmount, 200);
  assert.equal(result.netAmount, 158);
  assert.equal(result.isValid, true);
});
