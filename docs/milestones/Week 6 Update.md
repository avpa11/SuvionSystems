# Week 6 (May 19–25, 2026)

# Intended Tasks

* Extend MongoDB aggregation to support 1-week and 1-month date ranges; confirm ≤5 s response time for 1-month range
* Implement CSV export: `GET /report?format=csv` returns a downloadable `text/csv` response
* Begin PDF export: Node.js PDF library generating a report with all 12 required fields
* Add JSON schema validation confirming all 12 required fields are present in every report response

# Completed Tasks

* **1-week and 1-month aggregation** — aggregation pipeline extended with a `$dateToString` grouping granularity parameter; 1-week query: ~420 ms; 1-month query: ~1.8 s; both well within the ≤5 s target; results logged in `reporting-api.log`
* **CSV export** — `GET /report?format=csv` streams a `text/csv` response; dashboard "Download CSV" button triggers the request and saves the file; all 12 required fields present in output
* **PDF export (in progress)** — PDF library selected and scaffolded; basic report template with header, date range, and summary table rendering correctly; non-compliant period flagging not yet wired up (completing in Week 7)
* **JSON schema validation** — `report-schema.json` defines all 12 required fields; validation runs on every API response in the test suite; missing-field assertions confirmed working

**Completed by:** Alina

# Challenges Faced

* **1-month aggregation slow on initial run** — before the compound index was extended to cover the `sensors` collection's full date range, 1-month queries took ~4.2 s. Adding a pre-aggregation index on `{ timestamp: 1 }` dropped it to ~1.8 s. Documented in a code comment so the index is not accidentally dropped.
* **PDF library bundle size** — first library evaluated added ~12 MB to the `apps/api` Docker image. Switched to a lighter alternative; image size impact acceptable.

# Plan for the Next Week

* Complete PDF export: wire up non-compliant period flagging (fuel consumption > threshold → flagged with timestamp in report)
* Integration test: trigger 50+ report requests across date ranges (1 day, 1 week, 1 month); assert file produced within 5 s, schema valid, non-compliant periods flagged correctly
* Implement the data retention / deletion workflow (30-day TTL job, `data-lifecycle.log`) per the Milestone 4 Should goals
* Begin Milestone 4 sign-off checklist review
