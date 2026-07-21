import { describe, expect, test } from "@jest/globals";
import {
  checksum,
  parseGGA,
  parseGLL,
  parseHDG,
  parseXDR,
  parseSentence,
  parseVHW,
  parseVLW,
  parseVTG,
} from "../adapter/nmea.js";

function withChecksum(body: string): string {
  return `${body}*${checksum(body)}`;
}

function byStream(readings: ReturnType<typeof parseSentence>) {
  return Object.fromEntries(readings.map((reading) => [reading.stream, reading]));
}

describe("NMEA navigation parsing", () => {
  test("parses simulator environment and tank XDR streams", () => {
    const depthKeel = parseXDR(withChecksum("$IIXDR,D,16.50,M,DEPTH_KEEL"));
    const depthTransducer = parseXDR(withChecksum("$IIXDR,D,18.00,M,DEPTH_TRANSDUCER"));
    const waterTemp = parseXDR(withChecksum("$IIXDR,C,14.80,C,WATER_TEMP"));
    const waterLevel = parseXDR(withChecksum("$IIXDR,P,74.00,%,WATER_LEVEL"));

    expect(depthKeel?.stream).toBe("depthBelowKeel");
    expect(depthKeel?.unit).toBe("m");
    expect(depthTransducer?.stream).toBe("depthBelowTransducer");
    expect(waterTemp?.stream).toBe("waterTemp");
    expect(waterLevel?.stream).toBe("waterLevel");
    expect(waterLevel?.unit).toBe("%");
  });

  test("parses VTG course and speed over ground", () => {
    const readings = byStream(parseVTG(withChecksum("$IIVTG,207.4,T,,M,8.62,N,15.96,K")));

    expect(readings.cog?.value).toBeCloseTo(207.4, 1);
    expect(readings.cog?.unit).toBe("°T");
    expect(readings.sog?.value).toBeCloseTo(8.62, 2);
    expect(readings.sog?.unit).toBe("kn");
  });

  test("parses VHW speed through water", () => {
    const readings = byStream(parseVHW(withChecksum("$IIVHW,,T,,M,8.11,N,15.02,K")));

    expect(readings.stw?.value).toBeCloseTo(8.11, 2);
    expect(readings.stw?.unit).toBe("kn");
    expect(readings.stwRefType?.unit).toBe("paddlewheel");
  });

  test("parses HDG heading and signed west variation", () => {
    const readings = byStream(parseHDG(withChecksum("$IIHDG,205.3,,,13.2,W")));

    expect(readings.heading?.value).toBeCloseTo(205.3, 1);
    expect(readings.magVariation?.value).toBeCloseTo(-13.2, 1);
  });

  test("parses GGA GNSS position, quality, and altitude", () => {
    const readings = byStream(
      parseGGA(withChecksum("$IIGGA,231530,3746.4940,N,12225.1640,W,1,12,0.82,4.7,M,0.0,M,,"))
    );

    expect(readings.positionLat?.value).toBeCloseTo(37.7749, 4);
    expect(readings.positionLon?.value).toBeCloseTo(-122.4194, 4);
    expect(readings.gnssSatellites?.value).toBe(12);
    expect(readings.gnssDilution?.value).toBeCloseTo(0.82, 2);
    expect(readings.gnssAltitude?.value).toBeCloseTo(4.7, 1);
  });

  test("parses GLL position", () => {
    const readings = byStream(parseGLL(withChecksum("$IIGLL,3746.4940,N,12225.1640,W,231530,A,A")));

    expect(readings.positionLat?.value).toBeCloseTo(37.7749, 4);
    expect(readings.positionLon?.value).toBeCloseTo(-122.4194, 4);
  });

  test("parses VLW total and trip log", () => {
    const readings = byStream(parseVLW(withChecksum("$IIVLW,1284.22,N,0.02,N,,N,,N")));

    expect(readings.navLog?.value).toBeCloseTo(1284.22, 2);
    expect(readings.tripLog?.value).toBeCloseTo(0.02, 2);
  });
});
