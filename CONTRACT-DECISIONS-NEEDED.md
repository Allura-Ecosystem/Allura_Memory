# Contract Decisions Needed

> Date: 2026-06-01 03:31 EDT
> Owner needed: Sabir
> Standard: no route becomes live until schema, auth boundary, and persistence/source behavior are known.

## Blocking Decisions

| ID | Route | Decision needed from Sabir | Why it blocks | Recommended default |
| --- | --- | --- | --- | --- |
| CD-001 | `/api/events` | Is `/api/events` an alias of `/api/audit/events`, or a normalized event feed where audit export is only one view? | The existing source truth is PostgreSQL `events`, but the dashboard brief names `/api/events` for sessions, dreams, gate violations, jobs, and audit-like filters. Those may need a broader shape than audit export. | Make `/api/events` a normalized read-only event feed backed by `events`; keep `/api/audit/events` as compliance export. |
| CD-002 | `/api/contracts` | What is the canonical contract source and conflict order: `.opencode/agent/**`, `src/lib/agents/agent-manifest.ts`, adapter registry, OpenClaw allowlist, or another manifest? | `/api/agents` is roster/activity only. A contract route implies permissions, allowed tools, routing policy, model policy, and drift state. | Define a schema ADR first. Use file manifests for identity, adapter registry for read/write policy shape, and never infer missing policy as allowed. |
| CD-003 | `/api/contracts` | Which contract fields are visible to `viewer` versus `curator/admin`? | Tool permissions, model routes, and runtime boundaries may expose sensitive operational details. | Public dashboard read can show identity/team/source/drift summary; detailed tools/policies require `curator` or `admin`. |
| CD-004 | `/api/promotions` | Is `/api/promotions` history-only, or does it own approval/rejection/revocation mutations too? | Existing curator routes already mutate proposal state. Adding mutation here without receipt semantics creates competing write paths. | Start with GET-only promotion history. Keep mutations on `/api/curator/approve` and `/api/curator/reject` until governance receipt schema is approved. |
| CD-005 | `/api/promotions` | Should Notion projection fields be first-class response fields or evidence references only? | Notion sync exists, but Notion is projection/reference, not promotion source truth. | Include `notion_page_id` and `notion_synced_at` as projection metadata only. Source truth stays PostgreSQL. |
| CD-006 | `/api/policies` | What exact read-only policy schema should Policy Center expose? | Policy state is split across env, roles, retrieval policy, isolation health, kernel docs, and policy events. A route that merges these needs a declared schema. | Expose read-only `promotion_mode`, threshold, role matrix, isolation status, kernel rules, and recent policy events with per-field source/freshness. |
| CD-007 | `/api/policies` | Are policy mutations in scope for this endpoint? If yes, what approval and audit receipt is required? | Toggling policy mode, thresholds, roles, or RuVix rules is governance mutation and requires explicit authority. | No mutations in MVP. Any future POST/PATCH must require `admin`, intent, policy refs, validation refs, and audit event id. |
| CD-008 | `/api/memory/lineage` | What is the canonical lineage read model across trace, proposal, approval event, semantic memory, Notion projection, and SUPERSEDES chain? | Existing graph/traces/insights routes each expose partial data. None currently owns full lifecycle lineage. | Define nodes/edges/evidence/missing_links schema before implementation. |
| CD-009 | `/api/memory/lineage` | Who can read raw trace metadata in lineage responses? | Trace metadata may contain prompts, outputs, or operational details. Viewer-level full raw metadata may be too broad. | `viewer` can see summarized lineage; `curator/admin` can request expanded raw evidence. |

## Safe Work After Decisions

| Route | Safe next implementation once approved | Tests to add |
| --- | --- | --- |
| `/api/events` | GET route over `queryAuditEvents()` or a new normalized event query, with `group_id`, filters, pagination, and degraded PG failure shape. | Auth, invalid group, filters, pagination, PG unavailable, no non-GET methods, dashboard adapter no longer degraded only for this route. |
| `/api/contracts` | GET route that reads approved manifest sources, validates schema, reports drift as unknown/blocking where source is missing. | Source precedence fixtures, missing policy warnings, no secret leakage, role visibility, symlink-safe traversal. |
| `/api/promotions` | GET route over `canonical_proposals` with joined approval/promotion events where available. | pending/approved/rejected/failed fixtures, Notion projection degraded, group isolation, auth, no writes. |
| `/api/policies` | GET read-only status route with per-field source labels. | env parsing, role matrix, isolation degraded merge, kernel rules unavailable, no fabricated defaults, no mutation methods. |
| `/api/memory/lineage` | GET read-only route by `memory_id`, `proposal_id`, or `trace_ref`, returning explicit missing links. | lookup modes, Postgres-only fallback, Neo4j degraded fallback, SUPERSEDES chain, redaction/role behavior, tenant isolation. |

## Non-Decision Observations

- The current degraded adapter contract is honest and should stay until source truth is approved.
- `/api/promotions` is the closest to safe implementation because `canonical_proposals` is documented and already routed.
- `/api/contracts`, `/api/policies`, and `/api/memory/lineage` are schema-sensitive and should not be implemented from inference.
- Notion references exist for promotion projections, not as primary truth for these API contracts.
- Allura Brain semantic search was degraded during this audit; use repo docs/code as the current receipt set until graph search is restored.
