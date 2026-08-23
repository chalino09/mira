"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FormattedNumberInput } from "@/components/forms/FormControls";
import { harvestPriceOutlierMessage, harvestSummary, reconcileHarvestBoxes, type HarvestPriceReferences } from "@/lib/harvest";
import { cn, parseNumericInput } from "@/lib/utils";

type HarvestCaptureFieldsProps = {
  compact?: boolean;
  showPrices?: boolean;
  initialValues?: Partial<{
    boxCount: number;
    boxWeightKg: number;
    firstQualityBoxes: number;
    secondQualityBoxes: number;
    thirdQualityBoxes: number;
    mermaBoxes: number;
    firstQualityPrice: number;
    secondQualityPrice: number;
    thirdQualityPrice: number;
  }>;
  priceReferences?: HarvestPriceReferences;
};

function numberValue(value: string) {
  return parseNumericInput(value) ?? 0;
}

export function HarvestCaptureFields({ compact = false, showPrices = true, initialValues, priceReferences }: HarvestCaptureFieldsProps) {
  const reconciliationId = useId();
  const boxCountRef = useRef<HTMLInputElement>(null);
  const [boxCount, setBoxCount] = useState(initialValues?.boxCount?.toString() ?? "");
  const [boxWeightKg, setBoxWeightKg] = useState(initialValues?.boxWeightKg?.toString() ?? "20");
  const [firstQualityBoxes, setFirstQualityBoxes] = useState(initialValues?.firstQualityBoxes?.toString() ?? "");
  const [secondQualityBoxes, setSecondQualityBoxes] = useState(initialValues?.secondQualityBoxes?.toString() ?? "");
  const [thirdQualityBoxes, setThirdQualityBoxes] = useState(initialValues?.thirdQualityBoxes?.toString() ?? "");
  const [mermaBoxes, setMermaBoxes] = useState(initialValues?.mermaBoxes?.toString() ?? "");
  const [firstQualityPrice, setFirstQualityPrice] = useState(initialValues?.firstQualityPrice?.toString() ?? "");
  const [secondQualityPrice, setSecondQualityPrice] = useState(initialValues?.secondQualityPrice?.toString() ?? "");
  const [thirdQualityPrice, setThirdQualityPrice] = useState(initialValues?.thirdQualityPrice?.toString() ?? "");

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
    const revenue =
      firstBoxes * numberValue(firstQualityPrice) +
      secondBoxes * numberValue(secondQualityPrice) +
      thirdBoxes * numberValue(thirdQualityPrice);
    const commercialBoxes = firstBoxes + secondBoxes + thirdBoxes;

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
      estimatedPrice: commercialBoxes ? revenue / commercialBoxes : 0,
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

  const hasBoxValues = [boxCount, firstQualityBoxes, secondQualityBoxes, thirdQualityBoxes, mermaBoxes]
    .some((value) => value.trim() !== "");
  const reconciliation = useMemo(() => reconcileHarvestBoxes({
    boxCount: numberValue(boxCount),
    firstQualityBoxes: numberValue(firstQualityBoxes),
    secondQualityBoxes: numberValue(secondQualityBoxes),
    thirdQualityBoxes: numberValue(thirdQualityBoxes),
    mermaBoxes: numberValue(mermaBoxes)
  }), [boxCount, firstQualityBoxes, secondQualityBoxes, thirdQualityBoxes, mermaBoxes]);
  const reconciliationMessage = hasBoxValues ? reconciliation.message : "";
  const reconciliationInvalid = hasBoxValues && !reconciliation.isBalanced;
  const priceReferenceHistory = priceReferences ?? { first: [], second: [], third: [] };
  const priceWarnings = [
    harvestPriceOutlierMessage(numberValue(firstQualityPrice), "first", priceReferenceHistory),
    harvestPriceOutlierMessage(numberValue(secondQualityPrice), "second", priceReferenceHistory),
    harvestPriceOutlierMessage(numberValue(thirdQualityPrice), "third", priceReferenceHistory)
  ].filter(Boolean);

  useEffect(() => {
    boxCountRef.current?.setCustomValidity(
      reconciliationInvalid ? reconciliation.message : ""
    );
  }, [reconciliation, reconciliationInvalid]);

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
            aria-describedby={reconciliationMessage ? reconciliationId : undefined}
            aria-invalid={reconciliationInvalid ? "true" : undefined}
            className={cn("h-12 text-base", reconciliationInvalid && "border-[#A33A3A] focus:border-[#A33A3A] focus:ring-[#A33A3A]/10")}
            min={0}
            name="boxCount"
            onChange={(event) => setBoxCount(event.target.value)}
            placeholder="500"
            required
            ref={boxCountRef}
            value={boxCount}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Kg/caja</span>
          <FormattedNumberInput
            className="h-12 text-base"
            min={0}
            name="boxWeightKg"
            onChange={(event) => setBoxWeightKg(event.target.value)}
            required
            value={boxWeightKg}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {qualityFields.map((field) => (
          <fieldset key={field.key} className="rounded-xl bg-app-sidebar/65 p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">{field.title} calidad</legend>
            <div className="mt-2 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-app-muted">Cajas</span>
                <FormattedNumberInput
                  aria-describedby={reconciliationMessage ? reconciliationId : undefined}
                  aria-invalid={reconciliationInvalid ? "true" : undefined}
                  className={cn("h-12 text-base", reconciliationInvalid && "border-[#A33A3A] focus:border-[#A33A3A] focus:ring-[#A33A3A]/10")}
                  min={0}
                  name={field.boxesName}
                  onChange={(event) => field.setBoxes(event.target.value)}
                  placeholder="0"
                  value={field.boxesValue}
                />
              </label>
              {showPrices ? (
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-app-muted">Precio por caja</span>
                  <FormattedNumberInput
                    className="h-12 text-base"
                    min={0}
                    name={field.priceName}
                    onChange={(event) => field.setPrice(event.target.value)}
                    placeholder="$0.00"
                    value={field.priceValue}
                  />
                </label>
              ) : null}
            </div>
          </fieldset>
        ))}
        <fieldset className="rounded-xl bg-app-sidebar/65 p-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Merma</legend>
          <div className="mt-2 grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-app-muted">Cajas</span>
              <FormattedNumberInput
                aria-describedby={reconciliationMessage ? reconciliationId : undefined}
                aria-invalid={reconciliationInvalid ? "true" : undefined}
                className={cn("h-12 text-base", reconciliationInvalid && "border-[#A33A3A] focus:border-[#A33A3A] focus:ring-[#A33A3A]/10")}
                min={0}
                name="mermaBoxes"
                onChange={(event) => setMermaBoxes(event.target.value)}
                placeholder="0"
                value={mermaBoxes}
              />
            </label>
            {showPrices ? (
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-app-muted">Precio por caja</span>
                <div className="flex h-12 items-center rounded-xl border border-app-border bg-white/55 px-3 text-sm text-app-muted">No aplica</div>
              </div>
            ) : null}
          </div>
        </fieldset>
      </div>

      <p
        aria-live="polite"
        className={cn(
          "min-h-5 text-xs leading-5",
          reconciliationInvalid ? "text-[#8A2E2E]" : "text-app-muted"
        )}
        id={reconciliationId}
      >
        {reconciliationMessage}
      </p>
      {priceWarnings.length ? (
        <div aria-live="polite" className="grid gap-2 border-l-2 border-[#B7791F] bg-[#FFF8E6] px-3 py-2 text-xs leading-5 text-[#725A1A]">
          {priceWarnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}

      <div className={cn(
        "grid gap-3 border-y border-app-border py-4",
        compact ? "sm:grid-cols-3" : "sm:grid-cols-4"
      )}>
        <SummaryItem label="Cajas" value={summary.boxes} />
        <SummaryItem label="Kilos" value={summary.kilograms} />
        <SummaryItem label="Precio promedio/caja" value={summary.averagePrice} />
        {!compact ? <SummaryItem label="Monto estimado" value={summary.revenue} /> : null}
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
