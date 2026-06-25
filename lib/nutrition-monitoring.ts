import { INITIAL_CROP_ID } from "@/lib/crop-ddt";

export type NutritionSampleType = "petiole_cell_extract" | "soil_solution";
export type NutritionDiagnosticStatus = "Bajo" | "Adecuado" | "Alto";
export type NutritionObservationContext = "general" | "sodium" | "ph" | "ec";
export type NutritionSeverity = "baja" | "media" | "alta";
export type NutritionAnalyteKey = "n_no3" | "p_po4" | "k" | "ca" | "mg" | "na" | "ph" | "ec";

export type NutritionReferenceRange = {
  cropId: string;
  sampleType: NutritionSampleType;
  analyteKey: NutritionAnalyteKey;
  analyteLabel: string;
  inputUnit: string;
  diagnosticUnit: string;
  ddtMin: number | null;
  ddtMax: number | null;
  min: number;
  max: number;
  sortOrder: number;
};

export type NutritionObservationRule = {
  cropId: string;
  observationContext: NutritionObservationContext;
  petioleStatus: NutritionDiagnosticStatus;
  soilStatus: NutritionDiagnosticStatus;
  observationText: string;
};

export type NutritionValueResult = {
  sampleType: NutritionSampleType;
  analyteKey: NutritionAnalyteKey;
  analyteLabel: string;
  rawValue: number;
  rawUnit: string;
  diagnosticValue: number;
  diagnosticUnit: string;
  range: NutritionReferenceRange;
  diagnosticStatus: NutritionDiagnosticStatus;
  estimated: boolean;
  metadata: Record<string, number | boolean | string>;
};

export type NutritionObservationResult = {
  analyteKey: NutritionAnalyteKey;
  analyteLabel: string;
  observationContext: NutritionObservationContext;
  petioleStatus: NutritionDiagnosticStatus;
  soilStatus: NutritionDiagnosticStatus;
  observationText: string;
  recommendationText: string;
  severity: NutritionSeverity;
};

export type NutritionRawValues = Partial<Record<NutritionAnalyteKey, string | number | null>>;

export type NutritionMonitoringResult = {
  values: NutritionValueResult[];
  observations: NutritionObservationResult[];
  complete: boolean;
};

type RangeTemplate = {
  min: number;
  max: number;
  ddtMin?: number | null;
  ddtMax?: number | null;
};

type UnitConversion = {
  inputUnit: string;
  diagnosticUnit: string;
  factor: number;
  conversion: string;
};

const DDT_BANDS: Array<{ ddtMin: number; ddtMax: number | null }> = [
  { ddtMin: 0, ddtMax: 45 },
  { ddtMin: 46, ddtMax: 75 },
  { ddtMin: 76, ddtMax: 90 },
  { ddtMin: 91, ddtMax: 120 },
  { ddtMin: 121, ddtMax: null }
];

export const NUTRITION_SOURCE_LABEL = "Monitoreo nutrimental jitomate Excel";

export const NUTRITION_ANALYTES: Array<{
  key: NutritionAnalyteKey;
  label: string;
  shortLabel: string;
  sortOrder: number;
  captured: boolean;
}> = [
  { key: "n_no3", label: "N-NO3- / NO3-", shortLabel: "N-NO3", sortOrder: 1, captured: true },
  { key: "p_po4", label: "P-PO4", shortLabel: "P-PO4", sortOrder: 2, captured: true },
  { key: "k", label: "K+", shortLabel: "K", sortOrder: 3, captured: true },
  { key: "ca", label: "Ca2+", shortLabel: "Ca", sortOrder: 4, captured: true },
  { key: "mg", label: "Mg2+ estimado", shortLabel: "Mg", sortOrder: 5, captured: false },
  { key: "na", label: "Na+", shortLabel: "Na", sortOrder: 6, captured: true },
  { key: "ph", label: "pH", shortLabel: "pH", sortOrder: 7, captured: true },
  { key: "ec", label: "CE", shortLabel: "CE", sortOrder: 8, captured: true }
];

export const NUTRITION_CAPTURE_KEYS = NUTRITION_ANALYTES
  .filter((analyte) => analyte.captured)
  .map((analyte) => analyte.key);

export const SAMPLE_TYPE_LABELS: Record<NutritionSampleType, string> = {
  petiole_cell_extract: "Extracto celular de peciolo",
  soil_solution: "Solución de suelo"
};

const INPUT_UNITS: Record<NutritionSampleType, Record<NutritionAnalyteKey, string>> = {
  petiole_cell_extract: {
    n_no3: "ppm NO3-",
    p_po4: "ppm",
    k: "ppm",
    ca: "ppm",
    mg: "ppm estimado",
    na: "ppm",
    ph: "adim.",
    ec: "mS/cm"
  },
  soil_solution: {
    n_no3: "ppm NO3-",
    p_po4: "ppm",
    k: "ppm",
    ca: "ppm",
    mg: "ppm estimado",
    na: "ppm",
    ph: "adim.",
    ec: "mS/cm"
  }
};

const DIAGNOSTIC_UNITS: Record<NutritionSampleType, Record<NutritionAnalyteKey, string>> = {
  petiole_cell_extract: {
    n_no3: "ppm N-NO3-",
    p_po4: "ppm",
    k: "ppm",
    ca: "ppm",
    mg: "ppm",
    na: "ppm",
    ph: "adim.",
    ec: "mS/cm"
  },
  soil_solution: {
    n_no3: "meq/L",
    p_po4: "ppm",
    k: "meq/L",
    ca: "meq/L",
    mg: "meq/L",
    na: "meq/L",
    ph: "adim.",
    ec: "mS/cm"
  }
};

const UNIT_CONVERSIONS: Record<NutritionSampleType, Partial<Record<NutritionAnalyteKey, UnitConversion>>> = {
  petiole_cell_extract: {
    n_no3: {
      inputUnit: "ppm NO3-",
      diagnosticUnit: "ppm N-NO3-",
      factor: 14 / 62,
      conversion: "NO3- a N-NO3-"
    }
  },
  soil_solution: {
    n_no3: {
      inputUnit: "ppm NO3-",
      diagnosticUnit: "meq/L",
      factor: 1 / 62,
      conversion: "ppm NO3- a meq/L NO3-"
    },
    k: {
      inputUnit: "ppm",
      diagnosticUnit: "meq/L",
      factor: 1 / 39.09,
      conversion: "ppm K+ a meq/L K+"
    },
    ca: {
      inputUnit: "ppm",
      diagnosticUnit: "meq/L",
      factor: 1 / 20.04,
      conversion: "ppm Ca2+ a meq/L Ca2+"
    },
    na: {
      inputUnit: "ppm",
      diagnosticUnit: "meq/L",
      factor: 1 / 22.99,
      conversion: "ppm Na+ a meq/L Na+"
    }
  }
};

function analyteLabel(key: NutritionAnalyteKey) {
  return NUTRITION_ANALYTES.find((analyte) => analyte.key === key)?.label ?? key;
}

function sortOrder(key: NutritionAnalyteKey) {
  return NUTRITION_ANALYTES.find((analyte) => analyte.key === key)?.sortOrder ?? 99;
}

function bandedRanges(values: Array<[number, number]>): RangeTemplate[] {
  return DDT_BANDS.map((band, index) => ({
    ...band,
    min: values[index][0],
    max: values[index][1]
  }));
}

function allCycleRange(min: number, max: number): RangeTemplate[] {
  return [{ ddtMin: null, ddtMax: null, min, max }];
}

function makeRanges(
  sampleType: NutritionSampleType,
  analyteKey: NutritionAnalyteKey,
  templates: RangeTemplate[]
): NutritionReferenceRange[] {
  return templates.map((template) => ({
    cropId: INITIAL_CROP_ID,
    sampleType,
    analyteKey,
    analyteLabel: analyteLabel(analyteKey),
    inputUnit: INPUT_UNITS[sampleType][analyteKey],
    diagnosticUnit: DIAGNOSTIC_UNITS[sampleType][analyteKey],
    ddtMin: template.ddtMin ?? null,
    ddtMax: template.ddtMax ?? null,
    min: template.min,
    max: template.max,
    sortOrder: sortOrder(analyteKey)
  }));
}

export const NUTRITION_REFERENCE_RANGES: NutritionReferenceRange[] = [
  ...makeRanges("petiole_cell_extract", "n_no3", bandedRanges([[600, 800], [600, 800], [600, 900], [600, 900], [600, 900]])),
  ...makeRanges("petiole_cell_extract", "p_po4", bandedRanges([[200, 400], [200, 400], [200, 400], [200, 400], [200, 400]])),
  ...makeRanges("petiole_cell_extract", "k", bandedRanges([[3000, 4000], [3500, 4500], [3500, 5000], [3500, 5000], [3500, 5000]])),
  ...makeRanges("petiole_cell_extract", "ca", bandedRanges([[100, 200], [200, 250], [250, 400], [400, 600], [400, 600]])),
  ...makeRanges("petiole_cell_extract", "mg", bandedRanges([[400, 800], [400, 800], [400, 800], [400, 800], [400, 800]])),
  ...makeRanges("petiole_cell_extract", "na", bandedRanges([[0, 150], [0, 150], [0, 150], [0, 150], [0, 150]])),
  ...makeRanges("petiole_cell_extract", "ph", allCycleRange(5.9, 6.3)),
  ...makeRanges("petiole_cell_extract", "ec", allCycleRange(14, 17)),
  ...makeRanges("soil_solution", "n_no3", bandedRanges([[7, 12], [7, 12], [7, 12], [7, 12], [7, 12]])),
  ...makeRanges("soil_solution", "p_po4", bandedRanges([[2, 3], [2, 3], [2, 3], [2, 3], [2, 3]])),
  ...makeRanges("soil_solution", "k", bandedRanges([[3.5, 5], [3.5, 5], [3.5, 5], [3.5, 5], [3.5, 5]])),
  ...makeRanges("soil_solution", "ca", bandedRanges([[8, 10], [8, 10], [8, 10], [8, 10], [8, 10]])),
  ...makeRanges("soil_solution", "mg", bandedRanges([[3, 5], [3, 5], [3, 5], [3, 5], [3, 5]])),
  ...makeRanges("soil_solution", "na", bandedRanges([[0, 5], [0, 5], [0, 5], [0, 5], [0, 5]])),
  ...makeRanges("soil_solution", "ph", allCycleRange(5, 6)),
  ...makeRanges("soil_solution", "ec", allCycleRange(2, 2.5))
];

const OBSERVATION_RULES: Record<NutritionObservationContext, Partial<Record<`${NutritionDiagnosticStatus}|${NutritionDiagnosticStatus}`, string>>> = {
  general: {
    "Bajo|Adecuado": "Posible bloqueo del nutrimento en el suelo o clima desfavorable",
    "Bajo|Alto": "Posible bloqueo del nutrimento en el suelo o clima desfavorable",
    "Adecuado|Bajo": "El cultivo demanda más a este nutrimento (aumentar la dosis)",
    "Alto|Bajo": "El cultivo demanda más a este nutrimento (aumentar la dosis)",
    "Adecuado|Adecuado": "Continuar con el programa de nutrición para este elemento",
    "Alto|Alto": "Continuar con el programa de nutrición para este elemento",
    "Adecuado|Alto": "Continuar con el programa de nutrición para este elemento",
    "Alto|Adecuado": "Continuar con el programa de nutrición para este elemento",
    "Bajo|Bajo": "Aumentar la dosis de fertilización para este nutrimento"
  },
  sodium: {
    "Bajo|Adecuado": "Continuar con el programa nutricional del cultivo",
    "Bajo|Alto": "Aumentar dosis de Ca, Mg o K de acuerdo al balance óptimo de cariones",
    "Adecuado|Bajo": "Continuar con el programa nutricional del cultivo",
    "Alto|Bajo": "Aplicacar foliarmente bioestimulantes para estrés salino",
    "Adecuado|Adecuado": "Continuar con el programa nutricional del cultivo",
    "Alto|Alto": "Aplicacar bioestimulantes para estrés salino  y aumentar dosis de Ca, Mg o K de acuerdo al balance óptimo de cationes",
    "Adecuado|Alto": "Aumentar dosis de Ca, Mg o K de acuerdo al balance óptimo de cationes",
    "Alto|Adecuado": "Aplicacar foliarmente bioestimulantes para estrés salino",
    "Bajo|Bajo": "Continuar con el programa nutricional del cultivo"
  },
  ph: {
    "Bajo|Adecuado": "Suceptibilidad del cultivo a hongos o posible desbalance de cationes",
    "Bajo|Alto": "Suceptibilidad del cultivo a hongos o posible desbalance de cationes. Aplicacar ácido en el riego según concentración de HCO3-",
    "Adecuado|Bajo": "Continuar con el programa nutricional del cultivo",
    "Alto|Bajo": "Suceptibilidad del cultivo a mosca blanca, ácaros o posible desbalance de aniones",
    "Adecuado|Adecuado": "Continuar con el programa nutricional del cultivo",
    "Alto|Alto": "Suceptibilidad del cultivo a mosca blanca, ácaros o posible desbalance de aniones. Aplicacar ácido en el riego según concentración de HCO3-",
    "Adecuado|Alto": "Aplicacar ácido en el riego según concentración de HCO3-",
    "Alto|Adecuado": "Suceptibilidad del cultivo a mosca blanca, ácaros o posible desbalance de aniones",
    "Bajo|Bajo": "Continuar con el programa nutricional del cultivo"
  },
  ec: {
    "Bajo|Adecuado": "Las condiciones ambientales o fitosanitarias pueden  afectar la absorción nutrimental o verificar el estado hídrico del suelo",
    "Bajo|Alto": "Las condiciones ambientales o fitosanitarias pueden afectar la absorción nutrimental, disminuir la dosis de fertilización o verificar el estado hídrico del suelo",
    "Adecuado|Bajo": "Continuar con el programa nutricional del cultivo o aumentar la dosis de fertilización",
    "Alto|Bajo": "Es necesario aumentar la dosis de fertilización y verificar el estado hídrico de la planta",
    "Adecuado|Adecuado": "Continuar con el programa nutricional del cultivo",
    "Alto|Alto": "Es necesario disminuir la dosis de fertilización y verificar el estado hídrico de la planta y el  suelo",
    "Adecuado|Alto": "Es necesario disminuir la dosis de fertilización o verificar el estado hídrico del  suelo",
    "Alto|Adecuado": "Es necesario disminuir la dosis de fertilización y verificar el estado hídrico de la planta",
    "Bajo|Bajo": "Las condiciones ambientales o fitosanitarias pueden afectar la absorción nutrimental o aumenta la dosis de fertilización"
  }
};

export const NUTRITION_OBSERVATION_RULES: NutritionObservationRule[] = Object.entries(OBSERVATION_RULES).flatMap(
  ([observationContext, rules]) =>
    Object.entries(rules).map(([statusPair, observationText]) => {
      const [petioleStatus, soilStatus] = statusPair.split("|") as [NutritionDiagnosticStatus, NutritionDiagnosticStatus];

      return {
        cropId: INITIAL_CROP_ID,
        observationContext: observationContext as NutritionObservationContext,
        petioleStatus,
        soilStatus,
        observationText: observationText ?? ""
      };
    })
);

export function parseNutritionNumber(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nutritionRangeFor(
  cropId: string | null | undefined,
  sampleType: NutritionSampleType,
  analyteKey: NutritionAnalyteKey,
  ddt: number,
  referenceRanges: NutritionReferenceRange[] = NUTRITION_REFERENCE_RANGES
) {
  if (!cropId) return null;

  const ranges = referenceRanges.filter(
    (range) =>
      range.cropId === cropId &&
      range.sampleType === sampleType &&
      range.analyteKey === analyteKey
  );

  return (
    ranges.find((range) => {
      const starts = range.ddtMin === null || ddt >= range.ddtMin;
      const ends = range.ddtMax === null || ddt <= range.ddtMax;
      return starts && ends;
    }) ??
    ranges[0] ??
    null
  );
}

export function diagnosticStatus(value: number, min: number, max: number): NutritionDiagnosticStatus {
  if (value < min) return "Bajo";
  if (value > max) return "Alto";
  return "Adecuado";
}

function observationContext(analyteKey: NutritionAnalyteKey): NutritionObservationContext {
  if (analyteKey === "na") return "sodium";
  if (analyteKey === "ph") return "ph";
  if (analyteKey === "ec") return "ec";
  return "general";
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function meqFromPpm(value: number | null, divisor: number) {
  return value === null ? null : value / divisor;
}

export function nutritionInputUnitFor(sampleType: NutritionSampleType, analyteKey: NutritionAnalyteKey) {
  return UNIT_CONVERSIONS[sampleType][analyteKey]?.inputUnit ?? INPUT_UNITS[sampleType][analyteKey];
}

export function nutritionDiagnosticUnitFor(sampleType: NutritionSampleType, analyteKey: NutritionAnalyteKey) {
  return UNIT_CONVERSIONS[sampleType][analyteKey]?.diagnosticUnit ?? DIAGNOSTIC_UNITS[sampleType][analyteKey];
}

function diagnosticValueFromRaw(sampleType: NutritionSampleType, analyteKey: NutritionAnalyteKey, raw: number) {
  const conversion = UNIT_CONVERSIONS[sampleType][analyteKey];
  const metadata: Record<string, number | boolean | string> = conversion
    ? {
        conversionFactor: round(conversion.factor, 8),
        conversion: conversion.conversion
      }
    : {};

  return {
    value: conversion ? raw * conversion.factor : raw,
    metadata
  };
}

function valueResult(
  cropId: string | null | undefined,
  sampleType: NutritionSampleType,
  analyteKey: NutritionAnalyteKey,
  rawValue: number,
  diagnosticValue: number,
  ddt: number,
  referenceRanges: NutritionReferenceRange[],
  estimated = false,
  metadata: Record<string, number | boolean | string> = {}
): NutritionValueResult | null {
  const range = nutritionRangeFor(cropId, sampleType, analyteKey, ddt, referenceRanges);
  if (!range) return null;

  return {
    sampleType,
    analyteKey,
    analyteLabel: range.analyteLabel,
    rawValue: round(rawValue),
    rawUnit: nutritionInputUnitFor(sampleType, analyteKey),
    diagnosticValue: round(diagnosticValue),
    diagnosticUnit: nutritionDiagnosticUnitFor(sampleType, analyteKey),
    range,
    diagnosticStatus: diagnosticStatus(diagnosticValue, range.min, range.max),
    estimated,
    metadata
  };
}

function calculatePetioleValue(
  cropId: string | null | undefined,
  analyteKey: NutritionAnalyteKey,
  rawValues: NutritionRawValues,
  ddt: number,
  referenceRanges: NutritionReferenceRange[]
) {
  const raw = parseNutritionNumber(rawValues[analyteKey]);

  if (analyteKey === "mg") {
    const k = parseNutritionNumber(rawValues.k);
    const ca = parseNutritionNumber(rawValues.ca);
    const na = parseNutritionNumber(rawValues.na);
    const ec = parseNutritionNumber(rawValues.ec);
    if (k === null || ca === null || na === null || ec === null) return null;

    const kMeq = meqFromPpm(k, 39.09) ?? 0;
    const caMeq = meqFromPpm(ca, 20.04) ?? 0;
    const naMeq = meqFromPpm(na, 22.99) ?? 0;
    const mgMeq = ec * 10 - naMeq - caMeq - kMeq;
    const mgPpm = mgMeq < 0 ? 0 : mgMeq * 12.15;

    return valueResult(cropId, "petiole_cell_extract", analyteKey, mgPpm, mgPpm, ddt, referenceRanges, true, {
      mgMeq: round(mgMeq),
      negativeMg: mgMeq < 0
    });
  }

  if (raw === null) return null;
  const diagnostic = diagnosticValueFromRaw("petiole_cell_extract", analyteKey, raw);
  return valueResult(cropId, "petiole_cell_extract", analyteKey, raw, diagnostic.value, ddt, referenceRanges, false, diagnostic.metadata);
}

function calculateSoilValue(
  cropId: string | null | undefined,
  analyteKey: NutritionAnalyteKey,
  rawValues: NutritionRawValues,
  ddt: number,
  referenceRanges: NutritionReferenceRange[]
) {
  const raw = parseNutritionNumber(rawValues[analyteKey]);

  if (analyteKey === "mg") {
    const ca = parseNutritionNumber(rawValues.ca);
    const na = parseNutritionNumber(rawValues.na);
    const ec = parseNutritionNumber(rawValues.ec);
    if (ca === null || na === null || ec === null) return null;

    const caMeq = meqFromPpm(ca, 20.04) ?? 0;
    const naMeq = meqFromPpm(na, 22.99) ?? 0;
    const mgMeq = ec * 10 - naMeq - caMeq;
    const mgPpm = mgMeq < 0 ? 0 : mgMeq * 12.15;

    return valueResult(cropId, "soil_solution", analyteKey, mgPpm, Math.max(0, mgMeq), ddt, referenceRanges, true, {
      mgMeq: round(mgMeq),
      negativeMg: mgMeq < 0
    });
  }

  if (raw === null) return null;
  const diagnostic = diagnosticValueFromRaw("soil_solution", analyteKey, raw);
  return valueResult(cropId, "soil_solution", analyteKey, raw, diagnostic.value, ddt, referenceRanges, false, diagnostic.metadata);
}

function severityFor(
  petioleStatus: NutritionDiagnosticStatus,
  soilStatus: NutritionDiagnosticStatus
): NutritionSeverity {
  if (petioleStatus === "Adecuado" && soilStatus === "Adecuado") return "baja";
  if (petioleStatus !== "Adecuado" && soilStatus !== "Adecuado") return "alta";
  return "media";
}

export function calculateNutritionMonitoring({
  cropId,
  ddt,
  petioleValues,
  soilValues,
  recommendations = {},
  referenceRanges = NUTRITION_REFERENCE_RANGES,
  observationRules = NUTRITION_OBSERVATION_RULES
}: {
  cropId?: string | null;
  ddt: number;
  petioleValues: NutritionRawValues;
  soilValues: NutritionRawValues;
  recommendations?: Partial<Record<NutritionAnalyteKey, string>>;
  referenceRanges?: NutritionReferenceRange[];
  observationRules?: NutritionObservationRule[];
}): NutritionMonitoringResult {
  const safeDdt = Math.max(0, Math.trunc(ddt || 0));
  const values = NUTRITION_ANALYTES.flatMap((analyte) => {
    const petiole = calculatePetioleValue(cropId, analyte.key, petioleValues, safeDdt, referenceRanges);
    const soil = calculateSoilValue(cropId, analyte.key, soilValues, safeDdt, referenceRanges);
    return [petiole, soil].filter((item): item is NutritionValueResult => Boolean(item));
  }).sort((left, right) => left.range.sortOrder - right.range.sortOrder || left.sampleType.localeCompare(right.sampleType));

  const observations = NUTRITION_ANALYTES.flatMap((analyte) => {
    const petiole = values.find((value) => value.sampleType === "petiole_cell_extract" && value.analyteKey === analyte.key);
    const soil = values.find((value) => value.sampleType === "soil_solution" && value.analyteKey === analyte.key);
    if (!petiole || !soil) return [];

    const context = observationContext(analyte.key);
    const observationText = observationRules.find(
      (rule) =>
        rule.cropId === cropId &&
        rule.observationContext === context &&
        rule.petioleStatus === petiole.diagnosticStatus &&
        rule.soilStatus === soil.diagnosticStatus
    )?.observationText ?? "";

    return [
      {
        analyteKey: analyte.key,
        analyteLabel: analyte.label,
        observationContext: context,
        petioleStatus: petiole.diagnosticStatus,
        soilStatus: soil.diagnosticStatus,
        observationText,
        recommendationText: recommendations[analyte.key] ?? "",
        severity: severityFor(petiole.diagnosticStatus, soil.diagnosticStatus)
      }
    ];
  });

  return {
    values,
    observations,
    complete: observations.length === NUTRITION_ANALYTES.length
  };
}

export function statusTone(status: NutritionDiagnosticStatus) {
  if (status === "Bajo") return "text-[#8A5D1C] bg-[#F6EDD7] border-[#E3D0A8]";
  if (status === "Alto") return "text-[#7B2A2A] bg-[#F7E5E1] border-[#E4C1BA]";
  return "text-app-green bg-app-soft border-[#C8DFC9]";
}

export function sampleValue(
  values: NutritionValueResult[],
  sampleType: NutritionSampleType,
  analyteKey: NutritionAnalyteKey
) {
  return values.find((value) => value.sampleType === sampleType && value.analyteKey === analyteKey) ?? null;
}
