import fs from "fs";
import path from "path";
import { SensorReading, EmissionsReading, LifecycleLog } from "./mongodb.js";
import { log } from "@repo/logger";

const LOG_PATH = path.join(process.cwd(), "data-lifecycle.log");
const RETENTION_DAYS = 30;

function appendLifecycleLog(entry: Record<string, unknown>): void {
  const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + "\n";
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

/** Delete sensor and emissions documents older than RETENTION_DAYS days. */
export async function runRetention(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [sensorResult, emissionsResult] = await Promise.all([
    SensorReading.deleteMany({ timestamp: { $lt: cutoff } }),
    EmissionsReading.deleteMany({ timestamp: { $lt: cutoff } }),
  ]);

  const totalDeleted = sensorResult.deletedCount + emissionsResult.deletedCount;

  await LifecycleLog.create({
    event: "retention_run",
    deletedCount: totalDeleted,
  });

  appendLifecycleLog({
    event: "retention_run",
    cutoffDate: cutoff.toISOString(),
    sensorDeleted: sensorResult.deletedCount,
    emissionsDeleted: emissionsResult.deletedCount,
    totalDeleted,
  });

  log(`Retention run: deleted ${totalDeleted} documents older than ${cutoff.toISOString()}`);
}

/**
 * Final data wipe — deletes ALL sensor and emissions data.
 * Used post-demo. Appends a signed log entry to data-lifecycle.log.
 */
export async function runDataWipe(): Promise<void> {
  const [sensorResult, emissionsResult] = await Promise.all([
    SensorReading.deleteMany({}),
    EmissionsReading.deleteMany({}),
  ]);

  const totalDeleted = sensorResult.deletedCount + emissionsResult.deletedCount;

  await LifecycleLog.create({
    event: "data_wipe",
    deletedCount: totalDeleted,
  });

  appendLifecycleLog({
    event: "data_wipe",
    totalDeleted,
    wipedBy: "suvion-retention-script",
    note: "Post-demo full wipe per data governance policy",
  });

  log(`Data wipe complete: deleted ${totalDeleted} total documents`);
}

/** Schedule the retention job to run daily. Returns cleanup function. */
export function scheduleRetention(): () => void {
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  const timer = setInterval(() => {
    runRetention().catch((err) => log(`Retention error: ${err}`));
  }, INTERVAL_MS);

  log(`Data retention scheduled: runs every 24 h, deletes data older than ${RETENTION_DAYS} days`);
  return () => clearInterval(timer);
}
