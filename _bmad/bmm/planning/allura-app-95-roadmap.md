# Allura App → .95 Roadmap

> **Status:** Active (reprioritized)
> **Date:** 2026-06-06
> **Baseline:** ~65% wired to live data
> **Target:** ≥95% — measured by truthfulness, not features
> **Architecture decision:** Embedded Claude via Anthropic API for chat runtime (open: build vs integrate AionUi — resolve at Epic 10.4)
> **Priority shift:** Governance-first build order — one backend capability unlocks three surfaces
> **Renumber note (2026-06-06):** UX Polish is **Epic 11** (Epic 8 is the completed live-Brain-wiring epic). Build order: Epic 9 → Epic 10 → Epic 11.

---

## Current State Summary

| Surface | Exists? | Live Data? | Gap to .95 |
|---|---|---|---|
| **Memory (Search/Graph/Logs/Provenance/Extracted/Approvals)** | Yes | Yes | ~95% — wire Save handler in Add Memory modal (9.4) |
| **Curator (Approvals)** | Yes | Yes (read-only) | Wire approve/reject when `curator_approve` exposed |
| **Mission Control (Health)** | Yes | Partial | Wire governance + audit MCP tools (9.1/9.2) |
| **Chat** | Yes | Yes (Brain search) | No persistent history, no file attach, no streaming, no model select (10.4) |
| **Dreams / Scheduled Tasks** | Yes | No (hardcoded) | Needs execution engine + real persistence (10.3) |
| **MCP Tools Dashboard** | Partial | Partial (probe only) | Full tool inventory, test capability, connection mgmt |
| **Governance** | Yes | Probe only | Policy gates are examples — needs real enforcement (9.1) |
| **Settings** | Yes | Mixed | Agent config works; capabilities/remote are placeholders (9.5) |

---

## Sequencing and Dependencies (Reprioritized)

```
EPIC 9 — Truthfulness Infrastructure ───────────────┐
  9.1  Governance MCP (unlocks 3 surfaces)           │
  9.2  Audit MCP (completes Mission Control)         │
  9.3  Integration Test Harness (enforces DoD)       │
  9.4  Wire Memory Add modal (quick win)             │
  9.5  Wire Settings capabilities (quick win)        │
                                                      │
EPIC 10 — Orchestration & Runtime ──────────────────┤
  10.1 Notion/Symphony Task Source                    │
  10.2 Kanban Surface (depends on 10.1)              │
  10.3 Dreams / Scheduled Tasks                      │
  10.4 Chat Runtime                                  │
                                                      │
EPIC 11 — UX Polish Layer ──────────────────────────┘
  11.1 Command Palette (Cmd+K)
  11.2 Toast Notification System
  11.3 Dark Mode
  11.4 Kanban drag-drop polish (depends on 10.2)
  11.5 UX Motion & Transitions
  11.6 Mobile Polish
```

**Build order:** Epic 9 → Epic 10 → Epic 11. Within Epic 10, stories 10.1/10.3/10.4 can parallelize.

**Rationale for reorder:**
- Governance MCP is the keystone — one backend unlocks three faking surfaces
- Integration tests enforce the Definition of Done before more features pile on
- Chat Runtime is high-value but doesn't unblock anything else
- UX Polish is last because it's cosmetic — truthfulness comes before transitions

---

## Also Needed (wiring existing surfaces — folded into Epic 9)

| Surface | What to Wire | Effort | Story |
|---|---|---|---|
| Memory Add modal | Connect Save to `memory_add` MCP tool | Small | 9.4 |
| Settings capabilities | Wire to real config store instead of placeholders | Small | 9.5 |
| Governance policy gates | Replace hardcoded examples with real policy config | Medium | 9.1 |
| Mission Control governance | Wire governance probe + audit tools | Medium | 9.1 + 9.2 |
| Curator approve/reject | Wire to `curator_approve` when Brain exposes it | Small | Unblocked by 9.1 |

---

## Definition of Done (per surface)

Every screen must pass all 7 checks before marking complete:

| # | Check | What It Means |
|---|---|---|
| 1 | Loading state | Skeleton or spinner while data fetches |
| 2 | Empty state | Honest "no data yet" with correct next action |
| 3 | Error state | Real error message with retry or escalation path |
| 4 | Ready state | Live data rendered correctly |
| 5 | Real API | Backed by actual MCP/Brain call, not hardcoded data |
| 6 | Correct next action | UI guides user to the right thing to do next |
| 7 | No fake status | No "Healthy", "Live", or "Connected" without a real signal |

---

## Score Projection (by Epic)

| Epic | Story | What Completes | Truthfulness | UX |
|---|---|---|---|---|
| — | Current state | Memory tabs (read), Partial Chat, Partial MC | ~65% | ~20% |
| 9 | 9.1 | + Governance surfaces wired to real API | ~72% | ~22% |
| 9 | 9.2 | + Audit trails, Mission Control fully live | ~78% | ~25% |
| 9 | 9.3 | + All surfaces pass DoD gate | ~82% | ~28% |
| 9 | 9.4 + 9.5 | + Memory Add + Settings wired | ~84% | ~30% |
| 10 | 10.1 | + Live task tracking via Notion | ~86% | ~32% |
| 10 | 10.2 | + Kanban surface with real data | ~89% | ~37% |
| 10 | 10.3 | + Dreams/Scheduled Tasks live | ~92% | ~42% |
| 10 | 10.4 | + Full Chat runtime | ~95% | ~55% |
| 11 | 11.1–11.6 | + Toasts, motion, shortcuts, dark mode, mobile | ~97% | ~85% |

---

## Epic Summary

| Epic | Title | Stories | Status | Prerequisite |
|---|---|---|---|---|
| **9** | [Truthfulness Infrastructure](epic-9-truthfulness-infrastructure.md) | 9.1–9.5 | Ready (in-progress) | None |
| **10** | [Orchestration & Runtime](epic-10-orchestration-runtime.md) | 10.1–10.4 | Backlog | Epic 9 |
| **11** | [UX Polish Layer](epic-11-ux-polish.md) | 11.1–11.6 | Backlog | Epics 9 + 10 |

**Total stories:** 15 (5 + 4 + 6)
**Critical path:** 9.1 → 9.2 → 9.3 → 10.1 → 10.2 (serial). Stories 10.3 and 10.4 parallelize after Epic 9.

---

## References

- [Epic 9 — Truthfulness Infrastructure](epic-9-truthfulness-infrastructure.md)
- [Epic 10 — Orchestration & Runtime](epic-10-orchestration-runtime.md)
- [Epic 11 — UX Polish](epic-11-ux-polish.md)
- [Symphony Notion Adapter Spec](symphony-notion-adapter-spec.md)
- AionUi source: `/media/ronin704/Games/Projects/ai-agents/aion/`
- Allura App: `/home/ronin704/Projects/design/brand-maker/allura-app/`

---

> **Provenance:** Relocated from `docs/archive/allura/allura-app-95-roadmap.md` into `_bmad/bmm/planning/` on 2026-06-06; UX Polish references renumbered Epic 8 → Epic 11; AionUi source path corrected.
