import {
  ActivitySquare,
  BarChart3,
  CalendarDays,
  Droplets,
  Flower2,
  Home,
  Leaf,
  Settings,
  ShieldAlert,
  Sprout,
  WalletCards
} from "lucide-react";
import type { NavigationItem } from "@/types";

export const navigationItems: NavigationItem[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "greenhouses", label: "Invernaderos", icon: Sprout },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "irrigation", label: "Riego", icon: Droplets },
  { id: "nutrition", label: "Nutrición", icon: Flower2 },
  { id: "applications", label: "Aplicaciones", icon: ActivitySquare },
  { id: "pests", label: "Plagas", icon: ShieldAlert },
  { id: "harvest", label: "Cosecha", icon: Leaf },
  { id: "costs", label: "Costos", icon: WalletCards },
  { id: "reports", label: "Reportes", icon: BarChart3 },
  { id: "settings", label: "Ajustes", icon: Settings }
];
