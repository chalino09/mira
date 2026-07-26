import { startOfIsoWeek } from "@/lib/date";
import { organizationRouteSlug } from "@/lib/organization-routing";
import type { ContextPeriod, SectionId } from "@/types";

export { organizationRouteSlug } from "@/lib/organization-routing";

export const allGreenhousesId = "__all__";

type RouteState = {
  section: SectionId;
  greenhouseId?: string;
  period?: ContextPeriod;
  weekStart?: string;
  list?: ListQueryState;
};

export type ListQueryState = {
  tab?: "applications" | "nutrition" | "irrigation";
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  status?: string;
  severity?: string;
};

export type EntityRoute =
  | { type: "greenhouse"; greenhousePublicId: string }
  | { type: "cycle"; greenhousePublicId: string }
  | { type: "pestCase"; pestPublicId: string }
  | { type: "harvestLot"; lotPublicId: string };

const sectionSegments: Record<SectionId, string[]> = {
  overview: [],
  greenhouses: ["greenhouses"],
  calendar: ["operations"],
  monitoring: ["monitoring"],
  records: ["records"],
  irrigation: ["operations", "irrigation"],
  nutrition: ["operations", "nutrition"],
  applications: ["operations", "applications"],
  pests: ["health"],
  harvest: ["harvest"],
  inventory: ["inventory"],
  costs: ["costs"],
  reports: ["reports"],
  settings: ["settings"]
};

const routeSections = new Map<string, SectionId>(
  Object.entries(sectionSegments).map(([section, segments]) => [segments.join("/"), section as SectionId])
);

const periods = new Set<ContextPeriod>(["week", "month", "all"]);

function isDateKey(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime()));
}

function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function publicEntityId(prefix: "gh" | "pest" | "lot", id: string) {
  return `${prefix}-${id.replace(/-/g, "")}`;
}

export function supportsPeriod(section: SectionId) {
  return ["records", "pests", "harvest", "costs", "reports"].includes(section);
}

export function supportsGreenhouse(section: SectionId) {
  return !["greenhouses", "inventory", "settings"].includes(section);
}

export function allowsAllGreenhouses(section: SectionId) {
  return !["overview", "monitoring"].includes(section);
}

export function parseAppRoute(pathname: string, searchParams: URLSearchParams): RouteState & { organizationSlug?: string; isKnown: boolean; entity?: EntityRoute } {
  const segments = pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const [organizationSlug, ...routeSegments] = segments;
  const calendarWeek = routeSegments[0] === "operations" && routeSegments[1] === "week" ? routeSegments[2] : undefined;
  const sectionKey = calendarWeek ? "operations" : routeSegments.join("/");
  const entity = routeSegments[0] === "greenhouses" && routeSegments.length === 2
    ? { type: "greenhouse" as const, greenhousePublicId: routeSegments[1] }
    : routeSegments[0] === "greenhouses" && routeSegments[2] === "cycles" && routeSegments[3] === "current" && routeSegments.length === 4
      ? { type: "cycle" as const, greenhousePublicId: routeSegments[1] }
      : routeSegments[0] === "health" && routeSegments[1] === "cases" && routeSegments.length === 3
        ? { type: "pestCase" as const, pestPublicId: routeSegments[2] }
        : routeSegments[0] === "harvest" && routeSegments[1] === "lots" && routeSegments.length === 3
          ? { type: "harvestLot" as const, lotPublicId: routeSegments[2] }
          : undefined;
  const section = entity?.type === "greenhouse" || entity?.type === "cycle"
    ? "greenhouses"
    : entity?.type === "pestCase"
      ? "pests"
      : entity?.type === "harvestLot"
        ? "harvest"
        : routeSections.get(sectionKey) ?? "overview";
  const greenhouseId = searchParams.get("greenhouse") ?? undefined;
  const periodValue = searchParams.get("period");
  const tabValue = searchParams.get("tab");
  const directionValue = searchParams.get("dir");
  const pageValue = Number(searchParams.get("page") ?? "1");
  const list: ListQueryState = {
    tab: tabValue === "nutrition" || tabValue === "irrigation" ? tabValue : tabValue === "applications" ? tabValue : undefined,
    q: searchParams.get("q")?.trim().slice(0, 100) || undefined,
    sort: searchParams.get("sort")?.trim().slice(0, 40) || undefined,
    dir: directionValue === "asc" ? "asc" : directionValue === "desc" ? "desc" : undefined,
    page: Number.isInteger(pageValue) && pageValue > 1 ? pageValue : undefined,
    status: searchParams.get("status")?.trim().slice(0, 40) || undefined,
    severity: searchParams.get("severity")?.trim().slice(0, 20) || undefined
  };

  return {
    organizationSlug,
    section,
    isKnown: Boolean(entity) || routeSegments.length === 0 || routeSections.has(sectionKey),
    entity,
    greenhouseId,
    period: periodValue && periods.has(periodValue as ContextPeriod) ? periodValue as ContextPeriod : undefined,
    weekStart: isDateKey(calendarWeek) ? calendarWeek : undefined,
    list
  };
}

export function appRoute(
  organizationName: string,
  { section, greenhouseId, period, weekStart, list }: RouteState
) {
  const segments = [...sectionSegments[section]];
  if (section === "calendar") {
    segments.push("week", weekStart && isDateKey(weekStart) ? weekStart : dateKey(startOfIsoWeek()));
  }

  const query = new URLSearchParams();
  if (supportsGreenhouse(section) && greenhouseId && (greenhouseId !== allGreenhousesId || allowsAllGreenhouses(section))) {
    query.set("greenhouse", greenhouseId);
  }
  if (supportsPeriod(section) && period) query.set("period", period);
  if (list?.tab && list.tab !== "applications") query.set("tab", list.tab);
  if (list?.q) query.set("q", list.q);
  if (list?.sort) query.set("sort", list.sort);
  if (list?.dir) query.set("dir", list.dir);
  if (list?.page && list.page > 1) query.set("page", String(list.page));
  if (list?.status) query.set("status", list.status);
  if (list?.severity) query.set("severity", list.severity);
  const queryString = query.toString();

  return `/${organizationRouteSlug(organizationName)}${segments.length ? `/${segments.join("/")}` : ""}${queryString ? `?${queryString}` : ""}`;
}

function entityRoute(organizationName: string, segments: string[]) {
  return `/${organizationRouteSlug(organizationName)}/${segments.map(encodeURIComponent).join("/")}`;
}

export function greenhouseRoute(organizationName: string, greenhousePublicId: string) {
  return entityRoute(organizationName, ["greenhouses", greenhousePublicId]);
}

export function currentCycleRoute(organizationName: string, greenhousePublicId: string) {
  return entityRoute(organizationName, ["greenhouses", greenhousePublicId, "cycles", "current"]);
}

export function pestCaseRoute(organizationName: string, pestPublicId: string) {
  return entityRoute(organizationName, ["health", "cases", pestPublicId]);
}

export function harvestLotRoute(organizationName: string, lotPublicId: string) {
  return entityRoute(organizationName, ["harvest", "lots", lotPublicId]);
}

export function routeForEntity(organizationName: string, entity: EntityRoute) {
  if (entity.type === "greenhouse") return greenhouseRoute(organizationName, entity.greenhousePublicId);
  if (entity.type === "cycle") return currentCycleRoute(organizationName, entity.greenhousePublicId);
  if (entity.type === "pestCase") return pestCaseRoute(organizationName, entity.pestPublicId);
  return harvestLotRoute(organizationName, entity.lotPublicId);
}
