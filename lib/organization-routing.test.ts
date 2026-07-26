import assert from "node:assert/strict";
import test from "node:test";
import { canonicalOrganizationUrl, resolveOrganizationSlug } from "./organization-routing.ts";

const memberships = [
  { id: "company-a", organization: { name: "Finca Álamo", slug: "finca-alamo" } },
  { id: "company-b", organization: { name: "Huerta Norte", slug: "huerta-norte" } }
];

test("resuelve una membresía autorizada por su slug canónico", () => {
  const result = resolveOrganizationSlug(memberships, "huerta-norte");

  assert.equal(result.kind, "matched");
  assert.equal(result.kind === "matched" ? result.membership.id : undefined, "company-b");
});

test("canonicaliza un slug autorizado sin cambiar de empresa", () => {
  const result = resolveOrganizationSlug(memberships, "FINCA ÁLAMO");

  assert.equal(result.kind, "canonical");
  assert.equal(result.kind === "canonical" ? result.membership.id : undefined, "company-a");
  assert.equal(result.kind === "canonical" ? result.canonicalSlug : undefined, "finca-alamo");
});

test("deniega un slug que no está entre las membresías activas", () => {
  assert.deepEqual(resolveOrganizationSlug(memberships, "empresa-ajena"), { kind: "denied" });
});

test("conserva el enlace profundo y sus parámetros al canonicalizar la empresa", () => {
  assert.equal(
    canonicalOrganizationUrl(
      "/Finca%20%C3%81lamo/greenhouses/gh-123/cycles/current",
      "finca-alamo",
      "period=month&greenhouse=gh-123&q=riego"
    ),
    "/finca-alamo/greenhouses/gh-123/cycles/current?period=month&greenhouse=gh-123&q=riego"
  );
});
