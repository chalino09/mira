const PRODUCT_TOKEN_ALIASES: Record<string, string> = {
  fe: "fierro",
  hierro: "fierro",
  zn: "zinc"
};

/**
 * Produces a comparison key for product names entered in different common forms.
 * It intentionally ignores accents, punctuation and spacing, and expands the
 * Fe/Fierro/Hierro and Zn/Zinc variants used by the product catalog.
 */
export function normalizedProductName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => PRODUCT_TOKEN_ALIASES[token] ?? token)
    .join("");
}
