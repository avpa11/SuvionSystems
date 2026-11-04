export interface WeatherStatus {
  configured: boolean;
  status: "not_configured" | "invalid_request" | "completed" | "error";
  source: "OpenWeather";
  message?: string;
  location?: {
    lat: number;
    lon: number;
  };
  weather?: {
    temperatureC: number | null;
    feelsLikeC: number | null;
    humidityPct: number | null;
    pressureHpa: number | null;
    windSpeedMs: number | null;
    windDirectionDeg: number | null;
    visibilityM: number | null;
    condition: string | null;
    observedAt: string | null;
  };
}

interface OpenWeatherResponse {
  dt?: number;
  weather?: Array<{ description?: string; main?: string }>;
  main?: {
    temp?: number;
    feels_like?: number;
    humidity?: number;
    pressure?: number;
  };
  wind?: {
    speed?: number;
    deg?: number;
  };
  visibility?: number;
  message?: string;
}

function finiteCoordinate(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  )
    return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max)
    return null;
  return numberValue;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getWeatherCapability() {
  return {
    configured: Boolean(process.env.OPENWEATHER_API_KEY),
    source: "OpenWeather" as const,
  };
}

export async function getCurrentWeather(
  latInput: unknown,
  lonInput: unknown,
): Promise<WeatherStatus> {
  const lat = finiteCoordinate(latInput, -90, 90);
  const lon = finiteCoordinate(lonInput, -180, 180);

  if (lat === null || lon === null) {
    return {
      configured: Boolean(process.env.OPENWEATHER_API_KEY),
      status: "invalid_request",
      source: "OpenWeather",
      message: "lat and lon query parameters must be valid coordinates.",
    };
  }

  if (!process.env.OPENWEATHER_API_KEY) {
    return {
      configured: false,
      status: "not_configured",
      source: "OpenWeather",
      location: { lat, lon },
      message: "OPENWEATHER_API_KEY is required for live weather lookup.",
    };
  }

  const baseUrl =
    process.env.OPENWEATHER_BASE_URL ||
    "https://api.openweathermap.org/data/2.5/weather";
  const url = new URL(baseUrl);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("appid", process.env.OPENWEATHER_API_KEY);
  url.searchParams.set("units", "metric");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const payload = (await response.json()) as OpenWeatherResponse;

    if (!response.ok) {
      return {
        configured: true,
        status: "error",
        source: "OpenWeather",
        location: { lat, lon },
        message:
          payload.message ??
          `OpenWeather request failed with HTTP ${response.status}.`,
      };
    }

    const condition =
      payload.weather?.[0]?.description ?? payload.weather?.[0]?.main ?? null;

    return {
      configured: true,
      status: "completed",
      source: "OpenWeather",
      location: { lat, lon },
      weather: {
        temperatureC: nullableNumber(payload.main?.temp),
        feelsLikeC: nullableNumber(payload.main?.feels_like),
        humidityPct: nullableNumber(payload.main?.humidity),
        pressureHpa: nullableNumber(payload.main?.pressure),
        windSpeedMs: nullableNumber(payload.wind?.speed),
        windDirectionDeg: nullableNumber(payload.wind?.deg),
        visibilityM: nullableNumber(payload.visibility),
        condition,
        observedAt: payload.dt
          ? new Date(payload.dt * 1000).toISOString()
          : null,
      },
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      source: "OpenWeather",
      location: { lat, lon },
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
