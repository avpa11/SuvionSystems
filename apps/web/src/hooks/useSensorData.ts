"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

export type StreamId =
  // Persisted vessel sensors
  | "fuel"
  | "generator"
  | "water"
  | "temperature"
  | "co2"
  // Navigation
  | "heading"
  | "cog"
  | "sog"
  | "stw"
  | "magVariation"
  | "navLog"
  | "tripLog"
  | "positionLat"
  | "positionLon"
  | "stwRefType"
  // GNSS
  | "gnssSatellites"
  | "gnssDilution"
  | "gnssAltitude"
  // Wind
  | "windAngle"
  | "windSpeed"
  // Environment
  | "depthBelowKeel"
  | "depthBelowTransducer"
  | "waterTemp"
  | "waterLevel"
  // Electrical
  | "battVoltage"
  | "battCurrent"
  | "battTemp"
  | "battTimeRemaining";

export interface SensorUpdate {
  stream: StreamId;
  value: number;
  unit: string;
  timestamp: string;
  fuelType?: string;
  cacheHit?: boolean;
}

export interface AnomalyUpdate {
  timestamp: string;
  score: number;
  is_anomaly?: boolean;
  isAnomaly?: boolean;
  features: Record<string, number>;
  contributing: string[];
}

export interface SensorState {
  // Vessel
  fuel: SensorUpdate | null;
  generator: SensorUpdate | null;
  water: SensorUpdate | null;
  temperature: SensorUpdate | null;
  co2: SensorUpdate | null;
  // Navigation
  heading: SensorUpdate | null;
  cog: SensorUpdate | null;
  sog: SensorUpdate | null;
  stw: SensorUpdate | null;
  magVariation: SensorUpdate | null;
  navLog: SensorUpdate | null;
  tripLog: SensorUpdate | null;
  positionLat: SensorUpdate | null;
  positionLon: SensorUpdate | null;
  stwRefType: SensorUpdate | null;
  // GNSS
  gnssSatellites: SensorUpdate | null;
  gnssDilution: SensorUpdate | null;
  gnssAltitude: SensorUpdate | null;
  // Wind
  windAngle: SensorUpdate | null;
  windSpeed: SensorUpdate | null;
  // Environment
  depthBelowKeel: SensorUpdate | null;
  depthBelowTransducer: SensorUpdate | null;
  waterTemp: SensorUpdate | null;
  waterLevel: SensorUpdate | null;
  // Electrical
  battVoltage: SensorUpdate | null;
  battCurrent: SensorUpdate | null;
  battTemp: SensorUpdate | null;
  battTimeRemaining: SensorUpdate | null;
}

export type SensorHistory = Record<StreamId, number[]>;

const INITIAL_STATE: SensorState = {
  fuel: null,
  generator: null,
  water: null,
  temperature: null,
  co2: null,
  heading: null,
  cog: null,
  sog: null,
  stw: null,
  magVariation: null,
  navLog: null,
  tripLog: null,
  positionLat: null,
  positionLon: null,
  stwRefType: null,
  gnssSatellites: null,
  gnssDilution: null,
  gnssAltitude: null,
  windAngle: null,
  windSpeed: null,
  depthBelowKeel: null,
  depthBelowTransducer: null,
  waterTemp: null,
  waterLevel: null,
  battVoltage: null,
  battCurrent: null,
  battTemp: null,
  battTimeRemaining: null,
};

const STREAM_IDS: StreamId[] = [
  "fuel",
  "generator",
  "water",
  "temperature",
  "co2",
  "heading",
  "cog",
  "sog",
  "stw",
  "magVariation",
  "navLog",
  "tripLog",
  "positionLat",
  "positionLon",
  "stwRefType",
  "gnssSatellites",
  "gnssDilution",
  "gnssAltitude",
  "windAngle",
  "windSpeed",
  "depthBelowKeel",
  "depthBelowTransducer",
  "waterTemp",
  "waterLevel",
  "battVoltage",
  "battCurrent",
  "battTemp",
  "battTimeRemaining",
];

const INITIAL_HISTORY = Object.fromEntries(
  STREAM_IDS.map((id) => [id, []] as [StreamId, number[]]),
) as unknown as SensorHistory;

const HISTORY_LENGTH = 30;
const SENSOR_STALE_MS = 15_000;

export function useSensorData() {
  const [sensorState, setSensorState] = useState<SensorState>(INITIAL_STATE);
  const [histories, setHistories] = useState<SensorHistory>(INITIAL_HISTORY);
  const [anomalies, setAnomalies] = useState<AnomalyUpdate[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastReadingAt, setLastReadingAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const apiHost = process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:4001";

    const socket = io(apiHost, {
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => {
      setConnected(false);
      setSensorState(INITIAL_STATE);
      setHistories(INITIAL_HISTORY);
    });

    socket.on("sensor:reset", () => {
      setSensorState(INITIAL_STATE);
      setHistories(INITIAL_HISTORY);
      setLastReadingAt(null);
      setAnomalies([]);
    });

    socket.on("sensor:update", (update: SensorUpdate) => {
      if (
        !update ||
        !STREAM_IDS.includes(update.stream) ||
        !Number.isFinite(update.value) ||
        typeof update.unit !== "string" ||
        !Number.isFinite(Date.parse(update.timestamp))
      )
        return;
      setLastReadingAt(Date.now());
      setNow(Date.now());
      setSensorState((prev) => ({ ...prev, [update.stream]: update }));
      setHistories((prev) => {
        const next = [...prev[update.stream], update.value];
        if (next.length > HISTORY_LENGTH) next.shift();
        return { ...prev, [update.stream]: next };
      });
    });

    socket.on("anomaly:update", (update: AnomalyUpdate) => {
      if (
        !update ||
        !(update.is_anomaly ?? update.isAnomaly) ||
        !Number.isFinite(update.score) ||
        !Array.isArray(update.contributing)
      )
        return;
      setAnomalies((prev) => [update, ...prev].slice(0, 8));
    });

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, []);

  function setFuelType(fuelType: string) {
    socketRef.current?.emit("set:fuelType", fuelType);
  }

  const freshState = Object.fromEntries(
    Object.entries(sensorState).map(([key, value]) => [
      key,
      value && now - Date.parse(value.timestamp) <= SENSOR_STALE_MS
        ? value
        : null,
    ]),
  ) as unknown as SensorState;
  const feedStatus = !connected
    ? "offline"
    : lastReadingAt === null
      ? "waiting"
      : now - lastReadingAt > SENSOR_STALE_MS
        ? "stale"
        : "live";
  return {
    sensorState: freshState,
    histories,
    anomalies,
    connected,
    feedStatus,
    lastReadingAt,
    setFuelType,
  };
}
