import assert from "node:assert/strict";
import test from "node:test";
import { executionCatalogProduct } from "./execution-products.ts";

const products = [
  { id: "amino", name: "AMINOSHOT" },
  { id: "supra", name: "SUPRA ENGORDE" }
];

test("recupera ambos productos de una nutrición histórica sin identificadores", () => {
  assert.equal(executionCatalogProduct(products, null, "AMINOSHOT")?.id, "amino");
  assert.equal(executionCatalogProduct(products, "", " supra  engorde ")?.id, "supra");
});

test("no elige arbitrariamente entre productos con nombres equivalentes", () => {
  const duplicate = [...products, { id: "other", name: "Supra Engorde" }];
  assert.equal(executionCatalogProduct(duplicate, null, "SUPRA ENGORDE"), undefined);
  assert.equal(executionCatalogProduct(duplicate, "supra", "SUPRA ENGORDE")?.id, "supra");
});

test("no sustituye un identificador ajeno o eliminado por una coincidencia de nombre", () => {
  assert.equal(executionCatalogProduct(products, "foreign", "AMINOSHOT"), undefined);
  assert.equal(executionCatalogProduct(products, null, "Desconocido"), undefined);
  assert.equal(executionCatalogProduct(products, null, ""), undefined);
});
