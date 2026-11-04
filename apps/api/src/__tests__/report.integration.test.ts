/**
 * Integration tests for GET /report.
 *
 * These tests hit a real in-memory MongoDB (via mongomemoryserver) to verify:
 *   1. Report produced within 5 s (wall-clock)
 *   2. Required fields present (schema validation)
 *   3. Non-compliant periods correctly flagged
 *
 * Run: yarn workspace api test
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import * as AjvModule from "ajv";
import type {
  Ajv as AjvInstance,
  Options as AjvOptions,
  Plugin as AjvPlugin,
} from "ajv";
import _addFormats from "ajv-formats";

const addFormats = _addFormats as unknown as AjvPlugin<object>;
import reportRouter from "../routes/report.js";
import {
  SensorReading,
  EmissionsReading,
  syncMongoValidation,
} from "../db/mongodb.js";
import { reportSchema } from "../schemas/report-schema.js";

let mongod: MongoMemoryServer | undefined;
const app = express();
app.use(express.json());
app.use("/report", reportRouter);

type AjvConstructor = new (opts?: AjvOptions) => AjvInstance;

const Ajv = AjvModule.default as unknown as AjvConstructor;
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateReport = ajv.compile(reportSchema);

const START = "2026-05-01T00:00:00.000Z";
const END = "2026-05-02T00:00:00.000Z";
const MONTH_START = "2026-05-01T00:00:00.000Z";
const MONTH_END = "2026-05-31T23:59:59.000Z";

async function seedSensorData(): Promise<void> {
  const base = new Date("2026-05-01T00:00:00Z");

  const sensorDocs = [];
  const emissionsDocs = [];

  for (let h = 0; h < 24; h++) {
    const ts = new Date(base.getTime() + h * 3_600_000);

    // Fuel flow: alternates between compliant (10 L/h) and non-compliant (20 L/h)
    const fuelRate = h % 4 === 0 ? 20 : 10;

    sensorDocs.push({
      stream: "fuel",
      value: fuelRate,
      unit: "L/h",
      timestamp: ts,
    });
    sensorDocs.push({ stream: "water", value: 12, unit: "L/h", timestamp: ts });
    sensorDocs.push({
      stream: "generator",
      value: 8.5,
      unit: "A",
      timestamp: ts,
    });
    sensorDocs.push({
      stream: "temperature",
      value: 21.5,
      unit: "C",
      timestamp: ts,
    });

    const co2 = fuelRate * 0.84 * 3.206;
    emissionsDocs.push({
      fuelType: "diesel",
      consumptionL: fuelRate,
      co2Kg: co2,
      cacheHit: false,
      timestamp: ts,
    });
  }

  await SensorReading.insertMany(sensorDocs);
  await EmissionsReading.insertMany(emissionsDocs);
}

beforeAll(async () => {
  process.env.REPORT_MAX_SAMPLE_AGE_SECONDS = "3600"; // Fixture samples arrive once per hour.
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await syncMongoValidation();
  await seedSensorData();
});

afterAll(async () => {
  delete process.env.REPORT_MAX_SAMPLE_AGE_SECONDS;
  await mongoose.disconnect();
  await mongod?.stop();
});

// ─── 1. Schema validation ────────────────────────────────────────────────────

describe("GET /report — schema validation", () => {
  test("response contains all required fields", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);

    const valid = validateReport(res.body);
    expect(valid).toBe(true);
    if (!valid) console.error("Schema errors:", validateReport.errors);
  });

  test("required field: vesselId present", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);
    expect(res.body).toHaveProperty("vesselId");
  });

  test("required field: fuelConsumedL is a non-negative number", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);
    expect(typeof res.body.fuelConsumedL).toBe("number");
    expect(res.body.fuelConsumedL).toBeGreaterThanOrEqual(0);
  });

  test("required field: co2EmittedKg is a non-negative number", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);
    expect(typeof res.body.co2EmittedKg).toBe("number");
    expect(res.body.co2EmittedKg).toBeGreaterThanOrEqual(0);
  });

  test("required field: nonCompliantPeriods is an array", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);
    expect(Array.isArray(res.body.nonCompliantPeriods)).toBe(true);
  });

  test("includes calculation basis and validation source metadata", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);
    expect(res.body.calculationBasis.fuel).toMatch(/rates in L\/h/);
    expect(res.body.validationSources.length).toBeGreaterThanOrEqual(5);
  });

  test("includes visual report data, benchmarks, and CO2 impact facts", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);

    expect(["compliant", "watch", "warning"]).toContain(res.body.summaryStatus);
    expect(res.body.industryComparisons.length).toBeGreaterThanOrEqual(6);
    expect(res.body.hourlySeries.length).toBeGreaterThan(0);
    expect(
      res.body.co2ImpactFacts.map((fact: { id: string }) => fact.id),
    ).toEqual(
      expect.arrayContaining([
        "passenger-vehicle-years",
        "gasoline-gallon-equivalent",
      ]),
    );
    expect(res.body.reportInsights.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── 2. Non-compliant period detection ───────────────────────────────────────

describe("GET /report — non-compliant period detection", () => {
  test("flags hours where fuel consumption exceeds threshold", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);

    const periods: { reason: string; value: number }[] =
      res.body.nonCompliantPeriods;
    const highFuel = periods.filter((p) => p.reason === "HIGH_FUEL_USAGE");

    // h % 4 === 0 → hours 0, 4, 8, 12, 16, 20 (6 hours at 20 L/h > 15 L/h threshold)
    expect(highFuel.length).toBeGreaterThanOrEqual(1);
    highFuel.forEach((p) => expect(p.value).toBeGreaterThan(15));
  });

  test("compliant periods are not flagged", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);

    const periods: { value: number; threshold: number }[] =
      res.body.nonCompliantPeriods;
    periods.forEach((p) => expect(p.value).toBeGreaterThan(p.threshold));
  });

  test("an hour breaching both thresholds reports HIGH_FUEL_USAGE and HIGH_CO2", async () => {
    // Seed hours run at 20 L/h every 4th hour → CO₂ = 20 × 0.840 × 3.206 ≈ 53.9 kg/h,
    // which exceeds BOTH the 15 L/h fuel and 45 kg/h CO₂ thresholds. Regression guard:
    // previously the else-if masked the CO₂ breach behind the fuel breach.
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);

    const periods: { start: string; reason: string }[] =
      res.body.nonCompliantPeriods;

    // Pick a known breach hour (hour 0 → 20 L/h) and confirm both reasons are present for it.
    const breachHour = "2026-05-01T00:00:00.000Z";
    const reasonsForHour = periods
      .filter((p) => p.start === breachHour)
      .map((p) => p.reason);
    expect(reasonsForHour).toContain("HIGH_FUEL_USAGE");
    expect(reasonsForHour).toContain("HIGH_CO2");
  });
});

// ─── 3. Response time ≤ 5 s ──────────────────────────────────────────────────

describe("GET /report — performance", () => {
  const RANGES = [
    { label: "1-day", start: START, end: END },
    {
      label: "1-week",
      start: "2026-05-01T00:00:00.000Z",
      end: "2026-05-07T23:59:59.000Z",
    },
    { label: "1-month", start: MONTH_START, end: MONTH_END },
  ];

  RANGES.forEach(({ label, start, end }) => {
    test(`${label} range returns within 5 s`, async () => {
      const t0 = Date.now();
      await request(app)
        .get(`/report?startDate=${start}&endDate=${end}`)
        .expect(200);
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(5000);
    });
  });

  test("50 concurrent 1-day requests all return within 5 s", async () => {
    const reqs = Array.from({ length: 50 }, () =>
      request(app).get(`/report?startDate=${START}&endDate=${END}`),
    );
    const t0 = Date.now();
    const results = await Promise.all(reqs);
    const elapsed = Date.now() - t0;

    results.forEach((r) => expect(r.status).toBe(200));
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);
});

// ─── 4. CSV export ────────────────────────────────────────────────────────────

describe("GET /report?format=csv", () => {
  test("returns text/csv content-type", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}&format=csv`)
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
  });

  test("CSV contains all 12 required field labels", async () => {
    const res = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}&format=csv`)
      .expect(200);

    const csv = res.text;
    const requiredLabels = [
      "Vessel ID",
      "Report Period Start",
      "Report Period End",
      "Generated At",
      "Operational Target Status",
      "Fuel Type",
      "Fuel Consumed",
      "CO2 Emitted",
      "Water Usage",
      "Generator Current",
      "Avg Temperature",
      "Carbon Intensity",
      "Threshold Exceedances",
    ];
    requiredLabels.forEach((label) => {
      expect(csv).toContain(label);
    });
  });
});

// ─── 5. Input validation ──────────────────────────────────────────────────────

describe("GET /report — input validation", () => {
  test("missing startDate returns 400", async () => {
    await request(app).get(`/report?endDate=${END}`).expect(400);
  });

  test("missing endDate returns 400", async () => {
    await request(app).get(`/report?startDate=${START}`).expect(400);
  });

  test("startDate after endDate returns 400", async () => {
    await request(app)
      .get(`/report?startDate=${END}&endDate=${START}`)
      .expect(400);
  });

  test("invalid fuelType returns 400", async () => {
    await request(app)
      .get(`/report?startDate=${START}&endDate=${END}&fuelType=petrol`)
      .expect(400);
  });
});

// ─── 6. Rate-vs-volume regression ───────────────────────────────────────────

describe("GET /report — rate integration", () => {
  test("multiple samples in one hour are integrated as rates, not summed as litres", async () => {
    const start = "2026-06-01T00:00:00.000Z";
    const end = "2026-06-01T01:00:00.000Z";
    const timestamps = [
      "2026-06-01T00:00:00.000Z",
      "2026-06-01T00:15:00.000Z",
      "2026-06-01T00:30:00.000Z",
      "2026-06-01T00:45:00.000Z",
    ];

    await SensorReading.insertMany(
      timestamps.flatMap((timestamp) => [
        { stream: "fuel", value: 12, unit: "L/h", timestamp },
        { stream: "water", value: 8, unit: "L/h", timestamp },
        { stream: "generator", value: 7, unit: "A", timestamp },
        { stream: "temperature", value: 20, unit: "C", timestamp },
      ]),
    );
    await EmissionsReading.insertMany(
      timestamps.map((timestamp) => ({
        fuelType: "diesel",
        fuelRateLh: 12,
        co2RateKgh: 12 * 0.84 * 3.206,
        consumptionL: 12,
        co2Kg: 12 * 0.84 * 3.206,
        cacheHit: false,
        timestamp,
      })),
    );

    const res = await request(app)
      .get(`/report?startDate=${start}&endDate=${end}`)
      .expect(200);

    expect(res.body.fuelConsumedL).toBeCloseTo(12, 2);
    expect(res.body.waterUsageL).toBeCloseTo(8, 2);
    expect(res.body.co2EmittedKg).toBeCloseTo(32.32, 1);
  });
});

describe("GET /report — release regressions", () => {
  test.each([
    `startDate=${START}&startDate=${END}&endDate=${END}`,
    `startDate=${START}&endDate=${END}&format=xml`,
    `startDate=2026-05-01&endDate=2026-05-02`,
    `startDate=${START}&endDate=2026-07-01T00:00:00Z`,
  ])("rejects malformed or unbounded requests: %s", async (query) => {
    await request(app).get(`/report?${query}`).expect(400);
  });
  test("an empty period is explicitly marked as missing observations", async () => {
    const res = await request(app)
      .get(
        "/report?startDate=2026-06-10T00:00:00Z&endDate=2026-06-11T00:00:00Z",
      )
      .expect(200);
    expect(res.body.dataCoverage.status).toBe("no_data");
    expect(res.body.summaryStatus).not.toBe("compliant");
    expect(res.body.fuelConsumedL).toBe(0);
  });
  test("does not extend a day of recorded readings over an entire month", async () => {
    const day = await request(app)
      .get(`/report?startDate=${START}&endDate=${END}`)
      .expect(200);
    const month = await request(app)
      .get(`/report?startDate=${MONTH_START}&endDate=${MONTH_END}`)
      .expect(200);
    expect(month.body.fuelConsumedL).toBe(day.body.fuelConsumedL);
    expect(month.body.dataCoverage.status).toBe("partial");
  });
  test("CSV neutralizes spreadsheet formulas in configured identifiers", async () => {
    const original = process.env.VESSEL_ID;
    process.env.VESSEL_ID = '=HYPERLINK("https://example.com")';
    try {
      const res = await request(app)
        .get(`/report?startDate=${START}&endDate=${END}&format=csv`)
        .expect(200);
      expect(res.text).toContain("\"'=HYPERLINK");
    } finally {
      if (original === undefined) delete process.env.VESSEL_ID;
      else process.env.VESSEL_ID = original;
    }
  });
});

describe("MongoDB collection validation", () => {
  test("accepts a real zero reading and rejects undeclared identity fields", async () => {
    const collection = mongoose.connection.db!.collection("sensorreadings");
    const zero = {
      stream: "fuel",
      value: 0,
      unit: "L/h",
      timestamp: new Date("2026-06-20T00:00:00Z"),
    };
    await expect(collection.insertOne(zero)).resolves.toHaveProperty(
      "insertedId",
    );
    await expect(
      collection.insertOne({ ...zero, crewName: "test" }),
    ).rejects.toMatchObject({ code: 121 });
  });
});
