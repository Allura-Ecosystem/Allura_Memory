# Epic 13 — Product Truth and Contract Reconciliation

> [!NOTE]
> **Active original-number plan.** The original 2026-06-12 story identities are preserved from [`EPICS-13-17-GOVERNED-AI-OFFICE.md`](../../../docs/archive/allura/EPICS-13-17-GOVERNED-AI-OFFICE.md). Story 13.5 is a new **PLANNED** requirement authorized for this reconstruction. Planning does not claim implementation, live Allura status, or release.

## Outcome

Make routes, authorization decisions, operational claims, preservation decisions, and planning language match verified behavior without losing source-local work or presenting historical/local labels as live truth.

## Story register

| Story | Original/planned contract | Primary supporting draft | Current boundary |
|---|---|---|---|
| 13.1 | **Route and authorization contract reconciliation** (original) | [DEV-01 — Critical behavior and failure inventory](../../../_bmad-output/implementation-artifacts/stories/DEV-01.md) | Inventory and reconcile real callers, routes, denials, and evidence. Draft acceptance supports the story; it does not replace it. |
| 13.2 | **Live operational state and freshness contracts** (original) | [DEV-07 — Truthful outcome and safe correlation](../../../_bmad-output/implementation-artifacts/stories/DEV-07.md) | Separate capture, index, promotion, projection, and unknown states; telemetry mutation remains gated by AD-68 details. |
| 13.3 | **Approved brand assets and canonical navigation** (original) | Canonical Design/Blueprint | Exact first-story visual acceptance remains blocked by DOC-02; generic tokens do not supply an accepted screen/hash. |
| 13.4 | **Dashboard runtime and tenant propagation proof** (original) | Canonical CF/BE/DOC acceptance rows | Requires current exact-revision route, identity, tenant, degraded-state, and deployed-target evidence. |
| 13.5 | **Preserved-source reconciliation** (**new PLANNED story**) | [DEV-00 — Deployment, migration, and authority baseline](../../../_bmad-output/implementation-artifacts/stories/DEV-00.md) | Classify every preserved path/ref/worktree as integrated, useful pending integration, superseded with proof, or unresolved before cleanup. This is not deployment discovery by assumption or permission to retire anything. |

## Historical details retained

The original exit gate required route/permission tests, no static operational card presented as live truth, tenant/source/freshness/degraded state on operational responses, and live dashboard evidence. Those requirements remain applicable; this rewrite does not say they have passed.

## Current remaining work and acceptance

1. **13.1 contract inventory:** freeze exact revision/diff; map public route → authenticated principal → server-derived tenant/workspace → service/database call → positive/denial/failure test. Acceptance requires nonzero executable cases and no caller that bypasses the reconciled authority seam.
2. **13.2 truth model:** define stable stage outcomes and safe correlation with redaction/cardinality/retention. Acceptance requires partial/unknown/ambiguous outcomes not to appear as success and no new telemetry contract before the applicable AD-68 owner decision.
3. **13.3 visual/navigation decision:** obtain DOC-02 exact accepted reference/revision/assets/states from Sabir + Durham. Acceptance is separate from source implementation and separately requires final rendered evidence.
4. **13.4 runtime proof:** exercise verified Cloudflare Access identity per AD-69 (or explicit DevAuthProvider only in approved development), tenant propagation, denial/revocation, and truthful degraded states on the reviewed/deployed revision.
5. **13.5 preservation reconciliation:** bind the source-local inventory (including the 688 unresolved content paths) to exact hashes and owner dispositions; integrate separately approved useful work before cleanup. Recovery/read-back and exact-target retirement gates apply only to later authorized cleanup, not ordinary code work.

## Dependencies and next actions

- **First:** 13.5 freezes and classifies preserved source; 13.1 inventories consumers against current canon.
- **Then:** resolve owner decisions needed by affected contracts (DOC-02 for exact UI; AD-68 for new telemetry/maintenance).
- **Then:** implement only separately authorized deltas, obtain independent final-diff review, and execute current-revision acceptance.
- **Do not:** infer current Allura status, write Brain, create a local tracker, or turn documentation approval into live-state proof.

## Exit gate

Epic 13 can be presently closed only when the final reviewed revision proves: route/permission behavior; server-derived scope; truthful stage/freshness/degraded claims; approved brand/navigation evidence; deployed dashboard behavior; and a complete disposition of preserved source with unresolved material retained. Historical tests, source presence, planning approval, or a merged neighboring PR do not close this gate.