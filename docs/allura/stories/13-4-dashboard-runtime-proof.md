# Story 13.4: Dashboard Runtime and Tenant Proof

**Status:** partially-verified — 2026-06-12
**Priority:** P0
**Source:** Epic 13.4, F48, AD-31, RK-19

> **Evidence (2026-06-12, Team RAM / Claude CLI):** Dashboard runtime smoke
> performed against the live dev server (port 3100). 15/15 core routes return
> HTTP 200 with expected `<title>`/`<h1>` and no application-error markers:
> `/dashboard`, `/dashboard/{governance,kanban,mission-control,search,teams,
> settings,dreams,scheduled-tasks}` and the 6 Mission Control contract routes
> (`/command`, `/work-board`, `/agents`, `/telemetry`, `/allura`, `/resources`).
> Governance verified rendering live curator-queue data at runtime.
> **Remaining (pending IRIS/TALON):** interactive browser console/network capture,
> per-route screenshots (Command Center, Work Board, Runs, Memory, Crew,
> Operations, Settings), and recorded IRIS QA / IRIS CEO review verdicts. Note:
> the `.env` `POSTGRES_PASSWORD` is stale vs the running `knowledge-postgres`
> container — an environment drift that must be reconciled for clean automated
> runtime/integration runs.

## Story

As the release owner, I need live dashboard evidence under real authentication
and tenant scope before the workspace is declared implementation-ready.

## Acceptance Criteria

- [ ] The dashboard starts through the documented development path.
- [ ] Core routes return successful HTML and expected headings.
- [ ] API calls carry the active tenant and identity.
- [ ] Browser console has no uncaught errors on the core route journey.
- [ ] Loading, empty, error, and degraded states are visible and truthful.
- [ ] Screenshots are captured for Command Center, Work Board, Runs, Memory,
      Crew, Operations, and Settings.
- [ ] IRIS QA and IRIS CEO review findings are recorded.

## Verification

- Run route smoke harness and browser journey.
- Attach runtime logs, network failures, screenshots, and review verdicts.

