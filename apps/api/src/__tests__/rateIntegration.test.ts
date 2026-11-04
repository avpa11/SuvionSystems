import { describe, expect, test } from "@jest/globals";
import {
  integrateRateSamples,
  integrateRateSamplesByHour,
} from "../services/rateIntegration.js";

describe("rate integration helpers", () => {
  test("integrates repeated rate samples over elapsed time", () => {
    const start = new Date("2026-06-01T00:00:00.000Z");
    const end = new Date("2026-06-01T01:00:00.000Z");
    const total = integrateRateSamples(
      [
        { value: 12, timestamp: new Date("2026-06-01T00:00:00.000Z") },
        { value: 12, timestamp: new Date("2026-06-01T00:15:00.000Z") },
        { value: 12, timestamp: new Date("2026-06-01T00:30:00.000Z") },
        { value: 12, timestamp: new Date("2026-06-01T00:45:00.000Z") },
      ],
      start,
      end,
      3_600_000,
    );

    expect(total.total).toBe(12);
    expect(total.averageRate).toBe(12);
    expect(total.observedSeconds).toBe(3600);
  });

  test("splits an interval across UTC hour buckets", () => {
    const buckets = integrateRateSamplesByHour(
      [{ value: 10, timestamp: new Date("2026-06-01T00:30:00.000Z") }],
      new Date("2026-06-01T00:30:00.000Z"),
      new Date("2026-06-01T01:30:00.000Z"),
      3_600_000,
    );

    expect(buckets).toHaveLength(2);
    expect(buckets[0].total).toBe(5);
    expect(buckets[1].total).toBe(5);
    expect(buckets[0].averageRate).toBe(10);
    expect(buckets[1].averageRate).toBe(10);
  });
});

describe("missing and malformed samples", () => {
  const start = new Date("2026-06-01T00:00:00Z");
  const end = new Date("2026-06-02T00:00:00Z");
  test("a stopped feed cannot project a single rate across a day", () => {
    const samples = [{ value: 12, timestamp: start }];
    const total = integrateRateSamples(samples, start, end);
    expect(total.total).toBe(1);
    expect(total.observedSeconds).toBe(300);
    expect(
      integrateRateSamplesByHour(samples, start, end).reduce(
        (sum, row) => sum + row.total,
        0,
      ),
    ).toBe(total.total);
  });
  test("includes a fresh sample before the requested boundary and excludes invalid rates", () => {
    const total = integrateRateSamples(
      [
        { value: 12, timestamp: new Date(start.getTime() - 60_000) },
        { value: Infinity, timestamp: new Date(start.getTime() + 60_000) },
        { value: -1, timestamp: new Date(start.getTime() + 90_000) },
      ],
      start,
      end,
    );
    expect(total.observedSeconds).toBe(240);
    expect(total.total).toBeCloseTo(0.8);
  });
  test("duplicate timestamps use the last reading without double counting", () => {
    const samples = [
      { value: 10, timestamp: start },
      { value: 20, timestamp: start },
    ];
    expect(integrateRateSamples(samples, start, end).total).toBeCloseTo(
      20 / 12,
    );
  });
});
