import { parseNumericInput } from "./utils.ts";

export type HarvestSaleCalculationLine = {
  quality: "Primera" | "Segunda" | "Tercera";
  boxCount: string | number;
  grossPricePerBox: string | number;
};

function amount(value: string | number | null | undefined) {
  return Math.max(0, parseNumericInput(value) ?? 0);
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateHarvestSale({
  lines,
  commissionPerBox,
  freightPerBox,
  packagingPerBox
}: {
  lines: HarvestSaleCalculationLine[];
  commissionPerBox: string | number;
  freightPerBox: string | number;
  packagingPerBox: string | number;
}) {
  const commission = amount(commissionPerBox);
  const freight = amount(freightPerBox);
  const packaging = amount(packagingPerBox);
  const deductionPerBox = commission + freight + packaging;
  const normalizedLines = lines.map((line) => {
    const boxCount = amount(line.boxCount);
    const grossPricePerBox = amount(line.grossPricePerBox);
    const grossAmount = money(boxCount * grossPricePerBox);
    const netAmount = money(boxCount * Math.max(0, grossPricePerBox - deductionPerBox));
    return { ...line, boxCount, grossPricePerBox, grossAmount, netAmount };
  });
  const soldBoxes = normalizedLines.reduce((total, line) => total + line.boxCount, 0);
  const grossAmount = money(normalizedLines.reduce((total, line) => total + line.grossAmount, 0));
  const commissionAmount = money(soldBoxes * commission);
  const freightAmount = money(soldBoxes * freight);
  const packagingAmount = money(soldBoxes * packaging);
  const netAmount = money(grossAmount - commissionAmount - freightAmount - packagingAmount);

  return {
    lines: normalizedLines,
    soldBoxes,
    grossAmount,
    commissionAmount,
    freightAmount,
    packagingAmount,
    netAmount,
    isValid: normalizedLines.every((line) => line.grossPricePerBox >= deductionPerBox) && netAmount >= 0
  };
}
