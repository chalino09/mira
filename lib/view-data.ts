import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, startOfIsoWeek } from "@/lib/date";
import { publicEntityId, type EntityRoute, type ListQueryState } from "@/lib/routes";
import { createPrivateCompanyFileUrls } from "@/lib/storage";
import type { ViewDataMeta, WorkspaceViewData } from "@/lib/store";
import type {
  ApplicationRecord,
  ContextPeriod,
  CostRecord,
  HarvestRecord,
  IrrigationRecord,
  NutritionRecord,
  PestAlert,
  RiskLevel,
  SectionId,
  Task,
  TaskType,
  ViewOperationalAggregates
} from "@/types";

const TASK_COLUMNS = "id, greenhouse_id, type, title, scheduled_date, scheduled_time, status, technical_plan";
const IRRIGATION_COLUMNS = "id, source_task_id, greenhouse_id, occurred_at, duration_min, estimated_liters, sector, ph, ec, notes";
const NUTRITION_COLUMNS = "id, source_task_id, greenhouse_id, occurred_at, product_name, dose, method, ph, ec, crop_stage, objective, notes";
const APPLICATION_COLUMNS = "id, source_task_id, greenhouse_id, occurred_at, category, product_name, composition, dose, applied_area, safety_interval, reentry_interval, notes";
const PEST_COLUMNS = "id, public_id, greenhouse_id, problem, severity, affected_zone, detected_at, action_taken, follow_up, case_status, photo_storage_path, photo_url";
const PEST_UPDATE_COLUMNS = "id, pest_alert_id, greenhouse_id, update_status, severity, action_type, notes, next_review_date, photo_storage_path, created_at";
const HARVEST_COLUMNS = "id, public_id, source_task_id, greenhouse_id, occurred_at, kilograms, box_count, box_weight_kg, first_quality_kg, second_quality_kg, third_quality_kg, merma_kg, discard_kg, first_quality_boxes, second_quality_boxes, third_quality_boxes, merma_boxes, first_quality_price, second_quality_price, third_quality_price, estimated_price, destination, notes";
const COST_COLUMNS = "id, greenhouse_id, occurred_at, category, amount, notes";

type ViewDataRequest = {
  supabase: SupabaseClient;
  companyId: string;
  currentUserName: string;
  section: SectionId;
  greenhouseId: string;
  period: ContextPeriod;
  entity?: EntityRoute;
  list?: ListQueryState;
};

export type WorkspaceViewDataResult = {
  data: WorkspaceViewData;
  meta: ViewDataMeta | null;
};

const PAGE_SIZE = 25;

export function requiresWorkspaceViewData(section: SectionId, entity?: EntityRoute) {
  if (entity) return entity.type === "pestCase" || entity.type === "harvestLot";
  return ["overview", "records", "pests", "costs", "reports"].includes(section);
}

function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function periodBounds(period: ContextPeriod) {
  if (period === "all") return null;
  const today = new Date();
  if (period === "week") {
    const start = startOfIsoWeek(today);
    return { start: dateKey(start), end: dateKey(addDays(start, 6)) };
  }
  return {
    start: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: dateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  };
}

function overviewBounds() {
  const today = new Date();
  return {
    start: dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: dateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    today: dateKey(today)
  };
}

function withScope(query: any, greenhouseId: string) {
  return greenhouseId && greenhouseId !== "__all__" ? query.eq("greenhouse_id", greenhouseId) : query;
}

function withPeriod(query: any, column: string, period: ContextPeriod) {
  const bounds = periodBounds(period);
  return bounds ? query.gte(column, bounds.start).lte(column, bounds.end) : query;
}

function safeSearch(value?: string) {
  return value?.replace(/[%(),]/g, " ").trim() ?? "";
}

function withPage(query: any, page: number) {
  const from = (page - 1) * PAGE_SIZE;
  return query.range(from, from + PAGE_SIZE - 1);
}

function uuidFromPublicId(value: string) {
  const compact = value.replace(/^[^-]+-/, "");
  if (!/^[a-f\d]{32}$/i.test(compact)) return null;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function mapRiskLevel(level?: string | null): RiskLevel {
  if (level === "media") return "Media";
  if (level === "alta") return "Alta";
  return "Baja";
}

function mapCropStage(stage?: string | null) {
  if (stage === "floracion") return "Floración" as const;
  if (stage === "cuajado") return "Cuajado" as const;
  if (stage === "produccion") return "Producción" as const;
  return "Vegetativo" as const;
}

function mapTaskType(type?: string | null, technicalPlan?: Record<string, any> | null): TaskType {
  const labels: Record<string, TaskType> = {
    riego: "Riego", fertirriego: "Fertirriego", fertilizacion: "Fertilización",
    aplicacion_foliar: "Aplicación foliar", revision_plagas: "Revisión de plagas y enfermedades",
    poda: "Deschuponado", tutoreo: "Manejo de rafia", deshoje: "Deshoje", cosecha: "Cosecha",
    limpieza: "Limpieza", mantenimiento: "Mantenimiento",
    otro: technicalPlan?.cycleWorkType ? "Preparación de ciclo" : "Otra"
  };
  return labels[type ?? ""] ?? "Otra";
}

function mapTaskStatus(status?: string | null): Task["status"] {
  if (status === "en_progreso") return "En ejecución";
  if (status === "bloqueada") return "Bloqueada";
  if (status === "completada") return "Completada";
  if (status === "verificada") return "Verificada";
  if (status === "cancelada") return "Cancelada";
  return "Pendiente";
}

function mapApplicationCategory(category?: string | null): ApplicationRecord["category"] {
  const labels: Record<string, ApplicationRecord["category"]> = {
    fertilizante: "Fertilizante", bioestimulante: "Bioestimulante", corrector: "Corrector",
    acondicionador_agua: "Acondicionador de agua", adyuvante_coadyuvante: "Adyuvante / Coadyuvante",
    microorganismos: "Microorganismos", fungicida: "Fungicida", insecticida: "Insecticida",
    acaricida: "Acaricida", nematicida: "Nematicida", bactericida: "Bactericida",
    sanitizante_desinfectante: "Sanitizante / Desinfectante", regulador_crecimiento: "Regulador de crecimiento"
  };
  return labels[category ?? ""] ?? "Bioestimulante";
}

function mapCostCategory(category?: string | null): CostRecord["category"] {
  const labels: Record<string, CostRecord["category"]> = {
    mano_obra: "Mano de obra", fertilizantes: "Fertilizantes", agroinsumos: "Agroinsumos",
    agua: "Agua", energia: "Energía", plasticos: "Plásticos", mantenimiento: "Mantenimiento",
    transporte: "Transporte", refrescos: "Refrescos", renta: "Renta", gasolina: "Gasolina"
  };
  return labels[category ?? ""] ?? "Agroinsumos";
}

function mapRows(rows: Record<string, any[]>, currentUserName: string): WorkspaceViewData {
  const tasks: Task[] = (rows.tasks ?? []).map((row) => ({
    id: row.id, greenhouseId: row.greenhouse_id, type: mapTaskType(row.type, row.technical_plan),
    title: row.title, date: row.scheduled_date, time: row.scheduled_time?.slice(0, 5) ?? "",
    status: mapTaskStatus(row.status), responsible: currentUserName
  }));
  const irrigationRecords: IrrigationRecord[] = (rows.irrigation ?? []).map((row) => ({
    id: row.id, sourceTaskId: row.source_task_id ?? undefined, greenhouseId: row.greenhouse_id,
    date: row.occurred_at, durationMin: row.duration_min ?? 0, liters: Number(row.estimated_liters ?? 0),
    sector: row.sector ?? "", ph: row.ph == null ? null : Number(row.ph), ec: row.ec == null ? null : Number(row.ec),
    notes: row.notes ?? "", responsible: currentUserName
  }));
  const nutritionRecords: NutritionRecord[] = (rows.nutrition ?? []).map((row) => ({
    id: row.id, sourceTaskId: row.source_task_id ?? undefined, greenhouseId: row.greenhouse_id,
    date: row.occurred_at, product: row.product_name, dose: row.dose,
    method: row.method === "foliar" ? "Foliar" : row.method === "drench" ? "Drench" : "Fertirriego",
    ph: Number(row.ph ?? 0), ec: Number(row.ec ?? 0), stage: mapCropStage(row.crop_stage),
    objective: row.objective === "desarrollo" ? "Desarrollo" : row.objective === "floracion" ? "Floración" : row.objective === "cuajado" ? "Cuajado" : row.objective === "engorde" ? "Engorde" : row.objective === "calidad" ? "Calidad" : "Raíz",
    notes: row.notes ?? ""
  }));
  const applicationRecords: ApplicationRecord[] = (rows.applications ?? []).map((row) => ({
    id: row.id, sourceTaskId: row.source_task_id ?? undefined, greenhouseId: row.greenhouse_id,
    date: row.occurred_at, category: mapApplicationCategory(row.category), product: row.product_name,
    composition: row.composition ?? "", dose: row.dose, area: row.applied_area ?? "",
    responsible: currentUserName, safetyInterval: row.safety_interval ?? "", reentry: row.reentry_interval ?? "",
    notes: row.notes ?? ""
  }));
  const harvestRecords: HarvestRecord[] = (rows.harvests ?? []).map((row) => ({
    id: row.id, publicId: row.public_id ?? publicEntityId("lot", row.id), sourceTaskId: row.source_task_id ?? undefined,
    greenhouseId: row.greenhouse_id, date: row.occurred_at, kilograms: Number(row.kilograms ?? 0),
    boxCount: Number(row.box_count ?? 0), boxWeightKg: Number(row.box_weight_kg ?? 20),
    firstQuality: Number(row.first_quality_kg ?? 0), secondQuality: Number(row.second_quality_kg ?? 0),
    thirdQuality: Number(row.third_quality_kg ?? 0), merma: Number(row.merma_kg ?? row.discard_kg ?? 0),
    firstQualityBoxes: Number(row.first_quality_boxes ?? 0), secondQualityBoxes: Number(row.second_quality_boxes ?? 0),
    thirdQualityBoxes: Number(row.third_quality_boxes ?? 0), mermaBoxes: Number(row.merma_boxes ?? row.discard_boxes ?? 0),
    firstQualityPrice: Number(row.first_quality_price ?? 0), secondQualityPrice: Number(row.second_quality_price ?? 0),
    thirdQualityPrice: Number(row.third_quality_price ?? 0), estimatedPrice: Number(row.estimated_price ?? 0),
    destination: row.destination ?? "", notes: row.notes ?? ""
  }));
  const costRecords: CostRecord[] = (rows.costs ?? []).map((row) => ({
    id: row.id, greenhouseId: row.greenhouse_id ?? "", date: row.occurred_at,
    category: mapCostCategory(row.category), amount: Number(row.amount ?? 0), notes: row.notes ?? ""
  }));
  const costListRecords: CostRecord[] = (rows.costList ?? []).map((row) => ({
    id: row.id, greenhouseId: row.greenhouse_id ?? "", date: row.occurred_at,
    category: mapCostCategory(row.category), amount: Number(row.amount ?? 0), notes: row.notes ?? ""
  }));
  return { tasks, irrigationRecords, nutritionRecords, applicationRecords, harvestRecords, costRecords, costListRecords };
}

async function mapPests(supabase: SupabaseClient, pestRows: any[], updateRows: any[]): Promise<PestAlert[]> {
  const paths = [...pestRows, ...updateRows].map((row) => String(row.photo_storage_path ?? "").trim()).filter(Boolean);
  const urls = paths.length ? await createPrivateCompanyFileUrls({ bucket: "pest-photos", paths, supabase }) : new Map<string, string>();
  const updatesByAlert = new Map<string, any[]>();
  updateRows.forEach((row) => updatesByAlert.set(row.pest_alert_id, [...(updatesByAlert.get(row.pest_alert_id) ?? []), row]));
  return pestRows.map((row) => ({
    id: row.id, publicId: row.public_id ?? publicEntityId("pest", row.id), greenhouseId: row.greenhouse_id,
    problem: row.problem, severity: mapRiskLevel(row.severity), zone: row.affected_zone ?? "", detectedAt: row.detected_at,
    action: row.action_taken ?? "", followUp: row.follow_up ?? "",
    caseStatus: row.case_status === "review_required" ? "Revisión requerida" : row.case_status === "in_management" ? "En manejo" : row.case_status === "under_watch" ? "Bajo vigilancia" : row.case_status === "sanitary_close" ? "Cierre sanitario" : "Abierta",
    photoStoragePath: row.photo_storage_path ?? undefined,
    photoUrl: row.photo_storage_path ? urls.get(row.photo_storage_path) : row.photo_url ?? undefined,
    updates: (updatesByAlert.get(row.id) ?? []).map((update) => ({
      id: update.id, alertId: update.pest_alert_id, greenhouseId: update.greenhouse_id,
      status: update.update_status === "under_observation" ? "En observación" : update.update_status === "treatment_applied" ? "Tratamiento aplicado" : update.update_status === "under_watch" ? "Bajo vigilancia" : update.update_status === "no_progress" ? "Sin avance" : update.update_status === "visible_improvement" ? "Mejoría visible" : update.update_status === "sanitary_close" ? "Cierre sanitario" : "Revisión requerida",
      severity: mapRiskLevel(update.severity),
      actionType: update.action_type === "sanitary_pruning" ? "Poda/deshoje sanitario" : update.action_type === "application" ? "Aplicación" : update.action_type === "cleaning" ? "Limpieza" : update.action_type === "zone_isolation" ? "Aislamiento de zona" : update.action_type === "other" ? "Otro" : "Revisión",
      notes: update.notes ?? "", nextReviewDate: update.next_review_date ?? undefined,
      photoStoragePath: update.photo_storage_path ?? undefined,
      photoUrl: update.photo_storage_path ? urls.get(update.photo_storage_path) : undefined,
      createdAt: update.created_at
    }))
  }));
}

export async function loadWorkspaceViewData(request: ViewDataRequest): Promise<WorkspaceViewDataResult> {
  const { supabase, companyId, currentUserName, section, greenhouseId, period, entity, list = {} } = request;
  const queries: Record<string, any> = {};
  const page = list.page ?? 1;
  let metaResource: ViewDataMeta["resource"] | null = null;
  let metaKey = "";

  if (entity?.type === "harvestLot") {
    const fallbackId = uuidFromPublicId(entity.lotPublicId);
    let query = supabase.from("harvest_records").select(HARVEST_COLUMNS).eq("company_id", companyId);
    query = fallbackId ? query.or(`public_id.eq.${entity.lotPublicId},id.eq.${fallbackId}`) : query.eq("public_id", entity.lotPublicId);
    queries.harvests = query.limit(1);
  } else if (entity?.type === "pestCase") {
    const fallbackId = uuidFromPublicId(entity.pestPublicId);
    let query = supabase.from("pest_alerts").select(PEST_COLUMNS).eq("company_id", companyId);
    query = fallbackId ? query.or(`public_id.eq.${entity.pestPublicId},id.eq.${fallbackId}`) : query.eq("public_id", entity.pestPublicId);
    queries.pests = query.limit(1);
  } else if (section === "overview") {
    const bounds = overviewBounds();
    queries.tasks = withScope(supabase.from("tasks").select(TASK_COLUMNS).eq("company_id", companyId)
      .or(`and(scheduled_date.gte.${bounds.start},scheduled_date.lte.${bounds.end}),and(scheduled_date.lt.${bounds.today},status.in.(pendiente,en_progreso,bloqueada))`), greenhouseId)
      .order("scheduled_date", { ascending: true });
    queries.irrigation = withScope(supabase.from("irrigation_records").select(IRRIGATION_COLUMNS).eq("company_id", companyId), greenhouseId).gte("occurred_at", bounds.start).lte("occurred_at", bounds.end).order("occurred_at", { ascending: false });
    queries.applications = withScope(supabase.from("application_records").select(APPLICATION_COLUMNS).eq("company_id", companyId), greenhouseId).gte("occurred_at", bounds.start).lte("occurred_at", bounds.end).order("occurred_at", { ascending: false });
    queries.pests = withScope(supabase.from("pest_alerts").select(PEST_COLUMNS).eq("company_id", companyId), greenhouseId).gte("detected_at", bounds.start).lte("detected_at", bounds.end).order("detected_at", { ascending: false });
    queries.harvests = withScope(supabase.from("harvest_records").select(HARVEST_COLUMNS).eq("company_id", companyId), greenhouseId).gte("occurred_at", bounds.start).lte("occurred_at", bounds.end).order("occurred_at", { ascending: false });
  } else if (section === "records") {
    const tab = list.tab ?? "applications";
    const search = safeSearch(list.q);
    if (tab === "irrigation") {
      const sort = { date: "occurred_at", duration: "duration_min", liters: "estimated_liters" }[list.sort ?? "date"] ?? "occurred_at";
      let query = withPeriod(withScope(supabase.from("irrigation_records").select(IRRIGATION_COLUMNS, { count: "exact" }).eq("company_id", companyId), greenhouseId), "occurred_at", period);
      if (search) query = query.or(`sector.ilike.%${search}%,notes.ilike.%${search}%`);
      queries.irrigation = withPage(query.order(sort, { ascending: list.dir === "asc" }).order("id", { ascending: list.dir === "asc" }), page);
      metaResource = "irrigation";
      metaKey = "irrigation";
    } else if (tab === "nutrition") {
      const sort = { date: "occurred_at", product: "product_name", method: "method" }[list.sort ?? "date"] ?? "occurred_at";
      let query = withPeriod(withScope(supabase.from("nutrition_records").select(NUTRITION_COLUMNS, { count: "exact" }).eq("company_id", companyId), greenhouseId), "occurred_at", period);
      if (search) query = query.or(`product_name.ilike.%${search}%,notes.ilike.%${search}%`);
      queries.nutrition = withPage(query.order(sort, { ascending: list.dir === "asc" }).order("id", { ascending: list.dir === "asc" }), page);
      metaResource = "nutrition";
      metaKey = "nutrition";
    } else {
      const sort = { date: "occurred_at", product: "product_name", category: "category" }[list.sort ?? "date"] ?? "occurred_at";
      let query = withPeriod(withScope(supabase.from("application_records").select(APPLICATION_COLUMNS, { count: "exact" }).eq("company_id", companyId), greenhouseId), "occurred_at", period);
      if (search) query = query.or(`product_name.ilike.%${search}%,composition.ilike.%${search}%,applied_area.ilike.%${search}%`);
      queries.applications = withPage(query.order(sort, { ascending: list.dir === "asc" }).order("id", { ascending: list.dir === "asc" }), page);
      metaResource = "applications";
      metaKey = "applications";
    }
  } else if (section === "pests") {
    const search = safeSearch(list.q);
    const sort = { date: "detected_at", problem: "problem", severity: "severity" }[list.sort ?? "date"] ?? "detected_at";
    let query = withPeriod(withScope(supabase.from("pest_alerts").select(PEST_COLUMNS, { count: "exact" }).eq("company_id", companyId), greenhouseId), "detected_at", period);
    if (search) query = query.or(`problem.ilike.%${search}%,affected_zone.ilike.%${search}%`);
    if (list.status) query = query.eq("case_status", list.status);
    if (list.severity) query = query.eq("severity", list.severity);
    queries.pests = withPage(query.order(sort, { ascending: list.dir === "asc" }).order("id", { ascending: list.dir === "asc" }), page);
    metaResource = "pests";
    metaKey = "pests";
  } else if (section === "costs") {
    const search = safeSearch(list.q);
    const sort = { date: "occurred_at", category: "category", amount: "amount" }[list.sort ?? "date"] ?? "occurred_at";
    let listQuery = withPeriod(withScope(supabase.from("cost_records").select(COST_COLUMNS, { count: "exact" }).eq("company_id", companyId), greenhouseId), "occurred_at", period);
    if (search) listQuery = listQuery.ilike("notes", `%${search}%`);
    if (list.status) listQuery = listQuery.eq("category", list.status);
    queries.costList = withPage(listQuery.order(sort, { ascending: list.dir === "asc" }).order("id", { ascending: list.dir === "asc" }), page);
    const bounds = periodBounds(period);
    queries.aggregates = supabase.rpc("get_view_operational_aggregates", {
      target_company_id: companyId,
      target_greenhouse_id: greenhouseId === "__all__" ? null : greenhouseId,
      target_start_date: bounds?.start ?? null,
      target_end_date: bounds?.end ?? null
    });
    metaResource = "costs";
    metaKey = "costList";
  } else if (section === "reports") {
    const bounds = periodBounds(period);
    queries.aggregates = supabase.rpc("get_view_operational_aggregates", {
      target_company_id: companyId,
      target_greenhouse_id: greenhouseId === "__all__" ? null : greenhouseId,
      target_start_date: bounds?.start ?? null,
      target_end_date: bounds?.end ?? null
    });
  }

  const entries = await Promise.all(Object.entries(queries).map(async ([key, query]) => [key, await query] as const));
  const rows: Record<string, any[]> = {};
  const counts: Record<string, number> = {};
  let rawAggregates: Record<string, any> | null = null;
  for (const [key, response] of entries) {
    if (response.error) throw response.error;
    if (key === "aggregates") {
      rawAggregates = response.data ?? null;
      continue;
    }
    rows[key] = response.data ?? [];
    if (typeof response.count === "number") counts[key] = response.count;
  }

  let pestAlerts: PestAlert[] | undefined;
  if (rows.pests) {
    const ids = rows.pests.map((row) => row.id);
    let updateRows: any[] = [];
    if (ids.length) {
      const response = await supabase.from("pest_alert_updates").select(PEST_UPDATE_COLUMNS).eq("company_id", companyId).in("pest_alert_id", ids).order("created_at", { ascending: false });
      if (response.error && !["42P01", "PGRST205"].includes(response.error.code ?? "")) throw response.error;
      updateRows = response.error ? [] : response.data ?? [];
    }
    pestAlerts = await mapPests(supabase, rows.pests, updateRows);
  }

  const data = mapRows(rows, currentUserName);
  if (rawAggregates) {
    const aggregates: ViewOperationalAggregates = {
      totalCost: Number(rawAggregates.totalCost ?? 0),
      costByCategory: (rawAggregates.costByCategory ?? []).map((item: any) => ({
        category: mapCostCategory(item.category),
        amount: Number(item.amount ?? 0)
      })),
      totalHarvestKg: Number(rawAggregates.totalHarvestKg ?? 0),
      totalHarvestBoxes: Number(rawAggregates.totalHarvestBoxes ?? 0),
      commercialKg: Number(rawAggregates.commercialKg ?? 0),
      estimatedRevenue: Number(rawAggregates.estimatedRevenue ?? 0),
      averagePrice: Number(rawAggregates.averagePrice ?? 0),
      harvestDaily: (rawAggregates.harvestDaily ?? []).map((item: any) => ({ date: item.date, kg: Number(item.kg ?? 0) })),
      totalIrrigationLiters: Number(rawAggregates.totalIrrigationLiters ?? 0),
      averageIrrigationDuration: Number(rawAggregates.averageIrrigationDuration ?? 0),
      averageEc: rawAggregates.averageEc == null ? null : Number(rawAggregates.averageEc),
      irrigationDaily: (rawAggregates.irrigationDaily ?? []).map((item: any) => ({ date: item.date, liters: Number(item.liters ?? 0) }))
    };
    data.viewAggregates = aggregates;
  }
  if (pestAlerts) data.pestAlerts = pestAlerts;
  if (section === "overview" && !entity) {
    data.activities = [
      ...(data.harvestRecords ?? []).slice(0, 2).map((record) => ({ id: `activity-harvest-${record.id}`, greenhouseId: record.greenhouseId, title: "Cosecha registrada", detail: `${record.kilograms.toLocaleString("es-MX")} kg`, time: record.date })),
      ...(data.irrigationRecords ?? []).slice(0, 2).map((record) => ({ id: `activity-irrigation-${record.id}`, greenhouseId: record.greenhouseId, title: "Riego registrado", detail: `${record.liters.toLocaleString("es-MX")} L`, time: record.date }))
    ];
  }
  return {
    data,
    meta: metaResource ? { resource: metaResource, page, pageSize: PAGE_SIZE, total: counts[metaKey] ?? rows[metaKey]?.length ?? 0 } : null
  };
}
