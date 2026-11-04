# Optional integrations

The default simulator, dashboard, emissions calculations, and reports work without
external API keys. Enable extra services only when you need them. Provider keys
stay in the API; enabling a service can send prompts, vessel context, coordinates,
or source queries to that provider. See [Security](../SECURITY.md).

## Configure and restart

Copy `.env.example` to `.env` without replacing an existing file, then edit the
root `.env` locally. Never commit keys or put them in `NEXT_PUBLIC_*` variables.

For Docker, recreate the API after changing supported environment settings:

```sh
docker compose up -d api
```

For native development, stop and restart `npm run dev -w api`. Exported environment
variables and an API-workspace `.env` take precedence over the root fallback file.

| Feature           | Settings in `.env`                                | Behavior                                                                                   |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Signal K          | `SIGNALK_ENABLED=true`, `SIGNALK_URL`             | Connects an optional own-vessel stream; follow the [bridge guide](signalk-architecture.md) |
| Source refresh    | `FIRECRAWL_API_KEY`                               | Refreshes fixed reference searches when requested                                          |
| Text assistant    | `OPENAI_API_KEY`, `VALIDATION_AGENT_ENABLED=true` | Enables the optional validation/chat agent                                                 |
| Voice assistant   | `OPENAI_API_KEY`, `REALTIME_AGENT_ENABLED=true`   | Enables browser microphone/WebRTC sessions                                                 |
| Weather           | `OPENWEATHER_API_KEY`                             | Looks up the coordinates selected by the user                                              |
| Anomaly detection | `ANOMALY_DETECTION_ENABLED=true`                  | Runs the Python detector on recent stored readings                                         |

The AI flags and anomaly scheduler default to disabled. Adding an OpenAI key alone
does not enable either assistant. Optional service availability is shown under
**Weather & optional connections** in the dashboard.

## Source evidence

Reports include static reference links even without Firecrawl. **Refresh** invokes
fixed searches and updates a local metadata cache; it does not validate report
arithmetic. Exact HTTPS hostnames are checked against each source's allowlist,
which includes IMO, EPA, and Signal K hosts.

See [Source verification](validation/official-sources.md) for cache behavior,
status meanings, and the distinction between a verified link and certification.

## Text and voice assistants

The text agent can call local emissions calculations, look up reference metadata,
and read recent server-side vessel context. Voice sessions use a server-side
OpenAI connection negotiated through the API. Both are optional interpretations
of available data; neither certifies compliance or replaces navigation judgment.

`OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_VOICE` are optional overrides supported
by the API and Compose. Without overrides, the API uses its SDK model default and
configured default voice. Provider access and billing are separate from this repo.

Status checks do not start a paid conversation:

```sh
curl http://localhost:4001/validation/agent/status
curl http://localhost:4001/validation/realtime/status
```

Starting a chat, requesting an agent check, or opening a voice session can invoke
the provider. Browser microphone access requires permission and a secure context
such as localhost or HTTPS.

## Weather

Use **Get vessel weather** or **Use my location** to request a lookup explicitly.
The API sends the selected coordinates to OpenWeather. Missing configuration is
reported as `not_configured`; the monitoring dashboard continues to work.

## Anomaly detection

The scheduler reads MongoDB and invokes `analytics/anomaly_detection.py`.
The API Docker image includes Python and its MongoDB connector. Native development
requires installing the optional dependencies in [the analytics guide](../analytics/README.md).

`ANOMALY_INTERVAL_MS` defaults to 300000 and `ANOMALY_LOOKBACK_MINUTES` to 1440.
The detector is experimental. “No events” does not establish that it is enabled or
that the vessel is operating normally.

## Advanced native configuration

The API also reads `FIRECRAWL_API_URL`, `OPENAI_REALTIME_CALLS_URL`,
`OPENAI_REALTIME_TRANSCRIPTION_MODEL`, `OPENWEATHER_BASE_URL`,
`VALIDATION_SOURCE_CACHE_PATH`, and `ANOMALY_SCRIPT_PATH` from its environment.
The provided Compose file does not forward these advanced settings. For container
use, pass them explicitly through a reviewed Compose override; merely adding them
to the root `.env` does not inject them into the API container.

## Editor tools

`.vscode/mcp.json` defines optional Firecrawl and Signal K MCP servers with
environment-backed configuration. These are developer tools, independent of the
runtime integrations. Opening the dashboard does not require starting them.
