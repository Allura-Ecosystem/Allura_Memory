# Phase 0 Opener — Story 6: Scheduled Tasks Surface

> **Type:** Fresh-session opener / scope handoff
> **Date:** 2026-06-12
> **Author:** Brooks (architect persona), approved scope owner: Sabir
> **Plan:** bmad plan `0809805b` (proposal `111e206d`, approved 2026-06-12)
> **Brain anchor:** ARCHITECTURE_DECISION `c20e9311` (2026-06-12 09:21)
> **Rule:** One L-story per loop iteration via `sprint-status.yaml`. This session is Story 6 only.

---

## 1. Mission for this session

Ship the **Scheduled Tasks production surface**: tenant-scoped, audited, with honest
`ready / empty / stale / error / degraded` states. Nothing else. Stories 7 (Settings),
8 (Teams), 9 (Dreams), and 9.5 (Gateway) stay on the shelf.

**Definition of done for this story:**

1. Scheduled Tasks page renders real data from the Brain — no mock, no placeholder.
2. Every read is tenant-scoped (`group_id` pattern `^allura-[a-z0-9-]+$`) and emits an audit event.
3. All five honest states implemented and reachable: ready, empty, stale, error, degraded.
4. Status-narrating UX: the page tells the user what state it's in, why, and what to do next.
5. Typecheck + lint + unit tests green; receipt committed and logged to Brain.

## 2. AC mapping

| AC | Relation to Story 6 |
|----|---------------------|
| AC-3 (4 surfaces real, tenant-scoped, audited) | Story 6 closes 1 of 4. Settings, Teams, Dreams remain. |
| AC-6 (invariants 6/6) | Story 6 must not regress invariants; `audit_invariant_check` re-run happens at step 12, not here. |
| AC-2 (middleware) | Closed. Story 6 routes ride the governed middleware — do not bypass it. |

## 3. Scope-call questions (answer before writing code)

1. **Data source:** Does the Scheduled Tasks surface read from the existing
   `mcp__scheduled-tasks__*` registry, a Brain-side table, or both? If both, which is
   the source of truth and which is a mirror?
2. **Write path:** Is v1 read-only (view + status), or does it include create/pause/cancel?
   Recommendation: read-only for Phase 0; mutations are a follow-up story.
3. **Stale definition:** What makes a scheduled task "stale" — missed last run window,
   no heartbeat in N minutes, or last run failed? Pick one measurable rule.
4. **Degraded definition:** Surface-level degraded (Brain reachable but partial data) vs.
   task-level degraded — which does the page narrate?
5. **Tenant scope:** Single `allura-system` group for beta, or per-tenant listing now?

## 4. Boot sequence for the fresh session

1. Run startup protocol per `_bootstrap.md`: one parallel batch —
   `audit_health_report` + `memory_search` + `audit_query_events` (48h, filtered).
   Apply the staleness rule (graph >7d or queue >100 → trust episodic).
2. Read this opener; confirm scope answers with Sabir (§3).
3. Update `sprint-status.yaml` to mark Story 6 active.
4. Implement → adversarial self-review → validate (`bun run typecheck`, `bun test`).
5. Single conventional commit; receipt doc in `docs/governance/promotion-receipts/`;
   `memory_add` receipt to Brain (group_id `allura-system`); proposed insight → HITL queue.

## 5. Carry-forward shelf (do NOT pull into this session)

- Stories 7, 8, 9, 9.5, 10–14 of plan `0809805b`.
- 3 pre-existing `agent-nodes.test.ts` failures (Initialize Default Agents x2, Verify Agent Nodes x1).
- Dashboard container (port 3100) not running.
- `.env.local` design-intent gap (empty file).
- `src/middleware.ts` deletion on main — likely replaced by `src/proxy.ts`; needs confirm.
- 6 remaining pending proposals from today's 12 (HITL).
- Main's 49-file dirty tree triage.
- Batch-D: 235 curator holds (step 11).
- Graph traversal story (deferred AC from Story 8-3; needs `graph_query` MCP tool; no story yet).
- Chat runtime Wave 2 vs Wave 3 reconciliation (decision owner: Sabir).

## 6. Risk notes

- **Highest plan risk:** batching L-stories 6–9. Mitigation is this doc — one story, one session.
- **Invariant exposure:** new surface reads must carry `group_id`; missing it is a hard failure.
- **No auto-promotion:** any insights from this session go through `curator:approve`, never direct Neo4j writes.

---

*Receipt of this opener: commit to git; optionally mirror to Brain as a `memory_add` event.*
