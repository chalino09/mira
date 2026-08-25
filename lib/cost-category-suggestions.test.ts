import assert from "node:assert/strict";
import test from "node:test";
import { suggestedCostCategory } from "./cost-category-suggestions.ts";

test("sugiere preparación de terreno para trabajos de tractor", () => {
  assert.equal(suggestedCostCategory("Tractor con ripper para preparar camas"), "Preparación de terreno y maquinaria");
});

test("sugiere las categorías nuevas a partir del concepto", () => {
  assert.equal(suggestedCostCategory("Análisis de suelo"), "Análisis y laboratorio");
  assert.equal(suggestedCostCategory("Plántula doble tallo"), "Material vegetal");
  assert.equal(suggestedCostCategory("Cuatro colmenas de abejorros"), "Polinización");
});

test("no inventa una sugerencia cuando el concepto no coincide", () => {
  assert.equal(suggestedCostCategory("Compra general"), null);
});
