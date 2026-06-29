# Data Agent Console

Frontend console for the Data-Agent platform.

This app is a Next.js application that talks to the real `data-agent-server` backend. It is not designed around mock runtime data or fallback demo flows.

## Main areas

- `/` home composer
- `/agent` agent workspace
- `/report` report view
- `/artifacts` favorites and saved outputs
- `/prompt-library` prompt library
- `/schedules` scheduled tasks
- `/share/[shareId]` public share page
- `/admin/*` platform admin pages

## Prerequisites

- Node.js 20+
- npm 10+
- `data-agent-server` running locally

For local backend startup:

```powershell
cd C:\Works\Data-Agent\data-agent-server
.\start.bat
```

The backend defaults to `http://127.0.0.1:8000`.

## Frontend runtime modes

The console supports two backend connection modes.

### 1. Direct browser-to-backend mode

Set:

```env
NEXT_PUBLIC_AGENT_API_ORIGIN=http://127.0.0.1:8000
```

Optional:

```env
NEXT_PUBLIC_AGENT_WS_ORIGIN=ws://127.0.0.1:8000
```

### 2. Same-origin proxy mode

Use this when browser HTTP traffic should go through Next.js first, especially for SSE streaming.

Set:

```env
NEXT_PUBLIC_AGENT_API_USE_PROXY=1
AGENT_WEB_PLATFORM_INTERNAL_URL=http://127.0.0.1:8000
```

Notes:

- Browser HTTP requests go to `/agent-platform/*`
- The proxy route lives in `app/agent-platform/[...path]/route.ts`
- SSE must use this route-based proxy, not `next.config.js` rewrites
- Do not point `AGENT_WEB_PLATFORM_INTERNAL_URL` to a public `/agent-platform` URL

## Local development

Standard local run:

```powershell
cd C:\Works\Data-Agent\data-agent-console
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

If you need LAN access during development, run on `0.0.0.0` and add allowed origins through:

```env
NEXT_DEV_ALLOWED_ORIGINS=http://your-lan-host:3000
```

## Quality commands

```powershell
npm run lint
npm run test:unit
npm run test:component
npm run test:e2e
```

## GitHub Actions

Repo-local CI is defined in:

- `.github/workflows/console-quality.yml`

It currently covers:

- `npm run lint`
- `npm run test:unit`
- `npm run test:component`

Playwright E2E is intentionally kept out of this workflow for now because it depends on:

- the separate `data-agent-server` repository
- a prepared PostgreSQL database
- seeded admin credentials and backend bootstrap state

## Playwright E2E

The Playwright suite uses:

- real backend APIs
- real database access
- admin-token seeding for authenticated pages
- global preflight before specs start

See the dedicated runtime guide:

- `docs/e2e-runtime.md`

Environment template:

- `.env.playwright.example`

## TODO / Later

These items are intentionally deferred for now:

- add a cross-repo E2E workflow that boots `data-agent-server`, PostgreSQL, migrations, and the frontend together
- expand automation coverage for the remaining high-priority manual scenarios in `docs/test-cases-master.md`
- further streamline the repo docs once the runtime and test surface stop changing as quickly
- add an admin-managed Alice persona module with publishable versions so new chats pick up the latest persona immediately while existing chats, reopened history sessions, and scheduled-task conversations stay pinned to the persona version they started with

## Important constraints

- The console is expected to use real backend data
- Internal tool names must not leak into user-facing UI
- Runtime failures should surface as explicit errors, not mock fallback content

## Related files

- `playwright.config.ts`
- `tests/e2e/config.ts`
- `tests/e2e/global-setup.ts`
- `lib/agent-api/config.ts`
- `app/agent-platform/[...path]/route.ts`
