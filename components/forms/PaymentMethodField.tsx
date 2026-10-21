"use client";

import { ArrowLeftRight, Banknote, Check, CreditCard, Ellipsis, WalletCards } from "lucide-react";
import { useId, useState } from "react";
import { paymentMethods, paymentMethodLabel, type PaymentMethod } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

const paymentIcons = { cash: Banknote, transfer: ArrowLeftRight, card: CreditCard, other: Ellipsis };

export function PaymentMethodSummary({ value }: { value?: PaymentMethod }) {
  const Icon = value ? paymentIcons[value] : WalletCards;
  return <span className="inline-flex items-center gap-2 text-sm text-app-muted"><Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />{paymentMethodLabel(value)}</span>;
}

export function PaymentMethodField({ defaultValue, value, onChange }: {
  defaultValue?: PaymentMethod;
  value?: PaymentMethod | "";
  onChange?: (value: PaymentMethod | "") => void;
}) {
  const id = useId();
  const [localValue, setLocalValue] = useState<PaymentMethod | "">(defaultValue ?? "");
  const selected = value ?? localValue;
  const update = (next: PaymentMethod | "") => { setLocalValue(next); onChange?.(next); };

  return (
    <fieldset aria-describedby={`${id}-hint`} className="min-w-0 sm:col-span-2">
      <legend className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Forma de pago <span className="font-normal normal-case tracking-normal">· Opcional</span></legend>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {paymentMethods.map(({ value: method, label }) => {
          const Icon = paymentIcons[method];
          const active = selected === method;
          return (
            <label className="relative min-w-0 cursor-pointer" key={method}>
              <input checked={active} className="peer sr-only" name="paymentMethod" onChange={() => update(method)} type="radio" value={method} />
              <span className={cn("flex min-h-[88px] flex-col items-start justify-center gap-3 rounded-xl border px-3 py-3 text-sm transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-app-green peer-disabled:cursor-not-allowed peer-disabled:opacity-50", active ? "border-app-green bg-app-soft font-medium text-app-green" : "border-app-border bg-white text-app-text hover:border-app-green/40 hover:bg-app-sidebar")}>
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.5} />
                {label}
                {active ? <Check aria-hidden="true" className="absolute right-3 top-3 h-4 w-4" /> : null}
              </span>
            </label>
          );
        })}
      </div>
      <div className="mt-2 flex min-h-8 items-center justify-between gap-3">
        <p className="text-xs leading-5 text-app-muted" id={`${id}-hint`}>Elegir una forma de pago no marca la venta como pagada.</p>
        {selected ? <button className="min-h-8 shrink-0 rounded px-1 text-xs text-app-green underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green" onClick={() => update("")} type="button">Quitar</button> : null}
      </div>
    </fieldset>
  );
}
