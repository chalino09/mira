import { parseNumericInput } from "./utils.ts";

export function costGreenhouseError(greenhouseId: string, greenhouses: ReadonlyArray<{ id: string }>) {
  return greenhouses.some((greenhouse) => greenhouse.id === greenhouseId)
    ? ""
    : "Selecciona un área productiva para registrar los costos.";
}

export function calculatedCostAmount(
  quantity: string | number | null | undefined,
  unitPrice: string | number | null | undefined
) {
  const parsedQuantity = parseNumericInput(quantity);
  const parsedUnitPrice = parseNumericInput(unitPrice);

  if (parsedQuantity === null || parsedUnitPrice === null) return null;

  return Math.round(parsedQuantity * parsedUnitPrice * 100) / 100;
}
