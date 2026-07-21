import type { EmissionsBroadcast, SensorReading, SensorStream } from "../types.js";
import {
  AnomalyEvent,
  EmissionsReading,
  mongoose,
  SensorReading as SensorReadingModel,
} from "../db/mongodb.js";
import { getValidationSources } from "./officialSources.js";

export type VesselStream = SensorStream | "co2";

export interface VesselSignal {
  stream: VesselStream;
  label: string;
  category: "vessel" | "navigation" | "environment" | "electrical" | "gnss" | "emissions";
  value: number;
  unit: string;
  timestamp: string;
  ageSeconds: number;
  stale: boolean;
  source: "live" | "mongo";
  fuelType?: string;
  cacheHit?: boolean;
}

export interface VesselContext {
  vesselId: string;
  generatedAt: string;
  staleAfterSeconds: number;
  position: {
    lat: number | null;
    lon: number | null;
    updatedAt: string | null;
  };
  latestSignals: VesselSignal[];
  recentAverages: Array<{
    stream: string;
    label: string;
    avg: number;
    min?: number;
    max?: number;
    unit: string;
    samples: number;
  }>;
  recentEmissions: {
    avgFuelRateLh: number | null;
    avgCo2RateKgh: number | null;
    latestFuelType: string | null;
    samples: number;
  };
  anomalies: Array<{
    timestamp: string;
    score: number;
    contributing: string[];
  }>;
  sourceSummary: {
    total: number;
    verified: number;
    refreshedAt: string | null;
  };
  notes: string[];
}

export interface VesselContextOptions {
  includeMongo?: boolean;
  lookbackMinutes?: number;
  staleAfterSeconds?: number;
  now?: Date;
}

type StoredSignal = Omit<VesselSignal, "ageSeconds" | "stale">;

type SensorDoc = {
  stream: SensorStream;
  value: number;
  unit: string;
  timestamp: Date;
};

type EmissionsDoc = {
  fuelType?: string;
  fuelRateLh?: number;
  co2RateKgh?: number;
  co2Kg?: number;
  cacheHit?: boolean;
  timestamp: Date;
};

const STREAM_META: Record<VesselStream, Pick<VesselSignal, "label" | "category">> = {
  fuel: { label: "Fuel flow", category: "vessel" },
  generator: { label: "Generator current", category: "vessel" },
  water: { label: "Water use", category: "vessel" },
  temperature: { label: "Ambient temperature", category: "environment" },
  co2: { label: "CO2 rate", category: "emissions" },
  heading: { label: "Heading", category: "navigation" },
  cog: { label: "Course over ground", category: "navigation" },
  sog: { label: "Speed over ground", category: "navigation" },
  stw: { label: "Speed through water", category: "navigation" },
  magVariation: { label: "Magnetic variation", category: "navigation" },
  navLog: { label: "Total log", category: "navigation" },
  tripLog: { label: "Trip log", category: "navigation" },
  positionLat: { label: "Latitude", category: "navigation" },
  positionLon: { label: "Longitude", category: "navigation" },
  stwRefType: { label: "Speed-through-water reference", category: "navigation" },
  gnssSatellites: { label: "GNSS satellites", category: "gnss" },
  gnssDilution: { label: "GNSS horizontal dilution", category: "gnss" },
  gnssAltitude: { label: "GNSS altitude", category: "gnss" },
  windAngle: { label: "Apparent wind angle", category: "environment" },
  windSpeed: { label: "Apparent wind speed", category: "environment" },
  depthBelowKeel: { label: "Depth below keel", category: "environment" },
  depthBelowTransducer: { label: "Depth below transducer", category: "environment" },
  waterTemp: { label: "Water temperature", category: "environment" },
  waterLevel: { label: "Water tank level", category: "vessel" },
  battVoltage: { label: "Battery voltage", category: "electrical" },
  battCurrent: { label: "Battery current", category: "electrical" },
  battTemp: { label: "Battery temperature", category: "electrical" },
  battTimeRemaining: { label: "Battery time remaining", category: "electrical" },
};

const PERSISTED_SENSOR_STREAMS: SensorStream[] = ["fuel", "generator", "water", "temperature"];
const latestSignals = new Map<VesselStream, StoredSignal>();

function metadata(stream: VesselStream): Pick<VesselSignal, "label" | "category"> {
  return STREAM_META[stream] ?? { label: stream, category: "vessel" };
}

function toStoredSignal(
  reading: SensorReading | EmissionsBroadcast,
  source: "live" | "mongo" = "live"
): StoredSignal {
  const stream = reading.stream as VesselStream;
  const timestamp = reading.timestamp instanceof Date ? reading.timestamp.toISOString() : reading.timestamp;

  return {
    stream,
    ...metadata(stream),
    value: reading.value,
    unit: reading.unit,
    timestamp,
    source,
    ...("fuelType" in reading && reading.fuelType ? { fuelType: reading.fuelType } : {}),
    ...("cacheHit" in reading && typeof reading.cacheHit === "boolean" ? { cacheHit: reading.cacheHit } : {}),
  };
}

function withFreshness(
  signal: StoredSignal,
  now: Date,
  staleAfterSeconds: number
): VesselSignal {
  const ageSeconds = Math.max(0, Math.round((now.getTime() - new Date(signal.timestamp).getTime()) / 1000));
  return {
    ...signal,
    ageSeconds,
    stale: ageSeconds > staleAfterSeconds,
  };
}

function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

function maybeReplaceSignal(map: Map<VesselStream, StoredSignal>, signal: StoredSignal): void {
  const existing = map.get(signal.stream);
  if (!existing || new Date(signal.timestamp).getTime() >= new Date(existing.timestamp).getTime()) {
    map.set(signal.stream, signal);
  }
}

export function recordVesselReading(reading: SensorReading | EmissionsBroadcast): void {
  latestSignals.set(reading.stream as VesselStream, toStoredSignal(reading, "live"));
}

export function clearVesselContextForTest(): void {
  latestSignals.clear();
}

async function loadMongoSignals(map: Map<VesselStream, StoredSignal>): Promise<void> {
  if (!isMongoReady()) return;

  const sensorDocs = await Promise.all(
    PERSISTED_SENSOR_STREAMS.map((stream) =>
      SensorReadingModel.findOne({ stream }, { _id: 0, stream: 1, value: 1, unit: 1, timestamp: 1 })
        .sort({ timestamp: -1 })
        .lean<SensorDoc | null>()
    )
  );

  for (const doc of sensorDocs) {
    if (!doc) continue;
    maybeReplaceSignal(
      map,
      toStoredSignal(
        {
          stream: doc.stream,
          value: doc.value,
          unit: doc.unit,
          timestamp: new Date(doc.timestamp),
        },
        "mongo"
      )
    );
  }

  const emissionsDoc = await EmissionsReading.findOne(
    {},
    { _id: 0, fuelType: 1, co2RateKgh: 1, co2Kg: 1, cacheHit: 1, timestamp: 1 }
  )
    .sort({ timestamp: -1 })
    .lean<EmissionsDoc | null>();

  if (emissionsDoc) {
    maybeReplaceSignal(
      map,
      toStoredSignal(
        {
          stream: "co2",
          value: emissionsDoc.co2RateKgh ?? emissionsDoc.co2Kg ?? 0,
          unit: "kg/h",
          fuelType: emissionsDoc.fuelType ?? "unknown",
          cacheHit: emissionsDoc.cacheHit ?? false,
          timestamp: new Date(emissionsDoc.timestamp).toISOString(),
        },
        "mongo"
      )
    );
  }
}

async function loadRecentAverages(
  since: Date
): Promise<VesselContext["recentAverages"]> {
  if (!isMongoReady()) return [];

  const rows = await SensorReadingModel.aggregate<{
    _id: SensorStream;
    avg: number;
    min: number;
    max: number;
    unit: string;
    samples: number;
  }>([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: "$stream",
        avg: { $avg: "$value" },
        min: { $min: "$value" },
        max: { $max: "$value" },
        unit: { $last: "$unit" },
        samples: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    stream: row._id,
    label: metadata(row._id).label,
    avg: round(row.avg),
    min: round(row.min),
    max: round(row.max),
    unit: row.unit,
    samples: row.samples,
  }));
}

async function loadRecentEmissions(since: Date): Promise<VesselContext["recentEmissions"]> {
  if (!isMongoReady()) {
    return { avgFuelRateLh: null, avgCo2RateKgh: null, latestFuelType: null, samples: 0 };
  }

  const rows = await EmissionsReading.aggregate<{
    _id: null;
    avgFuelRateLh: number | null;
    avgCo2RateKgh: number | null;
    latestFuelType: string | null;
    samples: number;
  }>([
    { $match: { timestamp: { $gte: since } } },
    { $sort: { timestamp: 1 } },
    {
      $group: {
        _id: null,
        avgFuelRateLh: { $avg: "$fuelRateLh" },
        avgCo2RateKgh: { $avg: "$co2RateKgh" },
        latestFuelType: { $last: "$fuelType" },
        samples: { $sum: 1 },
      },
    },
  ]);

  const row = rows[0];
  return {
    avgFuelRateLh: row?.avgFuelRateLh == null ? null : round(row.avgFuelRateLh),
    avgCo2RateKgh: row?.avgCo2RateKgh == null ? null : round(row.avgCo2RateKgh),
    latestFuelType: row?.latestFuelType ?? null,
    samples: row?.samples ?? 0,
  };
}

async function loadRecentAnomalies(): Promise<VesselContext["anomalies"]> {
  if (!isMongoReady()) return [];

  const rows = await AnomalyEvent.find(
    { isAnomaly: true },
    { _id: 0, timestamp: 1, score: 1, contributing: 1 }
  )
    .sort({ timestamp: -1 })
    .limit(5)
    .lean<Array<{ timestamp: Date; score: number; contributing?: string[] }>>();

  return rows.map((row) => ({
    timestamp: new Date(row.timestamp).toISOString(),
    score: round(row.score, 3),
    contributing: row.contributing ?? [],
  }));
}

function positionFrom(signals: VesselSignal[]): VesselContext["position"] {
  const lat = signals.find((signal) => signal.stream === "positionLat");
  const lon = signals.find((signal) => signal.stream === "positionLon");
  const updatedAt = [lat?.timestamp, lon?.timestamp].filter(Boolean).sort().at(-1) ?? null;

  return {
    lat: lat?.value ?? null,
    lon: lon?.value ?? null,
    updatedAt,
  };
}

function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function getVesselContext(
  options: VesselContextOptions = {}
): Promise<VesselContext> {
  const now = options.now ?? new Date();
  const lookbackMinutes = options.lookbackMinutes ?? 30;
  const staleAfterSeconds = options.staleAfterSeconds ?? 120;
  const includeMongo = options.includeMongo ?? true;
  const since = new Date(now.getTime() - lookbackMinutes * 60_000);
  const signalMap = new Map(latestSignals);

  if (includeMongo) {
    await loadMongoSignals(signalMap);
  }

  const latest = Array.from(signalMap.values())
    .map((signal) => withFreshness(signal, now, staleAfterSeconds))
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));

  const [recentAverages, recentEmissions, anomalies] = await Promise.all([
    includeMongo ? loadRecentAverages(since) : Promise.resolve([]),
    includeMongo ? loadRecentEmissions(since) : Promise.resolve({
      avgFuelRateLh: null,
      avgCo2RateKgh: null,
      latestFuelType: null,
      samples: 0,
    }),
    includeMongo ? loadRecentAnomalies() : Promise.resolve([]),
  ]);
  const sources = getValidationSources();

  return {
    vesselId: process.env.VESSEL_ID ?? "DEMO-VESSEL-001",
    generatedAt: now.toISOString(),
    staleAfterSeconds,
    position: positionFrom(latest),
    latestSignals: latest,
    recentAverages,
    recentEmissions,
    anomalies,
    sourceSummary: {
      total: sources.sources.length,
      verified: sources.sources.filter((source) => source.status === "verified").length,
      refreshedAt: sources.refreshedAt,
    },
    notes: [
      "Latest navigation, wind, depth, tank, and electrical values are held from the live backend signal stream.",
      "Fuel, generator, water, temperature, emissions averages, and anomaly history use MongoDB when connected.",
      "Use this as operational awareness and CO2 reasoning context, not regulatory certification.",
    ],
  };
}

export function formatVesselContextForAgent(context: VesselContext): string {
  const lines = [
    `Vessel ID: ${context.vesselId}`,
    `Context generated at: ${context.generatedAt}`,
    `Freshness rule: values older than ${context.staleAfterSeconds}s are stale.`,
  ];

  if (context.position.lat != null && context.position.lon != null) {
    lines.push(
      `Position: ${context.position.lat.toFixed(6)}, ${context.position.lon.toFixed(6)}${
        context.position.updatedAt ? ` at ${context.position.updatedAt}` : ""
      }`
    );
  } else {
    lines.push("Position: unavailable.");
  }

  if (context.latestSignals.length > 0) {
    lines.push("Latest backend signals:");
    for (const signal of context.latestSignals) {
      const freshness = signal.stale ? `stale ${signal.ageSeconds}s old` : `fresh ${signal.ageSeconds}s old`;
      const extra = signal.stream === "co2" && signal.fuelType ? `, fuel ${signal.fuelType}` : "";
      lines.push(
        `- ${signal.label} (${signal.stream}, ${signal.category}): ${round(signal.value, 3)} ${signal.unit}, ${freshness}${extra}, source ${signal.source}.`
      );
    }
  } else {
    lines.push("Latest backend signals: none received yet.");
  }

  if (context.recentAverages.length > 0) {
    lines.push("Recent persisted averages:");
    for (const row of context.recentAverages) {
      lines.push(
        `- ${row.label}: avg ${row.avg} ${row.unit}, min ${row.min} ${row.unit}, max ${row.max} ${row.unit}, samples ${row.samples}.`
      );
    }
  }

  if (context.recentEmissions.samples > 0) {
    lines.push(
      `Recent emissions: avg fuel ${context.recentEmissions.avgFuelRateLh ?? "n/a"} L/h, avg CO2 ${context.recentEmissions.avgCo2RateKgh ?? "n/a"} kg/h, fuel ${context.recentEmissions.latestFuelType ?? "unknown"}, samples ${context.recentEmissions.samples}.`
    );
  }

  if (context.anomalies.length > 0) {
    lines.push("Recent anomalies:");
    for (const anomaly of context.anomalies) {
      lines.push(
        `- ${anomaly.timestamp}: score ${anomaly.score}, contributing ${anomaly.contributing.join(", ") || "unknown"}.`
      );
    }
  } else {
    lines.push("Recent anomalies: none recorded.");
  }

  lines.push(
    `Validation sources: ${context.sourceSummary.verified}/${context.sourceSummary.total} verified; refreshed at ${context.sourceSummary.refreshedAt ?? "not refreshed"}.`
  );

  return lines.join("\n");
}
