export type SensorStream =
  // Persisted vessel sensors
  | "fuel" | "generator" | "water" | "temperature"
  // Broadcast-only — navigation
  | "heading" | "cog" | "sog" | "stw" | "magVariation" | "navLog" | "tripLog"
  | "positionLat" | "positionLon" | "stwRefType"
  // Broadcast-only — GNSS
  | "gnssSatellites" | "gnssDilution" | "gnssAltitude"
  // Broadcast-only — wind
  | "windAngle" | "windSpeed"
  // Broadcast-only — environment
  | "depthBelowKeel" | "depthBelowTransducer" | "waterTemp" | "waterLevel"
  // Broadcast-only — electrical
  | "battVoltage" | "battCurrent" | "battTemp" | "battTimeRemaining";

export interface SensorReading {
  stream: SensorStream;
  value: number;
  unit: string;
  timestamp: Date;
}

export interface EmissionsBroadcast {
  stream: "co2";
  value: number;
  unit: "kg/h";
  fuelType: string;
  cacheHit: boolean;
  timestamp: string;
}

export interface SensorBroadcast {
  stream: SensorStream | "co2";
  value: number;
  unit: string;
  timestamp: string;
}
