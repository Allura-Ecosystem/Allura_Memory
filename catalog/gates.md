# Governance Gates

> Allura's non-negotiable invariants, approval boundaries, and enforcement mechanisms.

## The 6 Non-Negotiable Invariants

These invariants are enforced at the schema level and by the `allura-governance` plugin on every tool call.

| # | Invariant | Enforcement | Violation |
|---|-----------|-------------|-----------|
| 1 | **`group_id` on every DB read/write** | PostgreSQL CHECK constraint `^allura-[a-z0-9-]+$` | Query rejected |
| 2 | **PostgreSQL events are append-only** | No UPDATE/DELETE on `events`/`traces` tables | Operation blocked |
| 3 | **Neo4j versioning via `SUPERSEDES`** | Never edit existing nodes; create new + link old | Direct mutation blocked |
| 4 | **HITL required for promotion** | `memory_promote` requires `curator_approved` flag | Promotion blocked |
| 5 | **DB ops via MCP_DOCKER tools only** | Never `docker exec` for DB operations | Command blocked |
| 6 | **`allura-*` tenant namespace** | Flag any `roninclaw-*` as deprecated drift | Warning + migration required |

## Approval Boundaries (AD-33)

The following actions require explicit Captain or lane-owner approval:

| Action | Required Approval | Receipt Field |
|--------|-------------------|---------------|
| Runtime/database changes | Captain | `approval_required: true` |
| MCP config mutation | Captain | `approval_required: true` |
| Cron mutation | Captain | `approval_required: true` |
| Live hook installation | Lane owner | `approval_required: true` |
| RuVix enforcement changes | Captain | `approval_required: true` |
| Canonical semantic promotion | Curator + Captain | `curator_approved: true` |
| Notion sync | Captain | `approval_required: true` |
| Done/Approved status moves | Lane owner | `approval_required: true` |

## Promotion Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| `soc2` | Score ≥ threshold → curator review queue | Production, audit-conscious teams |
| `auto` | Score ≥ threshold → automatic promotion | Development, experimentation |

> **Note:** `soc2` is an internal workflow label for a stricter review path. It does **not** imply current SOC 2 certification.

## Soft-Delete Policy

- Memories are never hard-deleted
- `memory_delete` sets status to `deleted` with 30-day recovery window
- `memory_restore` recovers within the window
- After 30 days, deleted records remain in PostgreSQL audit trail but are excluded from search

## Multi-Tenant Isolation

- `group_id` is the tenant boundary
- Schema-level CHECK constraint enforces `^allura-[a-z0-9-]+$`
- Every query must include `group_id` — missing it causes constraint failure
- Cross-tenant data leakage risk: **mitigated** (RK-02)

## Audit Trail

Every operation produces an append-only trace:

| What | Where | Retention |
|------|-------|-----------|
| Memory writes | PostgreSQL `events` | Permanent |
| Curator decisions | PostgreSQL `events` + Neo4j `Decision` nodes | Permanent |
| Agent actions | PostgreSQL `events` with `agent_id` | Permanent |
| Schema changes | Migration files + `events` | Permanent |

## Risk Register

Active risks tracked in [`docs/allura/RISKS-AND-DECISIONS.md`](../docs/allura/RISKS-AND-DECISIONS.md):

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| RK-01 | Neo4j graph bloat from duplicate promotions | Medium | Active |
| RK-02 | Cross-tenant data leakage | High | Mitigated |
| RK-03 | Auto-mode promotes low-quality memories | Medium | Active |
| RK-12 | Retrieval layer bypass — agents query DBs directly | High | Active |
| RK-14 | E2E validation gap — pipeline not proven | High | Active |
| RK-19 | Memory Command Center route/source-of-truth drift | High | Active |

## Governance Plugin

Install `allura-governance` to enforce invariants automatically:

```bash
claude plugin install ./plugins/allura-governance
codex plugin install ./plugins/allura-governance
```

See [`catalog/plugins.md`](./plugins.md) for plugin details.

---

*Canonical governance rules live in [`docs/allura/RISKS-AND-DECISIONS.md`](../docs/allura/RISKS-AND-DECISIONS.md). For the full risk register and architectural decisions, see that document.*
