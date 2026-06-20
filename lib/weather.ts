"use client";

export type WeatherReading = {
  temperature: number;
  humidity: number;
  sourceName: string;
};

export type LocationMatch = {
  latitude: number;
  longitude: number;
  sourceName: string;
};

type GeocodingResponse = {
  results?: Array<{
    latitude: number;
    longitude: number;
    name: string;
    admin1?: string;
    country?: string;
  }>;
};

type ForecastResponse = {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
  };
};

type GeocodingResult = NonNullable<GeocodingResponse["results"]>[number];

const weatherCache = new Map<string, WeatherReading>();

async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  sourceName: string,
  cacheKey: string
): Promise<WeatherReading | null> {
  const cached = weatherCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(latitude));
  forecastUrl.searchParams.set("longitude", String(longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m");
  forecastUrl.searchParams.set("timezone", "auto");

  const forecastResponse = await fetch(forecastUrl);
  if (!forecastResponse.ok) {
    return null;
  }

  const forecast = (await forecastResponse.json()) as ForecastResponse;
  const temperature = forecast.current?.temperature_2m;
  const humidity = forecast.current?.relative_humidity_2m;

  if (typeof temperature !== "number" || typeof humidity !== "number") {
    return null;
  }

  const reading = { temperature, humidity, sourceName };
  weatherCache.set(cacheKey, reading);
  return reading;
}

export async function fetchWeatherByCoordinates(
  latitude: number,
  longitude: number,
  sourceName = "coordenadas del invernadero"
) {
  return fetchCurrentWeather(
    latitude,
    longitude,
    sourceName,
    `coordinates:${latitude.toFixed(5)},${longitude.toFixed(5)}`
  );
}

function normalizeLocationPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function locationCandidates(location: string) {
  const trimmed = location.trim();
  const [place] = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  return Array.from(new Set([trimmed, place].filter(Boolean)));
}

function chooseGeocodingResult(results: GeocodingResult[] | undefined, query: string) {
  if (!results?.length) {
    return null;
  }

  const hints = query
    .split(",")
    .slice(1)
    .map(normalizeLocationPart)
    .filter(Boolean);

  if (!hints.length) {
    return results[0];
  }

  return (
    results.find((result) => {
      const admin = normalizeLocationPart([result.admin1, result.country].filter(Boolean).join(" "));
      return hints.some((hint) => admin.includes(hint) || hint.includes(admin));
    }) ?? results[0]
  );
}

export async function geocodeLocation(location: string): Promise<LocationMatch | null> {
  const query = location.trim();

  if (!query) {
    return null;
  }

  let result: GeocodingResult | null = null;

  for (const candidate of locationCandidates(query)) {
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.searchParams.set("name", candidate);
    geocodeUrl.searchParams.set("count", "5");
    geocodeUrl.searchParams.set("language", "es");
    geocodeUrl.searchParams.set("format", "json");

    const geocodeResponse = await fetch(geocodeUrl);
    if (!geocodeResponse.ok) {
      continue;
    }

    const geocode = (await geocodeResponse.json()) as GeocodingResponse;
    result = chooseGeocodingResult(geocode.results, query);

    if (result) {
      break;
    }
  }

  if (!result) {
    return null;
  }

  return {
    latitude: result.latitude,
    longitude: result.longitude,
    sourceName: [result.name, result.admin1, result.country].filter(Boolean).join(", ")
  };
}

export async function fetchWeatherByLocation(location: string): Promise<WeatherReading | null> {
  const query = location.trim();
  const result = await geocodeLocation(query);

  if (!result) {
    return null;
  }

  return fetchCurrentWeather(
    result.latitude,
    result.longitude,
    result.sourceName,
    query.toLowerCase()
  );
}
