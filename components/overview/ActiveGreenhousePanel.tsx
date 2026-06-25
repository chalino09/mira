"use client";

import { useEffect, useState } from "react";
import type { ApplicationRecord, Greenhouse, IrrigationRecord } from "@/types";
import { getCropDdtStatus } from "@/lib/crop-ddt";
import { useGreenhouseStore } from "@/lib/store";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { fetchWeatherByCoordinates, fetchWeatherByLocation, type WeatherDailySummary, type WeatherReading } from "@/lib/weather";

type ActiveGreenhousePanelProps = {
  greenhouse: Greenhouse;
  lastIrrigation?: IrrigationRecord;
  lastApplication?: ApplicationRecord;
  showDdtReading?: boolean;
  variant?: "feature" | "rail";
};

type WeatherRisk = {
  label: string;
  detail: string;
  tone: "green" | "amber" | "red" | "muted";
};

function formatClimateNumber(value: number | null | undefined, suffix: string) {
  if (typeof value !== "number") return "--";

  return `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function formatTemperatureRange(summary?: WeatherDailySummary) {
  if (!summary || summary.minTemperature === null || summary.maxTemperature === null) {
    return "--";
  }

  return `${Math.round(summary.minTemperature)} / ${Math.round(summary.maxTemperature)}°C`;
}

function climateRiskFor(weather: WeatherReading | null, temperature: number | null, humidity: number | null): WeatherRisk {
  const rain = weather?.today?.precipitationMm;
  const rainProbability = weather?.today?.precipitationProbability;

  if (temperature === null && humidity === null && !weather) {
    return {
      label: "Sin clima activo",
      detail: "Revisa ubicación o coordenadas para mostrar clima operativo.",
      tone: "muted"
    };
  }

  if (temperature !== null && temperature >= 34) {
    return {
      label: "Atención por calor",
      detail: "Vigilar ventilación, estrés hídrico y horarios de riego.",
      tone: "red"
    };
  }

  if (temperature !== null && temperature <= 5) {
    return {
      label: "Atención por frío",
      detail: "Revisar protección y operación nocturna del cultivo.",
      tone: "red"
    };
  }

  if (typeof rain === "number" && rain >= 10) {
    return {
      label: "Lluvia relevante hoy",
      detail: "Considera el estado del suelo antes de programar riegos.",
      tone: "amber"
    };
  }

  if (typeof rainProbability === "number" && rainProbability >= 70) {
    return {
      label: "Probable lluvia",
      detail: "Mantén pendiente drenaje, accesos y aplicaciones.",
      tone: "amber"
    };
  }

  if (humidity !== null && humidity >= 85) {
    return {
      label: "Humedad alta",
      detail: "Vigilar ventilación y presión de enfermedades.",
      tone: "amber"
    };
  }

  return {
    label: "Sin alertas climáticas",
    detail: "Condiciones externas estables para operación normal.",
    tone: "green"
  };
}

export function ActiveGreenhousePanel({
  greenhouse,
  lastIrrigation,
  lastApplication,
  showDdtReading = true,
  variant = "feature"
}: ActiveGreenhousePanelProps) {
  const [weather, setWeather] = useState<WeatherReading | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const cropStages = useGreenhouseStore((state) => state.cropStages);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      const hasCoordinates = greenhouse.latitude !== null && greenhouse.longitude !== null;
      if (!hasCoordinates && !greenhouse.location) {
        setWeather(null);
        return;
      }

      setIsLoadingWeather(true);
      try {
        const reading = hasCoordinates
          ? await fetchWeatherByCoordinates(
              greenhouse.latitude!,
              greenhouse.longitude!,
              greenhouse.location || "coordenadas del área productiva"
            )
          : await fetchWeatherByLocation(greenhouse.location);
        if (!cancelled) {
          setWeather(reading);
        }
      } catch {
        if (!cancelled) {
          setWeather(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWeather(false);
        }
      }
    }

    loadWeather();

    return () => {
      cancelled = true;
    };
  }, [greenhouse.latitude, greenhouse.location, greenhouse.longitude]);

  const temperature =
    weather?.temperature ?? (greenhouse.temperature > 0 ? greenhouse.temperature : null);
  const humidity = weather?.humidity ?? (greenhouse.humidity > 0 ? greenhouse.humidity : null);
  const climateRisk = climateRiskFor(weather, temperature, humidity);
  const ddtStatus = getCropDdtStatus(
    greenhouse.cropId,
    greenhouse.transplantDate,
    greenhouse.daysSinceTransplant,
    cropStages
  );

  const ddtReading = ddtStatus.status === "missing-catalog"
    ? "Sin catálogo DDT"
    : ddtStatus.status === "missing-date"
      ? "Sin fecha de trasplante"
      : `${ddtStatus.ddt} DDT · ${ddtStatus.label}`;
  const climateMetrics = [
    {
      label: "Ahora",
      value: formatClimateNumber(temperature, "°C"),
      detail: "Temperatura"
    },
    {
      label: "Humedad",
      value: formatClimateNumber(humidity, "%"),
      detail: "Ambiente"
    },
    {
      label: "Hoy",
      value: formatTemperatureRange(weather?.today),
      detail: "Mín / máx"
    },
    {
      label: "Lluvia",
      value: formatClimateNumber(weather?.today?.precipitationMm, " mm"),
      detail: typeof weather?.today?.precipitationProbability === "number"
        ? `${Math.round(weather.today.precipitationProbability)}% prob.`
        : "Pronóstico"
    }
  ];
  const isRail = variant === "rail";
  const riskToneClass = {
    green: "border-app-green/35 bg-app-soft text-app-green",
    amber: "border-[#E3D7B6] bg-[#FFF8E6] text-[#725A1A]",
    red: "border-[#E8C7BF] bg-[#FFF1EE] text-[#8A2F1F]",
    muted: "border-app-border bg-app-sidebar text-app-muted"
  }[climateRisk.tone];
  const riskDotClass = {
    green: "bg-app-green",
    amber: "bg-app-amber",
    red: "bg-[#C24A33]",
    muted: "bg-app-muted"
  }[climateRisk.tone];

  return (
    <aside
      className={cn(
        "flex flex-col justify-center",
        isRail
          ? "border-t border-app-border py-5"
          : "min-h-[300px] border-l border-app-border pl-0 pt-8 lg:pl-12 lg:pt-0"
      )}
    >
      {!isRail ? <p className="text-8xl font-semibold leading-none text-app-text/[0.035] sm:text-9xl">01</p> : null}
      <div className={cn(!isRail && "-mt-4")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
          Clima operativo
        </p>
        <h2 className={cn("mt-3 font-light tracking-normal text-app-text", isRail ? "text-3xl" : "text-4xl")}>
          {greenhouse.name}
        </h2>
        <div className={cn("mt-5 border px-3 py-3", riskToneClass)}>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className={cn("h-2 w-2 rounded-full", riskDotClass)} />
            {climateRisk.label}
          </p>
          <p className="mt-1 text-xs leading-5 opacity-80">{climateRisk.detail}</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 border-y border-app-border">
        {climateMetrics.map((metric, index) => (
          <div
            key={metric.label}
            className={cn(
              "min-w-0 py-3",
              index % 2 === 1 && "border-l border-app-border pl-4",
              index % 2 === 0 && "pr-4",
              index > 1 && "border-t border-app-border"
            )}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-app-muted">{metric.label}</p>
            <p className="mt-1 truncate text-lg font-light text-app-text">{metric.value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-app-muted">{metric.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 border-b border-app-border pb-5">
        {showDdtReading ? (
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-app-muted">Cultivo</p>
            <p className="mt-1 text-sm font-medium text-app-text">{ddtReading}</p>
          </div>
        ) : null}
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-app-muted">Último riego</p>
          <p className="mt-1 text-sm font-medium text-app-text">
            {lastIrrigation
              ? `${formatNumber(lastIrrigation.liters)} L · ${formatDate(lastIrrigation.date)}`
              : "Sin registro"}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-app-muted">Última aplicación</p>
          <p className="mt-1 text-sm font-medium text-app-text">
            {lastApplication
              ? `${lastApplication.category} · ${formatDate(lastApplication.date)}`
              : "Sin registro"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted/80">
          {isLoadingWeather
            ? "Actualizando clima..."
            : weather
              ? `Clima por ${weather.sourceName}`
              : greenhouse.location
                ? `Sin clima para ${greenhouse.location}`
                : "Sin ubicación del área productiva"}
        </p>
      </div>
    </aside>
  );
}
