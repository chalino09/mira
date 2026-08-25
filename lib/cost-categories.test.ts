import assert from "node:assert/strict";
import test from "node:test";
import { costCategories, costCategoryToDb, mapCostCategory } from "./cost-categories.ts";

test("muestra la categoría histórica mano_obra como Nómina", () => {
  assert.equal(mapCostCategory("mano_obra"), "Nómina");
});

test("guarda la etiqueta Nómina con el valor técnico existente", () => {
  assert.equal(costCategoryToDb.Nómina, "mano_obra");
});

test("mapea material de producción para costos de rafia y anillos", () => {
  assert.equal(costCategoryToDb["Material de producción"], "material_produccion");
  assert.equal(mapCostCategory("material_produccion"), "Material de producción");
});

test("coloca Gasolina entre las categorías principales", () => {
  assert.equal(costCategories[3]?.label, "Gasolina");
});

test("el catálogo ordenado incluye todas las categorías guardables", () => {
  assert.deepEqual(
    costCategories.map(({ label }) => label),
    Object.keys(costCategoryToDb)
  );
});

test("incluye los apartados operativos solicitados", () => {
  const labels = costCategories.map(({ label }) => label);
  assert.equal(labels.includes("Preparación de terreno y maquinaria"), true);
  assert.equal(labels.includes("Análisis y laboratorio"), true);
  assert.equal(labels.includes("Material vegetal"), true);
  assert.equal(labels.includes("Polinización"), true);
});
