# Week 9 (June 9 - June 15, 2026)

# Intended Tasks

* Complete the integration/performance backlog carried from Week 8.
* Fix the rate-vs-volume reporting issue so sampled `L/h` and `kg/h` values are integrated over elapsed time.
* Wire anomaly detector output into the API/dashboard.
* Clarify the Signal K setup and document the default simulation path.
* Add official-source cross-checking hooks for IMO, Signal K, Firecrawl, and the optional OpenAI Agents SDK validation flow.

# Completed Tasks

* **Report math corrected** - fuel, water, and CO2 readings are now treated as rates and integrated over observed sample intervals. A regression test seeds four quarter-hour samples at `12 L/h` and verifies the report returns `12 L`, not `48 L`.
* **Fuel-type validation** - `GET /report` now rejects unsupported `fuelType` values with `400` instead of producing invalid carbon-intensity output.
* **Anomaly alert path** - the Python detector supports `--json`; the API can run it on a scheduled rolling window when `ANOMALY_DETECTION_ENABLED=true`, persists anomaly events, and broadcasts `anomaly:update` to the dashboard.
* **Dashboard sense-making pass** - the dashboard now opens with vessel, environment, and navigation categories visible; anomaly status appears near the top; report results show validation-source metadata.
* **Signal K cleanup** - the API uses `SIGNALK_URL` plus `SIGNALK_ENABLED=true`, forces `subscribe=none`, sends explicit subscriptions, and no longer treats `tanks.freshWater.0.currentLevel` as water usage. That path is shown as water tank level instead.
* **Official-source validation** - added Firecrawl-backed source refresh with official-domain filtering and cached fallback source metadata. Reports include validation-source titles, URLs, statuses, and fetch timestamps where available.
* **OpenAI Agents SDK** - added an optional validation agent using deterministic tools for local emissions calculations, official-source lookup, and validation summaries. It is disabled unless `VALIDATION_AGENT_ENABLED=true` and `OPENAI_API_KEY` are present.
* **MCP config** - `.vscode/mcp.json` is now valid JSON and uses environment-backed secrets for Firecrawl and Signal K.
* **Lint setup** - added missing ESLint configs for API, web, and emissions packages.

# Validation

* `npm test -w api` passes with local bind permission for `mongodb-memory-server`.
* `npm run build -w api` passes.
* `npm run build -w web` passes.
* New tests cover rate integration, invalid fuel types, validation service defaults, Signal K URL resolution, and MCP JSON parsing.

# Follow-Up

* Run a full local smoke test with MongoDB, API, dashboard, and `simulation/nmea_generator.py`.
* Enable live Firecrawl and OpenAI checks only in a credentialed environment.
* If Docker/WSL integration is required, confirm Docker is installed in the active environment before relying on the local Signal K container.
