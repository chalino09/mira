"use client";

import { useState } from "react";
import { FileText, FlaskConical } from "lucide-react";
import { MiraWordmark } from "@/components/brand/MiraBrand";
import { NutritionMonitoringSection } from "@/components/monitoring/NutritionMonitoringSection";
import { TechnicalLabSection } from "@/components/monitoring/TechnicalLabSection";
import { cn } from "@/lib/utils";

type MonitoringTab = "nutrition" | "lab";

const tabs: Array<{ id: MonitoringTab; label: string; detail: string; icon: typeof FlaskConical }> = [
  { id: "nutrition", label: "Nutrimental", detail: "ECP, suelo, tendencias y comparativo.", icon: FlaskConical },
  { id: "lab", label: "Laboratorio", detail: "Estudios técnicos, PDFs y acciones.", icon: FileText }
];

export function MonitoringSection() {
  const [activeTab, setActiveTab] = useState<MonitoringTab>("nutrition");

  return (
    <section>
      <div className="mb-10 border-b border-app-border pb-7 pt-8 md:pt-10">
        <div>
          <MiraWordmark className="mb-4 block text-[11px] tracking-[0.36em] text-app-muted" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-app-muted">Monitoreo</p>
          <h1 className="mt-3 text-4xl font-light leading-none tracking-normal text-app-text md:text-6xl">
            Diagnóstico técnico
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-app-muted">
            Monitoreo nutrimental, estudios de laboratorio, documentos privados y acciones técnicas por área productiva.
          </p>
        </div>
      </div>

      <div className="mb-8 border-b border-app-border pb-5">
        <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Módulos de monitoreo">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                aria-selected={active}
                className={cn(
                  "flex items-start gap-3 border px-4 py-3 text-left transition",
                  active ? "border-app-green bg-app-soft text-app-green" : "border-app-border bg-white text-app-muted hover:text-app-text"
                )}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-sm font-medium text-app-text">{tab.label}</span>
                  <span className="mt-1 block text-xs">{tab.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "nutrition" ? <NutritionMonitoringSection embedded /> : <TechnicalLabSection />}
    </section>
  );
}
