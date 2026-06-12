# Receipt — Story 6: Scheduled Tasks Surface LIVE

> **Date:** 2026-06-12
> **Plan:** bmad `0809805b`, step 6 · **AC:** AC-3 (1 of 4 surfaces)
> **Lead:** Brooks (Team RAM) · **Scope owner:** Sabir (delegated "take lead till done")
> **Opener:** `2026-06-12-phase-0-opener-story-6.md`

## What shipped

Scheduled Tasks dashboard surface wired to live data, replacing the static
placeholder, following the Governance reference pattern (operational-state
contract, Story 13.2).

| File | Change |
|------|--------|
| `src/lib/operational-state/sources/scheduled-tasks-source.ts` | NEW — read-only source over Postgres `events`: watchdog heartbeats (all-time last + 24h), BLOCKER, embedding_backfill, proposal_created counts. Tenant-scoped (`group_id = $1`), sanitized errors, server-only guard. |
| `src/lib/operational-state/sources/scheduled-tasks-source.test.ts` | NEW — 12 unit tests: ok/empty/degraded/error mapping, group_id bound-param pin, string-vs-Date timestamp parsing, isEmpty semantics, contract integration. |
| `src/app/dashboard/scheduled-tasks/page.tsx` | REWRITTEN — async server component, `force-dynamic`, all 5 honest states, status strip (source + freshness + scope), watchdog narration (active/idle/never), BLOCKER alert → Governance, onboarding hint on empty. |

## Scope calls (locked at session start)

1. Source = `postgres:events` (no new schema). 2. Read-only v1. 3. `freshnessMs` 30s
(Governance parity); watchdog idleness narrated in-data. 4. Degraded = surface-level
per contract. 5. Tenant `allura-system`, parameterized.

## Validation

- Typecheck: clean (`tsc --noEmit`, exit 0).
- Unit tests: 18/18 (operational-state contract 6 + source 12).
- Adversarial review (Pike): all 7 invariants PASS, 0 critical defects.
  Fixed in-session: D2 (evaluation clock taken post-fetch so ageMs honest),
  D3 (isEmpty ignores all-time heartbeat so stale heartbeat can't suppress
  onboarding), D4a (string-date parsing test).

## Carry-forward (new)

- **D1 (moderate, shared):** `UNREACHABLE` regex in both `curator-queue-source.ts`
  and `scheduled-tasks-source.ts` is over-broad (`connection|pool|password|terminated`
  matches genuine query failures → misclassified as degraded). Fix once in a shared
  helper using pg error codes; touches Governance too, so it's its own change.
- Adapter-registry entry for `/dashboard/scheduled-tasks` not added (Governance
  isn't registered either; registry seeding is a separate canonicalization task).

## Phase 0 effect

AC-3 progress: Scheduled Tasks ✅ · Settings ◻ · Teams ◻ · Dreams ◻.
Next opener: Story 7 (Settings surface), same contract, same pattern.
