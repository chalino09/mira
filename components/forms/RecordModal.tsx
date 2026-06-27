"use client";

import { Minus, Plus } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormattedNumberInput, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { PreciseLocationField } from "@/components/forms/PreciseLocationField";
import { appErrorMessage } from "@/lib/errors";
import { INITIAL_CROP_ID, greenhouseDisplayName } from "@/lib/crop-ddt";
import { cropVarietyOptionsForSlug } from "@/lib/crop-varieties";
import { useGreenhouseStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createPrivateCompanyFileUrl, uploadPrivateCompanyFile } from "@/lib/storage";
import { cn, parseNumericInput } from "@/lib/utils";
import type {
  ApplicationRecord,
  CostRecord,
  CropStage,
  Greenhouse,
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

function optionalNumber(value: FormDataEntryValue | null) {
  return parseNumericInput(String(value ?? ""));
}

function requiredNumber(value: FormDataEntryValue | null) {
  return optionalNumber(value) ?? 0;
}

type CostDraft = {
  category: CostRecord["category"];
  amount: string;
  notes: string;
};

type ManagerOption = {
  id: string;
  name: string;
  email: string;
};

function emptyCost(): CostDraft {
  return { category: "Agroinsumos", amount: "", notes: "" };
}

type NutritionProductDraft = { product: string; dose: string };
type ApplicationProductDraft = {
  category: ApplicationRecord["category"];
  product: string;
  composition: string;
  dose: string;
};

function emptyNutritionProduct(): NutritionProductDraft {
  return { product: "", dose: "" };
}

function emptyApplicationProduct(): ApplicationProductDraft {
  return { category: "Bioestimulante", product: "", composition: "", dose: "" };
}

function insertedId(row: { id?: string } | null | undefined, fallback: string) {
  if (!row?.id) {
    throw new Error(fallback);
  }
  return row.id;
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

const cropStageToDb: Record<CropStage, string> = {
  Vegetativo: "vegetativo",
  Floración: "floracion",
  Cuajado: "cuajado",
  Producción: "produccion"
};

const riskLevelToDb: Record<RiskLevel, string> = {
  Baja: "baja",
  Media: "media",
  Alta: "alta"
};

const applicationCategoryToDb: Record<ApplicationRecord["category"], string> = {
  Bioestimulante: "bioestimulante",
  Fungicida: "fungicida",
  Insecticida: "insecticida",
  Fertilizante: "fertilizante",
  Microorganismos: "microorganismos",
  Corrector: "corrector"
};

const nutritionMethodToDb: Record<NutritionRecord["method"], string> = {
  Fertirriego: "fertirriego",
  Foliar: "foliar",
  Drench: "drench"
};

const nutritionObjectiveToDb: Record<NutritionRecord["objective"], string> = {
  Raíz: "raiz",
  Floración: "floracion",
  Cuajado: "cuajado",
  Engorde: "engorde",
  Calidad: "calidad"
};

const costCategoryToDb: Record<CostRecord["category"], string> = {
  "Mano de obra": "mano_obra",
  Fertilizantes: "fertilizantes",
  Agroinsumos: "agroinsumos",
  Agua: "agua",
  Energía: "energia",
  Plásticos: "plasticos",
  Mantenimiento: "mantenimiento",
  Transporte: "transporte",
  Refrescos: "refrescos",
  Renta: "renta",
  Gasolina: "gasolina"
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
    note: "Actualiza variedad, etapa, plantas y datos base del cultivo."
  },
  task: {
    title: "Nueva tarea",
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
    kicker: "Producción",
    note: "Guarda kilos, calidad, precio estimado y destino."
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
  error,
  onSubmit
}: {
  children: React.ReactNode;
  disabled: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_210px]" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <aside className="border-t border-app-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
          Registro
        </p>
        <p className="mt-4 text-sm leading-6 text-app-muted">
          Al guardar, el registro queda disponible para todo el equipo autorizado.
        </p>
        {error ? <p className="mt-5 text-sm text-[#8A2E2E]">{error}</p> : null}
        <div className="mt-6 grid gap-2">
          <Button disabled={disabled} type="submit" variant="primary">
            {disabled ? "Guardando..." : "Guardar"}
          </Button>
          <CloseButton />
        </div>
      </aside>
    </form>
  );
}

function CloseButton() {
  const closeModal = useGreenhouseStore((state) => state.closeModal);

  return (
    <Button onClick={closeModal} type="button" variant="secondary">
      Cancelar
    </Button>
  );
}

export function RecordModal() {
  const modal = useGreenhouseStore((state) => state.modal);
  const closeModal = useGreenhouseStore((state) => state.closeModal);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const crops = useGreenhouseStore((state) => state.crops);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const addGreenhouse = useGreenhouseStore((state) => state.addGreenhouse);
  const updateGreenhouse = useGreenhouseStore((state) => state.updateGreenhouse);
  const addTask = useGreenhouseStore((state) => state.addTask);
  const addIrrigation = useGreenhouseStore((state) => state.addIrrigation);
  const addNutrition = useGreenhouseStore((state) => state.addNutrition);
  const addApplication = useGreenhouseStore((state) => state.addApplication);
  const addPest = useGreenhouseStore((state) => state.addPest);
  const addHarvest = useGreenhouseStore((state) => state.addHarvest);
  const addCost = useGreenhouseStore((state) => state.addCost);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [costRows, setCostRows] = useState<CostDraft[]>([emptyCost()]);
  const [nutritionProducts, setNutritionProducts] = useState<NutritionProductDraft[]>([emptyNutritionProduct()]);
  const [applicationProducts, setApplicationProducts] = useState<ApplicationProductDraft[]>([emptyApplicationProduct()]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [draftCropId, setDraftCropId] = useState(INITIAL_CROP_ID);
  const canAssignGreenhouseManager = currentUser.role === "owner" || currentUser.role === "admin";

  useEffect(() => {
    setError("");
    if (modal === "cost") setCostRows([emptyCost()]);
    if (modal === "nutrition") setNutritionProducts([emptyNutritionProduct()]);
    if (modal === "application") setApplicationProducts([emptyApplicationProduct()]);
  }, [modal]);

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

      const { data: members, error: membersError } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", organization.id)
        .eq("role", "manager")
        .eq("status", "active");
      if (cancelled) return;
      if (membersError) {
        setManagerOptions([]);
        setError(appErrorMessage(membersError, "No se pudieron cargar los managers activos."));
        return;
      }

      const managerIds = (members ?? [])
        .map((member: any) => member.user_id)
        .filter((id: string | null): id is string => Boolean(id));

      if (!managerIds.length) {
        setManagerOptions([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", managerIds);
      if (cancelled) return;
      if (profilesError) {
        setManagerOptions([]);
        setError(appErrorMessage(profilesError, "No se pudieron cargar los perfiles de managers."));
        return;
      }

      const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));

      setManagerOptions(managerIds.map((id) => {
        const profile = profileMap.get(id);
        return {
          id,
          name: profile?.full_name ?? profile?.email?.split("@")[0] ?? "Encargado",
          email: profile?.email ?? ""
        };
      }));
      setError("");
    };

    loadManagers();

    return () => {
      cancelled = true;
    };
  }, [canAssignGreenhouseManager, modal, organization.id]);

  const copy = useMemo(() => (modal ? modalCopy[modal] : null), [modal]);
  const selectedGreenhouse = greenhouses.find((greenhouse) => greenhouse.id === selectedGreenhouseId);
  const activeCropOptions = crops.filter((crop) => crop.isActive);
  const cropOptions = activeCropOptions.length
    ? activeCropOptions
    : [{ id: INITIAL_CROP_ID, slug: "jitomate", name: "Jitomate", scientificName: null, defaultCycleDays: null, isActive: true }];
  const defaultCropId = selectedGreenhouse?.cropId ?? cropOptions[0]?.id ?? INITIAL_CROP_ID;
  const draftCrop = cropOptions.find((crop) => crop.id === draftCropId) ?? cropOptions[0];
  const existingVarietyForDraftCrop = selectedGreenhouse?.cropId === draftCropId ? selectedGreenhouse.variety : null;
  const draftVarietyOptions = cropVarietyOptionsForSlug(draftCrop?.slug, existingVarietyForDraftCrop);
  const greenhouseOptions = greenhouses.map((greenhouse) => (
    <option key={greenhouse.id} value={greenhouse.id}>
      {greenhouseDisplayName(greenhouse, crops)}
    </option>
  ));

  const save = async (handler: () => Promise<void>) => {
    setError("");
    setIsSaving(true);
    try {
      await handler();
    } catch (caught) {
      setError(appErrorMessage(caught, "No se pudo guardar el registro."));
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (modal === "greenhouse" || modal === "editGreenhouse") {
      setDraftCropId(defaultCropId);
    }
  }, [defaultCropId, modal]);

  const managerNameFor = (managerUserId: string | null) =>
    managerOptions.find((manager) => manager.id === managerUserId)?.name
    ?? (managerUserId === currentUser.id ? currentUser.fullName : "Sin encargado");

  const readGreenhouseForm = (form: FormData): Omit<Greenhouse, "id"> => {
    const managerUserId = String(form.get("managerUserId") ?? "").trim() || null;
    const cropId = String(form.get("cropId") ?? defaultCropId).trim() || null;

    return {
      name: String(form.get("name")),
      location: String(form.get("location")),
      latitude: optionalNumber(form.get("latitude")),
      longitude: optionalNumber(form.get("longitude")),
      locationAccuracyM: optionalNumber(form.get("locationAccuracyM")),
      surface: `${requiredNumber(form.get("surfaceM2")).toLocaleString("es-MX")} m2`,
      budgetAmount: optionalNumber(form.get("budgetAmount")),
      cropId,
      variety: String(form.get("variety") ?? "").trim(),
      transplantDate: String(form.get("transplantDate")),
      plants: requiredNumber(form.get("plants")),
      stemCount: Number(form.get("stemCount")) === 1 || Number(form.get("stemCount")) === 2
        ? Number(form.get("stemCount")) as 1 | 2
        : null,
      isGrafted: String(form.get("isGrafted") ?? "") === "" ? null : String(form.get("isGrafted")) === "true",
      stage: String(form.get("stage")) as CropStage,
      managerUserId,
      manager: managerNameFor(managerUserId),
      beds: requiredNumber(form.get("beds")),
      daysSinceTransplant: daysSince(String(form.get("transplantDate"))),
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
    surface_m2: requiredNumber(form.get("surfaceM2")),
    budget_amount: greenhouse.budgetAmount,
    crop_id: greenhouse.cropId,
    crop_variety: greenhouse.variety,
    tomato_variety: greenhouse.cropId === INITIAL_CROP_ID ? greenhouse.variety : null,
    transplant_date: greenhouse.transplantDate || null,
    plants_count: greenhouse.plants,
    stem_count: greenhouse.stemCount,
    is_grafted: greenhouse.isGrafted,
    beds_count: greenhouse.beds,
    crop_stage: cropStageToDb[greenhouse.stage],
    manager_user_id: greenhouse.managerUserId,
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
      addTask({ ...record, id: insertedId(data, "No se pudo confirmar la tarea guardada.") });
    });
  };

  const handleIrrigation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const record = {
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        durationMin: Number(form.get("durationMin")),
        liters: Number(form.get("liters")),
        sector: String(form.get("sector")),
        ph: optionalNumber(form.get("ph")),
        ec: optionalNumber(form.get("ec")),
        notes: String(form.get("notes")),
        responsible: currentUser.fullName
      };
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("irrigation_records")
        .insert({
          company_id: organization.id,
          greenhouse_id: record.greenhouseId,
          occurred_at: record.date,
          duration_min: record.durationMin,
          estimated_liters: record.liters,
          sector: record.sector || null,
          ph: record.ph,
          ec: record.ec,
          notes: record.notes,
          responsible_user_id: currentUser.id,
          created_by: currentUser.id
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      addIrrigation({ ...record, id: insertedId(data, "No se pudo confirmar el riego guardado.") });
    });
  };

  const handleNutrition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const records = nutritionProducts.map((product) => ({
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        product: product.product,
        dose: product.dose,
        method: String(form.get("method")) as NutritionRecord["method"],
        ph: Number(form.get("ph")),
        ec: Number(form.get("ec")),
        stage: String(form.get("stage")) as CropStage,
        objective: String(form.get("objective")) as NutritionRecord["objective"],
        notes: String(form.get("notes"))
      }));
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("nutrition_records")
        .insert(records.map((record) => ({
          company_id: organization.id,
          greenhouse_id: record.greenhouseId,
          product_name: record.product,
          dose: record.dose,
          method: nutritionMethodToDb[record.method],
          ph: record.ph,
          ec: record.ec,
          occurred_at: record.date,
          crop_stage: cropStageToDb[record.stage],
          objective: nutritionObjectiveToDb[record.objective],
          notes: record.notes,
          responsible_user_id: currentUser.id,
          created_by: currentUser.id
        })))
        .select("id");
      if (insertError) throw insertError;
      records.forEach((record, index) => {
        addNutrition({
          ...record,
          id: insertedId(data?.[index], "No se pudo confirmar la nutrición guardada.")
        });
      });
    });
  };

  const handleApplication = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const records = applicationProducts.map((product) => ({
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        category: product.category,
        product: product.product,
        composition: product.composition,
        dose: product.dose,
        area: String(form.get("area")),
        responsible: currentUser.fullName,
        safetyInterval: String(form.get("safetyInterval")),
        reentry: String(form.get("reentry")),
        notes: String(form.get("notes"))
      }));
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("application_records")
        .insert(records.map((record) => ({
          company_id: organization.id,
          greenhouse_id: record.greenhouseId,
          category: applicationCategoryToDb[record.category],
          product_name: record.product,
          composition: record.composition,
          dose: record.dose,
          applied_area: record.area,
          safety_interval: record.safetyInterval,
          reentry_interval: record.reentry,
          occurred_at: record.date,
          notes: record.notes,
          responsible_user_id: currentUser.id,
          created_by: currentUser.id
        })))
        .select("id");
      if (insertError) throw insertError;
      records.forEach((record, index) => {
        addApplication({
          ...record,
          id: insertedId(data?.[index], "No se pudo confirmar la aplicación guardada.")
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

  const handleHarvest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const record = {
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        kilograms: Number(form.get("kilograms")),
        firstQuality: Number(form.get("firstQuality")),
        secondQuality: Number(form.get("secondQuality")),
        discard: Number(form.get("discard")),
        estimatedPrice: Number(form.get("estimatedPrice")),
        destination: String(form.get("destination")),
        notes: String(form.get("notes"))
      };
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("harvest_records")
        .insert({
          company_id: organization.id,
          greenhouse_id: record.greenhouseId,
          occurred_at: record.date,
          kilograms: record.kilograms,
          first_quality_kg: record.firstQuality,
          second_quality_kg: record.secondQuality,
          discard_kg: record.discard,
          estimated_price: record.estimatedPrice,
          destination: record.destination,
          notes: record.notes,
          responsible_user_id: currentUser.id,
          created_by: currentUser.id
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      addHarvest({ ...record, id: insertedId(data, "No se pudo confirmar la cosecha guardada.") });
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
        amount: Number(cost.amount),
        notes: cost.notes
      }));
      const { data, error: insertError } = await getSupabaseBrowserClient()!
        .from("cost_records")
        .insert(records.map((record) => ({
          company_id: organization.id,
          greenhouse_id: record.greenhouseId || null,
          category: costCategoryToDb[record.category],
          amount: record.amount,
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

  return (
    <Modal open={modal !== null} title={copy?.title ?? ""} onClose={closeModal}>
      {copy ? (
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
            <TextInput name="transplantDate" type="date" />
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
              <SelectInput name="managerUserId" defaultValue={managerOptions[0]?.id ?? ""} required>
                {managerOptions.length ? (
                  managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))
                ) : (
                  <option value="">No hay managers activos</option>
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
              defaultValue={parseNumericInput(selectedGreenhouse.surface) ?? 0}
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
            <TextInput name="transplantDate" type="date" defaultValue={selectedGreenhouse.transplantDate} />
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
              <SelectInput name="managerUserId" defaultValue={selectedGreenhouse.managerUserId ?? ""} required>
                {managerOptions.length ? (
                  managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))
                ) : (
                  <option value="">No hay managers activos</option>
                )}
              </SelectInput>
            </Field>
          ) : null}
        </FormShell>
      ) : null}

      {modal === "task" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleTask}>
          <Field label="Área productiva">
            <SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput>
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
            <TextInput name="date" type="date" required defaultValue={todayInputValue()} />
          </Field>
          <Field label="Hora">
            <TextInput name="time" type="time" />
          </Field>
        </FormShell>
      ) : null}

      {modal === "irrigation" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleIrrigation}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <Field label="Duración min"><TextInput name="durationMin" type="number" required defaultValue={0} /></Field>
          <Field label="Litros estimados"><TextInput name="liters" type="number" required defaultValue={0} /></Field>
          <Field label="Sector o válvula"><TextInput name="sector" placeholder="Válvula A1" /></Field>
          <Field label="pH"><TextInput name="ph" step="0.1" type="number" placeholder="Opcional" /></Field>
          <Field label="CE"><TextInput name="ec" step="0.1" type="number" placeholder="Opcional" /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "nutrition" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleNutrition}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <section className="grid gap-3 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Productos</p>
              <Button className="h-8" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNutritionProducts((current) => [...current, emptyNutritionProduct()])} type="button" variant="ghost">
                Agregar producto
              </Button>
            </div>
            {nutritionProducts.map((product, index) => (
              <div key={index} className="grid gap-2 border-t border-app-border pt-3 sm:grid-cols-[1.2fr_1fr_auto]">
                <TextInput
                  aria-label={`Producto ${index + 1}`}
                  onChange={(event) => setNutritionProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, product: event.target.value } : item))}
                  placeholder="Producto"
                  required
                  value={product.product}
                />
                <TextInput
                  aria-label={`Dosis ${index + 1}`}
                  onChange={(event) => setNutritionProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dose: event.target.value } : item))}
                  placeholder="Dosis"
                  required
                  value={product.dose}
                />
                <Button aria-label={`Quitar producto ${index + 1}`} className="h-11 w-11 px-0" icon={<Minus className="h-4 w-4" />} onClick={() => setNutritionProducts((current) => current.length === 1 ? [emptyNutritionProduct()] : current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="ghost" />
              </div>
            ))}
          </section>
          <Field label="Método"><SelectInput name="method" defaultValue="Fertirriego">{["Fertirriego", "Foliar", "Drench"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Objetivo"><SelectInput name="objective" defaultValue="Engorde">{["Raíz", "Floración", "Cuajado", "Engorde", "Calidad"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Etapa"><SelectInput name="stage" defaultValue="Producción">{["Vegetativo", "Floración", "Cuajado", "Producción"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="pH"><TextInput name="ph" step="0.1" type="number" defaultValue={0} /></Field>
          <Field label="CE"><TextInput name="ec" step="0.1" type="number" defaultValue={0} /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "application" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleApplication}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <section className="grid gap-3 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Productos</p>
              <Button className="h-8" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setApplicationProducts((current) => [...current, emptyApplicationProduct()])} type="button" variant="ghost">
                Agregar producto
              </Button>
            </div>
            {applicationProducts.map((product, index) => (
              <div key={index} className="grid gap-2 border-t border-app-border pt-3 sm:grid-cols-[0.9fr_1fr_1fr_0.8fr_auto]">
                <SelectInput
                  aria-label={`Categoría ${index + 1}`}
                  onChange={(event) => setApplicationProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value as ApplicationRecord["category"] } : item))}
                  value={product.category}
                >
                  {Object.keys(applicationCategoryToDb).map((item) => <option key={item}>{item}</option>)}
                </SelectInput>
                <TextInput aria-label={`Producto ${index + 1}`} onChange={(event) => setApplicationProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, product: event.target.value } : item))} placeholder="Producto" required value={product.product} />
                <TextInput aria-label={`Composición ${index + 1}`} onChange={(event) => setApplicationProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, composition: event.target.value } : item))} placeholder="Ingrediente activo" value={product.composition} />
                <TextInput aria-label={`Dosis ${index + 1}`} onChange={(event) => setApplicationProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dose: event.target.value } : item))} placeholder="Dosis" required value={product.dose} />
                <Button aria-label={`Quitar producto ${index + 1}`} className="h-11 w-11 px-0" icon={<Minus className="h-4 w-4" />} onClick={() => setApplicationProducts((current) => current.length === 1 ? [emptyApplicationProduct()] : current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="ghost" />
              </div>
            ))}
          </section>
          <Field label="Área aplicada"><TextInput name="area" placeholder="Área completa o sección 1" /></Field>
          <Field label="Intervalo de seguridad (antes de cosecha)"><TextInput name="safetyInterval" placeholder="Ej. 3 días" /></Field>
          <Field label="Tiempo de reentrada"><TextInput name="reentry" placeholder="Ej. 12 horas" /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "pest" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handlePest}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="detectedAt" type="date" required defaultValue={todayInputValue()} /></Field>
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
          <Field label="Fecha de revisión"><TextInput name="reviewDate" type="date" /></Field>
          <Field label="Fecha de reaplicación"><TextInput name="reapplicationDate" type="date" /></Field>
          <Field label="Seguimiento"><TextArea name="followUp" placeholder="Resultado observado, población, daño o producto sugerido para reaplicar." /></Field>
        </FormShell>
      ) : null}

      {modal === "harvest" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleHarvest}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <Field label="Kg cosechados"><TextInput name="kilograms" type="number" required defaultValue={0} /></Field>
          <Field label="Primera"><TextInput name="firstQuality" type="number" defaultValue={0} /></Field>
          <Field label="Segunda"><TextInput name="secondQuality" type="number" defaultValue={0} /></Field>
          <Field label="Descarte"><TextInput name="discard" type="number" defaultValue={0} /></Field>
          <Field label="Precio estimado"><TextInput name="estimatedPrice" step="0.1" type="number" defaultValue={0} /></Field>
          <Field label="Cliente o destino"><TextInput name="destination" /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "cost" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleCost}>
          <Field label="Área productiva"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <section className="grid gap-3 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">Gastos</p>
              <Button
                className="h-8"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setCostRows((current) => [...current, emptyCost()])}
                type="button"
                variant="ghost"
              >
                Agregar costo
              </Button>
            </div>
            {costRows.map((cost, index) => (
              <div key={index} className="grid gap-2 border-t border-app-border pt-3 sm:grid-cols-[1fr_0.65fr_1fr_auto]">
                <SelectInput
                  aria-label={`Categoría ${index + 1}`}
                  onChange={(event) => setCostRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, category: event.target.value as CostRecord["category"] } : item
                  ))}
                  value={cost.category}
                >
                  {Object.keys(costCategoryToDb).map((item) => <option key={item}>{item}</option>)}
                </SelectInput>
                <TextInput
                  aria-label={`Monto ${index + 1}`}
                  min="0.01"
                  onChange={(event) => setCostRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, amount: event.target.value } : item
                  ))}
                  placeholder="Monto"
                  required
                  step="0.01"
                  type="number"
                  value={cost.amount}
                />
                <TextInput
                  aria-label={`Notas ${index + 1}`}
                  onChange={(event) => setCostRows((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, notes: event.target.value } : item
                  ))}
                  placeholder="Nota opcional"
                  value={cost.notes}
                />
                <Button
                  aria-label={`Quitar costo ${index + 1}`}
                  className="h-11 w-11 px-0"
                  icon={<Minus className="h-4 w-4" />}
                  onClick={() => setCostRows((current) =>
                    current.length === 1 ? [emptyCost()] : current.filter((_, itemIndex) => itemIndex !== index)
                  )}
                  type="button"
                  variant="ghost"
                />
              </div>
            ))}
          </section>
        </FormShell>
      ) : null}
    </Modal>
  );
}
