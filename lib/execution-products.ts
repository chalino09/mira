import { normalizedProductName } from "./product-search.ts";

type CatalogProduct = { id: string; name: string };

/** Recover legacy name-only materials only when the catalog match is unique. */
export function executionCatalogProduct<T extends CatalogProduct>(
  products: T[],
  productId: string | null | undefined,
  productName: string
): T | undefined {
  if (productId) return products.find((product) => product.id === productId);
  const name = normalizedProductName(productName);
  if (!name) return undefined;
  const matches = products.filter((product) => normalizedProductName(product.name) === name);
  return matches.length === 1 ? matches[0] : undefined;
}
