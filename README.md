# Suvion Systems — Environmental Monitoring Dashboard

Maritime vessel sustainability tracking for small vessel operators. Provides real-time sensor
data ingestion, automated CO₂ emissions calculations, and sustainability report generation.

## Architecture

```
simulation/nmea_generator.py   →  UDP :10110
                                         ↓
                               apps/api  (Node.js adapter + REST API)
                               ├── NMEA UDP listener on :10110
                               ├── Signal K WebSocket bridge (optional, explicit subscriptions)
                               ├── @repo/emissions engine + 60 s cache
                               ├── MongoDB persistence + 30-day retention
                               ├── anomaly scheduler (optional)
                               ├── Firecrawl / ABB / OpenAI validation surfaces
                               ├── OpenAI realtime maritime agent proxy (optional)
                               ├── OpenWeather lookup (optional)
                               └── Socket.IO broadcast + REST APIs
                                         ↓
                               apps/web  (Next.js dashboard :4000)
                               ├── Cog-style live vessel, environment, and navigation instruments
                               ├── CO₂ emissions cog + fuel-type selector
                               ├── weather panel with vessel/browser geolocation
                               ├── OpenAI / Firecrawl / ABB integration panel
                               ├── anomaly alert panel
                               └── Date-range report builder → CSV / PDF download
```

## Quick Start

### 1. Install dependencies

```sh
npm install
```

### 2. Start MongoDB

```sh
docker network create app_network
docker compose up -d mongo
```

### 3. Start the API server

```sh
# Development (hot-reload via tsx)
npm run dev -w api

# Production
npm run build -w api && npm run start -w api
```

### 4. Start the dashboard

```sh
npm run dev -w web
```

Open http://localhost:4000.

### 5. Start Signal K server (optional)

The default development path sends the Python simulator directly to the API UDP listener.
Signal K is optional and disabled unless `SIGNALK_ENABLED=true`.

**Install once (global):**

```sh
npm install -g signalk-server
```

**Start:**

```sh
signalk-server
# Starts on http://localhost:3000 — admin UI available at http://localhost:3000/admin
```

**Enable the API bridge:**

```sh
SIGNALK_ENABLED=true \
SIGNALK_URL=ws://localhost:3000/signalk/v1/stream \
npm run dev -w api
```

The API rewrites the stream URL to `subscribe=none` and sends explicit own-vessel
subscriptions. `tanks.freshWater.0.currentLevel` is rendered as tank level, not water usage.

### 6. Run the NMEA simulator

```sh
# Cruising (default) — fuel 12.5 L/h, generator 8.2 A, SOG about 8.6 kn
python3 simulation/nmea_generator.py

# Vessel at anchor — low fuel, high generator load
python3 simulation/nmea_generator.py --scenario anchoring

# Generator cycling — triggers non-compliant period detection
python3 simulation/nmea_generator.py --scenario generator_cycling

# Run for a fixed duration (seconds)
python3 simulation/nmea_generator.py --duration 86400
```

The simulator also emits environment and tank streams over NMEA XDR:
`DEPTH_KEEL`, `DEPTH_TRANSDUCER`, `WATER_TEMP`, and `WATER_LEVEL`.
Those drive the DBK, DBT, WTMP, and water tank dashboard instruments.

### 7. Full Docker stack

```sh
docker network create app_network
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker compose build
docker compose up -d
```

The API publishes UDP `10110`, so the host-run simulator can feed the Docker stack:

```sh
python3 simulation/nmea_generator.py
```

OpenAI validation and realtime voice sessions are enabled when `OPENAI_API_KEY` is set.
Set `VALIDATION_AGENT_ENABLED=false` or `REALTIME_AGENT_ENABLED=false` in `.env` only
when you want to turn those integrations off.

Signal K is optional in Docker too. To include it, opt into the profile and enable
the API bridge. The Compose service defaults to the official
`cr.signalk.io/signalk/signalk-server` image, with `SIGNALK_IMAGE` available as an
override.

```sh
SIGNALK_ENABLED=true \
SIGNALK_URL=ws://signalk:3000/signalk/v1/stream \
docker compose --profile signalk up -d
```

If the Signal K image pull fails, you can still run the core stack and point the API
at the public demo stream:

```sh
SIGNALK_ENABLED=true \
SIGNALK_URL=wss://demo.signalk.org/signalk/v1/stream \
docker compose up -d api
```

## Package overview

| Package | Description |
|---------|-------------|
| `apps/api` | Express + Socket.IO adapter, MongoDB persistence, reports, validation, status, anomalies |
| `apps/web` | Next.js 14 SPA dashboard |
| `packages/emissions` | Stateless CO₂ engine — IMO CII method and conversion-factor references, 60 s cache |
| `simulation/` | Python NMEA0183 generator (three vessel-state scenarios) |

## Module system

Both `packages/emissions` and `apps/api` are true ESM packages (`"type": "module"`).
TypeScript is configured with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`,
so all relative imports use explicit `.js` extensions (resolved to `.ts` at compile time).

Some older packages (`ajv`, `ajv-formats`) ship CJS types that lose call-signature
information under NodeNext ESM resolution. These are handled with a one-line cast at the
import site, documented with a comment so the reason is clear.

## Report API

```
GET /report?startDate=<ISO8601>&endDate=<ISO8601>[&format=csv|pdf][&fuelType=diesel]
```

Returns a JSON payload validated against `apps/api/src/schemas/report-schema.ts`
(12 required fields). Append `&format=csv` or `&format=pdf` for file downloads.

Response logs are written to `reporting-api.log`; responses exceeding 5 s are
flagged `SLOW_REPORT`.

Rate readings are integrated over elapsed sample intervals. Fuel and water are treated as
`L/h`; CO₂ is treated as `kg/h`. The report includes `calculationBasis` and
`validationSources` metadata.

## Status, validation, and anomaly APIs

| Endpoint | Description |
|----------|-------------|
| `GET /status` | NMEA, Signal K, MongoDB, and anomaly scheduler status |
| `GET /validation/sources` | Cached official-source metadata |
| `POST /validation/sources/refresh` | Firecrawl refresh restricted to official domains |
| `GET /validation/abb/health` | ABB OAuth/health status |
| `POST /validation/abb/route-check` | ABB route reasonableness check |
| `GET /validation/agent/status` | OpenAI validation agent configuration/status |
| `POST /validation/agent` | Optional OpenAI Agents SDK validation run |
| `GET /validation/realtime/status` | Realtime maritime agent configuration/status |
| `GET /validation/realtime/session-config` | SDK-derived realtime session config metadata |
| `POST /validation/realtime/calls` | WebRTC SDP proxy for browser voice sessions |
| `GET /weather/current?lat=<lat>&lon=<lon>` | OpenWeather lookup from vessel or browser position |
| `GET /anomalies` | Recent anomaly events |

See [docs/integrations.md](docs/integrations.md) and
[docs/signalk-architecture.md](docs/signalk-architecture.md).

## Runtime smoke test

After MongoDB, the API, and the web app are running:

```sh
npm run smoke:runtime
```

This checks MongoDB, API health/status, report generation, validation-source metadata,
ABB graceful-response behavior, anomaly endpoint availability, and the dashboard.

See [docs/integration-testing.md](docs/integration-testing.md) for the full Week 10-11
verification sequence.

## Running tests

```sh
# Emissions unit tests — 120 scenarios, all ≤0.5 % error vs IMO reference factors
npm test -w @repo/emissions

# Reporting API integration tests (uses mongodb-memory-server, no real DB needed)
npm test -w api

# Python anomaly tests
python3 -m unittest discover analytics
```

Both test suites run with `NODE_OPTIONS='--experimental-vm-modules'` for ESM support.

## Emissions calculation

```
CO₂ (kg) = consumption (L) × density (kg/L) × Cf (kg CO₂/kg fuel)
```

Reference: IMO MEPC.352(78) for the CII calculation method; MEPC.308(73), as amended,
and MEPC.364(79) for fuel-to-CO₂ conversion-factor references. Fuel densities are
representative engineering assumptions and documented separately from IMO factors.

| Fuel | Cf | Density |
|------|----|---------|
| Diesel | 3.206 | 0.840 kg/L |
| MGO | 3.206 | 0.875 kg/L |
| MDO | 3.206 | 0.875 kg/L |
| HFO | 3.114 | 0.991 kg/L |
| LNG | 2.750 | 0.450 kg/L |

## Data governance

- Sensor and emissions documents older than 30 days are deleted daily by the
  retention scheduler in `apps/api/src/db/retention.ts`.
- Every deletion is logged to `data-lifecycle.log` with timestamp and count.
- A post-demo full wipe is available via the exported `runDataWipe()` function.
