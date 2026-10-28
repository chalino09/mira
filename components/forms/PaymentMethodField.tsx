"use client";

import { ArrowLeftRight, Banknote, Check, CreditCard, Ellipsis, Plus, WalletCards } from "lucide-react";
import { useId, useState } from "react";
import { paymentMethods, paymentMethodLabel, type HarvestPayment, type PaymentMethod } from "@/lib/payment-methods";
import { Field, FormattedCurrencyInput, SelectInput } from "@/components/forms/FormControls";
import { cn, formatCurrency, parseNumericInput } from "@/lib/utils";

const paymentIcons = { cash: Banknote, transfer: ArrowLeftRight, card: CreditCard, other: Ellipsis };

export function PaymentMethodSummary({ value, payments = [] }: { value?: PaymentMethod; payments?: HarvestPayment[] }) {
  if (payments.length === 2) return <span className="flex flex-wrap gap-x-4 gap-y-2">{payments.map((payment) => {
    const Icon = paymentIcons[payment.method];
    return <span className="inline-flex items-center gap-2 text-sm text-app-muted" key={payment.method}><Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />{paymentMethodLabel(payment.method)} · {formatCurrency(payment.amount)}</span>;
  })}</span>;
  const Icon = value ? paymentIcons[value] : WalletCards;
  return <span className="inline-flex items-center gap-2 text-sm text-app-muted"><Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />{paymentMethodLabel(value)}</span>;
}

export function PaymentMethodField({ defaultValue, defaultPayments = [] }: {
  defaultValue?: PaymentMethod;
  defaultPayments?: HarvestPayment[];
}) {
  const id = useId();
  const [selected, setSelected] = useState<PaymentMethod | "">(defaultPayments[0]?.method ?? defaultValue ?? "");
  const [split, setSplit] = useState(defaultPayments.length === 2);
  const [secondMethod, setSecondMethod] = useState<PaymentMethod>(defaultPayments[1]?.method ?? (defaultValue === "transfer" ? "cash" : "transfer"));
  const [firstAmount, setFirstAmount] = useState(String(defaultPayments[0]?.amount ?? ""));
  const [secondAmount, setSecondAmount] = useState(String(defaultPayments[1]?.amount ?? ""));
  const update = (next: PaymentMethod | "") => {
    if (next === secondMethod) setSecondMethod(paymentMethods.find((method) => method.value !== next)!.value);
    setSelected(next);
    if (!next) setSplit(false);
  };
  const total = (parseNumericInput(firstAmount) ?? 0) + (parseNumericInput(secondAmount) ?? 0);

  return (
    <fieldset aria-describedby={`${id}-hint`} className="min-w-0 sm:col-span-2">
      <legend className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">{split ? "Formas de pago" : "Forma de pago"} <span className="font-normal normal-case tracking-normal">· Opcional</span></legend>
      <input name="splitPayment" type="hidden" value={String(split)} />
      {!split ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
      </div> : <input name="paymentMethod" type="hidden" value={selected} />}
      {split ? (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-app-text">Dividir en dos formas de pago</p>
            <button className="min-h-9 rounded px-1 text-xs font-medium text-app-green underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-green" onClick={() => setSplit(false)} type="button">Usar una sola forma</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-3">
              <Field label="Primera forma de pago">
                <SelectInput aria-label="Primera forma de pago" onChange={(event) => update(event.target.value as PaymentMethod)} value={selected}>
                  {paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </SelectInput>
              </Field>
              <Field label={`Importe en ${paymentMethodLabel(selected).toLocaleLowerCase("es-MX")}`}>
                <FormattedCurrencyInput name="paymentAmount" onChange={(event) => setFirstAmount(event.target.value)} placeholder="$0.00" required value={firstAmount} />
              </Field>
            </div>
            <div className="grid gap-3">
              <Field label="Segunda forma de pago">
                <SelectInput aria-label="Segunda forma de pago" name="secondPaymentMethod" onChange={(event) => setSecondMethod(event.target.value as PaymentMethod)} value={secondMethod}>
                  {paymentMethods.filter((method) => method.value !== selected).map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </SelectInput>
              </Field>
              <Field label={`Importe en ${paymentMethodLabel(secondMethod).toLocaleLowerCase("es-MX")}`}>
                <FormattedCurrencyInput name="secondPaymentAmount" onChange={(event) => setSecondAmount(event.target.value)} placeholder="$0.00" required value={secondAmount} />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-border pt-3 text-sm">
            <span className="text-app-muted">Total entre ambas formas</span>
            <output aria-live="polite" className="font-semibold tabular-nums text-app-green">{formatCurrency(total)}</output>
          </div>
          <p className="text-xs leading-5 text-app-muted">La suma debe coincidir con la venta neta de esta nota.</p>
        </div>
      ) : <button className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium text-app-green underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green" onClick={() => { update(selected || "cash"); setSplit(true); }} type="button"><Plus aria-hidden="true" className="h-4 w-4" />Agregar segunda forma de pago</button>}
      <div className="mt-2 flex min-h-8 items-center justify-between gap-3">
        <p className="text-xs leading-5 text-app-muted" id={`${id}-hint`}>Elegir una forma de pago no marca la venta como pagada.</p>
        {selected ? <button className="min-h-8 shrink-0 rounded px-1 text-xs text-app-green underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green" onClick={() => update("")} type="button">Quitar</button> : null}
      </div>
    </fieldset>
  );
}
