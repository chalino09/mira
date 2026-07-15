import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/types";
import type { ReactNode } from "react";

type StatusBadgeProps = {
  children: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red";
};

const riskTone: Record<RiskLevel, StatusBadgeProps["tone"]> = {
  Baja: "green",
  Media: "amber",
  Alta: "red"
};

export function StatusBadge({ children, icon, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        tone === "neutral" && "border-app-border bg-white text-app-muted",
        tone === "blue" && "border-[#B9D2E7] bg-[#F1F7FC] text-[#25577A]",
        tone === "green" && "border-[#C8DFC9] bg-app-soft text-app-green",
        tone === "amber" && "border-[#E9D9B2] bg-app-amber text-[#715318]",
        tone === "red" && "border-[#E3BDBD] bg-app-red text-[#7B2A2A]"
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <StatusBadge tone={riskTone[level]}>{level}</StatusBadge>;
}
