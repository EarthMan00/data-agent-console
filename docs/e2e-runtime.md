# Playwright E2E Runtime

## Scope

This document describes how the `data-agent-console` Playwright suite is expected to run after the 2026-06 E2E refresh.

The suite now assumes:

- real frontend routes
- real backend APIs
- real database access
- no mock session fallback

## Start-up model

`npm run test:e2e` starts or reuses the frontend dev server through Playwright `webServer`.

The backend is not started by Playwright. Start it separately before running the suite:

```powershell
cd C:\Works\Data-Agent\data-agent-server
.\start.bat
```

Then run the frontend suite:

```powershell
cd C:\Works\Data-Agent\data-agent-console
npm run test:e2e
```

## Preflight

Before the first spec runs, Playwright executes `tests/e2e/global-setup.ts`.

The preflight checks:

1. `baseURL` is reachable
2. admin login succeeds
3. `/api/user/favorite-folders` is readable with the authenticated token
4. admin prompt category create/delete works end to end

If any check fails, the suite stops before opening browser pages.

## Supported environment variables

The shared runtime config lives in `tests/e2e/config.ts`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_HOST` | `127.0.0.1` | Frontend host used by Playwright `webServer` |
| `PLAYWRIGHT_PORT` | `3000` | Frontend port used by Playwright `webServer` |
| `PLAYWRIGHT_PREFLIGHT_TIMEOUT_MS` | `15000` | Timeout for each preflight network step |
| `PLAYWRIGHT_ADMIN_USERNAME` | `admin` | Admin user used for token seeding and fixture setup |
| `PLAYWRIGHT_ADMIN_PASSWORD` | `admin123` | Admin password used for token seeding and fixture setup |
| `PLAYWRIGHT_FIXTURE_PREFIX` | `E2E` | Prefix used in created share, favorite, and feedback fixture names |
| `PLAYWRIGHT_FEEDBACK_STATUS` | `archived` | Status written back to feedback fixtures after verification |
| `PLAYWRIGHT_FEEDBACK_NOTE` | `playwright e2e fixture` | Admin note written back to feedback fixtures after verification |

## Fixture behavior

The suite creates and cleans up most of its own data:

- share tests create a prompt category and prompt template, then delete both
- visual regression tests create a favorite snapshot, then delete it
- admin feedback tests create a public feedback entry

Feedback entries cannot be deleted with the current backend API. The suite marks them as `archived` and writes the configured admin note instead.

## Typical commands

Run the full suite:

```powershell
npm run test:e2e
```

Run a focused spec:

```powershell
npm run test:e2e -- tests/e2e/share-and-replay.spec.ts
```

Run config and preflight unit coverage:

```powershell
npm run test:unit -- tests/unit/e2e-config.test.ts tests/unit/e2e-preflight.test.ts
```

## Remaining hard assumptions

The suite still requires:

- a reachable backend and database
- a valid seeded admin account
- working RBAC and favorites tables
- prompt category CRUD enabled in the backend

If CI is added later, inject the same `PLAYWRIGHT_*` variables there instead of editing `playwright.config.ts`.
