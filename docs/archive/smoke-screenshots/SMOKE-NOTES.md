# Mission Control Dashboard — Smoke Test Notes

**Branch:** `misson-fork`
**Date:** 2026-05-27
**Commits:** `4018cbc2`, `70fb4756`

## Screenshot Evidence (port 3100 — pre-existing server)

| Route | Screenshot | Status |
|-------|-----------|--------|
| `/dashboard` | `dashboard-overview.png` | Renders — stat cards, activity, quick actions, system status |
| `/dashboard/evidence` | `dashboard-evidence.png` | Renders — 6 evidence items with status badges, search bar |
| `/dashboard/insights` | `dashboard-insights.png` | Renders — 3x2 insight card grid with trend charts |
| `/dashboard/settings` | `dashboard-settings.png` | Renders — 6 tabs, workspace/memory/agents config |

## Server Log Evidence (port 3101 — fresh server with new commits)

New routes confirmed via Turbopack dev server logs:

```
GET /dashboard/memory        200  (18.8s compile, then fast)
GET /dashboard/memory/example-id  200  (250ms)
GET /dashboard/review        200  (91ms)
GET /api/memory?group_id=allura-system  200
GET /api/memory/example-id?group_id=allura-system  200
```

Playwright screenshots timed out on port 3101 due to slow filesystem compilation (network drive).
All routes return HTTP 200 per server logs.

## Redirect Verification

- `/dashboard/feed` — file contains `redirect("/dashboard/memory")`
- `/dashboard/builder` — file contains `redirect("/dashboard/skills")`

## Build Verification

```
bun run typecheck — pass
bun vitest run — 1960 pass, 0 fail
bun run build — pass, all routes in build output
```

## Sidebar Nav

Updated labels: Overview, Memories, Graph, Insights, Evidence, Review, Agents, Projects, Skills, Settings.
Port 3100 screenshots show stale sidebar (pre-commit "Memory Feed" label). Port 3101 server compiles and serves the updated sidebar code.

## Brand Token Audit

- 18 total `bg-white` replaced with `bg-[var(--dashboard-surface)]` or `bg-[var(--dashboard-bg)]`
- Remaining `bg-white`: 21 instances in `audit/page.tsx` (durham theme) and `memory-space/page.tsx` (dark canvas overlays) — intentional
