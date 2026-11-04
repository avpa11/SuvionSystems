# Security

Suvion Systems is a local, single-vessel research prototype. Making this source
repository public does not make its API suitable for anonymous internet hosting.
There is no user authentication or per-vessel authorization.

## Supported deployment

Use the Docker quick start or native loopback defaults on a trusted computer.
Published Docker ports bind to `127.0.0.1`; native API and UDP listeners also bind
to loopback. CORS and Socket.IO accept the origins listed in `ALLOWED_ORIGINS`.
Origin checks and rate limits reduce browser abuse; they are not authentication.
Local programs can still read reports and change the shared fuel setting.

Before any internet or untrusted-network deployment, implement authentication
(including Socket.IO), authorization for reports and fuel configuration, TLS,
MongoDB credentials and network isolation, provider quotas, and log rotation.
Do not expose UDP ingestion to untrusted senders. Validate real sensors and source
identity before relying on measurements.

## Secrets and privacy

- Keep API keys in the root `.env` or environment. `.env*` is ignored and excluded
  from Docker builds. `.env.example` contains placeholders only.
- Only `NEXT_PUBLIC_API_HOST` belongs in browser configuration. Public variables
  are bundled into JavaScript and are visible to anyone opening the dashboard.
- AI features require explicit enablement and a server-side key. Enabling them
  sends prompts and current vessel context to OpenAI. Weather lookups send the
  selected coordinates to OpenWeather; Firecrawl refreshes send source queries.
- Use synthetic data in public issues, screenshots, fixtures, and logs. Live
  coordinates and identifiers can be sensitive even when schemas exclude names.
- Sensor, emissions, and anomaly records older than 30 days are deleted at API
  startup and daily thereafter. Lifecycle records and filesystem logs are not
  automatically rotated. Backups have their own retention requirements.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** private reporting flow
if enabled. Otherwise contact the repository owner privately through an existing
trusted channel before disclosing exploit details publicly. Do not post secrets,
live vessel data, or active credentials in an issue.

The maintainer should enable private vulnerability reporting, secret scanning,
push protection where available, and branch protection before publication. Review
[the release checklist](docs/release-readiness.md) for the current verification record
and dependency-audit limitations.
