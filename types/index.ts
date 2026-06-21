import type { LucideIcon } from "lucide-react";

export type SectionId =
  | "overview"
  | "greenhouses"
  | "calendar"
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
  | "Revisión de plagas"
  | "Poda"
  | "Tutoreo"
  | "Deshoje"
  | "Cosecha"
  | "Limpieza"
  | "Mantenimiento"
  | "Otra";

export type NavigationItem = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
};

export type Organization = {
  id: string;
  name: string;
  legalName?: string;
  logoUrl?: string;
};

export type CurrentUser = {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "manager";
};

export type Greenhouse = {
  id: string;
  name: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  surface: string;
  variety: string;
  transplantDate: string;
  plants: number;
  stage: CropStage;
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
  status: "Pendiente" | "En progreso" | "Bloqueada" | "Completada" | "Cancelada";
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
  photoUrl?: string;
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
    | "Transporte";
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
