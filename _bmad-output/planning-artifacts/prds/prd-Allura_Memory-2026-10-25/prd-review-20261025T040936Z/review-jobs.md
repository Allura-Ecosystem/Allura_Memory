# Team RAM Jobs — PRD intent-gate review

**Role:** Team RAM Jobs guidance loaded through `allura_team(team=ram, role=jobs, task="bounded PRD intent review")`. This is a separate intent review, not PRD authorship or product approval.  
**Reviewed revision:** `fcf4a33f025f69a5bc3fd120e974dd079dc65c52` with the existing dirty working tree identified by the review scope.  
**Objective:** Keep the approved Allura promise intact, separate the smallest credible product from optional surfaces, and send Sabir only choices that materially change user experience, scope, risk, cost, or acceptance.

## Verdict

**REVISE BEFORE OWNER SIGN-OFF.** The PRD substantially preserves the approved memory-engine intent, audience, governance invariants, and DOC-01/DOC-06/DOC-07 decisions. The gate is narrower: its open-question section labels engineering design work, evidence gathering, deferred budget-setting, and contingent approvals as if they were all immediate owner product choices. It also needs a crisper MVP/non-goal boundary. These are targeted PRD corrections, not a reason to reopen approved routing or core product intent.

## Approved intent that must remain closed

- **Documentation authority (DOC-01):** GitHub owns the six versioned engineering specifications; Notion holds private planning/drafts/approval records and links to the governing revision. This is approved, not an open routing question (`docs/allura/RISKS-AND-DECISIONS.md:19-23`; `docs/allura/DESIGN-ALLURA.md:19-21`).
- **Stale-review behavior (DOC-06):** a new approval must fail when the proposal changed after human review; fresh human review is required, while successful replay returns the original receipt (`docs/allura/RISKS-AND-DECISIONS.md:27`; `docs/allura/DESIGN-ALLURA.md:1115-1119`).
- **Confirmed remote delivery (DOC-07):** `synced` requires destination read-back, the decision receipt remains immutable, and delivery state is separate (`docs/allura/RISKS-AND-DECISIONS.md:28`; `docs/allura/DESIGN-ALLURA.md:1117-1121`).
- **Primary audience:** developers and teams using connected agents are primary; operators and independent human reviewers support them; the enterprise dashboard is optional. The historical Maya/community persona is not the current primary audience (`docs/allura/BLUEPRINT.md:63-65`; `docs/allura/BLUEPRINT.md:954-960`).
- **Core boundary:** Allura is an MCP/API-first governed memory engine. Agent orchestration and domain decisions are outside the engine; the Memory Command Center is optional (`docs/allura/BLUEPRINT.md:163-200`; `_bmad-output/planning-artifacts/prd.md:24-36`).
- **Operational routing:** Allura owns work status, Notion holds planning documents, and Allura Brain provides governed continuity. That approved authority split does **not** select the DOC-09 board/synchronization implementation (`guidelines/ALLURA-BMAD.md:44-48`; `.agents/TEAM-RAM-RUNTIME.md:150-155`; `_bmad-output/planning-artifacts/prd.md:14-16,133-136`).

## Findings

### High — The PRD collapses unlike gaps into one “Owner decisions” list

**Evidence.** The PRD labels `AD-65–68, DOC-02/03/05/08/09, ENT-01–05 and metric budgets` as owner decisions (`_bmad-output/planning-artifacts/prd.md:133-139`). The canonical records distinguish them:

- DOC-08 is an evidence lookup first and reaches Sabir only if no approval exists; DOC-04 is verification, not product intent (`docs/allura/RISKS-AND-DECISIONS.md:29-31`).
- AD-66 assigns technical authority propagation, migration inventory, role/RLS proof, and worker review to Brooks/Knuth/Pike/Hightower; Sabir approves a later security/schema/production change before execution, but is not asked to invent the internal contract (`docs/allura/RISKS-AND-DECISIONS.md:578-586`).
- AD-68 already contains a bounded Hightower/Fowler tooling selection. Its broader policy remains proposed; product budgets are intentionally set only after a baseline (`docs/allura/RISKS-AND-DECISIONS.md:598-607`).
- ENT-02–ENT-05 are acceptance-evidence gaps owned by RAM, an authorized operator, or Durham. Only ENT-01 contains a later product-behavior acceptance after Brooks defines the compatible role contract (`docs/allura/RISKS-AND-DECISIONS.md:540-550`).

**Impact.** Sabir would be asked to re-decide technical details, approve evidence that has not been produced, or decide budgets before a baseline. That obscures the few choices that genuinely change the product promise.

**Recommended disposition.** **Must revise before sign-off.** Replace the single list with four states:

1. **Approved/fixed:** DOC-01, DOC-06, DOC-07, routing, core invariants.
2. **Owner product choices:** DOC-09; DOC-02 if its UI story is in the chosen release; AD-65 user-visible retry/compatibility behavior; AD-67 correction/conflict UX; later acceptance of DOC-03, DOC-05, and ENT-01 after engineering presents bounded options.
3. **Engineering/evidence work:** DOC-04, DOC-08 lookup, AD-66, ENT-02–ENT-05, and the technical portions of AD-65/67/68.
4. **Deferred decisions after evidence:** retrieval/latency budgets after an accepted baseline; upgrades/deprecations and any changed retention/destination policy when a concrete proposal exists.

### Medium — “Now” is not a clean MVP boundary

**Evidence.** The PRD’s “Now” bundle includes the core five-tool path, approval, retrieval, SDK/CLI points, and optional operator views, while “Next” says dashboard acceptance still waits on DOC-02/DOC-09 and enterprise role contracts (`_bmad-output/planning-artifacts/prd.md:115-127`). Canonical intent says the engine is usable without a browser and the dashboard is optional (`docs/allura/BLUEPRINT.md:198-200`; `docs/allura/DESIGN-ALLURA.md:55-74`).

**Impact.** A reader cannot tell whether optional dashboard acceptance, Notion projection, or board behavior is required before the first useful release. This weakens sequencing and allows optional polish to block the core outcome.

**Recommended disposition.** **Must revise before sign-off.** Define the MVP as the authenticated, scope-safe journey: capture evidence → create proposal → independent human decision → immutable receipt/version → authorized current retrieval with provenance/audit. Keep the browser dashboard optional; keep remote Notion projection separately releasable under fixed DOC-07 acceptance; keep native board/sync, governed runs, AI Office, and desktop shell outside the MVP. If a first UI story is included, name it explicitly and then resolve DOC-02 for that story only.

### Medium — The PRD needs an explicit non-goals block rather than scattered exclusions

**Evidence.** The vision and later-scope text contain exclusions, but the PRD has no dedicated non-goals section (`_bmad-output/planning-artifacts/prd.md:24-26,95-100,125-127`). The canonical Blueprint explicitly excludes ungated database editing, fabricated live metrics, decorative unsupported charts, bulk approval without rationale, generated logo marks, and dashboard actions that bypass governance (`docs/allura/BLUEPRINT.md:233-241`). It also keeps orchestration and domain decisions outside the memory-engine responsibility (`docs/allura/BLUEPRINT.md:30-32`).

**Impact.** Optional surfaces can be mistaken for core authority, and deferred platform work can creep into MVP acceptance.

**Recommended disposition.** **Required drafting correction; no owner question.** Add a concise non-goals section preserving: no autonomous promotion; no direct substrate mutation; no orchestration/domain-decision ownership; no fabricated health/quality/compliance claims; no dashboard bypass of MCP/API governance; no native board/sync commitment until DOC-09; no governed-runs/AI-Office/desktop-shell commitment in this implementation pack.

### Medium — FR-D2 blurs approved DOC-07 intent with remaining AD-68 implementation selection

**Evidence.** FR-D2 correctly states the approved `synced`/immutable-receipt rule but then says “Implementation details/remote authority unresolved” (`_bmad-output/planning-artifacts/prd.md:80-86`). Canonical design is more precise: DOC-07 is already approved; the transport/read route, exact retry policy, durable bridge, and destination-transfer authorization remain implementation work under AD-68 (`docs/allura/DESIGN-ALLURA.md:1115-1121`).

**Impact.** Reviewers could reopen whether remote read-back is required or treat DOC-07 as unapproved.

**Recommended disposition.** **Must clarify, not re-decide.** Replace the vague qualifier with: “DOC-07 behavior is fixed; AD-68 must select and verify the durable handoff, current-observation read route, bounded retry/reconciliation policy, and destination transfer authority.”

### Medium — The buyer/persona marker reopens an audience question that is not needed for this PRD

**Evidence.** The PRD marks “Buyer/commercial owner” as `[OWNER DECISION]` even though the accepted current audience is already developers/teams, with operators/reviewers supporting and enterprise UI optional (`_bmad-output/planning-artifacts/prd.md:28-36`; `docs/allura/BLUEPRINT.md:63-65,954-960`). No canonical buyer definition exists, but absence is not itself a blocker to the bounded memory product.

**Impact.** Sign-off can be diverted into a whole-market/commercial-persona exercise that does not change the current user journey or acceptance criteria.

**Recommended disposition.** **Remove from current owner decisions.** Label a buyer/commercial persona as deferred market strategy unless a pricing, procurement, or go-to-market milestone is separately scoped.

## DOC-01 through DOC-09 disposition

| Decision | Intent-gate classification | Recommended PRD treatment |
|---|---|---|
| DOC-01 | **Approved** | Preserve GitHub/Notion authority split; do not reopen. |
| DOC-02 | **Genuine owner + Durham choice, bounded to a UI story** | Decide exact reference/revision/assets only if that story enters the selected MVP/release. |
| DOC-03 | **Engineering contract first; contingent owner acceptance** | Immutable/auditable history is fixed. Brooks/data owner must present lineage-preserving restore behavior; Sabir then accepts the user-visible restore semantics. |
| DOC-04 | **Verification task** | Do not ask for product intent; gather reviewed-revision/deployed evidence. |
| DOC-05 | **Engineering options first; contingent product choice** | Brooks/data owner frame merge/link/reject/new-version effects; Sabir selects intended user behavior without inventing storage mechanics. |
| DOC-06 | **Approved** | Implement and verify exact reviewed-version rejection plus replay-first behavior. |
| DOC-07 | **Approved** | Implement and verify confirmed destination read-back and separate delivery observations. |
| DOC-08 | **Evidence task, then conditional owner decision** | Brooks locates the curator-first approval; ask Sabir only if no valid decision exists. |
| DOC-09 | **Genuine owner product choice** | Select the board/sync implementation and conflict behavior while preserving Allura as work-status authority, Notion as planning-document lane, and Brain as continuity. |

Sources: `docs/allura/RISKS-AND-DECISIONS.md:17-31`; `docs/allura/DESIGN-ALLURA.md:684-702`; `docs/allura/BLUEPRINT.md:896-933`.

## AD-65 through AD-68 disposition

| Decision | Genuine product choice | Engineering drafting/review that should not be pushed to Sabir |
|---|---|---|
| AD-65 | Accept user-visible lost-acknowledgement, same-key retry/conflict, and legacy-client compatibility behavior; approve any retention/product-policy tradeoff. | Key syntax, canonical digest/metadata allowlist, uniqueness/atomicity, response-version mechanics, worker leases/retries, and proof. |
| AD-66 | No new product promise: existing fail-closed workspace isolation is fixed. Later approval is required before a concrete security/schema/production change executes. | Opaque authority signatures, migration inventory, restricted role/RLS proof, legacy-row quarantine, index validation, and worker policy. |
| AD-67 | Accept correction/conflict UX: pending human review, stale-head conflict, no automatic rebase, explicit renewed review. | DTO/public mapping, base/head fields, single-head concurrency, transactionality, and lineage proof. DOC-03/05 remain separate. |
| AD-68 | Set product acceptance budgets only after baseline; approve concrete upgrades/deprecations or changed retention/destination policy when proposed. | CI/tooling lane selection (bounded selection already recorded), test discovery, telemetry/redaction naming, delivery route/digest normalization, baseline production, and exact-head evidence. |

Sources: `docs/allura/RISKS-AND-DECISIONS.md:562-607`; `docs/allura/DESIGN-ALLURA.md:1036-1130`.

## Concise decision-only list

### Ready to put to Sabir

1. **DOC-09 — implementation surface:** Under the already approved routing, should Allura-owned work status have a native Allura board now, or remain without a native board while approved projections/adapters are defined? For either choice, approve sync direction and conflict behavior; Allura remains status authority.
2. **DOC-02 — only if UI is in the selected release:** Name the exact approved screen/reference revision and assets for the first capture/review/retrieval UI story. Otherwise explicitly defer DOC-02 with the optional dashboard.
3. **AD-65 product behavior:** Accept that lost acknowledgement is `unknown`, same-key reconciliation/retry must not duplicate evidence, changed payload conflicts, and legacy clients need an explicit compatibility window before key enforcement.
4. **AD-67 product behavior:** Accept that correction conflicts never auto-rebase or auto-approve; the user receives a conflict and a fresh human review is required.

### Do not put to Sabir until the prerequisite packet exists

5. **DOC-03:** a lineage-preserving restore/rollback UX recommendation from Brooks/data owner.
6. **DOC-05:** a bounded recommendation for distinct-proposal duplicates, with user-visible effects of merge/link/reject/new-version.
7. **ENT-01:** a compatible per-workspace role/confidentiality contract from Brooks.
8. **AD-68 budgets:** a measured baseline and proposed acceptance thresholds; concrete upgrade/deprecation or retention/destination changes if any.
9. **DOC-08:** only if the approval search fails and the curator-first product direction still needs an owner choice.

Not owner choices: DOC-04 verification, AD-66 technical contract/evidence, ENT-02–ENT-05 acceptance evidence, hosted CI/exact-head proof, or defining a buyer persona for this bounded PRD.

## Residual limitations

- This was a documentation intent review. No product tests, live acceptance, Notion write, Allura status transition, Brain write, implementation change, commit, or deployment was performed.
- The workspace was already broadly dirty. This review intentionally wrote only this report.
