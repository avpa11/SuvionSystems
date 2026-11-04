"use client";

import { useCallback, useMemo, useState } from "react";

interface WeatherPanelProps {
  vesselLat: number | null;
  vesselLon: number | null;
}

interface WeatherResponse {
  configured: boolean;
  status: "not_configured" | "invalid_request" | "completed" | "error";
  message?: string;
  location?: { lat: number; lon: number };
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

function fmt(value: number | null | undefined, suffix: string, precision = 1) {
  if (typeof value !== "number") return "--";
  return `${value.toFixed(precision)} ${suffix}`;
}

export function WeatherPanel({ vesselLat, vesselLon }: WeatherPanelProps) {
  const apiHost = useMemo(
    () => process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:4001",
    [],
  );
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [source, setSource] = useState<"vessel" | "browser">("vessel");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadWeather = useCallback(
    async (lat: number, lon: number, nextSource: "vessel" | "browser") => {
      setLoading(true);
      setSource(nextSource);
      setMessage("");
      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
        });
        const response = await fetch(`${apiHost}/weather/current?${params}`);
        const payload = (await response.json()) as WeatherResponse;
        setWeather(payload);
        if (payload.message) setMessage(payload.message);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [apiHost],
  );

  function useBrowserLocation() {
    if (!navigator.geolocation) {
      setMessage("Browser geolocation is unavailable.");
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        loadWeather(
          position.coords.latitude,
          position.coords.longitude,
          "browser",
        ).catch((err) =>
          setMessage(err instanceof Error ? err.message : String(err)),
        );
      },
      (err) => {
        setLoading(false);
        setMessage(err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const wx = weather?.weather;

  return (
    <section className="weather-panel" aria-label="Weather">
      <div className="section-label">WEATHER</div>
      <div className="weather-instrument">
        <div className="weather-instrument__dial">
          <span className="weather-instrument__condition">
            {wx?.condition ?? "WX"}
          </span>
          <span className="weather-instrument__temp">
            {fmt(wx?.temperatureC, "C", 0)}
          </span>
          <span className="weather-instrument__source">
            {source === "vessel" ? "vessel position" : "browser location"}
          </span>
        </div>
        <div className="weather-instrument__readouts">
          <span>Feels {fmt(wx?.feelsLikeC, "C", 0)}</span>
          <span>Wind {fmt(wx?.windSpeedMs, "m/s")}</span>
          <span>Dir {fmt(wx?.windDirectionDeg, "deg", 0)}</span>
          <span>Humidity {fmt(wx?.humidityPct, "%", 0)}</span>
          <span>Pressure {fmt(wx?.pressureHpa, "hPa", 0)}</span>
          <span>Visibility {fmt(wx?.visibilityM, "m", 0)}</span>
        </div>
        <div className="weather-instrument__actions">
          <button
            type="button"
            disabled={loading || vesselLat === null || vesselLon === null}
            onClick={() =>
              vesselLat !== null &&
              vesselLon !== null &&
              loadWeather(vesselLat, vesselLon, "vessel")
            }
          >
            Get vessel weather
          </button>
          <button type="button" disabled={loading} onClick={useBrowserLocation}>
            Use my location
          </button>
        </div>
      </div>
      {message && <div className="weather-panel__message">{message}</div>}
    </section>
  );
}
