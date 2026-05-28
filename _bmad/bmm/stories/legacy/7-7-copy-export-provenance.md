---
story_id: '7.7'
story_key: 7-7-copy-export-provenance
epic: 'Epic 7 — Memory, Provenance, and Audit'
project: 'Allura Dashboard v2 / Command Center Foundation'
status: ready-for-dev
created: 2026-05-18T03:00:00-04:00
author: Team RAM / Brooks (Architect)
assignee: Team RAM / Woz (Builder)
reviewers:
  - Team RAM / Pike (Interface Review)
  - Team Durham / QA (UX & Brand Review)
retrospective: Team RAM / Watson
source_docs:
  - _bmad/bmm/planning/source-docs/EPICS-dashboard-v2.md
  - docs/allura/BLUEPRINT.md
  - docs/allura/SOLUTION-ARCHITECTURE.md
  - docs/allura/DATA-DICTIONARY.md
  - docs/allura/DESIGN-ALLURA.md
  - docs/allura/RISKS-AND-DECISIONS.md
  - docs/allura/index.md
pipeline_status:
  validation: FAIL
  note: 'Story spec creation authorized by Captain. Implementation blocked until pipeline passes. Pipeline validation report: docs/allura/reviews/team-ram-pipeline-validation-2026-05-12.md'
---

# Story 7.7 — Copy/Export Provenance

## User Story

> As a **governance operator or auditor**,
> I want to **copy or export memories, audit events, and evidence chains in a human-readable format that preserves provenance**,
> so that **I can share, review, or archive governed records outside the dashboard without losing source, actor, timestamp, or chain integrity metadata**.

## Acceptance Criteria

### Primary

**AC1: Export availability.** Given the operator is viewing a memory detail, audit event detail, or evidence chain view, when the export affordance is activated, then the system produces a downloadable artifact that includes all provenance fields present in the source record.

**AC2: Provenance field preservation.** Given an exported artifact, when inspected, then it contains at minimum: `id`, `source`, `creator`/`actor_id`, `approver` (if applicable), `timestamp`, `evidence_ids`, `hash`/`prev_hash` (for audit events), and `confidence`/`status` (for memories).

**AC3: Human-readable format.** Given an exported artifact, when read without tooling, then it is valid Markdown or plain text with labeled sections — not raw JSON or binary — so that operators can paste it into docs, tickets, or email without reformatting.

**AC4: Copy-to-clipboard shortcut.** Given a memory or audit event detail view, when the operator selects "Copy as Markdown," then the clipboard contains a Markdown snippet with provenance fields in a consistent, readable layout.

**AC5: Conditional scope — Copy as Markdown may be v2.1.** Given MVP time constraints, when Epic 7 implementation is scoped, then "Copy as Markdown" may be deferred to v2.1 if and only if:
  - the audit event and memory detail views still display all provenance fields truthfully (Stories 7.2–7.6),
  - a clear UI label explains that "Export is planned for v2.1,"
  - the backend `GET /api/audit/events` export parameter remains available and tested.
  Full export (bulk, filtered, multi-record) is explicitly v2.1 scope.

**AC6: Tenant isolation in exports.** Given a multi-tenant deployment, when an operator exports records, then only `group_id` matching the operator's tenant are included, and the `group_id` is preserved in the export header so downstream readers can verify scope.

### Cross-Cutting

**AC7: Contract fidelity.** Given any export or copy operation, when the source record is an `AuditEvent`, then the output fields align with the frozen `AuditEvent` contract (id, group_id, actor_id, actor_type, resource, action, before, after, evidence_ids, policy_decision_id, approval_decision_id, timestamp, hash, prev_hash) and no field is silently omitted.

**AC8: No mutation path.** Given an export or copy request, when processed, then no audit event, memory record, or evidence link is created, modified, or promoted. The operation is read-only and may be logged at `info` level but does not generate a new append-only audit event (to avoid export loops).

**AC9: Degraded truth.** Given the export backend is unavailable, when the operator requests export, then the UI displays a degraded message — "Export temporarily unavailable" — rather than a fabricated or partial file. If only copy-to-clipboard works, the UI explains the limitation.

**AC10: Evidence before completion.** Given implementation is complete, when schema validation and focused export tests run, then TypeScript is clean and tests prove field completeness, tenant isolation, format validity, and read-only behavior.

## Epic Context

**Epic 7 — Memory, Provenance, and Audit** answers the question: "What does Allura know, and can we prove it?" Story 7.7 is the final story in Epic 7, closing the loop from search (7.1), detail inspection (7.2–7.3), audit browsing (7.4), tamper evidence (7.5), and evidence chain linkage (7.6) by enabling operators to take governed records out of the dashboard for sharing, review, or archival.

This story does NOT invent new provenance fields, new audit routes, or new memory schemas. It consumes the fields and contracts established by Stories 7.1–7.6 and presents them in a portable, human-readable format. If MVP time is constrained, the minimum viable surface is truthful read-only detail views (7.2–7.6) plus a backend-tested export parameter on `/api/audit/events`; the "Copy as Markdown" UI convenience and bulk export UI are v2.1 scope.

## Technical Requirements

### Export Surfaces

1. **Memory Detail Export** — Triggered from the memory provenance detail panel (Story 7.2).
2. **Audit Event Export** — Triggered from the append-only audit browser (Story 7.4).
3. **Evidence Chain Export** — Triggered from the evidence chain view (Story 7.6).

### Export Formats

| Format | Scope | Priority | Notes |
|--------|-------|----------|-------|
| Markdown single-record | Memory / Audit / Evidence | MVP (may be v2.1 if constrained) | Human-readable, copy-paste friendly, preserves all provenance fields as labeled sections. |
| JSON single-record | Memory / Audit / Evidence | MVP backend | Machine-readable, contract-faithful, behind `?format=json` on detail routes. |
| Markdown bulk (filtered) | Audit events | v2.1 | From audit browser filters; paginated multi-record export. |
| CSV bulk (filtered) | Audit events | v2.1 | Tabular for spreadsheet analysis; hash fields truncated with "see full in JSON/Markdown." |

### Data Contracts

#### AuditEvent Export Shape (frozen contract — must match `AuditEvent` interface)

```ts
interface AuditEventExport {
  id: string
  group_id: string
  actor_id: string
  actor_type: 'human' | 'agent' | 'service'
  resource: string
  action: string
  before?: unknown
  after?: unknown
  evidence_ids: string[]
  policy_decision_id?: string
  approval_decision_id?: string
  timestamp: string        // ISO 8601
  hash: string
  prev_hash: string
}
```

#### Memory Provenance Export Shape (derived from Story 7.2)

```ts
interface MemoryProvenanceExport {
  id: string
  group_id: string
  content: string
  source: string           // e.g., "mcp_allura_brain_memory_add", "curator promotion"
  creator_id: string       // actor who created/added
  approver_id?: string     // curator/HITL approver if promotion was governed
  evidence_ids: string[]
  confidence: number       // 0–1
  status: 'active' | 'superseded' | 'conflicted' | 'deprecated'
  created_at: string       // ISO 8601
  updated_at: string       // ISO 8601
  superseded_by?: string   // memory ID
}
```

#### Markdown Template Convention (single-record)

```markdown
# Allura Record Export

**Type:** AuditEvent | Memory | EvidenceChain  
**Tenant (group_id):** `<group_id>`  
**Exported at:** `<ISO timestamp>`  
**Record ID:** `<id>`

## Provenance

- **Actor:** `<actor_id>` (`<actor_type>`)
- **Timestamp:** `<timestamp>`
- **Source / Resource:** `<source or resource>`
- **Action:** `<action>` (audit only)
- **Hash:** `<hash>` (audit only)
- **Previous Hash:** `<prev_hash>` (audit only)
- **Confidence:** `<confidence>` (memory only)
- **Status:** `<status>` (memory only)

## Content

<content or before/after summary>

## Evidence

- <evidence_id_1>
- <evidence_id_2>

## Related

- **Policy Decision:** `<policy_decision_id>` (if applicable)
- **Approval Decision:** `<approval_decision_id>` (if applicable)
- **Superseded By:** `<superseded_by>` (memory only)
```

### State Matrix

| State | Behavior |
|-------|----------|
| Loading | Skeleton on export button; disable click until detail data is fetched. |
| Ready | Export button enabled; copy-to-clipboard icon enabled. |
| Degraded (export backend down) | Button disabled with tooltip: "Export temporarily unavailable." |
| Degraded (copy only) | Export button disabled; copy icon enabled with tooltip: "Copy works; bulk export planned for v2.1." |
| Empty (no provenance fields) | Should not occur if 7.2–7.6 are correct; if it does, show honest empty state: "No provenance metadata available." |
| Permission denied | Hide export/copy controls for records the operator cannot read. |

### Source-of-Truth Declarations

| Data | Source of Truth | Read Path |
|------|-----------------|-----------|
| Audit event fields | PostgreSQL append-only audit table | `GET /api/audit/events/:id` or `GET /api/audit/events` with filters |
| Memory provenance fields | Allura Brain PostgreSQL (episodic) + Neo4j (semantic) | `GET /api/memory/:id` or `GET /api/memory/search` |
| Evidence chain links | PostgreSQL audit + memory cross-references | `GET /api/evidence-chain/:work_item_id` (Story 7.6) |
| Tenant scope | JWT / session `group_id` claim | Enforced on every read route |

## Tasks

1. **Contract / Schema**
   - Define `AuditEventExport` and `MemoryProvenanceExport` Zod schemas.
   - Ensure they are strict supersets of the fields displayed in Stories 7.2–7.6; no field omission.
   - Add `ExportFormat` union: `'markdown' | 'json' | 'csv'` (CSV v2.1).

2. **Backend — Detail Export**
   - Add `?format=markdown|json` to `GET /api/audit/events/:id`.
   - Add `?format=markdown|json` to `GET /api/memory/:id`.
   - Ensure `group_id` filter is applied before serialization; reject cross-tenant reads with 403.
   - Return `Content-Disposition: attachment` for download; return plain text/Markdown for copy.

3. **Backend — Bulk Export Parameter (tested, UI may be v2.1)**
   - `GET /api/audit/events?format=markdown|json&download=true` supports filtered bulk export.
   - Pagination must be cursor-based (not offset) to avoid export inconsistency under write load.
   - If `download=true`, stream response with `Content-Disposition: attachment; filename="audit-export-<timestamp>.md"`.

4. **UI — Copy-to-Clipboard (MVP or v2.1 depending on constraint)**
   - Add "Copy as Markdown" icon button to memory detail, audit event detail, and evidence chain views.
   - Use the Markdown template convention above; copy to clipboard via `navigator.clipboard.writeText()`.
   - Show toast: "Copied to clipboard" on success; "Copy failed — try export instead" on failure.

5. **UI — Export Button (MVP or v2.1 depending on constraint)**
   - Add "Export" button to the same surfaces.
   - On click, trigger download of the Markdown or JSON artifact.
   - If backend export is unavailable, show degraded tooltip (AC9).

6. **Tenant Isolation**
   - Verify every export route respects `group_id` from the operator's session/JWT.
   - Write backend tests proving 403 on cross-tenant export attempts.

7. **Audit / Logging**
   - Export operations are read-only; do NOT write append-only audit events for exports (avoids loops).
   - Log at `info` level: `actor_id`, `group_id`, `record_type`, `record_id`, `format`, `timestamp`.

8. **Tests / Evidence**
   - Schema tests: `AuditEventExport` and `MemoryProvenanceExport` match frozen contracts.
   - API tests: export returns 200 with correct fields; cross-tenant returns 403.
   - Format tests: Markdown output is valid CommonMark; JSON output parses and matches Zod schema.
   - Degraded tests: export backend unavailable returns graceful degradation, not 500 crash.
   - TypeScript gate: `npx tsc --noEmit --skipLibCheck`.

## Dependencies

- Story 7.2 (Provenance detail) provides the fields and UI surfaces for memory export.
- Story 7.4 (Append-only audit browser) provides the list/detail surfaces for audit export.
- Story 7.6 (Evidence chain view) provides the chain linkage for evidence-chain export.
- Contract Freeze Gate must remain intact: `AuditEvent` and `DashboardResult` shapes cannot drift.
- Backend read routes (`/api/audit/events`, `/api/memory/*`) must be implemented and tenant-isolated before export can be built.

## Rollback Notes

- Export/copy features are additive read-only UI capabilities. Rollback may disable export buttons while preserving detail views.
- If Markdown template format is revised, maintain backward compatibility by versioning the template (e.g., `?format=markdown&v=2`).
- Never roll back by allowing cross-tenant export or by omitting provenance fields to "simplify" output.
- If copy-to-clipboard is broken in a browser, revert to download-only rather than bypassing tenant isolation.

## Review Gates

- **Team RAM / Pike:** interface and API response shape review; no contract drift between `AuditEvent` and export schemas.
- **Team RAM / Knuth:** data model review; confirm `group_id` isolation on every export route; no direct Neo4j writes.
- **Team Durham / Kotler:** UX/product review for export discoverability, copy-to-clipboard affordance clarity, and degraded-state messaging.
- **Security/Governance:** tenant isolation tests pass; cross-tenant export attempts are blocked.

## Verification Required Before Done

Minimum evidence for the implementation task downstream:

```bash
cd "/home/ronin704/Projects/allura memory"
npx tsc --noEmit --skipLibCheck
# plus focused schema/API/export tests introduced by implementation
```

For this legacy story-spec task, verification is: file exists at `_bmad/bmm/stories/legacy/7-7-copy-export-provenance.md`, source anchors are present, no product code changed, and the Kanban task records the intervention/evidence.

## Source Anchors

- EPICS-dashboard-v2.md: Epic 7 — Memory, Provenance, and Audit; Story 7.7 acceptance: "Given allowed export, when copied/exported, then provenance is preserved in human-readable format."
- BLUEPRINT.md: FR36–FR42 memory/provenance/audit/export requirements and NFR27 MIT baseline scope are condensed into Dashboard v2 scope.
- SOLUTION-ARCHITECTURE.md: `GET /api/audit/events` remains the bulk audit surface with pagination/filter/export behavior.
- DATA-DICTIONARY.md: `AuditEvent` export shape preserves id, group_id, actor_id, actor_type, resource, action, before, after, evidence_ids, policy_decision_id, approval_decision_id, timestamp, hash, and prev_hash.
- DESIGN-ALLURA.md: Human Memory Recall treats provenance copy/export as a read-only metadata facet, not a mutation path.
- RISKS-AND-DECISIONS.md: Native Allura Kanban and doc-condensation decisions are recorded in AD-31 and AD-32.
