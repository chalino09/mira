"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArchiveRestore, ArrowRight, CircleCheck, Leaf, Package, PackageX, RefreshCcw, TrendingUp, WalletCards, type LucideIcon } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PageTitle } from "@/components/ui/PageTitle";
import { Field, FormattedNumberInput, SelectInput, TextInput, UnitSelectInput } from "@/components/forms/FormControls";
import { ProductCatalogCombobox, type ProductCatalogOption } from "@/components/forms/ProductCatalogCombobox";
import { appErrorMessage } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { appRoute, type InventoryCostsView } from "@/lib/routes";
import { formatCurrency, formatDate, formatNumber, parseNumericInput } from "@/lib/utils";
import { addDays, startOfIsoWeek } from "@/lib/date";
import type { ContextPeriod } from "@/types";

type InventoryItem = {
  id: string;
  product_id: string | null;
  name: string;
  base_unit: string;
  kind: "material" | "water" | "energy" | "labor";
  cost_category: string;
};

type ProductOption = ProductCatalogOption;

type Balance = {
  id: string;
  quantity: number;
  average_unit_cost: number;
  inventory_item: InventoryItem | null;
};

type Movement = {
  id: string;
  movement_type: "receipt" | "consumption" | "adjustment" | "reversal";
  quantity: number;
  unit_cost: number;
  occurred_at: string;
  note: string | null;
  inventory_item: { name: string; base_unit: string } | null;
};

type InventoryForm = "entry" | "item" | "adjustment" | "rate" | null;

const categories = [
  ["agroinsumos", "Agroinsumos"], ["fertilizantes", "Fertilizantes"], ["agua", "Agua"],
  ["energia", "Energía"], ["mano_obra", "Mano de obra"], ["mantenimiento", "Mantenimiento"]
] as const;

const movementLabels: Record<Movement["movement_type"], string> = {
  receipt: "Entrada",
  consumption: "Consumo",
  adjustment: "Ajuste",
  reversal: "Reversión"
};

function requestKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function previousPeriodBounds(period: ContextPeriod) {
  const today = new Date();
  if (period === "week") {
    const start = addDays(startOfIsoWeek(today), -7);
    return { start: dateKey(start), end: dateKey(addDays(start, 6)) };
  }
  if (period === "month") {
    return {
      start: dateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      end: dateKey(new Date(today.getFullYear(), today.getMonth(), 0))
    };
  }
  return null;
}

export function InventorySection({
  embedded = false,
  view = "stock"
}: {
  embedded?: boolean;
  view?: Exclude<InventoryCostsView, "costs">;
}) {
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const viewAggregates = useGreenhouseStore((state) => state.viewAggregates);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [previousTotalCost, setPreviousTotalCost] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "red" | "green"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeForm, setActiveForm] = useState<InventoryForm>(null);
  const [entryTarget, setEntryTarget] = useState("");
  const [entrySearch, setEntrySearch] = useState("");
  const [entryUnit, setEntryUnit] = useState("");
  const canManage = currentUser.role === "owner" || currentUser.role === "admin";

  const loadInventory = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;
    setLoading(true);
    const [itemsResponse, productsResponse, balancesResponse, movementsResponse] = await Promise.all([
      supabase.from("inventory_items").select("id, product_id, name, base_unit, kind, cost_category").eq("company_id", organization.id).eq("is_active", true).order("name"),
      supabase.from("products").select("id, name, composition").eq("company_id", organization.id).order("name"),
      supabase.from("inventory_balances").select("id, quantity, average_unit_cost, inventory_item:inventory_items(id, product_id, name, base_unit, kind, cost_category)").eq("company_id", organization.id).order("updated_at", { ascending: false }),
      supabase.from("inventory_movements").select("id, movement_type, quantity, unit_cost, occurred_at, note, inventory_item:inventory_items(name, base_unit)").eq("company_id", organization.id).order("created_at", { ascending: false }).limit(20)
    ]);
    const error = itemsResponse.error ?? productsResponse.error ?? balancesResponse.error ?? movementsResponse.error;
    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "El inventario estará disponible cuando ejecutes las migraciones 43 y 44.") });
      setLoading(false);
      return;
    }
    setItems((itemsResponse.data ?? []) as InventoryItem[]);
    setProducts((productsResponse.data ?? []) as ProductOption[]);
    setBalances((balancesResponse.data ?? []).map((balance: any) => ({
      ...balance,
      inventory_item: Array.isArray(balance.inventory_item) ? balance.inventory_item[0] ?? null : balance.inventory_item ?? null
    })) as Balance[]);
    setMovements((movementsResponse.data ?? []).map((movement: any) => ({
      ...movement,
      inventory_item: Array.isArray(movement.inventory_item) ? movement.inventory_item[0] ?? null : movement.inventory_item ?? null
    })) as Movement[]);
    setLoading(false);
  }, [organization.id]);

  useEffect(() => { void loadInventory(); }, [loadInventory]);
  useEffect(() => {
    if (view !== "summary") return;
    const bounds = previousPeriodBounds(selectedPeriod);
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id || !bounds) {
      setPreviousTotalCost(null);
      return;
    }
    let active = true;
    void supabase.rpc("get_view_operational_aggregates", {
      target_company_id: organization.id,
      target_greenhouse_id: selectedGreenhouseId === "__all__" ? null : selectedGreenhouseId,
      target_start_date: bounds.start,
      target_end_date: bounds.end
    }).then((response) => {
      if (!active) return;
      setPreviousTotalCost(response.error ? null : Number(response.data?.totalCost ?? 0));
    });
    return () => { active = false; };
  }, [organization.id, selectedGreenhouseId, selectedPeriod, view]);

  const totalValue = useMemo(() => balances.reduce((sum, balance) => sum + Number(balance.quantity) * Number(balance.average_unit_cost), 0), [balances]);
  const totalCost = viewAggregates?.totalCost ?? 0;
  const totalHarvestKg = viewAggregates?.totalHarvestKg ?? 0;
  const costPerKg = totalHarvestKg > 0 ? totalCost / totalHarvestKg : 0;
  const selectedGreenhouse = selectedGreenhouseId === "__all__" ? null : greenhouses.find((greenhouse) => greenhouse.id === selectedGreenhouseId) ?? null;
  const attentionItems = useMemo(() => {
    const alerts: Array<{ title: string; detail: string; view: InventoryCostsView; icon: LucideIcon }> = [];
    const budgetAmount = selectedGreenhouse?.budgetAmount ?? null;
    if (budgetAmount !== null && budgetAmount > 0 && totalCost > budgetAmount) {
      alerts.push({
        title: "Costos fuera de presupuesto",
        detail: `${formatCurrency(totalCost - budgetAmount)} por encima del presupuesto`,
        view: "costs",
        icon: WalletCards
      });
    }

    const stockedItemIds = new Set(
      balances
        .filter((balance) => Number(balance.quantity) > 0 && balance.inventory_item)
        .map((balance) => balance.inventory_item!.id)
    );
    const outOfStockCount = items.filter((item) => item.kind === "material" && !stockedItemIds.has(item.id)).length;
    if (outOfStockCount > 0) {
      alerts.push({
        title: "Inventario bajo",
        detail: `${outOfStockCount} ${outOfStockCount === 1 ? "producto agotado" : "productos agotados"}`,
        view: "stock",
        icon: PackageX
      });
    }

    if (previousTotalCost !== null) {
      if (previousTotalCost === 0 && totalCost > 0) {
        alerts.push({
          title: "Variación de costos",
          detail: "Hay costos en este periodo; el anterior no tuvo registros",
          view: "costs",
          icon: TrendingUp
        });
      } else if (previousTotalCost > 0) {
        const variation = Math.round(((totalCost - previousTotalCost) / previousTotalCost) * 100);
        if (Math.abs(variation) >= 10) {
          alerts.push({
            title: "Variación de costos",
            detail: `${variation > 0 ? "Subieron" : "Bajaron"} ${Math.abs(variation)}% respecto al periodo anterior`,
            view: "costs",
            icon: TrendingUp
          });
        }
      }
    }
    return alerts;
  }, [balances, items, previousTotalCost, selectedGreenhouse?.budgetAmount, totalCost]);
  const selectedEntryProductId = entryTarget.startsWith("product:") ? entryTarget.slice("product:".length) : null;
  const selectedEntryItemId = entryTarget.startsWith("item:") ? entryTarget.slice("item:".length) : null;
  const selectedEntryItem = selectedEntryProductId
    ? items.find((item) => item.product_id === selectedEntryProductId)
    : items.find((item) => item.id === selectedEntryItemId);
  const manualItems = items.filter((item) => !item.product_id);
  const entryOptions: ProductCatalogOption[] = [
    ...products.map((product) => ({
      ...product,
      id: `product:${product.id}`,
      description: product.composition ? null : "Producto del catálogo"
    })),
    ...manualItems.map((item) => ({
      id: `item:${item.id}`,
      name: item.name,
      description: `Otro recurso · ${item.base_unit}`
    }))
  ].sort((left, right) => left.name.localeCompare(right.name, "es-MX"));

  const openEntry = () => {
    setEntryTarget("");
    setEntrySearch("");
    setEntryUnit("");
    setActiveForm("entry");
  };

  const selectEntryTarget = (value: string, name: string) => {
    setEntryTarget(value);
    setEntrySearch(name);
    const productId = value.startsWith("product:") ? value.slice("product:".length) : null;
    const itemId = value.startsWith("item:") ? value.slice("item:".length) : null;
    setEntryUnit(productId ? items.find((item) => item.product_id === productId)?.base_unit ?? "" : items.find((item) => item.id === itemId)?.base_unit ?? "");
  };

  const run = async (callback: () => Promise<void>) => {
    setSaving(true);
    setNotice(null);
    try {
      await callback();
      await loadInventory();
    } catch (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo actualizar el inventario.") });
    } finally {
      setSaving(false);
    }
  };

  const createItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const { error } = await getSupabaseBrowserClient()!.rpc("create_inventory_item", {
        target_company_id: organization.id,
        target_name: String(form.get("name") ?? ""),
        target_base_unit: String(form.get("unit") ?? ""),
        target_kind: String(form.get("kind") ?? "material"),
        target_cost_category: String(form.get("category") ?? "agroinsumos"),
        target_product_id: String(form.get("productId") ?? "") || null
      });
      if (error) throw error;
      event.currentTarget.reset();
      setActiveForm(null);
      setNotice({ tone: "green", message: "Artículo agregado al almacén central." });
    });
  };

  const receive = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const common = {
        target_company_id: organization.id,
        target_quantity: parseNumericInput(String(form.get("quantity") ?? "")),
        target_unit_cost: parseNumericInput(String(form.get("unitCost") ?? "")),
        target_occurred_at: String(form.get("date") ?? ""),
        target_idempotency_key: requestKey("receipt"),
        target_note: String(form.get("note") ?? "") || null
      };
      const { error } = selectedEntryProductId
        ? await getSupabaseBrowserClient()!.rpc("receive_product_inventory", { ...common, target_product_id: selectedEntryProductId, target_base_unit: entryUnit })
        : await getSupabaseBrowserClient()!.rpc("receive_inventory", { ...common, target_item_id: selectedEntryItemId });
      if (error) throw error;
      event.currentTarget.reset();
      setEntryTarget("");
      setEntrySearch("");
      setEntryUnit("");
      setActiveForm(null);
      setNotice({ tone: "green", message: "Entrada registrada y costo promedio actualizado." });
    });
  };

  const adjust = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const { error } = await getSupabaseBrowserClient()!.rpc("adjust_inventory", {
        target_company_id: organization.id,
        target_item_id: String(form.get("itemId") ?? ""),
        target_quantity_delta: parseNumericInput(String(form.get("quantity") ?? "")),
        target_occurred_at: String(form.get("date") ?? ""),
        target_reason: String(form.get("reason") ?? ""),
        target_idempotency_key: requestKey("adjustment")
      });
      if (error) throw error;
      event.currentTarget.reset();
      setActiveForm(null);
      setNotice({ tone: "green", message: "Ajuste auditado en el almacén." });
    });
  };

  const saveRate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const { error } = await getSupabaseBrowserClient()!.rpc("set_company_resource_rate", {
        target_company_id: organization.id,
        target_resource_type: String(form.get("resource") ?? "water"),
        target_unit: String(form.get("unit") ?? ""),
        target_unit_cost: parseNumericInput(String(form.get("unitCost") ?? ""))
      });
      if (error) throw error;
      event.currentTarget.reset();
      setActiveForm(null);
      setNotice({ tone: "green", message: "Tarifa automática actualizada." });
    });
  };

  const reverse = (movementId: string) => {
    const reason = window.prompt("Motivo de la reversión:");
    if (!reason?.trim()) return;
    void run(async () => {
      const { error } = await getSupabaseBrowserClient()!.rpc("reverse_inventory_movement", {
        target_movement_id: movementId,
        target_reason: reason,
        target_idempotency_key: requestKey("reversal")
      });
      if (error) throw error;
      setNotice({ tone: "green", message: "Movimiento revertido con auditoría." });
    });
  };

  return (
    <section className="pb-12">
      {!embedded ? (
        <div className="mb-8 flex flex-col gap-5 border-b border-app-border pb-7 pt-8 md:pt-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Almacén central</p>
            <PageTitle className="mt-4">Inventario</PageTitle>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-app-muted">Registra compras; los consumos y costos se actualizan al completar una actividad.</p>
          </div>
        </div>
      ) : null}

      {notice ? <p className={`mb-5 border px-4 py-3 text-sm ${notice.tone === "red" ? "border-[#D9AAAA] bg-[#FFF6F5] text-[#8A2E2E]" : "border-[#B9D4C0] bg-[#F2F8F3] text-app-green"}`}>{notice.message}</p> : null}

      <Modal open={activeForm === "entry"} onClose={() => setActiveForm(null)} title="Registrar entrada" panelClassName="sm:max-w-xl">
        <form className="grid gap-5" onSubmit={receive}>
          {products.length || manualItems.length ? <>
            <p className="text-sm leading-6 text-app-muted">Elige un producto de Aplicaciones. Se agrega al almacén automáticamente con su primera entrada.</p>
            <Field label="Producto">
              <ProductCatalogCombobox
                allowCustom={false}
                ariaLabel="Producto de inventario"
                onChange={(selection) => selectEntryTarget(selection.productId, selection.productName)}
                productId={entryTarget}
                products={entryOptions}
                required
                value={entrySearch}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={selectedEntryItem ? "Unidad configurada" : "Unidad (primera entrada)"}><UnitSelectInput disabled={Boolean(selectedEntryItem)} name="unit" onChange={(event) => setEntryUnit(event.target.value)} required value={entryUnit} /></Field>
              <Field label="Cantidad"><FormattedNumberInput min="0.0001" name="quantity" required /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Costo por unidad"><FormattedNumberInput min="0" name="unitCost" required /></Field>
              <Field label="Fecha"><TextInput defaultValue={new Date().toISOString().slice(0, 10)} name="date" required type="date" /></Field>
            </div>
            <Field label="Nota (opcional)"><TextInput name="note" placeholder="Proveedor, lote o referencia" /></Field>
          </> : <p className="text-sm leading-6 text-app-muted">No hay productos disponibles todavía.</p>}
          <div className="flex justify-end gap-2 border-t border-app-border pt-4">
            <Button onClick={() => setActiveForm(null)} type="button" variant="ghost">Cancelar</Button>
            {products.length || manualItems.length ? <Button disabled={saving || !entryTarget} type="submit" variant="primary">Registrar entrada</Button> : <Button onClick={() => setActiveForm("item")} type="button" variant="primary">Agregar recurso</Button>}
          </div>
        </form>
      </Modal>

      <Modal open={activeForm === "item"} onClose={() => setActiveForm(null)} title="Otro recurso de inventario" panelClassName="sm:max-w-xl">
        <form className="grid gap-5" onSubmit={createItem}>
          <p className="text-sm leading-6 text-app-muted">Úsalo para agua, energía, mano de obra u otro recurso que no provenga del catálogo de Aplicaciones.</p>
          <Field label="Nombre"><TextInput name="name" placeholder="Ej. Agua de riego" required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unidad"><UnitSelectInput name="unit" required /></Field>
            <Field label="Tipo"><SelectInput defaultValue="material" name="kind"><option value="material">Material</option><option value="water">Agua</option><option value="energy">Energía</option><option value="labor">Mano de obra</option></SelectInput></Field>
          </div>
          <Field label="Categoría de costo"><SelectInput defaultValue="agroinsumos" name="category">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></Field>
          <div className="flex justify-end gap-2 border-t border-app-border pt-4"><Button onClick={() => setActiveForm(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">Agregar producto</Button></div>
        </form>
      </Modal>

      <Modal open={activeForm === "adjustment"} onClose={() => setActiveForm(null)} title="Ajustar existencias" panelClassName="sm:max-w-xl">
        <form className="grid gap-5" onSubmit={adjust}>
          <p className="text-sm leading-6 text-app-muted">Usa un valor positivo para sumar y negativo para descontar. El ajuste quedará auditado.</p>
          <Field label="Artículo"><SelectInput name="itemId" required defaultValue=""><option disabled value="">Selecciona</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Diferencia (+/-)"><FormattedNumberInput name="quantity" required /></Field><Field label="Fecha"><TextInput defaultValue={new Date().toISOString().slice(0, 10)} name="date" required type="date" /></Field></div>
          <Field label="Motivo"><TextInput name="reason" placeholder="Ej. Conteo físico" required /></Field>
          <div className="flex justify-end gap-2 border-t border-app-border pt-4"><Button onClick={() => setActiveForm(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">Guardar ajuste</Button></div>
        </form>
      </Modal>

      <Modal open={activeForm === "rate"} onClose={() => setActiveForm(null)} title="Tarifas automáticas" panelClassName="sm:max-w-xl">
        <form className="grid gap-5" onSubmit={saveRate}>
          <p className="text-sm leading-6 text-app-muted">Estas tarifas calculan costos de agua, energía y mano de obra al completar una actividad.</p>
          <Field label="Recurso"><SelectInput defaultValue="water" name="resource"><option value="water">Agua</option><option value="energy">Energía</option><option value="labor">Mano de obra</option></SelectInput></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Unidad"><UnitSelectInput defaultValue="lt" name="unit" required /></Field><Field label="Costo por unidad"><FormattedNumberInput min="0" name="unitCost" required /></Field></div>
          <div className="flex justify-end gap-2 border-t border-app-border pt-4"><Button onClick={() => setActiveForm(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">Guardar tarifa</Button></div>
        </form>
      </Modal>

      {view === "summary" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Package} label="Valor del inventario" value={formatCurrency(totalValue)} detail={`${balances.length} ${balances.length === 1 ? "artículo" : "artículos"} con existencias`} />
            <MetricCard icon={ArchiveRestore} label="Productos configurados" value={formatNumber(items.length)} detail="Catálogo del almacén central" />
            <MetricCard icon={WalletCards} label="Costos del periodo" value={formatCurrency(totalCost)} detail="Automáticos y registrados" />
            <MetricCard icon={Leaf} label="Costo por kg" value={totalHarvestKg > 0 ? formatCurrency(costPerKg) : "--"} detail={totalHarvestKg > 0 ? `${formatNumber(totalHarvestKg)} kg cosechados` : "Sin cosecha en el periodo"} />
          </div>
          <section aria-labelledby="inventory-attention-title" className="mt-8">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 className="text-xl font-light text-app-text" id="inventory-attention-title">Requiere atención</h2>
              {attentionItems.length ? <span className="text-sm text-app-muted">{attentionItems.length} {attentionItems.length === 1 ? "alerta" : "alertas"}</span> : null}
            </div>
            {attentionItems.length ? (
              <ul className="grid gap-3 lg:grid-cols-3">
                {attentionItems.map((alert, index) => {
                  const AlertIcon = alert.icon;
                  return (
                    <li key={`${alert.title}-${index}`}>
                      <Link
                        className="group flex min-h-24 items-start gap-3 border border-app-border bg-white p-4 transition-[border-color,background-color] duration-150 hover:border-app-green/40 hover:bg-app-green-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
                        href={appRoute(organization.slug ?? organization.name, {
                          section: "inventory",
                          greenhouseId: selectedGreenhouseId,
                          period: selectedPeriod,
                          inventoryView: alert.view
                        })}
                      >
                        <AlertIcon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-app-green" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-app-text">{alert.title}</span>
                          <span className="mt-1 block text-sm leading-5 text-app-muted">{alert.detail}</span>
                        </span>
                        <ArrowRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-app-muted transition-transform duration-150 group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex min-h-20 items-center gap-3 border border-app-border bg-white px-4 py-3 text-sm text-app-muted">
                <CircleCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-app-green" />
                Sin alertas relevantes en este periodo.
              </div>
            )}
          </section>
        </>
      ) : null}

      {view === "stock" ? (
        <>
          {canManage ? (
            <div className="mb-5 flex flex-col gap-3 border-y border-app-border py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-app-muted">Inventario disponible y costo promedio del almacén central.</p>
              <div className="flex flex-wrap gap-2">
                <Button icon={<ArchiveRestore className="h-4 w-4" />} onClick={openEntry} variant="primary">Registrar entrada</Button>
                <Button onClick={() => setActiveForm("item")} variant="secondary">Agregar recurso</Button>
                <Button onClick={() => setActiveForm("adjustment")} variant="ghost">Ajustar existencias</Button>
              </div>
            </div>
          ) : null}
          <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border border-app-border bg-white px-5 py-4">
            <span className="text-sm text-app-muted"><strong className="text-app-text">{items.length}</strong> {items.length === 1 ? "producto" : "productos"}</span>
            <span className="text-sm text-app-muted"><strong className="text-app-text">{balances.length}</strong> con existencias</span>
            <span className="text-sm text-app-muted">Valor estimado <strong className="text-app-text">{formatCurrency(totalValue)}</strong></span>
            {canManage ? <button className="ml-auto min-h-10 text-xs font-semibold uppercase tracking-[0.14em] text-app-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green" onClick={() => setActiveForm("rate")} type="button">Configurar tarifas</button> : null}
          </div>
          {loading ? <p className="text-sm text-app-muted">Cargando inventario…</p> : balances.length ? <DataTable<Balance> columns={[
            { key: "item", label: "Artículo", render: (balance) => balance.inventory_item?.name ?? "Artículo" },
            { key: "stock", label: "Existencia", render: (balance) => `${formatNumber(Number(balance.quantity))} ${balance.inventory_item?.base_unit ?? ""}` },
            { key: "cost", label: "Promedio", render: (balance) => formatCurrency(Number(balance.average_unit_cost)) },
            { key: "value", label: "Valor", render: (balance) => formatCurrency(Number(balance.quantity) * Number(balance.average_unit_cost)) }
          ]} data={balances} /> : <EmptyState icon={Package} title="Agrega un artículo y registra su primera entrada para iniciar el almacén central." />}
        </>
      ) : null}

      {view === "movements" ? (
        <div>
          <div className="mb-5 border-y border-app-border py-4">
            <h2 className="text-xl font-light text-app-text">Historial de inventario</h2>
            <p className="mt-2 text-sm leading-6 text-app-muted">Entradas, consumos, ajustes y reversiones con su valor registrado.</p>
          </div>
          {loading ? <p className="text-sm text-app-muted">Cargando movimientos…</p> : movements.length ? <DataTable<Movement> columns={[
            { key: "date", label: "Fecha", render: (movement) => formatDate(movement.occurred_at) },
            { key: "item", label: "Artículo", render: (movement) => movement.inventory_item?.name ?? "Artículo" },
            { key: "type", label: "Tipo", render: (movement) => movementLabels[movement.movement_type] },
            { key: "quantity", label: "Cantidad", render: (movement) => `${formatNumber(Number(movement.quantity))} ${movement.inventory_item?.base_unit ?? ""}` },
            { key: "unitCost", label: "Costo/u.", render: (movement) => formatCurrency(Number(movement.unit_cost)) },
            ...(canManage ? [{ key: "actions", label: "", mobileHidden: true, render: (movement: Movement) => <Button disabled={saving} icon={<RefreshCcw className="h-3.5 w-3.5" />} onClick={() => reverse(movement.id)} title="Revertir movimiento" variant="ghost" /> }] : [])
          ]} data={movements} /> : <EmptyState icon={RefreshCcw} title="El historial aparecerá después de registrar una entrada, consumo o ajuste." />}
        </div>
      ) : null}
    </section>
  );
}
