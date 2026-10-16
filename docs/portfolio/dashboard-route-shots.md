# Dashboard Route Shots

Browser evidence contract for the governed operator dashboard. Each route is
captured by `bun run dashboard:browser` against the supported portfolio demo
stack (default `http://127.0.0.1:4100`) and must return HTTP 200 with no
redirect, page error, or console error. This contract is not a capture receipt.

## Captured routes

| Route | Surface | Desktop screenshot | Mobile screenshot |
|-------|---------|--------------------|-------------------|
| `/dashboard` | Overview | `overview-desktop.png` | `overview-mobile.png` |
| `/dashboard/mission-control` | Mission Control | `mission-control-desktop.png` | `mission-control-mobile.png` |
| `/dashboard/kanban` | Work Board | `kanban-desktop.png` | `kanban-mobile.png` |
| `/dashboard/search` | Search | `search-desktop.png` | `search-mobile.png` |
| `/dashboard/teams` | Teams | `teams-desktop.png` | `teams-mobile.png` |
| `/dashboard/graph` | Graph | `graph-desktop.png` | `graph-mobile.png` |
| `/dashboard/curator` | Curator | `curator-desktop.png` | `curator-mobile.png` |

## Capture rules

- All seven routes are captured at desktop **1440×1000** and mobile **390×844**
  CSS-pixel viewports: fourteen manifest entries. Mobile means responsive
  viewport coverage, not device/touch emulation. Full-page PNG height can exceed
  viewport height. Each PNG has a matching `*-desktop.snapshot.txt` or
  `*-mobile.snapshot.txt` accessibility snapshot.
- The runner owns a named session and closes only that session.
- CLI JSON diagnostics and snapshot responses fail closed on malformed or
  unsuccessful output. Live DOM state attributes are checked in addition to
  accessibility text, which does not preserve `data-*` attributes.
- Degraded/error/loading business states block capture; truthful empty data and
  the documented optional Bumblebee-disabled state remain eligible. No API data
  is stubbed.
- A route that redirects (e.g. to login), returns 404, or logs a page/console
  error is **excluded** — no screenshot is emitted for it.
- Screenshots are written to `artifacts/dashboard-demo/` alongside
  `manifest.json`.
- Freshness is recorded in `manifest.json` (`generatedAt`); a screenshot is
  never presented as healthy without a matching clean capture run.
- Start the supported demo with `bun run portfolio:dev`; it binds to loopback
  and uses `ALLURA_DASHBOARD_PORT` (default 4100). Existing ignored environment
  files are preserved; explicitly update an old local port before running.
