# Runtime verification

Run commands from the repository root. The [quick start](../README.md#quick-start)
provides installation prerequisites; [release readiness](release-readiness.md)
records a dated verification run. Use synthetic data for repeatable checks.

## Automated code checks

```sh
npm ci
npm run check
```

This runs lint, TypeScript tests, Python analytics tests, and production builds.
API tests use a temporary MongoDB instance, separate from your demo database. The
first run may download a MongoDB binary. No external AI/weather credentials are
needed for these tests.

## Verify the Docker stack

```sh
docker compose up --build --wait
npm run smoke:runtime
```

The Compose stack includes its own simulator. Do not run a second host simulator
against it. MongoDB, the API, and the dashboard have readiness checks.

The seven smoke checks cover MongoDB connectivity, API health/readiness,
reference metadata, the anomalies endpoint, report generation, and dashboard HTTP
availability. They can pass with no sensor data, so verify the live feed separately.

```sh
npx playwright install chromium
npm run test:browser
```

Browser smoke tests check arriving readings, navigation selection, report
rendering, a 390-pixel mobile layout, and offline guidance. They require the stack
and simulator to keep running. They do not test paid provider calls or establish
full accessibility, cross-browser coverage, or sensor accuracy.

Stop the stack with `docker compose down` when finished. This preserves its data
volume. `WEB_HOST`, `API_HOST`, `MONGO_HOST`, and `MONGO_PORT` can override the
smoke-test addresses; browser tests use `WEB_HOST`.

## Verify a native setup

Complete the [native setup](../README.md#native-development), including shared
package builds. Start MongoDB with `docker compose up -d mongo`, then run each of
these in a separate terminal:

```sh
npm run dev -w api
npm run dev -w web
python3 simulation/nmea_generator.py --scenario cruising
```

Run the runtime and browser checks above while all processes are active. Verify:

- **Receiving data** appears and readings have units and recent timestamps.
- Environment and navigation instruments populate when selected.
- A report for the current UTC day shows sample coverage and download controls.
- Stopping the simulator produces **Sensor feed paused** after 15 seconds and
  clears expired readings. Restarting it restores the instruments.

The smoke test alone does not verify CSV/PDF file contents. API integration tests
check report responses and download types; inspect an exported document when
changing its layout or serialization.

## Optional services

Configure services using [the integration guide](integrations.md), then restart or
recreate the API. Check status before invoking a provider:

```sh
curl http://localhost:4001/status
curl http://localhost:4001/validation/agent/status
curl http://localhost:4001/validation/realtime/status
```

A feature should report disabled or not configured when its prerequisites are
absent. Running a source refresh, weather lookup, agent check, or voice session
can call an external service. These are manual integration checks, separate from
the credential-free automated suite.
