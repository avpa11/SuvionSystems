export { calculateCO2, carbonIntensity, FuelTypeError } from "./calculate.js";
export { EmissionsCache } from "./cache.js";
export {
  EMISSION_FACTORS,
  FUEL_DENSITY,
  FUEL_TYPES,
  CACHE_TTL_MS,
  NON_COMPLIANT_FUEL_RATE_LH,
  NON_COMPLIANT_CO2_RATE_KGH,
  MDO_FACTOR_MEPC_245_66,
} from "./constants.js";
export type { FuelType } from "./constants.js";
export type { CacheEntry } from "./cache.js";
