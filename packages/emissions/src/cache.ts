import { calculateCO2 } from "./calculate.js";
import { CACHE_TTL_MS, type FuelType } from "./constants.js";

export interface CacheEntry {
  fuelType: FuelType;
  consumptionL: number;
  co2Kg: number;
  computedAt: number;
  cacheHit: boolean;
}

/**
 * In-memory cache for emissions computations.
 *
 * Cache key includes fuelType so a fuel-type change immediately invalidates
 * the stored value rather than serving stale data for up to 60 seconds.
 */
export class EmissionsCache {
  private entry: CacheEntry | null = null;
  private readonly ttlMs: number;

  constructor(ttlMs = CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(fuelType: FuelType, consumptionL: number): CacheEntry {
    const now = Date.now();
    if (
      this.entry !== null &&
      this.entry.fuelType === fuelType &&
      this.entry.consumptionL === consumptionL &&
      now - this.entry.computedAt < this.ttlMs
    ) {
      return { ...this.entry, cacheHit: true };
    }

    const co2Kg = calculateCO2(fuelType, consumptionL);
    this.entry = {
      fuelType,
      consumptionL,
      co2Kg,
      computedAt: now,
      cacheHit: false,
    };
    return { ...this.entry };
  }

  /** Force-expire the cache (e.g. on adapter reconnect). */
  invalidate(): void {
    this.entry = null;
  }

  get lastEntry(): CacheEntry | null {
    return this.entry ? { ...this.entry } : null;
  }
}
