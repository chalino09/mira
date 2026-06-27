"use client";

import type { Session } from "@supabase/supabase-js";
import { ArrowLeft } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MiraBrand, PortalMark } from "@/components/brand/MiraBrand";
import { AtmosphericMapVisual } from "@/components/visuals/AtmosphericMapVisual";
import { Button } from "@/components/ui/Button";
import { Field, FormattedNumberInput, SelectInput, TextInput } from "@/components/forms/FormControls";
import { PreciseLocationField } from "@/components/forms/PreciseLocationField";
import { appErrorMessage } from "@/lib/errors";
import { INITIAL_CROP_ID, isNutrientKey } from "@/lib/crop-ddt";
import { cropVarietyOptionsForSlug } from "@/lib/crop-varieties";
import type {
  NutritionAnalyteKey,
  NutritionDiagnosticStatus,
  NutritionObservationContext,
  NutritionObservationRule,
  NutritionReferenceRange,
  NutritionSampleType
} from "@/lib/nutrition-monitoring";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createPrivateCompanyFileUrls } from "@/lib/storage";
import { useGreenhouseStore } from "@/lib/store";
import { parseNumericInput } from "@/lib/utils";
import type {
  Activity,
  ApplicationRecord,
  CostRecord,
  CropCatalogItem,
  CropStage,
  CropStageCatalog,
  CurrentUser,
  Greenhouse,
  HarvestRecord,
  IrrigationRecord,
  NutritionRecord,
  Organization,
  PestAlert,
  RiskLevel,
  Task,
  TaskType
} from "@/types";

type AuthState = "loading" | "missing-env" | "signed-out" | "profile" | "onboarding" | "ready" | "load-error" | "access-paused";

type OnboardingForm = {
  fullName: string;
  companyName: string;
  greenhouseName: string;
  cropId: string;
  variety: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  stage: CropStage;
  transplantDate: string;
  surfaceM2: number | null;
  budgetAmount: number | null;
  plants: number;
  stemCount: 1 | 2 | null;
  isGrafted: boolean | null;
  beds: number;
};

const onboardingStageToDb: Record<CropStage, string> = {
  Vegetativo: "vegetativo",
  Floración: "floracion",
  Cuajado: "cuajado",
  Producción: "produccion"
};

const DEFAULT_CROP_OPTIONS: CropCatalogItem[] = [
  {
    id: INITIAL_CROP_ID,
    slug: "jitomate",
    name: "Jitomate",
    scientificName: "Solanum lycopersicum",
    defaultCycleDays: 182,
    isActive: true
  }
];

function mapCropStage(stage?: string | null): CropStage {
  if (stage === "floracion") return "Floración";
  if (stage === "cuajado") return "Cuajado";
  if (stage === "produccion") return "Producción";
  return "Vegetativo";
}

function mapRiskLevel(level?: string | null): RiskLevel {
  if (level === "media") return "Media";
  if (level === "alta") return "Alta";
  return "Baja";
}

function mapCrops(rows: any[] | null | undefined): CropCatalogItem[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    scientificName: row.scientific_name ?? null,
    defaultCycleDays: row.default_cycle_days == null ? null : Number(row.default_cycle_days),
    isActive: Boolean(row.is_active)
  }));
}

function mapCropStages(rows: any[] | null | undefined, nutrientRows: any[] | null | undefined): CropStageCatalog[] {
  const fertilizerRangesByStage = new Map<string, CropStageCatalog["fertilizerUnitRanges"]>();

  (nutrientRows ?? []).forEach((row) => {
    if (row.range_context !== "fertilizer_unit" || !isNutrientKey(String(row.nutrient))) return;
    const stageId = String(row.crop_stage_id ?? "");
    const ranges = fertilizerRangesByStage.get(stageId) ?? [];
    ranges.push({
      nutrient: row.nutrient,
      min: Number(row.min_value),
      max: Number(row.max_value),
      display: row.display_value
    });
    ranges.sort((left, right) => left.nutrient.localeCompare(right.nutrient));
    fertilizerRangesByStage.set(stageId, ranges);
  });

  return (rows ?? []).map((row) => ({
    id: row.id,
    cropId: row.crop_id,
    number: Number(row.stage_number),
    label: row.stage_label,
    name: row.stage_name,
    ddtStart: Number(row.ddt_start),
    ddtEnd: Number(row.ddt_end),
    durationDays: Number(row.duration_days),
    fertilizerUnitRanges: fertilizerRangesByStage.get(row.id) ?? []
  }));
}

function mapNutritionRanges(rows: any[] | null | undefined): NutritionReferenceRange[] {
  return (rows ?? []).map((row) => ({
    cropId: row.crop_id,
    sampleType: row.sample_type as NutritionSampleType,
    analyteKey: row.analyte_key as NutritionAnalyteKey,
    analyteLabel: row.analyte_label,
    inputUnit: row.input_unit,
    diagnosticUnit: row.diagnostic_unit,
    ddtMin: row.ddt_min == null ? null : Number(row.ddt_min),
    ddtMax: row.ddt_max == null ? null : Number(row.ddt_max),
    min: Number(row.min_value),
    max: Number(row.max_value),
    sortOrder: Number(row.sort_order)
  }));
}

function mapNutritionRules(rows: any[] | null | undefined): NutritionObservationRule[] {
  return (rows ?? []).map((row) => ({
    cropId: row.crop_id,
    observationContext: row.observation_context as NutritionObservationContext,
    petioleStatus: row.petiole_status as NutritionDiagnosticStatus,
    soilStatus: row.soil_status as NutritionDiagnosticStatus,
    observationText: row.observation_text
  }));
}

function mapTaskType(type?: string | null, technicalPlan?: Record<string, any> | null): TaskType {
  const labels: Record<string, TaskType> = {
    riego: "Riego",
    fertirriego: "Fertirriego",
    fertilizacion: "Fertilización",
    aplicacion_foliar: "Aplicación foliar",
    revision_plagas: "Revisión de plagas y enfermedades",
    poda: "Deschuponado",
    tutoreo: "Manejo de rafia",
    deshoje: "Deshoje",
    cosecha: "Cosecha",
    limpieza: "Limpieza",
    mantenimiento: "Mantenimiento",
    otro: technicalPlan?.cycleWorkType ? "Preparación de ciclo" : "Otra"
  };

  return labels[type ?? ""] ?? "Riego";
}

function mapTaskStatus(status?: string | null): Task["status"] {
  if (status === "bloqueada") return "Bloqueada";
  if (status === "completada") return "Completada";
  if (status === "cancelada") return "Cancelada";
  return "Pendiente";
}

function mapApplicationCategory(category?: string | null): ApplicationRecord["category"] {
  const labels: Record<string, ApplicationRecord["category"]> = {
    bioestimulante: "Bioestimulante",
    fungicida: "Fungicida",
    insecticida: "Insecticida",
    fertilizante: "Fertilizante",
    microorganismos: "Microorganismos",
    corrector: "Corrector"
  };

  return labels[category ?? ""] ?? "Bioestimulante";
}

function mapNutritionMethod(method?: string | null): NutritionRecord["method"] {
  if (method === "foliar") return "Foliar";
  if (method === "drench") return "Drench";
  return "Fertirriego";
}

function mapNutritionObjective(objective?: string | null): NutritionRecord["objective"] {
  if (objective === "floracion") return "Floración";
  if (objective === "cuajado") return "Cuajado";
  if (objective === "engorde") return "Engorde";
  if (objective === "calidad") return "Calidad";
  return "Raíz";
}

function mapCostCategory(category?: string | null): CostRecord["category"] {
  const labels: Record<string, CostRecord["category"]> = {
    mano_obra: "Mano de obra",
    fertilizantes: "Fertilizantes",
    agroinsumos: "Agroinsumos",
    agua: "Agua",
    energia: "Energía",
    plasticos: "Plásticos",
    mantenimiento: "Mantenimiento",
    transporte: "Transporte",
    refrescos: "Refrescos",
    renta: "Renta",
    gasolina: "Gasolina"
  };

  return labels[category ?? ""] ?? "Agroinsumos";
}

function daysSince(date?: string | null) {
  if (!date) return 0;
  const start = new Date(`${date}T12:00:00`);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
}

function optionalNumber(value: FormDataEntryValue | null) {
  return parseNumericInput(String(value ?? ""));
}

function optionalInteger(value: FormDataEntryValue | null) {
  const number = optionalNumber(value);
  return number === null ? 0 : Math.trunc(number);
}

function AuthCard({
  title,
  kicker,
  children
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  const signals = [
    {
      label: "Operación diaria",
      value: "Riego · sanidad · cosecha"
    },
    {
      label: "Equipo",
      value: "Dueños y encargados"
    },
    {
      label: "Contexto vivo",
      value: "Clima y operación"
    }
  ];

  return (
    <main className="min-h-screen bg-app-background px-5 py-8 text-app-text">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-6xl items-center">
        <section className="grid w-full gap-12 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-center">
          <div>
            <MiraBrand markClassName="h-6 w-10" wordClassName="text-[13px] tracking-[0.38em]" />
            {kicker !== "mira" ? (
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.32em] text-app-muted">
                {kicker}
              </p>
            ) : null}
            <h1 className="mt-5 max-w-4xl text-6xl font-light leading-[0.96] tracking-normal text-app-text sm:text-7xl">
              {title}
            </h1>
            <AtmosphericMapVisual className="mt-10 max-w-2xl" variant="login" />
            <div className="mt-14 grid max-w-2xl gap-0 border-y border-app-border py-6 sm:grid-cols-3">
              {signals.map((item, index) => (
                <div
                  key={item.label}
                  className={index > 0 ? "border-t border-app-border pt-5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0" : ""}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                    {item.label}
                  </p>
                  <p className="mt-4 text-sm leading-5 text-app-text">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="border-y border-app-border bg-white/40 px-1 py-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

function initialLoadErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return appErrorMessage(error, "No se pudo cargar tu espacio.");
}

function throwInitialLoadError(error: unknown, fallback: string) {
  if (error) {
    throw new Error(appErrorMessage(error, fallback));
  }
}

function MissingEnvScreen() {
  return (
    <AuthCard kicker="Configuración pendiente" title="Conecta Supabase para activar el acceso.">
      <div className="space-y-4 px-4">
        <p className="text-sm leading-6 text-app-muted">
          Crea `.env.local` en la raíz usando `.env.example` y pega tus llaves de Supabase.
        </p>
        <div className="rounded-xl border border-app-border bg-app-sidebar p-4 font-mono text-xs text-app-muted">
          NEXT_PUBLIC_SUPABASE_URL<br />
          NEXT_PUBLIC_SUPABASE_ANON_KEY
        </div>
      </div>
    </AuthCard>
  );
}

function LoadErrorScreen({
  error,
  onRetry,
  onSignOut
}: {
  error: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <AuthCard kicker="Carga interrumpida" title="No pudimos cargar tu espacio.">
      <div className="space-y-5 px-4">
        <p className="text-sm leading-6 text-app-muted">
          Mira no pudo leer todos los datos necesarios de Supabase. Esto puede ser un permiso, una migración pendiente o una conexión inestable.
        </p>
        <p className="border border-[#E3BDBD] bg-app-red px-3 py-2 text-sm text-[#7B2A2A]" role="alert">
          {error}
        </p>
        <Button className="h-11 rounded-lg" onClick={onRetry} type="button" variant="primary">
          Reintentar
        </Button>
        <Button className="h-11 rounded-lg" icon={<ArrowLeft className="h-4 w-4" />} onClick={onSignOut} type="button">
          Regresar al acceso
        </Button>
      </div>
    </AuthCard>
  );
}

function AccessPausedScreen({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <AuthCard kicker="Acceso pausado" title="Tu usuario no tiene una membresía activa.">
      <div className="space-y-5 px-4">
        <p className="text-sm leading-6 text-app-muted">
          {message}
        </p>
        <Button className="h-11 rounded-lg" icon={<ArrowLeft className="h-4 w-4" />} onClick={onSignOut} type="button">
          Regresar al acceso
        </Button>
      </div>
    </AuthCard>
  );
}

function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const supabase = getSupabaseBrowserClient();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    if (!supabase) {
      setLoading(false);
      setError("No se pudo conectar con Supabase.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError(appErrorMessage(signInError, "No se pudo iniciar sesión."));
      return;
    }
    onSignedIn();
  };

  return (
    <AuthCard kicker="mira" title="Accede al sistema operativo de tus cultivos.">
      <form className="px-4" onSubmit={handleSubmit}>
        <div className="mb-8 flex items-start justify-between gap-6 border-b border-app-border pb-6">
          <div>
            <h2 className="text-3xl font-light tracking-normal text-app-text">
              Entra a tu espacio
            </h2>
          </div>
          <span className="whitespace-nowrap pt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-app-green">
            ● Seguro
          </span>
        </div>
        <div className="grid gap-5">
        <Field label="Email">
          <TextInput
            autoComplete="email"
            className="rounded-lg bg-app-background"
            name="email"
            placeholder="nombre@empresa.com"
            required
            type="email"
          />
        </Field>
        <Field label="Password">
          <TextInput
            autoComplete="current-password"
            className="rounded-lg bg-app-background"
            name="password"
            placeholder="Tu contraseña"
            required
            type="password"
          />
        </Field>
        {error ? <p className="text-sm text-[#8A2E2E]">{error}</p> : null}
        <Button className="mt-2 h-11 rounded-lg" disabled={loading} type="submit" variant="primary">
          {loading ? "Entrando..." : "Entrar"}
        </Button>
        </div>
      </form>
    </AuthCard>
  );
}

function CompleteProfileScreen({
  session,
  onDone,
  onSignOut
}: {
  session: Session;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const fullName = String(new FormData(event.currentTarget).get("fullName") ?? "").trim();
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setLoading(false);
      setError("No se pudo conectar con Supabase.");
      return;
    }

    if (fullName.length < 2) {
      setLoading(false);
      setError("Escribe tu nombre completo.");
      return;
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: session.user.id,
      full_name: fullName,
      email: session.user.email ?? null
    });

    setLoading(false);
    if (profileError) {
      setError(appErrorMessage(profileError, "No se pudo guardar tu nombre."));
      return;
    }

    onDone();
  };

  return (
    <AuthCard kicker="Perfil" title="Antes de comenzar, dinos cómo te llamas.">
      <form className="px-4" onSubmit={handleSubmit}>
        <div className="mb-8 border-b border-app-border pb-6">
          <h2 className="text-3xl font-light tracking-normal text-app-text">Completa tu perfil</h2>
          <p className="mt-3 text-sm leading-6 text-app-muted">
            Este nombre aparecerá en actividades, responsables y reportes de operación.
          </p>
        </div>
        <div className="grid gap-5">
          <Field label="Nombre completo">
            <TextInput
              autoComplete="name"
              className="rounded-lg bg-app-background"
              maxLength={120}
              name="fullName"
              placeholder="Nombre y apellidos"
              required
            />
          </Field>
          {error ? <p className="text-sm text-[#8A2E2E]">{error}</p> : null}
          <Button className="mt-2 h-11 rounded-lg" disabled={loading} type="submit" variant="primary">
            {loading ? "Guardando..." : "Continuar"}
          </Button>
          <Button className="h-11 rounded-lg" icon={<ArrowLeft className="h-4 w-4" />} onClick={onSignOut} type="button">
            Regresar al acceso
          </Button>
        </div>
      </form>
    </AuthCard>
  );
}

function OnboardingScreen({
  session,
  onDone,
  onSignOut
}: {
  session: Session;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cropOptions, setCropOptions] = useState<CropCatalogItem[]>(DEFAULT_CROP_OPTIONS);
  const [selectedCropId, setSelectedCropId] = useState(INITIAL_CROP_ID);

  useEffect(() => {
    let cancelled = false;

    async function loadCrops() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data } = await supabase
        .from("crops")
        .select("id, slug, name, scientific_name, default_cycle_days, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!cancelled) {
        const mapped = mapCrops(data);
        setCropOptions(mapped.length ? mapped : DEFAULT_CROP_OPTIONS);
      }
    }

    loadCrops();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const supabase = getSupabaseBrowserClient()!;
    const form = new FormData(event.currentTarget);
    const values: OnboardingForm = {
      fullName: String(form.get("fullName") ?? ""),
      companyName: String(form.get("companyName") ?? ""),
      greenhouseName: String(form.get("greenhouseName") ?? ""),
      cropId: String(form.get("cropId") ?? INITIAL_CROP_ID),
      variety: String(form.get("variety") ?? ""),
      location: String(form.get("location") ?? ""),
      latitude: optionalNumber(form.get("latitude")),
      longitude: optionalNumber(form.get("longitude")),
      locationAccuracyM: optionalNumber(form.get("locationAccuracyM")),
      stage: String(form.get("stage") ?? "Producción") as CropStage,
      transplantDate: String(form.get("transplantDate") ?? ""),
      surfaceM2: optionalNumber(form.get("surfaceM2")),
      budgetAmount: optionalNumber(form.get("budgetAmount")),
      plants: optionalInteger(form.get("plants")),
      stemCount: Number(form.get("stemCount")) === 1 || Number(form.get("stemCount")) === 2
        ? Number(form.get("stemCount")) as 1 | 2
        : null,
      isGrafted: String(form.get("isGrafted") ?? "") === "" ? null : String(form.get("isGrafted")) === "true",
      beds: optionalInteger(form.get("beds"))
    };

    const { error: onboardingError } = await supabase.rpc("create_initial_workspace_with_coordinates", {
      full_name: values.fullName,
      company_name: values.companyName,
      greenhouse_name: values.greenhouseName,
      greenhouse_location: values.location || null,
      tomato_variety: values.cropId === INITIAL_CROP_ID ? values.variety : null,
      crop_variety: values.variety,
      initial_crop_id: values.cropId,
      initial_crop_stage: onboardingStageToDb[values.stage],
      initial_transplant_date: values.transplantDate || null,
      initial_surface_m2: values.surfaceM2,
      initial_budget_amount: values.budgetAmount,
      initial_plants_count: values.plants,
      initial_stem_count: values.stemCount,
      initial_is_grafted: values.isGrafted,
      initial_beds_count: values.beds,
      initial_latitude: values.latitude,
      initial_longitude: values.longitude,
      initial_location_accuracy_m: values.locationAccuracyM
    });

    setLoading(false);
    if (onboardingError) {
      setError(appErrorMessage(onboardingError, "No se pudo crear el espacio."));
      return;
    }
    onDone();
  };

  const emailName = session.user.email?.split("@")[0] ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const selectedCrop = cropOptions.find((crop) => crop.id === selectedCropId) ?? cropOptions[0];
  const varietyOptions = cropVarietyOptionsForSlug(selectedCrop?.slug);

  return (
    <AuthCard kicker="Primer acceso" title="Configura tu empresa y primera área productiva.">
      <form className="grid gap-6 px-4" onSubmit={handleSubmit}>
        <section className="grid gap-4 border-b border-app-border pb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
              Perfil
            </p>
            <h2 className="mt-3 text-2xl font-light tracking-normal text-app-text">
              Datos base
            </h2>
          </div>
          <Field label="Tu nombre">
            <TextInput
              className="rounded-lg bg-app-background"
              name="fullName"
              required
              defaultValue={emailName}
              placeholder="Nombre del usuario"
            />
          </Field>
          <Field label="Nombre de la empresa">
            <TextInput
              className="rounded-lg bg-app-background"
              name="companyName"
              required
              placeholder="Producción Familia"
            />
          </Field>
        </section>

        <section className="grid gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
              Primera área productiva
            </p>
            <p className="mt-3 text-sm leading-6 text-app-muted">
              Una ficha inicial para entrar con datos útiles desde el primer día.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <TextInput className="rounded-lg bg-app-background" name="greenhouseName" required placeholder="Hectárea 1" />
            </Field>
            <Field label="Cultivo">
              <SelectInput
                className="rounded-lg bg-app-background"
                name="cropId"
                onChange={(event) => setSelectedCropId(event.target.value)}
                required
                value={selectedCropId}
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
                className="rounded-lg bg-app-background"
                defaultValue={varietyOptions[0]}
                key={selectedCropId}
                name="variety"
                required
              >
                {varietyOptions.map((variety) => (
                  <option key={variety}>{variety}</option>
                ))}
              </SelectInput>
            </Field>
            <PreciseLocationField inputClassName="rounded-lg bg-app-background" />
            <Field label="Etapa">
              <SelectInput className="rounded-lg bg-app-background" name="stage" defaultValue="Producción">
                {["Vegetativo", "Floración", "Cuajado", "Producción"].map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Trasplante">
              <TextInput className="rounded-lg bg-app-background" max={today} name="transplantDate" type="date" />
            </Field>
            <Field label="Superficie m2">
              <FormattedNumberInput className="rounded-lg bg-app-background" name="surfaceM2" placeholder="1,000" />
            </Field>
            <Field label="Presupuesto del ciclo">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-app-muted">$</span>
                <FormattedNumberInput className="rounded-lg bg-app-background pl-7 pr-14" name="budgetAmount" placeholder="Opcional" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-app-muted">MXN</span>
              </div>
            </Field>
            <Field label="Plantas">
              <FormattedNumberInput className="rounded-lg bg-app-background" name="plants" defaultValue={0} />
            </Field>
            <Field label="Manejo de tallos">
              <SelectInput className="rounded-lg bg-app-background" name="stemCount" defaultValue="">
                <option value="">Sin configurar</option>
                <option value="1">Un tallo</option>
                <option value="2">Doble tallo</option>
              </SelectInput>
            </Field>
            <Field label="Injerto">
              <SelectInput className="rounded-lg bg-app-background" name="isGrafted" defaultValue="">
                <option value="">Sin configurar</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </SelectInput>
            </Field>
            <Field label="Camas">
              <FormattedNumberInput className="rounded-lg bg-app-background" name="beds" defaultValue={0} />
            </Field>
          </div>
        </section>
        {error ? <p className="text-sm text-[#8A2E2E]">{error}</p> : null}
        <Button className="h-11 rounded-lg" disabled={loading} type="submit" variant="primary">
          {loading ? "Creando..." : "Crear espacio"}
        </Button>
        <Button className="h-11 rounded-lg" icon={<ArrowLeft className="h-4 w-4" />} onClick={onSignOut} type="button">
          Regresar al acceso
        </Button>
      </form>
    </AuthCard>
  );
}

export function AuthGate() {
  const [state, setState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [loadError, setLoadError] = useState("");
  const [accessPausedMessage, setAccessPausedMessage] = useState("");
  const hydrateWorkspace = useGreenhouseStore((store) => store.hydrateWorkspace);

  const signOut = useCallback(async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    setSession(null);
    setLoadError("");
    setAccessPausedMessage("");
    setState("signed-out");
  }, []);

  const refresh = useCallback(async () => {
    setLoadError("");
    setState("loading");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("missing-env");
      return;
    }

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      throwInitialLoadError(sessionError, "No se pudo validar tu sesión.");

      const nextSession = data.session;
      setSession(nextSession);

      if (!nextSession) {
        setState("signed-out");
        return;
      }

      const { error: invitesError } = await supabase.rpc("accept_company_invites");
      throwInitialLoadError(invitesError, "No se pudieron revisar tus invitaciones.");

      const { data: membership, error: membershipError } = await supabase
        .from("company_members")
        .select("id, role, company_id, companies(id, name, legal_name, logo_url)")
        .eq("user_id", nextSession.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      throwInitialLoadError(membershipError, "No se pudo cargar tu membresía.");

      if (!membership) {
        const { data: pausedMembership, error: pausedMembershipError } = await supabase
          .from("company_members")
          .select("id, status, role")
          .eq("user_id", nextSession.user.id)
          .limit(1)
          .maybeSingle();
        throwInitialLoadError(pausedMembershipError, "No se pudo revisar el estado de tu acceso.");

        if (pausedMembership) {
          setAccessPausedMessage(
            pausedMembership.status === "inactive"
              ? "Tu acceso fue desactivado por un administrador. Pide a un owner o admin que reactive tu usuario para volver a operar."
              : "Tu invitación todavía no está activa. Pide a un owner o admin que revise tu membresía."
          );
          setState("access-paused");
          return;
        }

        setState("onboarding");
        return;
      }

      const company = Array.isArray(membership.companies)
        ? membership.companies[0]
        : membership.companies;

      const [
        profileResponse,
        greenhousesResponse,
        cropsResponse,
        cropStagesResponse,
        nutrientRangesResponse,
        nutritionRangesResponse,
        nutritionRulesResponse
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", nextSession.user.id)
          .maybeSingle(),
        supabase
          .from("greenhouses")
          .select("*")
          .eq("company_id", membership.company_id)
          .order("created_at", { ascending: true }),
        supabase
          .from("crops")
          .select("id, slug, name, scientific_name, default_cycle_days, is_active")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("crop_stages")
          .select("id, crop_id, stage_number, stage_label, stage_name, ddt_start, ddt_end, duration_days")
          .eq("is_active", true)
          .order("stage_number", { ascending: true }),
        supabase
          .from("nutrient_ranges")
          .select("crop_stage_id, range_context, nutrient, min_value, max_value, display_value, sort_order")
          .eq("range_context", "fertilizer_unit")
          .order("sort_order", { ascending: true }),
        supabase
          .from("nutrition_reference_ranges")
          .select("crop_id, sample_type, analyte_key, analyte_label, input_unit, diagnostic_unit, ddt_min, ddt_max, min_value, max_value, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("nutrition_observation_rules")
          .select("crop_id, observation_context, petiole_status, soil_status, observation_text")
      ]);

      throwInitialLoadError(profileResponse.error, "No se pudo cargar tu perfil.");
      throwInitialLoadError(greenhousesResponse.error, "No se pudieron cargar las áreas productivas.");
      throwInitialLoadError(cropsResponse.error, "No se pudo cargar el catálogo de cultivos.");
      throwInitialLoadError(cropStagesResponse.error, "No se pudieron cargar las etapas de cultivo.");
      throwInitialLoadError(nutrientRangesResponse.error, "No se pudieron cargar los rangos nutrimentales base.");
      throwInitialLoadError(nutritionRangesResponse.error, "No se pudieron cargar los rangos de monitoreo nutrimental.");
      throwInitialLoadError(nutritionRulesResponse.error, "No se pudieron cargar las reglas de observación nutrimental.");

      const profile = profileResponse.data;
      const greenhouseRows = greenhousesResponse.data;
      const cropRows = cropsResponse.data;
      const cropStageRows = cropStagesResponse.data;
      const nutrientRangeRows = nutrientRangesResponse.data;
      const nutritionRangeRows = nutritionRangesResponse.data;
      const nutritionRuleRows = nutritionRulesResponse.data;

      const crops = mapCrops(cropRows);
      const cropStages = mapCropStages(cropStageRows, nutrientRangeRows);
      const nutritionReferenceRanges = mapNutritionRanges(nutritionRangeRows);
      const nutritionObservationRules = mapNutritionRules(nutritionRuleRows);

      const organization: Organization = {
        id: company?.id ?? membership.company_id,
        name: company?.name ?? "Empresa",
        legalName: company?.legal_name ?? undefined,
        logoUrl: company?.logo_url ?? undefined
      };

      const profileName = String(profile?.full_name ?? "").trim();
      const accountEmail = String(nextSession.user.email ?? "").trim();
      if (!profileName || profileName.toLowerCase() === accountEmail.toLowerCase()) {
        setState("profile");
        return;
      }

      const currentUser: CurrentUser = {
        id: nextSession.user.id,
        fullName: profileName,
        email: profile?.email ?? nextSession.user.email ?? "",
        role: membership.role
      };

      const canSeeAllGreenhouses = currentUser.role === "owner" || currentUser.role === "admin";
      const visibleGreenhouseRows = canSeeAllGreenhouses
        ? (greenhouseRows ?? [])
        : (greenhouseRows ?? []).filter((greenhouse: any) => greenhouse.manager_user_id === currentUser.id);
      const visibleGreenhouseIds = visibleGreenhouseRows.map((greenhouse: any) => greenhouse.id);
      const emptyGreenhouseId = "00000000-0000-0000-0000-000000000000";
      const greenhouseScope = visibleGreenhouseIds.length ? visibleGreenhouseIds : [emptyGreenhouseId];

      const managerUserIds = Array.from(
        new Set(visibleGreenhouseRows.map((greenhouse: any) => greenhouse.manager_user_id).filter(Boolean))
      );
      const managerMembersResponse = managerUserIds.length
        ? await supabase
          .from("company_members")
          .select("user_id")
          .eq("company_id", membership.company_id)
          .eq("role", "manager")
          .eq("status", "active")
          .in("user_id", managerUserIds)
        : { data: [], error: null };
      throwInitialLoadError(managerMembersResponse.error, "No se pudo cargar la lista de managers activos.");

      const activeManagerUserIds = (managerMembersResponse.data ?? []).map((member: any) => member.user_id);
      const managerProfilesResponse = activeManagerUserIds.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", activeManagerUserIds)
        : { data: [], error: null };
      throwInitialLoadError(managerProfilesResponse.error, "No se pudieron cargar los perfiles de managers.");

      const managerProfileMap = new Map((managerProfilesResponse.data ?? []).map((manager: any) => [manager.id, manager]));

      const [
        tasksResponse,
        irrigationResponse,
        nutritionResponse,
        applicationResponse,
        pestResponse,
        harvestResponse,
        costResponse
      ] = await Promise.all([
        (canSeeAllGreenhouses
          ? supabase.from("tasks").select("*").eq("company_id", membership.company_id)
          : supabase.from("tasks").select("*").eq("company_id", membership.company_id).in("greenhouse_id", greenhouseScope)
        ).order("scheduled_date", { ascending: true }),
        (canSeeAllGreenhouses
          ? supabase.from("irrigation_records").select("*").eq("company_id", membership.company_id)
          : supabase.from("irrigation_records").select("*").eq("company_id", membership.company_id).in("greenhouse_id", greenhouseScope)
        ).order("occurred_at", { ascending: false }),
        (canSeeAllGreenhouses
          ? supabase.from("nutrition_records").select("*").eq("company_id", membership.company_id)
          : supabase.from("nutrition_records").select("*").eq("company_id", membership.company_id).in("greenhouse_id", greenhouseScope)
        ).order("occurred_at", { ascending: false }),
        (canSeeAllGreenhouses
          ? supabase.from("application_records").select("*").eq("company_id", membership.company_id)
          : supabase.from("application_records").select("*").eq("company_id", membership.company_id).in("greenhouse_id", greenhouseScope)
        ).order("occurred_at", { ascending: false }),
        (canSeeAllGreenhouses
          ? supabase.from("pest_alerts").select("*").eq("company_id", membership.company_id)
          : supabase.from("pest_alerts").select("*").eq("company_id", membership.company_id).in("greenhouse_id", greenhouseScope)
        ).order("detected_at", { ascending: false }),
        (canSeeAllGreenhouses
          ? supabase.from("harvest_records").select("*").eq("company_id", membership.company_id)
          : supabase.from("harvest_records").select("*").eq("company_id", membership.company_id).in("greenhouse_id", greenhouseScope)
        ).order("occurred_at", { ascending: false }),
        (canSeeAllGreenhouses
          ? supabase.from("cost_records").select("*").eq("company_id", membership.company_id)
          : supabase.from("cost_records").select("*").eq("company_id", membership.company_id).in("greenhouse_id", greenhouseScope)
        ).order("occurred_at", { ascending: false })
      ]);

      throwInitialLoadError(tasksResponse.error, "No se pudieron cargar las tareas.");
      throwInitialLoadError(irrigationResponse.error, "No se pudieron cargar los riegos.");
      throwInitialLoadError(nutritionResponse.error, "No se pudieron cargar las nutriciones.");
      throwInitialLoadError(applicationResponse.error, "No se pudieron cargar las aplicaciones.");
      throwInitialLoadError(pestResponse.error, "No se pudieron cargar las alertas sanitarias.");
      throwInitialLoadError(harvestResponse.error, "No se pudieron cargar las cosechas.");
      throwInitialLoadError(costResponse.error, "No se pudieron cargar los costos.");

      const taskRows = tasksResponse.data;
      const irrigationRows = irrigationResponse.data;
      const nutritionRows = nutritionResponse.data;
      const applicationRows = applicationResponse.data;
      const pestRows = pestResponse.data;
      const harvestRows = harvestResponse.data;
      const costRows = costResponse.data;

      const mappedGreenhouses: Greenhouse[] = visibleGreenhouseRows.map((greenhouse: any) => {
        const managerProfile = greenhouse.manager_user_id ? managerProfileMap.get(greenhouse.manager_user_id) : null;

        return {
          id: greenhouse.id,
          name: greenhouse.name,
          location: greenhouse.location ?? "",
          latitude: greenhouse.latitude == null ? null : Number(greenhouse.latitude),
          longitude: greenhouse.longitude == null ? null : Number(greenhouse.longitude),
          locationAccuracyM: greenhouse.location_accuracy_m == null ? null : Number(greenhouse.location_accuracy_m),
          surface: greenhouse.surface_m2 ? `${Number(greenhouse.surface_m2).toLocaleString("es-MX")} m2` : "Sin superficie",
          budgetAmount: greenhouse.budget_amount == null ? null : Number(greenhouse.budget_amount),
          cropId: greenhouse.crop_id ?? null,
          variety: greenhouse.crop_variety ?? greenhouse.tomato_variety ?? "",
          transplantDate: greenhouse.transplant_date ?? "",
          plants: greenhouse.plants_count ?? 0,
          stemCount: greenhouse.stem_count === 1 || greenhouse.stem_count === 2 ? greenhouse.stem_count : null,
          isGrafted: greenhouse.is_grafted == null ? null : Boolean(greenhouse.is_grafted),
          stage: mapCropStage(greenhouse.crop_stage),
          managerUserId: greenhouse.manager_user_id ?? null,
          manager: managerProfile?.full_name ?? managerProfile?.email ?? "Sin encargado",
          beds: greenhouse.beds_count ?? 0,
          daysSinceTransplant: daysSince(greenhouse.transplant_date),
          healthStatus: mapRiskLevel(greenhouse.health_status),
          temperature: 0,
          humidity: 0,
          estimatedProductionKg: 0
        };
      });

      const tasks: Task[] = (taskRows ?? []).map((task: any) => ({
        id: task.id,
        greenhouseId: task.greenhouse_id,
        type: mapTaskType(task.type, task.technical_plan),
        title: task.title,
        date: task.scheduled_date,
        time: task.scheduled_time?.slice(0, 5) ?? "",
        status: mapTaskStatus(task.status),
        responsible: currentUser.fullName
      }));

      const irrigationRecords: IrrigationRecord[] = (irrigationRows ?? []).map((record: any) => ({
        id: record.id,
        greenhouseId: record.greenhouse_id,
        date: record.occurred_at,
        durationMin: record.duration_min ?? 0,
        liters: Number(record.estimated_liters ?? 0),
        sector: record.sector ?? "",
        ph: record.ph === null ? null : Number(record.ph),
        ec: record.ec === null ? null : Number(record.ec),
        notes: record.notes ?? "",
        responsible: currentUser.fullName
      }));

      const nutritionRecords: NutritionRecord[] = (nutritionRows ?? []).map((record: any) => ({
        id: record.id,
        greenhouseId: record.greenhouse_id,
        date: record.occurred_at,
        product: record.product_name,
        dose: record.dose,
        method: mapNutritionMethod(record.method),
        ph: Number(record.ph ?? 0),
        ec: Number(record.ec ?? 0),
        stage: mapCropStage(record.crop_stage),
        objective: mapNutritionObjective(record.objective),
        notes: record.notes ?? ""
      }));

      const applicationRecords: ApplicationRecord[] = (applicationRows ?? []).map((record: any) => ({
        id: record.id,
        sourceTaskId: record.source_task_id ?? undefined,
        greenhouseId: record.greenhouse_id,
        date: record.occurred_at,
        category: mapApplicationCategory(record.category),
        product: record.product_name,
        composition: record.composition ?? "",
        dose: record.dose,
        area: record.applied_area ?? "",
        responsible: currentUser.fullName,
        safetyInterval: record.safety_interval ?? "",
        reentry: record.reentry_interval ?? "",
        notes: record.notes ?? ""
      }));

      const pestPhotoPaths = (pestRows ?? [])
        .map((record: any) => String(record.photo_storage_path ?? "").trim())
        .filter(Boolean);
      let pestPhotoUrls = new Map<string, string>();
      if (pestPhotoPaths.length) {
        try {
          pestPhotoUrls = await createPrivateCompanyFileUrls({
            bucket: "pest-photos",
            paths: pestPhotoPaths,
            supabase
          });
        } catch (error) {
          throw new Error(appErrorMessage(error, "No se pudieron cargar las fotos de plagas."));
        }
      }

      const pestAlerts: PestAlert[] = (pestRows ?? []).map((record: any) => ({
        id: record.id,
        greenhouseId: record.greenhouse_id,
        problem: record.problem,
        severity: mapRiskLevel(record.severity),
        zone: record.affected_zone ?? "",
        detectedAt: record.detected_at,
        action: record.action_taken ?? "",
        followUp: record.follow_up ?? "",
        photoStoragePath: record.photo_storage_path ?? undefined,
        photoUrl: record.photo_storage_path
          ? pestPhotoUrls.get(record.photo_storage_path) ?? undefined
          : record.photo_url ?? undefined
      }));

      const harvestRecords: HarvestRecord[] = (harvestRows ?? []).map((record: any) => ({
        id: record.id,
        greenhouseId: record.greenhouse_id,
        date: record.occurred_at,
        kilograms: Number(record.kilograms ?? 0),
        firstQuality: Number(record.first_quality_kg ?? 0),
        secondQuality: Number(record.second_quality_kg ?? 0),
        discard: Number(record.discard_kg ?? 0),
        estimatedPrice: Number(record.estimated_price ?? 0),
        destination: record.destination ?? "",
        notes: record.notes ?? ""
      }));

      const costRecords: CostRecord[] = (costRows ?? []).map((record: any) => ({
        id: record.id,
        greenhouseId: record.greenhouse_id ?? "",
        date: record.occurred_at,
        category: mapCostCategory(record.category),
        amount: Number(record.amount ?? 0),
        notes: record.notes ?? ""
      }));

      const activities: Activity[] = [
        ...harvestRecords.slice(0, 2).map((record) => ({
          id: `activity-harvest-${record.id}`,
          greenhouseId: record.greenhouseId,
          title: "Cosecha registrada",
          detail: `${record.kilograms.toLocaleString("es-MX")} kg`,
          time: record.date
        })),
        ...irrigationRecords.slice(0, 2).map((record) => ({
          id: `activity-irrigation-${record.id}`,
          greenhouseId: record.greenhouseId,
          title: "Riego registrado",
          detail: `${record.liters.toLocaleString("es-MX")} L`,
          time: record.date
        }))
      ];

      hydrateWorkspace({
        organization,
        currentUser,
        crops,
        cropStages,
        nutritionReferenceRanges,
        nutritionObservationRules,
        greenhouses: mappedGreenhouses,
        tasks,
        irrigationRecords,
        nutritionRecords,
        applicationRecords,
        pestAlerts,
        harvestRecords,
        costRecords,
        activities
      });

      setState("ready");
    } catch (error) {
      setLoadError(initialLoadErrorMessage(error));
      setState("load-error");
    }
  }, [hydrateWorkspace]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app-background text-app-text">
        <div className="grid justify-items-center gap-5">
          <PortalMark animated className="h-12 w-24" />
          <MiraBrand stacked wordClassName="text-base tracking-[0.46em]" markClassName="hidden" />
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-app-muted">
            Cargando
          </p>
        </div>
      </main>
    );
  }

  if (state === "missing-env") {
    return <MissingEnvScreen />;
  }

  if (state === "signed-out") {
    return <SignInScreen onSignedIn={refresh} />;
  }

  if (state === "profile" && session) {
    return <CompleteProfileScreen session={session} onDone={refresh} onSignOut={signOut} />;
  }

  if (state === "onboarding" && session) {
    return <OnboardingScreen session={session} onDone={refresh} onSignOut={signOut} />;
  }

  if (state === "access-paused") {
    return <AccessPausedScreen message={accessPausedMessage} onSignOut={signOut} />;
  }

  if (state === "load-error") {
    return <LoadErrorScreen error={loadError || "No se pudo cargar tu espacio."} onRetry={refresh} onSignOut={signOut} />;
  }

  return <AppShell />;
}
