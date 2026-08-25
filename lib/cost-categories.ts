import type { CostRecord } from "../types/index.ts";

export const costCategories = [
  { label: "Nómina", value: "mano_obra" },
  { label: "Fertilizantes", value: "fertilizantes" },
  { label: "Agroinsumos", value: "agroinsumos" },
  { label: "Gasolina", value: "gasolina" },
  { label: "Preparación de terreno y maquinaria", value: "preparacion_terreno_maquinaria" },
  { label: "Análisis y laboratorio", value: "analisis_laboratorio" },
  { label: "Material vegetal", value: "material_vegetal" },
  { label: "Polinización", value: "polinizacion" },
  { label: "Agua", value: "agua" },
  { label: "Energía", value: "energia" },
  { label: "Plásticos", value: "plasticos" },
  { label: "Mantenimiento", value: "mantenimiento" },
  { label: "Transporte", value: "transporte" },
  { label: "Refrescos", value: "refrescos" },
  { label: "Renta", value: "renta" },
  { label: "Material de producción", value: "material_produccion" }
] satisfies Array<{ label: CostRecord["category"]; value: string }>;

export const costCategoryToDb = Object.fromEntries(
  costCategories.map(({ label, value }) => [label, value])
) as Record<CostRecord["category"], string>;

const costCategoryFromDb: Record<string, CostRecord["category"]> = Object.fromEntries(
  costCategories.map(({ label, value }) => [value, label])
);

export function mapCostCategory(category?: string | null): CostRecord["category"] {
  return costCategoryFromDb[category ?? ""] ?? "Agroinsumos";
}
