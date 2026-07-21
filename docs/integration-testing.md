# Integration Testing and Runtime Verification

Use this sequence for Week 10-11 verification and Week 12 demo prep.

## 1. Start MongoDB

```sh
docker-compose up -d mongo
docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Status}}'
```

Expected:

```text
mongo    0.0.0.0:27017->27017/tcp    Up ...
```

## 2. Start the API

```sh
npm run dev -w api
```

Expected:

* API on `http://localhost:4001`
* NMEA UDP listener on `10110`
* MongoDB connected
* Signal K disabled unless `SIGNALK_ENABLED=true`

## 3. Start the web dashboard

```sh
npm run dev -w web
```

Expected:

* Dashboard on `http://localhost:4000`
* Socket.IO connects to `http://localhost:4001`

## 4. Run smoke verification

```sh
npm run smoke:runtime
```

The smoke command checks MongoDB, API health/status, report generation, validation-source metadata, the anomalies endpoint, and the web app.

## 5. Stream simulated data

```sh
python3 simulation/nmea_generator.py --duration 60
```

Expected:

* Dashboard fuel, generator, water, temperature, heading, wind, COG, SOG, STW, magnetic variation, GNSS, log, trip, and position instruments update.
* CO2 emission rate updates in `kg/h`.
* Report totals integrate rates over elapsed time.

## Optional: Signal K

```sh
SIGNALK_ENABLED=true \
SIGNALK_URL=ws://localhost:3000/signalk/v1/stream \
npm run dev -w api
```

Signal K current tank level is displayed as tank level, not counted as water usage.

## Optional: Firecrawl

```sh
FIRECRAWL_API_KEY=... npm run dev -w api
curl -X POST http://localhost:4001/validation/sources/refresh
```

Searches are restricted to official domains. Reports still generate when Firecrawl is unavailable.

## Optional: OpenAI Agents SDK

```sh
VALIDATION_AGENT_ENABLED=true OPENAI_API_KEY=... npm run dev -w api
curl -X POST http://localhost:4001/validation/agent \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Validate this Suvion emissions setup."}'
```

The agent summarizes validation evidence only. It does not certify compliance.

## Optional: OpenAI Realtime Agent

```sh
REALTIME_AGENT_ENABLED=true OPENAI_API_KEY=... npm run dev -w api
curl http://localhost:4001/validation/realtime/status
```

Expected:

* `status` is `ready` when the key and feature flag are present.
* The dashboard integration panel enables the realtime voice button.
* Browser microphone traffic is negotiated through `POST /validation/realtime/calls`; the API key remains server-side.

## Optional: OpenWeather

```sh
OPENWEATHER_API_KEY=... npm run dev -w api
curl 'http://localhost:4001/weather/current?lat=37.7749&lon=-122.4194'
```

Expected:

* `status` is `completed` with temperature, wind, humidity, pressure, and visibility.
* Without the key, `status` is `not_configured` and the dashboard still runs.
* The dashboard can request weather from vessel GNSS or browser geolocation.
