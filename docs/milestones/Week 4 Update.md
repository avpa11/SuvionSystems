# Week 4 (May 5–11, 2026)

# Intended Tasks

* Full end-to-end pipeline test across all three vessel-state scenarios (cruising, anchoring, generator cycling)
* Validate p95 dashboard latency ≤1 s over a 500-packet run
* Run 24-hour simulated replay; confirm sustained accuracy and zero packet loss
* Resolve remaining TypeScript strict-mode warnings in `apps/api` and `packages/emissions`
* Complete Milestone 3 deliverables checklist for submission

# Completed Tasks

* **End-to-end pipeline test** — all three vessel-state scenarios run: 500 packets per stream (2 000 total) emitted, received by Signal K, forwarded by adapter, rendered in dashboard; 100 % packet delivery confirmed by comparing generator emit log against dashboard reception log; no unit mismatches (fuel flow 12.5 L/h → dashboard shows 12.5 L/h)
* **Latency validation** — p95 dashboard update latency: 310 ms over the 500-packet run; well within the ≤1 s target; results logged in `dashboard-client.log` with emit and reception timestamps
* **24-hour replay** — 24 hours of simulated cruising replayed; maximum observed emissions error: 0.28 % vs. IMO reference; no packet loss; `emissions.log` contains per-evaluation audit records for the full run
* **TypeScript strict-mode** — all strict-null warnings resolved in `apps/api` and `packages/emissions`; `FuelTypeError` guard confirmed to fail loudly for unknown fuel type inputs
* **Connection logs verified** — `signal-k-server.log` and `dashboard-client.log` contain connection established, per-message timestamp + payload, and disconnection events for all test runs

**Completed by:** Alina

# Challenges Faced

* **Python generator packet rate** — at 1 Hz with 4 streams, Signal K's UDP receive buffer occasionally dropped packets during the generator cycling scenario (high burst rate). Resolved by adding a 10 ms inter-packet jitter in the mock generator; zero drops confirmed in the rerun.
* **Log timestamp format inconsistency** — Signal K logs timestamps in ISO 8601 with milliseconds; the mock generator was using Unix epoch seconds. Resolved by standardising both to `Date.now()` milliseconds in the comparison script; noted in test documentation.

# Plan for the Next Week

* Submit Milestone 3 deliverables and Draft Report 1
* Begin Milestone 4: design the REST `GET /report` endpoint with `startDate` / `endDate` query parameters
* Scaffold the MongoDB aggregation pipeline for date-range queries (sum fuel consumed, CO₂, water usage by day)
* Scaffold the date-range picker component in `apps/web`
* Baseline check: confirm 1-day aggregation returns within 5 s
