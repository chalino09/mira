import assert from "node:assert/strict";
import test from "node:test";
import { costCategoryToDb, mapCostCategory } from "./cost-categories.ts";

test("muestra la categoría histórica mano_obra como Nómina", () => {
  assert.equal(mapCostCategory("mano_obra"), "Nómina");
});

test("guarda la etiqueta Nómina con el valor técnico existente", () => {
  assert.equal(costCategoryToDb.Nómina, "mano_obra");
});
