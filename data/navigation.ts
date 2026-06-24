import {
  ActivitySquare,
  BarChart3,
  CalendarDays,
  FlaskConical,
  Home,
  Leaf,
  Settings,
  ShieldAlert,
  Sprout,
  WalletCards
} from "lucide-react";
import type { NavigationItem, UserRole } from "@/types";

export const navigationItems: NavigationItem[] = [
  { id: "overview", label: "Inicio", icon: Home },
  { id: "calendar", label: "Operación", icon: CalendarDays },
  { id: "greenhouses", label: "Invernaderos", icon: Sprout },
  { id: "monitoring", label: "Monitoreo", icon: FlaskConical },
  { id: "records", label: "Registros técnicos", icon: ActivitySquare },
  { id: "pests", label: "Plagas", icon: ShieldAlert },
  { id: "harvest", label: "Cosecha", icon: Leaf },
  { id: "costs", label: "Costos", icon: WalletCards },
  { id: "reports", label: "Reportes", icon: BarChart3 },
  { id: "settings", label: "Ajustes", icon: Settings }
];

const managerSections = new Set([
  "overview",
  "greenhouses",
  "calendar",
  "records",
  "pests",
  "harvest"
]);

export function navigationItemsForRole(role: UserRole) {
  if (role !== "manager") return navigationItems;
  return navigationItems.filter((item) => managerSections.has(item.id));
}
