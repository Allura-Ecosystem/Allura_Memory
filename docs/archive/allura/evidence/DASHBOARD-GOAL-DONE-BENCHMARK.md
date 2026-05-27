# Allura Dreaming Dashboard Goal, Done Checklist, and Benchmark

> **Status:** Active build contract  
> **Benchmark:** `http://localhost:6420`  
> **Target:** `http://localhost:3100/dashboard`  
> **Rule:** Do not rebuild, preserve, remix, or cosmetically patch the old wiped dashboard.

## Goal

Build a new Allura Dreaming dashboard at `localhost:3100/dashboard` that follows the `localhost:6420` reference direction and does not reuse, preserve, or visually remix the old wiped dashboard.

The dashboard is a warm memory/provenance workspace, not a system-status admin shell.

Primary user questions:

1. What does Allura remember?
2. Where did that memory come from?
3. What needs human approval?
4. What work is moving, blocked, or ready for review?

Primary product promise:

> Memory that shows its work.

## Reference Direction

`localhost:6420` is the visual and product benchmark.

The new dashboard should preserve the reference's product structure:

- left workflow navigation
- search-first memory workspace
- recent memories
- approval queue visible on the first screen
- memory detail and provenance visible on the first screen or immediately adjacent
- recent activity
- warm cream / white / charcoal / orange / green visual language

The new dashboard must not preserve the old `3100` dashboard structure.

## Done Checklist

A dashboard task is only Done when all of these pass:

1. `localhost:3100/dashboard` opens in browser without build/runtime overlay.
2. The screen visibly follows `localhost:6420`:
   - warm cream workspace
   - search-first layout
   - recent memories visible
   - approval queue visible
   - provenance/detail area visible
   - recent activity visible
3. The new dashboard does not import old dashboard UI:
   - no `@/components/dashboard`
   - no old sidebar/topbar
   - no `live-kpis`
   - no `health-table`
   - no `budget-card`
   - no `agency-card`
   - no `metric-card`
4. The new dashboard does not use old logo/copy assumptions:
   - no `/brand/lettermark-AL.png`
   - no `/brand/wordmark.png`
   - no `Allura Memory` as primary dashboard identity
   - no `Dashboard — Allura Memory`
5. Browser proof exists:
   - screenshot of `localhost:6420`
   - screenshot of `localhost:3100/dashboard`
   - side-by-side comparison notes
6. Data behavior is honest:
   - no fake healthy state
   - no fake live state
   - no fake counts unless clearly marked demo/seed
   - degraded and empty states are explicit
7. Governance actions are truthful:
   - approve uses the approved curator endpoint
   - request edit / needs evidence does not pretend to be a real backend state unless implemented
   - no direct promotion bypasses approval
8. Kanban integration is scoped correctly:
   - dashboard may show a mission strip
   - full Kanban board is a separate route/workstream
   - Done cards require evidence
9. TypeScript/test verification passes.
10. Glaser / Munari / RuVix review passes.
11. Captain approves the browser result.

## Benchmark

The benchmark is `http://localhost:6420`.

| Benchmark Area | Required New Dashboard Behavior |
| --- | --- |
| Product feel | Warm, calm, memory workspace |
| First action | Search memories |
| Core object | Memory with provenance |
| Secondary object | Approval item |
| Navigation | Workflow-oriented, not admin shell |
| Visual system | Cream, white, charcoal, orange, green |
| Copy | `Find memories. Follow provenance. Govern what sticks.` direction |
| Density | Focused, editorial, not cluttered |
| Proof | Browser screenshot, not logs |
| Failure condition | Looks like old `3100` dashboard |

## Anti-Benchmark

The following are explicit anti-references:

- old `localhost:3100/dashboard`
- old dark shell
- health-first command center
- generic metric-card grid
- old Allura Memory nav/sidebar
- old logo lockup
- old dashboard component library

## Kanban Relationship

The dashboard and Kanban board are related but separate.

- `/dashboard` answers: what does Allura remember, where did it come from, and what needs approval?
- `/dashboard/board` or `/work-board` answers: what work is happening, who owns it, and what evidence proves Done?

The dashboard may include a small mission strip summarizing Kanban status. The full Native Allura Kanban board remains a separate work-control plane.

## Allura Guarantee

Allura guarantees the work through evidence and memory accountability.

Every dashboard build card must contain:

- goal
- owner
- scope
- forbidden imports list
- benchmark link
- implementation diff
- screenshot proof
- validation output
- review decision
- approval state

Allura records:

- what changed
- why it changed
- who reviewed it
- what evidence proves it
- whether it passed or failed
- what superseded the old dashboard

No Done claim is valid without evidence.

Allura Brain memory log format:

```text
Dashboard Build Evidence:
Goal: Build new Allura Dreaming dashboard from 6420 reference.
Changed files: <list>
Forbidden import check: <pass/fail>
Browser proof: <screenshot paths>
Reviewer: <agent/person>
Decision: <approved/rejected/needs changes>
Reason: <summary>
```

## Team Durham Roles

OpenAgent coordinates, Team Durham reviews, Codex/Woz implements.

| Role | Responsibility |
| --- | --- |
| OpenAgent | Route work, maintain oversight |
| Kotler | Product goal and scope boundary |
| Glaser | Visual direction against `6420` |
| Tufte | Information hierarchy and evidence clarity |
| Munari | UX/accessibility/quality gate |
| Scout | Forbidden import/file recon |
| RuVix | Reject drift and unsupported claims |
| Allura | Evidence memory and approval trail |
| Codex/Woz | Code implementation only after gates are clear |

## Execution Sequence

1. Create or update Kanban card: `Build new Allura Dreaming dashboard from 6420 reference`.
2. Attach this document and `RUVIX-DASHBOARD-GATE.md` to the card.
3. Add forbidden import benchmark checks.
4. Build a clean isolated dashboard surface.
5. Browser verify `localhost:3100/dashboard`.
6. Compare against `localhost:6420`.
7. Run Team Durham review.
8. Log Allura evidence.
9. Ask for Captain approval.
