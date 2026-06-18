"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { appErrorMessage } from "@/lib/errors";
import { useGreenhouseStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadCompanyAsset } from "@/lib/storage";
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
  if (value === null || String(value).trim() === "") {
    return null;
  }

  return Number(value);
}

const taskTypeToDb: Record<TaskType, string> = {
  Riego: "riego",
  Fertilización: "fertilizacion",
  "Aplicación foliar": "aplicacion_foliar",
  "Revisión de plagas": "revision_plagas",
  Poda: "poda",
  Tutoreo: "tutoreo",
  Deshoje: "deshoje",
  Cosecha: "cosecha",
  Limpieza: "limpieza",
  Mantenimiento: "mantenimiento"
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
  Transporte: "transporte"
};

const modalCopy = {
  greenhouse: {
    title: "Nuevo invernadero",
    kicker: "Infraestructura",
    note: "Crea una nueva casa, hectárea o módulo productivo."
  },
  editGreenhouse: {
    title: "Editar invernadero",
    kicker: "Infraestructura",
    note: "Actualiza variedad, etapa, plantas y datos base del cultivo."
  },
  task: {
    title: "Nueva tarea",
    kicker: "Agenda operativa",
    note: "Programa una acción para el equipo del invernadero."
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
    note: "Registra producto, dosis, área e intervalos de seguridad."
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
    title: "Nuevo costo",
    kicker: "Finanzas",
    note: "Registra gasto por categoría y fecha."
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

  const copy = useMemo(() => (modal ? modalCopy[modal] : null), [modal]);
  const selectedGreenhouse = greenhouses.find((greenhouse) => greenhouse.id === selectedGreenhouseId);
  const greenhouseOptions = greenhouses.map((greenhouse) => (
    <option key={greenhouse.id} value={greenhouse.id}>
      {greenhouse.name}
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

  const readGreenhouseForm = (form: FormData): Omit<Greenhouse, "id"> => ({
    name: String(form.get("name")),
    location: String(form.get("location")),
    surface: `${Number(form.get("surfaceM2") || 0).toLocaleString("es-MX")} m2`,
    variety: String(form.get("variety")),
    transplantDate: String(form.get("transplantDate")),
    plants: Number(form.get("plants")),
    stage: String(form.get("stage")) as CropStage,
    manager: currentUser.fullName,
    beds: Number(form.get("beds")),
    daysSinceTransplant: daysSince(String(form.get("transplantDate"))),
    healthStatus: "Baja",
    temperature: 0,
    humidity: 0,
    estimatedProductionKg: 0
  });

  const greenhousePayload = (form: FormData, greenhouse: Omit<Greenhouse, "id">) => ({
    name: greenhouse.name,
    location: greenhouse.location,
    surface_m2: Number(form.get("surfaceM2") || 0),
    tomato_variety: greenhouse.variety,
    transplant_date: greenhouse.transplantDate || null,
    plants_count: greenhouse.plants,
    beds_count: greenhouse.beds,
    crop_stage: cropStageToDb[greenhouse.stage],
    manager_user_id: currentUser.id,
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
      const { error: insertError } = await getSupabaseBrowserClient()!.from("tasks").insert({
        company_id: organization.id,
        greenhouse_id: greenhouseId,
        type: taskTypeToDb[type],
        title: record.title,
        scheduled_date: record.date,
        scheduled_time: record.time || null,
        status: "pendiente",
        responsible_user_id: currentUser.id,
        created_by: currentUser.id
      });
      if (insertError) throw insertError;
      addTask(record);
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
      const { error: insertError } = await getSupabaseBrowserClient()!.from("irrigation_records").insert({
        company_id: organization.id,
        greenhouse_id: record.greenhouseId,
        occurred_at: record.date,
        duration_min: record.durationMin,
        estimated_liters: record.liters,
        ph: record.ph,
        ec: record.ec,
        notes: record.notes,
        responsible_user_id: currentUser.id,
        created_by: currentUser.id
      });
      if (insertError) throw insertError;
      addIrrigation(record);
    });
  };

  const handleNutrition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const record = {
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        product: String(form.get("product")),
        dose: String(form.get("dose")),
        method: String(form.get("method")) as NutritionRecord["method"],
        ph: Number(form.get("ph")),
        ec: Number(form.get("ec")),
        stage: String(form.get("stage")) as CropStage,
        objective: String(form.get("objective")) as NutritionRecord["objective"],
        notes: String(form.get("notes"))
      };
      const { error: insertError } = await getSupabaseBrowserClient()!.from("nutrition_records").insert({
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
      });
      if (insertError) throw insertError;
      addNutrition(record);
    });
  };

  const handleApplication = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const record = {
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        category: String(form.get("category")) as ApplicationRecord["category"],
        product: String(form.get("product")),
        composition: String(form.get("composition")),
        dose: String(form.get("dose")),
        area: String(form.get("area")),
        responsible: currentUser.fullName,
        safetyInterval: String(form.get("safetyInterval")),
        reentry: String(form.get("reentry")),
        notes: String(form.get("notes"))
      };
      const { error: insertError } = await getSupabaseBrowserClient()!.from("application_records").insert({
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
      });
      if (insertError) throw insertError;
      addApplication(record);
    });
  };

  const handlePest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const photo = form.get("photo");
      const supabase = getSupabaseBrowserClient()!;
      const photoUrl =
        photo instanceof File && photo.size > 0
          ? await uploadCompanyAsset({
              bucket: "pest-photos",
              companyId: organization.id,
              file: photo,
              supabase,
              type: "pest"
            })
          : undefined;
      const record = {
        greenhouseId: String(form.get("greenhouseId")),
        problem: String(form.get("problem")),
        severity: String(form.get("severity")) as RiskLevel,
        zone: String(form.get("zone")),
        detectedAt: String(form.get("detectedAt")),
        action: String(form.get("action")),
        followUp: String(form.get("followUp")),
        photoUrl
      };
      const { error: insertError } = await supabase.from("pest_alerts").insert({
        company_id: organization.id,
        greenhouse_id: record.greenhouseId,
        problem: record.problem,
        severity: riskLevelToDb[record.severity],
        affected_zone: record.zone,
        detected_at: record.detectedAt,
        action_taken: record.action,
        follow_up: record.followUp,
        photo_url: record.photoUrl ?? null,
        responsible_user_id: currentUser.id,
        created_by: currentUser.id
      });
      if (insertError) throw insertError;
      addPest(record);
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
      const { error: insertError } = await getSupabaseBrowserClient()!.from("harvest_records").insert({
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
      });
      if (insertError) throw insertError;
      addHarvest(record);
    });
  };

  const handleCost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(async () => {
      const record = {
        greenhouseId: String(form.get("greenhouseId")),
        date: String(form.get("date")),
        category: String(form.get("category")) as CostRecord["category"],
        amount: Number(form.get("amount")),
        notes: String(form.get("notes"))
      };
      const { error: insertError } = await getSupabaseBrowserClient()!.from("cost_records").insert({
        company_id: organization.id,
        greenhouse_id: record.greenhouseId || null,
        category: costCategoryToDb[record.category],
        amount: record.amount,
        occurred_at: record.date,
        notes: record.notes,
        created_by: currentUser.id
      });
      if (insertError) throw insertError;
      addCost(record);
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
          <Field label="Nombre">
            <TextInput name="name" required placeholder="Casa 2" />
          </Field>
          <Field label="Ubicación">
            <TextInput name="location" placeholder="Cuapancingo, Puebla" />
          </Field>
          <Field label="Superficie m2">
            <TextInput name="surfaceM2" type="number" defaultValue={0} />
          </Field>
          <Field label="Variedad">
            <TextInput name="variety" required placeholder="Variedad del tomate" />
          </Field>
          <Field label="Fecha de trasplante">
            <TextInput name="transplantDate" type="date" />
          </Field>
          <Field label="Plantas">
            <TextInput name="plants" type="number" defaultValue={0} />
          </Field>
          <Field label="Camas">
            <TextInput name="beds" type="number" defaultValue={0} />
          </Field>
          <Field label="Etapa">
            <SelectInput name="stage" defaultValue="Producción">
              {["Vegetativo", "Floración", "Cuajado", "Producción"].map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </SelectInput>
          </Field>
        </FormShell>
      ) : null}

      {modal === "editGreenhouse" && selectedGreenhouse ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleEditGreenhouse}>
          <Field label="Nombre">
            <TextInput name="name" required defaultValue={selectedGreenhouse.name} />
          </Field>
          <Field label="Ubicación">
            <TextInput name="location" defaultValue={selectedGreenhouse.location} />
          </Field>
          <Field label="Superficie m2">
            <TextInput
              name="surfaceM2"
              type="number"
              defaultValue={Number(selectedGreenhouse.surface.replace(/[^\d.]/g, "")) || 0}
            />
          </Field>
          <Field label="Variedad">
            <TextInput name="variety" required defaultValue={selectedGreenhouse.variety} />
          </Field>
          <Field label="Fecha de trasplante">
            <TextInput name="transplantDate" type="date" defaultValue={selectedGreenhouse.transplantDate} />
          </Field>
          <Field label="Plantas">
            <TextInput name="plants" type="number" defaultValue={selectedGreenhouse.plants} />
          </Field>
          <Field label="Camas">
            <TextInput name="beds" type="number" defaultValue={selectedGreenhouse.beds} />
          </Field>
          <Field label="Etapa">
            <SelectInput name="stage" defaultValue={selectedGreenhouse.stage}>
              {["Vegetativo", "Floración", "Cuajado", "Producción"].map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </SelectInput>
          </Field>
        </FormShell>
      ) : null}

      {modal === "task" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleTask}>
          <Field label="Invernadero">
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
          <Field label="Invernadero"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
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
          <Field label="Invernadero"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <Field label="Producto"><TextInput name="product" required placeholder="Nitrato de potasio" /></Field>
          <Field label="Dosis"><TextInput name="dose" required placeholder="2 kg / 1000 L" /></Field>
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
          <Field label="Invernadero"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Categoría"><SelectInput name="category" defaultValue="Bioestimulante">{Object.keys(applicationCategoryToDb).map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Producto"><TextInput name="product" required placeholder="Extracto de algas" /></Field>
          <Field label="Composición"><TextInput name="composition" placeholder="Ingrediente activo" /></Field>
          <Field label="Dosis"><TextInput name="dose" required placeholder="1 L / ha" /></Field>
          <Field label="Área aplicada"><TextInput name="area" placeholder="Casa completa" /></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <Field label="Intervalo seguridad"><TextInput name="safetyInterval" /></Field>
          <Field label="Reentrada"><TextInput name="reentry" /></Field>
          <Field label="Observaciones"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}

      {modal === "pest" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handlePest}>
          <Field label="Invernadero"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="detectedAt" type="date" required defaultValue={todayInputValue()} /></Field>
          <Field label="Problema"><TextInput name="problem" required placeholder="Mosquita blanca" /></Field>
          <Field label="Severidad"><SelectInput name="severity" defaultValue="Baja">{["Baja", "Media", "Alta"].map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Zona afectada"><TextInput name="zone" placeholder="Camas 10-12" /></Field>
          <Field label="Foto o evidencia"><TextInput accept="image/*" name="photo" type="file" /></Field>
          <Field label="Acción tomada"><TextArea name="action" /></Field>
          <Field label="Seguimiento"><TextArea name="followUp" /></Field>
        </FormShell>
      ) : null}

      {modal === "harvest" ? (
        <FormShell disabled={isSaving} error={error} onSubmit={handleHarvest}>
          <Field label="Invernadero"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
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
          <Field label="Invernadero"><SelectInput name="greenhouseId" defaultValue={selectedGreenhouseId}>{greenhouseOptions}</SelectInput></Field>
          <Field label="Fecha"><TextInput name="date" type="date" required defaultValue={todayInputValue()} /></Field>
          <Field label="Categoría"><SelectInput name="category" defaultValue="Agroinsumos">{Object.keys(costCategoryToDb).map((item) => <option key={item}>{item}</option>)}</SelectInput></Field>
          <Field label="Monto"><TextInput name="amount" type="number" required defaultValue={0} /></Field>
          <Field label="Notas"><TextArea name="notes" /></Field>
        </FormShell>
      ) : null}
    </Modal>
  );
}
