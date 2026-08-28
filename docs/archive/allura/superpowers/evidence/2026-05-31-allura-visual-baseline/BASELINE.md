# Allura Visual Baseline

Date: 2026-05-31

## Decision

The Phase 2 visual/product gate is closed. Allura is the visible product and platform identity. AionUI is framework attribution only.

Approved attribution text:

- `Powered by AionUI`
- `Built on AionUI`

Do not reopen branding, logos, wordmarks, navigation, dashboard layout, color system, typography, or visual hierarchy unless a verified regression appears.

## Approved Scope

- Allura primary branding
- Powered by AionUI attribution model
- Dashboard visual readiness
- `/dashboard`
- `/dashboard/policy-center`
- Contract degradation behavior
- Allura branding hierarchy
- IRIS final approval

## Runtime Branch Scope

Future work must happen on a separate technical punch-list branch and is limited to:

- Cold-start route latency
- Runtime startup stability
- Docker/container startup behavior
- Runtime performance optimization
- Infrastructure hardening
- Health-check reliability
- Startup timing instrumentation
- Runtime verification evidence

## Evidence

Validation evidence carried from the approved gate:

- `bun run typecheck` passed
- `bun test src/__tests__/dashboard-contracts.test.ts` passed, 6/6
- `/api/health` returned HTTP 200
- `/dashboard` returned HTTP 200
- `/dashboard/policy-center` returned HTTP 200
- IRIS final visual/product approval returned `should_ship_visual: yes`, `approval_state: approved`, `prior_punch_list: closed`

Baseline preservation verification rerun before checkpoint:

- Current worktree `bun run typecheck` passed before baseline staging.
- Detached staged-baseline `bun test src/__tests__/dashboard-contracts.test.ts` passed, 6/6.
- Detached staged-baseline `bun run typecheck` was intentionally not used as approval evidence because unrelated pre-existing test references require `src/app/instrumentation.ts` and `src/navigation/sidebar/sidebar-items.ts`, which were excluded from this visual baseline checkpoint to avoid smuggling non-visual repair work into the release crate.
- `curl http://localhost:3111/api/health` returned HTTP 200 in 4.467514s
- `curl http://localhost:3111/dashboard` returned HTTP 200 in 4.832956s
- `curl http://localhost:3111/dashboard/policy-center` returned HTTP 200 in 4.208387s

Screenshot evidence in this directory:

- `dashboard-runtime-wordmark-2026-05-31.png`
- `policy-center-runtime-wordmark-2026-05-31.png`

## Trace

- Workspace daily note: `/media/ronin704/Games/linux-home/.openclaw/workspace/memory/2026-05-31.md`
- Workspace long-term memory: `/media/ronin704/Games/linux-home/.openclaw/workspace/MEMORY.md`
- Allura Brain episodic trace: `10f830b5-fc70-4b5f-aa93-95121bb3610f`

## Branch Rule

Preserve the approved ship first. Fork runtime/performance work only from a clean checkpoint after this baseline is isolated.
