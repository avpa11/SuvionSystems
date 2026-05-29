# Suvion Systems — Environmental Monitoring Dashboard

Maritime vessel sustainability tracking for small vessel operators. Provides real-time sensor
data ingestion, automated CO₂ emissions calculations, and sustainability report generation.

## Architecture

```
simulation/nmea_generator.py   →  UDP :10110
                                         ↓
                               apps/api  (Node.js adapter + REST API)
                               ├── NMEA UDP listener on :10110
                               ├── Signal K WebSocket bridge (optional)
                               ├── @repo/emissions engine + 60 s cache
                               ├── MongoDB persistence + 30-day retention
                               └── Socket.IO broadcast + GET /report
                                         ↓
                               apps/web  (Next.js dashboard :4000)
                               ├── Fuel · Generator · Water · Temperature widgets
                               ├── CO₂ emissions widget + fuel-type selector
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
docker-compose up -d mongo
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

### 5. Run the NMEA simulator

```sh
# Cruising (default) — fuel 12.5 L/h, generator 8.2 A
python3 simulation/nmea_generator.py

# Vessel at anchor — low fuel, high generator load
python3 simulation/nmea_generator.py --scenario anchoring

# Generator cycling — triggers non-compliant period detection
python3 simulation/nmea_generator.py --scenario generator_cycling

# Run for a fixed duration (seconds)
python3 simulation/nmea_generator.py --duration 86400
```

### 6. Full Docker stack

```sh
docker network create app_network
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose build
docker-compose up -d
```

## Package overview

| Package | Description |
|---------|-------------|
| `apps/api` | Express + Socket.IO adapter, MongoDB persistence, `GET /report` REST endpoint |
| `apps/web` | Next.js 14 SPA dashboard |
| `packages/emissions` | Stateless CO₂ engine — IMO MEPC.361(78) factors, 60 s cache |
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

## Running tests

```sh
# Emissions unit tests — 120 scenarios, all ≤0.5 % error vs MEPC.361(78)
npm test -w @repo/emissions

# Reporting API integration tests (uses mongodb-memory-server, no real DB needed)
npm test -w api
```

Both test suites run with `NODE_OPTIONS='--experimental-vm-modules'` for ESM support.

## Emissions calculation

```
CO₂ (kg) = consumption (L) × density (kg/L) × Cf (kg CO₂/kg fuel)
```

Reference: IMO MEPC.361(78), §4 — GHG Intensity Calculation Guidelines.

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
