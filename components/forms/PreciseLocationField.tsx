"use client";

import { Crosshair, ExternalLink, LoaderCircle, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/forms/FormControls";
import { cn } from "@/lib/utils";

type PreciseLocationFieldProps = {
  locationDefaultValue?: string;
  latitudeDefaultValue?: number | null;
  longitudeDefaultValue?: number | null;
  accuracyDefaultValue?: number | null;
  className?: string;
  inputClassName?: string;
};

function coordinateValue(value?: number | null) {
  return typeof value === "number" ? value.toFixed(6) : "";
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Permiso de ubicación denegado. Actívalo en el navegador o escribe las coordenadas.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "No pudimos obtener tu ubicación. Intenta al aire libre o escribe las coordenadas.";
  }
  return "La ubicación tardó demasiado. Intenta de nuevo.";
}

export function PreciseLocationField({
  locationDefaultValue = "",
  latitudeDefaultValue,
  longitudeDefaultValue,
  accuracyDefaultValue,
  className,
  inputClassName
}: PreciseLocationFieldProps) {
  const [latitude, setLatitude] = useState(() => coordinateValue(latitudeDefaultValue));
  const [longitude, setLongitude] = useState(() => coordinateValue(longitudeDefaultValue));
  const [accuracy, setAccuracy] = useState<number | null>(accuracyDefaultValue ?? null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState("");

  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);
  const hasCoordinates =
    latitude.trim() !== "" &&
    longitude.trim() !== "" &&
    Number.isFinite(latitudeNumber) &&
    Number.isFinite(longitudeNumber) &&
    latitudeNumber >= -90 &&
    latitudeNumber <= 90 &&
    longitudeNumber >= -180 &&
    longitudeNumber <= 180;

  const mapUrl = useMemo(() => {
    if (!hasCoordinates) return "";
    return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
  }, [hasCoordinates, latitude, longitude]);

  const requestLocation = () => {
    setError("");
    if (!navigator.geolocation) {
      setError("Este navegador no permite obtener la ubicación. Escribe las coordenadas manualmente.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setAccuracy(Math.round(position.coords.accuracy));
        setIsLocating(false);
      },
      (locationError) => {
        setError(geolocationErrorMessage(locationError));
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );
  };

  return (
    <div className={cn("grid gap-4 sm:col-span-2", className)}>
      <Field label="Ubicación">
        <TextInput
          className={inputClassName}
          defaultValue={locationDefaultValue}
          name="location"
          placeholder="Acatzingo, Puebla"
          required
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Latitud">
          <TextInput
            className={inputClassName}
            inputMode="decimal"
            max={90}
            min={-90}
            name="latitude"
            onChange={(event) => {
              setLatitude(event.target.value);
              setAccuracy(null);
            }}
            placeholder="19.041300"
            required
            step="0.000001"
            type="number"
            value={latitude}
          />
        </Field>
        <Field label="Longitud">
          <TextInput
            className={inputClassName}
            inputMode="decimal"
            max={180}
            min={-180}
            name="longitude"
            onChange={(event) => {
              setLongitude(event.target.value);
              setAccuracy(null);
            }}
            placeholder="-97.909100"
            required
            step="0.000001"
            type="number"
            value={longitude}
          />
        </Field>
      </div>

      <input name="locationAccuracyM" readOnly type="hidden" value={accuracy ?? ""} />

      <div className="flex flex-col gap-3 border-t border-app-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 text-xs text-app-muted">
          <MapPin className={cn("h-4 w-4 shrink-0", hasCoordinates && "text-app-green")} />
          <span className="truncate">
            {hasCoordinates
              ? accuracy !== null
                ? `Ubicación confirmada · precisión aproximada ${accuracy} m`
                : "Coordenadas confirmadas manualmente"
              : "Ubicación precisa pendiente"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {mapUrl ? (
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-3 text-sm font-medium text-app-text transition hover:bg-app-sidebar"
              href={mapUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              Ver en mapa
            </a>
          ) : null}
          <Button
            disabled={isLocating}
            icon={isLocating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            onClick={requestLocation}
            type="button"
            variant="secondary"
          >
            {isLocating ? "Ubicando..." : "Usar mi ubicación"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-sm leading-5 text-[#8A2E2E]" role="alert">{error}</p> : null}
    </div>
  );
}
