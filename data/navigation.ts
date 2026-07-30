import {
  CalendarDays,
  FlaskConical,
  Home,
  Leaf,
  Package,
  Settings,
  ShieldAlert,
  Sprout
} from "lucide-react";
import type { NavigationItem, UserRole } from "@/types";

export const navigationItems: NavigationItem[] = [
  { id: "overview", label: "Inicio", icon: Home },
  { id: "calendar", label: "Operación", icon: CalendarDays },
  { id: "greenhouses", label: "Invernaderos", icon: Sprout },
  { id: "monitoring", label: "Monitoreo", icon: FlaskConical },
  { id: "pests", label: "Plagas", icon: ShieldAlert },
  { id: "harvest", label: "Cosecha", icon: Leaf },
  { id: "inventory", label: "Inventario y costos", icon: Package },
  { id: "settings", label: "Ajustes", icon: Settings }
];

const managerSections = new Set([
  "overview",
  "greenhouses",
  "calendar",
  "pests",
  "harvest"
]);

export function navigationItemsForRole(role: UserRole) {
  if (role !== "manager") return navigationItems;
  return navigationItems.filter((item) => managerSections.has(item.id));
}
