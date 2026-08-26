"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ActivitySquare,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CloudSun,
  Edit3,
  Leaf,
  MapPin,
  Package,
  Plus,
  Ruler,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sprout,
  Thermometer,
  Users,
  WalletCards
} from "lucide-react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";
import { RouteSync } from "@/components/layout/RouteSync";
import { RouteAccessDenied } from "@/components/access/RouteAccessDenied";
import { MiraCopilotPanel } from "@/components/copilot/MiraCopilot";
import { MiraBrand, MiraWordmark } from "@/components/brand/MiraBrand";
import { CropDdtPanel } from "@/components/crop/CropDdtPanel";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { GreenhouseCard } from "@/components/dashboard/GreenhouseCard";
import { CostChart, YieldChart } from "@/components/dashboard/Charts";
import { MonitoringSection } from "@/components/monitoring/MonitoringSection";
import { TodayDecisionBoard } from "@/components/overview/TodayDecisionBoard";
import { TelegramConnectionModal } from "@/components/integrations/TelegramConnectionModal";
import { OperationsSection } from "@/components/operations/OperationsSection";
import { InventorySection } from "@/components/inventory/InventorySection";
import { NurserySection } from "@/components/nursery/NurserySection";
import { DatePickerInput } from "@/components/forms/DateTimeInputs";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageTitle } from "@/components/ui/PageTitle";
import { RiskBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { RecordModal } from "@/components/forms/RecordModal";
import { Field, SelectInput, TextArea, TextInput } from "@/components/forms/FormControls";
import { navigationItemsForRole } from "@/data/navigation";
import { Modal } from "@/components/ui/Modal";
import { cropLabelForId, getCropDdtStatus, greenhouseDisplayName } from "@/lib/crop-ddt";
import { addDays, startOfIsoWeek } from "@/lib/date";
import { appRoute, currentCycleRoute, greenhouseRoute, harvestLotRoute, organizationRouteSlug, parseAppRoute, pestCaseRoute, publicEntityId, type EntityRoute, type InventoryCostsView, type ListQueryState } from "@/lib/routes";
import { appErrorMessage } from "@/lib/errors";
import { costCategories } from "@/lib/cost-categories";
import { formatPricePerBox } from "@/lib/harvest";
import { requireWorkSchema } from "@/lib/work-schema";
import {
  buildCopilotPulse,
  localDateKey,
  managerMessageForInsight,
  type CopilotChatMessage,
  type CopilotInsight,
  type CopilotSuggestedAction
} from "@/lib/mira-copilot";
import { useGreenhouseStore } from "@/lib/store";
import { loadWorkspaceViewData, requiresWorkspaceViewData } from "@/lib/view-data";
import { cacheViewData, getCachedViewData, invalidateViewDataCache } from "@/lib/view-data-cache";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createPrivateCompanyFileUrl, uploadCompanyAsset, uploadPrivateCompanyFile } from "@/lib/storage";
import { cn, formatCurrency, formatDate, formatNumber, formatPersonName, parseNumericInput } from "@/lib/utils";
import type {
  CostRecord,
  CropCatalogItem,
  Greenhouse,
  HarvestRecord,
  PestAlert,
  PestActionType,
  PestCaseStatus,
  PestUpdateStatus,
  RiskLevel,
  SectionId,
  Task
} from "@/types";

type ViewDataRefreshState = {
  isUpdating: boolean;
  refresh: () => void;
};

const ViewDataRefreshContext = createContext<ViewDataRefreshState>({
  isUpdating: false,
  refresh: () => {}
});

// Keep the implementation available while the product experience is refined.
const miraCopilotEnabled = false;

function useViewDataRefresh() {
  return useContext(ViewDataRefreshContext).refresh;
}

function useViewDataRefreshState() {
  return useContext(ViewDataRefreshContext);
}

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
          <PageTitle>
            {title}
          </PageTitle>
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

function productiveAreaIssues(greenhouse: Greenhouse) {
  const issues: string[] = [];
  const hasManager = Boolean(greenhouse.managerUserId || greenhouse.managerStaffId)
    || Boolean(greenhouse.manager && !greenhouse.manager.toLocaleLowerCase().startsWith("sin "));
  if (greenhouse.budgetAmount === null) issues.push("Presupuesto pendiente");
  if (!hasManager) issues.push("Responsable pendiente");
  if (!greenhouse.surfaceM2 || greenhouse.plants <= 0 || !greenhouse.transplantDate) {
    issues.push("Datos productivos incompletos");
  }
  return issues;
}

function ProductiveAreaDetail({
  active,
  canManage,
  crops,
  issues,
  lastTask,
  mobile = false,
  onEdit,
  organizationName,
}: {
  active: Greenhouse;
  canManage: boolean;
  crops: CropCatalogItem[];
  issues: string[];
  lastTask?: Task;
  mobile?: boolean;
  onEdit: () => void;
  organizationName: string;
}) {
  const cropStages = useGreenhouseStore((state) => state.cropStages);
  const [showAgronomicDetail, setShowAgronomicDetail] = useState(false);
  const panelRootRef = useRef<HTMLDivElement>(null);
  const agronomicTriggerRef = useRef<HTMLButtonElement>(null);
  const backToAreaRef = useRef<HTMLButtonElement>(null);
  const hasChangedDetailView = useRef(false);
  const ddtStatus = getCropDdtStatus(
    active.cropId,
    active.transplantDate,
    active.daysSinceTransplant,
    cropStages
  );
  const detailItems = [
    {
      label: "Presupuesto",
      value: active.budgetAmount === null ? "Pendiente" : formatCurrency(active.budgetAmount)
    },
    {
      label: "Capacidad",
      value: `${formatNumber(active.plants)} plantas · ${formatNumber(active.beds)} camas`
    },
    {
      label: "Superficie",
      value: active.surfaceM2 ? `${formatNumber(active.surfaceM2)} m²` : active.surface || "Pendiente"
    },
    {
      label: "Responsable",
      value: active.manager || "Pendiente"
    }
  ];
  const ddtValue = ddtStatus.status === "missing-catalog"
    ? "Sin catálogo"
    : ddtStatus.status === "missing-date"
      ? "Sin trasplante"
      : `${formatNumber(ddtStatus.ddt)} DDT`;
  const changeDetailView = (showAgronomic: boolean) => {
    const scrollContainer = panelRootRef.current?.closest<HTMLElement>("[data-productive-area-scroll], [data-modal-scroll]");
    if (scrollContainer) scrollContainer.scrollTop = 0;
    setShowAgronomicDetail(showAgronomic);
  };

  useEffect(() => {
    if (!hasChangedDetailView.current) {
      hasChangedDetailView.current = true;
      return;
    }
    window.requestAnimationFrame(() => {
      if (showAgronomicDetail) {
        backToAreaRef.current?.focus();
      } else {
        agronomicTriggerRef.current?.focus();
      }
    });
  }, [showAgronomicDetail]);

  if (showAgronomicDetail) {
    return (
      <div className="productive-area-subview-enter" ref={panelRootRef}>
        <div
          className={cn(
            "sticky top-0 z-10 border-b border-app-border bg-app-background pb-4",
            mobile ? "-mx-4 -mt-5 px-4 pt-4" : "pt-1"
          )}
        >
          <button
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-app-green underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
            onClick={() => changeDetailView(false)}
            ref={backToAreaRef}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Volver al área
          </button>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Detalle agronómico</p>
          <h3 className="mt-2 text-2xl font-light tracking-normal text-app-text">{active.name}</h3>
          <p className="mt-2 text-sm leading-6 text-app-muted">{ddtValue} · {ddtStatus.label}</p>
        </div>
        <CropDdtPanel className="border-t-0 pb-8 pt-5" greenhouse={active} />
      </div>
    );
  }

  return (
    <div className="productive-area-detail-enter" ref={panelRootRef}>
      <div
        className={cn(
          "sticky top-0 z-10 border-b border-app-border bg-app-background pb-5",
          mobile ? "-mx-4 -mt-5 px-4 pt-4" : "pt-1"
        )}
      >
        {!mobile ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Área seleccionada</p>
            <h3 className="mt-3 text-3xl font-light tracking-normal text-app-text">{active.name}</h3>
          </>
        ) : null}
        <p className={cn("text-sm leading-6 text-app-muted", !mobile && "mt-2")}>
          {cropLabelForId(active.cropId, crops)} · {active.variety || "Sin variedad"} · {active.stage}
        </p>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-app-green bg-app-green px-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#244B37] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
            href={appRoute(organizationName, { section: "calendar", greenhouseId: active.id })}
          >
            Abrir operación
          </Link>
          {canManage ? (
            <Button
              className="whitespace-nowrap"
              icon={<Edit3 aria-hidden="true" className="h-4 w-4" />}
              onClick={onEdit}
              variant="secondary"
            >
              Editar área
            </Button>
          ) : null}
        </div>
        <Link
          className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-app-green underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
          href={greenhouseRoute(organizationName, active.publicId ?? publicEntityId("gh", active.id))}
        >
          Ver ficha del área
        </Link>
      </div>

      <dl className="grid grid-cols-2 pt-5">
        {detailItems.map((item) => (
          <div className="border-b border-app-border py-4 pr-3 odd:border-r odd:pr-4 even:pl-4" key={item.label}>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">{item.label}</dt>
            <dd className="mt-2 text-sm leading-5 text-app-text">{item.value}</dd>
          </div>
        ))}
      </dl>

      {issues.length ? (
        <div className="mt-5 border-l-2 border-[#D7C58F] bg-[#FFF8E6] px-4 py-3 text-[#725A1A]">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            Requiere atención
          </p>
          <ul className="mt-2 grid gap-1 pl-6 text-xs leading-5">
            {issues.map((issue) => <li className="list-disc" key={issue}>{issue}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="border-b border-app-border py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">Actividad más reciente</p>
        <p className="mt-2 text-sm text-app-text">{lastTask?.title ?? "Sin actividad registrada"}</p>
        {lastTask ? (
          <p className="mt-1 text-xs text-app-muted">{formatDate(lastTask.date)} · {lastTask.status}</p>
        ) : null}
      </div>

      <button
        aria-label={`Abrir detalle agronómico de ${active.name}`}
        className="flex min-h-16 w-full items-center justify-between gap-4 border-b border-app-border py-4 text-left transition-colors duration-150 hover:text-app-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-green"
        onClick={() => changeDetailView(true)}
        ref={agronomicTriggerRef}
        type="button"
      >
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">Detalle agronómico</span>
            <span className="mt-1 block text-sm text-app-text">{ddtValue} · {ddtStatus.label}</span>
          </span>
        <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-app-green" />
      </button>
    </div>
  );
}

function useFilteredData() {
  const state = useGreenhouseStore();
  const isAllGreenhouses = state.selectedGreenhouseId === "__all__";
  const greenhouse = isAllGreenhouses
    ? undefined
    : state.greenhouses.find((item) => item.id === state.selectedGreenhouseId) ?? state.greenhouses[0];
  const periodApplies = ["records", "pests", "inventory", "costs"].includes(state.activeSection);
  const today = new Date();
  const weekStart = dateKey(startOfIsoWeek(today));
  const weekEnd = dateKey(addDays(startOfIsoWeek(today), 6));
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const isInPeriod = (date: string) => {
    if (!periodApplies || state.selectedPeriod === "all") return true;
    if (state.selectedPeriod === "week") return date >= weekStart && date <= weekEnd;
    return date.startsWith(monthPrefix);
  };
  const filter = <T extends { greenhouseId: string }>(items: T[], dateFor?: (item: T) => string) =>
    items.filter((item) =>
      (isAllGreenhouses || (greenhouse ? item.greenhouseId === greenhouse.id : false))
      && (!dateFor || isInPeriod(dateFor(item)))
    );

  return {
    ...state,
    greenhouse,
    greenhouseTasks: filter(state.tasks, (item) => item.date),
    greenhouseIrrigation: filter(state.irrigationRecords, (item) => item.date),
    greenhouseNutrition: filter(state.nutritionRecords, (item) => item.date),
    greenhouseApplications: filter(state.applicationRecords, (item) => item.date),
    greenhousePests: filter(state.pestAlerts, (item) => item.detectedAt),
    greenhouseHarvest: filter(state.harvestRecords, (item) => item.date),
    greenhouseCosts: filter(state.costRecords, (item) => item.date),
    greenhouseActivities: filter(state.activities)
  };
}

function useListNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const organization = useGreenhouseStore((state) => state.organization);
  const route = useMemo(() => parseAppRoute(pathname, new URLSearchParams(searchParams.toString())), [pathname, searchParams]);
  const updateList = useCallback((patch: Partial<ListQueryState>) => {
    router.push(appRoute(organization.slug ?? organization.name, {
      section: route.section,
      greenhouseId: route.greenhouseId,
      period: route.period,
      weekStart: route.weekStart,
      operationView: route.operationView,
      inventoryView: route.inventoryView,
      list: { ...route.list, ...patch }
    }));
  }, [organization.name, organization.slug, route, router]);
  return { list: route.list ?? {}, updateList };
}

function ListToolbar({ children, query, onSearch }: { children?: React.ReactNode; query?: string; onSearch: (query: string) => void }) {
  const [value, setValue] = useState(query ?? "");
  useEffect(() => setValue(query ?? ""), [query]);
  return (
    <div className="mb-5 flex flex-col gap-3 border-y border-app-border py-3 sm:flex-row sm:items-center">
      <form
        className="flex min-w-0 flex-1 items-center gap-2"
        onSubmit={(event) => { event.preventDefault(); onSearch(value.trim()); }}
      >
        <Search className="h-4 w-4 shrink-0 text-app-muted" />
        <TextInput aria-label="Buscar en la vista" className="h-10" onChange={(event) => setValue(event.target.value)} placeholder="Buscar en esta vista" value={value} />
        <Button className="h-10" type="submit" variant="secondary">Buscar</Button>
        {query ? <Button className="h-10" onClick={() => { setValue(""); onSearch(""); }} type="button" variant="ghost">Limpiar</Button> : null}
      </form>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

function ListPagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > pages) onPageChange(pages);
  }, [onPageChange, page, pages]);
  return (
    <div className="mt-5 flex flex-col gap-3 border-y border-app-border py-3 text-xs text-app-muted sm:flex-row sm:items-center sm:justify-between">
      <p>{total === 0 ? "0 registros" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}`}</p>
      <div className="flex items-center gap-2">
        <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} variant="secondary">Anterior</Button>
        <span>Página {page} de {pages}</span>
        <Button disabled={page >= pages} onClick={() => onPageChange(page + 1)} variant="secondary">Siguiente</Button>
      </div>
    </div>
  );
}

function dateLabel(date: string) {
  return formatDate(date).replace(".", "");
}

async function completeTaskRecord(taskId: string, completeTask: (id: string, status?: Task["status"]) => void, updateNote?: string | null) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("missing_supabase_client");
  }

  await requireWorkSchema(supabase);

  const { data, error: workRpcError } = await supabase.rpc("complete_work", {
    target_work_id: taskId,
    target_payload: {
      occurredAt: new Date().toISOString(),
      note: updateNote || null
    }
  });

  if (workRpcError) throw workRpcError;
  completeTask(taskId, data?.status === "verificada" ? "Verificada" : "Completada");
}

function isTechnicalCompletionTask(task: Task) {
  return ["Riego", "Fertirriego", "Fertilización", "Aplicación foliar", "Cosecha"].includes(task.type);
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
  operationRefreshKey?: number;
  operationWeekStart?: string;
  operationView?: "calendar" | "plan" | "execution" | "verification" | "history";
  inventoryView?: InventoryCostsView;
  onOperationWeekChange?: (weekStart: string) => void;
  onOperationViewChange?: (view: "calendar" | "plan" | "execution" | "verification" | "history") => void;
  pendingCompletionTask?: { id: string; date: string } | null;
  onPendingCompletionConsumed?: () => void;
  pendingOpenWork?: { id: string; intent: "details" | "evidence" } | null;
  onPendingOpenWorkConsumed?: () => void;
  onOpenWork?: (
    taskId: string,
    view: "calendar" | "execution" | "verification",
    intent: "details" | "evidence"
  ) => void;
  onRequestTechnicalCompletion?: (task: Task) => void;
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const riskLevelToDb: Record<RiskLevel, string> = {
  Baja: "baja",
  Media: "media",
  Alta: "alta"
};

const pestCaseStatusToDb: Record<PestCaseStatus, string> = {
  Abierta: "open",
  "Revisión requerida": "review_required",
  "En manejo": "in_management",
  "Bajo vigilancia": "under_watch",
  "Cierre sanitario": "sanitary_close"
};

const pestUpdateStatusToDb: Record<PestUpdateStatus, string> = {
  "Revisión requerida": "review_required",
  "En observación": "under_observation",
  "Tratamiento aplicado": "treatment_applied",
  "Bajo vigilancia": "under_watch",
  "Sin avance": "no_progress",
  "Mejoría visible": "visible_improvement",
  "Cierre sanitario": "sanitary_close"
};

const pestActionTypeToDb: Record<PestActionType, string> = {
  Revisión: "review",
  "Poda/deshoje sanitario": "sanitary_pruning",
  Aplicación: "application",
  Limpieza: "cleaning",
  "Aislamiento de zona": "zone_isolation",
  Otro: "other"
};

const pestCaseStatuses = Object.keys(pestCaseStatusToDb) as PestCaseStatus[];
const pestUpdateStatuses = Object.keys(pestUpdateStatusToDb) as PestUpdateStatus[];
const pestActionTypes = Object.keys(pestActionTypeToDb) as PestActionType[];

function OverviewSection({
  onOpenWork,
  onRequestTechnicalCompletion
}: CopilotSurfaceProps) {
  const {
    greenhouse,
    greenhouseTasks,
    greenhouseIrrigation,
    greenhouseApplications,
    greenhousePests,
    greenhouses,
    organization,
    currentUser,
    completeTask,
    openModal,
    setActiveSection
  } = useFilteredData();
  const [taskNotice, setTaskNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [simpleCompletionTask, setSimpleCompletionTask] = useState<Task | null>(null);
  const hasIncompleteProductiveData = greenhouse
    ? !greenhouse.transplantDate
      || !greenhouse.surfaceM2
      || greenhouse.budgetAmount === null
      || greenhouse.plants <= 0
      || greenhouse.stemCount === null
      || greenhouse.isGrafted === null
      || greenhouse.beds <= 0
    : false;

  if (!greenhouse) {
    return (
      <EmptyState
        icon={Sprout}
        title="No tienes un área productiva asignada. Pide a un owner o admin que te asigne como encargado."
      />
    );
  }

  const handleCompleteTask = async (taskId: string) => {
    const task = greenhouseTasks.find((item) => item.id === taskId);
    if (!task) return;
    if (task.status === "Pendiente") {
      setActiveSection("calendar");
      setTaskNotice({ tone: "green", message: "Inicia la actividad desde Operación antes de completarla." });
      return;
    }
    if (isTechnicalCompletionTask(task)) {
      onRequestTechnicalCompletion?.(task);
      return;
    }
    setSimpleCompletionTask(task);
  };

  const handleSimpleCompletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!simpleCompletionTask) return;
    const form = new FormData(event.currentTarget);
    const occurredAt = String(form.get("occurredAt") ?? localDateKey());
    const note = String(form.get("note") ?? "").trim();
    const updateNote = [
      occurredAt !== simpleCompletionTask.date ? `Fecha real: ${formatDate(occurredAt)}` : "",
      note
    ].filter(Boolean).join("\n");

    setTaskNotice(null);
    setSavingTaskId(simpleCompletionTask.id);
    try {
      await completeTaskRecord(simpleCompletionTask.id, completeTask, updateNote);
      setTaskNotice({ tone: "green", message: "Actividad marcada como completada." });
      setSimpleCompletionTask(null);
    } catch (caught) {
      setTaskNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo completar la actividad.") });
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleVerifyTask = async (taskId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || savingTaskId) return;

    setTaskNotice(null);
    setSavingTaskId(taskId);
    try {
      await requireWorkSchema(supabase);
      const { error } = await supabase.rpc("verify_work", {
        target_work_id: taskId,
        target_note: null
      });
      if (error) throw error;

      completeTask(taskId, "Verificada");
      setTaskNotice({ tone: "green", message: "Actividad verificada. La decisión quedó resuelta." });
    } catch (caught) {
      setTaskNotice({ tone: "red", message: appErrorMessage(caught, "No se pudo verificar la actividad.") });
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <>
      {taskNotice ? <InlineNotice tone={taskNotice.tone}>{taskNotice.message}</InlineNotice> : null}
      {hasIncompleteProductiveData && (currentUser.role === "owner" || currentUser.role === "admin") ? (
        <aside className="mb-6 grid gap-4 border-l-2 border-app-green bg-app-sidebar px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <p className="text-sm font-semibold text-app-text">Completa los datos productivos de tu área</p>
            <p className="mt-1 text-sm leading-6 text-app-muted">
              Agrega trasplante, superficie, presupuesto y capacidad cuando los tengas disponibles.
            </p>
          </div>
          <Button
            icon={<Edit3 aria-hidden="true" className="h-4 w-4" />}
            onClick={() => openModal("editGreenhouse")}
            variant="secondary"
          >
            Completar datos
          </Button>
        </aside>
      ) : null}
      <TodayDecisionBoard
        alerts={greenhousePests}
        busyTaskId={savingTaskId}
        currentUser={currentUser}
        greenhouse={greenhouse}
        greenhouses={greenhouses}
        lastApplication={[...greenhouseApplications].sort((left, right) => right.date.localeCompare(left.date))[0]}
        lastIrrigation={[...greenhouseIrrigation].sort((left, right) => right.date.localeCompare(left.date))[0]}
        onCompleteTask={(taskId) => {
          if (!savingTaskId) {
            handleCompleteTask(taskId);
          }
        }}
        onOpenGreenhouse={() => setActiveSection("greenhouses")}
        onOpenMonitoring={() => setActiveSection("monitoring")}
        onOpenOperations={() => setActiveSection("calendar")}
        onOpenPests={() => setActiveSection("pests")}
        onOpenWork={(taskId, view, intent) => onOpenWork?.(taskId, view, intent)}
        onVerifyTask={handleVerifyTask}
        organization={organization}
        tasks={greenhouseTasks}
      />
      <Modal
        onClose={() => setSimpleCompletionTask(null)}
        open={Boolean(simpleCompletionTask)}
        panelClassName="sm:max-w-xl"
        title="Confirmar actividad"
      >
        <form className="grid gap-5" onSubmit={handleSimpleCompletion}>
          <div className="border-l-2 border-app-green pl-3">
            <p className="text-sm font-medium text-app-text">{simpleCompletionTask?.type} · {simpleCompletionTask?.title}</p>
            <p className="mt-1 text-xs leading-5 text-app-muted">Al completar quedará pendiente de verificación por otro supervisor.</p>
          </div>
          <Field label="Fecha real">
            <DatePickerInput name="occurredAt" required defaultValue={simpleCompletionTask?.date ?? localDateKey()} />
          </Field>
          <Field label="Explicación de la ejecución">
            <TextArea name="note" placeholder="Describe qué se realizó y cualquier resultado relevante." required />
          </Field>
          <div className="flex flex-col-reverse gap-2 border-t border-app-border pt-5 sm:flex-row sm:justify-end">
            <Button disabled={Boolean(savingTaskId)} onClick={() => setSimpleCompletionTask(null)} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={Boolean(savingTaskId)} type="submit" variant="primary">
              {savingTaskId ? "Guardando..." : "Completar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function GreenhousesSection() {
  const { crops, currentUser, greenhouses, openModal, organization, selectedGreenhouseId, setSelectedGreenhouseId, tasks } = useGreenhouseStore();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const active = greenhouses.find((greenhouse) => greenhouse.id === selectedGreenhouseId) ?? greenhouses[0];
  const canManageGreenhouses = currentUser.role === "owner" || currentUser.role === "admin";
  const totalSurfaceM2 = greenhouses.reduce((total, greenhouse) => total + (greenhouse.surfaceM2 ?? 0), 0);
  const cropCount = new Set(greenhouses.map((greenhouse) => greenhouse.cropId).filter(Boolean)).size;
  const areasWithIssues = greenhouses.filter((greenhouse) => productiveAreaIssues(greenhouse).length > 0).length;
  const activeIssues = active ? productiveAreaIssues(active) : [];
  const lastTask = active
    ? tasks
      .filter((task) => task.greenhouseId === active.id && task.date <= localDateKey())
      .sort((left, right) => right.date.localeCompare(left.date))[0]
    : undefined;
  const organizationName = organization.slug ?? organization.name;
  const summary = [
    { label: "Áreas registradas", value: formatNumber(greenhouses.length) },
    { label: "Superficie total", value: totalSurfaceM2 ? `${formatNumber(totalSurfaceM2)} m²` : "--" },
    { label: "Cultivos", value: formatNumber(cropCount) },
    { label: "Requieren atención", value: formatNumber(areasWithIssues), attention: areasWithIssues > 0 }
  ];
  const selectArea = (greenhouseId: string) => {
    setSelectedGreenhouseId(greenhouseId);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      setMobileDetailOpen(true);
    }
  };
  const editArea = (greenhouseId: string) => {
    setSelectedGreenhouseId(greenhouseId);
    openModal("editGreenhouse");
  };

  return (
    <section>
      <SectionHeader
        action={canManageGreenhouses ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => openModal("greenhouse")} variant="secondary">Nueva área</Button> : undefined}
        title="Áreas productivas"
        description="Inventario de áreas, cultivos, variedades, responsables y estado productivo."
      />
      <dl className="mb-8 grid grid-cols-2 border-y border-app-border md:grid-cols-4">
        {summary.map((item, index) => (
          <div
            className={cn(
              "py-4",
              index % 2 === 0 ? "pr-4" : "border-l border-app-border pl-4",
              index > 1 && "border-t border-app-border md:border-t-0",
              index > 0 && "md:border-l md:border-app-border md:pl-5",
              index === 0 && "md:border-l-0 md:pl-0"
            )}
            key={item.label}
          >
            <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">{item.label}</dt>
            <dd className={cn("mt-2 text-2xl font-light text-app-text", item.attention && "text-[#725A1A]")}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div>
          <div className="grid gap-3">
            {greenhouses.map((greenhouse) => (
              <GreenhouseCard
                greenhouse={greenhouse}
                issues={productiveAreaIssues(greenhouse)}
                key={greenhouse.id}
                onSelect={() => selectArea(greenhouse.id)}
                selected={greenhouse.id === active?.id}
              />
            ))}
          </div>
        </div>
        {active ? (
          <div className="hidden xl:block">
            <div
              className="sticky top-24 h-[calc(100dvh-7rem)] overflow-y-auto pr-2"
              data-productive-area-scroll
              key={active.id}
            >
              <EditorialRail title="Detalle del área">
                <ProductiveAreaDetail
                  active={active}
                  canManage={canManageGreenhouses}
                  crops={crops}
                  issues={activeIssues}
                  lastTask={lastTask}
                  onEdit={() => editArea(active.id)}
                  organizationName={organizationName}
                />
              </EditorialRail>
            </div>
          </div>
        ) : null}
      </div>
      {active ? (
        <div className="xl:hidden">
          <Modal
            bodyClassName="pt-5"
            onClose={() => setMobileDetailOpen(false)}
            open={mobileDetailOpen}
            panelClassName="sm:max-w-xl"
            title={active.name}
          >
            <ProductiveAreaDetail
              active={active}
              canManage={canManageGreenhouses}
              crops={crops}
              issues={activeIssues}
              lastTask={lastTask}
              mobile
              onEdit={() => {
                setMobileDetailOpen(false);
                editArea(active.id);
              }}
              organizationName={organizationName}
            />
          </Modal>
        </div>
      ) : null}
    </section>
  );
}

function EntityNotFound({ section, label }: { section: SectionId; label: string }) {
  const organization = useGreenhouseStore((state) => state.organization);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);

  return (
    <section>
      <SectionHeader
        title="No encontrado"
        description={`No encontramos ${label} o no tienes acceso a este recurso.`}
      />
      <Link
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
        href={appRoute(organization.slug ?? organization.name, { section, greenhouseId: selectedGreenhouseId, period: selectedPeriod })}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al módulo
      </Link>
    </section>
  );
}

function ActiveOrganizationRouteAccessDenied() {
  const organization = useGreenhouseStore((state) => state.organization);

  return <RouteAccessDenied returnHref={appRoute(organization.slug ?? organization.name, { section: "overview" })} />;
}

function EntityRouteView({ route }: { route: EntityRoute }) {
  const organization = useGreenhouseStore((state) => state.organization);
  const crops = useGreenhouseStore((state) => state.crops);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const pestAlerts = useGreenhouseStore((state) => state.pestAlerts);
  const harvestRecords = useGreenhouseStore((state) => state.harvestRecords);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const openHarvestEditor = useGreenhouseStore((state) => state.openHarvestEditor);
  const openHarvestSaleEditor = useGreenhouseStore((state) => state.openHarvestSaleEditor);
  const organizationRouteName = organization.slug ?? organization.name;

  if (route.type === "greenhouse" || route.type === "cycle") {
    const greenhouse = greenhouses.find((item) => (item.publicId ?? publicEntityId("gh", item.id)) === route.greenhousePublicId);
    if (!greenhouse) return <EntityNotFound label="este invernadero" section="greenhouses" />;

    if (route.type === "cycle") {
      return (
        <section>
          <SectionHeader
            action={(
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
                href={greenhouseRoute(organizationRouteName, greenhouse.publicId ?? publicEntityId("gh", greenhouse.id))}
              >
                <ArrowLeft className="h-4 w-4" />
                Invernadero
              </Link>
            )}
            title={`Ciclo actual · ${greenhouse.name}`}
            description="Contexto productivo actual del invernadero, disponible mediante un enlace directo y compartible."
          />
          <div className="grid gap-3 md:grid-cols-3">
            <EditorialObject index="01" label="Cultivo" value={cropLabelForId(greenhouse.cropId, crops)} detail={greenhouse.variety || "Variedad sin configurar"} icon={Sprout} />
            <EditorialObject index="02" label="Etapa actual" value={greenhouse.stage} detail={greenhouse.transplantDate ? `Trasplante: ${formatDate(greenhouse.transplantDate)}` : "Trasplante sin registrar"} icon={Leaf} />
            <EditorialObject index="03" label="Días del ciclo" value={formatNumber(greenhouse.daysSinceTransplant)} detail={`${formatNumber(greenhouse.plants)} plantas`} icon={CalendarDays} />
          </div>
          <div className="mt-8 max-w-xl"><CropDdtPanel greenhouse={greenhouse} /></div>
        </section>
      );
    }

    return (
      <section>
        <SectionHeader
          action={(
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
              href={currentCycleRoute(organizationRouteName, greenhouse.publicId ?? publicEntityId("gh", greenhouse.id))}
            >
              <CalendarDays className="h-4 w-4" />
              Ver ciclo actual
            </Link>
          )}
          title={greenhouseDisplayName(greenhouse, crops)}
          description="Ficha compartible del área productiva, su cultivo, responsable y estado actual."
        />
        <div className="grid gap-3 md:grid-cols-3">
          <EditorialObject index="01" label="Ubicación" value={greenhouse.location || "Sin ubicación"} detail={greenhouse.surface} icon={MapPin} />
          <EditorialObject index="02" label="Responsable" value={greenhouse.manager} detail={`${formatNumber(greenhouse.beds)} camas`} icon={Users} />
          <EditorialObject index="03" label="Estado sanitario" value={greenhouse.healthStatus} detail={`${formatNumber(greenhouse.plants)} plantas`} icon={ShieldCheck} />
        </div>
        <div className="mt-8 max-w-xl"><CropDdtPanel greenhouse={greenhouse} /></div>
      </section>
    );
  }

  if (route.type === "pestCase") {
    const alert = pestAlerts.find((item) => (item.publicId ?? publicEntityId("pest", item.id)) === route.pestPublicId);
    if (!alert) return <EntityNotFound label="este caso sanitario" section="pests" />;
    const greenhouse = greenhouses.find((item) => item.id === alert.greenhouseId);

    return (
      <section>
        <SectionHeader
          action={(
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
              href={appRoute(organizationRouteName, { section: "pests", greenhouseId: alert.greenhouseId, period: "all" })}
            >
              <ArrowLeft className="h-4 w-4" />
              Casos sanitarios
            </Link>
          )}
          title={alert.problem}
          description={`Expediente sanitario detectado el ${formatDate(alert.detectedAt)}${greenhouse ? ` en ${greenhouse.name}` : ""}.`}
        />
        <div className="mb-6 flex flex-wrap gap-2">
          <StatusBadge tone={alert.caseStatus === "Cierre sanitario" ? "green" : "neutral"}>{alert.caseStatus ?? "Abierta"}</StatusBadge>
          <RiskBadge level={alert.severity} />
          {alert.zone ? <StatusBadge tone="neutral">{alert.zone}</StatusBadge> : null}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border border-app-border bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Acción tomada</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-app-text">{alert.action || "Sin acción registrada"}</p>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Seguimiento</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-app-text">{alert.followUp || "Sin seguimiento registrado"}</p>
          </div>
          <EditorialRail title="Historial">
            {(alert.updates ?? []).length ? (alert.updates ?? []).map((update, index) => (
              <EditorialObject key={update.id} index={String(index + 1).padStart(2, "0")} label={update.status} value={update.actionType} detail={update.nextReviewDate ? `Próxima revisión: ${formatDate(update.nextReviewDate)}` : update.notes || "Sin notas"} icon={ActivitySquare} />
            )) : <p className="text-sm text-app-muted">Aún no hay seguimientos.</p>}
          </EditorialRail>
        </div>
      </section>
    );
  }

  const harvest = harvestRecords.find((item) => (item.publicId ?? publicEntityId("lot", item.id)) === route.lotPublicId);
  if (!harvest) return <EntityNotFound label="este lote de cosecha" section="harvest" />;
  const greenhouse = greenhouses.find((item) => item.id === harvest.greenhouseId);

  return (
    <section>
      <SectionHeader
        action={(
          <div className="flex flex-col gap-2 sm:flex-row">
            {currentUser.role !== "manager" ? (
              <>
                <Button icon={<WalletCards aria-hidden="true" className="h-4 w-4" />} onClick={() => openHarvestSaleEditor(harvest.id)} variant="primary">
                  {harvest.sale ? "Editar venta" : "Registrar venta"}
                </Button>
                <Button icon={<Edit3 aria-hidden="true" className="h-4 w-4" />} onClick={() => openHarvestEditor(harvest.id)} variant="secondary">
                  Corregir cosecha
                </Button>
              </>
            ) : null}
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
              href={appRoute(organizationRouteName, { section: "harvest", greenhouseId: harvest.greenhouseId })}
            >
              <ArrowLeft className="h-4 w-4" />
              Cosecha
            </Link>
          </div>
        )}
        title={`Lote de cosecha · ${formatDate(harvest.date)}`}
        description={`${greenhouse ? greenhouseDisplayName(greenhouse, crops) : "Área productiva"} · ${harvest.destination || "Destino sin registrar"}`}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <EditorialObject index="01" label="Cajas" value={formatNumber(harvest.boxCount)} detail={`${formatNumber(harvest.boxWeightKg)} kg por caja`} icon={Package} />
        <EditorialObject index="02" label="Volumen" value={`${formatNumber(harvest.kilograms)} kg`} detail={`${formatNumber(harvest.merma)} kg de merma`} icon={Leaf} />
        <EditorialObject index="03" label="Precio promedio por caja" value={formatPricePerBox(harvest.estimatedPrice)} detail={harvest.destination || "Destino sin registrar"} icon={WalletCards} />
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-4">
        <EditorialObject index="A" label="Primera" value={`${formatNumber(harvest.firstQuality)} kg`} detail={`${formatNumber(harvest.firstQualityBoxes)} cajas`} icon={CheckCircle2} />
        <EditorialObject index="B" label="Segunda" value={`${formatNumber(harvest.secondQuality)} kg`} detail={`${formatNumber(harvest.secondQualityBoxes)} cajas`} icon={CheckCircle2} />
        <EditorialObject index="C" label="Tercera" value={`${formatNumber(harvest.thirdQuality)} kg`} detail={`${formatNumber(harvest.thirdQualityBoxes)} cajas`} icon={CheckCircle2} />
        <EditorialObject index="D" label="Venta neta" value={formatCurrency(harvest.netRevenue ?? harvest.grossRevenue ?? 0)} detail={`${formatNumber(harvest.soldBoxes ?? 0)} cajas vendidas${(harvest.specialBoxes ?? 0) ? ` · ${formatNumber(harvest.specialBoxes ?? 0)} especiales` : ""}${(harvest.unsoldBoxes ?? 0) ? ` · ${formatNumber(harvest.unsoldBoxes ?? 0)} pendientes` : ""}`} icon={WalletCards} />
      </div>
      {harvest.sale ? (
        <section aria-labelledby="sale-breakdown-title" className="mt-6 border border-app-border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted" id="sale-breakdown-title">Desglose de venta</p>
              <p className="mt-2 text-sm text-app-text">{harvest.sale.buyerName} · {formatDate(harvest.sale.date)}</p>
            </div>
            <StatusBadge tone={harvest.sale.paymentStatus === "Pagada" ? "green" : "neutral"}>{harvest.sale.paymentStatus}</StatusBadge>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Venta bruta", harvest.grossRevenue ?? 0],
              ["Comisión", harvest.commissionAmount ?? 0],
              ["Flete", harvest.freightAmount ?? 0],
              ["Caja de cartón", harvest.packagingAmount ?? 0],
              ["Venta neta", harvest.netRevenue ?? 0]
            ].map(([label, value]) => (
              <div key={String(label)}><dt className="text-xs text-app-muted">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-app-text">{formatCurrency(Number(value))}</dd></div>
            ))}
          </dl>
        </section>
      ) : null}
      {harvest.notes ? <p className="mt-6 border-l-2 border-app-green px-4 text-sm leading-6 text-app-text">{harvest.notes}</p> : null}
    </section>
  );
}

function PestsSection() {
  const {
    addPestUpdate,
    currentUser,
    greenhousePests,
    openModal,
    organization,
    updatePest,
    viewDataMeta
  } = useFilteredData();
  const { list, updateList } = useListNavigation();
  const [notice, setNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [editingAlert, setEditingAlert] = useState<PestAlert | null>(null);
  const [followingAlert, setFollowingAlert] = useState<PestAlert | null>(null);
  const [savingAlert, setSavingAlert] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const handleEditAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAlert) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice({ tone: "red", message: "No se pudo conectar con Supabase para actualizar la alerta." });
      return;
    }

    const form = new FormData(event.currentTarget);
    const updatedAlert: PestAlert = {
      ...editingAlert,
      problem: String(form.get("problem") ?? "").trim(),
      severity: String(form.get("severity") ?? "Baja") as RiskLevel,
      zone: String(form.get("zone") ?? "").trim(),
      detectedAt: String(form.get("detectedAt") ?? "").trim(),
      action: String(form.get("action") ?? "").trim(),
      followUp: String(form.get("followUp") ?? "").trim(),
      caseStatus: String(form.get("caseStatus") ?? "Abierta") as PestCaseStatus
    };

    setSavingAlert(true);
    setNotice(null);
    const { error } = await supabase
      .from("pest_alerts")
      .update({
        problem: updatedAlert.problem,
        severity: riskLevelToDb[updatedAlert.severity],
        affected_zone: updatedAlert.zone,
        detected_at: updatedAlert.detectedAt,
        action_taken: updatedAlert.action,
        follow_up: updatedAlert.followUp,
        case_status: pestCaseStatusToDb[updatedAlert.caseStatus ?? "Abierta"],
        is_resolved: updatedAlert.caseStatus === "Cierre sanitario"
      })
      .eq("id", editingAlert.id);

    setSavingAlert(false);

    if (error) {
      setNotice({ tone: "red", message: appErrorMessage(error, "No se pudo actualizar la alerta sanitaria.") });
      return;
    }

    updatePest(updatedAlert);
    setEditingAlert(null);
    setNotice({ tone: "green", message: "Alerta sanitaria actualizada." });
  };

  const handleAddFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!followingAlert) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNotice({ tone: "red", message: "No se pudo conectar con Supabase para guardar el seguimiento." });
      return;
    }

    const form = new FormData(event.currentTarget);
    const status = String(form.get("status") ?? "Revisión requerida") as PestUpdateStatus;
    const nextCaseStatus = String(form.get("caseStatus") ?? followingAlert.caseStatus ?? "Abierta") as PestCaseStatus;
    const severity = String(form.get("severity") ?? followingAlert.severity) as RiskLevel;
    const actionType = String(form.get("actionType") ?? "Revisión") as PestActionType;
    const notes = String(form.get("notes") ?? "").trim();
    const nextReviewDate = String(form.get("nextReviewDate") ?? "").trim();
    const photo = form.get("photo");
    let photoStoragePath: string | undefined;
    let photoUrl: string | undefined;

    setSavingFollowUp(true);
    setNotice(null);

    try {
      if (photo instanceof File && photo.size > 0) {
        photoStoragePath = await uploadPrivateCompanyFile({
          bucket: "pest-photos",
          companyId: organization.id,
          file: photo,
          supabase,
          type: "pest-followup"
        });
        photoUrl = await createPrivateCompanyFileUrl({
          bucket: "pest-photos",
          path: photoStoragePath,
          supabase
        });
      }

      const { data, error: insertError } = await supabase
        .from("pest_alert_updates")
        .insert({
          company_id: organization.id,
          pest_alert_id: followingAlert.id,
          greenhouse_id: followingAlert.greenhouseId,
          update_status: pestUpdateStatusToDb[status],
          severity: riskLevelToDb[severity],
          action_type: pestActionTypeToDb[actionType],
          notes,
          next_review_date: nextReviewDate || null,
          photo_storage_path: photoStoragePath ?? null,
          created_by: currentUser.id
        })
        .select("id, created_at")
        .single();
      if (insertError) throw insertError;

      const followUpText = [
        `Estado: ${status}`,
        nextReviewDate ? `Próxima revisión: ${nextReviewDate}` : "",
        notes
      ].filter(Boolean).join("\n");

      const { error: alertError } = await supabase
        .from("pest_alerts")
        .update({
          severity: riskLevelToDb[severity],
          follow_up: followUpText,
          case_status: pestCaseStatusToDb[nextCaseStatus],
          is_resolved: nextCaseStatus === "Cierre sanitario"
        })
        .eq("id", followingAlert.id);
      if (alertError) throw alertError;

      addPestUpdate(
        followingAlert.id,
        {
          id: data?.id,
          alertId: followingAlert.id,
          greenhouseId: followingAlert.greenhouseId,
          status,
          severity,
          actionType,
          notes,
          nextReviewDate: nextReviewDate || undefined,
          photoStoragePath,
          photoUrl,
          createdAt: data?.created_at ?? new Date().toISOString()
        },
        {
          severity,
          followUp: followUpText,
          caseStatus: nextCaseStatus
        }
      );

      setFollowingAlert(null);
      setNotice({ tone: "green", message: "Seguimiento sanitario agregado." });
    } catch (caught) {
      setNotice({
        tone: "red",
        message: appErrorMessage(caught, "No se pudo guardar el seguimiento. Confirma que ejecutaste el SQL 34.")
      });
    } finally {
      setSavingFollowUp(false);
    }
  };

  return (
    <section>
      <SectionHeader
        action={<Button icon={<AlertTriangle className="h-4 w-4" />} onClick={() => openModal("pest")} variant="secondary">Nueva alerta</Button>}
        title="Plagas y enfermedades"
        description="Monitoreo sanitario, incidencia, zonas afectadas, acciones tomadas, seguimiento y reaplicación."
      />
      {notice ? <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice> : null}
      <ListToolbar query={list.q} onSearch={(q) => updateList({ q: q || undefined, page: undefined })}>
        <SelectInput aria-label="Estado sanitario" className="h-10" value={list.status ?? ""} onChange={(event) => updateList({ status: event.target.value || undefined, page: undefined })}>
          <option value="">Todos los estados</option>
          <option value="open">Abierta</option>
          <option value="review_required">Revisión requerida</option>
          <option value="in_management">En manejo</option>
          <option value="under_watch">Bajo vigilancia</option>
          <option value="sanitary_close">Cierre sanitario</option>
        </SelectInput>
        <SelectInput aria-label="Incidencia sanitaria" className="h-10" value={list.severity ?? ""} onChange={(event) => updateList({ severity: event.target.value || undefined, page: undefined })}>
          <option value="">Todas las incidencias</option>
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </SelectInput>
        <SelectInput
          aria-label="Orden sanitario"
          className="h-10"
          value={`${list.sort ?? "date"}:${list.dir ?? "desc"}`}
          onChange={(event) => { const [sort, dir] = event.target.value.split(":"); updateList({ sort, dir: dir as "asc" | "desc", page: undefined }); }}
        >
          <option value="date:desc">Más recientes</option>
          <option value="date:asc">Más antiguos</option>
          <option value="problem:asc">Problema A–Z</option>
          <option value="severity:desc">Mayor incidencia</option>
        </SelectInput>
      </ListToolbar>
      {greenhousePests.length ? (
        <div className="grid gap-6">
          {greenhousePests.map((alert) => (
            <article key={alert.id} className="border border-app-border bg-white">
              <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                      Detectado {formatDate(alert.detectedAt)}
                    </p>
                    {alert.zone ? <span className="text-xs text-app-muted">{alert.zone}</span> : null}
                  </div>
                  <h3 className="mt-3 text-3xl font-light tracking-normal text-app-text">{alert.problem}</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge tone={alert.caseStatus === "Cierre sanitario" ? "green" : "neutral"}>
                      {alert.caseStatus ?? "Abierta"}
                    </StatusBadge>
                    <RiskBadge level={alert.severity} />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
                      href={pestCaseRoute(organization.slug ?? organization.name, alert.publicId ?? publicEntityId("pest", alert.id))}
                    >
                      Abrir expediente
                    </Link>
                    <Button icon={<Plus className="h-4 w-4" />} onClick={() => setFollowingAlert(alert)} type="button" variant="secondary">
                      Agregar seguimiento
                    </Button>
                    <Button icon={<Edit3 className="h-4 w-4" />} onClick={() => setEditingAlert(alert)} type="button" variant="secondary">
                      Editar alerta
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 text-sm">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Acción tomada</p>
                    <p className="mt-1 text-app-muted">{alert.action || "Sin acción registrada"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-app-muted">Seguimiento actual</p>
                    <p className="mt-1 whitespace-pre-line text-app-muted">{alert.followUp || "Sin seguimiento registrado"}</p>
                  </div>
                </div>
              </div>
              {alert.photoUrl ? (
                <div
                  aria-label={`Evidencia de ${alert.problem}`}
                  className="h-80 w-full border-y border-app-border bg-cover bg-center md:h-[420px]"
                  role="img"
                  style={{ backgroundImage: `url(${alert.photoUrl})` }}
                />
              ) : null}
              <div className="p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Historial sanitario</p>
                <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
                  {(alert.updates ?? []).map((update) => (
                    <article className="w-[280px] shrink-0 snap-start border border-app-border bg-app-sidebar" key={update.id}>
                      {update.photoUrl ? (
                        <div
                          aria-label={`Evidencia de seguimiento ${update.status}`}
                          className="h-32 w-full border-b border-app-border bg-cover bg-center"
                          role="img"
                          style={{ backgroundImage: `url(${update.photoUrl})` }}
                        />
                      ) : null}
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">
                              {formatDate(update.createdAt)}
                            </p>
                            <p className="mt-1 text-sm font-medium text-app-text">{update.status}</p>
                          </div>
                          <RiskBadge level={update.severity} />
                        </div>
                        <p className="mt-3 text-xs font-medium text-app-muted">{update.actionType}</p>
                        {update.notes ? <p className="mt-2 line-clamp-3 text-sm leading-5 text-app-muted">{update.notes}</p> : null}
                        {update.nextReviewDate ? (
                          <p className="mt-3 text-xs text-app-muted">Próxima revisión: {formatDate(update.nextReviewDate)}</p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  <article className="w-[280px] shrink-0 snap-start border border-app-border bg-white">
                    {alert.photoUrl ? (
                      <div
                        aria-label={`Evidencia inicial de ${alert.problem}`}
                        className="h-32 w-full border-b border-app-border bg-cover bg-center"
                        role="img"
                        style={{ backgroundImage: `url(${alert.photoUrl})` }}
                      />
                    ) : null}
                    <div className="p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-app-muted">{formatDate(alert.detectedAt)}</p>
                      <p className="mt-1 text-sm font-medium text-app-text">Detección inicial</p>
                      <p className="mt-2 line-clamp-3 text-sm leading-5 text-app-muted">{alert.action || alert.followUp || "Se abrió el caso sanitario."}</p>
                    </div>
                  </article>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={AlertTriangle} title="No hay alertas sanitarias para esta área productiva." />
      )}
      {viewDataMeta?.resource === "pests" ? <ListPagination {...viewDataMeta} onPageChange={(page) => updateList({ page })} /> : null}
      <Modal title="Editar alerta sanitaria" open={Boolean(editingAlert)} onClose={() => setEditingAlert(null)}>
        {editingAlert ? (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleEditAlert}>
            <Field label="Fecha">
              <DatePickerInput name="detectedAt" required defaultValue={editingAlert.detectedAt} />
            </Field>
            <Field label="Incidencia">
              <SelectInput name="severity" defaultValue={editingAlert.severity}>
                {["Baja", "Media", "Alta"].map((item) => <option key={item}>{item}</option>)}
              </SelectInput>
            </Field>
            <Field label="Estado del caso">
              <SelectInput name="caseStatus" defaultValue={editingAlert.caseStatus ?? "Abierta"}>
                {pestCaseStatuses.map((status) => <option key={status}>{status}</option>)}
              </SelectInput>
            </Field>
            <Field label="Problema">
              <TextInput name="problem" required defaultValue={editingAlert.problem} />
            </Field>
            <Field label="Zona afectada">
              <TextInput name="zone" defaultValue={editingAlert.zone} />
            </Field>
            <Field className="sm:col-span-2" label="Acción tomada">
              <TextArea name="action" defaultValue={editingAlert.action} />
            </Field>
            <Field className="sm:col-span-2" label="Seguimiento / reaplicación">
              <TextArea name="followUp" defaultValue={editingAlert.followUp} />
            </Field>
            <div className="flex justify-end gap-2 border-t border-app-border pt-4 sm:col-span-2">
              <Button disabled={savingAlert} onClick={() => setEditingAlert(null)} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button disabled={savingAlert} type="submit" variant="primary">
                {savingAlert ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
      <Modal title="Agregar seguimiento sanitario" open={Boolean(followingAlert)} onClose={() => setFollowingAlert(null)}>
        {followingAlert ? (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleAddFollowUp}>
            <Field label="Estado del seguimiento">
              <SelectInput name="status" defaultValue="Revisión requerida">
                {pestUpdateStatuses.map((status) => <option key={status}>{status}</option>)}
              </SelectInput>
            </Field>
            <Field label="Estado del caso">
              <SelectInput name="caseStatus" defaultValue={followingAlert.caseStatus ?? "Abierta"}>
                {pestCaseStatuses.map((status) => <option key={status}>{status}</option>)}
              </SelectInput>
            </Field>
            <Field label="Incidencia actual">
              <SelectInput name="severity" defaultValue={followingAlert.severity}>
                {["Baja", "Media", "Alta"].map((item) => <option key={item}>{item}</option>)}
              </SelectInput>
            </Field>
            <Field label="Acción realizada">
              <SelectInput name="actionType" defaultValue="Revisión">
                {pestActionTypes.map((action) => <option key={action}>{action}</option>)}
              </SelectInput>
            </Field>
            <Field label="Próxima revisión">
              <DatePickerInput name="nextReviewDate" />
            </Field>
            <Field label="Evidencia">
              <input
                accept="image/*"
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm"
                name="photo"
                type="file"
              />
            </Field>
            <Field className="sm:col-span-2" label="Comentario técnico">
              <TextArea name="notes" placeholder="Qué cambió, qué se aplicó o qué falta confirmar." />
            </Field>
            <div className="flex justify-end gap-2 border-t border-app-border pt-4 sm:col-span-2">
              <Button disabled={savingFollowUp} onClick={() => setFollowingAlert(null)} type="button" variant="secondary">
                Cancelar
              </Button>
              <Button disabled={savingFollowUp} type="submit" variant="primary">
                {savingFollowUp ? "Guardando..." : "Guardar seguimiento"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}

function HarvestSection({ embedded = false }: { embedded?: boolean }) {
  const { currentUser, greenhouseHarvest, openHarvestEditor, openModal, organization, viewAggregates, viewDataMeta } = useFilteredData();
  const { list, updateList } = useListNavigation();
  const refresh = useViewDataRefresh();
  const isManager = currentUser.role === "manager";
  const totalBoxes = viewAggregates?.totalHarvestBoxes ?? 0;
  const totalKg = viewAggregates?.totalHarvestKg ?? 0;
  const commercialKg = viewAggregates?.commercialKg ?? 0;
  const averagePrice = viewAggregates?.averagePrice ?? 0;
  const netRevenue = viewAggregates?.netRevenue ?? viewAggregates?.estimatedRevenue ?? 0;
  const latestHarvest = viewAggregates?.harvestDaily.at(-1);
  const harvestChartData = (viewAggregates?.harvestDaily ?? [])
    .slice(-7)
    .map((record) => ({
      label: dateLabel(record.date),
      kg: record.kg
    }));

  return (
    <section>
      {!embedded ? (
        <SectionHeader
          action={(
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button className="w-full sm:w-auto" icon={<RefreshCw className="h-4 w-4" />} onClick={refresh} variant="secondary">Actualizar</Button>
              {!isManager ? <Button className="w-full sm:w-auto" icon={<Leaf className="h-4 w-4" />} onClick={() => openModal("harvest")} variant="secondary">Registrar cosecha</Button> : null}
            </div>
          )}
          title="Cosecha"
          description={isManager
            ? "Consulta las últimas cosechas registradas en tus áreas asignadas."
            : "Consulta cortes, calidad, merma, destino y rendimiento por área productiva."}
        />
      ) : null}
      <div className={cn("mb-5 grid gap-3", isManager ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4")}>
        <MetricCard icon={Leaf} label="Cajas acumuladas" value={formatNumber(totalBoxes)} detail={`${formatNumber(totalKg)} kg registrados`} />
        {isManager ? (
          <>
            <MetricCard icon={CheckCircle2} label="Kg registrados" value={`${formatNumber(totalKg)} kg`} detail="En el periodo seleccionado" />
            <MetricCard icon={CalendarDays} label="Último corte" value={latestHarvest ? formatDate(latestHarvest.date) : "--"} detail={latestHarvest ? `${formatNumber(latestHarvest.kg)} kg capturados` : "Sin cortes registrados"} />
          </>
        ) : (
          <>
            <MetricCard icon={CheckCircle2} label="Kg comerciales" value={`${formatNumber(commercialKg)} kg`} detail="1ra, 2da y 3ra calidad" />
            <MetricCard icon={WalletCards} label="Venta neta" value={formatCurrency(netRevenue)} detail="Después de comisión y flete" />
            <MetricCard icon={WalletCards} label="Precio promedio por caja" value={formatPricePerBox(averagePrice)} detail="Ponderado por cajas vendidas" />
          </>
        )}
      </div>
      <h2 className="mb-4 text-xl font-light text-app-text">Últimas cosechas</h2>
      <div className="grid gap-5">
        {!isManager ? <YieldChart data={harvestChartData} /> : null}
        <DataTable<HarvestRecord>
          columns={[
            {
              key: "date",
              label: "Fecha y destino",
              render: (item) => (
                <span>
                  <span className="block font-medium">{formatDate(item.date)}</span>
                  <span className="mt-1 block text-xs text-app-muted">{item.destination || "Sin destino"}</span>
                </span>
              ),
              sortable: true
            },
            {
              key: "boxes",
              label: "Volumen",
              render: (item) => (
                <span>
                  <span className="block font-medium">{item.boxCount ? `${formatNumber(item.boxCount)} cj` : "--"}</span>
                  <span className="mt-1 block text-xs text-app-muted">{formatNumber(item.kilograms)} kg</span>
                </span>
              ),
              sortable: true
            },
            { key: "first", label: "1ra", render: (item) => qualityCell(item.firstQualityBoxes, item.firstQuality) },
            { key: "second", label: "2da", render: (item) => qualityCell(item.secondQualityBoxes, item.secondQuality) },
            { key: "third", label: "3ra", render: (item) => qualityCell(item.thirdQualityBoxes, item.thirdQuality) },
            { key: "merma", label: "Merma", render: (item) => qualityCell(item.mermaBoxes, item.merma) },
            ...(!isManager ? [{ key: "price", label: "Precio por caja", render: (item: HarvestRecord) => formatPricePerBox(item.estimatedPrice), sortable: true }] : []),
            { key: "sale", label: "Venta neta", render: (item) => item.netRevenue ? formatCurrency(item.netRevenue) : item.grossRevenue ? formatCurrency(item.grossRevenue) : "--", mobileHidden: true },
            {
              key: "detail",
              label: "",
              render: (item) => (
                <div className="flex flex-wrap justify-end gap-2">
                  {!isManager ? <Button className="h-9 px-2 text-xs" icon={<Edit3 aria-hidden="true" className="h-3.5 w-3.5" />} onClick={() => openHarvestEditor(item.id)} type="button" variant="ghost">Corregir</Button> : null}
                  <Link className="inline-flex min-h-9 items-center text-xs font-medium text-app-green underline-offset-4 hover:underline" href={harvestLotRoute(organization.slug ?? organization.name, item.publicId ?? publicEntityId("lot", item.id))}>
                    Abrir lote
                  </Link>
                </div>
              )
            }
          ]}
          data={greenhouseHarvest}
          desktopLayout="fixed"
          getRowKey={(item) => item.id}
          sort={{ key: list.sort ?? "date", dir: list.dir ?? "desc" }}
          onSort={(key, dir) => updateList({ sort: key, dir, page: undefined })}
          pagination={viewDataMeta?.resource === "harvest" ? { ...viewDataMeta, onPageChange: (page) => updateList({ page }) } : undefined}
        />
      </div>
    </section>
  );
}

function qualityCell(boxes: number, kilograms: number) {
  if (boxes > 0) {
    return (
      <span>
        <span className="block font-medium">{formatNumber(boxes)} cj</span>
        <span className="block text-xs text-app-muted">{formatNumber(kilograms)} kg</span>
      </span>
    );
  }

  return `${formatNumber(kilograms)} kg`;
}

function CostsSection({ embedded = false }: { embedded?: boolean }) {
  const { costListRecords, currentUser, greenhouse, openModal, viewAggregates, viewDataMeta } = useFilteredData();
  const { list, updateList } = useListNavigation();
  const totalCost = viewAggregates?.totalCost ?? 0;
  const totalKg = viewAggregates?.totalHarvestKg ?? 0;
  const costPerKg = totalKg ? totalCost / totalKg : 0;
  const costChartData = viewAggregates?.costByCategory ?? [];
  const budgetAmount = greenhouse?.budgetAmount ?? null;
  const remainingBudget = budgetAmount === null ? null : budgetAmount - totalCost;
  const budgetUsed = budgetAmount && budgetAmount > 0 ? Math.min(100, Math.round((totalCost / budgetAmount) * 100)) : null;
  const canManageBudget = currentUser.role === "owner" || currentUser.role === "admin";

  return (
    <section>
      {!embedded ? (
        <SectionHeader
          action={<Button icon={<WalletCards className="h-4 w-4" />} onClick={() => openModal("cost")} variant="secondary">Registrar costo</Button>}
          title="Costos"
          description="Nómina, insumos, agua, energía y otros costos necesarios para producir."
        />
      ) : (
        <div className="mb-5 flex flex-col gap-3 border-y border-app-border py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-app-muted">Costos automáticos y gastos registrados durante el periodo seleccionado.</p>
          <Button className="w-full sm:w-auto" icon={<WalletCards className="h-4 w-4" />} onClick={() => openModal("cost")} variant="secondary">Registrar costo</Button>
        </div>
      )}
      {budgetAmount === null ? (
        <div className="mb-6 flex flex-col gap-4 border border-[#E3D7B6] bg-[#FFF8E6] px-5 py-4 text-[#725A1A] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#D7C58F] bg-white/60">
              <WalletCards aria-hidden="true" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {greenhouse ? "Configura el presupuesto del ciclo" : "Selecciona un invernadero"}
              </p>
              <p className="mt-1 text-sm leading-5">
                {greenhouse
                  ? "Define el monto para comparar los costos reales y conocer cuánto queda disponible."
                  : "El comparativo de presupuesto está disponible al consultar un invernadero específico."}
              </p>
            </div>
          </div>
          {greenhouse && canManageBudget ? (
            <Button
              className="w-full shrink-0 border-[#D7C58F] bg-white/70 text-[#725A1A] hover:bg-white sm:w-auto"
              onClick={() => openModal("editGreenhouse")}
              variant="secondary"
            >
              Configurar presupuesto
            </Button>
          ) : null}
        </div>
      ) : null}
      <ListToolbar query={list.q} onSearch={(q) => updateList({ q: q || undefined, page: undefined })}>
        <SelectInput aria-label="Categoría de costo" className="h-10" value={list.status ?? ""} onChange={(event) => updateList({ status: event.target.value || undefined, page: undefined })}>
          <option value="">Todas las categorías</option>
          {costCategories.map((category) => (
            <option key={category.value} value={category.value}>{category.label}</option>
          ))}
        </SelectInput>
      </ListToolbar>
      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard emphasis icon={WalletCards} label="Costo acumulado" value={formatCurrency(totalCost)} detail="Registros del periodo" />
        <MetricCard icon={ActivitySquare} label="Presupuesto" value={budgetAmount === null ? "Pendiente" : formatCurrency(budgetAmount)} detail={budgetUsed === null ? "Configurar en área" : `${budgetUsed}% usado`} tone="soft" />
        <MetricCard icon={WalletCards} label="Disponible" value={remainingBudget === null ? "--" : formatCurrency(remainingBudget)} detail={remainingBudget !== null && remainingBudget < 0 ? "Presupuesto rebasado" : "Contra costos reales"} />
        <MetricCard icon={Leaf} label="Costo por kg" value={totalKg > 0 ? formatCurrency(costPerKg) : "--"} detail={totalKg > 0 ? "Contra kg cosechados" : "Sin cosecha en el periodo"} />
      </div>
      <div className="grid gap-8 xl:grid-cols-[0.8fr_1.5fr]">
        <CostChart data={costChartData} />
        <DataTable<CostRecord>
          columns={[
            { key: "date", label: "Fecha", render: (item) => formatDate(item.date), sortable: true },
            { key: "category", label: "Categoría", render: (item) => item.category, sortable: true },
            { key: "amount", label: "Monto", render: (item) => formatCurrency(item.amount), sortable: true },
            {
              key: "notes",
              label: "Concepto",
              render: (item) => (
                <span>
                  <span className="block">{item.notes || "Sin concepto"}</span>
                  {item.quantity != null || item.unitPrice != null ? (
                    <span className="block text-xs text-app-muted">
                      {item.quantity != null ? formatNumber(item.quantity) : "--"}{item.unit ? ` ${item.unit}` : ""}
                      {item.unitPrice != null ? ` × ${formatCurrency(item.unitPrice)}` : ""}
                    </span>
                  ) : null}
                </span>
              )
            }
          ]}
          data={costListRecords}
          getRowKey={(item) => item.id}
          sort={{ key: list.sort ?? "date", dir: list.dir ?? "desc" }}
          onSort={(key, dir) => updateList({ sort: key, dir, page: undefined })}
          pagination={viewDataMeta?.resource === "costs" ? { ...viewDataMeta, onPageChange: (page) => updateList({ page }) } : undefined}
        />
      </div>
    </section>
  );
}

function InventoryCostsSection({ view = "summary" }: { view?: InventoryCostsView }) {
  const router = useRouter();
  const { isUpdating } = useViewDataRefreshState();
  const organization = useGreenhouseStore((state) => state.organization);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const crops = useGreenhouseStore((state) => state.crops);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);
  const [displayView, setDisplayView] = useState<InventoryCostsView>(view);
  const [animateView, setAnimateView] = useState(false);
  useEffect(() => setDisplayView(view), [view]);
  const tabs: { id: InventoryCostsView; label: string }[] = [
    { id: "summary", label: "Resumen" },
    { id: "costs", label: "Costos" },
    { id: "stock", label: "Inventario" },
    { id: "movements", label: "Historial" }
  ];
  const showContext = displayView === "summary" || displayView === "costs";
  const navigateContext = (next: { greenhouseId?: string; period?: typeof selectedPeriod }) => {
    router.push(appRoute(organization.slug ?? organization.name, {
      section: "inventory",
      greenhouseId: next.greenhouseId ?? selectedGreenhouseId,
      period: next.period ?? selectedPeriod,
      inventoryView: displayView
    }));
  };

  return (
    <section>
      <SectionHeader
        title="Inventario y costos"
        description="Controla lo que tienes disponible y entiende cuánto cuesta producir, sin separar ambos flujos."
      />
      <nav aria-label="Secciones de inventario y costos" className="mb-6 overflow-x-auto border-b border-app-border">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => (
            <Link
              aria-current={displayView === tab.id ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-[border-color,color] duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-app-green",
                displayView === tab.id
                  ? "border-app-green text-app-green"
                  : "border-transparent text-app-muted hover:border-app-border hover:text-app-text"
              )}
              href={appRoute(organization.slug ?? organization.name, {
                section: "inventory",
                greenhouseId: selectedGreenhouseId,
                period: selectedPeriod,
                inventoryView: tab.id
              })}
              key={tab.id}
              onClick={() => {
                setAnimateView(true);
                setDisplayView(tab.id);
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
      {showContext ? (
        <div className="relative mb-8 grid gap-1 rounded-2xl border border-app-border bg-white p-2 sm:grid-cols-[minmax(0,1fr)_220px]">
          <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-app-sidebar focus-within:bg-app-sidebar">
            <Building2 aria-hidden="true" className="h-4 w-4 shrink-0 text-app-green" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">Invernadero</span>
              <select
                className="mt-0.5 h-6 w-full min-w-0 cursor-pointer bg-transparent text-sm font-medium text-app-text outline-none focus-visible:ring-2 focus-visible:ring-app-green/25"
                onChange={(event) => navigateContext({ greenhouseId: event.target.value })}
                value={selectedGreenhouseId}
              >
                <option value="__all__">Todos los invernaderos</option>
                {greenhouses.map((greenhouse) => (
                  <option key={greenhouse.id} value={greenhouse.id}>
                    {greenhouseDisplayName(greenhouse, crops)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="flex min-h-12 items-center gap-3 rounded-lg border-t border-app-border px-3 py-2 transition-colors duration-150 hover:bg-app-sidebar focus-within:bg-app-sidebar sm:border-l sm:border-t-0">
            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-app-green" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">Periodo</span>
              <select
                className="mt-0.5 h-6 w-full min-w-0 cursor-pointer bg-transparent text-sm font-medium text-app-text outline-none focus-visible:ring-2 focus-visible:ring-app-green/25"
                onChange={(event) => navigateContext({ period: event.target.value as typeof selectedPeriod })}
                value={selectedPeriod}
              >
                <option value="week">Semana actual</option>
                <option value="month">Mes actual</option>
                <option value="all">Todo el historial</option>
              </select>
            </span>
          </label>
          <span
            aria-live="polite"
            className={cn(
              "absolute -bottom-5 right-0 flex items-center gap-2 text-xs text-app-muted transition-opacity duration-150",
              isUpdating ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            role="status"
          >
            {isUpdating ? (
              <>
                <RefreshCw aria-hidden="true" className="inventory-refresh-spin h-3.5 w-3.5" />
                Actualizando…
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className={cn("min-h-[360px]", animateView && "inventory-view-enter")} key={displayView}>
        {displayView === "costs" ? <CostsSection embedded /> : <InventorySection embedded view={displayView} />}
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

function greenhouseSurfaceTotal(greenhouses: Greenhouse[]) {
  return greenhouses.reduce((sum, greenhouse) => {
    return sum + (greenhouse.surfaceM2 ?? 0);
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

type CompanyStaff = {
  id: string;
  fullName: string;
  phone: string;
  status: "active" | "disabled";
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
  const [companyStaff, setCompanyStaff] = useState<CompanyStaff[]>([]);
  const [staffNotice, setStaffNotice] = useState("");
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isSavingStaff, setIsSavingStaff] = useState(false);
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [products, setProducts] = useState<Array<{ id: string; name: string; category: string; dose: string; detail: string }>>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productsNotice, setProductsNotice] = useState("");
  const [unitSettings, setUnitSettings] = useState({
    surface: "m2 / ha",
    water: "L",
    production: "kg",
    temperature: "°C",
    solution: "Opcional",
    currency: "MXN"
  });
  const totalSurface = greenhouseSurfaceTotal(greenhouses);
  const canManageUsers = currentUser.role === "owner" || currentUser.role === "admin";
  const canManageRoles = currentUser.role === "owner";
  const inviteRoleOptions: MemberRole[] = canManageRoles ? memberRoles : ["manager"];
  const activeMemberCount = members.filter((member) => member.status === "active").length;
  const activeOwnerCount = members.filter((member) => member.role === "owner" && member.status === "active").length;

  const loadProducts = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;
    setIsLoadingProducts(true);
    setProductsNotice("");
    const { data, error } = await supabase
      .from("products")
      .select("id, name, category, composition, default_dose")
      .eq("company_id", organization.id)
      .order("name", { ascending: true });
    if (error) {
      setProductsNotice(appErrorMessage(error, "No se pudo cargar el catálogo."));
      setIsLoadingProducts(false);
      return;
    }
    setProducts((data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category ?? "Catálogo",
      dose: product.default_dose ?? "",
      detail: product.composition ?? "Sin composición registrada"
    })));
    setIsLoadingProducts(false);
  }, [organization.id]);

  useEffect(() => {
    if (activeSetting === "catalog") void loadProducts();
  }, [activeSetting, loadProducts]);

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

  const loadStaff = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !organization.id) return;

    setIsLoadingStaff(true);
    const { data, error } = await supabase
      .from("company_staff")
      .select("id, full_name, phone, status")
      .eq("company_id", organization.id)
      .eq("role", "manager")
      .order("full_name", { ascending: true });

    if (error) {
      setStaffNotice(appErrorMessage(error, "No se pudieron cargar los encargados internos."));
      setIsLoadingStaff(false);
      return;
    }

    setCompanyStaff((data ?? []).map((person: any) => ({
      id: person.id,
      fullName: person.full_name,
      phone: person.phone ?? "",
      status: person.status
    })));
    setIsLoadingStaff(false);
  }, [organization.id]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

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
      if (!canManageRoles && role !== "manager") {
        throw new Error("Solo un owner puede invitar admins u owners.");
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
      setMembersNotice("Invitación guardada. Pide al usuario crear su cuenta con este mismo correo.");
      await loadMembers();
    } catch (caught) {
      setMembersNotice(appErrorMessage(caught, "No se pudo invitar al usuario."));
    } finally {
      setIsInvitingMember(false);
    }
  };

  const handleAddStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStaffNotice("");
    setIsSavingStaff(true);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fullName = formatPersonName(String(form.get("staffName") ?? ""));
    const phone = String(form.get("staffPhone") ?? "").trim();

    try {
      if (!canManageUsers) {
        throw new Error("Tu rol no permite administrar encargados.");
      }
      if (!fullName) {
        throw new Error("Escribe el nombre del encargado.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase || !organization.id) {
        throw new Error("No se pudo conectar con Supabase.");
      }

      const { error } = await supabase.from("company_staff").insert({
        company_id: organization.id,
        full_name: fullName,
        phone: phone || null,
        role: "manager",
        status: "active",
        created_by: currentUser.id
      });

      if (error) throw error;

      formElement.reset();
      setStaffNotice("Encargado interno guardado.");
      await loadStaff();
    } catch (caught) {
      setStaffNotice(appErrorMessage(caught, "No se pudo guardar el encargado interno."));
    } finally {
      setIsSavingStaff(false);
    }
  };

  const updateStaffStatus = async (person: CompanyStaff, status: CompanyStaff["status"]) => {
    setStaffNotice("");
    setSavingStaffId(person.id);

    try {
      if (!canManageUsers) {
        throw new Error("Tu rol no permite administrar encargados.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("No se pudo conectar con Supabase.");
      }

      const { error } = await supabase
        .from("company_staff")
        .update({ status })
        .eq("id", person.id)
        .eq("company_id", organization.id);

      if (error) throw error;

      setStaffNotice("Encargado interno actualizado.");
      await loadStaff();
    } catch (caught) {
      setStaffNotice(appErrorMessage(caught, "No se pudo actualizar el encargado interno."));
    } finally {
      setSavingStaffId(null);
    }
  };

  const handleEditStaff = async (event: FormEvent<HTMLFormElement>, person: CompanyStaff) => {
    event.preventDefault();
    setStaffNotice("");
    setSavingStaffId(person.id);

    const form = new FormData(event.currentTarget);
    const fullName = formatPersonName(String(form.get("editStaffName") ?? ""));
    const phone = String(form.get("editStaffPhone") ?? "").trim();
    const status = String(form.get("editStaffStatus") ?? person.status) as CompanyStaff["status"];

    try {
      if (!canManageUsers) {
        throw new Error("Tu rol no permite administrar encargados.");
      }
      if (!fullName) {
        throw new Error("Escribe el nombre del encargado.");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("No se pudo conectar con Supabase.");
      }

      const { error } = await supabase
        .from("company_staff")
        .update({
          full_name: fullName,
          phone: phone || null,
          status
        })
        .eq("id", person.id)
        .eq("company_id", organization.id);

      if (error) throw error;

      setEditingStaffId(null);
      setStaffNotice("Encargado interno actualizado.");
      await loadStaff();
    } catch (caught) {
      setStaffNotice(appErrorMessage(caught, "No se pudo actualizar el encargado interno."));
    } finally {
      setSavingStaffId(null);
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
      if (!canManageRoles && (member.role !== "manager" || nextRole !== "manager")) {
        throw new Error("Solo un owner puede cambiar roles o modificar owners/admins.");
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
      <section className="hidden lg:block">
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
    <section className="hidden lg:block">
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
                    const isSavingThisMember = savingMemberId === member.id;
                    const canUpdateMemberStatus = canManageRoles || member.role === "manager";
                    const roleDisabled = !canManageRoles || isSavingThisMember;
                    const statusDisabled = !canManageUsers || !canUpdateMemberStatus || isSavingThisMember;
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
                            disabled={roleDisabled}
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
                            disabled={statusDisabled}
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
                    {inviteRoleOptions.map((role) => (
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
                  Encargados internos
                </p>
                <form className="mt-5 grid gap-4" onSubmit={handleAddStaff}>
                  <Field label="Nombre">
                    <TextInput
                      disabled={!canManageUsers || isSavingStaff}
                      name="staffName"
                      placeholder="Nombre del encargado"
                      required
                    />
                  </Field>
                  <Field label="Teléfono opcional">
                    <TextInput
                      disabled={!canManageUsers || isSavingStaff}
                      name="staffPhone"
                      placeholder="Opcional"
                    />
                  </Field>
                  <Button disabled={!canManageUsers || isSavingStaff} icon={<Plus className="h-4 w-4" />} type="submit" variant="secondary">
                    {isSavingStaff ? "Guardando..." : "Guardar encargado"}
                  </Button>
                </form>
                <div className="mt-5 border-b border-app-border">
                  {isLoadingStaff ? (
                    <SettingRow label="Cargando" value="Consultando encargados" detail="Un momento." />
                  ) : companyStaff.length ? (
                    companyStaff.map((person) => (
                      <div key={person.id} className="border-t border-app-border py-3">
                        {editingStaffId === person.id ? (
                          <form className="grid gap-3" onSubmit={(event) => handleEditStaff(event, person)}>
                            <Field label="Nombre">
                              <TextInput
                                defaultValue={person.fullName}
                                disabled={!canManageUsers || savingStaffId === person.id}
                                name="editStaffName"
                                required
                              />
                            </Field>
                            <Field label="Teléfono opcional">
                              <TextInput
                                defaultValue={person.phone}
                                disabled={!canManageUsers || savingStaffId === person.id}
                                name="editStaffPhone"
                                placeholder="Opcional"
                              />
                            </Field>
                            <Field label="Estado">
                              <SelectInput
                                defaultValue={person.status}
                                disabled={!canManageUsers || savingStaffId === person.id}
                                name="editStaffStatus"
                              >
                                <option value="active">Activo</option>
                                <option value="disabled">Desactivado</option>
                              </SelectInput>
                            </Field>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Button
                                disabled={savingStaffId === person.id}
                                type="submit"
                                variant="primary"
                              >
                                {savingStaffId === person.id ? "Guardando..." : "Guardar"}
                              </Button>
                              <Button
                                disabled={savingStaffId === person.id}
                                onClick={() => setEditingStaffId(null)}
                                type="button"
                                variant="secondary"
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="grid gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-app-text">{person.fullName}</p>
                                <StatusBadge tone={person.status === "active" ? "green" : "red"}>
                                  {person.status === "active" ? "Activo" : "Desactivado"}
                                </StatusBadge>
                              </div>
                              <p className="mt-1 truncate text-xs text-app-muted">{person.phone || "Sin cuenta"}</p>
                            </div>
                            <div className="grid gap-2">
                              <SelectInput
                                aria-label={`Estado de ${person.fullName}`}
                                disabled={!canManageUsers || savingStaffId === person.id}
                                value={person.status}
                                onChange={(event) => updateStaffStatus(person, event.target.value as CompanyStaff["status"])}
                              >
                                <option value="active">Activo</option>
                                <option value="disabled">Desactivado</option>
                              </SelectInput>
                              <Button
                                disabled={!canManageUsers || savingStaffId === person.id}
                                icon={<Edit3 className="h-4 w-4" />}
                                onClick={() => setEditingStaffId(person.id)}
                                type="button"
                                variant="ghost"
                              >
                                Editar
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="border-t border-app-border py-4 text-sm text-app-muted">Aún no hay encargados internos.</p>
                  )}
                </div>
                {staffNotice ? <p className="mt-4 text-sm text-app-muted">{staffNotice}</p> : null}
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
          {isLoadingProducts ? (
            <div className="animate-pulse border-y border-app-border py-5">
              <div className="h-4 w-48 bg-app-border" />
              <div className="mt-4 h-4 w-full bg-app-border" />
            </div>
          ) : productsNotice ? (
            <div className="border-y border-app-border py-5">
              <p className="text-sm text-app-muted">{productsNotice}</p>
              <Button className="mt-3" onClick={() => void loadProducts()} variant="ghost">Reintentar</Button>
            </div>
          ) : products.length ? (
            <div className="border-b border-app-border">
              {products.slice(0, 5).map((product) => (
                <SettingRow
                  key={product.id}
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
          action={<Button className="hidden lg:inline-flex" icon={<Plus className="h-4 w-4" />} onClick={() => openModal("greenhouse")} variant="ghost">Nuevo</Button>}
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
                  <Button className="hidden lg:inline-flex" icon={<Edit3 className="h-4 w-4" />} onClick={() => editGreenhouse(greenhouse.id)} variant="ghost">
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
          <Button icon={<WalletCards className="h-4 w-4" />} onClick={() => setActiveSection("inventory")} variant="secondary">
            Ver inventario y costos
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
  const operationProps = {
    copilotInsights: props.copilotInsights,
    operationRefreshKey: props.operationRefreshKey,
    weekStart: props.operationWeekStart,
    initialView: props.operationView,
    onWeekStartChange: props.onOperationWeekChange,
    onViewChange: props.onOperationViewChange,
    pendingCompletionTask: props.pendingCompletionTask,
    onPendingCompletionConsumed: props.onPendingCompletionConsumed,
    pendingOpenWork: props.pendingOpenWork,
    onPendingOpenWorkConsumed: props.onPendingOpenWorkConsumed,
    onCreateCopilotTask: props.onCreateCopilotTask,
    onPrepareCopilotMessage: props.onPrepareCopilotMessage
  };

  if (!canOpenSection) return <OverviewSection {...props} />;

  if (activeSection === "overview") return <OverviewSection {...props} />;
  if (activeSection === "greenhouses") return <GreenhousesSection />;
  if (activeSection === "calendar") return <OperationsSection {...operationProps} />;
  if (activeSection === "monitoring") return <MonitoringSection />;
  if (activeSection === "records") return <OperationsSection {...operationProps} initialView="history" />;
  if (activeSection === "irrigation") return <OperationsSection {...operationProps} specialtyLabel="Riego" workTypeFilter={["riego"]} />;
  if (activeSection === "nutrition") return <OperationsSection {...operationProps} specialtyLabel="Nutrición" workTypeFilter={["fertirriego", "fertilizacion"]} />;
  if (activeSection === "applications") return <OperationsSection {...operationProps} specialtyLabel="Aplicaciones" workTypeFilter={["aplicacion_foliar"]} />;
  if (activeSection === "pests") return <PestsSection />;
  if (activeSection === "harvest") return <HarvestSection />;
  if (activeSection === "nursery") return <NurserySection />;
  if (activeSection === "inventory") return <InventoryCostsSection view={props.inventoryView} />;
  return <SettingsSection />;
}

function ViewDataBoundary({ children, entity, list }: { children: React.ReactNode; entity?: EntityRoute; list?: ListQueryState }) {
  const router = useRouter();
  const section = useGreenhouseStore((state) => state.activeSection);
  const greenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const period = useGreenhouseStore((state) => state.selectedPeriod);
  const organization = useGreenhouseStore((state) => state.organization);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const replaceViewData = useGreenhouseStore((state) => state.replaceViewData);
  const [retryKey, setRetryKey] = useState(0);
  const [resolvedSection, setResolvedSection] = useState<SectionId | null>(null);
  const entityKey = entity ? `${entity.type}:${"pestPublicId" in entity ? entity.pestPublicId : "lotPublicId" in entity ? entity.lotPublicId : entity.greenhousePublicId}` : "";
  const listKey = JSON.stringify(list ?? {});
  const required = requiresWorkspaceViewData(section, entity);
  const cacheKey = [organization.id, section, greenhouseId, period, entityKey, listKey].join(":");
  const requestKey = [cacheKey, retryKey].join(":");
  const [loadState, setLoadState] = useState<{ key: string; status: "idle" | "loading" | "refreshing" | "ready" | "stale" | "error"; error: string }>({
    key: "",
    status: "idle",
    error: ""
  });
  const refresh = useCallback(() => {
    invalidateViewDataCache();
    setRetryKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!required || !organization.id) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState({ key: requestKey, status: "error", error: "No se pudo conectar con Supabase." });
      return;
    }

    let active = true;
    const cached = retryKey === 0 ? getCachedViewData(cacheKey) : null;
    const canKeepCurrentView = section === "inventory" && resolvedSection === section;
    if (cached?.isFresh) {
      replaceViewData(cached.data, cached.meta);
      setResolvedSection(section);
      setLoadState({ key: requestKey, status: "ready", error: "" });
      return () => { active = false; };
    }

    if (cached) {
      replaceViewData(cached.data, cached.meta);
      setLoadState({ key: requestKey, status: "refreshing", error: "" });
    } else if (canKeepCurrentView) {
      setLoadState({ key: requestKey, status: "refreshing", error: "" });
    } else {
      setLoadState({ key: requestKey, status: "loading", error: "" });
    }
    void loadWorkspaceViewData({
      supabase,
      companyId: organization.id,
      currentUserName: currentUser.fullName,
      section,
      greenhouseId,
      period,
      entity,
      list
    }).then(({ data, meta }) => {
      if (!active) return;
      cacheViewData(cacheKey, data, meta);
      replaceViewData(data, meta);
      setResolvedSection(section);
      setLoadState({ key: requestKey, status: "ready", error: "" });
    }).catch((caught) => {
      if (!active) return;
      if ((caught as { code?: string })?.code === "PGRST103" && list?.page) {
        router.replace(appRoute(organization.slug ?? organization.name, {
          section,
          greenhouseId,
          period,
          list: { ...list, page: undefined }
        }));
        return;
      }
      setLoadState({
        key: requestKey,
        status: cached || canKeepCurrentView ? "stale" : "error",
        error: appErrorMessage(caught, "No se pudo actualizar esta vista.")
      });
    });

    return () => { active = false; };
  }, [cacheKey, currentUser.fullName, entity, entityKey, greenhouseId, list, listKey, organization.id, organization.name, organization.slug, period, replaceViewData, requestKey, required, resolvedSection, retryKey, router, section]);

  const canKeepCurrentView = section === "inventory" && resolvedSection === section;
  const isStartingRequest = loadState.key !== requestKey;
  const isUpdating = required
    && canKeepCurrentView
    && (isStartingRequest || loadState.status === "loading" || loadState.status === "refreshing");

  if (required && !canKeepCurrentView && (isStartingRequest || loadState.status === "loading")) {
    return (
      <section aria-busy="true" aria-label="Cargando vista" className="animate-pulse py-10">
        <div className="h-3 w-28 bg-app-border" />
        <div className="mt-5 h-12 max-w-xl bg-app-border" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div className="h-32 border border-app-border bg-white" key={item} />)}
        </div>
        <div className="mt-6 h-72 border border-app-border bg-white" />
      </section>
    );
  }

  if (required && loadState.status === "error") {
    return (
      <section className="py-10">
        <EmptyState icon={AlertTriangle} title={loadState.error || "No se pudo cargar esta vista."} />
        <Button className="mt-4" onClick={() => setRetryKey((value) => value + 1)} variant="secondary">
          Reintentar
        </Button>
      </section>
    );
  }

  return (
    <>
      {required && loadState.key === requestKey && loadState.status === "stale" ? (
        <div aria-live="polite" className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-app-border py-3 text-xs text-app-muted">
          <span>{loadState.error} Mostrando la última información disponible.</span>
          <Button className="h-8 px-3 text-xs" onClick={refresh} variant="ghost">Reintentar</Button>
        </div>
      ) : null}
      <ViewDataRefreshContext.Provider value={{ isUpdating, refresh }}>
        <div
          aria-busy={isUpdating}
          className={cn(
            "transition-opacity duration-150",
            isUpdating && "opacity-70"
          )}
        >
          {children}
        </div>
      </ViewDataRefreshContext.Provider>
    </>
  );
}

export function AppShell() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const currentUser = useGreenhouseStore((state) => state.currentUser);
  const organization = useGreenhouseStore((state) => state.organization);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const tasks = useGreenhouseStore((state) => state.tasks);
  const pestAlerts = useGreenhouseStore((state) => state.pestAlerts);
  const setActiveSection = useGreenhouseStore((state) => state.setActiveSection);
  const activeRoute = useMemo(
    () => parseAppRoute(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams]
  );
  const routeAccessDenied = Boolean(
    organization.id
    && activeRoute.organizationSlug
    && activeRoute.organizationSlug !== organizationRouteSlug(organization.slug ?? organization.name)
  );
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotRunning, setCopilotRunning] = useState(false);
  const [copilotNotice, setCopilotNotice] = useState<{ tone: "green" | "red"; message: string } | null>(null);
  const [remoteCopilotInsights, setRemoteCopilotInsights] = useState<CopilotInsight[]>([]);
  const [copilotConversationId, setCopilotConversationId] = useState<string | null>(null);
  const [copilotChatMessages, setCopilotChatMessages] = useState<CopilotChatMessage[]>([]);
  const [operationRefreshKey, setOperationRefreshKey] = useState(0);
  const [pendingCompletionTask, setPendingCompletionTask] = useState<{ id: string; date: string } | null>(null);
  const [pendingOpenWork, setPendingOpenWork] = useState<{ id: string; intent: "details" | "evidence" } | null>(null);
  const activeLabel = navigationItemsForRole(currentUser.role).find((item) => item.id === activeSection)?.label ?? "Inicio";
  const setOperationWeek = useCallback((weekStart: string) => {
    router.push(appRoute(organization.slug ?? organization.name, {
      section: "calendar",
      greenhouseId: selectedGreenhouseId,
      weekStart,
      operationView: activeRoute.operationView
    }));
  }, [activeRoute.operationView, organization.name, organization.slug, router, selectedGreenhouseId]);
  const setOperationView = useCallback((operationView: "calendar" | "plan" | "execution" | "verification" | "history") => {
    router.push(appRoute(organization.slug ?? organization.name, {
      section: "calendar",
      greenhouseId: selectedGreenhouseId,
      weekStart: activeRoute.weekStart,
      operationView
    }));
  }, [activeRoute.weekStart, organization.name, organization.slug, router, selectedGreenhouseId]);
  const localCopilotInsights = useMemo(
    () =>
      buildCopilotPulse({
        activeGreenhouseId: selectedGreenhouseId === "__all__" ? null : selectedGreenhouseId || null,
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

  const mapChatEvidence = (rows: any[] = []) =>
    rows.map((row) => ({
      label: row.label ?? "Evidencia",
      value: row.value ?? ""
    })).filter((row) => row.value);

  const mapSuggestedActions = (rows: any[] = []): CopilotSuggestedAction[] =>
    rows.map((row, index) => ({
      id: row.id ?? `chat-action-${index}`,
      kind: row.kind ?? "review",
      title: row.title ?? "Accion sugerida",
      detail: row.detail ?? "Revisar evidencia antes de actuar.",
      severity: row.severity ?? "medium",
      recommendedAction: row.recommended_action ?? row.recommendedAction ?? null,
      sourceType: row.source_type ?? row.sourceType ?? "operation",
      sourceId: row.source_id ?? row.sourceId ?? null,
      greenhouseId: row.greenhouse_id ?? row.greenhouseId ?? null,
      evidence: mapChatEvidence(row.evidence ?? [])
    }));

  const mapChatMessage = (row: any): CopilotChatMessage => ({
    id: row.id ?? `chat-${Date.now()}`,
    role: row.role ?? "assistant",
    content: row.content ?? "",
    evidence: mapChatEvidence(row.evidence ?? []),
    suggestedActions: mapSuggestedActions(row.suggested_actions ?? row.suggestedActions ?? []),
    source: row.metadata?.source ?? row.source
  });

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
          greenhouse_id: selectedGreenhouseId === "__all__" ? null : selectedGreenhouseId || null
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

  const sendCopilotMessage = async (message: string) => {
    if (!organization.id) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setCopilotNotice({ tone: "red", message: "No se pudo conectar con Supabase para conversar con Mira." });
      return;
    }

    const userMessage: CopilotChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: message,
      evidence: [],
      suggestedActions: []
    };

    setCopilotChatMessages((current) => [...current, userMessage]);
    setCopilotRunning(true);
    setCopilotNotice(null);

    try {
      const { data, error } = await supabase.functions.invoke("mira-chat", {
        body: {
          company_id: organization.id,
          greenhouse_id: selectedGreenhouseId === "__all__" ? null : selectedGreenhouseId || null,
          conversation_id: copilotConversationId,
          message
        }
      });
      if (error) throw error;
      if (data?.conversation_id) setCopilotConversationId(data.conversation_id);
      const assistantMessage = mapChatMessage(data?.message ?? {});
      setCopilotChatMessages((current) => [...current, assistantMessage]);
      setCopilotNotice({
        tone: "green",
        message: data?.source === "openai" ? "Mira respondio con contexto operativo." : "Mira respondio con lectura local."
      });
    } catch (caught) {
      setCopilotNotice({
        tone: "red",
        message: appErrorMessage(caught, "No se pudo conversar con Mira. El pulso local sigue disponible.")
      });
    } finally {
      setCopilotRunning(false);
    }
  };

  const dismissCopilotChatAction = (actionId: string) => {
    setCopilotChatMessages((current) =>
      current.map((message) => ({
        ...message,
        suggestedActions: message.suggestedActions.filter((action) => action.id !== actionId)
      }))
    );
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
      greenhouse_id: insight.greenhouseId ?? (selectedGreenhouseId === "__all__" ? null : selectedGreenhouseId),
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
      setCopilotNotice({ tone: "red", message: "No se pudo conectar con Supabase para crear el seguimiento." });
      return;
    }

    const targetGreenhouseId = insight.greenhouseId || (selectedGreenhouseId === "__all__" ? "" : selectedGreenhouseId);
    const targetGreenhouse = greenhouses.find((greenhouse) => greenhouse.id === targetGreenhouseId);

    if (!targetGreenhouseId || !targetGreenhouse) {
      setCopilotNotice({ tone: "red", message: "Selecciona un invernadero para crear el seguimiento." });
      return;
    }

    if ((!targetGreenhouse.managerUserId && !targetGreenhouse.managerStaffId) || targetGreenhouse.manager === "Sin encargado") {
      setCopilotNotice({ tone: "red", message: "Asigna un encargado activo al invernadero antes de crear el seguimiento." });
      return;
    }

    const scheduledDate = localDateKey();
    const weekStart = dateKey(startOfIsoWeek());
    const title = `Seguimiento: ${insight.title}`;
    const instructions = `${insight.detail}\n\nAccion sugerida por Mira Copilot: ${insight.recommendedAction}`;

    const existingResponse = await supabase
      .from("tasks")
      .select("id")
      .eq("company_id", organization.id)
      .eq("greenhouse_id", targetGreenhouseId)
      .eq("title", title)
      .eq("scheduled_date", scheduledDate)
      .neq("status", "cancelada")
      .limit(1);

    if (existingResponse.error) {
      setCopilotNotice({
        tone: "red",
        message: appErrorMessage(existingResponse.error, "No se pudo revisar si el seguimiento ya existe.")
      });
      return;
    }

    if (existingResponse.data?.length) {
      setActiveSection("calendar");
      setCopilotOpen(false);
      setOperationRefreshKey((current) => current + 1);
      setCopilotNotice({ tone: "green", message: "Ese seguimiento ya existe en Operación." });
      return;
    }

    const { error } = await supabase.rpc("create_operational_task_with_staff", {
      target_company_id: organization.id,
      target_week_start: weekStart,
      target_greenhouse_id: targetGreenhouseId,
      target_type: "otro",
      target_title: title,
      target_scheduled_date: scheduledDate,
      target_scheduled_time: null,
      target_priority: insight.severity === "critical" || insight.severity === "high" ? "high" : "normal",
      target_instructions: instructions,
      target_execution_mode: "manager",
      target_crew_size: null,
      target_assignee_ids: targetGreenhouse.managerUserId ? [targetGreenhouse.managerUserId] : [],
      target_staff_assignee_ids: targetGreenhouse.managerStaffId ? [targetGreenhouse.managerStaffId] : [],
      target_materials: [],
      target_technical_plan: {}
    });

    if (error) {
      setCopilotNotice({
        tone: "red",
        message: appErrorMessage(error, "No se pudo crear el seguimiento en Operación.")
      });
      return;
    }

    setActiveSection("calendar");
    setCopilotOpen(false);
    setOperationRefreshKey((current) => current + 1);
    setCopilotNotice({ tone: "green", message: "Seguimiento creado en Operación." });
  };

  return (
    <div className="min-h-screen bg-app-background text-app-text">
      <a
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-app-green px-4 py-3 text-sm font-medium text-white shadow-lg focus:not-sr-only focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-app-green"
        href="#main-content"
      >
        Saltar al contenido
      </a>
      <RouteSync />
      <div className="flex min-h-screen">
        <Sidebar onOpenTelegram={() => setTelegramOpen(true)} />
        <div className="min-w-0 flex-1">
          <Topbar
            copilotInsightCount={copilotInsights.length}
            onOpenCopilot={miraCopilotEnabled ? () => setCopilotOpen(true) : undefined}
          />
          <main className="mx-auto w-full max-w-[1500px] scroll-mt-20 px-4 pb-24 pt-5 lg:px-6 lg:pb-5" id="main-content">
            <div className="mb-4 lg:hidden">
              <p className="text-xs font-medium uppercase text-app-muted">{activeLabel}</p>
              <MiraBrand className="mt-1" markClassName="h-5 w-8" wordClassName="text-lg tracking-[0.34em]" />
            </div>
            {copilotNotice ? <InlineNotice tone={copilotNotice.tone}>{copilotNotice.message}</InlineNotice> : null}
            {routeAccessDenied ? (
              <ActiveOrganizationRouteAccessDenied />
            ) : (
              <ViewDataBoundary entity={activeRoute.entity} list={activeRoute.list}>
                {activeRoute.entity ? (
                  <EntityRouteView route={activeRoute.entity} />
                ) : (
                  <ActiveSection
                    copilotInsights={miraCopilotEnabled ? copilotInsights : []}
                    operationRefreshKey={operationRefreshKey}
                    operationWeekStart={activeRoute.weekStart}
                    operationView={activeRoute.operationView}
                    inventoryView={activeRoute.inventoryView}
                    onOperationWeekChange={setOperationWeek}
                    onOperationViewChange={setOperationView}
                    pendingCompletionTask={pendingCompletionTask}
                    onPendingCompletionConsumed={() => setPendingCompletionTask(null)}
                    pendingOpenWork={pendingOpenWork}
                    onPendingOpenWorkConsumed={() => setPendingOpenWork(null)}
                    onOpenWork={(taskId, view, intent) => {
                      const targetTask = tasks.find((task) => task.id === taskId);
                      if (!targetTask) {
                        setActiveSection("calendar");
                        return;
                      }
                      setPendingOpenWork({ id: taskId, intent });
                      router.push(appRoute(organization.slug ?? organization.name, {
                        section: "calendar",
                        greenhouseId: targetTask.greenhouseId,
                        weekStart: dateKey(startOfIsoWeek(new Date(`${targetTask.date}T12:00:00`))),
                        operationView: view
                      }));
                    }}
                    onRequestTechnicalCompletion={(task) => {
                      setPendingCompletionTask({ id: task.id, date: task.date });
                      setActiveSection("calendar");
                      setOperationRefreshKey((current) => current + 1);
                    }}
                    onCreateCopilotTask={createCopilotTaskSuggestion}
                    onOpenCopilot={() => setCopilotOpen(true)}
                    onPrepareCopilotMessage={prepareCopilotMessage}
                  />
                )}
              </ViewDataBoundary>
            )}
          </main>
        </div>
      </div>
      <MobileNav onOpenTelegram={() => setTelegramOpen(true)} />
      <RecordModal onSaved={() => setOperationRefreshKey((current) => current + 1)} />
      {currentUser.role === "manager" ? (
        <TelegramConnectionModal onClose={() => setTelegramOpen(false)} open={telegramOpen} />
      ) : null}
      {miraCopilotEnabled ? <MiraCopilotPanel
        chatMessages={copilotChatMessages}
        insights={copilotInsights}
        isRunning={copilotRunning}
        onClose={() => setCopilotOpen(false)}
        onCreateTask={createCopilotTaskSuggestion}
        onDismissChatAction={dismissCopilotChatAction}
        onOpenOperations={() => {
          setActiveSection("calendar");
          setCopilotOpen(false);
        }}
        onPrepareMessage={prepareCopilotMessage}
        onRun={runCopilot}
        onSendMessage={sendCopilotMessage}
        open={copilotOpen}
      /> : null}
    </div>
  );
}
