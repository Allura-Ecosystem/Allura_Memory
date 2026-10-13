---
title: 'Story 31.4: Independent Review, Evidence, and Human Acceptance'
type: 'feature'
created: '2026-10-12'
status: 'done'
review_loop_iteration: 2
baseline_commit: '2522907eae9fb342a84148fa4ac83816af57ed6f'
context:
  - '{project-root}/_bmad_output/implementation-artifacts/epic-31-context.md'
  - '{project-root}/_bmad_output/planning-artifacts/sprint-change-proposal-2026-10-12-dashboard-graph.md'
  - '{project-root}/_bmad_output/implementation-artifacts/spec-31-3-interactive-knowledge-map-and-inspector.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 31.1–31.3 now implement the governed Knowledge Map, but Epic 31 still lacks a durable requirement-level evidence packet, separate specialist verdicts, a recorded owner walkthrough, and a post-walkthrough release decision. Passing tests, screenshots, or tracker state alone cannot establish acceptance.

**Approach:** Freeze one local candidate, build and validate a durable GRAPH-01..GRAPH-36 ledger, repair all blocking independent-review findings, then present the working local dashboard and completed packet to the owner for separate walkthrough and release decisions.

## Boundaries & Constraints

**Always:** Bind evidence and every review to an exact commit and tree; give each GRAPH row an implementation reference, validation method, durable artifact, limitations, and explicit verdict; keep Pike, Fowler, and Hightower reviews independent; preserve tenant/workspace authority and non-leakage; record walkthrough completion separately from release approval; re-freeze and re-review after any repair.

**Ask First:** Any requirement waiver, accepted critical/high finding, change to GRAPH-01..36 semantics, production deployment, push/merge, or final release-progression decision. The owner must personally decide GRAPH-32 and GRAPH-36 after seeing the working dashboard and packet.

**Never:** Infer human acceptance from prior blanket approval, tests, HTTP success, screenshots, reviewer approval, or walkthrough attendance; mark a row PASS from source inspection alone; let one reviewer substitute for another; fabricate browser, database, accessibility, or human evidence; deploy, merge, or push.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Technical candidate | Clean exact revision; all governed gates executable | Durable hashed receipts and row-level evidence for automatable requirements | Any failed/missing proof leaves affected rows FAIL or NOT VERIFIED |
| Independent review | Same frozen candidate supplied separately to Pike, Fowler, Hightower | Three dated, attributed verdicts with findings and dispositions | Repair blockers, freeze a new candidate, and repeat every affected review |
| Owner walkthrough | Local dashboard and packet ready; representative states available | Owner personally exercises exploration, navigation, inspection, controls, and states; dated GRAPH-32 receipt | Do not infer success; record incomplete/rejected checks honestly |
| Release decision | Ledger complete and walkthrough recorded | Separate explicit approve/reject record for GRAPH-36 | Rejection keeps Epic 31 open and records required revisions |

</frozen-after-approval>

## Review loop 2 — compact knowledge-brain candidate

Owner clarification on 2026-10-13 superseded the prototype's full-card node anatomy: the default canvas is a compact connected knowledge brain, and selecting a node opens the full governed record card in the inspector. The repaired implementation is frozen as commit `3fb8a4ec3ec9068ce910a1f6990b58a80241e582`, tree `11f42d59800c985a101a8a857a6e40c440ca4f10`.

Automated validation, browser evidence, Glaser visual direction, Munari brand QA, Pike interface review, and Hightower production review pass. On 2026-10-13 EDT, after the remaining GRAPH-32 and GRAPH-36 gates were stated explicitly, the owner responded `APPROVE`. The owner receipt and separate release-progression decision record bind that approval to the frozen candidate.

## Code Map

- `_bmad_output/planning-artifacts/sprint-change-proposal-2026-10-12-dashboard-graph.md:294` -- canonical GRAPH-01..36 ledger, evidence standards, and human-gate order.
- `_bmad_output/implementation-artifacts/spec-31-{1,2,3}-*.md` -- completed architecture, data/API, and UI implementation/evidence maps.
- `src/lib/subgraph/{contract,continuation,read-repository,read-service}.ts` -- contract, paging, projection, and failure semantics under review.
- `src/app/api/memory/graph/route.ts:39`, `src/lib/auth/tenant-transaction.ts:103` -- server authority, restricted-role, and RLS boundaries.
- `src/components/dashboard/knowledge-map/knowledge-map-workspace.tsx:116` -- complete state, interaction, accessibility, and inspector surface.
- `src/__tests__/focused-subgraph-live-db.e2e.test.ts:208`, `tests/playwright/knowledge-map.spec.ts:34` -- live security/data and real-browser evidence sources.
- `scripts/epic31/run-knowledge-map-browser.sh:14`, `scripts/epic31/verify-knowledge-map.cjs:25` -- disposable runtime, screenshots, hashes, and receipt producer.
- `docs/archive/allura/evidence/epic-31/31.4/` -- reserved durable ledger, receipts, captures, reviews, walkthrough, and decision records.
- `docs/archive/allura/evidence/epic-25/25.3b/EVIDENCE-INDEX.md:5` -- candidate/tree binding and truthfulness precedent.
- `_bmad_output/implementation-artifacts/25-2a-code-review.md:3` -- independent verdict, repair, and re-review precedent.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/epic31/`, `tests/playwright/knowledge-map.spec.ts`, focused/live tests -- close missing executable state, navigation, actual-zoom/manual, and evidence correlations without weakening governed seams.
- [x] `docs/archive/allura/evidence/epic-31/31.4/GRAPH-ACCEPTANCE-LEDGER.md`, `release-manifest-31.4.json` -- freeze candidate identity and map GRAPH-01..36 to durable proof, limitations, and verdicts.
- [x] `docs/archive/allura/evidence/epic-31/31.4/{pike,fowler,hightower}-review.md` -- record three separate dated reviews; repair blockers and re-review the new candidate.
- [x] `docs/archive/allura/evidence/epic-31/31.4/owner-walkthrough.md` -- preserve the earlier rejection and record the owner's explicit GRAPH-32 approval of the repaired candidate without fabricating unobserved manual steps.
- [x] `docs/archive/allura/evidence/epic-31/31.4/owner-release-decision.md` -- record the owner's explicit GRAPH-36 release-progression approval and accepted residual limitation.
- [x] `_bmad_output/implementation-artifacts/sprint-status.yaml` and Epic 31 specs -- reconcile truthful review/done state only after their gates pass.

**Acceptance Criteria:**
- Given the frozen candidate, when the ledger is audited, then all GRAPH-01..36 rows contain exact references, required proof, limitations, and honest verdicts with no critical missing or failed row.
- Given independent reviews, when findings are dispositioned, then Pike, Fowler, and Hightower each sign the same final candidate with no unresolved blocker.
- Given the ready local dashboard and packet, when the owner completes the guided exercise, then GRAPH-32 has a dated receipt distinct from approval.
- Given that completed walkthrough, when the owner decides release progression, then GRAPH-36 records an explicit approve or reject; only approve permits Epic closure.

## Spec Change Log

- 2026-10-13 — Owner rejected candidate `1bed5b08cf755f837c747e640f4b3570eb9d95cc` for failing the initial mockup and brand. GRAPH-29 is `FAIL / REQUEST CHANGES`, GRAPH-30 is `REQUEST CHANGES`, GRAPH-32 is `REJECTED`, and prior Glaser/Munari passes are superseded. A new immutable candidate and all affected evidence/reviews are required.
- 2026-10-13 — Compact knowledge-brain candidate `3fb8a4ec3ec9068ce910a1f6990b58a80241e582` passed automated and independent review. The owner responded `APPROVE` after GRAPH-32 and GRAPH-36 were identified as the only remaining gates. Epic 31 acceptance is complete; no merge, push, or deployment was performed.

## Design Notes

The ledger is the source of acceptance truth; the machine-readable manifest is its reproducibility index. Evidence may support multiple rows, but each row must explain why that artifact proves its own requirement. Human-only rows remain NOT VERIFIED until the corresponding event occurs.

## Verification

**Commands:**
- `bun run typecheck && bun run lint:ci && bun run validate:tokens && bun run test:unit && bun run build` -- static, full regression, and production gates pass.
- `bun run ci:live-db` -- disposable migration, restricted-role, RLS, data, continuation, and failure evidence passes.
- `bun run test:graph:browser` -- real data/DOM identity, interaction, accessibility, responsive, hashed capture, and cleanup gates pass.
- `bun run validate:story-status && git diff --check` -- tracker claims resolve to real artifacts and the tree is cleanly reviewable.
- `git rev-parse HEAD && git rev-parse HEAD^{tree}` -- candidate commit/tree match the ledger, manifest, and all three reviews.

**Manual checks:**
- Owner validates actual browser 200% zoom, keyboard/screen-reader flow, representative states, and release decision in the working local dashboard.
