# Documentation

Start with the repository [quick start](../README.md#quick-start), then choose the
guide for your task. These guides describe the current implementation.

| Guide                                          | What it covers                                           |
| ---------------------------------------------- | -------------------------------------------------------- |
| [User guide](user-guide.md)                    | Instruments, feed states, reports, and troubleshooting   |
| [Architecture](architecture.md)                | Components, data flow, tradeoffs, and remaining work     |
| [API](api.md)                                  | REST routes, live events, units, and request limits      |
| [Integrations](integrations.md)                | Optional weather, source evidence, AI, and analytics     |
| [Signal K](signalk-architecture.md)            | Optional marine-data bridge and unit conversions         |
| [Runtime verification](integration-testing.md) | Local integration and smoke checks                       |
| [References](references.md)                    | Project background, calculation assumptions, and sources |
| [Release readiness](release-readiness.md)      | Verification results and publication checklist           |

The [source-verification guide](validation/official-sources.md) explains reference
cache behavior and its limits.

For development workflow, see [Contributing](../CONTRIBUTING.md). For deployment
boundaries and vulnerability reporting, see [Security](../SECURITY.md).

Module-specific guidance is available for [analytics](../analytics/README.md),
[agent evaluation cases](../apps/api/evals/README.md),
[TypeScript configuration](../packages/typescript-config/README.md), and
[ESLint configuration](../packages/eslint-config/README.md).

## Documentation policy

Publish setup instructions, usage, architecture, API contracts, calculation sources,
and reproducible verification steps. Keep the short capstone background and public
BCIT story for context. Screenshots in `images/` use synthetic data.

Full proposals, final submissions and exports, milestones, planning templates, and
historical assessment captures are excluded from the current Git tree. Local
copies remain available to their owner. Git ignore rules do not make previously
committed content private; earlier commits retain it unless history is separately
rewritten or a new public repository is created from a reviewed snapshot.
