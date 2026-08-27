import assert from "node:assert/strict";
import test from "node:test";
import { appRoute, parseAppRoute } from "./routes.ts";

test("genera la ruta pública de Vivero en español", () => {
  assert.equal(appRoute("mercadia-ag", { section: "nursery" }), "/mercadia-ag/vivero");
});

test("reconoce la ruta anterior de Vivero para poder canonicalizarla", () => {
  const route = parseAppRoute("/mercadia-ag/nursery", new URLSearchParams());

  assert.equal(route.section, "nursery");
  assert.equal(route.isKnown, true);
  assert.equal(route.isLegacy, true);
});

test("reconoce vivero como la ruta canónica", () => {
  const route = parseAppRoute("/mercadia-ag/vivero", new URLSearchParams());

  assert.equal(route.section, "nursery");
  assert.equal(route.isKnown, true);
  assert.equal(route.isLegacy, false);
});
