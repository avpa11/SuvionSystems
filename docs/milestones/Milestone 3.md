# Milestone 3: Emissions Engine & Real-Time Data Pipeline

Deadline **May 12, 2026**

# Goals

## Must

* TypeScript emissions engine (`packages/emissions`) implementing IMO MEPC.361(78) emission factors for diesel, MGO, LNG, HFO, and MDO
* CO₂ calculation accuracy ≤ 0.5 % vs. IMO reference values across 100+ fuel-type / consumption-rate scenarios
* Node.js adapter invoking the emissions engine on every inbound fuel-flow reading and broadcasting the result via Socket.IO
* Dashboard emissions widget displaying real-time CO₂ rate alongside the four sensor widgets from Milestone 2
* MongoDB persistence for each computed CO₂ reading (timestamp, fuelType, consumptionL, co2Kg)

## Should

* 60-second in-memory cache: adapter returns the last computed CO₂ value within the cache window; cache invalidated on fuel-type change
* Connection logs capturing emit timestamp (generator), Signal K reception timestamp, and dashboard reception timestamp — used to verify ≤1 s p95 end-to-end latency
* Unit test suite with 100+ scenarios (5 fuel types × 20 consumption rates, 0.1–500 L/h); test file cites MEPC.361(78) section and formula so the calculation is auditable
* Emissions audit log (`emissions.log`) recording input fuel type / consumption, output CO₂, cache hit/miss, and timestamp for every evaluation

## Could

* 24-hour simulated replay test confirming sustained accuracy and zero packet loss
* `privacy-check.py` integration: nightly scan of the `emissions` MongoDB collection confirming no PII fields present
* TypeScript strict-mode warnings fully resolved across `apps/api` and `packages/emissions`

# Deliverables

* `packages/emissions` — stateless TypeScript module exporting `calculateCO2(fuelType, consumptionL): number` and `EmissionsCache`
* Updated `apps/api` — adapter wired to the emissions engine; 60-second cache active; Socket.IO broadcast on each cache update; MongoDB writes to `emissions` collection
* Updated `apps/web` — emissions widget rendering current CO₂ rate (kg/h) in real time
* Passing unit test suite: 100+ scenarios, all within ≤0.5 % of IMO reference
* `emissions.log` produced during test run, showing per-evaluation audit records

# Key Challenges

* **Emission factor version discrepancy** — MEPC.361(78) and MEPC.245(66) use slightly different MDO factors (3.206 vs 3.179 kg CO₂/L); the engine must commit to one version and document the choice clearly so test results are reproducible
  * Mitigation: Use MEPC.361(78) as the primary reference; add MEPC.245(66) as a named fallback constant in `constants.ts` and document the substitution
* **Cache invalidation edge case** — a fuel-type change mid-voyage must expire the cache immediately rather than serving a stale value for up to 60 seconds
  * Mitigation: Include `fuelType` in the cache key; any key mismatch triggers an immediate recompute

# Resources Needed

* IMO MEPC.361(78) GHG Calculation Guidelines (emission factor table, publicly available)
* IMO MEPC.245(66) as fallback reference
* Jest with `@repo/typescript-config` for the unit test suite
* MongoDB `emissions` collection schema (extended from Milestone 2 sensor schema)
