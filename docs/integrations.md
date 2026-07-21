# Integrations Runbook

This project is simulation-first. The core demo path works without paid services:

```text
simulation/nmea_generator.py -> UDP :10110 -> apps/api -> MongoDB -> Socket.IO -> apps/web
```

External integrations are optional, credential-gated, and must degrade gracefully.

## Runtime Smoke

After MongoDB, API, and web are running:

```sh
npm run smoke:runtime
```

This confirms the local runtime is coherent before testing optional live integrations.

## Environment Variables

| Variable | Used by | Required |
| --- | --- | --- |
| `MONGO_URI` | API persistence, reports, anomaly detector | Local default exists |
| `NMEA_PORT` | API UDP listener | Local default `10110` |
| `SIGNALK_ENABLED` | Signal K adapter | Optional; set `true` to enable |
| `SIGNALK_URL` | Signal K WebSocket stream | Required only when Signal K is enabled |
| `FIRECRAWL_API_KEY` | Official-source refresh | Optional |
| `FIRECRAWL_API_URL` | Firecrawl self-hosted base URL | Optional |
| `OPENAI_API_KEY` | OpenAI Agents SDK validation agent | Optional |
| `VALIDATION_AGENT_ENABLED` | Enables validation agent route | Optional; default off |
| `REALTIME_AGENT_ENABLED` | Enables browser OpenAI realtime voice sessions | Optional; default off |
| `OPENAI_REALTIME_MODEL` | Realtime model override | Optional; default from SDK |
| `OPENAI_REALTIME_VOICE` | Realtime voice override | Optional |
| `OPENAI_REALTIME_CALLS_URL` | Realtime WebRTC calls endpoint override | Optional |
| `OPENWEATHER_API_KEY` | Live weather lookup | Optional |
| `OPENWEATHER_BASE_URL` | OpenWeather endpoint override | Optional |
| `ABB_TOKEN_URL` | ABB OAuth token endpoint | Optional |
| `ABB_CLIENT_ID` | ABB OAuth client ID | Optional |
| `ABB_CLIENT_SECRET` | ABB OAuth client secret | Optional |
| `ABB_OAUTH_SCOPE` | ABB OAuth scope | Optional |
| `ABB_BASE_URL` | ABB Voyage Optimization API base URL | Optional |
| `ABB_HEALTH_URL` | Optional ABB health endpoint | Optional |
| `ABB_ROUTE_CHECK_ENDPOINT` | Optional ABB route-check endpoint override | Optional |
| `ANOMALY_DETECTION_ENABLED` | API anomaly scheduler | Optional; default off |
| `ANOMALY_LOOKBACK_MINUTES` | Scheduler lookback window | Optional |
| `ANOMALY_INTERVAL_MS` | Scheduler interval | Optional |

## API Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /status` | Runtime status for NMEA, Signal K, MongoDB, and anomaly scheduler |
| `GET /report` | JSON/CSV/PDF sustainability report |
| `GET /validation/sources` | Cached official-source metadata |
| `POST /validation/sources/refresh` | Firecrawl official-domain source refresh |
| `GET /validation/abb/health` | ABB OAuth/health check |
| `POST /validation/abb/route-check` | ABB route reasonableness check |
| `GET /validation/agent/status` | OpenAI validation agent readiness and tool list |
| `POST /validation/agent` | Optional OpenAI Agents SDK validation run |
| `GET /validation/realtime/status` | OpenAI realtime maritime agent readiness |
| `GET /validation/realtime/session-config` | SDK-computed realtime session configuration |
| `POST /validation/realtime/calls` | WebRTC SDP proxy; keeps `OPENAI_API_KEY` server-side |
| `GET /weather/current?lat=<lat>&lon=<lon>` | OpenWeather lookup from vessel GNSS or browser geolocation |
| `GET /anomalies` | Recent persisted anomaly events |

## Firecrawl

Firecrawl is used only to refresh official-source evidence. Searches are restricted to known source domains:

* `imo.org`
* `wwwcdn.imo.org`
* `signalk.org`
* `api.voyageoptimization.abb.com`

Without `FIRECRAWL_API_KEY`, reports still include static official-source references with `reference` status.

## ABB

ABB Voyage Optimization is an external reasonableness check. It is not the regulatory source of truth for local emissions math.

The API first verifies OAuth token access. Route checks submit the provided payload to `ABB_ROUTE_CHECK_ENDPOINT` or `${ABB_BASE_URL}/recommended-speed`. The response is marked `not_comparable` unless compatible fuel or CO2 totals are present.

## OpenAI Agents SDK

The validation agent is disabled by default. To run it locally:

```sh
VALIDATION_AGENT_ENABLED=true OPENAI_API_KEY=... npm run dev -w api
```

The agent has deterministic tools only:

* local emissions calculation
* official-source lookup
* ABB health check
* ABB route check
* validation summary

It must not claim regulatory certification or guaranteed IMO compliance.

## OpenAI Realtime Agent

The dashboard includes a credential-gated realtime maritime voice agent panel. The API uses
`@openai/agents/realtime` to define the agent and compute the session configuration, then proxies
browser WebRTC SDP offers to the released Realtime calls endpoint. The browser never receives
`OPENAI_API_KEY`.

Enable locally:

```sh
REALTIME_AGENT_ENABLED=true OPENAI_API_KEY=... npm run dev -w api
```

Useful checks:

```sh
curl http://localhost:4001/validation/realtime/status
curl http://localhost:4001/validation/realtime/session-config
```

The realtime agent is instructed on CO2 emissions, vessel operations, route planning,
navigation, weather interpretation, Signal K/NMEA context, and validation boundaries. It must
ask for missing route/weather/navigation inputs rather than inventing them.

## OpenWeather and Geolocation

The dashboard weather panel can use vessel GNSS coordinates from the simulator or browser
geolocation. Weather calls go through the API:

```sh
OPENWEATHER_API_KEY=... npm run dev -w api
curl 'http://localhost:4001/weather/current?lat=37.7749&lon=-122.4194'
```

When `OPENWEATHER_API_KEY` is absent, the endpoint returns `not_configured` and the dashboard
continues running.

## MCP

`.vscode/mcp.json` defines Firecrawl and Signal K MCP servers with environment-backed secrets:

* `FIRECRAWL_API_KEY=${env:FIRECRAWL_API_KEY}`
* `SIGNALK_URL=${env:SIGNALK_URL}`

No secret values should be committed to the MCP config.
