"use client";

import { useMemo, useState } from "react";
import { FormattedNumberInput } from "@/components/forms/FormControls";
import { harvestSummary } from "@/lib/harvest";
import { cn, parseNumericInput } from "@/lib/utils";

type HarvestCaptureFieldsProps = {
  compact?: boolean;
};

function numberValue(value: string) {
  return parseNumericInput(value) ?? 0;
}

export function HarvestCaptureFields({ compact = false }: HarvestCaptureFieldsProps) {
  const [boxCount, setBoxCount] = useState("");
  const [boxWeightKg, setBoxWeightKg] = useState("20");
  const [firstQualityBoxes, setFirstQualityBoxes] = useState("");
  const [secondQualityBoxes, setSecondQualityBoxes] = useState("");
  const [thirdQualityBoxes, setThirdQualityBoxes] = useState("");
  const [mermaBoxes, setMermaBoxes] = useState("");
  const [firstQualityPrice, setFirstQualityPrice] = useState("");
  const [secondQualityPrice, setSecondQualityPrice] = useState("");
  const [thirdQualityPrice, setThirdQualityPrice] = useState("");

  const summary = useMemo(() => {
    const weight = numberValue(boxWeightKg) || 20;
    const firstBoxes = numberValue(firstQualityBoxes);
    const secondBoxes = numberValue(secondQualityBoxes);
    const thirdBoxes = numberValue(thirdQualityBoxes);
    const mermaBoxTotal = numberValue(mermaBoxes);
    const qualityBoxTotal = firstBoxes + secondBoxes + thirdBoxes + mermaBoxTotal;
    const totalBoxes = numberValue(boxCount) || qualityBoxTotal;
    const firstKg = firstBoxes * weight;
    const secondKg = secondBoxes * weight;
    const thirdKg = thirdBoxes * weight;
    const commercialKg = firstKg + secondKg + thirdKg;
    const revenue =
      firstKg * numberValue(firstQualityPrice) +
      secondKg * numberValue(secondQualityPrice) +
      thirdKg * numberValue(thirdQualityPrice);

    return harvestSummary({
      boxCount: totalBoxes,
      boxWeightKg: weight,
      kilograms: totalBoxes * weight,
      firstQuality: firstKg,
      secondQuality: secondKg,
      thirdQuality: thirdKg,
      merma: mermaBoxTotal * weight,
      firstQualityBoxes: firstBoxes,
      secondQualityBoxes: secondBoxes,
      thirdQualityBoxes: thirdBoxes,
      mermaBoxes: mermaBoxTotal,
      firstQualityPrice: numberValue(firstQualityPrice),
      secondQualityPrice: numberValue(secondQualityPrice),
      thirdQualityPrice: numberValue(thirdQualityPrice),
      estimatedPrice: commercialKg ? revenue / commercialKg : 0,
      estimatedRevenue: revenue
    });
  }, [
    boxCount,
    boxWeightKg,
    firstQualityBoxes,
    secondQualityBoxes,
    thirdQualityBoxes,
    mermaBoxes,
    firstQualityPrice,
    secondQualityPrice,
    thirdQualityPrice
  ]);

  const qualityFields = [
    {
      key: "first",
      title: "1ra",
      boxesName: "firstQualityBoxes",
      boxesValue: firstQualityBoxes,
      setBoxes: setFirstQualityBoxes,
      priceName: "firstQualityPrice",
      priceValue: firstQualityPrice,
      setPrice: setFirstQualityPrice
    },
    {
      key: "second",
      title: "2da",
      boxesName: "secondQualityBoxes",
      boxesValue: secondQualityBoxes,
      setBoxes: setSecondQualityBoxes,
      priceName: "secondQualityPrice",
      priceValue: secondQualityPrice,
      setPrice: setSecondQualityPrice
    },
    {
      key: "third",
      title: "3ra",
      boxesName: "thirdQualityBoxes",
      boxesValue: thirdQualityBoxes,
      setBoxes: setThirdQualityBoxes,
      priceName: "thirdQualityPrice",
      priceValue: thirdQualityPrice,
      setPrice: setThirdQualityPrice
    }
  ];

  return (
    <section className="grid gap-5 sm:col-span-2">
      <div className="grid gap-3 sm:grid-cols-[1fr_0.55fr]">
        <label className="grid gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Cajas totales</span>
          <FormattedNumberInput
            min={0}
            name="boxCount"
            onChange={(event) => setBoxCount(event.target.value)}
            placeholder="500"
            required
            value={boxCount}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Kg/caja</span>
          <FormattedNumberInput
            min={0}
            name="boxWeightKg"
            onChange={(event) => setBoxWeightKg(event.target.value)}
            required
            value={boxWeightKg}
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {qualityFields.map((field) => (
          <div key={field.key} className="border-t border-app-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">{field.title}</p>
            <div className="mt-3 grid gap-2">
              <FormattedNumberInput
                aria-label={`Cajas ${field.title}`}
                min={0}
                name={field.boxesName}
                onChange={(event) => field.setBoxes(event.target.value)}
                placeholder="Cajas"
                value={field.boxesValue}
              />
              <FormattedNumberInput
                aria-label={`Precio ${field.title}`}
                min={0}
                name={field.priceName}
                onChange={(event) => field.setPrice(event.target.value)}
                placeholder="Precio/kg"
                value={field.priceValue}
              />
            </div>
          </div>
        ))}
        <div className="border-t border-app-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Merma</p>
          <div className="mt-3 grid gap-2">
            <FormattedNumberInput
              aria-label="Cajas merma"
              min={0}
              name="mermaBoxes"
              onChange={(event) => setMermaBoxes(event.target.value)}
              placeholder="Cajas"
              value={mermaBoxes}
            />
            <div className="flex h-11 items-center border border-app-border bg-app-sidebar px-3 text-sm text-app-muted">
              Sin precio
            </div>
          </div>
        </div>
      </div>

      <div className={cn(
        "grid gap-3 border-y border-app-border py-4",
        compact ? "sm:grid-cols-3" : "sm:grid-cols-4"
      )}>
        <SummaryItem label="Cajas" value={summary.boxes} />
        <SummaryItem label="Kilos" value={summary.kilograms} />
        <SummaryItem label="Prom. kg" value={summary.averagePrice} />
        {!compact ? <SummaryItem label="Estimado" value={summary.revenue} /> : null}
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">{label}</p>
      <p className="mt-1 text-lg font-medium text-app-text">{value}</p>
    </div>
  );
}
