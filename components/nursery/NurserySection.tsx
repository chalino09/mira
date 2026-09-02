"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, ChevronDown, CircleDollarSign, Eye, FilterX, Minus, Package, Pencil, Plus, ReceiptText, RefreshCw, Search, Sprout, Trash2, UserRound, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageTitle } from "@/components/ui/PageTitle";
import { SelectionMenu } from "@/components/ui/SelectionMenu";
import { DatePickerInput } from "@/components/forms/DateTimeInputs";
import { Field, FormattedCurrencyInput, FormattedNumberInput, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { appErrorMessage } from "@/lib/errors";
import { calculatedCostAmount } from "@/lib/cost-entry";
import { cn, formatCurrency, parseNumericInput } from "@/lib/utils";

type Nursery = { id: string; name: string };
type Customer = { id: string; display_name: string; phone: string | null; notes: string | null };
type CatalogItem = { id: string; item_kind: "seedling"; name: string; variety: string | null; unit: string; default_unit_price: number | null };
type Sale = {
  id: string;
  folio: number;
  customer_id: string | null;
  occurred_at: string;
  due_date: string | null;
  payment_terms: "cash" | "credit";
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: "paid" | "pending" | "partial" | "overdue" | "cancelled";
  notes: string | null;
};
type SaleReceipt = { id: string; occurred_at: string; payment_method: string; amount: number; notes: string | null; voided_at: string | null; void_reason: string | null };
type LedgerEntry = {
  source_id: string;
  occurred_at: string;
  movement_type: "receipt" | "expense" | "cash_handoff";
  payment_method: string;
  signed_amount: number;
  description: string;
};
type Dialog = "sale" | "expense" | "payment" | "saleDetails" | "editSale" | "voidReceipt" | "cancelSale" | "customer" | "catalog" | null;
type NurseryView = "overview" | "payments" | "customers" | "catalog";
type ExpenseCategory = "payroll" | "seed" | "tray" | "cover" | "substrate" | "supplies" | "transport" | "services" | "maintenance" | "freight" | "other";
type ExpenseDraft = { category: ExpenseCategory; concept: string; amount: string; quantity: string; unit: string; unitPrice: string };
type QuickPeriod = "all" | "today" | "week" | "month" | "30days";

const emptyExpense = (): ExpenseDraft => ({ category: "payroll", concept: "", amount: "", quantity: "", unit: "pieza", unitPrice: "" });
const expenseCategories: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "payroll", label: "Nómina" },
  { value: "seed", label: "Semilla" },
  { value: "tray", label: "Charolas" },
  { value: "cover", label: "Fundas" },
  { value: "substrate", label: "Sustrato" },
  { value: "supplies", label: "Insumos" },
  { value: "transport", label: "Transporte" },
  { value: "freight", label: "Flete" },
  { value: "services", label: "Servicios" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "other", label: "Otro" }
];

const dateKey = (date: Date) => {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
};

const today = () => dateKey(new Date());

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfWeek = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
};

const quickPeriods: Array<{ value: QuickPeriod; label: string }> = [
  { value: "all", label: "Todo" },
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "30days", label: "Últimos 30 días" }
];

const statusCopy: Record<Sale["payment_status"], { label: string; className: string }> = {
  paid: { label: "Pagada", className: "bg-app-soft text-app-green" },
  pending: { label: "Pendiente", className: "bg-amber-50 text-amber-800" },
  partial: { label: "Pago parcial", className: "bg-sky-50 text-sky-800" },
  overdue: { label: "Vencida", className: "bg-red-50 text-red-700" },
  cancelled: { label: "Cancelada", className: "bg-app-sidebar text-app-muted" }
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function Notice({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  return (
    <div aria-live="polite" className={cn("mb-5 rounded-xl px-4 py-3 text-sm", tone === "green" ? "bg-app-soft text-app-green" : "bg-red-50 text-red-700")}>
      {children}
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <article className="border-t border-app-border py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">{label}</p>
          <p className="mt-3 text-3xl font-light tabular-nums text-app-text">{value}</p>
          <p className="mt-2 text-xs leading-5 text-app-muted">{detail}</p>
        </div>
        <Icon aria-hidden="true" className="h-4 w-4 text-app-green" />
      </div>
    </article>
  );
}

export function NurserySection() {
  const organization = useGreenhouseStore((state) => state.organization);
  const [nursery, setNursery] = useState<Nursery | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleReceipts, setSaleReceipts] = useState<SaleReceipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<SaleReceipt | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editSaleTerms, setEditSaleTerms] = useState<"cash" | "credit">("cash");
  const [notice, setNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [saleTerms, setSaleTerms] = useState<"cash" | "credit">("cash");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [expenseRows, setExpenseRows] = useState<ExpenseDraft[]>([emptyExpense()]);
  const [activeView, setActiveView] = useState<NurseryView>("overview");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogItem | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [paymentCustomerQuery, setPaymentCustomerQuery] = useState("");
  const [selectedPaymentCustomerId, setSelectedPaymentCustomerId] = useState<string | null>(null);
  const [paymentScope, setPaymentScope] = useState<"pending" | "paid">("pending");

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;
    setLoading(true);
    const nurseryResponse = await supabase.from("nurseries").select("id,name").eq("company_id", organization.id).eq("is_active", true).order("created_at").limit(1).maybeSingle();
    if (nurseryResponse.error) {
      setNotice({ tone: "red", message: appErrorMessage(nurseryResponse.error, "No se pudo cargar Vivero.") });
      setLoading(false);
      return;
    }
    const currentNursery = nurseryResponse.data as Nursery | null;
    setNursery(currentNursery);
    if (!currentNursery) {
      setCustomers([]); setCatalogItems([]); setSales([]); setLedger([]); setLoading(false); return;
    }
    const [customerResponse, catalogResponse, salesResponse, ledgerResponse] = await Promise.all([
      supabase.from("nursery_customers").select("id,display_name,phone,notes").eq("company_id", organization.id).eq("is_active", true).order("display_name"),
      supabase.from("nursery_catalog_items").select("id,item_kind,name,variety,unit,default_unit_price").eq("nursery_id", currentNursery.id).eq("item_kind", "seedling").eq("is_active", true).order("name"),
      supabase.from("nursery_sale_balances").select("id,folio,customer_id,occurred_at,due_date,payment_terms,total_amount,paid_amount,balance_amount,payment_status,notes").eq("nursery_id", currentNursery.id).order("occurred_at", { ascending: false }).order("folio", { ascending: false }).limit(100),
      supabase.from("nursery_cash_ledger").select("source_id,occurred_at,movement_type,payment_method,signed_amount,description").eq("nursery_id", currentNursery.id).order("occurred_at", { ascending: false }).limit(100)
    ]);
    const error = customerResponse.error || catalogResponse.error || salesResponse.error || ledgerResponse.error;
    if (error) setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo actualizar la información de Vivero.") });
    setCustomers((customerResponse.data ?? []) as Customer[]);
    setCatalogItems((catalogResponse.data ?? []) as CatalogItem[]);
    setSales((salesResponse.data ?? []) as Sale[]);
    setLedger((ledgerResponse.data ?? []) as LedgerEntry[]);
    setLoading(false);
  }, [organization.id]);

  useEffect(() => { void load(); }, [load]);

  const customerNames = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.display_name])), [customers]);
  const isInsideDateRange = (value: string) => (!dateFrom || value >= dateFrom) && (!dateTo || value <= dateTo);
  const filteredSales = sales.filter((sale) =>
    isInsideDateRange(sale.occurred_at)
    && (customerFilter === "all" || sale.customer_id === customerFilter)
    && (statusFilter === "all" ? sale.payment_status !== "cancelled" : sale.payment_status === statusFilter)
  );
  const filteredLedger = ledger.filter((entry) => isInsideDateRange(entry.occurred_at));
  const activeSales = filteredSales.filter((sale) => sale.payment_status !== "cancelled");
  const received = filteredLedger.filter((entry) => entry.movement_type === "receipt").reduce((sum, entry) => sum + Number(entry.signed_amount), 0);
  const expenses = filteredLedger.filter((entry) => entry.movement_type === "expense").reduce((sum, entry) => sum + Math.abs(Number(entry.signed_amount)), 0);
  const receivable = activeSales.reduce((sum, sale) => sum + Number(sale.balance_amount), 0);
  const cashBalance = filteredLedger.filter((entry) => entry.payment_method === "cash").reduce((sum, entry) => sum + Number(entry.signed_amount), 0);
  const hasFilters = Boolean(dateFrom || dateTo || customerFilter !== "all" || statusFilter !== "all");
  const currentDate = new Date();
  const currentDateKey = dateKey(currentDate);
  const quickPeriod: QuickPeriod | "custom" = !dateFrom && !dateTo
    ? "all"
    : dateFrom === currentDateKey && dateTo === currentDateKey
      ? "today"
      : dateFrom === dateKey(startOfWeek(currentDate)) && dateTo === currentDateKey
        ? "week"
        : dateFrom === dateKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12)) && dateTo === currentDateKey
          ? "month"
          : dateFrom === dateKey(addDays(currentDate, -29)) && dateTo === currentDateKey
            ? "30days"
            : "custom";
  const advancedFilterCount = Number(quickPeriod === "custom") + Number(customerFilter !== "all") + Number(statusFilter !== "all");

  const applyQuickPeriod = (period: QuickPeriod) => {
    const now = new Date();
    const end = dateKey(now);
    if (period === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (period === "today") {
      setDateFrom(end);
      setDateTo(end);
    } else if (period === "week") {
      setDateFrom(dateKey(startOfWeek(now)));
      setDateTo(end);
    } else if (period === "month") {
      setDateFrom(dateKey(new Date(now.getFullYear(), now.getMonth(), 1, 12)));
      setDateTo(end);
    } else {
      setDateFrom(dateKey(addDays(now, -29)));
      setDateTo(end);
    }
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setCustomerFilter("all");
    setStatusFilter("all");
  };
  const expenseBatchTotal = useMemo(
    () => expenseRows.reduce((total, row) => total + (parseNumericInput(row.amount) ?? 0), 0),
    [expenseRows]
  );
  const filteredCustomers = customers.filter((customer) => [customer.display_name, customer.phone ?? ""].some((value) => value.toLocaleLowerCase("es-MX").includes(customerQuery.trim().toLocaleLowerCase("es-MX"))));
  const filteredCatalogItems = catalogItems.filter((item) => [item.name, item.variety ?? "", item.unit].some((value) => value.toLocaleLowerCase("es-MX").includes(catalogQuery.trim().toLocaleLowerCase("es-MX"))));
  const paymentCustomers = customers
    .map((customer) => {
      const customerSales = sales.filter((sale) => sale.customer_id === customer.id
        && sale.payment_status !== "cancelled"
        && (paymentScope === "pending" ? Number(sale.balance_amount) > 0 : Number(sale.balance_amount) === 0));
      return {
        ...customer,
        sales: customerSales,
        balance: customerSales.reduce((sum, sale) => sum + Number(sale.balance_amount), 0)
      };
    })
    .filter((customer) => customer.sales.length > 0)
    .filter((customer) => [customer.display_name, customer.phone ?? ""].some((value) => value.toLocaleLowerCase("es-MX").includes(paymentCustomerQuery.trim().toLocaleLowerCase("es-MX"))))
    .sort((left, right) => right.balance - left.balance || left.display_name.localeCompare(right.display_name, "es-MX"));
  const effectivePaymentCustomerId = selectedPaymentCustomerId && paymentCustomers.some((customer) => customer.id === selectedPaymentCustomerId)
    ? selectedPaymentCustomerId
    : paymentCustomers[0]?.id ?? null;
  const paymentCustomer = paymentCustomers.find((customer) => customer.id === effectivePaymentCustomerId) ?? null;
  const paymentCustomerSales = [...(paymentCustomer?.sales ?? [])].sort((left, right) => {
    const leftOpen = Number(left.balance_amount) > 0 ? 0 : 1;
    const rightOpen = Number(right.balance_amount) > 0 ? 0 : 1;
    return leftOpen - rightOpen || right.occurred_at.localeCompare(left.occurred_at) || right.folio - left.folio;
  });

  const initializeNursery = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.from("nurseries").insert({ company_id: organization.id, name: "Vivero", code: "vivero" });
    setSaving(false);
    if (error) return setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo habilitar Vivero.") });
    setNotice({ tone: "green", message: "Vivero quedó listo para registrar movimientos." });
    await load();
  };

  const ensureCustomer = async (name: string) => {
    if (!name.trim()) return null;
    const existing = customers.find((customer) => customer.display_name.localeCompare(name.trim(), "es", { sensitivity: "base" }) === 0);
    if (existing) return existing.id;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase!.from("nursery_customers").insert({ company_id: organization.id, display_name: name.trim() }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };

  const saveSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nursery) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const customerName = String(form.get("customer") ?? "");
    if (saleTerms === "credit" && !customerName.trim()) return setNotice({ tone: "red", message: "Escribe el cliente para guardar una venta a crédito." });
    setSaving(true);
    try {
      const customerId = await ensureCustomer(customerName);
      const quantity = String(form.get("quantity") ?? "").trim();
      const unitPrice = String(form.get("unitPrice") ?? "").trim();
      const { error } = await getSupabaseBrowserClient()!.rpc("create_nursery_sale", {
        target_nursery_id: nursery.id,
        target_customer_id: customerId,
        target_occurred_at: form.get("date"),
        target_sale_kind: form.get("kind"),
        target_payment_terms: saleTerms,
        target_due_date: saleTerms === "credit" ? form.get("dueDate") : null,
        target_notes: String(form.get("notes") ?? "") || null,
        target_lines: [{ description: form.get("description"), quantity: quantity || null, unit: quantity ? form.get("unit") : null, unitPrice: unitPrice || null, lineTotal: amount }],
        target_initial_receipt_amount: saleTerms === "cash" ? amount : Number(form.get("initialPayment") || 0),
        target_payment_method: form.get("paymentMethod"),
        target_source_reference: null,
        target_receipt_source_reference: null
      });
      if (error) throw error;
      setDialog(null);
      setNotice({ tone: "green", message: saleTerms === "cash" ? "Venta y cobro registrados." : "Venta a crédito registrada." });
      await load();
    } catch (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo registrar la venta. Revisa los datos e intenta de nuevo.") });
    } finally { setSaving(false); }
  };

  const saveExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nursery) return;
    const form = new FormData(event.currentTarget);
    if (expenseRows.some((row) => !row.concept.trim() || !parseNumericInput(row.amount))) {
      return setNotice({ tone: "red", message: "Completa el concepto y el monto de cada partida." });
    }
    setSaving(true);
    const { error } = await getSupabaseBrowserClient()!.from("nursery_expenses").insert(expenseRows.map((row) => ({
      company_id: organization.id,
      nursery_id: nursery.id,
      occurred_at: form.get("date"),
      category: row.category,
      amount: parseNumericInput(row.amount),
      quantity: parseNumericInput(row.quantity),
      unit: row.quantity ? row.unit : null,
      unit_price: parseNumericInput(row.unitPrice),
      payment_method: form.get("paymentMethod"),
      supplier: String(form.get("supplier") ?? "") || null,
      notes: row.concept.trim()
    })));
    setSaving(false);
    if (error) return setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo registrar el gasto.") });
    setDialog(null); setExpenseRows([emptyExpense()]);
    setNotice({ tone: "green", message: expenseRows.length === 1 ? "Gasto registrado." : `${expenseRows.length} gastos registrados.` });
    await load();
  };

  const savePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSale) return;
    const form = new FormData(event.currentTarget);
    const amount = parseNumericInput(String(form.get("amount") ?? "")) ?? 0;
    if (amount <= 0 || amount > Number(selectedSale.balance_amount)) {
      return setNotice({ tone: "red", message: `El abono debe ser mayor a $0 y no exceder ${formatCurrency(selectedSale.balance_amount)}.` });
    }
    setSaving(true);
    const { error } = await getSupabaseBrowserClient()!.rpc("record_nursery_payment", {
      target_sale_id: selectedSale.id, target_occurred_at: form.get("date"), target_amount: amount,
      target_payment_method: form.get("paymentMethod"), target_receipt_kind: "sale_payment", target_notes: String(form.get("notes") ?? "") || null,
      target_source_reference: null
    });
    setSaving(false);
    if (error) return setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo registrar el abono. Verifica que no exceda el saldo.") });
    setDialog(null); setSelectedSale(null); setNotice({ tone: "green", message: "Abono registrado." }); await load();
  };

  const loadSaleReceipts = async (saleId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setDetailLoading(true);
    const allocationResponse = await supabase.from("nursery_receipt_allocations").select("receipt_id,amount").eq("sale_id", saleId);
    if (allocationResponse.error) {
      setDetailLoading(false);
      setNotice({ tone: "red", message: appErrorMessage(allocationResponse.error, "No se pudo cargar el historial de abonos.") });
      return;
    }
    const allocations = allocationResponse.data ?? [];
    if (!allocations.length) {
      setSaleReceipts([]);
      setDetailLoading(false);
      return;
    }
    const allocatedAmounts = new Map(allocations.map((allocation) => [allocation.receipt_id as string, Number(allocation.amount)]));
    const receiptResponse = await supabase.from("nursery_receipts").select("id,occurred_at,payment_method,amount,notes,voided_at,void_reason").in("id", Array.from(allocatedAmounts.keys())).order("occurred_at", { ascending: false });
    setDetailLoading(false);
    if (receiptResponse.error) return setNotice({ tone: "red", message: appErrorMessage(receiptResponse.error, "No se pudo cargar el historial de abonos.") });
    setSaleReceipts((receiptResponse.data ?? []).map((receipt) => ({ ...receipt, amount: allocatedAmounts.get(receipt.id) ?? Number(receipt.amount) })) as SaleReceipt[]);
  };

  const openSaleDetails = async (sale: Sale) => {
    setSelectedSale(sale);
    setSaleReceipts([]);
    setDialog("saleDetails");
    await loadSaleReceipts(sale.id);
  };

  const saveSaleCorrection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSale) return;
    const form = new FormData(event.currentTarget);
    const totalAmount = parseNumericInput(String(form.get("totalAmount") ?? "")) ?? 0;
    const dueDate = String(form.get("dueDate") || "").trim() || null;
    if (editSaleTerms === "credit" && !dueDate) {
      return setNotice({ tone: "red", message: "Selecciona la fecha límite de pago." });
    }
    if (totalAmount < Number(selectedSale.paid_amount)) {
      return setNotice({ tone: "red", message: `El total no puede ser menor que lo ya abonado (${formatCurrency(selectedSale.paid_amount)}).` });
    }
    setSaving(true);
    const { error } = await getSupabaseBrowserClient()!.rpc("update_nursery_sale", {
      target_sale_id: selectedSale.id,
      target_customer_id: String(form.get("customerId") || "") || null,
      target_occurred_at: form.get("date"),
      target_payment_terms: editSaleTerms,
      target_due_date: editSaleTerms === "credit" ? dueDate : null,
      target_total_amount: totalAmount,
      target_notes: String(form.get("notes") ?? "") || null
    });
    setSaving(false);
    if (error) return setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo corregir la venta. Revisa el total y los datos de crédito.") });
    setDialog(null); setSelectedSale(null); setNotice({ tone: "green", message: "Venta corregida. Los abonos anteriores se conservaron." }); await load();
  };

  const voidReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReceipt || !selectedSale) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await getSupabaseBrowserClient()!.rpc("void_nursery_receipt", { target_receipt_id: selectedReceipt.id, target_reason: form.get("reason") });
    setSaving(false);
    if (error) return setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo anular el abono.") });
    const saleId = selectedSale.id;
    setSelectedReceipt(null);
    setNotice({ tone: "green", message: "Abono anulado. El saldo de la venta fue actualizado." });
    await load();
    const { data: refreshedSale } = await getSupabaseBrowserClient()!.from("nursery_sale_balances").select("id,folio,customer_id,occurred_at,due_date,payment_terms,total_amount,paid_amount,balance_amount,payment_status,notes").eq("id", saleId).single();
    if (refreshedSale) setSelectedSale(refreshedSale as Sale);
    setDialog("saleDetails");
    await loadSaleReceipts(saleId);
  };

  const cancelSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSale) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const { error } = await getSupabaseBrowserClient()!.rpc("cancel_nursery_sale", {
      target_sale_id: selectedSale.id,
      target_reason: form.get("reason")
    });
    setSaving(false);
    if (error) {
      const message = String(error.message ?? "").includes("nursery_sale_has_active_receipts")
        ? "Anula primero los abonos activos de esta venta."
        : appErrorMessage(error, "No se pudo anular la venta.");
      return setNotice({ tone: "red", message });
    }
    setDialog(null);
    setSelectedSale(null);
    setSaleReceipts([]);
    setNotice({ tone: "green", message: "Venta anulada." });
    await load();
  };

  const saveCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = { company_id: organization.id, display_name: String(form.get("name")).trim(), phone: String(form.get("phone") ?? "").trim() || null, notes: String(form.get("notes") ?? "").trim() || null };
    setSaving(true);
    const request = selectedCustomer
      ? getSupabaseBrowserClient()!.from("nursery_customers").update(values).eq("id", selectedCustomer.id)
      : getSupabaseBrowserClient()!.from("nursery_customers").insert(values);
    const { error } = await request;
    setSaving(false);
    if (error) return setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo guardar el cliente.") });
    setDialog(null); setSelectedCustomer(null); setNotice({ tone: "green", message: selectedCustomer ? "Cliente actualizado." : "Cliente agregado." }); await load();
  };

  const saveCatalogItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nursery) return;
    const form = new FormData(event.currentTarget);
    const price = String(form.get("price") ?? "").trim();
    const values = { company_id: organization.id, nursery_id: nursery.id, item_kind: "seedling", name: String(form.get("name")).trim(), variety: String(form.get("variety") ?? "").trim() || null, unit: form.get("unit"), default_unit_price: price ? Number(price) : null };
    setSaving(true);
    const request = selectedCatalogItem
      ? getSupabaseBrowserClient()!.from("nursery_catalog_items").update(values).eq("id", selectedCatalogItem.id)
      : getSupabaseBrowserClient()!.from("nursery_catalog_items").insert(values);
    const { error } = await request;
    setSaving(false);
    if (error) return setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo guardar el producto.") });
    setDialog(null); setSelectedCatalogItem(null); setNotice({ tone: "green", message: selectedCatalogItem ? "Plántula actualizada." : "Plántula agregada al catálogo." }); await load();
  };

  if (loading) return <section aria-busy="true" aria-label="Cargando Vivero" className="animate-pulse py-10"><div className="h-12 max-w-xl bg-app-border" /><div className="mt-10 grid gap-4 md:grid-cols-4">{[0,1,2,3].map((item) => <div className="h-28 bg-app-border" key={item} />)}</div></section>;

  if (!nursery) return (
    <section className="py-10">
      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
      <EmptyState icon={Sprout} title="Configura el vivero para registrar ventas, créditos, abonos y gastos." />
      <div className="mt-5 flex justify-center"><Button disabled={saving} onClick={initializeNursery} variant="primary">{saving ? "Configurando…" : "Configurar vivero"}</Button></div>
    </section>
  );

  return (
    <section>
      <header className="mb-8 border-b border-app-border pb-7 pt-8 md:pt-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div><MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" /><PageTitle>Vivero</PageTitle><p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">Control de ventas de plántula, dinero recibido, créditos y gastos del vivero.</p></div>
          <div className="flex flex-wrap gap-2">
            {activeView === "overview" ? <><Button icon={<ReceiptText className="h-4 w-4" />} onClick={() => { setSaleTerms("cash"); setDialog("sale"); }} variant="primary">Registrar venta</Button><Button icon={<Plus className="h-4 w-4" />} onClick={() => { setExpenseRows([emptyExpense()]); setDialog("expense"); }}>Registrar gastos</Button></> : null}
            {activeView === "customers" ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setSelectedCustomer(null); setDialog("customer"); }} variant="primary">Agregar cliente</Button> : null}
            {activeView === "catalog" ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setSelectedCatalogItem(null); setDialog("catalog"); }} variant="primary">Agregar plántula</Button> : null}
            <Button aria-label="Actualizar Vivero" className="w-11 px-0" icon={<RefreshCw className="h-4 w-4" />} onClick={load} variant="ghost" />
          </div>
        </div>
      </header>
      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}

      <nav aria-label="Secciones de Vivero" className="mb-6 overflow-x-auto border-b border-app-border">
        <div className="flex min-w-max gap-1">
          {([{ id: "overview", label: "Resumen" }, { id: "payments", label: "Abonos" }, { id: "customers", label: "Clientes" }, { id: "catalog", label: "Catálogo" }] as const).map((view) => (
            <button aria-current={activeView === view.id ? "page" : undefined} className={cn("min-h-11 border-b-2 px-4 text-sm font-medium transition-[border-color,color]", activeView === view.id ? "border-app-green text-app-text" : "border-transparent text-app-muted hover:text-app-text")} key={view.id} onClick={() => setActiveView(view.id)} type="button">{view.label}</button>
          ))}
        </div>
      </nav>

      {activeView === "overview" ? <>
      <section aria-labelledby="nursery-filters-title" className="mb-6 rounded-2xl bg-app-sidebar p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted" id="nursery-filters-title">Filtrar información</h2>
          <div className="flex flex-wrap items-center gap-2">
            {hasFilters ? <Button className="h-10 min-h-10 px-3 text-xs" icon={<FilterX aria-hidden="true" className="h-3.5 w-3.5" />} onClick={clearFilters} variant="ghost">Limpiar</Button> : null}
            <button
              aria-controls="nursery-advanced-filters"
              aria-expanded={advancedFiltersOpen}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-app-border bg-white px-3 text-xs font-medium text-app-text transition-[background-color,border-color,color] hover:border-app-green/40 hover:bg-app-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
              onClick={() => setAdvancedFiltersOpen((current) => !current)}
              type="button"
            >
              Filtros avanzados{advancedFilterCount ? ` (${advancedFilterCount})` : ""}
              <ChevronDown aria-hidden="true" className={cn("h-4 w-4 text-app-muted transition-transform duration-150", advancedFiltersOpen && "rotate-180")} />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Periodo</p>
          <div aria-label="Periodo rápido" className="flex flex-wrap gap-2" role="group">
            {quickPeriods.map((period) => {
              const active = quickPeriod === period.value;
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "min-h-10 rounded-xl border px-3 text-sm font-medium transition-[background-color,border-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green",
                    active
                      ? "border-app-green bg-app-green text-white shadow-sm"
                      : "border-app-border bg-white text-app-muted hover:border-app-green/40 hover:text-app-text"
                  )}
                  key={period.value}
                  onClick={() => applyQuickPeriod(period.value)}
                  type="button"
                >
                  {period.label}
                </button>
              );
            })}
            {quickPeriod === "custom" ? <span className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-sm font-medium text-app-green">Rango personalizado</span> : null}
          </div>
        </div>

        {advancedFiltersOpen ? (
          <div className="mt-5 grid gap-4 border-t border-app-border pt-5 sm:grid-cols-2 xl:grid-cols-4" id="nursery-advanced-filters">
            <Field label="Desde"><DatePickerInput aria-label="Fecha inicial" max={dateTo || undefined} name="nurseryDateFrom" onChange={(event) => setDateFrom(event.target.value)} showQuickActions={false} value={dateFrom} /></Field>
            <Field label="Hasta"><DatePickerInput aria-label="Fecha final" min={dateFrom || undefined} name="nurseryDateTo" onChange={(event) => setDateTo(event.target.value)} showQuickActions={false} value={dateTo} /></Field>
            <Field label="Cliente"><SelectInput name="nurseryCustomer" onChange={(event) => setCustomerFilter(event.target.value)} value={customerFilter}><option value="all">Todos los clientes</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.display_name}</option>)}</SelectInput></Field>
            <Field label="Estado de venta"><SelectInput name="nurseryStatus" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="all">Todos los estados</option><option value="paid">Pagada</option><option value="pending">Pendiente</option><option value="partial">Pago parcial</option><option value="overdue">Vencida</option><option value="cancelled">Cancelada</option></SelectInput></Field>
          </div>
        ) : null}
      </section>

      <div className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
        <Metric detail="Cobros registrados, en efectivo y otros métodos." icon={ArrowDownLeft} label="Dinero recibido" value={formatCurrency(received)} />
        <Metric detail="Compras y pagos realizados por el vivero." icon={ArrowUpRight} label="Gastos" value={formatCurrency(expenses)} />
        <Metric detail="Saldo pendiente de ventas a crédito." icon={CircleDollarSign} label="Por cobrar" value={formatCurrency(receivable)} />
        <Metric detail="Efectivo recibido menos gastos y entregas en efectivo." icon={Banknote} label="Efectivo controlado" value={formatCurrency(cashBalance)} />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section aria-labelledby="sales-title" className="min-w-0"><div className="flex items-end justify-between gap-4 border-b border-app-border pb-3"><div><h2 className="text-lg font-medium text-app-text" id="sales-title">Ventas y créditos</h2><p className="mt-1 text-xs text-app-muted">Saldos vigentes y ventas recientes.</p></div></div>
          {filteredSales.length ? <div>{filteredSales.map((sale) => { const status = statusCopy[sale.payment_status]; return <article className="grid gap-3 border-b border-app-border py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={sale.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-app-text">Venta #{sale.folio}</p><span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold", status.className)}>{status.label}</span></div><p className="mt-1 truncate text-xs text-app-muted">{customerNames.get(sale.customer_id ?? "") ?? "Venta de mostrador"} · {dateLabel(sale.occurred_at)}</p></div><div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end"><div className="me-1 text-right"><p className="font-medium tabular-nums text-app-text">{formatCurrency(sale.total_amount)}</p>{Number(sale.balance_amount) > 0 && sale.payment_status !== "cancelled" ? <p className="text-xs tabular-nums text-app-muted">Saldo {formatCurrency(sale.balance_amount)}</p> : null}</div><Button icon={<Eye aria-hidden="true" className="h-4 w-4" />} onClick={() => void openSaleDetails(sale)} variant="ghost">Ver detalle</Button></div></article>; })}</div> : <EmptyState icon={ReceiptText} title={hasFilters ? "No hay ventas que coincidan con los filtros." : "Aún no hay ventas. Registra la primera para comenzar el control."} />}
        </section>

        <aside aria-labelledby="ledger-title" className="min-w-0"><div className="border-b border-app-border pb-3"><h2 className="text-lg font-medium text-app-text" id="ledger-title">Movimientos de dinero</h2><p className="mt-1 text-xs text-app-muted">Entradas y salidas recientes.</p></div>
          {filteredLedger.length ? <div>{filteredLedger.slice(0, 12).map((entry) => <div className="flex items-start gap-3 border-b border-app-border py-4" key={`${entry.movement_type}-${entry.source_id}`}><span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", Number(entry.signed_amount) >= 0 ? "bg-app-soft text-app-green" : "bg-red-50 text-red-700")}>{Number(entry.signed_amount) >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm text-app-text">{entry.description}</p><p className="mt-1 text-xs text-app-muted">{dateLabel(entry.occurred_at)} · {entry.payment_method === "cash" ? "Efectivo" : entry.payment_method === "transfer" ? "Transferencia" : "Otro"}</p></div><p className={cn("shrink-0 text-sm font-medium tabular-nums", Number(entry.signed_amount) >= 0 ? "text-app-green" : "text-app-text")}>{Number(entry.signed_amount) >= 0 ? "+" : "−"}{formatCurrency(Math.abs(Number(entry.signed_amount)))}</p></div>)}</div> : <EmptyState icon={WalletCards} title={hasFilters ? "No hay movimientos en el rango seleccionado." : "Sin movimientos. Los cobros y gastos aparecerán aquí."} />}
        </aside>
      </div>
      </> : null}

      {activeView === "payments" ? (
        <section aria-labelledby="payments-title">
          <div className="mb-6 grid gap-4 border-b border-app-border pb-5 sm:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] sm:items-end">
            <div><h2 className="text-xl font-medium text-app-text" id="payments-title">Abonos</h2><div aria-label="Estado de las cuentas" className="mt-4 inline-flex rounded-xl bg-app-sidebar p-1" role="group"><button aria-pressed={paymentScope === "pending"} className={cn("min-h-9 rounded-lg px-4 text-sm font-medium transition-[background-color,color,box-shadow]", paymentScope === "pending" ? "bg-white text-app-text shadow-sm" : "text-app-muted hover:text-app-text")} onClick={() => { setPaymentScope("pending"); setSelectedPaymentCustomerId(null); }} type="button">Pendientes</button><button aria-pressed={paymentScope === "paid"} className={cn("min-h-9 rounded-lg px-4 text-sm font-medium transition-[background-color,color,box-shadow]", paymentScope === "paid" ? "bg-white text-app-text shadow-sm" : "text-app-muted hover:text-app-text")} onClick={() => { setPaymentScope("paid"); setSelectedPaymentCustomerId(null); }} type="button">Pagadas</button></div></div>
            <Field label="Buscar cliente"><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" /><TextInput className="pl-9" onChange={(event) => setPaymentCustomerQuery(event.target.value)} placeholder="Nombre o teléfono" type="search" value={paymentCustomerQuery} /></div></Field>
          </div>

          {paymentCustomers.length ? <div className="grid h-[46rem] grid-rows-[12rem_minmax(0,1fr)] gap-6 lg:h-[34rem] lg:grid-cols-[minmax(260px,.7fr)_minmax(0,1.3fr)] lg:grid-rows-1">
            <section aria-labelledby="payment-customers-title" className="min-h-0 min-w-0 rounded-2xl bg-app-sidebar p-2">
              <h3 className="sr-only" id="payment-customers-title">Clientes con movimientos</h3>
              <div className="h-full overflow-y-auto overscroll-contain">
                {paymentCustomers.map((customer) => {
                  const selected = customer.id === effectivePaymentCustomerId;
                  return <button aria-pressed={selected} className={cn("flex min-h-16 w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-[background-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green", selected ? "bg-white text-app-text shadow-sm" : "text-app-muted hover:bg-white/70 hover:text-app-text")} key={customer.id} onClick={() => setSelectedPaymentCustomerId(customer.id)} type="button"><span className="min-w-0"><span className="block truncate text-sm font-medium">{customer.display_name}</span><span className="mt-1 block text-xs">{customer.sales.length} {customer.sales.length === 1 ? "cuenta" : "cuentas"}</span></span><span className={cn("shrink-0 text-sm font-semibold tabular-nums", customer.balance > 0 ? "text-app-text" : "text-app-muted")}>{formatCurrency(customer.balance)}</span></button>;
                })}
              </div>
            </section>

            {paymentCustomer ? <section aria-labelledby="payment-account-title" className="flex h-full min-h-0 min-w-0 flex-col">
              <div className="grid shrink-0 gap-4 rounded-2xl bg-app-sidebar p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:p-5">
                <div className="min-w-0"><h3 className="truncate text-lg font-medium text-app-text" id="payment-account-title">{paymentCustomer.display_name}</h3>{paymentCustomer.phone ? <p className="mt-1 text-xs text-app-muted">{paymentCustomer.phone}</p> : null}</div>
                <div className="sm:text-right"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">Abonado</p><p className="mt-1 font-medium tabular-nums text-app-text">{formatCurrency(paymentCustomer.sales.reduce((sum, sale) => sum + Number(sale.paid_amount), 0))}</p></div>
                <div className="sm:text-right"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-muted">Saldo</p><p className="mt-1 text-xl font-semibold tabular-nums text-app-text">{formatCurrency(paymentCustomer.balance)}</p></div>
              </div>

              <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain pe-2">
                {paymentCustomerSales.map((sale) => { const status = statusCopy[sale.payment_status]; const open = Number(sale.balance_amount) > 0; return <article className="rounded-2xl border border-app-border bg-white p-4 sm:p-5" key={sale.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-medium text-app-text">Venta #{sale.folio}</h4><span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold", status.className)}>{status.label}</span></div><p className="mt-1 text-xs text-app-muted">{dateLabel(sale.occurred_at)}{sale.due_date ? ` · vence ${dateLabel(sale.due_date)}` : ""}</p></div><p className="text-sm font-medium tabular-nums text-app-text">{formatCurrency(sale.total_amount)}</p></div>
                  <dl className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-app-sidebar p-3 sm:grid-cols-3"><div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Total</dt><dd className="mt-1 text-sm font-medium tabular-nums text-app-text">{formatCurrency(sale.total_amount)}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Abonado</dt><dd className="mt-1 text-sm font-medium tabular-nums text-app-text">{formatCurrency(sale.paid_amount)}</dd></div><div className="col-span-2 sm:col-span-1"><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Saldo</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-app-text">{formatCurrency(sale.balance_amount)}</dd></div></dl>
                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button onClick={() => void openSaleDetails(sale)} variant="ghost">Historial</Button>{open ? <Button onClick={() => { setSelectedSale(sale); setDialog("payment"); }} variant="primary">Registrar abono</Button> : <Button onClick={() => { setSelectedSale(sale); setEditSaleTerms("credit"); setDialog("editSale"); }} variant="secondary">Agregar saldo pendiente</Button>}</div>
                </article>; })}
              </div>
            </section> : null}
          </div> : <EmptyState icon={CircleDollarSign} title={paymentCustomerQuery ? "No hay clientes que coincidan con la búsqueda." : paymentScope === "pending" ? "No hay cuentas pendientes." : "No hay cuentas pagadas."} />}
        </section>
      ) : null}

      {activeView === "customers" ? (
        <section aria-labelledby="customers-title">
          <div className="grid gap-4 border-b border-app-border pb-5 sm:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] sm:items-end">
            <div><h2 className="text-xl font-medium text-app-text" id="customers-title">Clientes</h2><p className="mt-1 text-sm text-app-muted">Clientes agregados manualmente o encontrados durante una importación.</p></div>
            <Field label="Buscar clientes"><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" /><TextInput className="pl-9" onChange={(event) => setCustomerQuery(event.target.value)} placeholder="Nombre o teléfono" type="search" value={customerQuery} /></div></Field>
          </div>
          {filteredCustomers.length ? <div>{filteredCustomers.map((customer) => { const customerSales = sales.filter((sale) => sale.customer_id === customer.id && sale.payment_status !== "cancelled"); const balance = customerSales.reduce((sum, sale) => sum + Number(sale.balance_amount), 0); return <article className="grid gap-3 border-b border-app-border py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={customer.id}><div className="min-w-0"><p className="font-medium text-app-text">{customer.display_name}</p><p className="mt-1 truncate text-xs text-app-muted">{customer.phone || "Sin teléfono"}{customer.notes ? ` · ${customer.notes}` : ""}</p></div><div className="sm:text-right"><p className="text-xs text-app-muted">Saldo pendiente</p><p className="mt-1 font-medium tabular-nums text-app-text">{formatCurrency(balance)}</p></div><Button aria-label={`Editar ${customer.display_name}`} className="h-10 min-h-10 w-10 px-0" icon={<Pencil aria-hidden="true" className="h-4 w-4" />} onClick={() => { setSelectedCustomer(customer); setDialog("customer"); }} variant="ghost" /></article>; })}</div> : <EmptyState icon={UserRound} title={customerQuery ? "No hay clientes que coincidan con la búsqueda." : "Aún no hay clientes. Agrégalos manualmente o mediante la importación."} />}
        </section>
      ) : null}

      {activeView === "catalog" ? (
        <section aria-labelledby="catalog-title">
          <div className="grid gap-4 border-b border-app-border pb-5 sm:grid-cols-[minmax(0,1fr)_minmax(240px,360px)] sm:items-end">
            <div><h2 className="text-xl font-medium text-app-text" id="catalog-title">Catálogo de plántulas</h2><p className="mt-1 text-sm text-app-muted">Cultivos, variedades, presentaciones y precios habituales del vivero.</p></div>
            <Field label="Buscar catálogo"><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" /><TextInput className="pl-9" onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Cultivo o variedad" type="search" value={catalogQuery} /></div></Field>
          </div>
          {filteredCatalogItems.length ? <div>{filteredCatalogItems.map((item) => <article className="grid gap-3 border-b border-app-border py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={item.id}><div className="min-w-0"><p className="font-medium text-app-text">{item.name}</p><p className="mt-1 text-xs text-app-muted">{item.variety || "Sin variedad"} · Por {item.unit}</p></div><div className="sm:text-right"><p className="text-xs text-app-muted">Precio habitual</p><p className="mt-1 font-medium tabular-nums text-app-text">{item.default_unit_price == null ? "Sin precio" : formatCurrency(item.default_unit_price)}</p></div><Button aria-label={`Editar ${item.name}`} className="h-10 min-h-10 w-10 px-0" icon={<Pencil aria-hidden="true" className="h-4 w-4" />} onClick={() => { setSelectedCatalogItem(item); setDialog("catalog"); }} variant="ghost" /></article>)}</div> : <EmptyState icon={Package} title={catalogQuery ? "No hay plántulas que coincidan con la búsqueda." : "El catálogo está vacío. Agrega plántulas manualmente o mediante la importación."} />}
        </section>
      ) : null}

      <Modal onClose={() => setDialog(null)} open={dialog === "sale"} panelClassName="sm:max-w-2xl" title="Registrar venta">
        <form className="grid gap-4" onSubmit={saveSale}><div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha"><DatePickerInput aria-label="Fecha de venta" defaultValue={today()} name="date" required /></Field><Field label="Forma de venta"><SelectionMenu ariaLabel="Forma de venta" buttonClassName="h-11 rounded-xl px-3 text-sm font-normal" menuClassName="w-full" onChange={(value) => setSaleTerms(value as "cash" | "credit")} options={[{ value: "cash", label: "Pagada", description: "El dinero ya fue recibido" }, { value: "credit", label: "A crédito", description: "Quedará saldo por cobrar" }]} value={saleTerms} /></Field></div><Field label={saleTerms === "credit" ? "Cliente" : "Cliente (opcional)"}><TextInput autoComplete="off" list="nursery-customers" name="customer" placeholder="Nombre del cliente" /><datalist id="nursery-customers">{customers.map((customer) => <option key={customer.id} value={customer.display_name} />)}</datalist></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Concepto"><TextInput name="description" placeholder="Ej. Plántula de tomate" required /></Field><Field label="Tipo"><SelectInput name="kind"><option value="seedling">Plántula</option><option value="maquila">Maquila</option><option value="seed">Semilla</option><option value="freight">Flete</option><option value="other">Otro</option></SelectInput></Field></div><div className="grid gap-4 sm:grid-cols-3"><Field label="Cantidad real (opcional)"><TextInput inputMode="decimal" min="0.0001" name="quantity" placeholder="Ej. 512" step="0.0001" type="number" /></Field><Field label="Unidad"><SelectInput defaultValue="pieza" name="unit"><option value="pieza">Pieza</option><option value="charola">Charola</option><option value="servicio">Servicio</option><option value="kg">kg</option></SelectInput></Field><Field label="Precio unitario (opcional)"><TextInput inputMode="decimal" min="0" name="unitPrice" placeholder="0.00" step="0.000001" type="number" /></Field></div><Field label="Total recibido o por cobrar"><TextInput inputMode="decimal" min="0.01" name="amount" placeholder="0.00" required step="0.01" type="number" /></Field>{saleTerms === "credit" ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha límite de pago"><DatePickerInput aria-label="Fecha límite de pago" defaultValue={today()} min={today()} name="dueDate" required /></Field><Field label="Abono inicial"><TextInput defaultValue="0" inputMode="decimal" min="0" name="initialPayment" step="0.01" type="number" /></Field></div> : null}<Field label="Método de pago"><SelectInput name="paymentMethod"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otro</option></SelectInput></Field><Field label="Notas (opcional)"><TextArea autoGrow name="notes" placeholder="Detalles de la venta" /></Field><div className="flex justify-end gap-2 pt-2"><Button onClick={() => setDialog(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando…" : "Registrar venta"}</Button></div></form>
      </Modal>

      <Modal onClose={() => setDialog(null)} open={dialog === "expense"} panelClassName="sm:max-w-5xl" title="Registrar gastos">
        <form className="grid gap-5" onSubmit={saveExpense}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fecha"><DatePickerInput aria-label="Fecha de los gastos" defaultValue={today()} name="date" required /></Field>
            <Field label="Método de pago"><SelectInput name="paymentMethod"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otro</option></SelectInput></Field>
            <Field label="Proveedor (opcional)"><TextInput name="supplier" placeholder="Nombre del proveedor" /></Field>
          </div>
          <section aria-labelledby="nursery-expense-items" className="grid gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted" id="nursery-expense-items">Partidas de gasto</h3><p className="mt-1 text-xs leading-5 text-app-muted">Captura el monto o calcula con cantidad y precio unitario.</p></div>
              <Button className="w-full sm:w-auto" icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={() => setExpenseRows((current) => [...current, emptyExpense()])} type="button" variant="ghost">Agregar partida</Button>
            </div>
            {expenseRows.map((row, index) => (
              <fieldset className="grid gap-3 rounded-2xl border border-app-border bg-app-sidebar/35 p-4" key={index}>
                <legend className="px-2 text-xs font-semibold text-app-text">Partida {index + 1}</legend>
                <div className="grid gap-3 lg:grid-cols-[1fr_1.5fr_.75fr_auto]">
                  <Field label="Categoría"><SelectInput aria-label={`Categoría de la partida ${index + 1}`} onChange={(event) => setExpenseRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value as ExpenseCategory } : item))} value={row.category}>{expenseCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</SelectInput></Field>
                  <Field label="Concepto"><TextInput aria-label={`Concepto de la partida ${index + 1}`} onChange={(event) => setExpenseRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, concept: event.target.value } : item))} placeholder="Ej. pago semanal de nómina" required value={row.concept} /></Field>
                  <Field label="Monto"><FormattedNumberInput aria-label={`Monto de la partida ${index + 1}`} min="0.01" onChange={(event) => setExpenseRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} placeholder="$0.00" required step="0.01" value={row.amount} /></Field>
                  <div className="flex items-end justify-end"><Button aria-label={`Quitar partida ${index + 1}`} className="h-11 w-11 px-0" icon={<Minus aria-hidden="true" className="h-4 w-4" />} onClick={() => setExpenseRows((current) => current.length === 1 ? [emptyExpense()] : current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="ghost" /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Cantidad (opcional)"><FormattedNumberInput aria-label={`Cantidad de la partida ${index + 1}`} min="0" onChange={(event) => { const quantity = event.target.value; setExpenseRows((current) => current.map((item, itemIndex) => { if (itemIndex !== index) return item; const calculated = calculatedCostAmount(quantity, item.unitPrice); return { ...item, quantity, amount: calculated === null ? item.amount : String(calculated) }; })); }} placeholder="1" step="0.01" value={row.quantity} /></Field>
                  <Field label="Unidad"><SelectInput aria-label={`Unidad de la partida ${index + 1}`} disabled={!row.quantity} onChange={(event) => setExpenseRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item))} value={row.unit}><option value="pieza">Pieza</option><option value="kg">Kilogramo</option><option value="litro">Litro</option><option value="bulto">Bulto</option><option value="rollo">Rollo</option><option value="charola">Charola</option><option value="jornal">Jornal</option><option value="servicio">Servicio</option></SelectInput></Field>
                  <Field label="Precio unitario (opcional)"><FormattedNumberInput aria-label={`Precio unitario de la partida ${index + 1}`} min="0" onChange={(event) => { const unitPrice = event.target.value; setExpenseRows((current) => current.map((item, itemIndex) => { if (itemIndex !== index) return item; const calculated = calculatedCostAmount(item.quantity, unitPrice); return { ...item, unitPrice, amount: calculated === null ? item.amount : String(calculated) }; })); }} placeholder="$0.00" step="0.01" value={row.unitPrice} /></Field>
                </div>
              </fieldset>
            ))}
            <div className="flex items-center justify-between border-t border-app-border pt-4"><span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Total del registro</span><output className="text-lg font-semibold tabular-nums text-app-text">{formatCurrency(expenseBatchTotal)}</output></div>
          </section>
          <div className="flex justify-end gap-2"><Button onClick={() => setDialog(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando…" : expenseRows.length === 1 ? "Registrar gasto" : `Registrar ${expenseRows.length} gastos`}</Button></div>
        </form>
      </Modal>

      <Modal onClose={() => { setDialog(null); setSelectedCustomer(null); }} open={dialog === "customer"} panelClassName="sm:max-w-lg" title={selectedCustomer ? "Editar cliente" : "Agregar cliente"}>
        <form className="grid gap-4" onSubmit={saveCustomer}>
          <Field label="Nombre"><TextInput autoFocus defaultValue={selectedCustomer?.display_name ?? ""} name="name" placeholder="Nombre del cliente" required /></Field>
          <Field label="Teléfono (opcional)"><TextInput autoComplete="tel" defaultValue={selectedCustomer?.phone ?? ""} inputMode="tel" name="phone" placeholder="Ej. 452 123 4567" type="tel" /></Field>
          <Field label="Notas (opcional)"><TextArea autoGrow defaultValue={selectedCustomer?.notes ?? ""} name="notes" placeholder="Referencia o información útil" /></Field>
          <div className="flex justify-end gap-2 pt-2"><Button onClick={() => { setDialog(null); setSelectedCustomer(null); }} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando…" : selectedCustomer ? "Guardar cambios" : "Agregar cliente"}</Button></div>
        </form>
      </Modal>

      <Modal onClose={() => { setDialog(null); setSelectedCatalogItem(null); }} open={dialog === "catalog"} panelClassName="sm:max-w-xl" title={selectedCatalogItem ? "Editar plántula" : "Agregar plántula"}>
        <form className="grid gap-4" onSubmit={saveCatalogItem}>
          <Field label="Cultivo o plántula"><TextInput autoFocus defaultValue={selectedCatalogItem?.name ?? ""} name="name" placeholder="Ej. Tomate" required /></Field>
          <Field label="Variedad (opcional)"><TextInput defaultValue={selectedCatalogItem?.variety ?? ""} name="variety" placeholder="Ej. Saladette" /></Field>
          <Field label="Presentación"><SelectInput defaultValue={selectedCatalogItem?.unit ?? "pieza"} name="unit"><option value="pieza">Pieza</option><option value="charola">Charola</option><option value="millar">Millar</option></SelectInput></Field>
          <Field label="Precio habitual (opcional)"><TextInput defaultValue={selectedCatalogItem?.default_unit_price ?? ""} inputMode="decimal" min="0" name="price" placeholder="0.00" step="0.0001" type="number" /></Field>
          <p className="text-xs leading-5 text-app-muted">Este precio sirve como referencia y podrá cambiarse en cada venta.</p>
          <div className="flex justify-end gap-2 pt-2"><Button onClick={() => { setDialog(null); setSelectedCatalogItem(null); }} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando…" : selectedCatalogItem ? "Guardar cambios" : "Agregar plántula"}</Button></div>
        </form>
      </Modal>

      <Modal onClose={() => { setDialog(null); setSelectedSale(null); setSaleReceipts([]); }} open={dialog === "saleDetails"} panelClassName="sm:max-w-2xl" title={selectedSale ? `Venta #${selectedSale.folio}` : "Detalle de venta"}>
        {selectedSale ? <div className="grid gap-6">
          <div className="grid gap-3 rounded-2xl bg-app-sidebar p-4 sm:grid-cols-3">
            <div><p className="text-xs text-app-muted">Total</p><p className="mt-1 font-medium tabular-nums text-app-text">{formatCurrency(selectedSale.total_amount)}</p></div>
            <div><p className="text-xs text-app-muted">Abonado</p><p className="mt-1 font-medium tabular-nums text-app-text">{formatCurrency(selectedSale.paid_amount)}</p></div>
            <div><p className="text-xs text-app-muted">Saldo pendiente</p><p className="mt-1 font-medium tabular-nums text-app-text">{selectedSale.payment_status === "cancelled" ? "—" : formatCurrency(selectedSale.balance_amount)}</p></div>
          </div>
          <div className="grid gap-1 text-sm"><p className="font-medium text-app-text">{customerNames.get(selectedSale.customer_id ?? "") ?? "Venta de mostrador"}</p><p className="text-app-muted">{dateLabel(selectedSale.occurred_at)}{selectedSale.due_date ? ` · vence ${dateLabel(selectedSale.due_date)}` : ""}</p>{selectedSale.notes ? <p className="mt-2 leading-6 text-app-muted">{selectedSale.notes}</p> : null}</div>
          <section aria-labelledby="sale-payment-history">
            <div className="border-b border-app-border pb-3"><h3 className="font-medium text-app-text" id="sale-payment-history">Historial de abonos</h3></div>
            {detailLoading ? <p aria-live="polite" className="py-6 text-sm text-app-muted">Cargando abonos…</p> : saleReceipts.length ? <div>{saleReceipts.map((receipt) => <div className={cn("grid gap-3 border-b border-app-border py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center", receipt.voided_at && "opacity-60")} key={receipt.id}><div><div className="flex flex-wrap items-center gap-2"><p className={cn("text-sm font-medium text-app-text", receipt.voided_at && "line-through")}>{formatCurrency(receipt.amount)}</p>{receipt.voided_at ? <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">Anulado</span> : null}</div><p className="mt-1 text-xs text-app-muted">{dateLabel(receipt.occurred_at)} · {receipt.payment_method === "cash" ? "Efectivo" : receipt.payment_method === "transfer" ? "Transferencia" : "Otro"}</p>{receipt.notes ? <p className="mt-1 text-xs text-app-muted">{receipt.notes}</p> : null}{receipt.void_reason ? <p className="mt-1 text-xs text-red-700">Motivo: {receipt.void_reason}</p> : null}</div>{!receipt.voided_at ? <Button className="text-red-700 hover:text-red-800" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={() => { setSelectedReceipt(receipt); setDialog("voidReceipt"); }} variant="ghost">Anular abono</Button> : <span />}</div>)}</div> : <p className="py-6 text-sm text-app-muted">Esta venta no tiene abonos registrados.</p>}
          </section>
          {selectedSale.payment_status !== "cancelled" ? <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button className="text-red-700 hover:text-red-800" icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} onClick={() => setDialog("cancelSale")} variant="ghost">Anular venta</Button><Button onClick={() => { setEditSaleTerms(selectedSale.payment_status === "paid" ? "credit" : selectedSale.payment_terms); setDialog("editSale"); }} variant="secondary">{selectedSale.payment_status === "paid" ? "Agregar saldo pendiente" : "Editar cuenta"}</Button></div> : null}
        </div> : null}
      </Modal>

      <Modal onClose={() => setDialog("saleDetails")} open={dialog === "editSale"} panelClassName="sm:max-w-xl" title={selectedSale?.payment_status === "paid" ? "Agregar saldo pendiente" : "Editar cuenta"}>
        {selectedSale ? <form className="grid gap-4" onSubmit={saveSaleCorrection}>
          {selectedSale.payment_status === "paid" ? <>
            <input name="date" type="hidden" value={selectedSale.occurred_at} />
            <input name="customerId" type="hidden" value={selectedSale.customer_id ?? ""} />
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-app-sidebar p-4"><div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Venta</dt><dd className="mt-1 text-sm font-medium text-app-text">#{selectedSale.folio}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Pagado</dt><dd className="mt-1 text-sm font-medium tabular-nums text-app-text">{formatCurrency(selectedSale.paid_amount)}</dd></div></dl>
          </> : <>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha de venta"><DatePickerInput aria-label="Fecha de la venta" defaultValue={selectedSale.occurred_at} name="date" required /></Field><Field label="Forma de venta"><SelectInput onChange={(event) => setEditSaleTerms(event.target.value as "cash" | "credit")} value={editSaleTerms}><option value="cash">Pagada</option><option value="credit">A crédito</option></SelectInput></Field></div>
            <Field label={editSaleTerms === "credit" ? "Cliente" : "Cliente (opcional)"}><SelectInput defaultValue={selectedSale.customer_id ?? ""} name="customerId" required={editSaleTerms === "credit"}><option value="">Venta de mostrador</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.display_name}</option>)}</SelectInput></Field>
          </>}
          <Field label="Total de la venta"><FormattedCurrencyInput autoFocus defaultValue={selectedSale.total_amount} min={selectedSale.paid_amount} name="totalAmount" required step="0.01" /></Field>
          {editSaleTerms === "credit" ? <Field label="Fecha límite de pago"><DatePickerInput aria-label="Fecha límite de pago" defaultValue={selectedSale.due_date ?? ""} min={selectedSale.occurred_at} name="dueDate" required showQuickActions={false} dropUp /></Field> : null}
          <Field label="Notas (opcional)"><TextArea autoGrow defaultValue={selectedSale.notes ?? ""} name="notes" placeholder="Referencia" /></Field>
          <div className="flex justify-end gap-2 pt-2"><Button onClick={() => setDialog("saleDetails")} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando…" : selectedSale.payment_status === "paid" ? "Guardar cuenta" : "Guardar cambios"}</Button></div>
        </form> : null}
      </Modal>

      <Modal onClose={() => { setSelectedReceipt(null); setDialog("saleDetails"); }} open={dialog === "voidReceipt"} panelClassName="sm:max-w-lg" title="Anular abono">
        {selectedReceipt ? <form className="grid gap-4" onSubmit={voidReceipt}><p className="text-sm leading-6 text-app-muted">Se anulará el abono de <strong className="font-semibold text-app-text">{formatCurrency(selectedReceipt.amount)}</strong>. El movimiento seguirá visible en el historial y el saldo pendiente aumentará.</p><Field label="Motivo de la anulación"><TextArea autoFocus autoGrow name="reason" placeholder="Ej. Importe capturado por error" required /></Field><div className="flex justify-end gap-2"><Button onClick={() => { setSelectedReceipt(null); setDialog("saleDetails"); }} type="button" variant="ghost">Cancelar</Button><Button className="border-red-700 bg-red-700 text-white hover:bg-red-800" disabled={saving} icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} type="submit">{saving ? "Anulando…" : "Anular abono"}</Button></div></form> : null}
      </Modal>

      <Modal onClose={() => setDialog("saleDetails")} open={dialog === "cancelSale"} panelClassName="sm:max-w-lg" title={selectedSale ? `Anular venta #${selectedSale.folio}` : "Anular venta"}>
        {selectedSale ? <form className="grid gap-4" onSubmit={cancelSale}><div className="rounded-xl bg-app-sidebar p-4"><p className="text-xs text-app-muted">{customerNames.get(selectedSale.customer_id ?? "") ?? "Venta de mostrador"}</p><p className="mt-1 text-lg font-semibold tabular-nums text-app-text">{formatCurrency(selectedSale.total_amount)}</p></div><Field label="Motivo de la anulación"><TextArea autoFocus autoGrow name="reason" placeholder="Ej. Registro duplicado" required /></Field><div className="flex justify-end gap-2"><Button onClick={() => setDialog("saleDetails")} type="button" variant="ghost">Cancelar</Button><Button className="border-red-700 bg-red-700 text-white hover:bg-red-800" disabled={saving} icon={<Trash2 aria-hidden="true" className="h-4 w-4" />} type="submit">{saving ? "Anulando…" : "Anular venta"}</Button></div></form> : null}
      </Modal>

      <Modal onClose={() => setDialog(null)} open={dialog === "payment"} panelClassName="sm:max-w-lg" title="Registrar abono">{selectedSale ? <form className="grid gap-4" onSubmit={savePayment}><dl className="grid grid-cols-2 gap-3 rounded-xl bg-app-sidebar p-4"><div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Venta</dt><dd className="mt-1 text-sm font-medium text-app-text">#{selectedSale.folio}</dd></div><div><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">Saldo</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-app-text">{formatCurrency(selectedSale.balance_amount)}</dd></div></dl><Field label="Monto"><FormattedCurrencyInput autoFocus name="amount" placeholder="$0.00" required /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Fecha"><DatePickerInput aria-label="Fecha del abono" defaultValue={today()} dropUp name="date" required showQuickActions={false} /></Field><Field label="Método de pago"><SelectInput name="paymentMethod"><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="other">Otro</option></SelectInput></Field></div><Field label="Notas (opcional)"><TextArea autoGrow name="notes" placeholder="Referencia" /></Field><div className="flex justify-end gap-2"><Button onClick={() => setDialog(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">{saving ? "Guardando…" : "Registrar abono"}</Button></div></form> : null}</Modal>
    </section>
  );
}
