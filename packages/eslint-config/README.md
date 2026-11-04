# Shared ESLint configuration

`@repo/eslint-config` supplies the core workspaces' ESLint configurations. The
optional upstream Signal K checkout maintains its own lint setup.

| File                | Consumers and purpose                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| `server.js`         | API: recommended JavaScript checks and Node/test environments                        |
| `library.js`        | Shared Node libraries: recommended checks, formatting compatibility, and Turbo rules |
| `react-internal.js` | Shared UI source: browser/React globals and Turbo rules                              |
| `next.js`           | Dashboard: Next.js core web vitals, recommended checks, and formatting compatibility |

Each consumer selects its parser and local rules in its own `.eslintrc` file.
Some shared presets use `only-warn`; TypeScript checks and consumer overrides also
contribute to the effective gate. Passing lint is not a guarantee of complete
static-analysis coverage.

Run `npm run lint` from the repository root. It checks the core workspaces without
applying fixes. Use `npm run format` separately for formatting.
