# Dashboard Route Shots

Current browser evidence for the governed operator dashboard. Each route is
captured by `bun run dashboard:browser` against the supported portfolio demo
stack and must return HTTP 200 with no redirect, page error, or console error.

## Captured routes

| Route | Surface | Screenshot |
|-------|---------|------------|
| `/dashboard` | Overview | `overview.png` |
| `/dashboard/mission-control` | Mission Control | `mission-control.png` |
| `/dashboard/kanban` | Work Board | `kanban.png` |
| `/dashboard/search` | Search | `search.png` |
| `/dashboard/teams` | Teams | `teams.png` |
| `/dashboard/graph` | Graph | `graph.png` |
| `/dashboard/curator` | Curator | `curator.png` |

## Capture rules

- A route that redirects (e.g. to login), returns 404, or logs a page/console
  error is **excluded** — no screenshot is emitted for it.
- Screenshots are written to `artifacts/dashboard-demo/` alongside
  `manifest.json`.
- Freshness is recorded in `manifest.json` (`generatedAt`); a screenshot is
  never presented as healthy without a matching clean capture run.
