import { log } from "@repo/logger";
import type { SensorReading as SensorReadingType } from "../types.js";
import type { WebSocket as WsType } from "ws";

const R2D = 180 / Math.PI;     // radians → degrees
const K2C = (v: number) => v - 273.15;       // Kelvin → Celsius
const MPS2KN = (v: number) => v * 1.94384;   // m/s → knots

function boolEnv(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function resolveSignalKUrl(): string {
  const configured = process.env.SIGNALK_URL ?? "ws://localhost:3000/signalk/v1/stream";
  const url = new URL(configured);
  url.searchParams.set("subscribe", "none");
  return url.toString();
}

export function getSignalKConfig() {
  return {
    enabled: boolEnv("SIGNALK_ENABLED"),
    url: process.env.SIGNALK_URL ?? null,
    resolvedUrl: resolveSignalKUrl(),
    subscriptionPaths: Object.keys(PATH_MAP).concat("navigation.position"),
  };
}

interface PathEntry {
  stream: SensorReadingType["stream"];
  unit: string;
  transform?: (v: number) => number;
}

/** Signal K path → internal stream mapping. */
const PATH_MAP: Record<string, PathEntry> = {
  // ── Vessel sensors ────────────────────────────────────────────────────
  "propulsion.0.fuel.rate":                          { stream: "fuel",          unit: "L/h",   transform: (v) => v * 3600 },
  "electrical.generators.0.current.value":           { stream: "generator",     unit: "A" },
  "tanks.freshWater.0.currentLevel":                 { stream: "waterLevel",    unit: "%",     transform: (v) => v * 100 },
  "environment.outside.temperature":                 { stream: "temperature",   unit: "°C",    transform: K2C },

  // ── Navigation ────────────────────────────────────────────────────────
  "navigation.headingTrue":                          { stream: "heading",       unit: "°",     transform: (v) => v * R2D },
  "navigation.courseOverGroundTrue":                 { stream: "cog",           unit: "°",     transform: (v) => v * R2D },
  "navigation.speedOverGround":                      { stream: "sog",           unit: "kn",    transform: MPS2KN },
  "navigation.speedThroughWater":                    { stream: "stw",           unit: "kn",    transform: MPS2KN },
  "navigation.magneticVariation":                    { stream: "magVariation",  unit: "°",     transform: (v) => v * R2D },
  "navigation.log":                                  { stream: "navLog",        unit: "nmi",   transform: (v) => v / 1852 },
  "navigation.trip.log":                             { stream: "tripLog",       unit: "nmi",   transform: (v) => v / 1852 },
  "navigation.speedThroughWaterReferenceType":       { stream: "stwRefType",    unit: "" },

  // ── GNSS ──────────────────────────────────────────────────────────────
  "navigation.gnss.satellites":                      { stream: "gnssSatellites",  unit: "" },
  "navigation.gnss.horizontalDilution":              { stream: "gnssDilution",    unit: "" },
  "navigation.gnss.antennaAltitude":                 { stream: "gnssAltitude",    unit: "m" },

  // ── Wind ──────────────────────────────────────────────────────────────
  "environment.wind.angleApparent":                  { stream: "windAngle",     unit: "°",     transform: (v) => v * R2D },
  "environment.wind.speedApparent":                  { stream: "windSpeed",     unit: "m/s" },

  // ── Environment ───────────────────────────────────────────────────────
  "environment.depth.belowKeel":                     { stream: "depthBelowKeel",        unit: "m" },
  "environment.depth.belowTransducer":               { stream: "depthBelowTransducer",  unit: "m" },
  "environment.water.temperature":                   { stream: "waterTemp",     unit: "°C",    transform: K2C },

  // ── Electrical / Battery ─────────────────────────────────────────────
  "electrical.batteries.1.voltage":                  { stream: "battVoltage",         unit: "V" },
  "electrical.batteries.1.current":                  { stream: "battCurrent",         unit: "A" },
  "electrical.batteries.1.temperature":              { stream: "battTemp",            unit: "°C",   transform: K2C },
  "electrical.batteries.1.capacity.timeRemaining":   { stream: "battTimeRemaining",   unit: "h",    transform: (v) => v / 3600 },
};

type OnReadingFn = (r: SensorReadingType) => void;

/**
 * Connect to a Signal K WebSocket stream and translate readings.
 * Returns a cleanup function (closes the WebSocket).
 *
 * If the ws package is not available or Signal K is disabled/unreachable, logs
 * a warning and returns a no-op cleanup. The NMEA UDP listener remains active.
 */
export function startSignalKAdapter(onReading: OnReadingFn): () => void {
  let ws: WsType | null = null;

  if (!boolEnv("SIGNALK_ENABLED")) {
    log("Signal K adapter disabled; set SIGNALK_ENABLED=true to enable");
    return () => undefined;
  }

  const signalKUrl = resolveSignalKUrl();

  import("ws")
    .then(({ default: WebSocket }) => {
      ws = new WebSocket(signalKUrl);
      let connected = false;

      ws.on("open", () => {
        connected = true;
        log(`Signal K WebSocket connected: ${signalKUrl}`);
        ws?.send(
          JSON.stringify({
            context: "vessels.self",
            subscribe: Object.keys(PATH_MAP)
              .concat("navigation.position")
              .map((pathName) => ({
                path: pathName,
                period: 1000,
                policy: "instant",
                format: "delta",
              })),
          })
        );
      });

      // Own-vessel URN captured from the Signal K hello message
      let selfUrn: string | null = null;

      ws.on("message", (raw: Buffer) => {
        let msg: unknown;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        // Hello message — capture self URN and skip further processing
        const helloSelf = (msg as { self?: string }).self;
        if (helloSelf) {
          selfUrn = helloSelf;
          log(`Signal K self vessel: ${selfUrn}`);
          return;
        }

        const updates = (msg as { updates?: unknown[]; context?: string }).updates;
        if (!Array.isArray(updates)) return;

        // Only process own-vessel data; ignore AIS targets
        const context = (msg as { context?: string }).context;
        if (context && context !== "vessels.self" && context !== selfUrn) return;

        for (const update of updates) {
          const values = (update as { values?: { path: string; value: unknown }[] }).values;
          if (!Array.isArray(values)) continue;

          for (const { path, value } of values) {
            // ── position is a {latitude, longitude} object ──────────────
            if (path === "navigation.position") {
              const pos = value as { latitude?: number; longitude?: number } | null;
              const now = new Date();
              if (typeof pos?.latitude === "number") {
                onReading({ stream: "positionLat", value: pos.latitude, unit: "°", timestamp: now });
              }
              if (typeof pos?.longitude === "number") {
                onReading({ stream: "positionLon", value: pos.longitude, unit: "°", timestamp: now });
              }
              continue;
            }

            if (typeof value !== "number") continue;

            const mapping = PATH_MAP[path];
            if (!mapping) continue;

            const result = mapping.transform ? mapping.transform(value) : value;
            onReading({
              stream: mapping.stream,
              value: result,
              unit: mapping.unit,
              timestamp: new Date(),
            });
          }
        }
      });

      ws.on("error", (err: Error) => {
        if (connected) log(`Signal K WS error: ${err.message}`);
      });
      ws.on("close", () => {
        if (connected) log("Signal K WebSocket closed");
      });
    })
    .catch(() => {
      log("ws package not available — Signal K adapter disabled; using NMEA fallback");
    });

  return () => {
    if (ws) ws.close();
  };
}
