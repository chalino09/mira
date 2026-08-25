"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Activity,
  ApplicationRecord,
  CostRecord,
  CropCatalogItem,
  CropStageCatalog,
  CurrentUser,
  ContextPeriod,
  Greenhouse,
  HarvestRecord,
  IrrigationRecord,
  ModalType,
  NutritionRecord,
  Organization,
  OrganizationMembership,
  PestAlert,
  PestAlertUpdate,
  SectionId,
  Task,
  ViewOperationalAggregates,
  ViewContext
} from "@/types";
import type { NutritionObservationRule, NutritionReferenceRange } from "@/lib/nutrition-monitoring";
import { invalidateViewDataCache } from "@/lib/view-data-cache";
import { makeId } from "@/lib/utils";

type WithOptionalId<T extends { id: string }> = Omit<T, "id"> & Partial<Pick<T, "id">>;

export type WorkspaceViewData = Partial<Pick<AppState,
  | "tasks"
  | "irrigationRecords"
  | "nutritionRecords"
  | "applicationRecords"
  | "pestAlerts"
  | "harvestRecords"
  | "costRecords"
  | "costListRecords"
  | "viewAggregates"
  | "activities"
>>;

export type ViewDataMeta = {
  resource: "applications" | "nutrition" | "irrigation" | "pests" | "harvest" | "costs";
  page: number;
  pageSize: number;
  total: number;
};

type AppState = {
  activeSection: SectionId;
  selectedGreenhouseId: string;
  selectedPeriod: ContextPeriod;
  selectedHarvestId: string | null;
  viewContexts: Partial<Record<SectionId, ViewContext>>;
  modal: ModalType;
  organization: Organization;
  memberships: OrganizationMembership[];
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
  costListRecords: CostRecord[];
  viewAggregates: ViewOperationalAggregates | null;
  activities: Activity[];
  viewDataMeta: ViewDataMeta | null;
  setActiveSection: (section: SectionId) => void;
  setSelectedGreenhouseId: (id: string) => void;
  setSelectedPeriod: (period: ContextPeriod) => void;
  updateOrganization: (organization: Organization) => void;
  openModal: (modal: ModalType) => void;
  closeModal: () => void;
  addTask: (task: WithOptionalId<Task>) => void;
  completeTask: (id: string, status?: Task["status"]) => void;
  addIrrigation: (record: WithOptionalId<IrrigationRecord>) => void;
  addGreenhouse: (greenhouse: Greenhouse) => void;
  updateGreenhouse: (greenhouse: Greenhouse) => void;
  addNutrition: (record: WithOptionalId<NutritionRecord>) => void;
  addApplication: (record: WithOptionalId<ApplicationRecord>) => void;
  addApplicationRecords: (records: WithOptionalId<ApplicationRecord>[]) => void;
  addPest: (record: WithOptionalId<PestAlert>) => void;
  updatePest: (record: PestAlert) => void;
  addPestUpdate: (alertId: string, update: WithOptionalId<PestAlertUpdate>, patch?: Partial<PestAlert>) => void;
  addHarvest: (record: WithOptionalId<HarvestRecord>) => void;
  openHarvestEditor: (id: string) => void;
  openHarvestSaleEditor: (id: string) => void;
  updateHarvest: (record: HarvestRecord) => void;
  addCost: (record: WithOptionalId<CostRecord>) => void;
  replaceViewData: (data: WorkspaceViewData, meta?: ViewDataMeta | null) => void;
  hydrateWorkspace: (data: {
    organization: Organization;
    memberships: OrganizationMembership[];
    currentUser: CurrentUser;
    crops: CropCatalogItem[];
    cropStages: CropStageCatalog[];
    nutritionReferenceRanges: NutritionReferenceRange[];
    nutritionObservationRules: NutritionObservationRule[];
    greenhouses: Greenhouse[];
  }) => void;
};

const allGreenhousesId = "__all__";

export function defaultPeriodForSection(section: SectionId): ContextPeriod {
  return section === "harvest" || section === "inventory" || section === "costs" ? "all" : "month";
}

export const useGreenhouseStore = create<AppState>()(persist((set) => ({
  activeSection: "overview",
  selectedGreenhouseId: allGreenhousesId,
  selectedPeriod: "month",
  selectedHarvestId: null,
  viewContexts: {},
  modal: null,
  organization: {
    id: "",
    name: ""
  },
  memberships: [],
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
  costListRecords: [],
  viewAggregates: null,
  activities: [],
  viewDataMeta: null,
  setActiveSection: (section) => set((state) => {
    const allowsAll = !["overview", "monitoring"].includes(section);
    const savedContext = state.viewContexts[section];
    const hasValidGreenhouse = savedContext?.greenhouseId === allGreenhousesId
      ? allowsAll
      : state.greenhouses.some((greenhouse) => greenhouse.id === savedContext?.greenhouseId);
    const context = hasValidGreenhouse && savedContext ? savedContext : {
      greenhouseId: ["overview", "monitoring"].includes(section) ? state.greenhouses[0]?.id ?? "" : allGreenhousesId,
      period: defaultPeriodForSection(section)
    };
    return { activeSection: section, selectedGreenhouseId: context.greenhouseId, selectedPeriod: context.period };
  }),
  setSelectedGreenhouseId: (id) => set((state) => ({
    selectedGreenhouseId: id,
    viewContexts: {
      ...state.viewContexts,
      [state.activeSection]: { greenhouseId: id, period: state.selectedPeriod }
    }
  })),
  setSelectedPeriod: (period) => set((state) => ({
    selectedPeriod: period,
    viewContexts: {
      ...state.viewContexts,
      [state.activeSection]: { greenhouseId: state.selectedGreenhouseId, period }
    }
  })),
  updateOrganization: (organization) => set({ organization }),
  replaceViewData: (data, meta = null) => set({ ...data, viewDataMeta: meta }),
  openModal: (modal) => set({ modal, selectedHarvestId: null }),
  closeModal: () => set({ modal: null, selectedHarvestId: null }),
  openHarvestEditor: (id) => set({ modal: "editHarvest", selectedHarvestId: id }),
  openHarvestSaleEditor: (id) => set({ modal: "sale", selectedHarvestId: id }),
  hydrateWorkspace: (data) => {
    invalidateViewDataCache();
    set((state) => {
      const managerSections = new Set<SectionId>(["overview", "greenhouses", "calendar", "records", "pests", "harvest"]);
      const activeSection = data.currentUser.role === "manager" && !managerSections.has(state.activeSection)
        ? "overview"
        : state.activeSection;
      const allowsAll = !["overview", "monitoring"].includes(activeSection);
      const selectedGreenhouseId = allowsAll ? allGreenhousesId : data.greenhouses[0]?.id ?? "";
      return {
        activeSection,
        organization: data.organization,
        memberships: data.memberships,
        currentUser: data.currentUser,
        crops: data.crops,
        cropStages: data.cropStages,
        nutritionReferenceRanges: data.nutritionReferenceRanges,
        nutritionObservationRules: data.nutritionObservationRules,
        greenhouses: data.greenhouses,
        selectedGreenhouseId,
        selectedPeriod: defaultPeriodForSection(activeSection),
        selectedHarvestId: null,
        viewContexts: {},
        modal: null,
        tasks: [],
        irrigationRecords: [],
        nutritionRecords: [],
        applicationRecords: [],
        pestAlerts: [],
        harvestRecords: [],
        costRecords: [],
        costListRecords: [],
        viewAggregates: null,
        activities: [],
        viewDataMeta: null
      };
    });
  },
  addTask: (task) => {
    invalidateViewDataCache();
    set((state) => ({
      tasks: [{ ...task, id: task.id ?? makeId("task") }, ...state.tasks],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: task.greenhouseId,
          title: "Nueva actividad creada",
          detail: task.title,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null
    }));
  },
  completeTask: (id, status = "Completada") => {
    invalidateViewDataCache();
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === id ? { ...task, status } : task
      )
    }));
  },
  addIrrigation: (record) => {
    invalidateViewDataCache();
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
    }));
  },
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
  addNutrition: (record) => {
    invalidateViewDataCache();
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
    }));
  },
  addApplication: (record) => {
    invalidateViewDataCache();
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
    }));
  },
  addApplicationRecords: (records) => {
    invalidateViewDataCache();
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
    }));
  },
  addPest: (record) => {
    invalidateViewDataCache();
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
    }));
  },
  updatePest: (record) => {
    invalidateViewDataCache();
    set((state) => ({
      pestAlerts: state.pestAlerts.map((alert) => (alert.id === record.id ? record : alert))
    }));
  },
  addPestUpdate: (alertId, update, patch = {}) => {
    invalidateViewDataCache();
    set((state) => ({
      pestAlerts: state.pestAlerts.map((alert) =>
        alert.id === alertId
          ? {
              ...alert,
              ...patch,
              updates: [{ ...update, id: update.id ?? makeId("pest-update") }, ...(alert.updates ?? [])]
            }
          : alert
      ),
      activities: [
        {
          id: makeId("act"),
          greenhouseId: update.greenhouseId,
          title: "Seguimiento sanitario agregado",
          detail: `${update.status} · ${update.severity}`,
          time: "Ahora"
        },
        ...state.activities
      ]
    }));
  },
  addHarvest: (record) => {
    invalidateViewDataCache();
    set((state) => ({
      harvestRecords: [{ ...record, id: record.id ?? makeId("harv") }, ...state.harvestRecords],
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Cosecha registrada",
          detail: record.boxCount
            ? `${record.boxCount.toLocaleString("es-MX")} cajas · ${record.kilograms.toLocaleString("es-MX")} kg`
            : `${record.kilograms.toLocaleString("es-MX")} kg capturados`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null,
      selectedHarvestId: null
    }));
  },
  updateHarvest: (record) => {
    invalidateViewDataCache();
    set((state) => ({
      harvestRecords: state.harvestRecords.map((item) => item.id === record.id ? record : item),
      activities: [
        {
          id: makeId("act"),
          greenhouseId: record.greenhouseId,
          title: "Cosecha corregida",
          detail: `${record.boxCount.toLocaleString("es-MX")} cajas · ${record.kilograms.toLocaleString("es-MX")} kg`,
          time: "Ahora"
        },
        ...state.activities
      ],
      modal: null,
      selectedHarvestId: null
    }));
  },
  addCost: (record) => {
    invalidateViewDataCache();
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
    }));
  }
}), {
  name: "mira-view-context",
  partialize: (state) => ({
    activeSection: state.activeSection,
    selectedGreenhouseId: state.selectedGreenhouseId,
    selectedPeriod: state.selectedPeriod,
    viewContexts: state.viewContexts
  })
}));
