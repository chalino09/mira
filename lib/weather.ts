"use client";

export type WeatherReading = {
  latitude: number;
  longitude: number;
  temperature: number;
  humidity: number;
  today?: WeatherDailySummary;
  tomorrow?: WeatherDailySummary;
  sourceName: string;
};

export type WeatherDailySummary = {
  minTemperature: number | null;
  maxTemperature: number | null;
  precipitationMm: number | null;
  precipitationProbability: number | null;
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
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
  };
};

type GeocodingResult = NonNullable<GeocodingResponse["results"]>[number];

const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;
const weatherCache = new Map<string, { reading: WeatherReading; fetchedAt: number }>();

function dailySummary(forecast: ForecastResponse, index: number): WeatherDailySummary | undefined {
  const minTemperature = forecast.daily?.temperature_2m_min?.[index];
  const maxTemperature = forecast.daily?.temperature_2m_max?.[index];
  const precipitationMm = forecast.daily?.precipitation_sum?.[index];
  const precipitationProbability = forecast.daily?.precipitation_probability_max?.[index];

  if (
    typeof minTemperature !== "number" &&
    typeof maxTemperature !== "number" &&
    typeof precipitationMm !== "number" &&
    typeof precipitationProbability !== "number"
  ) {
    return undefined;
  }

  return {
    minTemperature: typeof minTemperature === "number" ? minTemperature : null,
    maxTemperature: typeof maxTemperature === "number" ? maxTemperature : null,
    precipitationMm: typeof precipitationMm === "number" ? precipitationMm : null,
    precipitationProbability: typeof precipitationProbability === "number" ? precipitationProbability : null
  };
}

async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  sourceName: string,
  cacheKey: string
): Promise<WeatherReading | null> {
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL_MS) {
    return cached.reading;
  }

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(latitude));
  forecastUrl.searchParams.set("longitude", String(longitude));
  forecastUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m");
  forecastUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max");
  forecastUrl.searchParams.set("forecast_days", "2");
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

  const reading = {
    latitude,
    longitude,
    temperature,
    humidity,
    today: dailySummary(forecast, 0),
    tomorrow: dailySummary(forecast, 1),
    sourceName
  };
  weatherCache.set(cacheKey, { reading, fetchedAt: Date.now() });
  return reading;
}

export async function fetchWeatherByCoordinates(
  latitude: number,
  longitude: number,
  sourceName = "coordenadas del área productiva"
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
