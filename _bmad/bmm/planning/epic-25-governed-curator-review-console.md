# Epic 25 — Governed Curator Review Console

> [!NOTE]
> **AI-Assisted Documentation**
> This file was scaffolded with AI assistance from the canonical Notion epic page
> (`Epic 25 — Governed Curator Review Console`, updated 2026-08-22) and from verified
> repository state. It has not been fully reviewed.
> When in doubt, defer to the source code, schemas, and the Notion epic page.

**Status:** Planned; decision mutations blocked by Story 24.4 remediation.
**Owner:** Brooks (architecture and trust boundary)
**group_id:** allura-system
**Canonical source:** Notion — [`Epic 25 — Governed Curator Review Console`](https://app.notion.com/p/3c41d9be65b3819b96c6c9d14a3424ea?pvs=204) (page ID `3c41d9be-65b3-819b-96c6-c9d14a3424ea`)
**Repository artifact:** versioned implementation, test, and commit-evidence mirror (created 2026-08-23)

## Goal

An authenticated reviewer sees only tenant/workspace proposals, inspects evidence, and
receives a truthful immutable receipt for any permitted decision.

## Why this epic exists

The HITL promotion gate is Allura's core product claim. Today it is reachable only through
a CLI (`bun run curator:approve`). There is no browser surface a reviewer can use, and — as
of 2026-08-23 — no working sign-in path at all. This epic delivers one console, one
workflow, end to end, honestly.

## Beta scope statement

> Added by Story 25.1 (AC-1). This is the single written definition of the beta console.
> No later story may infer scope from presentation text, a Notion excerpt, or a stale doc.

The beta Curator Review Console is **one reviewer completing one workflow in a browser**:

1. **Sign in** - the reviewer authenticates and obtains a session whose principal, tenant
   (`group_id`, matching `^allura-[a-z0-9-]+$`), workspace, and role are **server-derived**.
   The browser never asserts any of them. (Story 25.2b)
2. **See tenant/workspace-scoped proposals** - a queue listing exactly the pending curator
   proposals that principal is permitted to see, and nothing else. Scope is enforced in
   PostgreSQL before any semantic or vector expansion (AD-58). (Stories 25.2a, 25.3, 25.4, 25.5)
3. **Inspect evidence** - for any queued proposal, the reviewer can open the full supporting
   evidence: linked traces/events, evidence-request lifecycle state, version, source,
   freshness, and degraded state. Read-only. (Stories 25.2a, 25.5)
4. **Record a decision** - approve, reject, or request-evidence. Exactly three verbs, no
   others. Every one requires a nonblank rationale. (Story 25.6)
5. **Receive an immutable receipt** - the server issues a durable, append-only receipt that
   freezes workspace, policy, evidence version, actor, and outcome. The browser never
   synthesises a successful decision state. (Story 25.6)

That is the whole product claim for beta. Anything that is not one of those five steps is
out of scope for Epic 25.

## Explicitly out of scope for beta

> Added by Story 25.1 (AC-2). Each exclusion names the artifact that owns it instead.
> "No owner in the repository" is recorded honestly rather than assigned to an invented one.

| Excluded from Epic 25 | Owned instead by |
|---|---|
| Enterprise SSO and SCIM provisioning; Microsoft Entra tenant/group/app-role claim mapping | AD-61 and `REQUIREMENTS-MATRIX.md` REQ-ID-001 / REQ-COP-001..003, targeted at proposed story 25.4b. **25.4b is proposed only - it has no story file and is not scaffolded.** Story 25.2b states the same exclusion for its own scope. |
| Broad dashboard restoration - the other 21 `/dashboard/*` pages, mission-control, graph, dreams, kanban, work-board, teams, settings | AD-46 (Allura Control Center pivot, Status: Proposed) and `REQUIREMENTS-MATRIX.md` Section 6D (REQ-DASH-001..009). Not an Epic 25 story. `/dashboard/curator` is the sole initial browser route under REQ-CUR-001. |
| Polyglot SDKs, CLI ergonomics, and the ten-minute developer path | Story 24.7 - portfolio work, explicitly **not** beta-critical and gating no Epic 25 story. |
| Agent-framework integrations and reference integration demos | Story 24.9 - portfolio work, explicitly **not** beta-critical and gating no Epic 25 story. |
| Planning loops - autonomous multi-step planning, dream/genesis proposal loops, scheduled planning agents | **No repository backlog item owns this.** AD-51..AD-54 reference an epic file `epic-level-4-pattern-learning.md` that **does not exist in this repository**. Recorded as an unowned exclusion rather than assigned to a fabricated owner. |
| Workflow module registry and pluggable console modules | AD-63 / REQ-MOD-001..003, targeted at proposed story 25.3b (**no story file; proposed only**). |
| 2D/3D Knowledge Map subgraph surface | AD-59 / REQ-MAP-001..003, targeted at proposed stories 25.2, 25.3a (**no story files; proposed only**). |
| Mortgage Approval Gate demonstration | AD-62 / REQ-MTG-001..002, targeted at proposed story 25.5a (**no story file; proposed only**). |
| Connector integrations and the shared assistant read contract | AD-61 / REQ-AST-001..002, targeted at proposed story 25.4a (**no story file; proposed only**). |

## Delivery loop

Hydrate → specify typed contract and state matrix → RED test → minimal implementation →
inspect UI/auth/accessibility → Pike/Fowler/Brooks review → commit-bound evidence → learn.

## Ownership

| Role | Owner |
|---|---|
| Architecture and trust boundary | Brooks |
| Implementation | Troy |
| Scope and acceptance criteria | Jobs |
| Data/transaction integrity | Knuth |
| Interface and accessibility | Pike |
| Maintainability | Fowler |
| Session documentation/tooling orchestration | Gilliam (not architecture or implementation owner) |

## Stories

| Key | Title | Status | Blocked by |
|---|---|---|---|
| 25.1 | Scope/product truth and documentation loop | done | — |
| 25.2a | Workspace scope and evidence lifecycle foundation | merged, dependency-blocked | 24.2, 24.3, 25.1 |
| 25.2b | Authenticated session entry point | ready-for-dev | 24.2, 24.3 |
| 25.3 | Curator read contract and tenant hardening | blocked | 25.1, 25.2a, 25.2b, 24.11 |
| 25.4 | Minimal `/dashboard/curator` shell | blocked | 25.3 |
| 25.5 | Evidence-first read-only proposal queue | blocked | 25.4 |
| 25.6 | Governed decisions and receipts | blocked | 24.4, 25.5 |
| 25.7 | Security, accessibility, and demo gate | blocked | 24.5, 24.6, 24.8, 25.5, 25.6 |

Story 25.2a merged as PR #97 (`9f8e5dac`) with an APPROVE verdict from independent
Pike/Fowler/Knuth review, and is deliberately **not** marked Done pending 25.1 and the
declared Epic 24 authority prerequisites. That distinction is intentional and must be
preserved.

Story 25.2b is inserted by the same convention as 25.2a: a foundation required before any
UI work. It did not appear in the original seven-story list because the missing sign-in
path was not yet identified.

## Documentation loop

> Story 25.1 reconciliation, verified 2026-08-23 against the updated Notion page.

**Established decision.** Notion is canonical for Epic 25 scope, acceptance criteria, and
decisions. The repository is the versioned implementation, test, and commit-evidence mirror.
The authoritative page is [`Epic 25 — Governed Curator Review Console`](https://app.notion.com/p/3c41d9be65b3819b96c6c9d14a3424ea?pvs=204)
(page ID `3c41d9be-65b3-819b-96c6-c9d14a3424ea`). This is a split of authority by concern,
not competing canonical sources for the same claim.

| Concern | Authority | Repository responsibility |
|---|---|---|
| Epic scope, acceptance criteria, stakeholder narrative, decisions | Notion Epic 25 page | Mirror the accepted scope/decision into versioned planning and story evidence; do not override Notion. |
| Implementation, tests, reviews, commits, and reproducible gate output | Repository | Preserve the versioned evidence and link it back to the Notion scope/acceptance/decision it implements. |
| Story membership, status, `Depends on`, `Blocks` | Notion scope/acceptance decision, mirrored in repository | Keep the three repository evidence artifacts aligned; `bun run epic25:drift` verifies the mirror, not a competing authority. |

**Reconciler and trigger.**

| Trigger | Who reconciles | Action |
|---|---|---|
| Notion scope, acceptance, decision, or story-map change | Brooks + Jobs | Update the repository mirror in the same review cycle; run `bun run epic25:drift` and the documentation-loop contract test. |
| Repository implementation/test/commit evidence changes | Implementer | Update the repository evidence in the same commit and preserve the Notion page link; `bun run epic25:drift` must exit 0. |
| Epic closure | Independent reviewer (CA-24-12) | Confirm the repository evidence mirrors the Notion scope/acceptance/decision source before any Done claim. |

**Current verification.** `bun run epic25:drift` exits 0: `PASS - no drift. All three
sources agree on status, Depends-on, and Blocks.` The historical red handoff remains
attributed in the Story 25.1 Brooks Gate Addendum; it is not rewritten as a builder result.

## Guardrails

- PostgreSQL-only active architecture; Neo4j is sunset under AD-50.
- No broad dashboard restoration and no clickable 404 routes.
- The browser never derives tenant scope, role permission, or successful decision state.
- Every mutating decision needs a nonblank rationale and a server-issued receipt.
- CLI/MCP/API operation remains the rollback path.

## AD-58 — Relational Facts Before Semantic Expansion

Allura resolves server-derived tenant/workspace scope, memberships/roles, explicit IDs,
proposal/evidence/receipt state, actor, and time filters through PostgreSQL **before**
semantic/vector expansion. Semantic retrieval may widen or rank only the authorized
candidate set; it cannot bypass a relational boundary or substitute for a factual lookup.

### AD-58 implementation addition — SemanticProjection

For a relational entity family, Allura must assemble a deterministic, redaction-aware
Markdown `SemanticProjection` from the meaningful header/detail relationship before
embedding. A memory proposal projection includes scope, proposal header, linked
trace/event evidence, evidence-request state, and decision/receipt state when present. It
records source references, projection version, content hash, redaction policy, embedding
model, and generation time. Relational records remain authoritative; the embedding is
rebuildable derived retrieval data.

## Cross-epic prerequisites

| Prerequisite | Epic 24 status (2026-08-23) | Gates |
|---|---|---|
| 24.4 atomic promotion | changes-requested; live lane 58/58 green, pending independent review + merge | 25.6 |
| 24.5 deterministic scenario harness | changes-requested | 25.7 |
| 24.6 evaluation regression gates | changes-requested | 25.7 |
| 24.8 enterprise documentation truth | changes-requested | 25.7 |
| 24.11 web-plane authority | new, ready-for-dev | 25.3 |

Stories 24.7 (SDK/CLI) and 24.9 (reference integrations) are portfolio work and are **not**
beta-critical. They do not gate any Epic 25 story.

## Exit gate

- All eight stories Done under the BMAD Done contract with commit-bound evidence.
- A reviewer can sign in, see only their tenant/workspace proposals, inspect evidence, and
  record a decision that produces an immutable receipt.
- No route in the shipped navigation returns 404.
- Independent reviewer sign-off before epic closure (CA-24-12).

## References

- Notion canonical scope/acceptance/decision source: [`Epic 25 — Governed Curator Review Console`](https://app.notion.com/p/3c41d9be65b3819b96c6c9d14a3424ea?pvs=204) (page ID `3c41d9be-65b3-819b-96c6-c9d14a3424ea`).
- The former documentation-loop reference was removed from both Notion and this repository.
  No seventh canonical `docs/allura/` artifact is created; the closed six-document rule in
  `guidelines/AI-GUIDELINES.md` remains intact. This planning document's Delivery loop and
  Documentation loop sections are repository evidence, not a replacement canonical source.
- `docs/archive/allura/NEO4J-SUNSET-INTEGRITY-GATE.md`
- `docs/retrospectives/epic-24-retrospective-2026-08-22.md`
- `docs/reviews/epic-24-post-merge-adversarial-review-2026-08-22.md`
