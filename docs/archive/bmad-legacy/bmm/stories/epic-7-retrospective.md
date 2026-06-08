# Epic 7 Retrospective: Curator HITL Decision Workflow and Receipts

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content should be reconciled with the Notion Work Board when authorized Notion tooling is available.
> When in doubt, defer to source code, validation output, canonical docs in `docs/allura/`, Notion Work Board state, and team consensus.

## Status

Done

## Retrospective Scope

- Epic: Local BMAD Epic 7 curator workflow stories.
- Stories reviewed:
  - `7-1-build-curator-proposal-queue.md` — Done.
  - `7-2-implement-approve-reject-with-confirmation.md` — Done.
  - `7-3-add-request-evidence-and-changes-flow.md` — Done.
  - `7-4-surface-curator-decision-receipts.md` — Done.
- Canonical board caveat: Notion Work Board is the source of truth, but authorized Notion tooling was unavailable in this runtime. Local story files were reconciled as supporting evidence only.

## Part 1: Epic Review

### What was delivered

- A governed `/dashboard/curator` proposal queue with scoped proposal evidence.
- Human-gated approve/reject/request-evidence/request-changes flows with required rationale.
- Pending-preserving request-evidence behavior without inventing unsupported schema states.
- Inspectable curator decision receipts showing actor, timestamp, rationale, prior status, new status, trace reference, and promoted memory reference when applicable.
- Append-only event-backed receipt mapping through `/api/curator/proposals` for approved, rejected, and pending evidence-requested proposals.
- Degraded/blocker UI for missing receipts rather than hiding audit gaps.

### Validation evidence

- Story 7-4 final targeted suite:
  - `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/__tests__/curator-reject-route.test.ts src/__tests__/curator-dashboard-actions.test.ts src/__tests__/curator-proposals-route.test.ts`
  - Result: `48 pass`, `0 fail`, `203 expect() calls`.
- `bun run typecheck` passed with `tsc --noEmit` and no TypeScript errors.
- Targeted eslint for Story 7-4 files produced no output.
- Pike approved Story 7-4 after pending evidence receipt visibility was fixed.
- Fowler approved Story 7-4 after pending route coverage and selected receipt snapshot fallback were added.

### What went well

- TDD caught missing receipt surfaces before implementation and later caught the pending `request_evidence` gap.
- Pike/Fowler review found a real contract hole: pending evidence-request receipts were suppressed by a status-based condition.
- The final design preserved the HITL invariant: no autonomous promotion, no direct Neo4j write path, and no schema-state invention.
- The route-level receipt mapping made the API a stronger source of truth for reload/filter scenarios instead of relying only on client snapshots.

### What did not go well

- Local BMAD story status drifted badly: Stories 7-1/7-2/7-3 still said `backlog` after prior completion evidence.
- Planning artifacts use conflicting epic numbering: local Story 7.x work maps to curator workflow scope also labeled Epic 4 in `_bmad/bmm/planning/epics.md`, while a source doc labels Epic 7 as broader memory/provenance/audit work.
- Dashboard tests remain partly source-string based because the current no-jsdom lane limits behavior-level UI coverage.
- The BMad resolver script referenced by the skill was unavailable, forcing fallback execution from project config and story files.

## Part 2: Next Epic Preparation

### Carry forward

- Keep route-level tests for audit evidence contracts whenever UI claims inspectability.
- Treat pending-preserving state transitions as first-class cases; do not assume all decisions change proposal status.
- Continue using Pike/Fowler gates before marking stories Done.

### Action items

1. **Reconcile Notion Work Board status for Epic 7**
   - Owner: Brooks/Scout with authorized Notion tooling.
   - Success check: Notion Work Board shows all four Epic 7 curator stories Done or documents any discrepancy.

2. **Resolve BMAD epic numbering drift**
   - Owner: Brooks.
   - Success check: `_bmad/bmm/planning/epics.md`, local Story 7.x files, and source docs use one explicit mapping or state the alias relationship.

3. **Add DOM-level curator receipt tests when UI test harness supports it**
   - Owner: Woz/Pike.
   - Success check: receipt panel behavior is verified by rendered UI tests, not only source-string checks.

4. **Restore or replace the missing BMad workflow resolver**
   - Owner: Hightower/Woz.
   - Success check: BMad skills can resolve workflow customization without fallback mode.

## Risk and Decision Updates

- Added `RK-29` to `docs/allura/RISKS-AND-DECISIONS.md`: BMAD/Notion/story status drift causes false Done or false backlog.

## Reflection

- Principle applied: Plan to Throw One Away — the first receipt design missed pending evidence receipts; review forced the correct contract.
- Conceptual integrity check: Curator receipts are now API-backed evidence, not a decorative UI claim.
- Remaining caveat: Notion board reconciliation is still pending due unavailable authorized tooling.
