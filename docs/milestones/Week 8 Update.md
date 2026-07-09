# Week 8 (June 2 – June 8, 2026)

# Intended Tasks

* Begin Milestone 4 *Could* goals: expand the automated test suite and start anomaly detection
* Implement Isolation-Forest anomaly detection over the four sensor streams (Python), with its own unit-test suite
* Bug-fix pass over the reporting pipeline ahead of the June 16 Milestone 4 deadline
* Finalise the Milestone 4 sign-off checklist

# Completed Tasks

* **Anomaly detection engine (Isolation Forest)** — new `analytics/` package implementing multivariate anomaly detection over the four persisted sensor streams (`fuel`, `generator`, `water`, `temperature`):
  * `analytics/isolation_forest.py` — a dependency-free Isolation Forest (Liu, Ting & Zhou 2008): random sub-sampled trees, height-limited isolation, and the `c(n)` path-length normalisation, with a scikit-learn-compatible surface (`fit` / `predict` / `score_samples`, `contamination`, `random_state`). Implemented from scratch using only the Python standard library, matching the dependency-free convention of `simulation/`.
  * `analytics/anomaly_detection.py` — sensor-domain wrapper: aligns flat `{stream, value, timestamp}` readings into complete feature rows, standardises features (so the differing scales of fuel ≈ 12, generator ≈ 8, temperature ≈ 21 don't dominate splits), scores each window, and emits `AnomalyEvent`s that name the **contributing** stream(s). Includes an optional `pymongo`-backed runner (`run_from_mongo`) and a CLI with a synthetic-demo mode that needs no database.
  * Detected anomalies are appended to `anomaly-events.log` as JSON lines, following the same audit-log convention as `reporting-api.log` and `data-lifecycle.log`.
  * **Rationale** — faults frequently show up as an unusual *combination* of readings (e.g. generator current surging while fuel flow stays normal) that per-stream thresholds miss. The forest complements, rather than replaces, the API's hourly non-compliant-period flagging.
* **Anomaly-detection unit tests** — `analytics/test_anomaly_detection.py`: **16 tests** on the standard-library `unittest` runner (so the suite runs in the grading environment with no install). Covers `c(n)` edge cases and monotonicity, score bounds `[0,1]`, outlier-vs-inlier ordering, reproducibility under `random_state`, empty-fit / score-before-fit / invalid-contamination errors, reading alignment (complete-row grouping, dropping incomplete buckets, ISO-string timestamps), detection of an injected generator surge with correct contributing-stream attribution, low false-positive rate on clean data, and the constant-stream (zero-variance) divide-by-zero guard. All green.
* **Bug fix — masked CO₂ violations in compliance reports** — `detectNonCompliantPeriods` (`apps/api/src/routes/report.ts`) used an `if / else if`, so an hourly window that breached **both** the fuel and CO₂ thresholds reported only `HIGH_FUEL_USAGE` and silently dropped the `HIGH_CO2` violation from the report. Changed to two independent `if` checks so every breach is recorded. Added a regression test (`an hour breaching both thresholds reports HIGH_FUEL_USAGE and HIGH_CO2`); the API integration suite is now 17 tests, all green.
* **Milestone 4 sign-off** — *Must* (Reporting API, CSV + PDF export), *Should* (retention / deletion), and the *Could* test-suite + anomaly-detection goals are now implemented and tested ahead of the June 16 deadline.

**Completed by:** Alina

# Challenges Faced

* **No scientific-Python stack available** — the target environment has no `pip` / scikit-learn (and runs Python 3.14, which lacks sklearn wheels). Rather than add a fragile dependency, the Isolation Forest was implemented from scratch on the standard library. It keeps a scikit-learn-compatible API so the implementation can be swapped for `sklearn.ensemble.IsolationForest` later with a one-line change, with no caller impact.
* **Feature scaling** — without standardisation the wide-range streams (fuel, temperature) dominated the random split ranges and masked anomalies in the narrower-range streams. Added per-stream z-score standardisation fitted on the training window, with a guard that maps a zero-variance (constant) stream to a std of 1 to avoid divide-by-zero.
* **Reproducibility for tests** — Isolation Forests are randomised, which makes assertions flaky. Threaded a seeded `random.Random(random_state)` through tree construction and sub-sampling so a given `random_state` produces identical forests and scores; the test suite relies on this for deterministic outlier-ordering assertions.
* **Known issue logged for the integration milestone** — while hardening the reporting pipeline I confirmed that the hourly aggregation `$sum`s instantaneous fuel/CO₂ *rates* sampled at 1 Hz, which is correct for the current per-hour seed fixtures but would over-count once real 1 Hz data is aggregated (rate vs. volume). The non-compliant thresholds should compare against the hourly *average* rate or true litres consumed. Left as a tracked item for the integration/performance milestone to avoid a sweeping change to the emissions unit model this close to the Milestone 4 deadline; the contained, demo-safe bug (masked CO₂ violations) was fixed now.

# Plan for the Next Week

* Integration milestone: end-to-end pipeline test (NMEA generator → adapter → MongoDB → dashboard) with p95 latency ≤ 1 s.
* Resolve the rate-vs-volume hourly-aggregation item and add a fixture that seeds multiple readings per hour.
* Wire anomaly events into the dashboard (surface flagged windows) and schedule the detector to run on a rolling window alongside the retention job.
* Performance tuning and documentation pass.
