import { parseNumericInput } from "./utils.ts";

export function calculatedCostAmount(
  quantity: string | number | null | undefined,
  unitPrice: string | number | null | undefined
) {
  const parsedQuantity = parseNumericInput(quantity);
  const parsedUnitPrice = parseNumericInput(unitPrice);

  if (parsedQuantity === null || parsedUnitPrice === null) return null;

  return Math.round(parsedQuantity * parsedUnitPrice * 100) / 100;
}
