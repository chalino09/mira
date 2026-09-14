import assert from "node:assert/strict";
import test from "node:test";
import { harvestPriceOutlierMessage, harvestValuesFromForm, reconcileHarvestBoxes } from "./harvest.ts";

function reconciliation(boxCount: number, first: number, second: number, third: number, merma: number) {
  return reconcileHarvestBoxes({
    boxCount,
    firstQualityBoxes: first,
    secondQualityBoxes: second,
    thirdQualityBoxes: third,
    mermaBoxes: merma
  });
}

test("acepta una clasificación que coincide exactamente con las cajas totales", () => {
  const result = reconciliation(1000, 500, 300, 150, 50);

  assert.equal(result.isBalanced, true);
  assert.equal(result.classifiedBoxes, 1000);
  assert.match(result.message, /1,000 cajas clasificadas/);
});

test("rechaza calidades que exceden las cajas totales", () => {
  const result = reconciliation(1000, 250, 140, 1000, 0);

  assert.equal(result.isBalanced, false);
  assert.equal(result.difference, 390);
  assert.match(result.message, /Reduce 390 cajas/);
});

test("rechaza cajas pendientes de clasificar e incluye la merma", () => {
  const result = reconciliation(1000, 500, 300, 100, 50);

  assert.equal(result.isBalanced, false);
  assert.equal(result.classifiedBoxes, 950);
  assert.equal(result.difference, -50);
  assert.match(result.message, /Clasifica 50 cajas más/);
});

test("interpreta correctamente valores con separadores al leer el formulario", () => {
  const form = new FormData();
  form.set("boxCount", "1,000");
  form.set("boxWeightKg", "20");
  form.set("firstQualityBoxes", "500");
  form.set("secondQualityBoxes", "300");
  form.set("thirdQualityBoxes", "150");
  form.set("mermaBoxes", "50");

  const values = harvestValuesFromForm(form);
  assert.equal(values.boxCount, 1000);
  assert.equal(values.kilograms, 20000);
  assert.equal(reconcileHarvestBoxes(values).isBalanced, true);
});

test("calcula el monto con precio por caja, no por kilo", () => {
  const form = new FormData();
  form.set("boxCount", "10");
  form.set("boxWeightKg", "20");
  form.set("firstQualityBoxes", "5");
  form.set("secondQualityBoxes", "3");
  form.set("thirdQualityBoxes", "1");
  form.set("mermaBoxes", "1");
  form.set("firstQualityPrice", "100");
  form.set("secondQualityPrice", "80");
  form.set("thirdQualityPrice", "50");

  const values = harvestValuesFromForm(form);
  assert.equal(values.estimatedRevenue, 790);
  assert.equal(values.estimatedPrice, 790 / 9);
});

test("advierte precios por caja fuera del rango histórico", () => {
  const message = harvestPriceOutlierMessage(250, "first", {
    first: [90, 100, 110],
    second: [],
    third: []
  });

  assert.match(message, /Verifica el dato antes de guardar/);
});

test("incluye Canica y Papel en cajas, kilos e ingresos y detecta descuadres", () => {
  const form = new FormData();
  form.set("boxCount", "10");
  form.set("boxWeightKg", "20");
  form.set("firstQualityBoxes", "2");
  form.set("firstQualityPrice", "100");
  form.set("canicaBoxes", "3");
  form.set("canicaPrice", "40");
  form.set("papelBoxes", "4");
  form.set("papelPrice", "20");
  form.set("mermaBoxes", "1");

  const values = harvestValuesFromForm(form);
  assert.equal(values.canica, 60);
  assert.equal(values.papel, 80);
  assert.equal(values.kilograms, 200);
  assert.equal(values.estimatedRevenue, 400);
  assert.equal(values.estimatedPrice, 400 / 9);
  assert.equal(reconcileHarvestBoxes(values).isBalanced, true);
  assert.equal(reconcileHarvestBoxes({ ...values, papelBoxes: 5 }).difference, 1);
  assert.equal(reconcileHarvestBoxes({ ...values, canicaBoxes: 2 }).isBalanced, false);
});

test("los registros anteriores conservan sus totales sin Canica ni Papel", () => {
  const form = new FormData();
  form.set("firstQualityBoxes", "5");
  form.set("firstQualityPrice", "100");
  const values = harvestValuesFromForm(form);
  assert.equal(values.canicaBoxes, 0);
  assert.equal(values.papelBoxes, 0);
  assert.equal(values.canicaPrice, 0);
  assert.equal(values.papelPrice, 0);
  assert.equal(values.estimatedRevenue, 500);
  assert.equal(values.boxCount, 5);
});
