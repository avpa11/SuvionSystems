/**
 * IMO GHG emission factors (kg CO₂ per kg of fuel).
 * Primary regulatory calculation source: IMO MEPC.352(78) CII G1.
 * Conversion-factor references: MEPC.308(73), as amended, and MEPC.364(79).
 *
 * These factors are mass-basis values. Volume-based readings are first
 * converted to fuel mass with the representative densities below.
 */
export const EMISSION_FACTORS: Record<FuelType, number> = {
  diesel: 3.206,
  MGO: 3.206,
  MDO: 3.206,
  HFO: 3.114,
  LNG: 2.750,
};

/** Legacy MEPC.245(66) fallback MDO factor kept for auditability only. */
export const MDO_FACTOR_MEPC_245_66 = 3.179;

/**
 * Fuel density (kg/L) — representative values for emission calculations.
 * Sources: ISO 8217 (marine fuels) and ISO 6578 (LNG).
 */
export const FUEL_DENSITY: Record<FuelType, number> = {
  diesel: 0.840,
  MGO: 0.875,
  MDO: 0.875,
  HFO: 0.991,
  LNG: 0.450,
};

export type FuelType = "diesel" | "MGO" | "MDO" | "HFO" | "LNG";

export const FUEL_TYPES: FuelType[] = ["diesel", "MGO", "MDO", "HFO", "LNG"];

export function isFuelType(value: string): value is FuelType {
  return FUEL_TYPES.includes(value as FuelType);
}

/** Emissions cache TTL in milliseconds (60 seconds). */
export const CACHE_TTL_MS = 60_000;

/**
 * Fuel consumption rate above which a reporting period is flagged
 * non-compliant in generated reports (L/h, hourly average).
 */
export const NON_COMPLIANT_FUEL_RATE_LH = 15;

/** CO₂ emission rate threshold for non-compliant flagging (kg/h). */
export const NON_COMPLIANT_CO2_RATE_KGH = 45;
