import dgram from "dgram";
import { log } from "@repo/logger";
import type { SensorReading as SensorReadingType } from "../types.js";

const NMEA_PORT = parseInt(process.env.NMEA_PORT ?? "10110", 10);

/** Compute NMEA checksum (XOR of bytes between $ and *). */
function checksum(sentence: string): string {
  let cs = 0;
  for (let i = 1; i < sentence.length; i++) {
    if (sentence[i] === "*") break;
    cs ^= sentence.charCodeAt(i);
  }
  return cs.toString(16).toUpperCase().padStart(2, "0");
}

function validateChecksum(sentence: string): boolean {
  const starIdx = sentence.lastIndexOf("*");
  if (starIdx < 0) return false;
  const body = sentence.slice(1, starIdx);
  const provided = sentence.slice(starIdx + 1).trim().toUpperCase();
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return cs.toString(16).toUpperCase().padStart(2, "0") === provided;
}

/**
 * Parse an $IIXDR transducer sentence into a sensor reading.
 * Format: $IIXDR,<type>,<value>,<unit>,<name>*<checksum>
 *
 * Stream mapping:
 *   FUEL_FLOW  → stream: "fuel",        unit: "L/h"
 *   GEN_CURR   → stream: "generator",   unit: "A"
 *   WATER_USE  → stream: "water",       unit: "L/h"
 *   TEMP       → stream: "temperature", unit: "C"
 *   DEPTH_KEEL → stream: "depthBelowKeel", unit: "m"
 *   DEPTH_TRANSDUCER → stream: "depthBelowTransducer", unit: "m"
 *   WATER_TEMP → stream: "waterTemp", unit: "C"
 *   WATER_LEVEL → stream: "waterLevel", unit: "%"
 */
function parseXDR(sentence: string): SensorReadingType | null {
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");

  if (parts.length < 5 || parts[0] !== "$IIXDR") return null;
  if (!validateChecksum(sentence)) {
    log(`NMEA checksum mismatch: ${sentence}`);
    return null;
  }

  const rawValue = parseFloat(parts[2] ?? "");
  if (isNaN(rawValue)) return null;

  const name = (parts[4] ?? "").trim();

  const streamMap: Record<string, { stream: SensorReadingType["stream"]; unit: string }> = {
    FUEL_FLOW: { stream: "fuel", unit: "L/h" },
    GEN_CURR: { stream: "generator", unit: "A" },
    WATER_USE: { stream: "water", unit: "L/h" },
    TEMP: { stream: "temperature", unit: "C" },
    DEPTH_KEEL: { stream: "depthBelowKeel", unit: "m" },
    DEPTH_TRANSDUCER: { stream: "depthBelowTransducer", unit: "m" },
    WATER_TEMP: { stream: "waterTemp", unit: "C" },
    WATER_LEVEL: { stream: "waterLevel", unit: "%" },
  };

  const mapping = streamMap[name];
  if (!mapping) return null;

  return { stream: mapping.stream, value: rawValue, unit: mapping.unit, timestamp: new Date() };
}

/**
 * Parse a $IIHDM magnetic heading sentence.
 * Format: $IIHDM,<degrees>,M*<checksum>
 */
function parseHDM(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 3 || parts[0] !== "$IIHDM") return [];
  const heading = parseFloat(parts[1] ?? "");
  if (isNaN(heading)) return [];
  return [{ stream: "heading" as const, value: heading, unit: "°", timestamp: new Date() }];
}

/**
 * Parse a $IIHDG magnetic heading sentence.
 * Format: $IIHDG,<heading>,<deviation>,<E/W>,<variation>,<E/W>*<checksum>
 */
function parseHDG(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 2 || parts[0] !== "$IIHDG") return [];

  const heading = parseFloat(parts[1] ?? "");
  const variation = parseFloat(parts[4] ?? "");
  const variationDir = (parts[5] ?? "").trim().toUpperCase();
  const now = new Date();
  const readings: SensorReadingType[] = [];

  if (!isNaN(heading)) {
    readings.push({ stream: "heading" as const, value: heading, unit: "°", timestamp: now });
  }

  if (!isNaN(variation)) {
    const signedVariation = variationDir === "W" ? -variation : variation;
    readings.push({ stream: "magVariation" as const, value: signedVariation, unit: "°", timestamp: now });
  }

  return readings;
}

/**
 * Parse a $IIMWV apparent wind sentence.
 * Format: $IIMWV,<angle 0-360>,R,<speed>,M,A*<checksum>
 * Emits two readings: windAngle (signed ±180°) and windSpeed (m/s).
 */
function parseMWV(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 6 || parts[0] !== "$IIMWV") return [];
  if ((parts[5] ?? "").trim() !== "A") return [];
  const angle0360 = parseFloat(parts[1] ?? "");
  const speed = parseFloat(parts[3] ?? "");
  if (isNaN(angle0360) || isNaN(speed)) return [];
  const signedAngle = angle0360 > 180 ? angle0360 - 360 : angle0360;
  const now = new Date();
  return [
    { stream: "windAngle" as const, value: signedAngle, unit: "°", timestamp: now },
    { stream: "windSpeed" as const, value: speed, unit: "m/s", timestamp: now },
  ];
}

function parseLatLon(raw: string | undefined, hemisphere: string | undefined): number | null {
  if (!raw || !hemisphere) return null;
  const value = parseFloat(raw);
  if (isNaN(value)) return null;

  const hemi = hemisphere.trim().toUpperCase();
  const degreeDigits = hemi === "N" || hemi === "S" ? 2 : 3;
  const degrees = parseInt(raw.slice(0, degreeDigits), 10);
  const minutes = parseFloat(raw.slice(degreeDigits));
  if (isNaN(degrees) || isNaN(minutes)) return null;

  const sign = hemi === "S" || hemi === "W" ? -1 : 1;
  return sign * (degrees + minutes / 60);
}

/**
 * Parse a $IIVTG course/speed sentence.
 * Format: $IIVTG,<COG true>,T,<COG magnetic>,M,<SOG knots>,N,<SOG km/h>,K*<checksum>
 */
function parseVTG(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 8 || parts[0] !== "$IIVTG") return [];

  const cog = parseFloat(parts[1] ?? "");
  const sog = parseFloat(parts[5] ?? "");
  const now = new Date();
  const readings: SensorReadingType[] = [];

  if (!isNaN(cog)) readings.push({ stream: "cog" as const, value: cog, unit: "°T", timestamp: now });
  if (!isNaN(sog)) readings.push({ stream: "sog" as const, value: sog, unit: "kn", timestamp: now });

  return readings;
}

/**
 * Parse a $IIVHW speed-through-water sentence.
 * Format: $IIVHW,<heading true>,T,<heading magnetic>,M,<speed knots>,N,<speed km/h>,K*<checksum>
 */
function parseVHW(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 8 || parts[0] !== "$IIVHW") return [];

  const stw = parseFloat(parts[5] ?? "");
  if (isNaN(stw)) return [];

  const now = new Date();
  return [
    { stream: "stw" as const, value: stw, unit: "kn", timestamp: now },
    { stream: "stwRefType" as const, value: 1, unit: "paddlewheel", timestamp: now },
  ];
}

/**
 * Parse a $IIGGA GNSS fix sentence.
 * Format: $IIGGA,<time>,<lat>,N/S,<lon>,E/W,<fix>,<sat>,<hdop>,<alt>,M,...*<checksum>
 */
function parseGGA(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 10 || parts[0] !== "$IIGGA") return [];
  if ((parts[6] ?? "0") === "0") return [];

  const lat = parseLatLon(parts[2], parts[3]);
  const lon = parseLatLon(parts[4], parts[5]);
  const satellites = parseFloat(parts[7] ?? "");
  const hdop = parseFloat(parts[8] ?? "");
  const altitude = parseFloat(parts[9] ?? "");
  const now = new Date();
  const readings: SensorReadingType[] = [];

  if (lat !== null) readings.push({ stream: "positionLat" as const, value: lat, unit: "°", timestamp: now });
  if (lon !== null) readings.push({ stream: "positionLon" as const, value: lon, unit: "°", timestamp: now });
  if (!isNaN(satellites)) readings.push({ stream: "gnssSatellites" as const, value: satellites, unit: "count", timestamp: now });
  if (!isNaN(hdop)) readings.push({ stream: "gnssDilution" as const, value: hdop, unit: "HDOP", timestamp: now });
  if (!isNaN(altitude)) readings.push({ stream: "gnssAltitude" as const, value: altitude, unit: "m", timestamp: now });

  return readings;
}

/**
 * Parse a $IIGLL geographic position sentence.
 * Format: $IIGLL,<lat>,N/S,<lon>,E/W,<time>,A,A*<checksum>
 */
function parseGLL(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 7 || parts[0] !== "$IIGLL") return [];
  if ((parts[6] ?? "").trim().toUpperCase() !== "A") return [];

  const lat = parseLatLon(parts[1], parts[2]);
  const lon = parseLatLon(parts[3], parts[4]);
  const now = new Date();
  const readings: SensorReadingType[] = [];

  if (lat !== null) readings.push({ stream: "positionLat" as const, value: lat, unit: "°", timestamp: now });
  if (lon !== null) readings.push({ stream: "positionLon" as const, value: lon, unit: "°", timestamp: now });

  return readings;
}

/**
 * Parse a $IIVLW distance log sentence.
 * Format: $IIVLW,<total>,N,<since reset>,N,<trip>,N,<trip since reset>,N*<checksum>
 */
function parseVLW(sentence: string): SensorReadingType[] {
  if (!validateChecksum(sentence)) return [];
  const starIdx = sentence.lastIndexOf("*");
  const body = starIdx > 0 ? sentence.slice(0, starIdx) : sentence;
  const parts = body.split(",");
  if (parts.length < 5 || parts[0] !== "$IIVLW") return [];

  const totalLog = parseFloat(parts[1] ?? "");
  const tripLog = parseFloat(parts[3] ?? "");
  const now = new Date();
  const readings: SensorReadingType[] = [];

  if (!isNaN(totalLog)) readings.push({ stream: "navLog" as const, value: totalLog, unit: "NM", timestamp: now });
  if (!isNaN(tripLog)) readings.push({ stream: "tripLog" as const, value: tripLog, unit: "NM", timestamp: now });

  return readings;
}

/** Dispatch a raw sentence to the appropriate parser. */
function parseSentence(sentence: string): SensorReadingType[] {
  if (sentence.startsWith("$IIXDR")) {
    const r = parseXDR(sentence);
    return r ? [r] : [];
  }
  if (sentence.startsWith("$IIHDM")) return parseHDM(sentence);
  if (sentence.startsWith("$IIHDG")) return parseHDG(sentence);
  if (sentence.startsWith("$IIMWV")) return parseMWV(sentence);
  if (sentence.startsWith("$IIVTG")) return parseVTG(sentence);
  if (sentence.startsWith("$IIVHW")) return parseVHW(sentence);
  if (sentence.startsWith("$IIGGA")) return parseGGA(sentence);
  if (sentence.startsWith("$IIGLL")) return parseGLL(sentence);
  if (sentence.startsWith("$IIVLW")) return parseVLW(sentence);
  return [];
}

/**
 * Start a UDP listener on NMEA_PORT.
 * Calls onReading for every successfully parsed sentence.
 * Returns a cleanup function.
 */
export function startNmeaListener(
  onReading: (r: SensorReadingType) => void
): () => void {
  const socket = dgram.createSocket("udp4");

  socket.on("message", (msg) => {
    const sentence = msg.toString("utf8").trim();
    for (const reading of parseSentence(sentence)) {
      onReading(reading);
    }
  });

  socket.on("error", (err) => log(`NMEA UDP error: ${err.message}`));

  socket.bind(NMEA_PORT, () => {
    log(`NMEA UDP listener bound on port ${NMEA_PORT}`);
  });

  return () => socket.close();
}

export {
  checksum,
  validateChecksum,
  parseXDR,
  parseHDM,
  parseHDG,
  parseMWV,
  parseVTG,
  parseVHW,
  parseGGA,
  parseGLL,
  parseVLW,
  parseSentence,
};
