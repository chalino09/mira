import { useEffect, useState } from "react";
import type { ApplicationRecord, Greenhouse, IrrigationRecord } from "@/types";
import { getCropDdtStatus } from "@/lib/crop-ddt";
import { cn, formatNumber } from "@/lib/utils";
import { fetchWeatherByCoordinates, fetchWeatherByLocation, type WeatherReading } from "@/lib/weather";

type ActiveGreenhousePanelProps = {
  greenhouse: Greenhouse;
  lastIrrigation?: IrrigationRecord;
  lastApplication?: ApplicationRecord;
  showDdtReading?: boolean;
  variant?: "feature" | "rail";
};

export function ActiveGreenhousePanel({
  greenhouse,
  lastIrrigation,
  lastApplication,
  showDdtReading = true,
  variant = "feature"
}: ActiveGreenhousePanelProps) {
  const [weather, setWeather] = useState<WeatherReading | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);

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
              greenhouse.location || "coordenadas del invernadero"
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
  const ddtStatus = getCropDdtStatus(
    greenhouse.cropId,
    greenhouse.transplantDate,
    greenhouse.daysSinceTransplant
  );

  const readings = [
    ...(showDdtReading
      ? [
          ddtStatus.status === "missing-date"
            ? "SIN FECHA DE TRASPLANTE"
            : `${ddtStatus.ddt} DDT · ${ddtStatus.label.toUpperCase()}`
        ]
      : []),
    `${temperature !== null ? Math.round(temperature) : "--"}°C CLIMA ACTUAL`,
    `${humidity !== null ? Math.round(humidity) : "--"}% HUMEDAD`,
    `${lastIrrigation ? formatNumber(lastIrrigation.liters) : "0"} L ÚLTIMO RIEGO`,
    `${lastApplication?.category.toUpperCase() ?? "SIN REGISTRO"} ÚLTIMA APLICACIÓN`
  ];
  const isRail = variant === "rail";

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
          Ambiente y riego
        </p>
        <h2 className={cn("mt-3 font-light tracking-normal text-app-text", isRail ? "text-3xl" : "text-4xl")}>
          {greenhouse.name}
        </h2>
        <p className="mt-5 flex items-center gap-2 text-sm font-medium text-app-green">
          <span className="h-2 w-2 rounded-full bg-app-green" />
          Operativo
        </p>
      </div>
      <div className="mt-10 grid gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-app-muted">
        {readings.map((reading) => (
          <p key={reading}>{reading}</p>
        ))}
        <p className="pt-3 text-[10px] tracking-[0.14em] text-app-muted/80">
          {isLoadingWeather
            ? "ACTUALIZANDO CLIMA..."
            : weather
              ? `CLIMA POR ${weather.sourceName}`
              : greenhouse.location
                ? `SIN CLIMA PARA ${greenhouse.location}`
                : "SIN UBICACIÓN DE INVERNADERO"}
        </p>
      </div>
    </aside>
  );
}
