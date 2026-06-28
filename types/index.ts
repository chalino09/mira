import type { LucideIcon } from "lucide-react";

export type SectionId =
  | "overview"
  | "greenhouses"
  | "calendar"
  | "monitoring"
  | "records"
  | "irrigation"
  | "nutrition"
  | "applications"
  | "pests"
  | "harvest"
  | "costs"
  | "reports"
  | "settings";

export type CropStage = "Floración" | "Cuajado" | "Producción" | "Vegetativo";
export type RiskLevel = "Baja" | "Media" | "Alta";
export type TaskType =
  | "Riego"
  | "Fertirriego"
  | "Fertilización"
  | "Aplicación foliar"
  | "Revisión de plagas y enfermedades"
  | "Deschuponado"
  | "Manejo de rafia"
  | "Deshoje"
  | "Cosecha"
  | "Limpieza"
  | "Mantenimiento"
  | "Preparación de ciclo"
  | "Otra";

export type NavigationItem = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
};

export type UserRole = "owner" | "admin" | "manager";

export type Organization = {
  id: string;
  name: string;
  legalName?: string;
  logoUrl?: string;
};

export type CropCatalogItem = {
  id: string;
  slug: string;
  name: string;
  scientificName: string | null;
  defaultCycleDays: number | null;
  isActive: boolean;
};

export type NutrientKey = "N" | "P2O5" | "K2O" | "CaO" | "MgO";

export type StageNutrientRange = {
  nutrient: NutrientKey;
  min: number;
  max: number;
  display: string;
};

export type CropStageCatalog = {
  id: string;
  cropId: string;
  number: number;
  label: string;
  name: string;
  ddtStart: number;
  ddtEnd: number;
  durationDays: number;
  fertilizerUnitRanges: StageNutrientRange[];
};

export type CurrentUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
};

export type Greenhouse = {
  id: string;
  name: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  surfaceM2: number | null;
  surface: string;
  budgetAmount: number | null;
  cropId: string | null;
  variety: string;
  transplantDate: string;
  plants: number;
  stemCount: 1 | 2 | null;
  isGrafted: boolean | null;
  stage: CropStage;
  managerUserId: string | null;
  manager: string;
  beds: number;
  daysSinceTransplant: number;
  healthStatus: RiskLevel;
  temperature: number;
  humidity: number;
  estimatedProductionKg: number;
};

export type Task = {
  id: string;
  greenhouseId: string;
  type: TaskType;
  title: string;
  date: string;
  time: string;
  status: "Pendiente" | "Bloqueada" | "Completada" | "Cancelada";
  responsible: string;
};

export type IrrigationRecord = {
  id: string;
  greenhouseId: string;
  date: string;
  durationMin: number;
  liters: number;
  sector: string;
  ph: number | null;
  ec: number | null;
  notes: string;
  responsible: string;
};

export type NutritionRecord = {
  id: string;
  greenhouseId: string;
  date: string;
  product: string;
  dose: string;
  method: "Fertirriego" | "Foliar" | "Drench";
  ph: number;
  ec: number;
  stage: CropStage;
  objective: "Raíz" | "Floración" | "Cuajado" | "Engorde" | "Calidad";
  notes: string;
};

export type ApplicationRecord = {
  id: string;
  sourceTaskId?: string;
  greenhouseId: string;
  date: string;
  category:
    | "Bioestimulante"
    | "Fungicida"
    | "Insecticida"
    | "Fertilizante"
    | "Microorganismos"
    | "Corrector";
  product: string;
  composition: string;
  dose: string;
  area: string;
  responsible: string;
  safetyInterval: string;
  reentry: string;
  notes: string;
};

export type PestAlert = {
  id: string;
  greenhouseId: string;
  problem: string;
  severity: RiskLevel;
  zone: string;
  detectedAt: string;
  action: string;
  followUp: string;
  caseStatus?: PestCaseStatus;
  photoStoragePath?: string;
  photoUrl?: string;
  updates?: PestAlertUpdate[];
};

export type PestCaseStatus = "Abierta" | "Revisión requerida" | "En manejo" | "Bajo vigilancia" | "Cierre sanitario";

export type PestUpdateStatus =
  | "Revisión requerida"
  | "En observación"
  | "Tratamiento aplicado"
  | "Bajo vigilancia"
  | "Sin avance"
  | "Mejoría visible"
  | "Cierre sanitario";

export type PestActionType =
  | "Revisión"
  | "Poda/deshoje sanitario"
  | "Aplicación"
  | "Limpieza"
  | "Aislamiento de zona"
  | "Otro";

export type PestAlertUpdate = {
  id: string;
  alertId: string;
  greenhouseId: string;
  status: PestUpdateStatus;
  severity: RiskLevel;
  actionType: PestActionType;
  notes: string;
  nextReviewDate?: string;
  photoStoragePath?: string;
  photoUrl?: string;
  createdAt: string;
};

export type HarvestRecord = {
  id: string;
  greenhouseId: string;
  date: string;
  kilograms: number;
  firstQuality: number;
  secondQuality: number;
  discard: number;
  estimatedPrice: number;
  destination: string;
  notes: string;
};

export type CostRecord = {
  id: string;
  greenhouseId: string;
  date: string;
  category:
    | "Mano de obra"
    | "Fertilizantes"
    | "Agroinsumos"
    | "Agua"
    | "Energía"
    | "Plásticos"
    | "Mantenimiento"
    | "Transporte"
    | "Refrescos"
    | "Renta"
    | "Gasolina";
  amount: number;
  notes: string;
};

export type Activity = {
  id: string;
  greenhouseId: string;
  title: string;
  detail: string;
  time: string;
};

export type ModalType =
  | "greenhouse"
  | "editGreenhouse"
  | "task"
  | "irrigation"
  | "nutrition"
  | "application"
  | "pest"
  | "harvest"
  | "cost"
  | null;
