import { formatCurrency, formatNumber, parseNumericInput } from "@/lib/utils";

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
