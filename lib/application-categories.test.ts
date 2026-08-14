import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationCategoryFromDb,
  applicationCategoryToDb
} from "./application-categories.ts";

test("convierte la categoría guardada del producto a la etiqueta del formulario", () => {
  assert.equal(applicationCategoryFromDb("bactericida"), "Bactericida");
  assert.equal(applicationCategoryFromDb("adyuvante_coadyuvante"), "Adyuvante / Coadyuvante");
});

test("deja vacía una categoría inexistente en vez de inventar una", () => {
  assert.equal(applicationCategoryFromDb(null), "");
  assert.equal(applicationCategoryFromDb("categoria_desconocida"), "");
});

test("mantiene el valor técnico al guardar la categoría", () => {
  assert.equal(applicationCategoryToDb["Sanitizante / Desinfectante"], "sanitizante_desinfectante");
});
