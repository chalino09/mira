import type { CropStage, Greenhouse } from "../types/index.ts";

export type CropCycle = {
  id: string;
  greenhouseId: string;
  cropId: string;
  variety: string;
  transplantDate: string;
  plants: number;
  stemCount: 1 | 2 | null;
  isGrafted: boolean | null;
  status: "active" | "closed" | "cancelled";
  startedAt: string;
  endedAt: string;
  notes: string;
  budgetAmount: number | null;
  beds: number;
  stage: CropStage;
  updatedAt: string;
};

export const cycleResources = [
  { table: "harvest_records", label: "Cosechas", date: "occurred_at", description: "destination", columns: "id, crop_cycle_id, occurred_at, kilograms, destination, notes" },
  { table: "cost_records", label: "Gastos", date: "occurred_at", description: "category", columns: "id, crop_cycle_id, occurred_at, category, amount, notes" },
  { table: "tasks", label: "Actividades", date: "scheduled_date", description: "title", columns: "id, crop_cycle_id, scheduled_date, title, status" },
  { table: "irrigation_records", label: "Riegos", date: "occurred_at", description: "sector", columns: "id, crop_cycle_id, occurred_at, sector, estimated_liters, notes" },
  { table: "nutrition_records", label: "Nutrición", date: "occurred_at", description: "product_name", columns: "id, crop_cycle_id, occurred_at, product_name, dose, notes" },
  { table: "application_records", label: "Aplicaciones", date: "occurred_at", description: "product_name", columns: "id, crop_cycle_id, occurred_at, product_name, dose, notes" },
  { table: "pest_alerts", label: "Plagas", date: "detected_at", description: "problem", columns: "id, crop_cycle_id, detected_at, problem, severity" },
  { table: "nutrition_monitoring_events", label: "Monitoreos", date: "sample_date", description: "source_label", columns: "id, crop_cycle_id, sample_date, source_label, notes" },
  { table: "technical_lab_studies", label: "Laboratorio", date: "sample_date", description: "study_type", columns: "id, crop_cycle_id, sample_date, study_type, lab_name, notes" }
] as const;

export type CycleResource = typeof cycleResources[number];
export type CycleTotal = { cycleId: string | null; resource: string; count: number; kilograms: number; expenses: number; income: number };

export function cycleTotalsFor(totals: CycleTotal[], cycleId: string | null) {
  return totals.filter((total) => total.cycleId === cycleId).reduce((result, total) => ({
    count: result.count + (total.resource === "sales" ? 0 : Number(total.count)),
    kilograms: result.kilograms + Number(total.kilograms),
    expenses: result.expenses + Number(total.expenses),
    income: result.income + Number(total.income)
  }), { count: 0, kilograms: 0, expenses: 0, income: 0 });
}

export function mapCropCycle(row: Record<string, any>): CropCycle {
  const stages: Record<string, CropStage> = { vegetativo: "Vegetativo", floracion: "Floración", cuajado: "Cuajado", produccion: "Producción" };
  return {
    id: row.id, greenhouseId: row.greenhouse_id, cropId: row.crop_id, variety: row.variety ?? "",
    transplantDate: row.transplant_date ?? "", plants: row.plants_count ?? 0,
    stemCount: row.stem_count ?? null, isGrafted: row.is_grafted ?? null,
    status: row.status, startedAt: row.started_at ?? "", endedAt: row.ended_at ?? "", notes: row.notes ?? "",
    budgetAmount: row.budget_amount == null ? null : Number(row.budget_amount), beds: row.beds_count ?? 0,
    stage: stages[row.crop_stage] ?? "Vegetativo", updatedAt: row.updated_at ?? ""
  };
}

/** Cycles arrive newest first. Status, never age, determines the active cycle. */
export function summarizeGreenhouseCycles(cycles: CropCycle[], greenhouseId: string) {
  const history = cycles.filter((cycle) => cycle.greenhouseId === greenhouseId);
  const active = history.find((cycle) => cycle.status === "active");
  const latest = active ?? history[0];
  return { active, latest, number: latest ? history.length - history.indexOf(latest) : 0 };
}

export function greenhouseForCycle(greenhouse: Greenhouse, cycle: CropCycle, referenceDate?: string): Greenhouse {
  const date = cycle.transplantDate;
  const referenceTime = referenceDate ? new Date(`${referenceDate}T12:00:00`).getTime() : Date.now();
  return {
    ...greenhouse, cropId: cycle.cropId, variety: cycle.variety, transplantDate: date,
    plants: cycle.plants, stemCount: cycle.stemCount, isGrafted: cycle.isGrafted,
    budgetAmount: cycle.budgetAmount, beds: cycle.beds, stage: cycle.stage,
    daysSinceTransplant: date ? Math.max(0, Math.round((referenceTime - new Date(`${date}T12:00:00`).getTime()) / 86400000)) : 0
  };
}

/** Suggestions never assign records. Unknown dates cannot establish membership. */
export function suggestedCycleForDate(cycles: CropCycle[], date: string): string | null {
  if (!date) return null;
  const matches = cycles.filter((cycle) => {
    const start = cycle.startedAt || cycle.transplantDate;
    if (!start || date < start || cycle.status === "cancelled") return false;
    // A closed cycle with no end date is deliberately uncertain.
    if (cycle.status === "closed" && (!cycle.endedAt || date > cycle.endedAt)) return false;
    return !cycle.endedAt || date <= cycle.endedAt;
  });
  return matches.length === 1 ? matches[0].id : null;
}
