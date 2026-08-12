import { formatCurrency, formatNumber, parseNumericInput } from "./utils.ts";

export type HarvestCaptureValues = {
  boxCount: number;
  boxWeightKg: number;
  kilograms: number;
  firstQuality: number;
  secondQuality: number;
  thirdQuality: number;
  merma: number;
  firstQualityBoxes: number;
  secondQualityBoxes: number;
  thirdQualityBoxes: number;
  mermaBoxes: number;
  firstQualityPrice: number;
  secondQualityPrice: number;
  thirdQualityPrice: number;
  estimatedPrice: number;
  estimatedRevenue: number;
};

export type HarvestBoxReconciliation = {
  classifiedBoxes: number;
  difference: number;
  isBalanced: boolean;
  message: string;
};

function boxesLabel(value: number) {
  return `${formatNumber(value)} ${Math.abs(value) === 1 ? "caja" : "cajas"}`;
}

export function reconcileHarvestBoxes({
  boxCount,
  firstQualityBoxes,
  secondQualityBoxes,
  thirdQualityBoxes,
  mermaBoxes
}: Pick<HarvestCaptureValues,
  | "boxCount"
  | "firstQualityBoxes"
  | "secondQualityBoxes"
  | "thirdQualityBoxes"
  | "mermaBoxes"
>): HarvestBoxReconciliation {
  const classifiedBoxes = firstQualityBoxes + secondQualityBoxes + thirdQualityBoxes + mermaBoxes;
  const difference = classifiedBoxes - boxCount;
  const isBalanced = boxCount > 0 && Math.abs(difference) < 0.000001;

  if (boxCount <= 0) {
    return {
      classifiedBoxes,
      difference,
      isBalanced: false,
      message: "Captura una cantidad mayor a cero en Cajas totales."
    };
  }

  if (difference > 0) {
    return {
      classifiedBoxes,
      difference,
      isBalanced,
      message: `Reduce ${boxesLabel(difference)}. Las calidades suman ${boxesLabel(classifiedBoxes)} y el total es ${boxesLabel(boxCount)}.`
    };
  }

  if (difference < 0) {
    return {
      classifiedBoxes,
      difference,
      isBalanced,
      message: `Clasifica ${boxesLabel(Math.abs(difference))} más. Las calidades suman ${boxesLabel(classifiedBoxes)} de ${boxesLabel(boxCount)}.`
    };
  }

  return {
    classifiedBoxes,
    difference,
    isBalanced,
    message: `${boxesLabel(classifiedBoxes)} clasificadas.`
  };
}

function formNumber(form: FormData, key: string) {
  return parseNumericInput(String(form.get(key) ?? "")) ?? 0;
}

export function harvestValuesFromForm(form: FormData): HarvestCaptureValues {
  const boxWeightKg = formNumber(form, "boxWeightKg") || 20;
  const firstQualityBoxes = formNumber(form, "firstQualityBoxes");
  const secondQualityBoxes = formNumber(form, "secondQualityBoxes");
  const thirdQualityBoxes = formNumber(form, "thirdQualityBoxes");
  const mermaBoxes = formNumber(form, "mermaBoxes");
  const qualityBoxTotal = firstQualityBoxes + secondQualityBoxes + thirdQualityBoxes + mermaBoxes;
  const boxCount = formNumber(form, "boxCount") || qualityBoxTotal;
  const firstQualityPrice = formNumber(form, "firstQualityPrice");
  const secondQualityPrice = formNumber(form, "secondQualityPrice");
  const thirdQualityPrice = formNumber(form, "thirdQualityPrice");

  const firstQuality = firstQualityBoxes * boxWeightKg;
  const secondQuality = secondQualityBoxes * boxWeightKg;
  const thirdQuality = thirdQualityBoxes * boxWeightKg;
  const merma = mermaBoxes * boxWeightKg;
  const kilograms = boxCount * boxWeightKg;
  const commercialKg = firstQuality + secondQuality + thirdQuality;
  const estimatedRevenue =
    firstQuality * firstQualityPrice +
    secondQuality * secondQualityPrice +
    thirdQuality * thirdQualityPrice;
  const estimatedPrice = commercialKg ? estimatedRevenue / commercialKg : 0;

  return {
    boxCount,
    boxWeightKg,
    kilograms,
    firstQuality,
    secondQuality,
    thirdQuality,
    merma,
    firstQualityBoxes,
    secondQualityBoxes,
    thirdQualityBoxes,
    mermaBoxes,
    firstQualityPrice,
    secondQualityPrice,
    thirdQualityPrice,
    estimatedPrice,
    estimatedRevenue
  };
}

export function harvestSummary(values: HarvestCaptureValues) {
  return {
    boxes: `${formatNumber(values.boxCount)} cajas`,
    kilograms: `${formatNumber(values.kilograms)} kg`,
    averagePrice: formatCurrency(values.estimatedPrice),
    revenue: formatCurrency(values.estimatedRevenue)
  };
}
