"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArchiveRestore, Package, PackagePlus, RefreshCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FormattedNumberInput, SelectInput, TextInput } from "@/components/forms/FormControls";
import { appErrorMessage } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type InventoryItem = {
  id: string;
  name: string;
  base_unit: string;
  kind: "material" | "water" | "energy" | "labor";
  cost_category: string;
};

type ProductOption = { id: string; name: string };

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

export function InventorySection() {
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [notice, setNotice] = useState<{ tone: "red" | "green"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canManage = currentUser.role === "owner" || currentUser.role === "admin";

  const loadInventory = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;
    setLoading(true);
    const [itemsResponse, productsResponse, balancesResponse, movementsResponse] = await Promise.all([
      supabase.from("inventory_items").select("id, name, base_unit, kind, cost_category").eq("company_id", organization.id).eq("is_active", true).order("name"),
      supabase.from("products").select("id, name").eq("company_id", organization.id).order("name"),
      supabase.from("inventory_balances").select("id, quantity, average_unit_cost, inventory_item:inventory_items(id, name, base_unit, kind, cost_category)").eq("company_id", organization.id).order("updated_at", { ascending: false }),
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

  const totalValue = useMemo(() => balances.reduce((sum, balance) => sum + Number(balance.quantity) * Number(balance.average_unit_cost), 0), [balances]);

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
      setNotice({ tone: "green", message: "Artículo agregado al almacén central." });
    });
  };

  const receive = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const { error } = await getSupabaseBrowserClient()!.rpc("receive_inventory", {
        target_company_id: organization.id,
        target_item_id: String(form.get("itemId") ?? ""),
        target_quantity: Number(form.get("quantity")),
        target_unit_cost: Number(form.get("unitCost")),
        target_occurred_at: String(form.get("date") ?? ""),
        target_idempotency_key: requestKey("receipt"),
        target_note: String(form.get("note") ?? "") || null
      });
      if (error) throw error;
      event.currentTarget.reset();
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
        target_quantity_delta: Number(form.get("quantity")),
        target_occurred_at: String(form.get("date") ?? ""),
        target_reason: String(form.get("reason") ?? ""),
        target_idempotency_key: requestKey("adjustment")
      });
      if (error) throw error;
      event.currentTarget.reset();
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
        target_unit_cost: Number(form.get("unitCost"))
      });
      if (error) throw error;
      event.currentTarget.reset();
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
      <div className="mb-10 border-b border-app-border pb-7 pt-8 md:pt-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Almacén central</p>
        <h1 className="mt-4 text-4xl font-light text-app-text md:text-6xl">Inventario</h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">Existencias, costo promedio, consumos vinculados a Work y movimientos auditables.</p>
      </div>

      {notice ? <p className={`mb-5 border px-4 py-3 text-sm ${notice.tone === "red" ? "border-[#D9AAAA] bg-[#FFF6F5] text-[#8A2E2E]" : "border-[#B9D4C0] bg-[#F2F8F3] text-app-green"}`}>{notice.message}</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="border border-app-border bg-white p-4"><p className="text-xs text-app-muted">Artículos activos</p><p className="mt-2 text-3xl font-light">{items.length}</p></div>
        <div className="border border-app-border bg-white p-4"><p className="text-xs text-app-muted">Existencias</p><p className="mt-2 text-3xl font-light">{balances.length}</p></div>
        <div className="border border-app-border bg-white p-4"><p className="text-xs text-app-muted">Valor estimado</p><p className="mt-2 text-3xl font-light">{formatCurrency(totalValue)}</p></div>
      </div>

      {canManage ? (
        <div className="mb-8 grid gap-4 xl:grid-cols-4">
          <form className="grid gap-3 border border-app-border bg-white p-4" onSubmit={createItem}>
            <p className="flex items-center gap-2 text-sm font-medium"><PackagePlus className="h-4 w-4" /> Nuevo artículo</p>
            <Field label="Nombre"><TextInput name="name" required /></Field>
            <Field label="Producto del catálogo (para consumo automático)"><SelectInput name="productId"><option value="">No vincular</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</SelectInput></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Unidad"><TextInput name="unit" placeholder="kg, L, h" required /></Field><Field label="Tipo"><SelectInput name="kind"><option value="material">Material</option><option value="water">Agua</option><option value="energy">Energía</option><option value="labor">Mano de obra</option></SelectInput></Field></div>
            <Field label="Categoría de costo"><SelectInput name="category">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></Field>
            <Button disabled={saving} type="submit" variant="secondary">Agregar</Button>
          </form>
          <form className="grid gap-3 border border-app-border bg-white p-4" onSubmit={receive}>
            <p className="flex items-center gap-2 text-sm font-medium"><ArchiveRestore className="h-4 w-4" /> Entrada</p>
            <Field label="Artículo"><SelectInput name="itemId" required><option value="">Selecciona</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit}</option>)}</SelectInput></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Cantidad"><FormattedNumberInput min={0.0001} name="quantity" required step="0.0001" /></Field><Field label="Costo/unidad"><FormattedNumberInput min={0} name="unitCost" required step="0.0001" /></Field></div>
            <Field label="Fecha"><TextInput defaultValue={new Date().toISOString().slice(0, 10)} name="date" required type="date" /></Field>
            <Field label="Nota"><TextInput name="note" /></Field>
            <Button disabled={saving || !items.length} type="submit" variant="secondary">Registrar entrada</Button>
          </form>
          <form className="grid gap-3 border border-app-border bg-white p-4" onSubmit={adjust}>
            <p className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="h-4 w-4" /> Ajuste auditado</p>
            <Field label="Artículo"><SelectInput name="itemId" required><option value="">Selecciona</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit}</option>)}</SelectInput></Field>
            <Field label="Diferencia (+/-)"><FormattedNumberInput name="quantity" required step="0.0001" /></Field>
            <Field label="Fecha"><TextInput defaultValue={new Date().toISOString().slice(0, 10)} name="date" required type="date" /></Field>
            <Field label="Motivo"><TextInput name="reason" required /></Field>
            <Button disabled={saving || !items.length} type="submit" variant="secondary">Ajustar</Button>
          </form>
          <form className="grid gap-3 border border-app-border bg-white p-4" onSubmit={saveRate}>
            <p className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="h-4 w-4" /> Tarifa automática</p>
            <Field label="Recurso"><SelectInput name="resource"><option value="water">Agua</option><option value="energy">Energía</option><option value="labor">Mano de obra</option></SelectInput></Field>
            <div className="grid grid-cols-2 gap-2"><Field label="Unidad"><TextInput defaultValue="L" name="unit" required /></Field><Field label="Costo/unidad"><FormattedNumberInput min={0} name="unitCost" required step="0.0001" /></Field></div>
            <p className="text-xs leading-5 text-app-muted">Agua se calcula desde los litros de riego. Energía y mano de obra usan los valores del plan técnico.</p>
            <Button disabled={saving} type="submit" variant="secondary">Guardar tarifa</Button>
          </form>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-app-muted">Cargando inventario…</p> : balances.length ? <DataTable<Balance> columns={[
        { key: "item", label: "Artículo", render: (balance) => balance.inventory_item?.name ?? "Artículo" },
        { key: "stock", label: "Existencia", render: (balance) => `${formatNumber(Number(balance.quantity))} ${balance.inventory_item?.base_unit ?? ""}` },
        { key: "cost", label: "Promedio", render: (balance) => formatCurrency(Number(balance.average_unit_cost)) },
        { key: "value", label: "Valor", render: (balance) => formatCurrency(Number(balance.quantity) * Number(balance.average_unit_cost)) }
      ]} data={balances} /> : <EmptyState icon={Package} title="Agrega un artículo y registra su primera entrada para iniciar el almacén central." />}

      <div className="mt-10"><h2 className="mb-4 text-xl font-light">Movimientos recientes</h2>{movements.length ? <DataTable<Movement> columns={[
        { key: "date", label: "Fecha", render: (movement) => formatDate(movement.occurred_at) },
        { key: "item", label: "Artículo", render: (movement) => movement.inventory_item?.name ?? "Artículo" },
        { key: "type", label: "Tipo", render: (movement) => movementLabels[movement.movement_type] },
        { key: "quantity", label: "Cantidad", render: (movement) => `${formatNumber(Number(movement.quantity))} ${movement.inventory_item?.base_unit ?? ""}` },
        { key: "unitCost", label: "Costo/u.", render: (movement) => formatCurrency(Number(movement.unit_cost)) },
        ...(canManage ? [{ key: "actions", label: "", render: (movement: Movement) => <Button disabled={saving} icon={<RefreshCcw className="h-3.5 w-3.5" />} onClick={() => reverse(movement.id)} title="Revertir" variant="ghost" /> }] : [])
      ]} data={movements} /> : <p className="text-sm text-app-muted">Todavía no hay movimientos.</p>}</div>
    </section>
  );
}
