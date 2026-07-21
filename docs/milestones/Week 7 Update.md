# Week 7 (May 26 – June 1, 2026)

# Intended Tasks

* Complete PDF export: wire up non-compliant period flagging (fuel consumption / CO₂ over threshold → flagged with timestamp in the report)
* Integration test: trigger 50+ report requests across date ranges (1 day, 1 week, 1 month); assert file produced within 5 s, schema valid, non-compliant periods flagged correctly
* Implement the data retention / deletion workflow (30-day TTL job, `data-lifecycle.log`) per the Milestone 4 *Should* goals
* Begin the Milestone 4 sign-off checklist review

# Completed Tasks

* **PDF export complete** — `GET /report?format=pdf` streams an `application/pdf` response built with `pdfkit` (`apps/api/src/routes/report.ts`, `reportToPDF`). The document renders the header, vessel/period details, the full environmental summary table (all 12 required fields), and a dedicated **Non-Compliant Periods** section listing each flagged window with its start/end, reason (`HIGH_FUEL_USAGE` / `HIGH_CO2`), value, and threshold. The dashboard "Download PDF" button triggers the request and saves the file.
* **Non-compliant period detection** — `aggregateEmissionsHourly` groups emissions into hourly windows; `detectNonCompliantPeriods` flags any window over `NON_COMPLIANT_FUEL_RATE_LH` (15 L/h) or `NON_COMPLIANT_CO2_RATE_KGH` (45 kg/h). Thresholds live in `@repo/emissions` constants so the API and engine stay in sync.
* **Integration test suite** — `apps/api/src/__tests__/report.integration.test.ts` runs against an in-memory MongoDB (`mongodb-memory-server`) and covers: all 12 required fields present (AJV schema validation), non-compliant flagging, response time ≤ 5 s for 1-day / 1-week / 1-month ranges, **50 concurrent 1-day requests all returning within 5 s**, CSV content-type and field labels, and input validation (missing/!inverted date ranges → 400). All assertions green.
* **Data retention & deletion workflow** — `apps/api/src/db/retention.ts`: `scheduleRetention()` runs daily, deleting sensor and emissions documents older than 30 days; `runDataWipe()` provides the documented post-demo full wipe. Every run writes both a `LifecycleLog` document and a JSON audit line to `data-lifecycle.log`. Wired into API startup in `apps/api/src/index.ts`.
* **Milestone 4 sign-off review started** — confirmed *Must* goals (Reporting API, CSV + PDF export from the date-range picker) and *Should* goals (retention / deletion) are implemented and exercised by the test suite.

**Completed by:** Alina

# Challenges Faced

* **PDFKit streaming vs. buffering** — early drafts buffered the whole PDF in memory before responding, which interacts poorly with the 5 s budget for large ranges. Switched to piping `doc.pipe(res)` and calling `doc.end()` so the response streams as it renders; the route returns immediately after wiring the pipe.
* **In-memory Mongo first-run latency** — `mongodb-memory-server` downloads a MongoDB binary on first use, which made the first CI/integration run appear to hang. Documented this so the binary is warmed once; subsequent runs complete in ~2–3 s.
* **Threshold ownership** — the non-compliant thresholds were initially duplicated between the engine and the API route. Consolidated them into `@repo/emissions` (`NON_COMPLIANT_FUEL_RATE_LH`, `NON_COMPLIANT_CO2_RATE_KGH`) so reports and the engine cannot drift apart.

# Plan for the Next Week

* Begin Milestone 4 *Could* goals — expand the automated test suite (unit + integration) and start anomaly detection.
* Implement Isolation-Forest anomaly detection over the four sensor streams (Python), with its own unit-test suite.
* Bug-fix pass over the reporting pipeline ahead of the June 16 Milestone 4 deadline.
* Finalise the Milestone 4 sign-off checklist.
