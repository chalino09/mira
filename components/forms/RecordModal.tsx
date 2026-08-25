"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SelectionMenu } from "@/components/ui/SelectionMenu";
import { DatePickerInput, TimePickerInput } from "@/components/forms/DateTimeInputs";
import { Field, FormattedNumberInput, FormattedQuantityInput, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { HarvestCaptureFields } from "@/components/forms/HarvestCaptureFields";
import { PreciseLocationField } from "@/components/forms/PreciseLocationField";
import { ProductCatalogCombobox, type ProductCatalogOption } from "@/components/forms/ProductCatalogCombobox";
import { applicationCategories, applicationCategoryFromDb, applicationCategoryToDb } from "@/lib/application-categories";
import { appErrorMessage } from "@/lib/errors";
import { calculatedCostAmount } from "@/lib/cost-entry";
import { costCategories, costCategoryToDb } from "@/lib/cost-categories";
import { suggestedCostCategory } from "@/lib/cost-category-suggestions";
import { INITIAL_CROP_ID, cropStageFromDdt, cropStageToDbValue, greenhouseDisplayName } from "@/lib/crop-ddt";
import { cropVarietyOptionsForSlug } from "@/lib/crop-varieties";
import { useGreenhouseStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createPrivateCompanyFileUrl, uploadPrivateCompanyFile } from "@/lib/storage";
import { harvestValuesFromForm, type HarvestPriceReferences } from "@/lib/harvest";
import { calculateHarvestSale } from "@/lib/harvest-sale";
import { normalizedProductName } from "@/lib/product-search";
import { cn, formatCurrency, parseNumericInput } from "@/lib/utils";
import type {
  ApplicationRecord,
  CostRecord,
  Greenhouse,
  HarvestRecord,
  NutritionRecord,
  RiskLevel,
  TaskType
} from "@/types";

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(date: string) {
  if (!date) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86400000));
}

function daysBetween(startDate?: string | null, endDate?: string | null) {
  if (!startDate) return 0;
  const start = new Date(`${startDate}T12:00:00`);
  const end = endDate ? new Date(`${endDate}T12:00:00`) : new Date();
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function optionalNumber(value: FormDataEntryValue | null) {
  return parseNumericInput(String(value ?? ""));
}

function requiredNumber(value: FormDataEntryValue | null) {
  return optionalNumber(value) ?? 0;
}

function normalizedComparableText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
}

function sameNumericValue(left: number | null | undefined, right: number | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return Math.abs(Number(left) - Number(right)) <= 0.01;
}

function sameOptionalText(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizedComparableText(left ?? "");
  const normalizedRight = normalizedComparableText(right ?? "");
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

type CostDraft = {
  category: CostRecord["category"];
  amount: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  notes: string;
};

type SaleDraft = {
  buyerName: string;
  date: string;
  lines: Array<{ quality: "Primera" | "Segunda" | "Tercera"; boxCount: string; grossPricePerBox: string }>;
  commissionPerBox: string;
  freightPerBox: string;
  packagingPerBox: string;
  paymentStatus: "Pendiente" | "Pagada";
  paidAt: string;
  notes: string;
};

type ManagerOption = {
  id: string;
  name: string;
  email: string;
  source: "user" | "staff";
};

function emptyCost(): CostDraft {
  return { category: "Agroinsumos", amount: "", quantity: "", unit: "", unitPrice: "", notes: "" };
}

type ProductOption = ProductCatalogOption;

type NutritionProductDraft = {
  productId: string;
  product: string;
  dose: string;
};

type ApplicationProductDraft = {
  productId: string;
  category: ApplicationRecord["category"] | "";
  product: string;
  composition: string;
  dose: string;
};

type DuplicateWarning = {
  title: string;
  message: string;
  detail: string;
};

function emptyNutritionProduct(): NutritionProductDraft {
  return { productId: "", product: "", dose: "" };
}

function emptyApplicationProduct(): ApplicationProductDraft {
  return { productId: "", category: "", product: "", composition: "", dose: "" };
}

function insertedId(row: { id?: string } | null | undefined, fallback: string) {
  if (!row?.id) {
    throw new Error(fallback);
  }
  return row.id;
}

function rpcRecordId(data: { recordId?: string } | null | undefined, fallback: string) {
  if (!data?.recordId) throw new Error(fallback);
  return data.recordId;
}

const taskTypeToDb: Record<TaskType, string> = {
  Riego: "riego",
  Fertirriego: "fertirriego",
  Fertilización: "fertilizacion",
  "Aplicación foliar": "aplicacion_foliar",
  "Revisión de plagas y enfermedades": "revision_plagas",
  Deschuponado: "poda",
  "Manejo de rafia": "tutoreo",
  Deshoje: "deshoje",
  Cosecha: "cosecha",
  Limpieza: "limpieza",
  Mantenimiento: "mantenimiento",
  "Preparación de ciclo": "otro",
  Otra: "otro"
};

const riskLevelToDb: Record<RiskLevel, string> = {
  Baja: "baja",
  Media: "media",
  Alta: "alta"
};

const costCategoryOptions = costCategories.map(({ label }) => ({
  label,
  value: label
}));

const costUnitOptions = [
  { label: "Seleccionar unidad", value: "", disabled: true },
  ...["Pieza", "Litro", "Kilogramo", "Bulto", "Rollo", "Metro", "Caja", "Hora", "Lote", "Año"]
    .map((unit) => ({ label: unit, value: unit }))
];

const nutritionMethodToDb: Record<NutritionRecord["method"], string> = {
  Fertirriego: "fertirriego",
  Foliar: "foliar",
  Drench: "drench"
};

const nutritionObjectiveToDb: Record<NutritionRecord["objective"], string> = {
  Desarrollo: "desarrollo",
  Raíz: "raiz",
  Floración: "floracion",
  Cuajado: "cuajado",
  Engorde: "engorde",
  Calidad: "calidad"
};

const pestFollowUpStatuses = [
  "Pendiente de revisión",
  "Controlado",
  "En seguimiento",
  "No controló, requiere reaplicación",
  "Reaplicación programada"
];

function pestFollowUpText(form: FormData) {
  const status = String(form.get("followUpStatus") ?? "").trim();
  const reviewDate = String(form.get("reviewDate") ?? "").trim();
  const reapplicationDate = String(form.get("reapplicationDate") ?? "").trim();
  const notes = String(form.get("followUp") ?? "").trim();
  const followUp = [
    status ? `Estado: ${status}` : "",
    reviewDate ? `Revisar: ${reviewDate}` : "",
    reapplicationDate ? `Reaplicar: ${reapplicationDate}` : "",
    notes
  ].filter(Boolean);

  return followUp.join("\n");
}

function BudgetInput({
  className,
  defaultValue
}: {
  className?: string;
  defaultValue?: number | string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-app-muted">$</span>
      <FormattedNumberInput
        className={cn("pl-7 pr-14", className)}
        name="budgetAmount"
        placeholder="Opcional"
        defaultValue={defaultValue}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-app-muted">MXN</span>
    </div>
  );
}

const modalCopy = {
  greenhouse: {
    title: "Nueva área productiva",
    kicker: "Infraestructura",
    note: "Crea una nueva área con sus datos productivos."
  },
  editGreenhouse: {
    title: "Editar área productiva",
    kicker: "Infraestructura",
    note: "Actualiza variedad, trasplante, plantas y datos base del cultivo."
  },
  task: {
    title: "Nueva actividad",
    kicker: "Agenda operativa",
    note: "Programa una acción para el equipo del área productiva."
  },
  irrigation: {
    title: "Nuevo riego",
    kicker: "Agua y solución",
    note: "Registra pulso, litros, válvula y, si los tienes, pH y CE."
  },
  nutrition: {
    title: "Nueva nutrición",
    kicker: "Fertirriego y foliar",
    note: "Guarda producto, dosis, método y objetivo nutricional."
  },
  application: {
    title: "Nueva aplicación",
    kicker: "Sanidad e insumos",
    note: "Registra productos, dosis, sección, intervalo antes de cosecha y tiempo de reentrada."
  },
  pest: {
    title: "Nueva alerta sanitaria",
    kicker: "Monitoreo",
    note: "Captura problema, severidad, zona y seguimiento."
  },
  harvest: {
    title: "Nueva cosecha",
    kicker: "",
    note: ""
  },
  editHarvest: {
    title: "Corregir cosecha",
    kicker: "",
    note: ""
  },
  sale: {
    title: "Venta de cosecha",
    kicker: "Comercialización",
    note: "Registra al comprador y el precio acordado. Los descuentos y gastos de la venta son opcionales."
  },
  cost: {
    title: "Nuevos costos",
    kicker: "Finanzas",
    note: "Registra varios gastos para la misma área productiva y fecha."
  }
};

function FormShell({
  children,
  disabled,
  duplicateWarning,
  error,
  manualNote,
  layout = "default",
  onDismissDuplicate,
  onReviewDuplicate,
  onSaveDuplicate,
  onSubmit
}: {
  children: React.ReactNode;
  disabled: boolean;
  duplicateWarning?: DuplicateWarning | null;
  error: string;
  manualNote?: boolean;
  layout?: "default" | "wide";
  onDismissDuplicate?: () => void;
  onReviewDuplicate?: () => void;
  onSaveDuplicate?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const showAside = layout === "default" || manualNote || duplicateWarning || error;
  return (
    <form className={cn("relative grid gap-6", layout === "default" && "lg:grid-cols-[1fr_210px]")} onSubmit={onSubmit}>
      <div className={cn("grid gap-4 sm:grid-cols-2", layout === "wide" ? "pb-20" : "pb-4")}>{children}</div>
      {showAside ? <aside className={cn("border-t border-app-border pb-4 pt-4", layout === "default" && "lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0")}>
        {layout === "default" ? <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Registro</p>
          <p className="mt-4 text-sm leading-6 text-app-muted">Al guardar, el registro queda disponible para todo el equipo autorizado.</p>
        </> : null}
        {manualNote ? (
          <p className="mt-4 border-l-2 border-app-green bg-app-soft px-3 py-2 text-xs leading-5 text-app-muted">
            Registro manual o no programado. Si ya existe una actividad, confírmala desde Operaciones para mantener el historial limpio.
          </p>
        ) : null}
        {duplicateWarning ? (
          <div className="mt-5 border border-[#E4D7B2] bg-[#FBF6E8] p-3">
            <p className="text-sm font-semibold text-app-text">{duplicateWarning.title}</p>
            <p className="mt-2 text-xs leading-5 text-app-muted">{duplicateWarning.message}</p>
            <p className="mt-2 text-xs font-medium text-app-text">{duplicateWarning.detail}</p>
            <div className="mt-3 grid gap-2">
              <Button disabled={disabled} onClick={onSaveDuplicate} type="button" variant="primary">
                Guardar de todos modos
              </Button>
              <Button disabled={disabled} onClick={onReviewDuplicate} type="button" variant="secondary">
                Revisar operación
              </Button>
              <Button disabled={disabled} onClick={onDismissDuplicate} type="button" variant="ghost">
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        {error ? <p className="mt-5 text-sm text-[#8A2E2E]">{error}</p> : null}
      </aside> : null}
      <div className={cn("sticky bottom-0 z-20 -mx-4 -mb-5 flex flex-col gap-2 border-t border-app-border bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-5 sm:flex-row sm:justify-end sm:px-5", layout === "default" && "lg:col-span-2")}>
        <CloseButton className="w-full sm:w-auto sm:min-w-28" />
        <Button className="w-full sm:w-auto sm:min-w-28" disabled={disabled} type="submit" variant="primary">
          {disabled ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function CloseButton({ className }: { className?: string }) {
  const closeModal = useGreenhouseStore((state) => state.closeModal);

  return (
    <Button className={className} onClick={closeModal} type="button" variant="secondary">
      Cancelar
    </Button>
  );
}

function HarvestSaleBreakdownFields({
  initialCommission = 0,
  initialFreight = 0,
  initialPackaging = 0,
  open,
  onToggle
}: {
  initialCommission?: number;
  initialFreight?: number;
  initialPackaging?: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="sm:col-span-2">
      <button
        aria-controls="harvest-sale-breakdown"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-app-border bg-white px-4 text-left text-sm font-semibold text-app-text focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={onToggle}
        type="button"
      >
        Desglosar venta
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn("mt-3 gap-3 rounded-2xl border border-app-border bg-app-sidebar/35 p-4 sm:grid-cols-3", open ? "grid" : "hidden")} id="harvest-sale-breakdown">
        <Field label="Comisión por caja">
          <FormattedNumberInput defaultValue={initialCommission || ""} min="0" name="commissionPerBox" placeholder="$0.00" step="0.01" />
        </Field>
        <Field label="Flete por caja">
          <FormattedNumberInput defaultValue={initialFreight || ""} min="0" name="freightPerBox" placeholder="$0.00" step="0.01" />
        </Field>
        <Field label="Caja de cartón por caja">
          <FormattedNumberInput defaultValue={initialPackaging || ""} min="0" name="packagingPerBox" placeholder="$0.00" step="0.01" />
        </Field>
      </div>
    </section>
  );
}

export function RecordModal({ onSaved }: { onSaved?: () => void }) {
  const modal = useGreenhouseStore((state) => state.modal);
  const closeModal = useGreenhouseStore((state) => state.closeModal);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const crops = useGreenhouseStore((state) => state.crops);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const irrigationRecords = useGreenhouseStore((state) => state.irrigationRecords);
  const nutritionRecords = useGreenhouseStore((state) => state.nutritionRecords);
  const applicationRecords = useGreenhouseStore((state) => state.applicationRecords);
  const harvestRecords = useGreenhouseStore((state) => state.harvestRecords);
  const selectedHarvestId = useGreenhouseStore((state) => state.selectedHarvestId);
  const setActiveSection = useGreenhouseStore((state) => state.setActiveSection);
  const addGreenhouse = useGreenhouseStore((state) => state.addGreenhouse);
  const updateGreenhouse = useGreenhouseStore((state) => state.updateGreenhouse);
  const addTask = useGreenhouseStore((state) => state.addTask);
  const addIrrigation = useGreenhouseStore((state) => state.addIrrigation);
  const addNutrition = useGreenhouseStore((state) => state.addNutrition);
  const addApplication = useGreenhouseStore((state) => state.addApplication);
  const addPest = useGreenhouseStore((state) => state.addPest);
  const addHarvest = useGreenhouseStore((state) => state.addHarvest);
  const updateHarvest = useGreenhouseStore((state) => state.updateHarvest);
  const addCost = useGreenhouseStore((state) => state.addCost);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [costRows, setCostRows] = useState<CostDraft[]>([emptyCost()]);
  const [saleDraft, setSaleDraft] = useState<SaleDraft | null>(null);
  const [saleBreakdownOpen, setSaleBreakdownOpen] = useState(false);
  const [harvestBreakdownOpen, setHarvestBreakdownOpen] = useState(false);
  const [nutritionProducts, setNutritionProducts] = useState<NutritionProductDraft[]>([emptyNutritionProduct()]);
  const [applicationProducts, setApplicationProducts] = useState<ApplicationProductDraft[]>([emptyApplicationProduct()]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [draftCropId, setDraftCropId] = useState(INITIAL_CROP_ID);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);
  const [priceReferences, setPriceReferences] = useState<HarvestPriceReferences>({ first: [], second: [], third: [] });
  const pendingDuplicateSaveRef = useRef<(() => Promise<void>) | null>(null);
  const canAssignGreenhouseManager = currentUser.role === "owner" || currentUser.role === "admin";
  const costBatchTotal = useMemo(
    () => costRows.reduce((total, cost) => total + (parseNumericInput(cost.amount) ?? 0), 0),
    [costRows]
  );

  useEffect(() => {
    setError("");
    setDuplicateWarning(null);
    pendingDuplicateSaveRef.current = null;
    if ((modal === "harvest" || modal === "editHarvest" || modal === "sale") && currentUser.role === "manager") {
      closeModal();
      return;
    }
    if (modal === "cost") setCostRows([emptyCost()]);
    if (modal === "nutrition") setNutritionProducts([emptyNutritionProduct()]);
    if (modal === "application") setApplicationProducts([emptyApplicationProduct()]);
  }, [closeModal, currentUser.role, modal]);

  useEffect(() => {
    let cancelled = false;

    const loadManagers = async () => {
      if (!canAssignGreenhouseManager || !organization.id || (modal !== "greenhouse" && modal !== "editGreenhouse")) {
        setManagerOptions([]);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setManagerOptions([]);
        setError("No se pudo conectar con Supabase para cargar managers.");
        return;
      }

      const [membersResponse, staffResponse] = await Promise.all([
        supabase
          .from("company_members")
          .select("user_id")
          .eq("company_id", organization.id)
          .eq("role", "manager")
          .eq("status", "active"),
        supabase
          .from("company_staff")
          .select("id, full_name, phone")
          .eq("company_id", organization.id)
          .eq("role", "manager")
          .eq("status", "active")
          .order("full_name", { ascending: true })
      ]);
      if (cancelled) return;
      if (membersResponse.error) {
        setManagerOptions([]);
        setError(appErrorMessage(membersResponse.error, "No se pudieron cargar los managers activos."));
        return;
      }
      if (staffResponse.error) {
        setManagerOptions([]);
        setError(appErrorMessage(staffResponse.error, "No se pudieron cargar los encargados internos."));
        return;
      }

      const managerIds = (membersResponse.data ?? [])
        .map((member: any) => member.user_id)
        .filter((id: string | null): id is string => Boolean(id));

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", managerIds.length ? managerIds : ["00000000-0000-0000-0000-000000000000"]);
      if (cancelled) return;
      if (profilesError) {
        setManagerOptions([]);
        setError(appErrorMessage(profilesError, "No se pudieron cargar los perfiles de managers."));
        return;
      }

      const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
      const userOptions = managerIds.map((id) => {
        const profile = profileMap.get(id);
        return {
          id,
          name: profile?.full_name ?? profile?.email?.split("@")[0] ?? "Encargado",
          email: profile?.email ?? "",
          source: "user" as const
        };
      });
      const staffOptions = (staffResponse.data ?? []).map((staff: any) => ({
        id: staff.id,
        name: staff.full_name,
        email: staff.phone ?? "Sin cuenta",
        source: "staff" as const
      }));

      setManagerOptions([...userOptions, ...staffOptions]);
      setError("");
    };

    loadManagers();

    return () => {
      cancelled = true;
    };
  }, [canAssignGreenhouseManager, modal, organization.id]);

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      if (!organization.id || (modal !== "nutrition" && modal !== "application")) {
        setProductOptions([]);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setProductOptions([]);
        return;
      }

      const { data, error: productsError } = await supabase
        .from("products")
        .select("id, name, category, composition")
        .eq("company_id", organization.id)
        .order("name", { ascending: true });

      if (cancelled) return;
      if (productsError) {
        setProductOptions([]);
        setError(appErrorMessage(productsError, "No se pudo cargar el catálogo de productos."));
        return;
      }

      setProductOptions((data ?? []) as ProductOption[]);
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [modal, organization.id]);

  useEffect(() => {
    let cancelled = false;

    const loadPriceReferences = async () => {
      if (!organization.id || (modal !== "harvest" && modal !== "editHarvest")) {
        setPriceReferences({ first: [], second: [], third: [] });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data, error: priceError } = await supabase
        .from("harvest_records")
        .select("first_quality_price, second_quality_price, third_quality_price")
        .eq("company_id", organization.id)
        .order("occurred_at", { ascending: false })
        .limit(100);

      if (cancelled || priceError) return;
      setPriceReferences({
        first: (data ?? []).map((row: any) => Number(row.first_quality_price ?? 0)).filter((value) => value > 0),
        second: (data ?? []).map((row: any) => Number(row.second_quality_price ?? 0)).filter((value) => value > 0),
        third: (data ?? []).map((row: any) => Number(row.third_quality_price ?? 0)).filter((value) => value > 0)
      });
    };

    void loadPriceReferences();
    return () => { cancelled = true; };
  }, [modal, organization.id]);

  const copy = useMemo(() => (modal ? modalCopy[modal] : null), [modal]);
  const selectedGreenhouse = greenhouses.find((greenhouse) => greenhouse.id === selectedGreenhouseId)
    ?? (modal === "editGreenhouse" && selectedGreenhouseId === "__all__" ? greenhouses[0] : undefined);
  const selectedHarvest = harvestRecords.find((record) => record.id === selectedHarvestId);
  useEffect(() => {
    if (modal === "harvest") setHarvestBreakdownOpen(false);
    if (modal === "editHarvest") {
      setHarvestBreakdownOpen(Boolean(
        selectedHarvest?.sale?.commissionPerBox
        || selectedHarvest?.sale?.freightPerBox
        || selectedHarvest?.sale?.packagingPerBox
      ));
    }
  }, [modal, selectedHarvest]);
  useEffect(() => {
    if (modal !== "sale" || !selectedHarvest) return;
    const lineFor = (quality: "Primera" | "Segunda" | "Tercera") => selectedHarvest.sale?.lines.find((line) => line.quality === quality);
    const first = lineFor("Primera");
    const second = lineFor("Segunda");
    const third = lineFor("Tercera");
    setSaleDraft({
      buyerName: selectedHarvest.sale?.buyerName || selectedHarvest.destination || "",
      date: selectedHarvest.sale?.date || selectedHarvest.date,
      lines: [
        { quality: "Primera", boxCount: String(first?.boxCount ?? selectedHarvest.firstQualityBoxes), grossPricePerBox: String(first?.grossPricePerBox ?? selectedHarvest.firstQualityPrice) },
        { quality: "Segunda", boxCount: String(second?.boxCount ?? selectedHarvest.secondQualityBoxes), grossPricePerBox: String(second?.grossPricePerBox ?? selectedHarvest.secondQualityPrice) },
        { quality: "Tercera", boxCount: String(third?.boxCount ?? selectedHarvest.thirdQualityBoxes), grossPricePerBox: String(third?.grossPricePerBox ?? selectedHarvest.thirdQualityPrice) }
      ],
      commissionPerBox: selectedHarvest.sale?.commissionPerBox ? String(selectedHarvest.sale.commissionPerBox) : "",
      freightPerBox: selectedHarvest.sale?.freightPerBox ? String(selectedHarvest.sale.freightPerBox) : "",
      packagingPerBox: selectedHarvest.sale?.packagingPerBox ? String(selectedHarvest.sale.packagingPerBox) : "",
      paymentStatus: selectedHarvest.sale?.paymentStatus ?? "Pendiente",
      paidAt: selectedHarvest.sale?.paidAt ?? "",
      notes: selectedHarvest.sale?.notes ?? ""
    });
    setSaleBreakdownOpen(Boolean(
      selectedHarvest.sale?.commissionPerBox || selectedHarvest.sale?.freightPerBox || selectedHarvest.sale?.packagingPerBox
    ));
  }, [modal, selectedHarvest]);
  const saleCalculation = useMemo(() => saleDraft ? calculateHarvestSale({
    lines: saleDraft.lines,
    commissionPerBox: saleDraft.commissionPerBox,
    freightPerBox: saleDraft.freightPerBox,
    packagingPerBox: saleDraft.packagingPerBox
  }) : null, [saleDraft]);
  const defaultGreenhouseId = selectedGreenhouseId === "__all__"
    ? currentUser.role === "manager" ? greenhouses[0]?.id ?? "" : ""
    : selectedGreenhouseId;
  const activeCropOptions = crops.filter((crop) => crop.isActive);
  const cropOptions = activeCropOptions.length
    ? activeCropOptions
    : [{ id: INITIAL_CROP_ID, slug: "jitomate", name: "Jitomate", scientificName: null, defaultCycleDays: null, isActive: true }];
  const defaultCropId = selectedGreenhouse?.cropId ?? cropOptions[0]?.id ?? INITIAL_CROP_ID;
  const draftCrop = cropOptions.find((crop) => crop.id === draftCropId) ?? cropOptions[0];
  const existingVarietyForDraftCrop = selectedGreenhouse?.cropId === draftCropId ? selectedGreenhouse.variety : null;
  const draftVarietyOptions = cropVarietyOptionsForSlug(draftCrop?.slug, existingVarietyForDraftCrop);
  const greenhouseOptions = <>
    {defaultGreenhouseId === "" ? <option disabled value="">Selecciona un invernadero</option> : null}
    {greenhouses.map((greenhouse) => (
      <option key={greenhouse.id} value={greenhouse.id}>
        {greenhouseDisplayName(greenhouse, crops)}
      </option>
    ))}
  </>;

  const save = async (handler: () => Promise<void>) => {
    setError("");
    setIsSaving(true);
    try {
      await handler();
      onSaved?.();
    } catch (caught) {
      setError(appErrorMessage(caught, "No se pudo guardar el registro."));
    } finally {
      setIsSaving(false);
    }
  };

  const duplicateMessage = "Ya existe una operación confirmada para esta área y fecha con datos parecidos. Si esto viene de una actividad programada, confirma desde Operaciones para mantener el historial limpio.";

  const duplicateAreaName = (greenhouseId: string) =>
    greenhouses.find((greenhouse) => greenhouse.id === greenhouseId)
      ? greenhouseDisplayName(greenhouses.find((greenhouse) => greenhouse.id === greenhouseId)!, crops)
      : "esta área";

  const potentialIrrigationDuplicate = (record: { greenhouseId: string; date: string; liters: number; sector: string }) => {
    const match = irrigationRecords.find((item) =>
      item.sourceTaskId
      && item.greenhouseId === record.greenhouseId
      && item.date === record.date
      && (sameNumericValue(item.liters, record.liters) || sameOptionalText(item.sector, record.sector))
    );
    if (!match) return null;
    return {
      title: "Posible duplicado",
      message: duplicateMessage,
      detail: `${duplicateAreaName(record.greenhouseId)} · ${record.date} · ${record.liters.toLocaleString("es-MX")} L`
    };
  };

  const potentialNutritionDuplicate = (records: Array<{ greenhouseId: string; date: string; product: string; dose: string }>) => {
    const firstRecord = records[0];
    if (!firstRecord) return null;
    const match = nutritionRecords.find((item) =>
      item.sourceTaskId
      && item.greenhouseId === firstRecord.greenhouseId
      && item.date === firstRecord.date
      && records.some((record) => sameOptionalText(item.product, record.product) && sameOptionalText(item.dose, record.dose))
    );
    if (!match) return null;
    return {
      title: "Posible duplicado",
      message: duplicateMessage,
      detail: `${duplicateAreaName(firstRecord.greenhouseId)} · ${firstRecord.date} · ${match.product} ${match.dose}`
    };
  };

  const potentialApplicationDuplicate = (records: Array<{ greenhouseId: string; date: string; product: string; dose: string }>) => {
    const firstRecord = records[0];
    if (!firstRecord) return null;
    const match = applicationRecords.find((item) =>
      item.sourceTaskId
      && item.greenhouseId === firstRecord.greenhouseId
      && item.date === firstRecord.date
      && records.some((record) => sameOptionalText(item.product, record.product) && sameOptionalText(item.dose, record.dose))
    );
    if (!match) return null;
    return {
      title: "Posible duplicado",
      message: duplicateMessage,
      detail: `${duplicateAreaName(firstRecord.greenhouseId)} · ${firstRecord.date} · ${match.product} ${match.dose}`
    };
  };

  const potentialHarvestDuplicate = (record: { greenhouseId: string; date: string; kilograms: number; boxCount: number }) => {
    const match = harvestRecords.find((item) =>
      item.sourceTaskId
      && item.greenhouseId === record.greenhouseId
      && item.date === record.date
      && (sameNumericValue(item.kilograms, record.kilograms) || sameNumericValue(item.boxCount, record.boxCount))
    );
    if (!match) return null;
    const detailValue = record.boxCount > 0
      ? `${record.boxCount.toLocaleString("es-MX")} cajas`
      : `${record.kilograms.toLocaleString("es-MX")} kg`;
    return {
      title: "Posible duplicado",
      message: duplicateMessage,
      detail: `${duplicateAreaName(record.greenhouseId)} · ${record.date} · ${detailValue}`
    };
  };

  const saveManualRecord = (warning: DuplicateWarning | null, handler: () => Promise<void>) => {
    if (warning) {
      pendingDuplicateSaveRef.current = handler;
      setDuplicateWarning(warning);
      setError("");
      return;
    }
    save(handler);
  };

  const dismissDuplicateWarning = () => {
    pendingDuplicateSaveRef.current = null;
    setDuplicateWarning(null);
  };

  const saveDuplicateAnyway = () => {
    const handler = pendingDuplicateSaveRef.current;
    pendingDuplicateSaveRef.current = null;
    setDuplicateWarning(null);
    if (handler) save(handler);
  };

  const reviewDuplicateOperation = () => {
    dismissDuplicateWarning();
    closeModal();
    setActiveSection("calendar");
  };

  useEffect(() => {
    if (modal === "greenhouse" || modal === "editGreenhouse") {
      setDraftCropId(defaultCropId);
    }
  }, [defaultCropId, modal]);

  const managerValueFor = (manager: ManagerOption) => `${manager.source}:${manager.id}`;
  const selectedManagerValueFor = (greenhouse?: Greenhouse) => {
    if (greenhouse?.managerUserId) return `user:${greenhouse.managerUserId}`;
    if (greenhouse?.managerStaffId) return `staff:${greenhouse.managerStaffId}`;
    return managerOptions[0] ? managerValueFor(managerOptions[0]) : "";
  };
  const managerNameFor = (managerUserId: string | null, managerStaffId: string | null) =>
    managerOptions.find((manager) =>
      (manager.source === "user" && manager.id === managerUserId)
      || (manager.source === "staff" && manager.id === managerStaffId)
    )?.name
    ?? (managerUserId === currentUser.id ? currentUser.fullName : "Sin encargado");

  const manualRecordShellProps = {
    duplicateWarning,
    manualNote: true,
    onDismissDuplicate: dismissDuplicateWarning,
    onReviewDuplicate: reviewDuplicateOperation,
    onSaveDuplicate: saveDuplicateAnyway
  };

  const ensureProduct = async ({
    productId,
    product,
    composition,
    category
  }: {
    productId: string;
    product: string;
    composition?: string;
    category?: ApplicationRecord["category"] | "";
  }) => {
    const productName = product.trim();
    if (!productName) return { productId: "", product: productName, composition: composition ?? "" };
    if (productId) return { productId, product: productName, composition: composition ?? "" };

    const existingProduct = productOptions.find((option) => normalizedProductName(option.name) === normalizedProductName(productName));
    if (existingProduct) {
      return {
        productId: existingProduct.id,
        product: existingProduct.name,
        composition: existingProduct.composition ?? composition ?? ""
      };
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { productId: "", product: productName, composition: composition ?? "" };

    const { data } = await supabase
      .from("products")
      .insert({
        company_id: organization.id,
        name: productName,
        category: category ? applicationCategoryToDb[category] : null,
        composition: composition?.trim() || null
      })
      .select("id, name, category, composition")
      .single();

    if (!data) return { productId: "", product: productName, composition: composition ?? "" };

    const newProduct = data as ProductOption;
    setProductOptions((current) => [...current, newProduct].sort((a, b) => a.name.localeCompare(b.name, "es-MX")));
    return {
      productId: newProduct.id,
      product: newProduct.name,
      composition: newProduct.composition ?? composition ?? ""
    };
  };

  const createUnplannedTechnicalWork = async ({
    greenhouseId,
    type,
    title,
    occurredAt,
    materials = []
  }: {
    greenhouseId: string;
    type: "riego" | "fertirriego" | "fertilizacion" | "aplicacion_foliar" | "cosecha";
    title: string;
    occurredAt: string;
    materials?: Array<{ productId: string; productName: string; dose: string; notes?: string }>;
  }) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw new Error("No se pudo conectar con Supabase.");
    const { data, error: rpcError } = await supabase.rpc("create_unplanned_work", {
      target_company_id: organization.id,
      target_greenhouse_id: greenhouseId,
      target_type: type,
      target_title: title,
      target_occurred_at: occurredAt,
      target_payload: { materials }
    });
    if (rpcError) throw rpcError;
    const result = data as { workId?: string; materialIds?: string[] } | null;
    if (!result?.workId) throw new Error("No se pudo crear la actividad no planeada.");
    return { workId: result.workId, materialIds: result.materialIds ?? [] };
  };

  const readGreenhouseForm = (form: FormData): Omit<Greenhouse, "id"> => {
    const managerValue = String(form.get("managerRef") ?? "").trim();
    const managerUserId = managerValue.startsWith("user:") ? managerValue.replace("user:", "") : null;
    const managerStaffId = managerValue.startsWith("staff:") ? managerValue.replace("staff:", "") : null;
    const cropId = String(form.get("cropId") ?? defaultCropId).trim() || null;
    const transplantDate = String(form.get("transplantDate"));
    const surfaceM2 = requiredNumber(form.get("surfaceM2"));

    return {
      name: String(form.get("name")),
      location: String(form.get("location")),
      latitude: optionalNumber(form.get("latitude")),
      longitude: optionalNumber(form.get("longitude")),
      locationAccuracyM: optionalNumber(form.get("locationAccuracyM")),
      surfaceM2,
      surface: surfaceM2 ? `${surfaceM2.toLocaleString("es-MX")} m2` : "Sin superficie",
      budgetAmount: optionalNumber(form.get("budgetAmount")),
      cropId,
      variety: String(form.get("variety") ?? "").trim(),
      transplantDate,
      plants: requiredNumber(form.get("plants")),
      stemCount: Number(form.get("stemCount")) === 1 || Number(form.get("stemCount")) === 2
        ? Number(form.get("stemCount")) as 1 | 2
        : null,
      isGrafted: String(form.get("isGrafted") ?? "") === "" ? null : String(form.get("isGrafted")) === "true",
      stage: cropStageFromDdt(daysSince(transplantDate)),
      managerUserId,
      managerStaffId,
      manager: managerNameFor(managerUserId, managerStaffId),
      beds: requiredNumber(form.get("beds")),
      daysSinceTransplant: daysSince(transplantDate),
      healthStatus: "Baja",
      temperature: 0,
      humidity: 0,
      estimatedProductionKg: 0
    };
  };

  const greenhousePayload = (form: FormData, greenhouse: Omit<Greenhouse, "id">) => ({
    name: greenhouse.name,
    location: greenhouse.location,
    latitude: greenhouse.latitude,
    longitude: greenhouse.longitude,
    location_accuracy_m: greenhouse.locationAccuracyM,
    surface_m2: greenhouse.surfaceM2,
    budget_amount: greenhouse.budgetAmount,
    crop_id: greenhouse.cropId,
    crop_variety: greenhouse.variety,
    tomato_variety: greenhouse.cropId === INITIAL_CROP_ID ? greenhouse.variety : null,
    transplant_date: greenhouse.transplantDate || null,
    plants_count: greenhouse.plants,
    stem_count: greenhouse.stemCount,
    is_grafted: greenhouse.isGrafted,
    beds_count: greenhouse.beds,
    crop_stage: cropStageToDbValue(greenhouse.stage),
    manager_user_id: greenhouse.managerUserId,
    manager_staff_id: greenhouse.managerStaffId,
    health_status: riskLevelToDb[greenhouse.healthStatus]
  });

  const handleGreenhouse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const greenhouse = readGreenhouseForm(form);
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("greenhouses")
        .insert({
          company_id: organization.id,
          ...greenhousePayload(form, greenhouse)
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      addGreenhouse({ ...greenhouse, id: data.id });
    });
  };

  const handleEditGreenhouse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGreenhouse) return;
    const form = new FormData(event.currentTarget);
    save(async () => {
      const greenhouse = {
        ...selectedGreenhouse,
        ...readGreenhouseForm(form),
        healthStatus: selectedGreenhouse.healthStatus,
        temperature: selectedGreenhouse.temperature,
        humidity: selectedGreenhouse.humidity,
        estimatedProductionKg: selectedGreenhouse.estimatedProductionKg
      };
      const { error: updateError } = await getSupabaseBrowserClient()!
        .from("greenhouses")
        .update(greenhousePayload(form, greenhouse))
        .eq("id", selectedGreenhouse.id)
        .eq("company_id", organization.id);
      if (updateError) throw updateError;
      updateGreenhouse(greenhouse);
    });
  };

  const handleTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const greenhouseId = String(form.get("greenhouseId"));
      const type = String(form.get("type")) as TaskType;
      const record = {
        greenhouseId,
        type,
        title: String(form.get("title")),
        date: String(form.get("date")),
        time: String(form.get("time")),
        status: "Pendiente" as const,
        responsible: currentUser.fullName
      };
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("tasks")
        .insert({
          company_id: organization.id,
          greenhouse_id: greenhouseId,
          type: taskTypeToDb[type],
          title: record.title,
          scheduled_date: record.date,
          scheduled_time: record.time || null,
          status: "pendiente",
          responsible_user_id: currentUser.id,
          created_by: currentUser.id
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      addTask({ ...record, id: insertedId(data, "No se pudo confirmar la actividad guardada.") });
    });
  };

  const handleIrrigation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const record = {
      greenhouseId: String(form.get("greenhouseId")),
      date: String(form.get("date")),
      durationMin: requiredNumber(form.get("durationMin")),
      liters: requiredNumber(form.get("liters")),
      sector: String(form.get("sector")),
      ph: optionalNumber(form.get("ph")),
      ec: optionalNumber(form.get("ec")),
      notes: String(form.get("notes")),
      responsible: currentUser.fullName
    };
    saveManualRecord(potentialIrrigationDuplicate(record), async () => {
      const work = await createUnplannedTechnicalWork({
        greenhouseId: record.greenhouseId,
        type: "riego",
        title: "Riego no planeado",
        occurredAt: record.date
      });
      const { data, error: rpcError } = await getSupabaseBrowserClient()!.rpc("complete_irrigation_task", {
        target_task_id: work.workId,
        target_occurred_at: record.date,
        target_duration_min: record.durationMin,
        target_estimated_liters: record.liters,
        target_sector: record.sector || null,
        target_ph: record.ph,
        target_ec: record.ec,
        target_notes: record.notes || null
      });
      if (rpcError) throw rpcError;
      addIrrigation({ ...record, id: rpcRecordId(data as { recordId?: string }, "No se pudo confirmar el riego guardado."), sourceTaskId: work.workId });
    });
  };

  const handleNutrition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const greenhouseId = String(form.get("greenhouseId"));
    const occurredAt = String(form.get("date"));
    const duplicateRecords = nutritionProducts.map((product) => ({
      greenhouseId,
      date: occurredAt,
      product: product.product,
      dose: product.dose
    }));
    saveManualRecord(potentialNutritionDuplicate(duplicateRecords), async () => {
      const targetGreenhouse = greenhouses.find((greenhouse) => greenhouse.id === greenhouseId);
      const stage = cropStageFromDdt(daysBetween(targetGreenhouse?.transplantDate, occurredAt));
      const resolvedProducts = await Promise.all(nutritionProducts.map((product) => ensureProduct(product)));
      const records = resolvedProducts.map((product, index) => ({
        greenhouseId,
        date: occurredAt,
        productId: product.productId,
        product: product.product,
        dose: nutritionProducts[index].dose,
        method: String(form.get("method")) as NutritionRecord["method"],
        ph: Number(form.get("ph")),
        ec: Number(form.get("ec")),
        stage,
        objective: String(form.get("objective")) as NutritionRecord["objective"],
        notes: String(form.get("notes"))
      }));
      const work = await createUnplannedTechnicalWork({
        greenhouseId,
        type: records[0]?.method === "Fertirriego" ? "fertirriego" : "fertilizacion",
        title: "Nutrición no planeada",
        occurredAt,
        materials: records.map((record) => ({ productId: record.productId, productName: record.product, dose: record.dose, notes: record.notes }))
      });
      const { data, error: rpcError } = await getSupabaseBrowserClient()!.rpc("complete_nutrition_task", {
        target_task_id: work.workId,
        target_occurred_at: occurredAt,
        target_method: nutritionMethodToDb[records[0]?.method ?? "Fertilización"],
        target_crop_stage: cropStageToDbValue(records[0]?.stage ?? "Vegetativo"),
        target_objective: nutritionObjectiveToDb[records[0]?.objective ?? "Desarrollo"],
        target_ph: records[0]?.ph,
        target_ec: records[0]?.ec,
        target_notes: records[0]?.notes || null,
        target_products: records.map((record, index) => ({
          materialId: work.materialIds[index], productName: record.product, dose: record.dose
        }))
      });
      if (rpcError) throw rpcError;
      const recordIds = (data as { recordIds?: string[] } | null)?.recordIds ?? [];
      records.forEach((record, index) => {
        addNutrition({
          ...record,
          id: recordIds[index] ?? (() => { throw new Error("No se pudo confirmar la nutrición guardada."); })(),
          sourceTaskId: work.workId
        });
      });
    });
  };

  const handleApplication = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (applicationProducts.some((product) => !product.category)) {
      setError("Selecciona la categoría de los productos que todavía no la tienen en el catálogo.");
      event.currentTarget.querySelector<HTMLSelectElement>('select:invalid')?.focus();
      return;
    }
    const form = new FormData(event.currentTarget);
    const duplicateRecords = applicationProducts.map((product) => ({
      greenhouseId: String(form.get("greenhouseId")),
      date: String(form.get("date")),
      product: product.product,
      dose: product.dose
    }));
    saveManualRecord(potentialApplicationDuplicate(duplicateRecords), async () => {
      const resolvedProducts = await Promise.all(applicationProducts.map((product) => ensureProduct(product)));
      const records = applicationProducts.map((product, index) => ({
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        category: product.category as ApplicationRecord["category"],
        productId: resolvedProducts[index].productId,
        product: resolvedProducts[index].product,
        composition: resolvedProducts[index].composition,
        dose: product.dose,
        area: String(form.get("area")),
        responsible: currentUser.fullName,
        safetyInterval: String(form.get("safetyInterval")),
        reentry: String(form.get("reentry")),
        notes: String(form.get("notes"))
      }));
      const work = await createUnplannedTechnicalWork({
        greenhouseId: records[0]?.greenhouseId ?? "",
        type: "aplicacion_foliar",
        title: "Aplicación no planeada",
        occurredAt: records[0]?.date ?? "",
        materials: records.map((record) => ({ productId: record.productId, productName: record.product, dose: record.dose, notes: record.notes }))
      });
      const { data, error: rpcError } = await getSupabaseBrowserClient()!.rpc("complete_application_task", {
        target_task_id: work.workId,
        target_occurred_at: records[0]?.date,
        target_applied_area: records[0]?.area || null,
        target_applications: records.map((record, index) => ({
          materialId: work.materialIds[index], productName: record.product, dose: record.dose,
          category: applicationCategoryToDb[record.category], composition: record.composition,
          safetyInterval: record.safetyInterval, reentryInterval: record.reentry, notes: record.notes
        }))
      });
      if (rpcError) throw rpcError;
      const recordIds = (data as { recordIds?: string[] } | null)?.recordIds ?? [];
      records.forEach((record, index) => {
        addApplication({
          ...record,
          id: recordIds[index] ?? (() => { throw new Error("No se pudo confirmar la aplicación guardada."); })(),
          sourceTaskId: work.workId
        });
      });
    });
  };

  const handlePest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const photo = form.get("photo");
      const supabase = getSupabaseBrowserClient()!;
      let photoStoragePath: string | undefined;
      let photoUrl: string | undefined;
      if (photo instanceof File && photo.size > 0) {
        photoStoragePath = await uploadPrivateCompanyFile({
          bucket: "pest-photos",
          companyId: organization.id,
          file: photo,
          supabase,
          type: "pest"
        });
        photoUrl = await createPrivateCompanyFileUrl({
          bucket: "pest-photos",
          path: photoStoragePath,
          supabase
        });
      }
      const record = {
        greenhouseId: String(form.get("greenhouseId")),
        problem: String(form.get("problem")),
        severity: String(form.get("severity")) as RiskLevel,
        zone: String(form.get("zone")),
        detectedAt: String(form.get("detectedAt")),
        action: String(form.get("action")),
        followUp: pestFollowUpText(form),
        caseStatus: "Abierta" as const,
        photoStoragePath,
        photoUrl
      };
      const { data, error: insertError } = await supabase
        .from("pest_alerts")
        .insert({
          company_id: organization.id,
          greenhouse_id: record.greenhouseId,
          problem: record.problem,
          severity: riskLevelToDb[record.severity],
          affected_zone: record.zone,
          detected_at: record.detectedAt,
          action_taken: record.action,
          follow_up: record.followUp,
          photo_storage_path: record.photoStoragePath ?? null,
          photo_url: null,
          responsible_user_id: currentUser.id,
          created_by: currentUser.id
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      addPest({ ...record, id: insertedId(data, "No se pudo confirmar la alerta sanitaria guardada.") });
    });
  };

  const readHarvestForm = (form: FormData) => {
    const { estimatedRevenue: _estimatedRevenue, ...values } = harvestValuesFromForm(form);
    return {
      greenhouseId: String(form.get("greenhouseId")),
      date: String(form.get("date")),
      ...values,
      destination: String(form.get("destination")),
      notes: String(form.get("notes"))
    };
  };

  const saveHarvestBreakdown = async ({
    existingSale,
    form,
    harvestId,
    record
  }: {
    existingSale?: NonNullable<HarvestRecord["sale"]>;
    form: FormData;
    harvestId: string;
    record: ReturnType<typeof readHarvestForm>;
  }) => {
    const commissionPerBox = requiredNumber(form.get("commissionPerBox"));
    const freightPerBox = requiredNumber(form.get("freightPerBox"));
    const packagingPerBox = requiredNumber(form.get("packagingPerBox"));
    if (!existingSale && commissionPerBox === 0 && freightPerBox === 0 && packagingPerBox === 0) return;

    const { error: saleError } = await getSupabaseBrowserClient()!.rpc("upsert_harvest_sale", {
      target_harvest_record_id: harvestId,
      target_sale_id: existingSale?.id ?? null,
      target_buyer_name: record.destination.trim(),
      target_occurred_at: record.date,
      target_commission_per_box: commissionPerBox,
      target_freight_per_box: freightPerBox,
      target_packaging_per_box: packagingPerBox,
      target_payment_status: existingSale?.paymentStatus === "Pagada" ? "paid" : "pending",
      target_paid_at: existingSale?.paidAt ?? null,
      target_notes: existingSale?.notes || null,
      target_lines: [
        { quality: "Primera", boxCount: record.firstQualityBoxes, grossPricePerBox: record.firstQualityPrice },
        { quality: "Segunda", boxCount: record.secondQualityBoxes, grossPricePerBox: record.secondQualityPrice },
        { quality: "Tercera", boxCount: record.thirdQualityBoxes, grossPricePerBox: record.thirdQualityPrice }
      ]
    });
    if (saleError) throw saleError;
  };

  const handleHarvest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (currentUser.role === "manager") {
      setError("Tu rol solo puede consultar las cosechas registradas.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const record = readHarvestForm(form);
    saveManualRecord(potentialHarvestDuplicate(record), async () => {
      const work = await createUnplannedTechnicalWork({
        greenhouseId: record.greenhouseId,
        type: "cosecha",
        title: "Cosecha no planeada",
        occurredAt: record.date
      });
      const { data, error: rpcError } = await getSupabaseBrowserClient()!.rpc("complete_harvest_task", {
        target_task_id: work.workId,
        target_occurred_at: record.date,
        target_kilograms: record.kilograms,
        target_first_quality_kg: record.firstQuality,
        target_second_quality_kg: record.secondQuality,
        target_merma_kg: record.merma,
        target_estimated_price: record.estimatedPrice,
        target_destination: record.destination || null,
        target_notes: record.notes || null,
        target_box_count: record.boxCount,
        target_box_weight_kg: record.boxWeightKg,
        target_first_quality_boxes: record.firstQualityBoxes,
        target_second_quality_boxes: record.secondQualityBoxes,
        target_third_quality_boxes: record.thirdQualityBoxes,
        target_merma_boxes: record.mermaBoxes,
        target_third_quality_kg: record.thirdQuality,
        target_first_quality_price: record.firstQualityPrice,
        target_second_quality_price: record.secondQualityPrice,
        target_third_quality_price: record.thirdQualityPrice
      });
      if (rpcError) throw rpcError;
      const harvestId = rpcRecordId(data as { recordId?: string }, "No se pudo confirmar la cosecha guardada.");
      await saveHarvestBreakdown({ form, harvestId, record });
      addHarvest({ ...record, id: harvestId, sourceTaskId: work.workId });
    });
  };

  const handleEditHarvest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedHarvest) return;
    if (currentUser.role === "manager") {
      setError("Tu rol solo puede consultar las cosechas registradas.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const record = readHarvestForm(form);
    save(async () => {
      const { error: updateError } = await getSupabaseBrowserClient()!.rpc("update_harvest_record", {
        target_harvest_record_id: selectedHarvest.id,
        target_occurred_at: record.date,
        target_box_count: record.boxCount,
        target_box_weight_kg: record.boxWeightKg,
        target_first_quality_boxes: record.firstQualityBoxes,
        target_second_quality_boxes: record.secondQualityBoxes,
        target_third_quality_boxes: record.thirdQualityBoxes,
        target_merma_boxes: record.mermaBoxes,
        target_first_quality_price: record.firstQualityPrice,
        target_second_quality_price: record.secondQualityPrice,
        target_third_quality_price: record.thirdQualityPrice,
        target_destination: record.destination || null,
        target_notes: record.notes || null,
        target_change_note: String(form.get("changeNote") ?? "").trim()
      });
      if (updateError) throw updateError;
      await saveHarvestBreakdown({ existingSale: selectedHarvest.sale, form, harvestId: selectedHarvest.id, record });
      updateHarvest({ ...selectedHarvest, ...record });
    });
  };

  const handleCost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const records = costRows.map((cost) => ({
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        category: cost.category,
        amount: requiredNumber(cost.amount),
        quantity: optionalNumber(cost.quantity),
        unit: cost.unit.trim(),
        unitPrice: optionalNumber(cost.unitPrice),
        notes: cost.notes
      }));
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("cost_records")
        .insert(records.map((record) => ({
          company_id: organization.id,
          greenhouse_id: record.greenhouseId || null,
          category: costCategoryToDb[record.category],
          amount: record.amount,
          quantity: record.quantity,
          unit: record.unit || null,
          unit_price: record.unitPrice,
          occurred_at: record.date,
          notes: record.notes,
          created_by: currentUser.id
        })))
        .select("id");
      if (insertError) throw insertError;
      records.forEach((record, index) => {
        addCost({
          ...record,
          id: insertedId(data?.[index], "No se pudo confirmar el costo guardado.")
        });
      });
    });
  };

  const handleSale = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedHarvest || !saleDraft || !saleCalculation) return;
    if (saleCalculation.soldBoxes <= 0) {
      setError("Registra al menos una caja vendida.");
      return;
    }
    if (!saleCalculation.isValid) {
      setError("Los gastos por caja no pueden superar el precio de venta.");
      return;
    }
    save(async () => {
      const { error: saleError } = await getSupabaseBrowserClient()!.rpc("upsert_harvest_sale", {
        target_harvest_record_id: selectedHarvest.id,
        target_sale_id: selectedHarvest.sale?.id ?? null,
        target_buyer_name: saleDraft.buyerName.trim(),
        target_occurred_at: saleDraft.date,
        target_commission_per_box: parseNumericInput(saleDraft.commissionPerBox) ?? 0,
        target_freight_per_box: parseNumericInput(saleDraft.freightPerBox) ?? 0,
        target_packaging_per_box: parseNumericInput(saleDraft.packagingPerBox) ?? 0,
        target_payment_status: saleDraft.paymentStatus === "Pagada" ? "paid" : "pending",
        target_paid_at: saleDraft.paymentStatus === "Pagada" ? saleDraft.paidAt || saleDraft.date : null,
        target_notes: saleDraft.notes.trim() || null,
        target_lines: saleCalculation.lines.map((line) => ({
          quality: line.quality,
          boxCount: line.boxCount,
          grossPricePerBox: line.grossPricePerBox
        }))
      });
      if (saleError) throw saleError;
      closeModal();
    });
  };

  const isGreenhouseFormModal = modal === "greenhouse" || modal === "editGreenhouse";

  return (
    <Modal
      bodyClassName={cn(
        modal === "cost" && "sm:min-h-[calc(96vh-64px)] sm:max-h-[calc(96vh-64px)]",
        isGreenhouseFormModal && "sm:h-[calc(92vh-64px)] sm:max-h-[calc(92vh-64px)]"
      )}
      open={modal !== null}
      panelClassName={cn(
        modal === "cost" && "sm:max-h-[96vh] sm:min-h-[96vh] sm:max-w-5xl",
        isGreenhouseFormModal && "sm:h-[92vh] sm:max-h-[92vh] sm:max-w-5xl"
      )}
      title={copy?.title ?? ""}
      onClose={closeModal}
    >
      {copy?.kicker || copy?.note ? (
        <div className="mb-6 border-b border-app-border pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-app-muted">{copy.kicker}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-app-muted">{copy.note}</p>
        </div>
      ) : null}

      {modal === "greenhouse" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleGreenhouse}>
          <Field label="Nombre del área">
            <TextInput name="name" required placeholder="Hectárea 2" />
          </Field>
          <PreciseLocationField key="new-greenhouse-location" />
          <Field label="Superficie m2">
            <FormattedNumberInput name="surfaceM2" defaultValue={0} />
          </Field>
          <Field label="Presupuesto del ciclo">
            <BudgetInput />
          </Field>
          <Field label="Cultivo">
            <SelectInput
              name="cropId"
              onChange={(event) => setDraftCropId(event.target.value)}
              required
              value={draftCropId}
            >
              {cropOptions.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Variedad">
            <SelectInput key={`new-${draftCropId}`} name="variety" required defaultValue={draftVarietyOptions[0]}>
              {draftVarietyOptions.map((variety) => (
                <option key={variety}>{variety}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Fecha de trasplante">
            <DatePickerInput max={todayInputValue()} name="transplantDate" />
          </Field>
          <Field label="Plantas">
            <FormattedNumberInput name="plants" defaultValue={0} />
          </Field>
          <Field label="Manejo de tallos">
            <SelectInput name="stemCount" defaultValue="">
              <option value="">Sin configurar</option>
              <option value="1">Un tallo</option>
              <option value="2">Doble tallo</option>
            </SelectInput>
          </Field>
          <Field label="Injerto">
            <SelectInput name="isGrafted" defaultValue="">
              <option value="">Sin configurar</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </SelectInput>
          </Field>
          <Field label="Camas">
            <FormattedNumberInput name="beds" defaultValue={0} />
          </Field>
          {canAssignGreenhouseManager ? (
            <Field label="Encargado">
              <SelectInput name="managerRef" defaultValue={managerOptions[0] ? managerValueFor(managerOptions[0]) : ""} required>
                {managerOptions.length ? (
                  managerOptions.map((manager) => (
                    <option key={`${manager.source}-${manager.id}`} value={managerValueFor(manager)}>
                      {manager.name}
                    </option>
                  ))
                ) : (
                  <option value="">No hay encargados activos</option>
                )}
              </SelectInput>
            </Field>
          ) : null}
        </FormShell>
      ) : null}

      {modal === "editGreenhouse" && selectedGreenhouse ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleEditGreenhouse}>
          <Field label="Nombre del área">
            <TextInput name="name" required defaultValue={selectedGreenhouse.name} />
          </Field>
          <PreciseLocationField
            key={`greenhouse-location-${selectedGreenhouse.id}`}
            accuracyDefaultValue={selectedGreenhouse.locationAccuracyM}
            latitudeDefaultValue={selectedGreenhouse.latitude}
            locationDefaultValue={selectedGreenhouse.location}
            longitudeDefaultValue={selectedGreenhouse.longitude}
          />
          <Field label="Superficie m2">
            <FormattedNumberInput
              name="surfaceM2"
              defaultValue={selectedGreenhouse.surfaceM2 ?? 0}
            />
          </Field>
          <Field label="Cultivo">
            <SelectInput
              name="cropId"
              onChange={(event) => setDraftCropId(event.target.value)}
              required
              value={draftCropId}
            >
              {cropOptions.map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Variedad">
            <SelectInput
              defaultValue={draftVarietyOptions.find((variety) => variety.toLowerCase() === selectedGreenhouse.variety.toLowerCase()) ?? draftVarietyOptions[0]}
              key={`edit-${selectedGreenhouse.id}-${draftCropId}`}
              name="variety"
              required
            >
              {draftVarietyOptions.map((variety) => (
                <option key={variety}>{variety}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Presupuesto del ciclo">
            <BudgetInput defaultValue={selectedGreenhouse.budgetAmount ?? ""} />
          </Field>
          <Field label="Fecha de trasplante">
            <DatePickerInput max={todayInputValue()} name="transplantDate" defaultValue={selectedGreenhouse.transplantDate} />
          </Field>
          <Field label="Plantas">
            <FormattedNumberInput name="plants" defaultValue={selectedGreenhouse.plants} />
          </Field>
          <Field label="Manejo de tallos">
            <SelectInput name="stemCount" defaultValue={selectedGreenhouse.stemCount?.toString() ?? ""}>
              <option value="">Sin configurar</option>
              <option value="1">Un tallo</option>
              <option value="2">Doble tallo</option>
            </SelectInput>
          </Field>
          <Field label="Injerto">
            <SelectInput name="isGrafted" defaultValue={selectedGreenhouse.isGrafted === null ? "" : String(selectedGreenhouse.isGrafted)}>
              <option value="">Sin configurar</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </SelectInput>
          </Field>
          <Field label="Camas">
            <FormattedNumberInput name="beds" defaultValue={selectedGreenhouse.beds} />
          </Field>
          {canAssignGreenhouseManager ? (
            <Field label="Encargado">
              <SelectInput name="managerRef" defaultValue={selectedManagerValueFor(selectedGreenhouse)} required>
                {managerOptions.length ? (
                  managerOptions.map((manager) => (
                    <option key={`${manager.source}-${manager.id}`} value={managerValueFor(manager)}>
                      {manager.name}
                    </option>
                  ))
                ) : (
                  <option value="">No hay encargados activos</option>
                )}
              </SelectInput>
            </Field>
          ) : null}
        </FormShell>
      ) : null}

      {modal === "task" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleTask}>
          <Field label="Área productiva">
            <SelectInput name="greenhouseId" required defaultValue={defaultGreenhouseId}>{greenhouseOptions}</SelectInput>
          </Field>
          <Field label="Tipo">
            <SelectInput name="type" defaultValue="Riego">
              {Object.keys(taskTypeToDb).map((type) => <option key={type}>{type}</option>)}
            </SelectInput>
          </Field>
          <Field label="Título">
            <TextInput name="title" required placeholder="Revisión sector norte" />
          </Field>
          <Field label="Fecha">
            <DatePickerInput name="date" required defaultValue={todayInputValue()} />
          </Field>
          <Field label="Hora">
            <TimePickerInput name="time" />
          </Field>
        </FormShell>
      ) : null}

      {modal === "irrigation" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleIrrigation} {...manualRecordShellProps}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" required defaultValue={defaultGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><DatePickerInput name="date" required defaultValue={todayInputValue()} /></Field>
          <Field label="Duración min"><FormattedNumberInput name="durationMin" required defaultValue={0} /></Field>
          <Field label="Litros estimados"><FormattedNumberInput name="liters" required defaultValue={0} /></Field>
          <Field label="Sector o válvula"><TextInput name="sector" placeholder="Válvula A1" /></Field>
          <Field label="pH"><TextInput name="ph" step="0.1" type="number" placeholder="Opcional" /></Field>
          <Field label="CE"><TextInput name="ec" step="0.1" type="number" placeholder="Opcional" /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "nutrition" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleNutrition} {...manualRecordShellProps}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" required defaultValue={defaultGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><DatePickerInput name="date" required defaultValue={todayInputValue()} /></Field>
          <section className="border-t border-app-border pt-5 sm:col-span-2">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Productos y mezcla</p>
                <p className="mt-2 text-xs text-app-muted">Registra productos, dosis y mezcla aplicada.</p>
              </div>
              <Button className="h-8" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNutritionProducts((current) => [...current, emptyNutritionProduct()])} type="button" variant="ghost">
                Producto
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {nutritionProducts.map((product, index) => (
              <div key={index} className="grid gap-2 border-t border-app-border pt-3 sm:grid-cols-[1.3fr_0.7fr_auto]">
                <ProductCatalogCombobox
                  ariaLabel={`Producto ${index + 1}`}
                  productId={product.productId}
                  products={productOptions}
                  value={product.product}
                  required
                  onChange={(selection) => setNutritionProducts((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? {
                      ...item,
                      productId: selection.productId,
                      product: selection.productName
                    } : item
                  ))}
                />
                <FormattedQuantityInput
                  aria-label={`Dosis ${index + 1}`}
                  onChange={(event) => setNutritionProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dose: event.target.value } : item))}
                  placeholder="Dosis"
                  required
                  value={product.dose}
                />
                <Button aria-label={`Quitar producto ${index + 1}`} className="h-11 w-11 px-0" icon={<Minus className="h-4 w-4" />} onClick={() => setNutritionProducts((current) => current.length === 1 ? [emptyNutritionProduct()] : current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="ghost" />
              </div>
              ))}
            </div>
          </section>
          <Field label="Método"><SelectInput name="method" defaultValue="Fertirriego">{["Fertirriego", "Foliar", "Drench"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Objetivo"><SelectInput name="objective" defaultValue={selectedGreenhouse?.stage === "Vegetativo" ? "Desarrollo" : "Engorde"}>{Object.keys(nutritionObjectiveToDb).map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="pH"><TextInput name="ph" step="0.1" type="number" defaultValue={0} /></Field>
          <Field label="CE"><TextInput name="ec" step="0.1" type="number" defaultValue={0} /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "application" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleApplication} {...manualRecordShellProps}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" required defaultValue={defaultGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><DatePickerInput name="date" required defaultValue={todayInputValue()} /></Field>
          <section className="border-t border-app-border pt-5 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Productos y mezcla</p>
                <p className="mt-2 text-xs text-app-muted">Registra productos, dosis y mezcla aplicada.</p>
              </div>
              <Button className="h-8" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setApplicationProducts((current) => [...current, emptyApplicationProduct()])} type="button" variant="ghost">
                Producto
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {applicationProducts.map((product, index) => (
              <div key={index} className="grid gap-2 border-t border-app-border pt-3 sm:grid-cols-[1.3fr_0.7fr_0.8fr_auto]">
                <ProductCatalogCombobox
                  ariaLabel={`Producto ${index + 1}`}
                  composition={product.composition}
                  productId={product.productId}
                  products={productOptions}
                  value={product.product}
                  required
                  onChange={(selection) => setApplicationProducts((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? {
                      ...item,
                      productId: selection.productId,
                      product: selection.productName,
                      category: applicationCategoryFromDb(selection.category),
                      composition: selection.composition
                    } : item
                  ))}
                />
                <FormattedQuantityInput aria-label={`Dosis ${index + 1}`} onChange={(event) => setApplicationProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dose: event.target.value } : item))} placeholder="Dosis" required value={product.dose} />
                <SelectInput
                  aria-label={`Categoría ${index + 1}`}
                  onChange={(event) => setApplicationProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value as ApplicationRecord["category"] } : item))}
                  required
                  value={product.category}
                >
                  <option disabled value="">Selecciona el tipo</option>
                  {applicationCategories.map((item) => <option key={item}>{item}</option>)}
                </SelectInput>
                <Button aria-label={`Quitar producto ${index + 1}`} className="h-11 w-11 px-0" icon={<Minus className="h-4 w-4" />} onClick={() => setApplicationProducts((current) => current.length === 1 ? [emptyApplicationProduct()] : current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="ghost" />
              </div>
              ))}
            </div>
          </section>
          <Field label="Área aplicada"><TextInput name="area" placeholder="Área completa o sección 1" /></Field>
          <Field label="Intervalo de seguridad (antes de cosecha)"><FormattedQuantityInput name="safetyInterval" placeholder="Ej. 3 días" /></Field>
          <Field label="Tiempo de reentrada"><FormattedQuantityInput name="reentry" placeholder="Ej. 12 horas" /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "pest" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handlePest}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" required defaultValue={defaultGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><DatePickerInput name="detectedAt" required defaultValue={todayInputValue()} /></Field>
          <Field label="Problema"><TextInput name="problem" required placeholder="Mosquita blanca" /></Field>
          <Field label="Incidencia"><SelectInput name="severity" defaultValue="Baja">{["Baja", "Media", "Alta"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Zona afectada"><TextInput name="zone" placeholder="Camas 10-12" /></Field>
          <Field label="Foto o evidencia"><TextInput accept="image/*" name="photo" type="file" /></Field>
          <Field label="Acción tomada"><TextArea name="action" /></Field>
          <Field label="Estado de seguimiento">
            <SelectInput name="followUpStatus" defaultValue="Pendiente de revisión">
              {pestFollowUpStatuses.map((status) => <option key={status}>{status}</option>)}
            </SelectInput>
          </Field>
          <Field label="Fecha de revisión"><DatePickerInput name="reviewDate" /></Field>
          <Field label="Fecha de reaplicación"><DatePickerInput name="reapplicationDate" /></Field>
          <Field label="Seguimiento"><TextArea name="followUp" placeholder="Resultado observado, población, daño o producto sugerido para reaplicar." /></Field>
        </FormShell>
      ) : null}

      {modal === "harvest" ? (
        <FormShell disabled={isSaving} error={error} layout="wide" onSubmit={handleHarvest} {...manualRecordShellProps}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" required defaultValue={defaultGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><DatePickerInput name="date" required defaultValue={todayInputValue()} /></Field>
          <Field className="sm:col-span-2" label="Comprador"><TextInput name="destination" placeholder="Nombre del comprador" required /></Field>
          <HarvestSaleBreakdownFields open={harvestBreakdownOpen} onToggle={() => setHarvestBreakdownOpen((current) => !current)} />
          <HarvestCaptureFields priceReferences={priceReferences} showPrices={currentUser.role !== "manager"} />
          <Field className="sm:col-span-2" label="Observaciones"><TextArea autoGrow name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "editHarvest" && selectedHarvest ? (
        <FormShell disabled={isSaving} error={error} layout="wide" onSubmit={handleEditHarvest}>
          <Field label="Área productiva">
            <SelectInput aria-label="Área productiva" disabled value={selectedHarvest.greenhouseId}>
              {greenhouses.map((greenhouse) => (
                <option key={greenhouse.id} value={greenhouse.id}>{greenhouseDisplayName(greenhouse, crops)}</option>
              ))}
            </SelectInput>
            <input name="greenhouseId" type="hidden" value={selectedHarvest.greenhouseId} />
          </Field>
          <Field label="Fecha"><DatePickerInput name="date" required defaultValue={selectedHarvest.date} /></Field>
          <Field className="sm:col-span-2" label="Comprador"><TextInput defaultValue={selectedHarvest.sale?.buyerName || selectedHarvest.destination} name="destination" placeholder="Nombre del comprador" required /></Field>
          <HarvestSaleBreakdownFields
            initialCommission={selectedHarvest.sale?.commissionPerBox}
            initialFreight={selectedHarvest.sale?.freightPerBox}
            initialPackaging={selectedHarvest.sale?.packagingPerBox}
            open={harvestBreakdownOpen}
            onToggle={() => setHarvestBreakdownOpen((current) => !current)}
          />
          <HarvestCaptureFields
            initialValues={selectedHarvest}
            key={selectedHarvest.id}
            priceReferences={priceReferences}
            showPrices
          />
          <Field className="sm:col-span-2" label="Observaciones"><TextArea autoGrow defaultValue={selectedHarvest.notes} name="notes" /></Field>
          <Field className="sm:col-span-2" label="Motivo de corrección"><TextArea className="min-h-24" name="changeNote" placeholder="Ej. Se capturó precio por kilo en lugar de precio por caja" required /></Field>
        </FormShell>
      ) : null}

      {modal === "sale" && selectedHarvest && saleDraft && saleCalculation ? (
        <FormShell disabled={isSaving} error={error} layout="wide" onSubmit={handleSale}>
          <Field label="Comprador">
            <TextInput
              onChange={(event) => setSaleDraft((current) => current ? { ...current, buyerName: event.target.value } : current)}
              placeholder="Nombre del comprador"
              required
              value={saleDraft.buyerName}
            />
          </Field>
          <Field label="Fecha de venta">
            <DatePickerInput
              onChange={(event) => setSaleDraft((current) => current ? { ...current, date: event.target.value } : current)}
              required
              value={saleDraft.date}
            />
          </Field>
          <section aria-labelledby="sale-lines-title" className="grid gap-3 sm:col-span-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted" id="sale-lines-title">Cajas y precio acordado</p>
              <p className="mt-1 text-xs leading-5 text-app-muted">La venta se registra por calidad sin modificar la cosecha capturada.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {saleDraft.lines.map((line, index) => (
                <fieldset className="grid gap-3 rounded-2xl border border-app-border bg-app-sidebar/35 p-4" key={line.quality}>
                  <legend className="px-2 text-xs font-semibold text-app-text">{line.quality}</legend>
                  <Field label="Cajas vendidas">
                    <FormattedNumberInput min="0" onChange={(event) => setSaleDraft((current) => current ? {
                      ...current,
                      lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, boxCount: event.target.value } : item)
                    } : current)} step="1" value={line.boxCount} />
                  </Field>
                  <Field label="Precio por caja">
                    <FormattedNumberInput min="0" onChange={(event) => setSaleDraft((current) => current ? {
                      ...current,
                      lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, grossPricePerBox: event.target.value } : item)
                    } : current)} step="0.01" value={line.grossPricePerBox} />
                  </Field>
                </fieldset>
              ))}
            </div>
          </section>
          <section className="sm:col-span-2">
            <button
              aria-expanded={saleBreakdownOpen}
              className="flex min-h-11 w-full items-center justify-between rounded-xl border border-app-border bg-white px-4 text-left text-sm font-semibold text-app-text"
              onClick={() => setSaleBreakdownOpen((current) => !current)}
              type="button"
            >
              Desglosar venta
              <ChevronDown aria-hidden="true" className={cn("h-4 w-4 transition-transform", saleBreakdownOpen && "rotate-180")} />
            </button>
            {saleBreakdownOpen ? (
              <div className="mt-3 grid gap-3 rounded-2xl border border-app-border bg-app-sidebar/35 p-4 sm:grid-cols-3">
                {([
                  ["Comisión por caja", "commissionPerBox"],
                  ["Flete por caja", "freightPerBox"],
                  ["Caja de cartón por caja", "packagingPerBox"]
                ] as const).map(([label, key]) => (
                  <Field key={key} label={label}>
                    <FormattedNumberInput min="0" onChange={(event) => setSaleDraft((current) => current ? { ...current, [key]: event.target.value } : current)} placeholder="$0.00" step="0.01" value={saleDraft[key]} />
                  </Field>
                ))}
              </div>
            ) : null}
          </section>
          <Field label="Estado de pago">
            <SelectInput onChange={(event) => setSaleDraft((current) => current ? { ...current, paymentStatus: event.target.value as SaleDraft["paymentStatus"] } : current)} value={saleDraft.paymentStatus}>
              <option>Pendiente</option><option>Pagada</option>
            </SelectInput>
          </Field>
          {saleDraft.paymentStatus === "Pagada" ? <Field label="Fecha de pago"><DatePickerInput onChange={(event) => setSaleDraft((current) => current ? { ...current, paidAt: event.target.value } : current)} value={saleDraft.paidAt} /></Field> : <div />}
          <Field className="sm:col-span-2" label="Notas"><TextArea onChange={(event) => setSaleDraft((current) => current ? { ...current, notes: event.target.value } : current)} value={saleDraft.notes} /></Field>
          <div className="grid gap-3 rounded-2xl border border-app-border bg-white p-4 sm:col-span-2 sm:grid-cols-4">
            <div><p className="text-xs text-app-muted">Venta bruta</p><output className="mt-1 block font-semibold tabular-nums">{formatCurrency(saleCalculation.grossAmount)}</output></div>
            <div><p className="text-xs text-app-muted">Gastos</p><output className="mt-1 block font-semibold tabular-nums">{formatCurrency(saleCalculation.commissionAmount + saleCalculation.freightAmount + saleCalculation.packagingAmount)}</output></div>
            <div><p className="text-xs text-app-muted">Cajas vendidas</p><output className="mt-1 block font-semibold tabular-nums">{saleCalculation.soldBoxes}</output></div>
            <div><p className="text-xs text-app-muted">Venta neta</p><output className="mt-1 block text-lg font-semibold tabular-nums text-app-green">{formatCurrency(saleCalculation.netAmount)}</output></div>
          </div>
        </FormShell>
      ) : null}

      {modal === "cost" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleCost}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" required defaultValue={defaultGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><DatePickerInput name="date" required defaultValue={todayInputValue()} /></Field>
          <section aria-labelledby="cost-items-title" className="grid gap-4 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted" id="cost-items-title">Partidas de costo</p>
                <p className="mt-1 text-xs leading-5 text-app-muted">Captura el monto directamente o agrega cantidad y precio unitario para calcularlo.</p>
              </div>
              <Button
                className="min-h-10 w-full shrink-0 sm:w-auto"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setCostRows((current) => [...current, emptyCost()])}
                type="button"
                variant="ghost"
              >
                Agregar partida
              </Button>
            </div>
            {costRows.map((cost, index) => (
              <fieldset key={index} className="grid gap-3 rounded-2xl border border-app-border bg-app-sidebar/35 p-4">
                <legend className="px-2 text-xs font-semibold text-app-text">Partida {index + 1}</legend>
                <div className="grid gap-3 lg:grid-cols-[1fr_1.6fr_0.75fr_auto]">
                  <Field
                    label={(
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="shrink-0">Categoría</span>
                        {suggestedCostCategory(cost.notes) && suggestedCostCategory(cost.notes) !== cost.category ? (
                          <span aria-live="polite" className="flex min-w-0 items-center gap-1.5 normal-case tracking-normal text-[10px] font-medium text-app-muted">
                            <span className="truncate">Sugerida: {suggestedCostCategory(cost.notes)}</span>
                            <button
                              aria-label={`Usar categoría sugerida: ${suggestedCostCategory(cost.notes)}`}
                              className="min-h-6 shrink-0 rounded-md px-1 font-semibold text-app-green underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
                              onClick={() => setCostRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: suggestedCostCategory(item.notes) ?? item.category } : item))}
                              type="button"
                            >
                              Usar
                            </button>
                          </span>
                        ) : null}
                      </span>
                    )}
                  >
                    <SelectionMenu
                      ariaLabel={`Categoría de la partida ${index + 1}`}
                      buttonClassName="h-11 rounded-xl px-3 text-sm font-normal"
                      menuClassName="max-h-72 overflow-y-auto"
                      onChange={(category) => setCostRows((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, category: category as CostRecord["category"] } : item
                      ))}
                      options={costCategoryOptions}
                      value={cost.category}
                    />
                  </Field>
                  <Field label="Concepto">
                    <TextInput
                      aria-label={`Concepto de la partida ${index + 1}`}
                      onChange={(event) => setCostRows((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, notes: event.target.value } : item
                      ))}
                      placeholder="Ej. reparación de fumigadora"
                      required
                      value={cost.notes}
                    />
                  </Field>
                  <Field label="Monto">
                    <FormattedNumberInput
                      aria-label={`Monto de la partida ${index + 1}`}
                      min="0.01"
                      onChange={(event) => setCostRows((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, amount: event.target.value } : item
                      ))}
                      placeholder="$0.00"
                      required
                      step="0.01"
                      value={cost.amount}
                    />
                  </Field>
                  <div className="flex items-end justify-end">
                    <Button
                      aria-label={`Quitar partida ${index + 1}`}
                      className="h-11 w-11 px-0"
                      icon={<Minus aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => setCostRows((current) =>
                        current.length === 1 ? [emptyCost()] : current.filter((_, itemIndex) => itemIndex !== index)
                      )}
                      type="button"
                      variant="ghost"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Cantidad">
                    <FormattedNumberInput
                      aria-label={`Cantidad de la partida ${index + 1}`}
                      min="0"
                      onChange={(event) => {
                        const quantity = event.target.value;
                        setCostRows((current) => current.map((item, itemIndex) => {
                          if (itemIndex !== index) return item;
                          const calculatedAmount = calculatedCostAmount(quantity, item.unitPrice);
                          return { ...item, quantity, amount: calculatedAmount === null ? item.amount : String(calculatedAmount) };
                        }));
                      }}
                      placeholder="1"
                      step="0.01"
                      value={cost.quantity}
                    />
                  </Field>
                  <Field label="Unidad">
                    <SelectionMenu
                      ariaLabel={`Unidad de la partida ${index + 1}`}
                      buttonClassName="h-11 rounded-xl px-3 text-sm font-normal"
                      menuClassName="max-h-64 overflow-y-auto"
                      onChange={(unit) => setCostRows((current) => current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, unit } : item
                      ))}
                      options={costUnitOptions}
                      value={cost.unit}
                    />
                  </Field>
                  <Field label="Precio unitario">
                    <FormattedNumberInput
                      aria-label={`Precio unitario de la partida ${index + 1}`}
                      min="0"
                      onChange={(event) => {
                        const unitPrice = event.target.value;
                        setCostRows((current) => current.map((item, itemIndex) => {
                          if (itemIndex !== index) return item;
                          const calculatedAmount = calculatedCostAmount(item.quantity, unitPrice);
                          return { ...item, unitPrice, amount: calculatedAmount === null ? item.amount : String(calculatedAmount) };
                        }));
                      }}
                      placeholder="$0.00"
                      step="0.01"
                      value={cost.unitPrice}
                    />
                  </Field>
                </div>
              </fieldset>
            ))}
            <div className="flex items-center justify-between border-t border-app-border pt-4">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Total del registro</span>
              <output className="text-lg font-semibold tabular-nums text-app-text">{formatCurrency(costBatchTotal)}</output>
            </div>
          </section>
        </FormShell>
      ) : null}
    </Modal>
  );
}
