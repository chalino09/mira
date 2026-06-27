"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ActivitySquare,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  CloudSun,
  Clock3,
  Droplets,
  Edit3,
  FileDown,
  Leaf,
  MapPin,
  Package,
  Plus,
  Ruler,
  Save,
  ShieldCheck,
  Sprout,
  Thermometer,
  Users,
  WalletCards
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";
import { CopilotPulseBand, MiraCopilotPanel } from "@/components/copilot/MiraCopilot";
import { MiraBrand, MiraWordmark } from "@/components/brand/MiraBrand";
import { AtmosphericMapVisual } from "@/components/visuals/AtmosphericMapVisual";
import { CropDdtPanel } from "@/components/crop/CropDdtPanel";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { GreenhouseCard } from "@/components/dashboard/GreenhouseCard";
import { CostChart, IrrigationChart, YieldChart } from "@/components/dashboard/Charts";
import { MonitoringSection } from "@/components/monitoring/MonitoringSection";
import { OverviewHero } from "@/components/overview/OverviewHero";
import { TelegramConnectionModal } from "@/components/integrations/TelegramConnectionModal";
import { OperationsSection } from "@/components/operations/OperationsSection";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { RiskBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { RecordModal } from "@/components/forms/RecordModal";
import { Field, SelectInput, TextInput } from "@/components/forms/FormControls";
import { navigationItemsForRole } from "@/data/navigation";
import { cropLabelForId, greenhouseDisplayName } from "@/lib/crop-ddt";
import { appErrorMessage } from "@/lib/errors";
import { buildCopilotPulse, localDateKey, managerMessageForInsight, type CopilotInsight } from "@/lib/mira-copilot";
import { useGreenhouseStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadCompanyAsset } from "@/lib/storage";
import { cn, formatCurrency, formatDate, formatNumber, parseNumericInput } from "@/lib/utils";
import type {
  ApplicationRecord,
  CostRecord,
  Greenhouse,
  HarvestRecord,
  IrrigationRecord,
  NutritionRecord,
  PestAlert,
  Task
} from "@/types";

function SectionHeader({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-10 border-b border-app-border pb-7 pt-8 md:pt-10">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
          <MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" />
          <h1 className="text-4xl font-light leading-none tracking-normal text-app-text md:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">{description}</p>
      </div>
      {action}
      </div>
    </div>
  );
}

function EditorialObject({
  index,
  label,
  value,
  detail,
  icon: Icon
}: {
  index: string;
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <article className="border-t border-app-border py-5">
      <div className="flex items-start gap-4">
        <span className="font-mono text-[11px] text-app-muted">{index}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">{label}</p>
            <Icon className="h-4 w-4 shrink-0 text-app-green" />
          </div>
          <p className="mt-4 text-3xl font-light tracking-normal text-app-text">{value}</p>
          <p className="mt-2 text-sm text-app-muted">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function EditorialRail({
  children,
  title
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside className="border-l border-app-border pl-6">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">{title}</p>
      {children}
    </aside>
  );
}

function cropPlantDetail(greenhouse: Greenhouse) {
  return [
    greenhouse.stemCount === 1 ? "Un tallo" : greenhouse.stemCount === 2 ? "Doble tallo" : "Tallos sin configurar",
    greenhouse.isGrafted === null ? "Injerto sin configurar" : greenhouse.isGrafted ? "Con injerto" : "Sin injerto"
  ].join(" · ");
}

function useFilteredData() {
  const state = useGreenhouseStore();
  const greenhouse = state.greenhouses.find((item) => item.id === state.selectedGreenhouseId) ?? state.greenhouses[0];
  const filter = <T extends { greenhouseId: string }>(items: T[]) =>
    greenhouse ? items.filter((item) => item.greenhouseId === greenhouse.id) : [];

  return {
    ...state,
    greenhouse,
    greenhouseTasks: filter(state.tasks),
    greenhouseIrrigation: filter(state.irrigationRecords),
    greenhouseNutrition: filter(state.nutritionRecords),
    greenhouseApplications: filter(state.applicationRecords),
    greenhousePests: filter(state.pestAlerts),
    greenhouseHarvest: filter(state.harvestRecords),
    greenhouseCosts: filter(state.costRecords),
    greenhouseActivities: filter(state.activities)
  };
}

function dateLabel(date: string) {
  return formatDate(date).replace(".", "");
}

function costByCategory(costs: CostRecord[]) {
  return Object.values(
    costs.reduce<Record<string, { category: string; amount: number }>>((acc, cost) => {
      acc[cost.category] = acc[cost.category] ?? { category: cost.category, amount: 0 };
      acc[cost.category].amount += cost.amount;
      return acc;
    }, {})
  );
}

async function completeTaskRecord(taskId: string, completeTask: (id: string) => void) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("missing_supabase_client");
  }

  const { error: rpcError } = await supabase.rpc("update_operational_task_status", {
    target_task_id: taskId,
    next_status: "completada",
    update_note: null
  });

  const missingOperationsRpc = ["42883", "PGRST202"].includes(rpcError?.code ?? "");
  const { error } = missingOperationsRpc
    ? await supabase.from("tasks").update({ status: "completada" }).eq("id", taskId)
    : { error: rpcError };

  if (error) throw error;
  completeTask(taskId);
}

function InlineNotice({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "red" | "green" }) {
  return (
    <div
      className={cn(
        "mb-5 border px-3 py-2 text-sm",
        tone === "neutral" && "border-app-border bg-white text-app-muted",
        tone === "green" && "border-[#C8DFC9] bg-app-soft text-app-green",
        tone === "red" && "border-[#E3BDBD] bg-app-red text-[#7B2A2A]"
      )}
      role={tone === "red" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

type CopilotSurfaceProps = {
  copilotInsights: CopilotInsight[];
  onCreateCopilotTask: (insight: CopilotInsight) => void;
  onOpenCopilot: () => void;
  onPrepareCopilotMessage: (insight: CopilotInsight) => void;
};

function OverviewSection({
  copilotInsights,
  onCreateCopilotTask,
  onOpenCopilot,
  onPrepareCopilotMessage
}: CopilotSurfaceProps) {
  const {
    greenhouse,
    greenhouseTasks,
    greenhouseIrrigation,
    greenhouseApplications,
    greenhousePests,
    greenhouseActivities,
    organization,
    currentUser,
    completeTask,
    tasks,
    setActiveSection
  } = useFilteredData();
  const [taskNotice, setTaskNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const lastIrrigation = greenhouseIrrigation[0];
  const lastApplication = greenhouseApplications[0];
  const pendingAlerts = greenhousePests.filter((alert) => alert.severity !== "Baja").length;

  if (!greenhouse) {
    return (
      <EmptyState
        icon={Sprout}
        title="No tienes un área productiva asignada. Pide a un owner o admin que te asigne como encargado."
      />
    );
  }

  const handleCompleteTask = async (taskId: string) => {
    setTaskNotice(null);
    setSavingTaskId(taskId);
    try {
      await completeTaskRecord(taskId, completeTask);
      setTaskNotice({ tone: "green", message: "Tarea marcada como completada." });
    } catch (caught) {
      setTaskNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo completar la tarea.") });
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <>
      {taskNotice ? <InlineNotice tone={taskNotice.tone}>{taskNotice.message}</InlineNotice> : null}
      <CopilotPulseBand
        insights={copilotInsights}
        onCreateTask={onCreateCopilotTask}
        onOpenCopilot={onOpenCopilot}
        onPrepareMessage={onPrepareCopilotMessage}
      />
      <OverviewHero
        alerts={greenhousePests}
        currentUser={currentUser}
        greenhouse={greenhouse}
        lastApplication={lastApplication}
        lastIrrigation={lastIrrigation}
        onCompleteTask={(taskId) => {
          if (!savingTaskId) {
            handleCompleteTask(taskId);
          }
        }}
        onOpenOperations={() => setActiveSection("calendar")}
        operationsTasks={tasks}
        organization={organization}
        pendingAlerts={pendingAlerts}
        tasks={greenhouseTasks}
      />
    </>
  );
}

function GreenhousesSection() {
  const { crops, currentUser, greenhouses, openModal, selectedGreenhouseId, setSelectedGreenhouseId } = useGreenhouseStore();
  const active = greenhouses.find((greenhouse) => greenhouse.id === selectedGreenhouseId) ?? greenhouses[0];
  const canManageGreenhouses = currentUser.role === "owner" || currentUser.role === "admin";

  return (
    <section>
      <SectionHeader
        action={canManageGreenhouses ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => openModal("greenhouse")} variant="secondary">Nueva área</Button> : undefined}
        title="Áreas productivas"
        description="Inventario de áreas, cultivos, variedades, responsables y estado productivo."
      />
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.35fr)_320px]">
        <div className="grid gap-3">
          {greenhouses.map((greenhouse) => (
            <GreenhouseCard
              key={greenhouse.id}
              greenhouse={greenhouse}
              onSelect={() => setSelectedGreenhouseId(greenhouse.id)}
              selected={greenhouse.id === selectedGreenhouseId}
            />
          ))}
        </div>
        {active ? (
          <EditorialRail title="Área activa">
            <EditorialObject
              detail={`${cropLabelForId(active.cropId, crops)} · ${active.variety || "Sin variedad"} · ${active.stage}`}
              icon={Sprout}
              index="01"
              label="Área seleccionada"
              value={active.name}
            />
            <EditorialObject
              detail={`${active.beds} camas · ${active.surface} · ${cropPlantDetail(active)}`}
              icon={Leaf}
              index="02"
              label="Plantas"
              value={formatNumber(active.plants)}
            />
            <CropDdtPanel greenhouse={active} />
            {canManageGreenhouses ? (
              <Button
                className="mt-5 w-full"
                icon={<Edit3 className="h-4 w-4" />}
                onClick={() => openModal("editGreenhouse")}
                variant="secondary"
              >
                Editar datos
              </Button>
            ) : null}
          </EditorialRail>
        ) : null}
      </div>
    </section>
  );
}

function IrrigationSection({ embedded = false }: { embedded?: boolean }) {
  const { greenhouseIrrigation, openModal } = useFilteredData();
  const totalLiters = greenhouseIrrigation.reduce((sum, record) => sum + record.liters, 0);
  const averageDuration = greenhouseIrrigation.length
    ? Math.round(greenhouseIrrigation.reduce((sum, record) => sum + record.durationMin, 0) / greenhouseIrrigation.length)
    : 0;
  const ecReadings = greenhouseIrrigation
    .map((record) => record.ec)
    .filter((ec): ec is number => ec !== null);
  const averageEc = ecReadings.length
    ? ecReadings.reduce((sum, ec) => sum + ec, 0) / ecReadings.length
    : null;
  const irrigationChartData = greenhouseIrrigation
    .slice(0, 7)
    .reverse()
    .map((record) => ({
      label: dateLabel(record.date),
      litros: record.liters
    }));

  return (
    <section>
      {!embedded ? (
        <SectionHeader
          action={<Button icon={<Droplets className="h-4 w-4" />} onClick={() => openModal("irrigation")} variant="secondary">Nuevo riego</Button>}
          title="Riego"
          description="Registro de duración, litros, válvulas y mediciones opcionales de pH y CE."
        />
      ) : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Droplets} label="Litros registrados" value={`${formatNumber(totalLiters)} L`} detail={`${greenhouseIrrigation.length} registros`} />
        <MetricCard icon={Clock3} label="Duración media" value={`${averageDuration} min`} detail="Según registros guardados" />
        <MetricCard icon={ActivitySquare} label="CE promedio" value={averageEc !== null ? averageEc.toFixed(1) : "--"} detail="Según registros con medición" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
        <IrrigationChart data={irrigationChartData} />
        <DataTable<IrrigationRecord>
          columns={[
            { key: "date", label: "Fecha", render: (item) => formatDate(item.date) },
            { key: "duration", label: "Duración", render: (item) => `${item.durationMin} min` },
            { key: "liters", label: "Litros", render: (item) => formatNumber(item.liters) },
            { key: "sector", label: "Sector", render: (item) => item.sector },
            { key: "ph", label: "pH", render: (item) => item.ph ?? "--" },
            { key: "ec", label: "CE", render: (item) => item.ec ?? "--" },
            { key: "responsible", label: "Responsable", render: (item) => item.responsible }
          ]}
          data={greenhouseIrrigation}
        />
      </div>
    </section>
  );
}

function NutritionSection({ embedded = false }: { embedded?: boolean }) {
  const { greenhouseNutrition, openModal } = useFilteredData();
  const latestNutrition = greenhouseNutrition[0];
  const averagePh = greenhouseNutrition.length
    ? greenhouseNutrition.reduce((sum, record) => sum + record.ph, 0) / greenhouseNutrition.length
    : 0;

  return (
    <section>
      {!embedded ? (
        <SectionHeader
          action={<Button icon={<Leaf className="h-4 w-4" />} onClick={() => openModal("nutrition")} variant="secondary">Nueva nutrición</Button>}
          title="Nutrición"
          description="Fertirriego, foliares, drench, objetivos nutricionales y condiciones de solución."
        />
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.5fr]">
        <div className="grid gap-3">
          <MetricCard icon={Leaf} label="Último producto" value={latestNutrition?.product ?? "Sin registros"} detail={latestNutrition?.dose ?? "Captura una nutrición para ver datos"} />
          <MetricCard icon={ActivitySquare} label="pH promedio" value={averagePh ? averagePh.toFixed(1) : "0"} detail="Según registros guardados" />
          <MetricCard icon={Sprout} label="Objetivo activo" value={latestNutrition?.objective ?? "Sin registros"} detail={latestNutrition?.stage ?? "Sin etapa registrada"} tone="soft" />
        </div>
        <DataTable<NutritionRecord>
          columns={[
            { key: "date", label: "Fecha", render: (item) => formatDate(item.date) },
            { key: "product", label: "Producto", render: (item) => item.product },
            { key: "dose", label: "Dosis", render: (item) => item.dose },
            { key: "method", label: "Método", render: (item) => item.method },
            { key: "objective", label: "Objetivo", render: (item) => item.objective },
            { key: "ph", label: "pH / CE", render: (item) => `${item.ph} / ${item.ec}` }
          ]}
          data={greenhouseNutrition}
        />
      </div>
    </section>
  );
}

function ApplicationsSection({ embedded = false }: { embedded?: boolean }) {
  const { greenhouseApplications, openModal } = useFilteredData();

  return (
    <section>
      {!embedded ? (
        <SectionHeader
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => openModal("application")} variant="secondary">Nueva aplicación</Button>}
          title="Aplicaciones"
          description="Bioestimulantes, fungicidas, insecticidas, fertilizantes, microorganismos y correctores."
        />
      ) : null}
      <DataTable<ApplicationRecord>
        columns={[
          { key: "date", label: "Fecha", render: (item) => formatDate(item.date) },
          { key: "category", label: "Tipo", render: (item) => <StatusBadge tone="green">{item.category}</StatusBadge> },
          { key: "product", label: "Producto", render: (item) => item.product },
          { key: "composition", label: "Composición", render: (item) => item.composition },
          { key: "dose", label: "Dosis", render: (item) => item.dose },
          { key: "area", label: "Área", render: (item) => item.area },
          { key: "safety", label: "Cosecha / reentrada", render: (item) => `${item.safetyInterval || "--"} · ${item.reentry || "--"}` }
        ]}
        data={greenhouseApplications}
      />
    </section>
  );
}

function PestsSection() {
  const { greenhousePests, openModal } = useFilteredData();

  return (
    <section>
      <SectionHeader
        action={<Button icon={<AlertTriangle className="h-4 w-4" />} onClick={() => openModal("pest")} variant="secondary">Nueva alerta</Button>}
        title="Plagas y enfermedades"
        description="Monitoreo sanitario, incidencia, zonas afectadas, acciones tomadas, seguimiento y reaplicación."
      />
      {greenhousePests.length ? (
        <div className="grid gap-0 border-b border-app-border">
          {greenhousePests.map((alert) => (
            <article key={alert.id} className="border-t border-app-border py-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                    {alert.zone} · detectado {formatDate(alert.detectedAt)}
                  </p>
                  <h3 className="mt-3 text-3xl font-light tracking-normal text-app-text">{alert.problem}</h3>
                </div>
                <RiskBadge level={alert.severity} />
              </div>
              <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
                <div className="border-l border-app-border pl-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Acción tomada</p>
                  <p className="mt-1 text-app-muted">{alert.action}</p>
                </div>
                <div className="border-l border-app-border pl-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Seguimiento / reaplicación</p>
                  <p className="mt-1 text-app-muted">{alert.followUp}</p>
                </div>
              </div>
              {alert.photoUrl ? (
                <div
                  aria-label={`Evidencia de ${alert.problem}`}
                  className="mt-5 h-72 w-full rounded-lg border border-app-border bg-cover bg-center"
                  role="img"
                  style={{ backgroundImage: `url(${alert.photoUrl})` }}
                />
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={AlertTriangle} title="No hay alertas sanitarias para esta área productiva." />
      )}
    </section>
  );
}

function HarvestSection({ embedded = false }: { embedded?: boolean }) {
  const { greenhouseHarvest, openModal } = useFilteredData();
  const totalKg = greenhouseHarvest.reduce((sum, item) => sum + item.kilograms, 0);
  const totalFirstQuality = greenhouseHarvest.reduce((sum, item) => sum + item.firstQuality, 0);
  const qualityPercent = totalKg ? Math.round((totalFirstQuality / totalKg) * 100) : 0;
  const averagePrice = greenhouseHarvest.length
    ? greenhouseHarvest.reduce((sum, item) => sum + item.estimatedPrice, 0) / greenhouseHarvest.length
    : 0;
  const harvestChartData = greenhouseHarvest
    .slice(0, 7)
    .reverse()
    .map((record) => ({
      label: dateLabel(record.date),
      kg: record.kilograms
    }));

  return (
    <section>
      {!embedded ? (
        <SectionHeader
          action={<Button icon={<Leaf className="h-4 w-4" />} onClick={() => openModal("harvest")} variant="secondary">Registrar no programada</Button>}
          title="Cosecha"
          description="Resultados de cosecha: kilogramos, calidad, precio y destino. Lo programado se confirma desde Operación."
        />
      ) : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Leaf} label="Kg acumulados" value={`${formatNumber(totalKg)} kg`} detail="Registros cargados" />
        <MetricCard icon={CheckCircle2} label="Primera calidad" value={`${qualityPercent}%`} detail="Según registros guardados" />
        <MetricCard icon={WalletCards} label="Precio estimado" value={formatCurrency(averagePrice)} detail="Promedio por kg" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.5fr]">
        <YieldChart data={harvestChartData} />
        <DataTable<HarvestRecord>
          columns={[
            { key: "date", label: "Fecha", render: (item) => formatDate(item.date) },
            { key: "kg", label: "Kg", render: (item) => formatNumber(item.kilograms) },
            { key: "first", label: "Primera", render: (item) => formatNumber(item.firstQuality) },
            { key: "second", label: "Segunda", render: (item) => formatNumber(item.secondQuality) },
            { key: "discard", label: "Descarte", render: (item) => formatNumber(item.discard) },
            { key: "price", label: "Precio", render: (item) => formatCurrency(item.estimatedPrice) },
            { key: "destination", label: "Destino", render: (item) => item.destination }
          ]}
          data={greenhouseHarvest}
        />
      </div>
    </section>
  );
}

type TechnicalRecordTab = "applications" | "nutrition" | "irrigation";

const technicalRecordTabs: Array<{ id: TechnicalRecordTab; label: string }> = [
  { id: "applications", label: "Aplicaciones" },
  { id: "nutrition", label: "Nutrición" },
  { id: "irrigation", label: "Riegos" }
];

function TechnicalRecordsSection() {
  const [activeRecord, setActiveRecord] = useState<TechnicalRecordTab>("applications");
  const openModal = useGreenhouseStore((state) => state.openModal);
  const manualRecordCopy: Record<TechnicalRecordTab, { label: string; modal: "application" | "nutrition" | "irrigation" | "harvest" }> = {
    applications: { label: "Registrar no programada", modal: "application" },
    nutrition: { label: "Registrar no programada", modal: "nutrition" },
    irrigation: { label: "Registrar no programado", modal: "irrigation" }
  };
  const manualRecord = manualRecordCopy[activeRecord];

  return (
    <section>
      <SectionHeader
        action={(
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => openModal(manualRecord.modal)} variant="secondary">
            {manualRecord.label}
          </Button>
        )}
        title="Registros técnicos"
        description="Consulta lo que ya fue realizado. Las nuevas actividades se programan y se completan desde Operación."
      />
      <div className="mb-7 border-y border-app-border py-3">
        <div className="flex flex-wrap gap-2">
          {technicalRecordTabs.map((tab) => (
            <Button
              key={tab.id}
              onClick={() => setActiveRecord(tab.id)}
              variant={activeRecord === tab.id ? "primary" : "ghost"}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-app-muted">
          Lo programado se guarda aquí al completarse en Operación. Usa la captura manual únicamente para trabajos que no se programaron a tiempo.
        </p>
      </div>
      {activeRecord === "applications" ? <ApplicationsSection embedded /> : null}
      {activeRecord === "nutrition" ? <NutritionSection embedded /> : null}
      {activeRecord === "irrigation" ? <IrrigationSection embedded /> : null}
    </section>
  );
}

function CostsSection() {
  const { greenhouse, greenhouseCosts, greenhouseHarvest, openModal } = useFilteredData();
  const totalCost = greenhouseCosts.reduce((sum, item) => sum + item.amount, 0);
  const totalKg = greenhouseHarvest.reduce((sum, item) => sum + item.kilograms, 0);
  const costPerKg = totalKg ? totalCost / totalKg : 0;
  const costChartData = costByCategory(greenhouseCosts);
  const budgetAmount = greenhouse?.budgetAmount ?? null;
  const remainingBudget = budgetAmount === null ? null : budgetAmount - totalCost;
  const budgetUsed = budgetAmount && budgetAmount > 0 ? Math.min(100, Math.round((totalCost / budgetAmount) * 100)) : null;

  return (
    <section>
      <SectionHeader
        action={<Button icon={<WalletCards className="h-4 w-4" />} onClick={() => openModal("cost")} variant="secondary">Nuevo costo</Button>}
        title="Costos"
        description="Mano de obra, insumos, agua, energía, renta, gasolina, refrescos y margen estimado."
      />
      {budgetAmount === null ? (
        <div className="mb-5 border border-[#E3D7B6] bg-[#FFF8E6] px-4 py-3 text-sm leading-6 text-[#725A1A]">
          Presupuesto del ciclo pendiente de configurar. Puedes seguir operando y capturando costos; cuando lo agregues al área productiva se activará el comparativo.
        </div>
      ) : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={WalletCards} label="Costo acumulado" value={formatCurrency(totalCost)} detail="Registros del periodo" />
        <MetricCard icon={ActivitySquare} label="Presupuesto" value={budgetAmount === null ? "Pendiente" : formatCurrency(budgetAmount)} detail={budgetUsed === null ? "Configurar en área" : `${budgetUsed}% usado`} tone="soft" />
        <MetricCard icon={WalletCards} label="Disponible" value={remainingBudget === null ? "--" : formatCurrency(remainingBudget)} detail={remainingBudget !== null && remainingBudget < 0 ? "Presupuesto rebasado" : "Contra costos reales"} />
        <MetricCard icon={Leaf} label="Costo por kg" value={formatCurrency(costPerKg)} detail="Contra kg cosechados" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.5fr]">
        <CostChart data={costChartData} />
        <DataTable<CostRecord>
          columns={[
            { key: "date", label: "Fecha", render: (item) => formatDate(item.date) },
            { key: "category", label: "Categoría", render: (item) => item.category },
            { key: "amount", label: "Monto", render: (item) => formatCurrency(item.amount) },
            { key: "notes", label: "Notas", render: (item) => item.notes }
          ]}
          data={greenhouseCosts}
        />
      </div>
    </section>
  );
}

function ReportsSection() {
  const { greenhouseHarvest, greenhouseCosts, greenhouseIrrigation } = useFilteredData();
  const harvestChartData = greenhouseHarvest
    .slice(0, 7)
    .reverse()
    .map((record) => ({ label: dateLabel(record.date), kg: record.kilograms }));
  const costChartData = costByCategory(greenhouseCosts);
  const irrigationChartData = greenhouseIrrigation
    .slice(0, 7)
    .reverse()
    .map((record) => ({ label: dateLabel(record.date), litros: record.liters }));

  return (
    <section>
      <SectionHeader
        title="Reportes"
        description="Vistas ejecutivas para producción, aplicaciones, costos, sanidad y rendimiento por área productiva."
      />
      <AtmosphericMapVisual className="mb-5" variant="reports" />
      <div className="grid gap-5 xl:grid-cols-2">
        <YieldChart data={harvestChartData} />
        <CostChart data={costChartData} />
        <IrrigationChart data={irrigationChartData} />
        <div className="border-y border-app-border py-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Exportaciones</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {["Producción semanal", "Aplicaciones por cultivo", "Historial sanitario", "Rendimiento por área"].map((item) => (
              <div key={item} className="flex h-14 items-center justify-between border-t border-app-border px-1 text-sm font-medium text-app-text">
                {item}
                <FileDown className="h-4 w-4 text-app-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  title,
  kicker,
  description,
  icon: Icon,
  action,
  children
}: {
  title: string;
  kicker: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="border-t border-app-border py-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-app-border bg-white text-app-green">
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">{kicker}</p>
          </div>
          <h3 className="mt-4 text-2xl font-light tracking-normal text-app-text">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </article>
  );
}

function SettingRow({
  label,
  value,
  detail
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
}) {
  return (
    <div className="border-t border-app-border py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">{label}</p>
        <div className="text-left sm:text-right">
          <p className="text-sm font-medium text-app-text">{value}</p>
          {detail ? <p className="mt-1 text-xs leading-5 text-app-muted">{detail}</p> : null}
        </div>
      </div>
    </div>
  );
}

function getUniqueProducts(applications: ApplicationRecord[], nutrition: NutritionRecord[]) {
  const products = new Map<string, { name: string; category: string; dose: string; detail: string }>();

  applications.forEach((record) => {
    products.set(`${record.category}-${record.product}`, {
      name: record.product,
      category: record.category,
      dose: record.dose,
      detail: record.composition || record.area || "Aplicación registrada"
    });
  });

  nutrition.forEach((record) => {
    products.set(`Nutrición-${record.product}`, {
      name: record.product,
      category: "Nutrición",
      dose: record.dose,
      detail: `${record.method} · ${record.objective}`
    });
  });

  return Array.from(products.values());
}

function greenhouseSurfaceTotal(greenhouses: Greenhouse[]) {
  return greenhouses.reduce((sum, greenhouse) => {
    return sum + (parseNumericInput(greenhouse.surface) ?? 0);
  }, 0);
}

type SettingsKey = "company" | "users" | "units" | "catalog" | "greenhouses" | "integrations";
type MemberRole = "owner" | "admin" | "manager";
type MemberStatus = "invited" | "active" | "disabled";

type CompanyMember = {
  id: string;
  userId: string | null;
  invitedEmail: string | null;
  fullName: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  createdAt: string;
};

const roleLabels: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager"
};

const statusLabels: Record<MemberStatus, string> = {
  active: "Activo",
  invited: "Invitado",
  disabled: "Desactivado"
};

const statusTone: Record<MemberStatus, "green" | "amber" | "red"> = {
  active: "green",
  invited: "amber",
  disabled: "red"
};

const memberRoles: MemberRole[] = ["owner", "admin", "manager"];

function SettingsCard({
  title,
  description,
  kicker,
  value,
  icon: Icon,
  onClick
}: {
  title: string;
  description: string;
  kicker: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      className="group min-h-[210px] border-t border-app-border py-6 text-left transition hover:bg-white/50 focus:outline-none focus:ring-2 focus:ring-app-green/20"
      onClick={onClick}
      type="button"
    >
      <div className="flex h-full flex-col justify-between gap-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-app-muted">{kicker}</p>
            <h3 className="mt-4 text-3xl font-light tracking-normal text-app-text">{title}</h3>
            <p className="mt-3 max-w-md text-sm leading-6 text-app-muted">{description}</p>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-app-border bg-white text-app-green transition group-hover:border-app-green">
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-app-muted">{value}</p>
      </div>
    </button>
  );
}

function SettingsSection() {
  const {
    organization,
    currentUser,
    crops,
    greenhouses,
    applicationRecords,
    nutritionRecords,
    openModal,
    setActiveSection,
    setSelectedGreenhouseId,
    updateOrganization
  } = useGreenhouseStore();
  const [activeSetting, setActiveSetting] = useState<SettingsKey | null>(null);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [membersNotice, setMembersNotice] = useState("");
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [isInvitingMember, setIsInvitingMember] = useState(false);
  const [unitSettings, setUnitSettings] = useState({
    surface: "m2 / ha",
    water: "L",
    production: "kg",
    temperature: "°C",
    solution: "Opcional",
    currency: "MXN"
  });
  const products = getUniqueProducts(applicationRecords, nutritionRecords);
  const totalSurface = greenhouseSurfaceTotal(greenhouses);
  const canManageUsers = currentUser.role === "owner" || currentUser.role === "admin";
  const activeMemberCount = members.filter((member) => member.status === "active").length;
  const activeOwnerCount = members.filter((member) => member.role === "owner" && member.status === "active").length;

  const loadMembers = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;

    setIsLoadingMembers(true);
    const { data: memberRows, error } = await supabase
      .from("company_members")
      .select("id, user_id, invited_email, role, status, created_at")
      .eq("company_id", organization.id)
      .order("created_at", { ascending: true });

    if (error) {
      setMembersNotice(appErrorMessage(error, "No se pudieron cargar los usuarios."));
      setIsLoadingMembers(false);
      return;
    }

    const userIds = Array.from(
      new Set((memberRows ?? []).map((member: any) => member.user_id).filter(Boolean))
    );
    const { data: profileRows, error: profilesError } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : { data: [], error: null };
    if (profilesError) {
      setMembersNotice(appErrorMessage(profilesError, "No se pudieron cargar algunos perfiles."));
    }
    const profiles = new Map((profileRows ?? []).map((profile: any) => [profile.id, profile]));

    setMembers(
      (memberRows ?? []).map((member: any) => {
        const profile = member.user_id ? profiles.get(member.user_id) : null;
        const email = profile?.email ?? member.invited_email ?? "";

        return {
          id: member.id,
          userId: member.user_id,
          invitedEmail: member.invited_email,
          fullName: profile?.full_name ?? email.split("@")[0] ?? "Invitado",
          email,
          role: member.role,
          status: member.status,
          createdAt: member.created_at
        };
      })
    );
    setIsLoadingMembers(false);
  }, [organization.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const editGreenhouse = (greenhouseId: string) => {
    setSelectedGreenhouseId(greenhouseId);
    openModal("editGreenhouse");
  };

  const handleCompanySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSettingsNotice("");
    setIsSavingCompany(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("companyName") ?? "").trim();
    const legalName = String(form.get("legalName") ?? "").trim();
    const logo = form.get("companyLogo");

    try {
      if (!name) {
        throw new Error("El nombre comercial es obligatorio.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase || !organization.id) {
        throw new Error("No se pudo conectar con Supabase.");
      }

      const logoUrl =
        logo instanceof File && logo.size > 0
          ? await uploadCompanyAsset({
              bucket: "company-assets",
              companyId: organization.id,
              file: logo,
              supabase,
              type: "logo"
            })
          : organization.logoUrl;

      const { error } = await supabase
        .from("companies")
        .update({ name, legal_name: legalName || null, logo_url: logoUrl ?? null })
        .eq("id", organization.id);

      if (error) throw error;

      updateOrganization({ ...organization, name, legalName: legalName || undefined, logoUrl });
      setSettingsNotice("Empresa actualizada.");
    } catch (caught) {
      setSettingsNotice(appErrorMessage(caught, "No se pudo guardar la empresa."));
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleInviteMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMembersNotice("");
    setIsInvitingMember(true);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("memberEmail") ?? "").trim().toLowerCase();
    const role = String(form.get("memberRole") ?? "manager") as MemberRole;

    try {
      if (!canManageUsers) {
        throw new Error("Tu rol no permite administrar usuarios.");
      }
      if (!email) {
        throw new Error("Escribe el correo del usuario.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase || !organization.id) {
        throw new Error("No se pudo conectar con Supabase.");
      }

      const { error } = await supabase.rpc("invite_company_member", {
        target_company_id: organization.id,
        target_email: email,
        requested_role: role
      });

      if (error) throw error;

      formElement.reset();
      setMembersNotice("Invitación guardada. Crea ese usuario en Supabase Auth si todavía no existe.");
      await loadMembers();
    } catch (caught) {
      setMembersNotice(appErrorMessage(caught, "No se pudo invitar al usuario."));
    } finally {
      setIsInvitingMember(false);
    }
  };

  const updateMemberAccess = async (
    member: CompanyMember,
    nextRole: MemberRole,
    nextStatus: MemberStatus
  ) => {
    setMembersNotice("");
    setSavingMemberId(member.id);

    try {
      if (!canManageUsers) {
        throw new Error("Tu rol no permite administrar usuarios.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("No se pudo conectar con Supabase.");
      }

      const { error } = await supabase.rpc("update_company_member_access", {
        target_member_id: member.id,
        requested_role: nextRole,
        requested_status: nextStatus
      });

      if (error) throw error;

      setMembersNotice("Permisos actualizados.");
      await loadMembers();
    } catch (caught) {
      setMembersNotice(appErrorMessage(caught, "No se pudieron actualizar los permisos."));
    } finally {
      setSavingMemberId(null);
    }
  };

  const settingsCards: Array<{
    key: SettingsKey;
    title: string;
    description: string;
    kicker: string;
    value: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      key: "company",
      title: "Empresa",
      description: "Nombre comercial, razón social, zona horaria y estado del espacio.",
      kicker: "Base",
      value: organization.name || "Sin nombre",
      icon: Building2
    },
    {
      key: "users",
      title: "Usuarios y permisos",
      description: "Roles de trabajo para dueño, administrador y encargado operativo.",
      kicker: "Acceso",
      value: `${activeOwnerCount || 1} owner · ${activeMemberCount || 1} activo${(activeMemberCount || 1) === 1 ? "" : "s"}`,
      icon: Users
    },
    {
      key: "units",
      title: "Unidades",
      description: "Preferencias de superficie, volumen, producción, clima y moneda.",
      kicker: "Operación",
      value: `${unitSettings.surface} · ${unitSettings.currency}`,
      icon: Ruler
    },
    {
      key: "catalog",
      title: "Catálogo",
      description: "Productos usados en nutrición y aplicaciones para trazabilidad.",
      kicker: "Insumos",
      value: `${products.length} productos`,
      icon: Package
    },
    {
      key: "greenhouses",
      title: "Áreas productivas",
      description: "Áreas, ubicación, superficie, cultivo, variedad y responsable.",
      kicker: "Producción",
      value: `${greenhouses.length} activos`,
      icon: Sprout
    },
    {
      key: "integrations",
      title: "Sensores e integraciones",
      description: "Clima exterior, sensores internos, alertas y datos externos.",
      kicker: "Futuro",
      value: "Clima activo",
      icon: CloudSun
    }
  ];

  const activeCard = settingsCards.find((card) => card.key === activeSetting);

  if (!activeSetting) {
    return (
      <section>
        <SectionHeader
          title="Ajustes"
          description="Elige un bloque de configuración para revisar o cambiar su información."
        />

        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
          {settingsCards.map((card) => (
            <SettingsCard
              key={card.key}
              description={card.description}
              icon={card.icon}
              kicker={card.kicker}
              onClick={() => {
                setSettingsNotice("");
                setActiveSetting(card.key);
              }}
              title={card.title}
              value={card.value}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader
        action={
          <Button icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setActiveSetting(null)} variant="secondary">
            Volver
          </Button>
        }
        title={activeCard?.title ?? "Ajustes"}
        description={activeCard?.description ?? "Configuración del espacio."}
      />

      {activeSetting === "company" ? (
        <SettingsPanel
          action={<StatusBadge tone="green">Editable</StatusBadge>}
          description="Información que se usará en reportes, encabezados y operación multiempresa."
          icon={Building2}
          kicker="Empresa"
          title="Datos de la organización"
        >
          <form className="grid gap-5 md:grid-cols-2" onSubmit={handleCompanySubmit}>
            <Field label="Nombre comercial">
              <TextInput name="companyName" required defaultValue={organization.name} />
            </Field>
            <Field label="Razón social">
              <TextInput name="legalName" defaultValue={organization.legalName ?? ""} />
            </Field>
            <Field label="Logo de empresa">
              <TextInput accept="image/*" name="companyLogo" type="file" />
            </Field>
            <div className="flex items-end">
              {organization.logoUrl ? (
                <div
                  aria-label={`Logo de ${organization.name}`}
                  className="h-14 w-44 rounded-lg border border-app-border bg-white bg-contain bg-center bg-no-repeat p-2"
                  role="img"
                  style={{ backgroundImage: `url(${organization.logoUrl})` }}
                />
              ) : (
                <p className="text-sm text-app-muted">Sin logo cargado.</p>
              )}
            </div>
            <SettingRow label="Zona horaria" value="America/Mexico_City" detail="Fechas, calendario y reportes" />
            <SettingRow label="Estado" value={<StatusBadge tone="green">Activo</StatusBadge>} />
            <div className="md:col-span-2">
              {settingsNotice ? <p className="mb-3 text-sm text-app-muted">{settingsNotice}</p> : null}
              <Button disabled={isSavingCompany} icon={<Save className="h-4 w-4" />} type="submit" variant="primary">
                {isSavingCompany ? "Guardando..." : "Guardar empresa"}
              </Button>
            </div>
          </form>
        </SettingsPanel>
      ) : null}

      {activeSetting === "users" ? (
        <SettingsPanel
          action={<StatusBadge tone={canManageUsers ? "green" : "neutral"}>{canManageUsers ? "Editable" : "Lectura"}</StatusBadge>}
          description="Control de acceso para dueños, administradores, encargados y operadores."
          icon={Users}
          kicker="Usuarios"
          title="Usuarios y permisos"
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="grid gap-3 border-b border-app-border">
                {isLoadingMembers ? (
                  <SettingRow label="Cargando" value="Consultando miembros" detail="Un momento." />
                ) : members.length ? (
                  members.map((member) => {
                    const disabled = !canManageUsers || savingMemberId === member.id;
                    const statusOptions: MemberStatus[] = member.userId ? ["active", "disabled"] : ["invited", "disabled"];

                    return (
                      <div key={member.id} className="border-t border-app-border py-4">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_150px_160px] lg:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-app-text">{member.fullName}</p>
                              <StatusBadge tone={statusTone[member.status]}>{statusLabels[member.status]}</StatusBadge>
                            </div>
                            <p className="mt-1 truncate text-xs leading-5 text-app-muted">
                              {member.email || member.invitedEmail || "Sin correo"} · {member.userId ? "Usuario activo" : "Invitación pendiente"}
                            </p>
                          </div>
                          <SelectInput
                            aria-label={`Rol de ${member.email}`}
                            disabled={disabled}
                            value={member.role}
                            onChange={(event) => updateMemberAccess(member, event.target.value as MemberRole, member.status)}
                          >
                            {memberRoles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ))}
                          </SelectInput>
                          <SelectInput
                            aria-label={`Estado de ${member.email}`}
                            disabled={disabled}
                            value={member.status}
                            onChange={(event) => updateMemberAccess(member, member.role, event.target.value as MemberStatus)}
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {statusLabels[status]}
                              </option>
                            ))}
                          </SelectInput>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState icon={Users} title="Aún no hay miembros cargados." />
                )}
              </div>
              {membersNotice ? <p className="mt-4 text-sm text-app-muted">{membersNotice}</p> : null}
            </div>

            <aside className="border-t border-app-border pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                Invitar usuario
              </p>
              <form className="mt-5 grid gap-4" onSubmit={handleInviteMember}>
                <Field label="Correo">
                  <TextInput
                    autoComplete="email"
                    disabled={!canManageUsers || isInvitingMember}
                    name="memberEmail"
                    placeholder="encargado@empresa.com"
                    required
                    type="email"
                  />
                </Field>
                <Field label="Rol">
                  <SelectInput disabled={!canManageUsers || isInvitingMember} name="memberRole" defaultValue="manager">
                    {memberRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Button disabled={!canManageUsers || isInvitingMember} icon={<Plus className="h-4 w-4" />} type="submit" variant="primary">
                  {isInvitingMember ? "Invitando..." : "Guardar invitación"}
                </Button>
              </form>
              <div className="mt-6 border-t border-app-border pt-5">
                <SettingRow label="Owner" value="Configura todo" detail="Empresa, usuarios, registros y ajustes" />
                <SettingRow label="Admin" value="Opera y configura" detail="Sin cambios críticos de propiedad" />
                <SettingRow label="Manager" value="Captura operación" detail="Riego, nutrición, aplicaciones y cosecha" />
              </div>
            </aside>
          </div>
        </SettingsPanel>
      ) : null}

      {activeSetting === "units" ? (
        <SettingsPanel
          description="Preferencias con las que se muestran capturas, reportes y comparativos."
          icon={Ruler}
          kicker="Operación"
          title="Unidades de medición"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Superficie">
              <SelectInput
                value={unitSettings.surface}
                onChange={(event) => setUnitSettings((state) => ({ ...state, surface: event.target.value }))}
              >
                <option>m2 / ha</option>
                <option>Solo m2</option>
                <option>Solo ha</option>
              </SelectInput>
            </Field>
            <Field label="Volumen">
              <SelectInput
                value={unitSettings.water}
                onChange={(event) => setUnitSettings((state) => ({ ...state, water: event.target.value }))}
              >
                <option>L</option>
                <option>m3</option>
              </SelectInput>
            </Field>
            <Field label="Producción">
              <SelectInput
                value={unitSettings.production}
                onChange={(event) => setUnitSettings((state) => ({ ...state, production: event.target.value }))}
              >
                <option>kg</option>
                <option>ton</option>
              </SelectInput>
            </Field>
            <Field label="Temperatura">
              <SelectInput
                value={unitSettings.temperature}
                onChange={(event) => setUnitSettings((state) => ({ ...state, temperature: event.target.value }))}
              >
                <option>°C</option>
                <option>°F</option>
              </SelectInput>
            </Field>
            <Field label="pH / CE en riego">
              <SelectInput
                value={unitSettings.solution}
                onChange={(event) => setUnitSettings((state) => ({ ...state, solution: event.target.value }))}
              >
                <option>Opcional</option>
                <option>Requerido</option>
              </SelectInput>
            </Field>
            <Field label="Moneda">
              <SelectInput
                value={unitSettings.currency}
                onChange={(event) => setUnitSettings((state) => ({ ...state, currency: event.target.value }))}
              >
                <option>MXN</option>
                <option>USD</option>
              </SelectInput>
            </Field>
            <p className="md:col-span-2 text-sm leading-6 text-app-muted">
              Estas preferencias quedan listas en pantalla. Para hacerlas globales después agregamos una tabla de preferencias por empresa.
            </p>
          </div>
        </SettingsPanel>
      ) : null}

      {activeSetting === "catalog" ? (
        <SettingsPanel
          description="Productos observados en aplicaciones y nutrición. La captura operativa comienza desde Operación."
          icon={Package}
          kicker="Catálogo"
          title="Catálogo de productos"
        >
          {products.length ? (
            <div className="border-b border-app-border">
              {products.slice(0, 5).map((product) => (
                <SettingRow
                  key={`${product.category}-${product.name}`}
                  detail={`${product.category} · ${product.detail}`}
                  label={product.name}
                  value={product.dose || "Sin dosis"}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={Package} title="Aún no hay productos registrados por uso." />
          )}
        </SettingsPanel>
      ) : null}

      {activeSetting === "greenhouses" ? (
        <SettingsPanel
          action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => openModal("greenhouse")} variant="ghost">Nuevo</Button>}
          description={`Administración rápida de áreas productivas, ubicación, superficie y responsables. Superficie total: ${formatNumber(totalSurface)} m2.`}
          icon={Sprout}
          kicker="Producción"
          title="Áreas productivas"
        >
          <div className="border-b border-app-border">
            {greenhouses.map((greenhouse) => (
              <div key={greenhouse.id} className="border-t border-app-border py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-app-text">{greenhouseDisplayName(greenhouse, crops)}</p>
                    <p className="mt-1 text-xs leading-5 text-app-muted">
                      {greenhouse.location || "Sin ubicación"} · {greenhouse.surface} · {greenhouse.variety || "Sin variedad"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-app-muted">
                      Encargado: {greenhouse.manager}
                    </p>
                  </div>
                  <Button icon={<Edit3 className="h-4 w-4" />} onClick={() => editGreenhouse(greenhouse.id)} variant="ghost">
                    Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </SettingsPanel>
      ) : null}

      {activeSetting === "integrations" ? (
        <SettingsPanel
          description="Espacio reservado para clima, sensores internos, WhatsApp, exportaciones e integraciones externas."
          icon={CloudSun}
          kicker="Futuro"
          title="Sensores e integraciones"
        >
          <div className="grid gap-x-6 sm:grid-cols-2">
            <SettingRow label="Clima exterior" value={<StatusBadge tone="green">Activo</StatusBadge>} detail="Open-Meteo por ubicación" />
            <SettingRow label="Sensores internos" value="Preparado" detail="Temperatura, humedad, CE, pH y riego" />
            <SettingRow label="Alertas" value="Próximo" detail="WhatsApp o notificaciones internas" />
            <SettingRow label="Datos recomendados" value="Latitud / longitud" detail="Para clima más preciso" />
          </div>
        </SettingsPanel>
      ) : null}

      <div className="mt-8 border-t border-app-border py-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Button icon={<MapPin className="h-4 w-4" />} onClick={() => setActiveSection("greenhouses")} variant="secondary">
            Ver áreas
          </Button>
          <Button icon={<Thermometer className="h-4 w-4" />} onClick={() => setActiveSection("irrigation")} variant="secondary">
            Revisar riego
          </Button>
          <Button icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setActiveSection("reports")} variant="secondary">
            Ir a reportes
          </Button>
        </div>
      </div>
    </section>
  );
}

function ActiveSection(props: CopilotSurfaceProps) {
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const canOpenSection = navigationItemsForRole(currentUser.role).some((item) => item.id === activeSection);

  if (!canOpenSection) return <OverviewSection {...props} />;

  if (activeSection === "overview") return <OverviewSection {...props} />;
  if (activeSection === "greenhouses") return <GreenhousesSection />;
  if (activeSection === "calendar") return <OperationsSection copilotInsights={props.copilotInsights} onCreateCopilotTask={props.onCreateCopilotTask} onPrepareCopilotMessage={props.onPrepareCopilotMessage} />;
  if (activeSection === "monitoring") return <MonitoringSection />;
  if (activeSection === "records") return <TechnicalRecordsSection />;
  if (activeSection === "irrigation") return <IrrigationSection />;
  if (activeSection === "nutrition") return <NutritionSection />;
  if (activeSection === "applications") return <ApplicationsSection />;
  if (activeSection === "pests") return <PestsSection />;
  if (activeSection === "harvest") return <HarvestSection />;
  if (activeSection === "costs") return <CostsSection />;
  if (activeSection === "reports") return <ReportsSection />;
  return <SettingsSection />;
}

export function AppShell() {
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const organization = useGreenhouseStore((state) => state.organization);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const tasks = useGreenhouseStore((state) => state.tasks);
  const pestAlerts = useGreenhouseStore((state) => state.pestAlerts);
  const setActiveSection = useGreenhouseStore((state) => state.setActiveSection);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotRunning, setCopilotRunning] = useState(false);
  const [copilotNotice, setCopilotNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [remoteCopilotInsights, setRemoteCopilotInsights] = useState<CopilotInsight[]>([]);
  const activeLabel = navigationItemsForRole(currentUser.role).find((item) => item.id === activeSection)?.label ?? "Inicio";
  const localCopilotInsights = useMemo(
    () =>
      buildCopilotPulse({
        activeGreenhouseId: selectedGreenhouseId || null,
        alerts: pestAlerts,
        greenhouses,
        tasks
      }),
    [greenhouses, pestAlerts, selectedGreenhouseId, tasks]
  );
  const copilotInsights = remoteCopilotInsights.length ? remoteCopilotInsights : localCopilotInsights;

  const mapRemoteInsights = (rows: any[]): CopilotInsight[] =>
    rows.map((row, index) => ({
      id: row.id ?? row.source_id ?? `remote-${index}`,
      sourceType: row.source_type ?? "operation",
      sourceId: row.source_id ?? null,
      greenhouseId: row.greenhouse_id ?? null,
      title: row.title ?? "Atencion operativa",
      detail: row.detail ?? "Revisar evidencia antes de actuar.",
      severity: row.severity ?? "medium",
      recommendedAction: row.recommended_action ?? "Revisar antes de actuar.",
      evidence: Array.isArray(row.evidence) ? row.evidence : []
    }));

  const runCopilot = async () => {
    if (!organization.id) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setCopilotRunning(true);
    setCopilotNotice(null);
    try {
      const { data, error } = await supabase.functions.invoke("mira-copilot", {
        body: {
          company_id: organization.id,
          greenhouse_id: selectedGreenhouseId || null
        }
      });
      if (error) throw error;
      const insights = mapRemoteInsights(data?.insights ?? []);
      if (insights.length) setRemoteCopilotInsights(insights);
      setCopilotNotice({ tone: "green", message: "Mira Copilot actualizo el pulso operativo." });
    } catch (caught) {
      setRemoteCopilotInsights([]);
      setCopilotNotice({
        tone: "red",
        message: appErrorMessage(caught, "Copilot usara el pulso local hasta desplegar la funcion.")
      });
    } finally {
      setCopilotRunning(false);
    }
  };

  const prepareCopilotMessage = async (insight: CopilotInsight) => {
    const supabase = getSupabaseBrowserClient();
    const message = managerMessageForInsight(insight);
    setCopilotNotice(null);

    if (!supabase || !organization.id) {
      setCopilotNotice({ tone: "red", message: "No se pudo conectar con Supabase para guardar el borrador." });
      return;
    }

    const { error } = await supabase.from("copilot_manager_messages").insert({
      company_id: organization.id,
      greenhouse_id: (insight.greenhouseId ?? selectedGreenhouseId) || null,
      task_id: insight.sourceType === "operation" ? insight.sourceId ?? null : null,
      message_body: message,
      status: "draft",
      created_by: currentUser.id || null
    });

    if (error) {
      setCopilotNotice({
        tone: "red",
        message: appErrorMessage(error, "No se pudo guardar el mensaje como borrador.")
      });
      return;
    }

    setCopilotNotice({ tone: "green", message: "Mensaje a manager guardado como borrador." });
  };

  const createCopilotTaskSuggestion = async (insight: CopilotInsight) => {
    const supabase = getSupabaseBrowserClient();
    setCopilotNotice(null);

    if (!supabase || !organization.id) {
      setCopilotNotice({ tone: "red", message: "No se pudo conectar con Supabase para guardar la tarea sugerida." });
      return;
    }

    if (!(insight.greenhouseId || selectedGreenhouseId)) {
      setCopilotNotice({ tone: "red", message: "Selecciona un invernadero para guardar la tarea sugerida." });
      return;
    }

    const { error } = await supabase.from("copilot_task_suggestions").insert({
      company_id: organization.id,
      greenhouse_id: insight.greenhouseId ?? selectedGreenhouseId,
      suggested_type: "otro",
      suggested_title: `Seguimiento: ${insight.title}`,
      suggested_date: localDateKey(),
      suggested_priority: insight.severity === "critical" || insight.severity === "high" ? "high" : "normal",
      suggested_instructions: `${insight.detail}\n\nAccion sugerida por Mira Copilot: ${insight.recommendedAction}`,
      status: "draft",
      created_by: currentUser.id || null
    });

    if (error) {
      setCopilotNotice({
        tone: "red",
        message: appErrorMessage(error, "No se pudo guardar la tarea sugerida.")
      });
      return;
    }

    setCopilotNotice({ tone: "green", message: "Tarea sugerida guardada como borrador." });
  };

  return (
    <div className="min-h-screen bg-app-background text-app-text">
      <div className="flex min-h-screen">
        <Sidebar onOpenTelegram={() => setTelegramOpen(true)} />
        <div className="min-w-0 flex-1 pl-14 lg:pl-0">
          <Topbar copilotInsightCount={copilotInsights.length} onOpenCopilot={() => setCopilotOpen(true)} />
          <main className="mx-auto w-full max-w-[1500px] px-4 py-5 lg:px-6">
            <div className="mb-4 lg:hidden">
              <p className="text-xs font-medium uppercase text-app-muted">{activeLabel}</p>
              <MiraBrand className="mt-1" markClassName="h-5 w-8" wordClassName="text-lg tracking-[0.34em]" />
            </div>
            {copilotNotice ? <InlineNotice tone={copilotNotice.tone}>{copilotNotice.message}</InlineNotice> : null}
            <ActiveSection
              copilotInsights={copilotInsights}
              onCreateCopilotTask={createCopilotTaskSuggestion}
              onOpenCopilot={() => setCopilotOpen(true)}
              onPrepareCopilotMessage={prepareCopilotMessage}
            />
          </main>
        </div>
      </div>
      <MobileNav onOpenTelegram={() => setTelegramOpen(true)} />
      <RecordModal />
      {currentUser.role === "manager" ? (
        <TelegramConnectionModal onClose={() => setTelegramOpen(false)} open={telegramOpen} />
      ) : null}
      <MiraCopilotPanel
        insights={copilotInsights}
        isRunning={copilotRunning}
        onClose={() => setCopilotOpen(false)}
        onCreateTask={createCopilotTaskSuggestion}
        onOpenOperations={() => {
          setActiveSection("calendar");
          setCopilotOpen(false);
        }}
        onPrepareMessage={prepareCopilotMessage}
        onRun={runCopilot}
        open={copilotOpen}
      />
    </div>
  );
}
