import "./env.js";
import http from "http";
import fs from "fs";
import path from "path";
import { Server as SocketIOServer } from "socket.io";
import {
  mongoose,
  connectMongo,
  SensorReading as SensorReadingModel,
  EmissionsReading,
} from "./db/mongodb.js";
import { scheduleRetention } from "./db/retention.js";
import { startNmeaListener } from "./adapter/nmea.js";
import { startSignalKAdapter } from "./adapter/signalk.js";
import { EmissionsCache, isFuelType } from "@repo/emissions";
import type { FuelType } from "@repo/emissions";
import { log } from "@repo/logger";
import type {
  SensorReading,
  EmissionsBroadcast,
  SensorBroadcast,
  SensorStream,
} from "./types.js";
import { startAnomalyScheduler } from "./services/anomalies.js";
import { recordVesselReading } from "./services/vesselContext.js";

import { createApp, allowedOrigins, isAllowedOrigin } from "./app.js";

const PORT = parseInt(process.env.PORT ?? "4001", 10);
const API_LOG = path.join(process.cwd(), "dashboard-client.log");
const WRITE_BATCH_MS = 500;

// ─── App setup ────────────────────────────────────────────────────────────────

const app = createApp();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: allowedOrigins(), methods: ["GET", "POST"] },
  allowRequest: (req, callback) =>
    callback(null, isAllowedOrigin(req.headers.origin)),
});

// ─── Connection logging ───────────────────────────────────────────────────────

function appendLog(entry: Record<string, unknown>): void {
  fs.appendFileSync(API_LOG, JSON.stringify(entry) + "\n", "utf8");
}

io.on("connection", (socket) => {
  const connectTime = Date.now();
  appendLog({
    event: "connection_established",
    socketId: socket.id,
    ts: new Date().toISOString(),
  });
  log(`Dashboard client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    appendLog({
      event: "disconnection",
      socketId: socket.id,
      durationMs: Date.now() - connectTime,
      ts: new Date().toISOString(),
    });
    log(`Dashboard client disconnected: ${socket.id}`);
  });

  // Emit sensor:reset so the dashboard clears stale values on reconnect
  socket.emit("sensor:reset");
});

// ─── Emissions cache & write buffer ──────────────────────────────────────────

const configuredFuelType = process.env.DEFAULT_FUEL_TYPE ?? "";
let currentFuelType: FuelType = isFuelType(configuredFuelType)
  ? configuredFuelType
  : "diesel";
const emissionsCache = new EmissionsCache();
const writeBuffer: SensorReading[] = [];

async function flushReadings(): Promise<void> {
  if (writeBuffer.length === 0) return;
  const batch = writeBuffer.splice(0, writeBuffer.length);
  try {
    await SensorReadingModel.insertMany(
      batch.map((r) => ({ ...r, timestamp: r.timestamp })),
    );
  } catch (err) {
    log(`MongoDB write error: ${err}`);
  }
}

let flushing = false;
const writeTimer = setInterval(async () => {
  if (flushing) return;
  flushing = true;
  try {
    await flushReadings();
  } finally {
    flushing = false;
  }
}, WRITE_BATCH_MS);

// ─── Sensor reading handler ───────────────────────────────────────────────────

// Only these four streams are written to MongoDB (enum-validated by the server-side schema)
const PERSIST_STREAMS = new Set<SensorStream>([
  "fuel",
  "generator",
  "water",
  "temperature",
]);

function handleReading(reading: SensorReading): void {
  const emitTs = Date.now();
  if (!Number.isFinite(reading.value)) return;
  if (
    (reading.stream === "fuel" ||
      reading.stream === "water" ||
      reading.stream === "generator") &&
    reading.value < 0
  )
    return;
  recordVesselReading(reading);

  if (PERSIST_STREAMS.has(reading.stream)) {
    // Bound memory if persistence becomes slower than the incoming feed.
    if (writeBuffer.length >= 10_000) {
      log("Sensor write buffer full; dropping oldest pending reading");
      writeBuffer.shift();
    }
    writeBuffer.push(reading);
  }

  const broadcast: SensorBroadcast = {
    stream: reading.stream,
    value: reading.value,
    unit: reading.unit,
    timestamp: reading.timestamp.toISOString(),
  };

  io.emit("sensor:update", broadcast);

  appendLog({
    event: "message_received",
    stream: reading.stream,
    value: reading.value,
    unit: reading.unit,
    emitTs,
    ts: new Date(emitTs).toISOString(),
  });

  // Compute CO₂ on every fuel-flow reading
  if (reading.stream === "fuel") {
    const entry = emissionsCache.get(currentFuelType, reading.value);

    const emissionsBroadcast: EmissionsBroadcast = {
      stream: "co2",
      value: Math.round(entry.co2Kg * 1000) / 1000,
      unit: "kg/h",
      fuelType: currentFuelType,
      cacheHit: entry.cacheHit,
      timestamp: new Date().toISOString(),
    };

    io.emit("sensor:update", emissionsBroadcast);
    recordVesselReading(emissionsBroadcast);

    appendLog({
      event: "emissions_computed",
      ...emissionsBroadcast,
      cacheHit: entry.cacheHit,
    });

    // Persist emissions reading
    EmissionsReading.create({
      fuelType: currentFuelType,
      fuelRateLh: reading.value,
      co2RateKgh: entry.co2Kg,
      consumptionL: reading.value,
      co2Kg: entry.co2Kg,
      cacheHit: entry.cacheHit,
      timestamp: reading.timestamp,
    }).catch((err: unknown) => log(`Emissions persist error: ${err}`));
  }
}

// ─── Accept fuel-type updates from the dashboard ──────────────────────────────

io.on("connection", (socket) => {
  socket.on("set:fuelType", (fuelType: string) => {
    if (isFuelType(fuelType)) {
      currentFuelType = fuelType;
      emissionsCache.invalidate();
      log(`Fuel type changed to ${fuelType}; cache invalidated`);
    }
  });
});

// ─── Start adapters ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await connectMongo();
  const stopRetention = scheduleRetention();

  // Primary: direct NMEA UDP listener (always active for simulation)
  const stopNmea = startNmeaListener(handleReading);

  // Optional: Signal K WebSocket bridge (passive, no-op if unreachable)
  const stopSignalK = startSignalKAdapter(handleReading);
  const stopAnomalyScheduler = startAnomalyScheduler(io);

  httpServer.listen(PORT, process.env.HOST ?? "127.0.0.1", () => {
    appendLog({
      event: "server_started",
      port: PORT,
      ts: new Date().toISOString(),
    });
    log(`API server listening on port ${PORT}`);
  });

  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    stopNmea();
    stopSignalK();
    stopAnomalyScheduler();
    stopRetention();
    clearInterval(writeTimer);
    io.close();
    httpServer.close();
    while (flushing) await new Promise((resolve) => setTimeout(resolve, 25));
    await flushReadings();
    await mongoose.disconnect();
    clearTimeout(timeout);
  }
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      void shutdown().catch((err) => {
        log(`Shutdown error: ${err}`);
        process.exit(1);
      });
    });
  }
}

main().catch((err) => {
  log(`Fatal: ${err}`);
  process.exit(1);
});
