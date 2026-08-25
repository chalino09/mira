import type { CostRecord } from "../types/index.ts";

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX");
}

const suggestionRules: Array<{ category: CostRecord["category"]; pattern: RegExp }> = [
  { category: "Preparación de terreno y maquinaria", pattern: /\b(tractor|riper|tiller|arado|rastra|subsuelo|surco|camas?|preparacion de terreno)\b/ },
  { category: "Análisis y laboratorio", pattern: /\b(analisis|laboratorio|muestra de suelo|muestra de agua|analisis foliar)\b/ },
  { category: "Material vegetal", pattern: /\b(plantula|semilla|injerto|portainjerto|material vegetal)\b/ },
  { category: "Polinización", pattern: /\b(abejorro|abejorros|colmena|colmenas|polinizacion)\b/ },
  { category: "Gasolina", pattern: /\b(gasolina|diesel|combustible|aceite de motor)\b/ },
  { category: "Renta", pattern: /\b(renta|arrendamiento)\b/ },
  { category: "Transporte", pattern: /\b(transporte|flete|viaje|traslado)\b/ }
];

export function suggestedCostCategory(concept: string): CostRecord["category"] | null {
  const text = normalized(concept.trim());
  if (text.length < 3) return null;
  return suggestionRules.find((rule) => rule.pattern.test(text))?.category ?? null;
}
