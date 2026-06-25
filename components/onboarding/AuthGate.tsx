"use client";

import type { Session } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { MiraBrand, PortalMark } from "@/components/brand/MiraBrand";
import { AtmosphericMapVisual } from "@/components/visuals/AtmosphericMapVisual";
import { Button } from "@/components/ui/Button";
import { Field, FormattedNumberInput, SelectInput, TextInput } from "@/components/forms/FormControls";
import { PreciseLocationField } from "@/components/forms/PreciseLocationField";
import { appErrorMessage } from "@/lib/errors";
import { INITIAL_CROP_ID } from "@/lib/crop-ddt";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useGreenhouseStore } from "@/lib/store";
import { parseNumericInput } from "@/lib/utils";
import type {
  Activity,
  ApplicationRecord,
  CostRecord,
  CropStage,
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

type AuthState = "loading" | "missing-env" | "signed-out" | "profile" | "onboarding" | "ready";

type OnboardingForm = {
  fullName: string;
  companyName: string;
  greenhouseName: string;
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

const initialCropVarieties = ["Saladette", "Roma", "Villa", "Strongton", "Cherry", "Bola", "Grape", "Heirloom", "Otra"];

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
    transporte: "Transporte"
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
    <AuthCard kicker="mira" title="Accede al sistema operativo de tu invernadero.">
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
  onDone
}: {
  session: Session;
  onDone: () => void;
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
        </div>
      </form>
    </AuthCard>
  );
}

function OnboardingScreen({
  session,
  onDone
}: {
  session: Session;
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      tomato_variety: values.variety,
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

  return (
    <AuthCard kicker="Primer acceso" title="Configura tu empresa y primer invernadero.">
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
              placeholder="Invernaderos Familia"
            />
          </Field>
        </section>

        <section className="grid gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">
              Primer invernadero
            </p>
            <p className="mt-3 text-sm leading-6 text-app-muted">
              Una ficha inicial para entrar con datos útiles desde el primer día.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre">
              <TextInput className="rounded-lg bg-app-background" name="greenhouseName" required placeholder="Invernadero 1" />
            </Field>
            <Field label="Variedad">
              <SelectInput className="rounded-lg bg-app-background" name="variety" defaultValue="Saladette" required>
                {initialCropVarieties.map((variety) => <option key={variety}>{variety}</option>)}
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
      </form>
    </AuthCard>
  );
}

export function AuthGate() {
  const [state, setState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const hydrateWorkspace = useGreenhouseStore((store) => store.hydrateWorkspace);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState("missing-env");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const nextSession = data.session;
    setSession(nextSession);

    if (!nextSession) {
      setState("signed-out");
      return;
    }

    await supabase.rpc("accept_company_invites");

    const { data: membership, error } = await supabase
      .from("company_members")
      .select("id, role, company_id, companies(id, name, legal_name, logo_url)")
      .eq("user_id", nextSession.user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (error) {
      setState("onboarding");
      return;
    }

    if (!membership) {
      setState("onboarding");
      return;
    }

    const company = Array.isArray(membership.companies)
      ? membership.companies[0]
      : membership.companies;

    const [
      { data: profile },
      { data: greenhouseRows }
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
        .order("created_at", { ascending: true })
    ]);

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
    const { data: managerMemberRows } = managerUserIds.length
      ? await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", membership.company_id)
        .eq("role", "manager")
        .eq("status", "active")
        .in("user_id", managerUserIds)
      : { data: [] };
    const activeManagerUserIds = (managerMemberRows ?? []).map((member: any) => member.user_id);
    const { data: managerProfiles } = activeManagerUserIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", activeManagerUserIds)
      : { data: [] };
    const managerProfileMap = new Map((managerProfiles ?? []).map((manager: any) => [manager.id, manager]));

    const [
      { data: taskRows },
      { data: irrigationRows },
      { data: nutritionRows },
      { data: applicationRows },
      { data: pestRows },
      { data: harvestRows },
      { data: costRows }
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
        cropId: greenhouse.crop_id ?? INITIAL_CROP_ID,
        variety: greenhouse.crop_variety ?? greenhouse.tomato_variety ?? "Roma",
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

    const pestAlerts: PestAlert[] = (pestRows ?? []).map((record: any) => ({
      id: record.id,
      greenhouseId: record.greenhouse_id,
      problem: record.problem,
      severity: mapRiskLevel(record.severity),
      zone: record.affected_zone ?? "",
      detectedAt: record.detected_at,
      action: record.action_taken ?? "",
      followUp: record.follow_up ?? "",
      photoUrl: record.photo_url ?? undefined
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
    return <CompleteProfileScreen session={session} onDone={refresh} />;
  }

  if (state === "onboarding" && session) {
    return <OnboardingScreen session={session} onDone={refresh} />;
  }

  return <AppShell />;
}
