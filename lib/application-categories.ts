import type { ApplicationRecord } from "../types";

export type ApplicationCategory = ApplicationRecord["category"];

export const applicationCategories: ApplicationCategory[] = [
  "Fertilizante",
  "Bioestimulante",
  "Corrector",
  "Acondicionador de agua",
  "Adyuvante / Coadyuvante",
  "Microorganismos",
  "Fungicida",
  "Insecticida",
  "Acaricida",
  "Nematicida",
  "Bactericida",
  "Sanitizante / Desinfectante",
  "Regulador de crecimiento"
];

export const applicationCategoryToDb: Record<ApplicationCategory, string> = {
  Fertilizante: "fertilizante",
  Bioestimulante: "bioestimulante",
  Corrector: "corrector",
  "Acondicionador de agua": "acondicionador_agua",
  "Adyuvante / Coadyuvante": "adyuvante_coadyuvante",
  Microorganismos: "microorganismos",
  Fungicida: "fungicida",
  Insecticida: "insecticida",
  Acaricida: "acaricida",
  Nematicida: "nematicida",
  Bactericida: "bactericida",
  "Sanitizante / Desinfectante": "sanitizante_desinfectante",
  "Regulador de crecimiento": "regulador_crecimiento"
};

const applicationCategoryFromDbMap = Object.fromEntries(
  Object.entries(applicationCategoryToDb).map(([label, value]) => [value, label])
) as Record<string, ApplicationCategory>;

export function applicationCategoryFromDb(value?: string | null): ApplicationCategory | "" {
  return applicationCategoryFromDbMap[value ?? ""] ?? "";
}
