import assert from "node:assert/strict";
import test from "node:test";
import { harvestPaymentError, harvestPaymentInput, harvestPaymentsFromValue } from "./payment-methods.ts";

function paymentForm(values: Record<string, string>) {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return harvestPaymentInput(form);
}
const split = { splitPayment: "true", paymentMethod: "cash", secondPaymentMethod: "transfer", paymentAmount: "$1,200.50", secondPaymentAmount: "$799.50" };

test("permite efectivo y transferencia por el total neto, incluyendo importes formateados", () => {
  const input = paymentForm(split);
  assert.equal(harvestPaymentError(input, 2000), undefined);
  assert.deepEqual(input.payments, [{ method: "cash", amount: 1200.5 }, { method: "transfer", amount: 799.5 }]);
});
test("conserva las notas con una sola forma de pago u opcional", () => {
  assert.equal(harvestPaymentError(paymentForm({}), 2000), undefined);
  assert.deepEqual(paymentForm({ ...split, splitPayment: "false" }).payments, []);
});
test("rechaza métodos repetidos, faltantes, importes inválidos y sumas diferentes", () => {
  for (const change of [
    { secondPaymentMethod: "cash" }, { paymentMethod: "" }, { secondPaymentMethod: "invalid" },
    { paymentAmount: "0" }, { paymentAmount: "-20" }, { secondPaymentAmount: "" },
    { paymentAmount: "1200.501" }, { secondPaymentAmount: "800" }
  ]) assert.ok(harvestPaymentError(paymentForm({ ...split, ...change }), 2000));
});
test("compara importes en centavos sin errores de punto flotante", () => {
  assert.equal(harvestPaymentError(paymentForm({ ...split, paymentAmount: "0.10", secondPaymentAmount: "0.20" }), 0.3), undefined);
});
test("recupera el desglose guardado y tolera ventas anteriores sin desglose", () => {
  const saved = [{ method: "cash", amount: 1200.5 }, { method: "transfer", amount: 799.5 }];
  assert.deepEqual(harvestPaymentsFromValue(saved), saved);
  assert.deepEqual(harvestPaymentsFromValue(null), []);
  assert.deepEqual(harvestPaymentsFromValue([{ method: "invalid", amount: 5 }, { method: "cash", amount: -5 }]), []);
});
