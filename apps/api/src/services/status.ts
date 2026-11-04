import { mongoose } from "../db/mongodb.js";
import { getAnomalySchedulerStatus } from "./anomalies.js";
import { getSignalKConfig } from "../adapter/signalk.js";
import { getRealtimeAgentStatus } from "./realtimeAgent.js";
import { getWeatherCapability } from "./weather.js";

export function getRuntimeStatus() {
  const signalK = getSignalKConfig();
  return {
    status: mongoose.connection.readyState === 1 ? "ok" : "degraded",
    ts: new Date().toISOString(),
    ingestion: {
      nmea: {
        enabled: true,
        port: Number(process.env.NMEA_PORT ?? 10110),
      },
      signalK,
    },
    mongo: {
      readyState: mongoose.connection.readyState,
      connected: mongoose.connection.readyState === 1,
      database: mongoose.connection.db?.databaseName ?? null,
    },
    anomalyScheduler: getAnomalySchedulerStatus(),
    integrations: {
      weather: getWeatherCapability(),
      realtimeAgent: getRealtimeAgentStatus(),
    },
  };
}
