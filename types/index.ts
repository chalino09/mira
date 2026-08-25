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
  | "inventory"
  | "costs"
  | "reports"
  | "settings";

export type ContextPeriod = "week" | "month" | "all";
export type ViewContext = {
  greenhouseId: string;
  period: ContextPeriod;
};

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

export type WorkOrigin = "planned" | "unplanned" | "copilot" | "telegram" | "migrated";
export type WorkStatus = "Pendiente" | "En ejecución" | "Bloqueada" | "Completada" | "Verificada" | "Cancelada";

export type WorkEvent = {
  id: string;
  workId: string;
  type: "created" | "assigned" | "published" | "acknowledged" | "started" | "blocked" | "completed" | "verified" | "reopened" | "cancelled" | "comment" | "question" | "answer";
  note: string | null;
  createdAt: string;
};

export type NavigationItem = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
};

export type UserRole = "owner" | "admin" | "manager";

export type Organization = {
  id: string;
  name: string;
  slug?: string;
  legalName?: string;
  logoUrl?: string;
};

export type OrganizationMembership = {
  id: string;
  companyId: string;
  role: UserRole;
  organization: Organization;
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
  publicId?: string;
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
  managerStaffId: string | null;
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
  status: WorkStatus;
  responsible: string;
};

export type IrrigationRecord = {
  id: string;
  sourceTaskId?: string;
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
  sourceTaskId?: string;
  greenhouseId: string;
  date: string;
  product: string;
  dose: string;
  method: "Fertirriego" | "Foliar" | "Drench";
  ph: number;
  ec: number;
  stage: CropStage;
  objective: "Desarrollo" | "Raíz" | "Floración" | "Cuajado" | "Engorde" | "Calidad";
  notes: string;
};

export type ApplicationRecord = {
  id: string;
  sourceTaskId?: string;
  greenhouseId: string;
  date: string;
  category:
    | "Fertilizante"
    | "Bioestimulante"
    | "Corrector"
    | "Acondicionador de agua"
    | "Adyuvante / Coadyuvante"
    | "Microorganismos"
    | "Fungicida"
    | "Insecticida"
    | "Acaricida"
    | "Nematicida"
    | "Bactericida"
    | "Sanitizante / Desinfectante"
    | "Regulador de crecimiento";
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
  publicId?: string;
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
  publicId?: string;
  sourceTaskId?: string;
  greenhouseId: string;
  date: string;
  kilograms: number;
  boxCount: number;
  boxWeightKg: number;
  firstQuality: number;
  secondQuality: number;
  thirdQuality: number;
  merma: number;
  firstQualityBoxes: number;
  secondQualityBoxes: number;
  thirdQualityBoxes: number;
  mermaBoxes: number;
  firstQualityPrice: number;
  secondQualityPrice: number;
  thirdQualityPrice: number;
  estimatedPrice: number;
  soldBoxes?: number;
  specialBoxes?: number;
  unsoldBoxes?: number;
  grossRevenue?: number;
  commissionAmount?: number;
  freightAmount?: number;
  netRevenue?: number;
  packagingAmount?: number;
  sale?: HarvestSaleDetails;
  destination: string;
  notes: string;
};

export type HarvestSaleLine = {
  quality: "Primera" | "Segunda" | "Tercera";
  boxCount: number;
  grossPricePerBox: number;
};

export type HarvestSaleDetails = {
  id: string;
  buyerName: string;
  date: string;
  commissionPerBox: number;
  freightPerBox: number;
  packagingPerBox: number;
  paymentStatus: "Pendiente" | "Pagada";
  paidAt?: string;
  notes: string;
  lines: HarvestSaleLine[];
};

export type CostRecord = {
  id: string;
  greenhouseId: string;
  date: string;
  category:
    | "Nómina"
    | "Fertilizantes"
    | "Agroinsumos"
    | "Preparación de terreno y maquinaria"
    | "Análisis y laboratorio"
    | "Material vegetal"
    | "Polinización"
    | "Agua"
    | "Energía"
    | "Plásticos"
    | "Mantenimiento"
    | "Transporte"
    | "Refrescos"
    | "Renta"
    | "Material de producción"
    | "Gasolina";
  amount: number;
  quantity?: number | null;
  unit?: string;
  unitPrice?: number | null;
  notes: string;
};

export type ViewOperationalAggregates = {
  totalCost: number;
  costByCategory: Array<{ category: CostRecord["category"]; amount: number }>;
  totalHarvestKg: number;
  totalHarvestBoxes: number;
  commercialKg: number;
  estimatedRevenue: number;
  averagePrice: number;
  grossRevenue: number;
  commissionAmount: number;
  freightAmount: number;
  netRevenue: number;
  soldBoxes: number;
  harvestDaily: Array<{ date: string; kg: number }>;
  totalIrrigationLiters: number;
  averageIrrigationDuration: number;
  averageEc: number | null;
  irrigationDaily: Array<{ date: string; liters: number }>;
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
  | "editHarvest"
  | "sale"
  | "cost"
  | null;
