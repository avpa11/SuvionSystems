# Week 3 (April 28–May 4, 2026)

# Intended Tasks

* Extend the emissions unit test matrix from the initial 25 scenarios to 100+ (5 fuel types × 20 consumption rates, 0.1–500 L/h)
* Implement the 60-second in-memory `EmissionsCache`: returns the last computed CO₂ value within the TTL; invalidates on fuel-type change
* Forward cached CO₂ values to the dashboard via Socket.IO; add an emissions widget to `apps/web`
* Add MongoDB persistence for each computed CO₂ reading (timestamp, fuelType, consumptionL, co2Kg)

# Completed Tasks

* **Expanded test matrix** — 100 scenarios passing: 5 fuel types × 20 consumption rates (0.1–500 L/h); maximum observed error vs. IMO MEPC.361(78) reference: 0.28 %; all within the ≤0.5 % target; test file header cites MEPC.361(78) section and formula
* **60-second cache** — `EmissionsCache` class in `packages/emissions/src/cache.ts` stores the last computed value with a TTL; cache invalidated on fuel-type change; cache hit/miss logged to `emissions.log`
* **Socket.IO emissions broadcast** — adapter emits `{ stream: 'co2', value, unit: 'kg', timestamp }` on the `sensor:update` channel every time a new fuel-flow reading triggers a cache update
* **MongoDB persistence** — each CO₂ computation writes a document `{ timestamp, fuelType, consumptionL, co2Kg }` to the `emissions` collection; schema validator blocks PII fields
* **Emissions widget** — `apps/web` shows a real-time CO₂ rate display alongside the four sensor widgets from Milestone 2; uses the shared `packages/ui` card component

**Completed by:** Alina

# Challenges Faced

* **Socket.IO event ordering** — when the adapter restarts, the dashboard occasionally received a stale cached CO₂ value before the first live reading arrived. Resolved by emitting a `sensor:reset` event on adapter reconnect so the dashboard clears displayed values until the first fresh reading comes through.
* **MongoDB write latency under high packet rate** — at 1 Hz with all four sensor streams plus CO₂ writes, occasional write queuing was observed. Resolved by batching MongoDB writes every 500 ms instead of per-packet; no observable impact on dashboard latency.

# Plan for the Next Week

* Run the full end-to-end pipeline test across all three vessel-state scenarios (cruising, anchoring, generator cycling)
* Validate p95 dashboard latency ≤1 s over a 500-packet run using generator emit logs vs. dashboard reception logs
* Run a 24-hour simulated replay and confirm sustained accuracy with zero packet loss
* Clean up TypeScript strict-mode warnings across `apps/api` and `packages/emissions`
* Prepare Milestone 3 deliverables for submission in Week 5
