# Public-release readiness

Reviewed November 3, 2026 (America/Vancouver). The supported release is a **local,
single-vessel research prototype with public source code**. Internet hosting and
real-vessel operational use require the additional controls in [SECURITY.md](../SECURITY.md).

## Delivered

- MIT license for original code, third-party notices, contribution/security policies,
  issue/PR templates, CI, and weekly dependency-update configuration.
- Reproducible core workspaces, restored optional Signal K submodule mapping,
  Node 22 baseline, and a lockfile generated from clean workspace manifests.
- Next.js 15.5.28 / React 19 upgrade and a patched PostCSS 8.5.32 override.
  Keep the override until the supported framework line pins an acceptable release.
- Loopback service bindings, managed Compose networking, readiness dependencies,
  non-root application containers, and Docker context exclusions for secrets.
- Corrected emissions cache keys, Signal K flow units, report sample expiry,
  missing-data coverage, exact source-domain checks, input validation, and safe CSV cells.
- A responsive instrument dashboard with explicit connection/freshness states,
  first-run guidance, UTC report controls, and optional-service disclosures.
- Architecture, API, user, and reference guides; original SVG architecture artwork;
  desktop/mobile screenshots captured from the synthetic simulator.
- Academic submissions, generated exports, assessment captures, and their export
  script are local-only. The documentation index points to current project guides.

## Verification record

| Check                                    | Result                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Clean `npm ci` from regenerated lockfile | Passed                                                                                                  |
| `npm run lint`                           | Passed, zero warnings                                                                                   |
| Emissions unit tests                     | 121 passed, including changing-flow/zero-flow cache regression                                          |
| API tests                                | 68 passed, including temporary MongoDB validation, report coverage, HTTP boundaries, and protocol units |
| Logger unit test                         | 1 passed                                                                                                |
| Python analytics tests                   | 16 passed                                                                                               |
| `npm run build`                          | Passed for shared packages, API, and Next.js production output                                          |
| Docker images and isolated stack         | Built and started with a fresh MongoDB volume; API readiness healthy                                    |
| Runtime smoke                            | 7 of 7 checks passed                                                                                    |
| Chromium smoke                           | 2 passed: live data/navigation/reports/mobile and offline recovery                                      |
| Paused simulator                         | Live values expired after 15 seconds and recovery guidance appeared                                     |
| Mobile horizontal overflow               | No overflow at 390 × 844                                                                                |
| Production dependency audit              | 0 vulnerabilities                                                                                       |
| Complete dependency audit                | 39 development-tooling findings: 36 moderate, 3 low; no high/critical findings                          |
| Tracked files and seven Git commit trees | No matches for the credential patterns scanned; no tracked `.env` history found                         |
| `git diff --check`                       | Passed                                                                                                  |

Local verification used macOS/ARM, Node 24, Python 3.12, Docker with the Node 22
application images, and an installed Chromium browser. CI is configured to repeat
checks on Ubuntu/Node 22 with its matching Playwright Chromium download. CI has
not yet run on the remote repository. Local browser checks are smoke tests, not
an exhaustive accessibility or cross-browser audit.

The credential review checked common OpenAI/Firecrawl/GitHub/AWS key patterns and
private-key headers in bounded text blobs, excluding upstream Signal K history.
It is not a full entropy scan or a guarantee that no sensitive information exists.
Academic submissions and old assessment captures are excluded from the current
source tree. Review earlier commits separately if those materials must remain
private; the credential scan is not a review of publication rights.

## Documentation review

The public guides describe current setup, API behavior, unit conventions,
calculation assumptions, and operational limits. The full proposal, final reports
and exports, historical assessment captures, and their export-only script have
been untracked with local copies preserved. Milestones and academic templates
remain local-only as well. A short BCIT background and public source links provide
context without making academic submissions part of product documentation.

The review also corrected smoke-test scope, advanced environment forwarding,
source-cache status meanings, Signal K setup, and experimental analytics claims.
Shared configuration and agent-evaluation READMEs now describe their actual role.

## Remaining dependency work

The full audit flags development-tool chains around Jest/ts-jest, ESLint, glob,
minimatch, and deepmerge. Compatible updates were applied; major-version overrides
were not forced onto consumers that expect older APIs. Test-preset dependencies
are now development-only, and the API container prunes development packages.
The production audit is clean. Track the remaining development advisories and
re-run both audits before tagging a release; advisory counts change over time.

```sh
npm audit --omit=dev
npm audit
```

## Owner actions before changing repository visibility

- [ ] Review the current source, screenshots, and third-party material for
      publication rights and personal information. Decide whether earlier academic
      submissions in Git history may be public before changing repository visibility.
- [ ] Enable private vulnerability reporting and available secret scanning/push protection.
- [ ] Enable branch protection and require the added CI checks after their first successful run.
- [ ] Review the final diff, select a release tag, and publish release notes.
- [ ] If deployment will be reachable beyond the local computer, first complete
      authentication, authorization, TLS, database security, and operational controls.

Repository visibility, hosted deployment, release tags, and remote branch settings
were not changed during this preparation.

Academic submissions and planning material are excluded from the current source
tree while local copies are preserved. Untracking does not remove their contents
from earlier commits; this cleanup does not rewrite Git history.

## Reproduce the browser screenshots

With the default Docker stack running:

```sh
npm ci
npx playwright install chromium
CAPTURE_DOCS=1 npm run test:browser
```

This writes `docs/images/dashboard-desktop.png` and `dashboard-mobile.png` using
synthetic data. Use `WEB_HOST` to test a different local dashboard address. API and
MongoDB smoke addresses can be changed with `API_HOST`, `MONGO_HOST`, and `MONGO_PORT`.
