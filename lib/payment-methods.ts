import { parseNumericInput } from "./utils.ts";

export const paymentMethods = [
  { value: "cash", label: "Efectivo" },
  { value: "transfer", label: "Transferencia" },
  { value: "card", label: "Tarjeta" },
  { value: "other", label: "Otro" }
] as const;

export type PaymentMethod = (typeof paymentMethods)[number]["value"];

export function paymentMethodFromValue(value: unknown): PaymentMethod | undefined {
  return paymentMethods.find((method) => method.value === value)?.value;
}

export function paymentMethodLabel(value: unknown) {
  return paymentMethods.find((method) => method.value === value)?.label ?? "Sin registrar";
}

export type HarvestPayment = { method: PaymentMethod; amount: number };

export function harvestPaymentsFromValue(value: unknown): HarvestPayment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const method = paymentMethodFromValue(item?.method);
    return method && typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount > 0
      ? [{ method, amount: item.amount }] : [];
  });
}

export function harvestPaymentInput(form: FormData) {
  const method = paymentMethodFromValue(form.get("paymentMethod"));
  const secondMethod = paymentMethodFromValue(form.get("secondPaymentMethod"));
  const split = form.get("splitPayment") === "true";
  const payments = split ? [
    { method, amount: parseNumericInput(String(form.get("paymentAmount") ?? "")) ?? 0 },
    { method: secondMethod, amount: parseNumericInput(String(form.get("secondPaymentAmount") ?? "")) ?? 0 }
  ] : [];
  return { method, payments, split };
}

export function harvestPaymentError(input: ReturnType<typeof harvestPaymentInput>, netAmount: number): string | undefined {
  if (!input.split) return;
  if (input.payments.some((payment) => !payment.method)) return "Elige las dos formas de pago.";
  if (input.payments[0].method === input.payments[1].method) return "Elige dos formas de pago diferentes.";
  if (input.payments.some((payment) => !Number.isFinite(payment.amount) || payment.amount <= 0 || Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) > 0.000001)) {
    return "Captura un importe mayor a $0 y con máximo dos decimales para cada forma de pago.";
  }
  if (input.payments.reduce((total, payment) => total + Math.round(payment.amount * 100), 0) !== Math.round(netAmount * 100)) {
    return "La suma de las dos formas de pago debe coincidir con la venta neta.";
  }
}
