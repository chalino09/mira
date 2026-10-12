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

test("cycle filters survive navigation and pending membership is explicit", () => {
  const cycle = "cc400000-0000-0000-0000-000000000001";
  const path = appRoute("Mercadia AG", { section: "harvest", greenhouseId: "greenhouse-1", period: "all", list: { cycle } });
  const url = new URL(path, "https://example.test");
  assert.equal(parseAppRoute(url.pathname, url.searchParams).list?.cycle, cycle);
  assert.equal(parseAppRoute("/mercadia-ag/harvest", new URLSearchParams("cycle=__pending__")).list?.cycle, "__pending__");
  assert.equal(parseAppRoute("/mercadia-ag/harvest", new URLSearchParams("cycle=invalid")).list?.cycle, undefined);
  assert.equal(appRoute("Mercadia AG", { section: "harvest", greenhouseId: "__all__", list: { cycle } }).includes("cycle="), false);
  assert.equal(parseAppRoute("/mercadia-ag/greenhouses/gh-123/cycles", new URLSearchParams()).entity?.type, "cycle");
});
