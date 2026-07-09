# Week 11 (June 23 - June 29, 2026)

# Intended Tasks

* Complete the integration-testing, performance-tuning, and documentation milestone.
* Prepare the project for Week 12 demo readiness.
* Document operational assumptions for optional third-party services.

# Completed Tasks

* **Operational runbook completed** - `docs/integrations.md` documents environment variables, validation endpoints, Firecrawl, ABB, OpenAI Agents SDK, MCP, and runtime behavior.
* **Signal K architecture clarified** - `docs/signalk-architecture.md` documents the default simulator-to-API UDP path, optional Signal K mode, Docker mode, and the current two-instance concern.
* **Official-source validation documented** - `docs/validation/official-sources.md` captures IMO, Signal K, ABB, and Firecrawl source policy.
* **Smoke-test path documented** - `npm run smoke:runtime` provides a repeatable check after starting MongoDB, API, and web.
* **MCP config corrected** - `.vscode/mcp.json` is valid JSON and keeps Firecrawl/Signal K secrets environment-backed.
* **Week 9-11 milestone updates added** - milestone documentation now reflects the project’s actual implementation status and timeline.

# Firecrawl Notes

* Firecrawl is used only for source discovery/refresh, not core calculations.
* Searches are restricted to official maritime/source domains.
* Reports continue to generate if Firecrawl is missing, rate-limited, or unreachable.
* Source refresh metadata should be treated as audit support, not a regulatory guarantee.

# OpenAI Notes

* The OpenAI Agents SDK integration is optional and disabled by default.
* The agent orchestrates deterministic local tools: emissions calculation, official-source lookup, ABB health/route checks, and validation summarization.
* The agent must not claim certified IMO compliance or mutate calculation results.
* Local eval fixtures live in `apps/api/evals/`.

# ABB Notes

* ABB Voyage Optimization is integrated as a route/weather reasonableness check.
* ABB is not the regulatory source of truth for IMO formulas.
* The API reports `not_configured`, `token_ok`, `healthy`, `submitted`, `not_comparable`, or `error` explicitly so operators can tell setup issues from data comparability issues.
* ABB unit compatibility must be reviewed before comparing route output to local sensor-only report totals.

# Final Week 12 Readiness

* Core local demo path: MongoDB container, API dev server, web dev server, and Python NMEA simulator.
* Optional external checks: Firecrawl, ABB, and OpenAI can be enabled with environment variables for a credentialed demo.
* Known limitation: Docker was verified to have MongoDB running, but API/web containers were not running at the time of this update unless started separately.
