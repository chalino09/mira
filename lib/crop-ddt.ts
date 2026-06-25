import type { CropCatalogItem, CropStageCatalog, Greenhouse, NutrientKey } from "@/types";

export const INITIAL_CROP_ID = "7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1";

export const NUTRIENT_KEYS = ["N", "P2O5", "K2O", "CaO", "MgO"] as const;

export type { CropStageCatalog, NutrientKey };

export type CropDdtStatus = {
  status: "missing-date" | "missing-catalog" | "before-table" | "active" | "after-table";
  ddt: number;
  stage: CropStageCatalog | null;
  nextStage: CropStageCatalog | null;
  stages: CropStageCatalog[];
  progress: number;
  label: string;
  detail: string;
};

export const NUTRIENT_COLORS: Record<NutrientKey, string> = {
  N: "bg-[#8BCF4B] text-[#17330E]",
  P2O5: "bg-[#F1C3A7] text-[#4A2414]",
  K2O: "bg-[#FF2D12] text-white",
  CaO: "bg-[#D9D9D9] text-[#202020]",
  MgO: "bg-[#FF9416] text-[#301B03]"
};

export function isNutrientKey(value: string): value is NutrientKey {
  return NUTRIENT_KEYS.includes(value as NutrientKey);
}

export function stagesForCrop(cropId?: string | null, cropStages: CropStageCatalog[] = []) {
  if (!cropId) return [];
  return cropStages
    .filter((stage) => stage.cropId === cropId)
    .sort((left, right) => left.number - right.number);
}

export function cropLabelForId(cropId?: string | null, crops: CropCatalogItem[] = []) {
  if (!cropId) return "Cultivo sin configurar";
  return crops.find((crop) => crop.id === cropId)?.name ?? "Cultivo sin catálogo";
}

export function greenhouseDisplayName(
  greenhouse: Pick<Greenhouse, "name" | "cropId">,
  crops: CropCatalogItem[] = []
) {
  const cropLabel = cropLabelForId(greenhouse.cropId, crops);
  return cropLabel.startsWith("Cultivo ") ? greenhouse.name : `${greenhouse.name} · ${cropLabel}`;
}

export function getCropDdtStatus(
  cropId?: string | null,
  transplantDate?: string | null,
  daysSinceTransplant = 0,
  cropStages: CropStageCatalog[] = []
): CropDdtStatus {
  const stages = stagesForCrop(cropId, cropStages);

  if (!stages.length) {
    return {
      status: "missing-catalog",
      ddt: 0,
      stage: null,
      nextStage: null,
      stages,
      progress: 0,
      label: "Sin catálogo DDT",
      detail: "Carga etapas técnicas para este cultivo"
    };
  }

  if (!transplantDate) {
    return {
      status: "missing-date",
      ddt: 0,
      stage: null,
      nextStage: stages[0],
      stages,
      progress: 0,
      label: "Sin DDT",
      detail: "Configura fecha de trasplante"
    };
  }

  const ddt = Math.max(0, Math.trunc(daysSinceTransplant));
  const stage = stages.find((item) => ddt >= item.ddtStart && ddt <= item.ddtEnd) ?? null;

  if (stage) {
    const progress = stage.ddtEnd === stage.ddtStart
      ? 1
      : (ddt - stage.ddtStart) / (stage.ddtEnd - stage.ddtStart);

    return {
      status: "active",
      ddt,
      stage,
      nextStage: stages.find((item) => item.number === stage.number + 1) ?? null,
      stages,
      progress: Math.min(1, Math.max(0, progress)),
      label: `${stage.label}: ${stage.name}`,
      detail: `${stage.ddtStart} a ${stage.ddtEnd} ddt`
    };
  }

  const firstStage = stages[0];
  if (ddt < firstStage.ddtStart) {
    return {
      status: "before-table",
      ddt,
      stage: null,
      nextStage: firstStage,
      stages,
      progress: 0,
      label: "Pre-etapa",
      detail: `La tabla inicia en ${firstStage.ddtStart} ddt`
    };
  }

  const lastStage = stages[stages.length - 1];
  return {
    status: "after-table",
    ddt,
    stage: null,
    nextStage: null,
    stages,
    progress: 1,
    label: "Fuera de tabla",
    detail: `La tabla termina en ${lastStage.ddtEnd} ddt`
  };
}
