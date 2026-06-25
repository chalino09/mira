import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("es-MX").format(value ?? 0);
}

export function cleanNumericInput(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  const text = String(value ?? "");
  const match = text.match(/^\s*\$?\s*[-+]?\d[\d,.\s]*/);
  if (!match) {
    return "";
  }

  const numericText = match[0].replace(/[$,\s]/g, "");
  const sign = numericText.startsWith("-") ? "-" : "";
  const unsignedText = numericText.replace(/^[-+]/, "");
  const [integer = "", ...decimalParts] = unsignedText.split(".");
  const integerDigits = integer.replace(/\D/g, "");
  const decimalDigits = decimalParts.join("").replace(/\D/g, "");

  if (!integerDigits && !decimalDigits) {
    return "";
  }

  return decimalParts.length ? `${sign}${integerDigits || "0"}.${decimalDigits}` : `${sign}${integerDigits}`;
}

export function parseNumericInput(value: string | number | null | undefined) {
  const cleaned = cleanNumericInput(value);
  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatNumericInput(value: string | number | null | undefined) {
  const cleaned = cleanNumericInput(value);
  if (!cleaned) return "";

  const hasDecimal = cleaned.includes(".");
  const [integer = "", decimal = ""] = cleaned.split(".");
  const formattedInteger = integer ? Number(integer).toLocaleString("es-MX") : "0";

  return hasDecimal ? `${formattedInteger}.${decimal}` : formattedInteger;
}

export function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(value ?? 0);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

export function todayLabel() {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date());
}

export function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
