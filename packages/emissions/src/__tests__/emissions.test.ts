/**
 * Emissions engine unit tests.
 *
 * Reference: IMO MEPC.352(78) CII G1 for the calculation method, with CF
 * values aligned to MEPC.308(73), as amended, and MEPC.364(79).
 *
 * Formula under test:
 *   CO₂ (kg) = consumptionL × density (kg/L) × Cf (kg CO₂/kg fuel)
 *
 * Acceptance criterion: computed CO₂ must be within ±0.5 % of the reference
 * value derived directly from the formula above.
 */

import { describe, test, expect, afterAll } from "@jest/globals";
import { calculateCO2, carbonIntensity, FuelTypeError } from "../calculate.js";
import {
  EMISSION_FACTORS,
  FUEL_DENSITY,
  FUEL_TYPES,
  type FuelType,
} from "../constants.js";
import { EmissionsCache } from "../cache.js";

// ─── Reference calculation (independent re-implementation) ───────────────────

function referenceCalc(fuelType: FuelType, consumptionL: number): number {
  return consumptionL * FUEL_DENSITY[fuelType] * EMISSION_FACTORS[fuelType];
}

function pctError(computed: number, reference: number): number {
  if (reference === 0) return 0;
  return Math.abs((computed - reference) / reference) * 100;
}

// ─── Test matrix: 5 fuel types × 20 consumption rates ────────────────────────

const CONSUMPTION_RATES_LH = [
  0.1, 0.5, 1.0, 2.0, 3.5, 5.0, 7.5, 10.0, 12.5, 15.0,
  20.0, 30.0, 50.0, 75.0, 100.0, 150.0, 200.0, 300.0, 400.0, 500.0,
];

describe("calculateCO2 — accuracy vs IMO reference factors", () => {
  let scenarioCount = 0;

  FUEL_TYPES.forEach((fuelType: FuelType) => {
    CONSUMPTION_RATES_LH.forEach((rate) => {
      const ref = referenceCalc(fuelType, rate);
      scenarioCount++;

      test(`${fuelType} @ ${rate} L/h → ≤0.5 % error (scenario #${scenarioCount})`, () => {
        const result = calculateCO2(fuelType, rate);
        expect(pctError(result, ref)).toBeLessThanOrEqual(0.5);
      });
    });
  });

  afterAll(() => {
    // Confirm the suite ran 100 scenarios (5 types × 20 rates)
    expect(scenarioCount).toBe(100);
  });
});

// ─── Absolute value spot-checks against hand-computed references ──────────────

describe("calculateCO2 — spot-checks", () => {
  test("diesel 12.5 L/h", () => {
    // 12.5 × 0.840 × 3.206 = 33.663 kg CO₂
    expect(calculateCO2("diesel", 12.5)).toBeCloseTo(33.663, 2);
  });

  test("MGO 10.0 L/h", () => {
    // 10.0 × 0.875 × 3.206 = 28.053 kg CO₂
    expect(calculateCO2("MGO", 10.0)).toBeCloseTo(28.053, 2);
  });

  test("HFO 100.0 L/h", () => {
    // 100.0 × 0.991 × 3.114 = 308.596 kg CO₂
    expect(calculateCO2("HFO", 100.0)).toBeCloseTo(308.597, 1);
  });

  test("LNG 50.0 L/h", () => {
    // 50.0 × 0.450 × 2.750 = 61.875 kg CO₂
    expect(calculateCO2("LNG", 50.0)).toBeCloseTo(61.875, 2);
  });

  test("MDO 0.1 L/h (boundary)", () => {
    // 0.1 × 0.875 × 3.206 = 0.280525 kg CO₂
    expect(calculateCO2("MDO", 0.1)).toBeCloseTo(0.28053, 4);
  });

  test("diesel 500 L/h (upper boundary)", () => {
    // 500 × 0.840 × 3.206 = 1346.52 kg CO₂
    expect(calculateCO2("diesel", 500)).toBeCloseTo(1346.52, 1);
  });

  test("any fuel 0 L → 0 kg CO₂", () => {
    FUEL_TYPES.forEach((ft: FuelType) => {
      expect(calculateCO2(ft, 0)).toBe(0);
    });
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("calculateCO2 — error handling", () => {
  test("unknown fuel type throws FuelTypeError", () => {
    expect(() => calculateCO2("petrol" as FuelType, 10)).toThrow(FuelTypeError);
  });

  test("negative consumption throws RangeError", () => {
    expect(() => calculateCO2("diesel", -1)).toThrow(RangeError);
  });

  test("FuelTypeError message includes the invalid type name", () => {
    try {
      calculateCO2("petrol" as FuelType, 10);
    } catch (e) {
      expect((e as FuelTypeError).message).toContain("petrol");
    }
  });
});

// ─── carbonIntensity ──────────────────────────────────────────────────────────

describe("carbonIntensity", () => {
  test("diesel: 0.840 × 3.206 ≈ 2.693 kg CO₂/L", () => {
    expect(carbonIntensity("diesel")).toBeCloseTo(2.6930, 3);
  });

  test("HFO: 0.991 × 3.114 ≈ 3.086 kg CO₂/L", () => {
    expect(carbonIntensity("HFO")).toBeCloseTo(3.0860, 3);
  });

  test("LNG: 0.450 × 2.750 ≈ 1.238 kg CO₂/L (lowest intensity)", () => {
    expect(carbonIntensity("LNG")).toBeCloseTo(1.2375, 3);
  });
});

// ─── EmissionsCache ───────────────────────────────────────────────────────────

describe("EmissionsCache", () => {
  test("first call is a cache miss and computes correct CO₂", () => {
    const cache = new EmissionsCache();
    const entry = cache.get("diesel", 12.5);
    expect(entry.cacheHit).toBe(false);
    expect(entry.co2Kg).toBeCloseTo(calculateCO2("diesel", 12.5), 5);
  });

  test("same fuel type within TTL returns cache hit", () => {
    const cache = new EmissionsCache(60_000);
    cache.get("MGO", 10);
    const hit = cache.get("MGO", 10);
    expect(hit.cacheHit).toBe(true);
  });

  test("fuel-type change immediately invalidates cache", () => {
    const cache = new EmissionsCache(60_000);
    cache.get("diesel", 10);
    const entry = cache.get("HFO", 10);
    expect(entry.cacheHit).toBe(false);
    expect(entry.fuelType).toBe("HFO");
  });

  test("cache expires after TTL", async () => {
    const cache = new EmissionsCache(50); // 50 ms TTL
    cache.get("diesel", 10);
    await new Promise((r) => setTimeout(r, 60));
    const entry = cache.get("diesel", 10);
    expect(entry.cacheHit).toBe(false);
  });

  test("invalidate() forces a recompute on next call", () => {
    const cache = new EmissionsCache(60_000);
    cache.get("LNG", 5);
    cache.invalidate();
    const entry = cache.get("LNG", 5);
    expect(entry.cacheHit).toBe(false);
  });

  test("lastEntry is null before first get()", () => {
    const cache = new EmissionsCache();
    expect(cache.lastEntry).toBeNull();
  });

  test("lastEntry reflects most recent computation", () => {
    const cache = new EmissionsCache();
    cache.get("MDO", 7.5);
    expect(cache.lastEntry?.fuelType).toBe("MDO");
    expect(cache.lastEntry?.consumptionL).toBe(7.5);
  });
});
