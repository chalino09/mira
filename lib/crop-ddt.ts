export const INITIAL_CROP_ID = "7b81d4df-08fd-4f50-9eb8-2db1f3a7b1f1";

export type NutrientKey = "N" | "P2O5" | "K2O" | "CaO" | "MgO";

export type StageNutrientRange = {
  nutrient: NutrientKey;
  min: number;
  max: number;
  display: string;
};

export type CropStageCatalog = {
  id: string;
  cropId: string;
  number: number;
  label: string;
  name: string;
  ddtStart: number;
  ddtEnd: number;
  durationDays: number;
  fertilizerUnitRanges: StageNutrientRange[];
};

export type CropCatalog = {
  id: string;
  label: string;
  stages: CropStageCatalog[];
};

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

const INITIAL_CROP_STAGES: CropStageCatalog[] = [
  {
    id: "initial-stage-1",
    cropId: INITIAL_CROP_ID,
    number: 1,
    label: "Etapa I",
    name: "Establecimiento",
    ddtStart: 5,
    ddtEnd: 21,
    durationDays: 16,
    fertilizerUnitRanges: [
      { nutrient: "N", min: 0.5, max: 2.2, display: "0.5 a 2.2" },
      { nutrient: "P2O5", min: 1, max: 2.3, display: "1 a 2.3" },
      { nutrient: "K2O", min: 2, max: 3, display: "2 a 3" },
      { nutrient: "CaO", min: 1.5, max: 3, display: "1.5 a 3" },
      { nutrient: "MgO", min: 1, max: 1.6, display: "1 a 1.6" }
    ]
  },
  {
    id: "initial-stage-2",
    cropId: INITIAL_CROP_ID,
    number: 2,
    label: "Etapa II",
    name: "Crecimiento vegetativo",
    ddtStart: 22,
    ddtEnd: 42,
    durationDays: 21,
    fertilizerUnitRanges: [
      { nutrient: "N", min: 2.3, max: 3.5, display: "2.3 a 3.5" },
      { nutrient: "P2O5", min: 1.2, max: 2.4, display: "1.2 a 2.4" },
      { nutrient: "K2O", min: 3.2, max: 4.5, display: "3.2 a 4.5" },
      { nutrient: "CaO", min: 3.2, max: 4, display: "3.2 a 4" },
      { nutrient: "MgO", min: 1.7, max: 2, display: "1.7 a 2" }
    ]
  },
  {
    id: "initial-stage-3",
    cropId: INITIAL_CROP_ID,
    number: 3,
    label: "Etapa III",
    name: "Floracion y cuajado",
    ddtStart: 43,
    ddtEnd: 77,
    durationDays: 35,
    fertilizerUnitRanges: [
      { nutrient: "N", min: 3.8, max: 5, display: "3.8 a 5" },
      { nutrient: "P2O5", min: 1.5, max: 2.5, display: "1.5 a 2.5" },
      { nutrient: "K2O", min: 6, max: 7.5, display: "6 a 7.5" },
      { nutrient: "CaO", min: 4.2, max: 5.2, display: "4.2 a 5.2" },
      { nutrient: "MgO", min: 1.9, max: 2.3, display: "1.9 a 2.3" }
    ]
  },
  {
    id: "initial-stage-4",
    cropId: INITIAL_CROP_ID,
    number: 4,
    label: "Etapa IV",
    name: "Engorde e inicio cosecha",
    ddtStart: 78,
    ddtEnd: 112,
    durationDays: 35,
    fertilizerUnitRanges: [
      { nutrient: "N", min: 5.2, max: 6, display: "5.2 a 6" },
      { nutrient: "P2O5", min: 1.8, max: 2.2, display: "1.8 a 2.2" },
      { nutrient: "K2O", min: 8, max: 10, display: "8 a 10" },
      { nutrient: "CaO", min: 4.5, max: 5.5, display: "4.5 a 5.5" },
      { nutrient: "MgO", min: 2, max: 2.6, display: "2 a 2.6" }
    ]
  },
  {
    id: "initial-stage-5",
    cropId: INITIAL_CROP_ID,
    number: 5,
    label: "Etapa V",
    name: "Cosecha",
    ddtStart: 113,
    ddtEnd: 154,
    durationDays: 42,
    fertilizerUnitRanges: [
      { nutrient: "N", min: 6.2, max: 9, display: "6.2 a 9" },
      { nutrient: "P2O5", min: 1.8, max: 2.2, display: "1.8 a 2.2" },
      { nutrient: "K2O", min: 8.5, max: 12, display: "8.5 a 12" },
      { nutrient: "CaO", min: 4.5, max: 5.5, display: "4.5 a 5.5" },
      { nutrient: "MgO", min: 2.2, max: 2.6, display: "2.2 a 2.6" }
    ]
  },
  {
    id: "initial-stage-6",
    cropId: INITIAL_CROP_ID,
    number: 6,
    label: "Etapa VI",
    name: "Cosecha tardia y senescencia",
    ddtStart: 155,
    ddtEnd: 182,
    durationDays: 28,
    fertilizerUnitRanges: [
      { nutrient: "N", min: 3, max: 3, display: "3" },
      { nutrient: "P2O5", min: 0.5, max: 0.5, display: "0.5" },
      { nutrient: "K2O", min: 3, max: 5, display: "3 a 5" },
      { nutrient: "CaO", min: 3, max: 3, display: "3" },
      { nutrient: "MgO", min: 1.5, max: 1.5, display: "1.5" }
    ]
  }
];

export const CROP_CATALOGS: CropCatalog[] = [
  {
    id: INITIAL_CROP_ID,
    label: "Jitomate",
    stages: INITIAL_CROP_STAGES
  }
];

export function stagesForCrop(cropId?: string | null) {
  const catalog = CROP_CATALOGS.find((crop) => crop.id === cropId) ?? CROP_CATALOGS[0];
  return catalog?.stages ?? [];
}

export function cropLabelForId(cropId?: string | null) {
  return CROP_CATALOGS.find((crop) => crop.id === cropId)?.label ?? "Cultivo";
}

export function getCropDdtStatus(
  cropId?: string | null,
  transplantDate?: string | null,
  daysSinceTransplant = 0
): CropDdtStatus {
  const stages = stagesForCrop(cropId);

  if (!stages.length) {
    return {
      status: "missing-catalog",
      ddt: 0,
      stage: null,
      nextStage: null,
      stages,
      progress: 0,
      label: "Sin catalogo DDT",
      detail: "Agrega etapas para este cultivo"
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
