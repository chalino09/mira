import type { CostRecord } from "../types/index.ts";

export const costCategoryToDb: Record<CostRecord["category"], string> = {
  Nómina: "mano_obra",
  Fertilizantes: "fertilizantes",
  Agroinsumos: "agroinsumos",
  Agua: "agua",
  Energía: "energia",
  Plásticos: "plasticos",
  Mantenimiento: "mantenimiento",
  Transporte: "transporte",
  Refrescos: "refrescos",
  Renta: "renta",
  Gasolina: "gasolina"
};

const costCategoryFromDb: Record<string, CostRecord["category"]> = Object.fromEntries(
  Object.entries(costCategoryToDb).map(([label, value]) => [value, label as CostRecord["category"]])
);

export function mapCostCategory(category?: string | null): CostRecord["category"] {
  return costCategoryFromDb[category ?? ""] ?? "Agroinsumos";
}
