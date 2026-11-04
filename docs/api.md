# API guide

Base URL: `http://localhost:4001`. This local prototype has no user authentication.
The [security policy](../SECURITY.md) describes the hosting boundary. JSON responses
are not cached by browsers. Allowed browser origins default to localhost and
127.0.0.1 on port 4000.

## Core routes

| Method and path                              | Purpose                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /health`                                | HTTP liveness, `{status:"ok",ts}`                                                                    |
| `GET /status`                                | MongoDB readiness, adapter configuration, integration capabilities; 503 when MongoDB is disconnected |
| `GET /report`                                | Date-range report in JSON, CSV, or PDF                                                               |
| `GET /anomalies?limit=20`                    | Recent stored anomaly events; limit must be 1–100                                                    |
| `GET /validation/sources`                    | Cached reference metadata; no paid call                                                              |
| `GET /weather/current?lat=49.28&lon=-123.12` | Optional weather lookup, requiring a server key                                                      |

`/status` reports adapter configuration, not an end-to-end ingestion guarantee.
Use the dashboard feed status or browser tests to verify arriving packets. The
runtime smoke test checks service readiness and endpoint responses; it can pass
without an active sensor feed.

## Reports

```text
GET /report?startDate=<ISO8601>&endDate=<ISO8601>[&format=json|csv|pdf][&fuelType=diesel]
```

Supply scalar timestamps with an explicit timezone, start before end, and a range
of 31 days or less. Encode `+` in timezone offsets as `%2B`. Fuel types are `diesel`,
`MGO`, `MDO`, `HFO`, and `LNG`. The selected fuel is a **reference factor** for
comparison; totals use the emissions recorded at ingestion.

```sh
curl --get http://localhost:4001/report \
  --data-urlencode 'startDate=2026-11-03T00:00:00Z' \
  --data-urlencode 'endDate=2026-11-04T00:00:00Z' \
  --data-urlencode 'format=json'
```

The response includes fuel/water totals (L), CO₂ total (kg), average rates, hourly
series, calculation basis, fuel types observed, reference metadata, and coverage:

```json
{
  "dataCoverage": {
    "fuelObservedSeconds": 300,
    "co2ObservedSeconds": 300,
    "waterObservedSeconds": 300,
    "requestedSeconds": 86400,
    "maxSampleAgeSeconds": 300,
    "status": "partial"
  }
}
```

This snippet illustrates coverage shape only. Supported statuses are `complete`
(at least 95% support for both fuel and CO₂), `partial`, and `no_data` (neither fuel
nor CO₂ has sample support). Missing observations contribute no modeled total;
they do not establish zero consumption. Each rate sample is held until the next
sample or its configured expiry, whichever comes first.

The legacy `summaryStatus` values `compliant`, `watch`, and `warning` describe
illustrative targets. `nonCompliantPeriods` means threshold exceedances. Neither
field establishes legal or regulatory compliance. CSV cells that could start
spreadsheet formulas are prefixed with an apostrophe. Downloads use sanitized dates
in `Content-Disposition`.

## Optional validation and voice

| Method and path                           | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `POST /validation/sources/refresh`        | Refresh fixed official-source searches through Firecrawl |
| `GET /validation/agent/status`            | Text-agent enablement/configuration                      |
| `POST /validation/agent`                  | `{ "prompt": "..." }`, 1–12,000 characters               |
| `GET /validation/vessel-context`          | Recent server-side vessel context                        |
| `GET /validation/realtime/status`         | Voice-agent configuration                                |
| `GET /validation/realtime/session-config` | Initial session configuration                            |
| `POST /validation/realtime/calls`         | WebRTC offer as `application/sdp`                        |

AI is disabled unless the matching `*_AGENT_ENABLED=true` flag is set. Keep all
provider keys on the API. Optional features return explicit disabled or
not-configured states when unavailable. Weather requires scalar numeric coordinates
within latitude/longitude bounds.

## Limits and live events

Reports allow 60 requests/minute/IP, validation routes 20, and weather routes 30.
Limits are process-local; they do not replace authentication or provider quotas.
JSON bodies are limited to 32 KB and SDP to 1 MB. Do not blindly trust proxy
forwarding headers when deploying behind a gateway.

Socket.IO uses the same allowed-origin list, including WebSocket upgrade checks:

| Event            | Direction     | Payload                                                          |
| ---------------- | ------------- | ---------------------------------------------------------------- |
| `sensor:reset`   | API → browser | Clear session readings after connection                          |
| `sensor:update`  | API → browser | `{stream,value,unit,timestamp,fuelType?,cacheHit?}`              |
| `anomaly:update` | API → browser | Timestamp, score, features and contributing streams              |
| `set:fuelType`   | Browser → API | A supported fuel-type string; changes global future calculations |

The dashboard keeps 30 values per stream, clears readings on disconnect, and expires
individual values after 15 seconds. Live navigation, tank, and electrical readings
are not part of historical reports in this release.
