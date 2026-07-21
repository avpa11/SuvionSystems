# Week 10 (June 16 - June 22, 2026)

# Intended Tasks

* Begin the Week 10-11 integration-testing and performance-tuning milestone from the proposal.
* Verify the local runtime path with Docker MongoDB, API, dashboard, report generation, and validation endpoints.
* Make third-party integrations operationally clear without requiring live paid/service calls in the default demo.

# Completed Tasks

* **Runtime smoke command** - added `npm run smoke:runtime`, which checks:
  * MongoDB TCP connectivity on `127.0.0.1:27017`.
  * API `GET /health` and `GET /status`.
  * Report generation with an empty or populated recent range.
  * Validation-source metadata.
  * Anomaly endpoint availability.
  * Web app availability on `http://localhost:4000`.
* **Docker integration pass** - `docker-compose.yml` now passes optional Firecrawl, OpenAI, and anomaly environment variables into the API container without committing secrets. Defaults keep the validation agent and anomaly scheduler off.
* **MongoDB verification** - Docker currently shows the `mongo` container running on `0.0.0.0:27017->27017/tcp`.
* **Performance-oriented report path** - report aggregation now uses indexed stream/timestamp queries and interval integration instead of over-counting sampled rate values.
* **Validation endpoints checked for no-credential operation** - Firecrawl and OpenAI integrations degrade gracefully when keys are missing or disabled.

# Integration Notes

* **Firecrawl** - `POST /validation/sources/refresh` performs official-domain searches only when `FIRECRAWL_API_KEY` is configured. Without a key, `GET /validation/sources` still returns static official-source references.
* **OpenAI Agents SDK** - `POST /validation/agent` is disabled unless both `VALIDATION_AGENT_ENABLED=true` and `OPENAI_API_KEY` are present. The agent tools are deterministic and do not change report math.

# Validation Evidence

* `npm run lint` passes.
* `npm run build` passes.
* `npm test` passes with local bind permission for `mongodb-memory-server`.
* `python3 -m unittest discover analytics` passes.

# Remaining Week 11 Work

* Keep documentation and runbooks synchronized with the final implementation.
* Run the smoke script against live API and web dev servers.
* Capture known operational limits for Signal K, Firecrawl, and OpenAI integrations.
