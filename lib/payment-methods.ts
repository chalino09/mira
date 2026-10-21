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
