# Contributing

Start with the [quick start](README.md#quick-start) and [architecture](docs/architecture.md).
The core repository uses Node 22+, npm workspaces, TypeScript, and Python 3.10+.
Signal K is optional and maintained upstream; keep its source checkout outside
core changes.

1. Create a focused branch from the default branch.
2. Install with `npm ci`. Copy `.env.example` to `.env` if it does not exist.
3. Reproduce the issue using synthetic data. Add a regression test for behavior
   changes, especially units, emissions, date boundaries, and missing data.
4. Run `npm run check`. Integration tests start a temporary MongoDB instance;
   the first run may download a MongoDB binary. They do not use your demo database.
5. Include a concise description and verification results with your pull request.
   Include desktop and mobile screenshots when changing the UI.

Use `npm run format` to format original application code and the main docs. Keep
public documentation focused on setup, usage, architecture, and maintenance; use
the [documentation index](docs/README.md) to find the appropriate guide. Academic
submissions, milestones, planning templates, and their historical QA captures are
local-only material covered by explicit ignore rules. Do not add them to commits.
Keep current screenshots in `docs/images/` and reproducible checks in the test suite.
Keep upstream Signal K changes separate, and keep secrets out of fixtures and
commits. Report security issues using [SECURITY.md](SECURITY.md).

## Useful commands

| Command                 | Purpose                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run lint`          | Check all core workspaces; does not apply fixes                                                                 |
| `npm test`              | TypeScript unit and temporary-MongoDB integration tests                                                         |
| `npm run test:python`   | Standard-library analytics tests                                                                                |
| `npm run build`         | Build shared packages, API, and Next.js                                                                         |
| `npm run smoke:runtime` | Verify a running local stack and simulator                                                                      |
| `npm run test:browser`  | Browser smoke tests against a running simulator stack (install Chromium with `npx playwright install chromium`) |
| `npm audit --omit=dev`  | Check production dependency advisories                                                                          |

Code contributions are distributed under the project's MIT license. Keep existing
third-party notices intact.
