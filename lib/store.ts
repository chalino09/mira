"use client";

import { create } from "zustand";
import type {
  Activity,
  ApplicationRecord,
  CostRecord,
  CropCatalogItem,
  CropStageCatalog,
  CurrentUser,
  Greenhouse,
  HarvestRecord,
  IrrigationRecord,
  ModalType,
  NutritionRecord,
  Organization,
  PestAlert,
  SectionId,
  Task
} from "@/types";
import type { NutritionObservationRule, NutritionReferenceRange } from "@/lib/nutrition-monitoring";
import { makeId } from "@/lib/utils";

type WithOptionalId<T extends { id: string }> = Omit<T, "id"> & Partial<Pick<T, "id">>;

type AppState = {
  activeSection: SectionId;
  selectedGreenhouseId: string;
  modal: ModalType;
  organization: Organization;
  currentUser: CurrentUser;
  crops: CropCatalogItem[];
  cropStages: CropStageCatalog[];
  nutritionReferenceRanges: NutritionReferenceRange[];
  nutritionObservationRules: NutritionObservationRule[];
  greenhouses: Greenhouse[];
  tasks: Task[];
  irrigationRecords: IrrigationRecord[];
  nutritionRecords: NutritionRecord[];
  applicationRecords: ApplicationRecord[];
  pestAlerts: PestAlert[];
  harvestRecords: HarvestRecord[];
  costRecords: CostRecord[];
  activities: Activity[];
  setActiveSection: (section: SectionId) => void;
  setSelectedGreenhouseId: (id: string) => void;
  updateOrganization: (organization: Organization) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  addTask: (task: WithOptionalId<Task>) => void;
  completeTask: (id: string) => void;
  addIrrigation: (record: WithOptionalId<IrrigationRecord>) => void;
  addGreenhouse: (greenhouse: Greenhouse) => void;
  updateGreenhouse: (greenhouse: Greenhouse) => void;
  addNutrition: (record: WithOptionalId<NutritionRecord>) => void;
  addApplication: (record: WithOptionalId<ApplicationRecord>) => void;
  addApplicationRecords: (records: WithOptionalId<ApplicationRecord>[]) => void;
  addPest: (record: WithOptionalId<PestAlert>) => void;
  updatePest: (record: PestAlert) => void;
  addHarvest: (record: WithOptionalId<HarvestRecord>) => void;
  addCost: (record: WithOptionalId<CostRecord>) => void;
  hydrateWorkspace: (data: {
    organization: Organization;
    currentUser: CurrentUser;
    crops: CropCatalogItem[];
    cropStages: CropStageCatalog[];
    nutritionReferenceRanges: NutritionReferenceRange[];
    nutritionObservationRules: NutritionObservationRule[];
    greenhouses: Greenhouse[];
    tasks: Task[];
    irrigationRecords: IrrigationRecord[];
    nutritionRecords: NutritionRecord[];
    applicationRecords: ApplicationRecord[];
    pestAlerts: PestAlert[];
    harvestRecords: HarvestRecord[];
    costRecords: CostRecord[];
    activities: Activity[];
  }) => void;
};

export const useGreenhouseStore = create<AppState>((set) => ({
  activeSection: "overview",
  selectedGreenhouseId: "",
  modal: null,
  organization: {
    id: "",
    name: ""
  },
  currentUser: {
    id: "",
    fullName: "",
    email: "",
    role: "manager"
  },
  crops: [],
  cropStages: [],
  nutritionReferenceRanges: [],
  nutritionObservationRules: [],
  greenhouses: [],
  tasks: [],
  irrigationRecords: [],
  nutritionRecords: [],
  applicationRecords: [],
  pestAlerts: [],
  harvestRecords: [],
  costRecords: [],
  activities: [],
  setActiveSection: (section) => set({ activeSection: section }),
  setSelectedGreenhouseId: (id) => set({ selectedGreenhouseId: id }),
  updateOrganization: (organization) => set({ organization }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  hydrateWorkspace: (data) =>
    set(() => ({
      organization: data.organization,
      currentUser: data.currentUser,
      crops: data.crops,
      cropStages: data.cropStages,
      nutritionReferenceRanges: data.nutritionReferenceRanges,
      nutritionObservationRules: data.nutritionObservationRules,
      greenhouses: data.greenhouses,
      selectedGreenhouseId: data.greenhouses[0]?.id ?? "",
      tasks: data.tasks,
      irrigationRecords: data.irrigationRecords,
      nutritionRecords: data.nutritionRecords,
      applicationRecords: data.applicationRecords,
      pestAlerts: data.pestAlerts,
      harvestRecords: data.harvestRecords,
      costRecords: data.costRecords,
      activities: data.activities
    })),
  addTask: (task) =>
    set((state) => ({
      tasks: [{ ...task, id: task.id ?? makeId("task") }, ...state.tasks],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: task.greenhouseId,
          title: "Nueva tarea creada",
          detail: task.title,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    })),
  completeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, status: "Completada" } : task
      )
    })),
  addIrrigation: (record) =>
    set((state) => ({
      irrigationRecords: [{ ...record, id: record.id ?? makeId("riego") }, ...state.irrigationRecords],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Riego registrado",
          detail: `${record.liters.toLocaleString("es-MX")} L en ${record.sector}`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    })),
  addGreenhouse: (greenhouse) =>
    set((state) => ({
      greenhouses: [greenhouse, ...state.greenhouses],
      selectedGreenhouseId: greenhouse.id,
      modal: null
    })),
  updateGreenhouse: (greenhouse) =>
    set((state) => ({
      greenhouses: state.greenhouses.map((item) => (item.id === greenhouse.id ? greenhouse : item)),
      selectedGreenhouseId: greenhouse.id,
      modal: null
    })),
  addNutrition: (record) =>
    set((state) => ({
      nutritionRecords: [{ ...record, id: record.id ?? makeId("nut") }, ...state.nutritionRecords],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Nutrición registrada",
          detail: `${record.product} · ${record.dose}`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    })),
  addApplication: (record) =>
    set((state) => ({
      applicationRecords: [{ ...record, id: record.id ?? makeId("app") }, ...state.applicationRecords],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Aplicación registrada",
          detail: `${record.product} en ${record.area}`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    })),
  addApplicationRecords: (records) =>
    set((state) => ({
      applicationRecords: [
        ...records.map((record) => ({ ...record, id: record.id ?? makeId("app") })),
        ...state.applicationRecords
      ],
      activities: records.length
        ? [
            {
              id: makeId("act"),
              greenhouseId: records[0].greenhouseId,
              title: "Aplicación completada",
              detail: records.map((record) => record.product).join(", "),
              time: "Ahora"
            },
            ...state.activities
          ]
        : state.activities
    })),
  addPest: (record) =>
    set((state) => ({
      pestAlerts: [{ ...record, id: record.id ?? makeId("pest") }, ...state.pestAlerts],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Alerta sanitaria registrada",
          detail: `${record.problem} · ${record.severity}`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    })),
  updatePest: (record) =>
    set((state) => ({
      pestAlerts: state.pestAlerts.map((alert) => (alert.id === record.id ? record : alert))
    })),
  addHarvest: (record) =>
    set((state) => ({
      harvestRecords: [{ ...record, id: record.id ?? makeId("harv") }, ...state.harvestRecords],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Cosecha registrada",
          detail: `${record.kilograms.toLocaleString("es-MX")} kg capturados`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    })),
  addCost: (record) =>
    set((state) => ({
      costRecords: [{ ...record, id: record.id ?? makeId("cost") }, ...state.costRecords],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Costo registrado",
          detail: `${record.category} · ${record.amount.toLocaleString("es-MX")}`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    }))
}));
