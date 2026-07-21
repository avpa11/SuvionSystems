import { describe, expect, test } from "@jest/globals";
import { integrateRateSamples, integrateRateSamplesByHour } from "../services/rateIntegration.js";

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
      end
    );

    expect(total.total).toBe(12);
    expect(total.averageRate).toBe(12);
    expect(total.observedSeconds).toBe(3600);
  });

  test("splits an interval across UTC hour buckets", () => {
    const buckets = integrateRateSamplesByHour(
      [{ value: 10, timestamp: new Date("2026-06-01T00:30:00.000Z") }],
      new Date("2026-06-01T00:30:00.000Z"),
      new Date("2026-06-01T01:30:00.000Z")
    );

    expect(buckets).toHaveLength(2);
    expect(buckets[0].total).toBe(5);
    expect(buckets[1].total).toBe(5);
    expect(buckets[0].averageRate).toBe(10);
    expect(buckets[1].averageRate).toBe(10);
  });
});
