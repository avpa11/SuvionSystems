import {
  EMISSION_FACTORS,
  FUEL_DENSITY,
  isFuelType,
  type FuelType,
} from "./constants.js";

export class FuelTypeError extends Error {
  constructor(fuelType: string) {
    super(
      `Unknown fuel type: "${fuelType}". Valid types: diesel, MGO, MDO, HFO, LNG`,
    );
    this.name = "FuelTypeError";
  }
}

/**
 * Calculate CO₂ mass from a fuel consumption volume.
 *
 * Formula (IMO MEPC.352(78) CII G1):
 *   CO₂ (kg) = consumptionL × density (kg/L) × Cf (kg CO₂/kg fuel)
 *
 * @param fuelType  Fuel type identifier
 * @param consumptionL  Fuel volume consumed (litres)
 * @returns CO₂ mass in kilograms
 */
export function calculateCO2(fuelType: FuelType, consumptionL: number): number {
  if (!isFuelType(fuelType)) {
    throw new FuelTypeError(fuelType);
  }
  if (!Number.isFinite(consumptionL) || consumptionL < 0) {
    throw new RangeError(`consumptionL must be ≥ 0, got ${consumptionL}`);
  }
  const fuelMassKg = consumptionL * FUEL_DENSITY[fuelType];
  return fuelMassKg * EMISSION_FACTORS[fuelType];
}

/** Carbon intensity: kg CO₂ per litre of fuel consumed. */
export function carbonIntensity(fuelType: FuelType): number {
  if (!isFuelType(fuelType)) throw new FuelTypeError(fuelType);
  return FUEL_DENSITY[fuelType] * EMISSION_FACTORS[fuelType];
}
