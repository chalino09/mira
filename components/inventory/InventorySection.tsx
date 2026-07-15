"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArchiveRestore, Package, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
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
  const [activeForm, setActiveForm] = useState<InventoryForm>(null);
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
      setActiveForm(null);
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
        target_quantity_delta: Number(form.get("quantity")),
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
        target_unit_cost: Number(form.get("unitCost"))
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
      <div className="mb-8 flex flex-col gap-5 border-b border-app-border pb-7 pt-8 md:pt-10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Almacén central</p>
          <h1 className="mt-4 text-4xl font-light text-app-text md:text-6xl">Inventario</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-app-muted">Registra compras; los consumos y costos se actualizan al completar un Work.</p>
        </div>
        {canManage ? <div className="flex flex-wrap gap-2">
          <Button icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => setActiveForm("entry")} variant="primary">Registrar entrada</Button>
          <Button onClick={() => setActiveForm("item")} variant="secondary">Nuevo producto</Button>
          <Button onClick={() => setActiveForm("adjustment")} variant="ghost">Ajustar</Button>
        </div> : null}
      </div>

      {notice ? <p className={`mb-5 border px-4 py-3 text-sm ${notice.tone === "red" ? "border-[#D9AAAA] bg-[#FFF6F5] text-[#8A2E2E]" : "border-[#B9D4C0] bg-[#F2F8F3] text-app-green"}`}>{notice.message}</p> : null}
      <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border border-app-border bg-white px-5 py-4">
        <span className="text-sm text-app-muted"><strong className="text-app-text">{items.length}</strong> productos</span>
        <span className="text-sm text-app-muted"><strong className="text-app-text">{balances.length}</strong> con existencias</span>
        <span className="text-sm text-app-muted">Valor estimado <strong className="text-app-text">{formatCurrency(totalValue)}</strong></span>
        {canManage ? <button className="ml-auto text-xs font-semibold uppercase tracking-[0.14em] text-app-green" onClick={() => setActiveForm("rate")} type="button">Configurar tarifas</button> : null}
      </div>

      <Modal open={activeForm === "entry"} onClose={() => setActiveForm(null)} title="Registrar entrada" panelClassName="sm:max-w-xl">
        <form className="grid gap-5" onSubmit={receive}>
          {items.length ? <>
            <Field label="Artículo"><SelectInput name="itemId" required defaultValue=""><option disabled value="">Selecciona</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit}</option>)}</SelectInput></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cantidad"><FormattedNumberInput min="0.0001" name="quantity" required /></Field>
              <Field label="Costo por unidad"><FormattedNumberInput min="0" name="unitCost" required /></Field>
            </div>
            <Field label="Fecha"><TextInput defaultValue={new Date().toISOString().slice(0, 10)} name="date" required type="date" /></Field>
            <Field label="Nota (opcional)"><TextInput name="note" placeholder="Proveedor, lote o referencia" /></Field>
          </> : <p className="text-sm leading-6 text-app-muted">Primero agrega el producto que recibiste al almacén.</p>}
          <div className="flex justify-end gap-2 border-t border-app-border pt-4">
            <Button onClick={() => setActiveForm(null)} type="button" variant="ghost">Cancelar</Button>
            {items.length ? <Button disabled={saving} type="submit" variant="primary">Registrar entrada</Button> : <Button onClick={() => setActiveForm("item")} type="button" variant="primary">Agregar producto</Button>}
          </div>
        </form>
      </Modal>

      <Modal open={activeForm === "item"} onClose={() => setActiveForm(null)} title="Nuevo producto de inventario" panelClassName="sm:max-w-xl">
        <form className="grid gap-5" onSubmit={createItem}>
          <p className="text-sm leading-6 text-app-muted">Vincúlalo al catálogo únicamente si debe descontarse automáticamente al completar un Work.</p>
          <Field label="Nombre"><TextInput name="name" placeholder="Ej. Fertilizante A" required /></Field>
          <Field label="Producto del catálogo (opcional)"><SelectInput defaultValue="" name="productId"><option value="">No vincular</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</SelectInput></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unidad"><TextInput name="unit" placeholder="kg, L, h" required /></Field>
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
          <p className="text-sm leading-6 text-app-muted">Estas tarifas calculan costos de agua, energía y mano de obra al completar un Work.</p>
          <Field label="Recurso"><SelectInput defaultValue="water" name="resource"><option value="water">Agua</option><option value="energy">Energía</option><option value="labor">Mano de obra</option></SelectInput></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Unidad"><TextInput defaultValue="L" name="unit" required /></Field><Field label="Costo por unidad"><FormattedNumberInput min="0" name="unitCost" required /></Field></div>
          <div className="flex justify-end gap-2 border-t border-app-border pt-4"><Button onClick={() => setActiveForm(null)} type="button" variant="ghost">Cancelar</Button><Button disabled={saving} type="submit" variant="primary">Guardar tarifa</Button></div>
        </form>
      </Modal>

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
