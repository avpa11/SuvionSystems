# Suvion Systems — Milestone 3 Risk and Mitigation Plan

# Risk Identification

| Risk Description | Likelihood (Low/Medium/High) | Impact (Low/Medium/High) | Priority (Low/Medium/High) |
| :---- | :---- | :---- | :---- |
| Emissions calculation accuracy exceeds ±0.5 % threshold for one or more fuel types | Medium | High | High |
| IMO MEPC.361(78) emission factor version ambiguity causes test/reference mismatch | Medium | High | High |
| 60-second cache returns stale CO₂ value after mid-voyage fuel-type change | Low | Medium | Medium |
| MongoDB write latency degrades under high-frequency sensor + emissions writes | Low | Medium | Medium |
| Socket.IO broadcast drops emissions update during adapter reconnect window | Low | Medium | Medium |
| TypeScript strict-null path returns NaN silently for unknown fuel type input | Low | High | Medium |

# Mitigation Strategies

| Risk Description | Mitigation Strategy | Owner | Deadline |
| :---- | :---- | :---- | :---- |
| Emissions accuracy > ±0.5 % | Extend engine work into the Week 8–9 buffer if accuracy is not achieved by end of Week 4 (May 11); defer Reporting API start by one week per the proposal risk trigger | Alina | May 11, 2026 |
| Emission factor version ambiguity | Commit to MEPC.361(78) as primary; store MEPC.245(66) values as named fallback constants in `constants.ts`; cite the source section in both the module header and the test file | Alina | Week 1 of Milestone 3 (April 14–20, 2026) |
| Stale cache on fuel-type change | Include `fuelType` in the cache key; any key mismatch triggers immediate recompute regardless of TTL | Alina | May 11, 2026 |
| MongoDB write latency | Batch MongoDB writes every 500 ms; monitor write queue depth in `apps/api` logs; if p95 write latency exceeds 200 ms, drop to batching every 1 s and document the change | Alina | May 12, 2026 |
| Socket.IO drops emissions during reconnect | Emit `sensor:reset` event on adapter reconnect so dashboard clears stale values; re-emit last computed CO₂ value as first message after reconnect | Alina | May 11, 2026 |
| Silent NaN from unknown fuel type | Add `FuelTypeError` guard in `calculateCO2`; failing loudly makes the error visible in the emissions log rather than silently corrupting dashboard output; add a corresponding test case | Alina | Week 1 of Milestone 3 (April 14–20, 2026) |

# Monitoring Plan

* **Per test run:** Review `emissions.log` for cache hit ratio, max observed calculation error, and any `FuelTypeError` entries; flag any scenario exceeding 0.3 % error (early warning before the 0.5 % hard limit)
* **End of Week 1 (Apr 20):** First unit test scenarios passing ≤0.5 % accuracy; MEPC.361(78) factor table verified against constants in code
* **End of Week 3 (May 4):** Full 100-scenario test suite passing; cache invalidation test passing; MongoDB write latency within target; emissions widget rendering on dashboard
* **End of Week 4 (May 11):** 24-hour replay test completing without packet loss; p95 dashboard latency ≤1 s confirmed; Milestone 3 sign-off checklist reviewed
* **Weekly:** Run `privacy-check.py` against the `emissions` MongoDB collection to confirm no PII fields in persisted documents

# Contingency Plan

* **Persistent accuracy failure (>0.5 % after Week 4):** Activate the proposal's risk trigger — extend emissions engine work into the Week 8–9 buffer and defer Reporting API start by one week; document the impact in the Milestone 3 retrospective
* **MEPC.361(78) factor ambiguity unresolvable:** Fall back to MEPC.245(66) for all fuel types; document the substitution in `packages/emissions/src/constants.ts` and the test file; update success-metric baselines accordingly
* **Cache invalidation not fixable without refactor:** Disable the cache entirely (always recompute); the per-evaluation cost is negligible for the project's data volumes; re-enable after the milestone if time allows
* **MongoDB write queue grows unbounded:** Switch from MongoDB writes to append-only log files (`readings.jsonl`) for the duration of Milestone 3; migrate to MongoDB in the Week 8–9 buffer if needed
