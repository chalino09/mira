"use client";

import { Crosshair, ExternalLink, LoaderCircle, MapPin } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
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

const baseMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm"
    }
  ]
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const [latitude, setLatitude] = useState(() => coordinateValue(latitudeDefaultValue));
  const [longitude, setLongitude] = useState(() => coordinateValue(longitudeDefaultValue));
  const [accuracy, setAccuracy] = useState<number | null>(accuracyDefaultValue ?? null);
  const [isLocating, setIsLocating] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [error, setError] = useState("");

  const setCoordinates = useCallback((nextLatitude: number, nextLongitude: number, nextAccuracy: number | null) => {
    setLatitude(nextLatitude.toFixed(6));
    setLongitude(nextLongitude.toFixed(6));
    setAccuracy(nextAccuracy);
  }, []);

  useEffect(() => {
    let disposed = false;

    async function initializeMap() {
      if (!mapContainerRef.current || mapRef.current) return;

      const maplibre = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;

      const hasInitialCoordinates =
        typeof latitudeDefaultValue === "number" && typeof longitudeDefaultValue === "number";
      const map = new maplibre.Map({
        container: mapContainerRef.current,
        style: baseMapStyle,
        center: hasInitialCoordinates
          ? [longitudeDefaultValue, latitudeDefaultValue]
          : [-102.5528, 23.6345],
        zoom: hasInitialCoordinates ? 16 : 4.2,
        maxZoom: 19
      });
      const marker = new maplibre.Marker({ color: "#183D2A", draggable: true });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      if (hasInitialCoordinates) {
        marker.setLngLat([longitudeDefaultValue, latitudeDefaultValue]).addTo(map);
      }

      map.on("click", (event) => {
        marker.setLngLat(event.lngLat).addTo(map);
        setCoordinates(event.lngLat.lat, event.lngLat.lng, null);
      });
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        setCoordinates(position.lat, position.lng, null);
      });
      map.once("load", () => setIsMapReady(true));

      mapRef.current = map;
      markerRef.current = marker;
    }

    initializeMap();

    return () => {
      disposed = true;
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [latitudeDefaultValue, longitudeDefaultValue, setCoordinates]);

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

  useEffect(() => {
    if (!hasCoordinates || !mapRef.current || !markerRef.current) return;

    markerRef.current.setLngLat([longitudeNumber, latitudeNumber]).addTo(mapRef.current);
  }, [hasCoordinates, latitudeNumber, longitudeNumber]);

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
        const nextLatitude = position.coords.latitude;
        const nextLongitude = position.coords.longitude;
        setCoordinates(nextLatitude, nextLongitude, Math.round(position.coords.accuracy));
        markerRef.current?.setLngLat([nextLongitude, nextLatitude]).addTo(mapRef.current!);
        mapRef.current?.easeTo({ center: [nextLongitude, nextLatitude], zoom: 17, duration: 700 });
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

      <div className="relative h-64 w-full overflow-hidden rounded-lg border border-app-border bg-app-sidebar">
        <div ref={mapContainerRef} className="h-full w-full" />
        {!isMapReady ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-app-sidebar text-xs text-app-muted">
            Cargando mapa...
          </div>
        ) : null}
      </div>

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
