# Week 5 (May 12–18, 2026)

# Intended Tasks

* Submit Milestone 3 deliverables and Draft Report 1
* Design and scaffold `GET /report` endpoint in `apps/api` with `startDate`, `endDate`, and optional `stream` query parameters
* Implement MongoDB aggregation pipeline for date-range queries (sum fuel consumed, CO₂ emitted, water usage grouped by day)
* Scaffold the date-range picker component in `apps/web`
* Baseline performance check: confirm 1-day aggregation returns within 5 s

# Completed Tasks

* **Milestone 3 deliverables submitted** — `packages/emissions`, updated `apps/api` and `apps/web`, unit test suite (100 scenarios, max error 0.28 %), and `emissions.log` from the 24-hour replay all submitted; Draft Report 1 filed
* **`GET /report` endpoint scaffolded** — route handler at `apps/api/src/routes/report.ts` accepts `startDate` / `endDate` (ISO 8601); validates input; returns a stub JSON payload while aggregation pipeline is built out
* **MongoDB aggregation pipeline (1-day range)** — `$match` on timestamp range + `$group` by date + `$project` for required report fields (vessel ID, period, fuel consumed, CO₂ emitted, water usage); 1-day query returns in ~180 ms on local development data
* **Date-range picker component** — `apps/web` has a date-range selector using the shared `packages/ui` card; triggers `GET /report?startDate=&endDate=` on submit; renders raw JSON response (CSV/PDF export wired in Week 6–7)
* **Reporting-api.log** — request receipt timestamp and JSON response dispatch timestamp logged per request; responses exceeding 5 s flagged as `SLOW_REPORT`

**Completed by:** Alina

# Challenges Faced

* **MongoDB index missing on `timestamp` field** — 1-day aggregation scanned the full collection on first run (~800 ms). Resolved by adding a compound index on `{ stream: 1, timestamp: 1 }`; query time dropped to ~180 ms.
* **Date-range timezone handling** — browser `Date` objects sent without timezone context caused off-by-one errors at day boundaries. Resolved by requiring ISO 8601 strings with an explicit UTC offset from the client and parsing with explicit UTC on the server.

# Plan for the Next Week

* Extend aggregation pipeline to 1-week and 1-month date ranges; verify ≤5 s response time for 1-month range
* Implement CSV export: `GET /report?format=csv` returns a `text/csv` response the browser downloads
* Begin PDF export: generate a simple PDF using a Node.js PDF library; include all 12 required report fields
* Add JSON schema validation to confirm all 12 required fields are present in every report response
