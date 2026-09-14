import { formatCurrency, formatNumber, parseNumericInput } from "./utils.ts";

export function formatPricePerBox(value?: number | null) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value ?? 0);
}

export type HarvestCaptureValues = {
  boxCount: number;
  boxWeightKg: number;
  kilograms: number;
  firstQuality: number;
  secondQuality: number;
  thirdQuality: number;
  canica: number;
  papel: number;
  merma: number;
  firstQualityBoxes: number;
  secondQualityBoxes: number;
  thirdQualityBoxes: number;
  canicaBoxes: number;
  papelBoxes: number;
  mermaBoxes: number;
  firstQualityPrice: number;
  secondQualityPrice: number;
  thirdQualityPrice: number;
  canicaPrice: number;
  papelPrice: number;
  estimatedPrice: number;
  estimatedRevenue: number;
};

export type HarvestBoxReconciliation = {
  classifiedBoxes: number;
  difference: number;
  isBalanced: boolean;
  message: string;
};

export type HarvestPriceReferences = {
  first: number[];
  second: number[];
  third: number[];
};

function boxesLabel(value: number) {
  return `${formatNumber(value)} ${Math.abs(value) === 1 ? "caja" : "cajas"}`;
}

export function reconcileHarvestBoxes({
  boxCount,
  firstQualityBoxes,
  secondQualityBoxes,
  thirdQualityBoxes,
  canicaBoxes = 0,
  papelBoxes = 0,
  mermaBoxes
}: Pick<HarvestCaptureValues,
  | "boxCount"
  | "firstQualityBoxes"
  | "secondQualityBoxes"
  | "thirdQualityBoxes"
  | "mermaBoxes"
> & Partial<Pick<HarvestCaptureValues, "canicaBoxes" | "papelBoxes">>): HarvestBoxReconciliation {
  const classifiedBoxes = firstQualityBoxes + secondQualityBoxes + thirdQualityBoxes + canicaBoxes + papelBoxes + mermaBoxes;
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
  const canicaBoxes = formNumber(form, "canicaBoxes");
  const papelBoxes = formNumber(form, "papelBoxes");
  const mermaBoxes = formNumber(form, "mermaBoxes");
  const qualityBoxTotal = firstQualityBoxes + secondQualityBoxes + thirdQualityBoxes + canicaBoxes + papelBoxes + mermaBoxes;
  const boxCount = formNumber(form, "boxCount") || qualityBoxTotal;
  const firstQualityPrice = formNumber(form, "firstQualityPrice");
  const secondQualityPrice = formNumber(form, "secondQualityPrice");
  const thirdQualityPrice = formNumber(form, "thirdQualityPrice");
  const canicaPrice = formNumber(form, "canicaPrice");
  const papelPrice = formNumber(form, "papelPrice");

  const firstQuality = firstQualityBoxes * boxWeightKg;
  const secondQuality = secondQualityBoxes * boxWeightKg;
  const thirdQuality = thirdQualityBoxes * boxWeightKg;
  const canica = canicaBoxes * boxWeightKg;
  const papel = papelBoxes * boxWeightKg;
  const merma = mermaBoxes * boxWeightKg;
  const kilograms = boxCount * boxWeightKg;
  const commercialBoxes = firstQualityBoxes + secondQualityBoxes + thirdQualityBoxes + canicaBoxes + papelBoxes;
  const estimatedRevenue =
    firstQualityBoxes * firstQualityPrice +
    secondQualityBoxes * secondQualityPrice +
    thirdQualityBoxes * thirdQualityPrice +
    canicaBoxes * canicaPrice +
    papelBoxes * papelPrice;
  const estimatedPrice = commercialBoxes ? estimatedRevenue / commercialBoxes : 0;

  return {
    boxCount,
    boxWeightKg,
    kilograms,
    firstQuality,
    secondQuality,
    thirdQuality,
    canica,
    papel,
    merma,
    firstQualityBoxes,
    secondQualityBoxes,
    thirdQualityBoxes,
    canicaBoxes,
    papelBoxes,
    mermaBoxes,
    firstQualityPrice,
    secondQualityPrice,
    thirdQualityPrice,
    canicaPrice,
    papelPrice,
    estimatedPrice,
    estimatedRevenue
  };
}

export function harvestSummary(values: HarvestCaptureValues) {
  return {
    boxes: `${formatNumber(values.boxCount)} cajas`,
    kilograms: `${formatNumber(values.kilograms)} kg`,
    averagePrice: formatPricePerBox(values.estimatedPrice),
    revenue: formatCurrency(values.estimatedRevenue)
  };
}

function median(values: number[]) {
  const ordered = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function harvestPriceOutlierMessage(
  price: number,
  quality: "first" | "second" | "third",
  references: HarvestPriceReferences
) {
  const values = references[quality].filter((value) => value > 0);
  if (price <= 0 || values.length < 3) return "";

  const reference = median(values);
  if (!reference || (price < reference * 0.5 || price > reference * 1.75)) {
    const label = quality === "first" ? "primera" : quality === "second" ? "segunda" : "tercera";
    return `El precio de ${label} (${formatPricePerBox(price)}/caja) se aleja del historial (${formatPricePerBox(reference)}/caja). Verifica el dato antes de guardar.`;
  }

  return "";
}
