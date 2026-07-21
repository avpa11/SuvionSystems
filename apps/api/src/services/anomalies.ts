import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { Server as SocketIOServer } from "socket.io";
import { log } from "@repo/logger";
import { AnomalyEvent } from "../db/mongodb.js";

const execFileAsync = promisify(execFile);

export interface AnomalyPayload {
  timestamp: string;
  score: number;
  is_anomaly?: boolean;
  isAnomaly?: boolean;
  features: Record<string, number>;
  contributing: string[];
}

export interface AnomalySchedulerStatus {
  enabled: boolean;
  intervalMs: number;
  lookbackMinutes: number;
  scriptPath: string;
  lastRunAt: string | null;
  lastError: string | null;
}

let lastRunAt: string | null = null;
let lastError: string | null = null;

function boolEnv(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function resolveAnalyticsScript(): string {
  if (process.env.ANOMALY_SCRIPT_PATH) return process.env.ANOMALY_SCRIPT_PATH;
  const cwd = process.cwd();
  return cwd.endsWith(path.join("apps", "api"))
    ? path.resolve(cwd, "../../analytics/anomaly_detection.py")
    : path.resolve(cwd, "analytics/anomaly_detection.py");
}

export function getAnomalySchedulerStatus(): AnomalySchedulerStatus {
  return {
    enabled: boolEnv("ANOMALY_DETECTION_ENABLED"),
    intervalMs: Number(process.env.ANOMALY_INTERVAL_MS ?? 300_000),
    lookbackMinutes: Number(process.env.ANOMALY_LOOKBACK_MINUTES ?? 1440),
    scriptPath: resolveAnalyticsScript(),
    lastRunAt,
    lastError,
  };
}

export async function persistAnomalyEvents(events: AnomalyPayload[]): Promise<void> {
  if (events.length === 0) return;

  await AnomalyEvent.insertMany(
    events
      .filter((event) => event.is_anomaly ?? event.isAnomaly ?? true)
      .map((event) => ({
        timestamp: new Date(event.timestamp),
        score: event.score,
        isAnomaly: event.is_anomaly ?? event.isAnomaly ?? true,
        features: event.features,
        contributing: event.contributing,
        source: "analytics/anomaly_detection.py",
      }))
  );
}

export async function runAnomalyDetectionOnce(): Promise<AnomalyPayload[]> {
  const scriptPath = resolveAnalyticsScript();
  const lookbackMinutes = String(process.env.ANOMALY_LOOKBACK_MINUTES ?? 1440);
  const mongoUri = process.env.MONGO_URI ?? "mongodb://localhost:27017/suvion";
  const { stdout } = await execFileAsync("python3", [
    scriptPath,
    "--mongo-uri",
    mongoUri,
    "--lookback-minutes",
    lookbackMinutes,
    "--json",
  ]);
  const parsed = JSON.parse(stdout) as { events?: AnomalyPayload[] };
  return parsed.events ?? [];
}

export function startAnomalyScheduler(io: SocketIOServer): () => void {
  const status = getAnomalySchedulerStatus();
  if (!status.enabled) {
    log("Anomaly scheduler disabled; set ANOMALY_DETECTION_ENABLED=true to enable");
    return () => undefined;
  }

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const events = await runAnomalyDetectionOnce();
      await persistAnomalyEvents(events);
      lastRunAt = new Date().toISOString();
      lastError = null;
      for (const event of events) {
        io.emit("anomaly:update", event);
      }
      log(`Anomaly scheduler detected ${events.length} event(s)`);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log(`Anomaly scheduler error: ${lastError}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(run, status.intervalMs);
  void run();
  return () => clearInterval(timer);
}
