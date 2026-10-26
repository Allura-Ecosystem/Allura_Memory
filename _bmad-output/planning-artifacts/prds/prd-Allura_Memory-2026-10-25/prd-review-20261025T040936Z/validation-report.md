# Validation Report — Allura Memory Brownfield Product Contract

- **PRD:** `_bmad-output/planning-artifacts/prd.md`
- **Rubric:** `.agents/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-10-25T04:17:26Z
- **Grade:** Fair
- **Disposition:** REVISE BEFORE OWNER ACCEPTANCE
- **Basis:** `dev/allura-beta`, HEAD `fcf4a33f025f69a5bc3fd120e974dd079dc65c52`, plus the exact working-tree bytes in `source-sha256.txt`.

## Overall verdict

This is a disciplined, substantive brownfield companion/index: it states its authority limits, preserves the governed memory thesis, separates claim states, and is unusually honest about unresolved decisions and unverified source presence. It is not yet a decision-complete or downstream-self-sufficient PRD, chiefly because owner decisions are listed as bare IDs and the local FRs do not map one-to-one to canonical acceptance evidence; those gaps are material even though the document correctly refuses to claim implementation readiness.

Jobs and Brooks materially sharpen that judgment: the draft's claim ladder and broad source-present assertions need correction, canonical decision/readiness labels must remain distinct, and engineering/evidence work must not all become questions for Sabir. Live Notion planning corroborates the approved core intent and DOC-01/06/07; historical sections and navigation lag do not supersede newer canonical decisions.

Review authorization is not approval of the PRD, new product choices, implementation, publishing, or deployment. The original PRD and all six specifications remain unchanged. This is a document-quality verdict, not a claim about live product health or work status.

## Dimension verdicts

- Decision-readiness — thin
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — thin
- Scope honesty — strong
- Downstream usability — thin
- Shape fit — strong

Fair follows the installed grading rule: multiple thin dimensions and high findings, with no broken dimension or critical finding. These are the rubric reviewer's original judgments; the governance findings qualify—not erase—the draft's strong scope and truthfulness intent.

## Findings by severity

These are consolidated repair units, not a sum of reviewer counts. Duplicate references and journey findings are merged. Original reviewer findings and wording are preserved in the appendices and separate source files.

### Critical (0)

None identified in this bounded document review. This does not certify implementation security or release readiness.

### High (4)

#### C01 — Restore the exact claim ladder and narrow implementation claims

**Source:** Governance GOV-01; PRD lines 22, 56, 111, 117–119; `BLUEPRINT.md:30`; `REQUIREMENTS-MATRIX.md:21–35`; `DATA-DICTIONARY.md:369–395`.

The draft uses `source-present/implemented` and a broad source-present bundle that includes known missing enforcement and remote-delivery behavior.

**Fix:** Use `intended → specified → implemented → verified → released` exactly. Treat source presence as provenance, not another status. Record capability-specific evidence and explicitly retain DOC-06/07 implementation gaps. Source inspection cannot establish deployment or live behavior.

#### C02 — Preserve canonical states and separate decisions from evidence work

**Source:** Decision-readiness; Jobs first finding; Governance GOV-02; PRD lines 64, 72, 77, 123, 136; `RISKS-AND-DECISIONS.md:24–31,538–550,568–607`; `REQUIREMENTS-MATRIX.md:688–703`.

The PRD collapses Proposed, Needs a decision, Needs evidence, Open, and story-specific Blocked states into a single owner list. It also misses the already-selected tooling subset within Proposed AD-68.

**Fix:** Add a sourced ledger with exact status, accountable owner, affected FR/slice, prerequisite, and next gate. Distinguish product choices, engineering proposals, evidence collection, and deferred budgets. Do not reopen approved DOC-01/06/07 or routing.

#### C03 — Make every FR traceable to acceptance and evidence

**Source:** Done-ness clarity; PRD lines 58–100, 129–131; `REQUIREMENTS-MATRIX.md:664–709` and its applicable CF/BE acceptance sections.

Global acceptance-family references do not show which evidence closes each requirement.

**Fix:** Map each FR to exact canonical requirement and acceptance IDs, applicable negative cases, required evidence, and decision dependencies. If an acceptance mapping is genuinely absent, expose the gap; do not invent a canonical ID or criterion.

#### C04 — Make canonical references resolvable from the PRD

**Source:** Downstream usability; PRD lines 20, 62–100; `BLUEPRINT.md:851–876`.

The reader must discover the six source paths through a line pointer and infer namespace ownership.

**Fix:** Add the six-document authority map below with stable repository paths and relevant section/ID references. Keep the PRD a companion, not a seventh specification.

### Medium (8)

#### C05 — Make the core release boundary and non-goals explicit

**Source:** Jobs MVP/non-goals findings; PRD lines 26, 95–100, 115–127; `BLUEPRINT.md:163–200,233–241`; `DESIGN-ALLURA.md:55–74`.

**Fix:** Frame the proposed minimum outcome as authenticated capture → proposal → independent human decision → immutable receipt/version → scoped current retrieval with provenance. Keep optional dashboard, remote projection, native board/sync, and broader work-plane delivery separately gated. Explicitly exclude autonomous promotion, direct substrate mutation, fabricated claims, and governance bypass. This clarifies existing boundaries; it does not approve a new release scope.

#### C06 — Keep DOC-07 approved behavior separate from implementation choices

**Source:** Jobs DOC-07 finding; PRD line 83; `DESIGN-ALLURA.md:1115–1121`; `RISKS-AND-DECISIONS.md:28,598–607`.

**Fix:** State that confirmed destination read-back and immutable decision receipts are fixed. AD-68 still needs durable handoff, current-observation read route, bounded retry/reconciliation, and destination authority design/evidence. Do not ask whether read-back is required again.

#### C07 — Split AD-35 accepted contract, partial source, and deferred runtime

**Source:** Governance GOV-03; PRD lines 99, 127; `SOLUTION-ARCHITECTURE.md:269–315,339–353`; `DATA-DICTIONARY.md:693–744`.

**Fix:** Retain the accepted neutral RunRecord/policy/runtime separation and PostgreSQL operational-state ownership outside Brain. Name the partial foundation separately from the deferred full methodology runtime. Accepted BMAD installation is not completion of AD-35 or the product.

#### C08 — Correct five-tool semantics

**Source:** Governance GOV-04; PRD line 62; `BLUEPRINT.md:308–312`; `SOLUTION-ARCHITECTURE.md:208–215`.

**Fix:** Say clients use the five core contracts, not that all five append evidence. `memory_add` captures evidence; search/get/list read; delete appends a deletion event and deprecates semantic content. Preserve the authenticated MCP capture boundary.

#### C09 — Label proposed data contracts as proposals

**Source:** Governance GOV-05; PRD lines 64, 72, 77, 82–83; `DATA-DICTIONARY.md:1651–1722`; `DESIGN-ALLURA.md:1036–1039`.

**Fix:** Distinguish desired behavior from proposed DTO/storage names under AD-65–68. No table, schema, API, migration, or compatibility contract is adopted by repeating a proposal in this PRD.

#### C10 — Bind the review to actual dirty-worktree bytes

**Source:** Governance GOV-06; PRD frontmatter and lines 14, 56, 139; `source-sha256.txt`.

**Fix:** Reference a bounded source manifest alongside HEAD. The commit alone cannot reproduce modified canonical files or the untracked draft. Do not call this working-tree snapshot merged, released, or deployed.

#### C11 — Separate acceptance evidence from product-success measures

**Source:** Strategic coherence; PRD lines 85, 113, 129–136; `RISKS-AND-DECISIONS.md:605`.

**Fix:** Rename the current success section to acceptance/release evidence. Keep product-success and retrieval/latency budgets explicitly unadopted until a measured baseline and bounded recommendation exist. Buyer, pricing, and packaging are deferred market strategy, not blockers to this bounded PRD review.

#### C12 — Resolve accessibility bounds without inventing standards

**Source:** Done-ness clarity; PRD lines 91, 109; canonical CF acceptance conditions and ENT-05 evidence requirement.

**Fix:** Cite the exact applicable canonical accessibility/responsive acceptance condition and evidence. Where no bound exists, identify the affected UI-story decision rather than treating adjectives as a test or inventing a new standard.

### Low (3)

#### C13 — Give UJ-5 the right type

**Source:** Downstream usability/mechanical notes; PRD line 44.

**Fix:** Use the canonical protagonist if one exists, otherwise label it an operational scenario. Do not invent a persona to satisfy a template.

#### C14 — Repair the assumptions index

**Source:** Mechanical notes; PRD line 139.

**Fix:** Add matching inline assumption tags where genuinely uncertain, or classify already-approved facts as constraints. Approved audience and authority are not unresolved assumptions.

#### C15 — Avoid live-status implications and cite the runtime contract

**Source:** Governance GOV-07; PRD lines 121–123, 138; `REQUIREMENTS-MATRIX.md:683–709`; `.agents/TEAM-RAM-RUNTIME.md:142–155`.

**Fix:** Label the DEV order as a canonical preparation proposal, not observed backlog status. Cite the repository runtime contract for Team RAM ownership. Live work status remains unknown.

## Six-document authority map

Repository-relative paths below identify the reviewed sources; `source-sha256.txt` binds their actual bytes. The governance appendix contains detailed coverage and dual citations.

| Source | Authority | Reconciliation result |
|---|---|---|
| `docs/allura/BLUEPRINT.md` | Purpose, audience, scope, requirement intent | Core thesis aligned; correct claim ladder and five-tool wording |
| `docs/allura/SOLUTION-ARCHITECTURE.md` | Components, boundaries, operational state | Core boundary aligned; restore AD-35 distinctions |
| `docs/allura/DESIGN-ALLURA.md` | Behavior, journeys, references, failure states | DOC-06/07 aligned; preserve proposed contract gates |
| `docs/allura/REQUIREMENTS-MATRIX.md` | Acceptance evidence and readiness | Add FR traceability and exact readiness labels |
| `docs/allura/RISKS-AND-DECISIONS.md` | Accepted, proposed and unresolved choices | Preserve approval states and AD-68 selected subset |
| `docs/allura/DATA-DICTIONARY.md` | Identity, ownership, entities, lineage | Preserve lifecycle semantics and proposed-schema boundary |

## Approved decisions that stay closed

- DOC-01: GitHub owns six versioned engineering specifications; Notion holds private planning/approval records and links to them.
- Operational routing: Allura owns work status; Notion holds planning; Brain provides continuity. DOC-09 implementation remains a separate choice.
- DOC-06: reject stale human-reviewed proposal versions without new approval effects; replay returns the original receipt.
- DOC-07: remote synced requires confirmed destination read-back; observations never rewrite the decision receipt.
- Independent human promotion, fail-closed tenant/workspace authority, append-only evidence, immutable semantic versions, and preserved lineage remain binding.
- PostgreSQL is the durable substrate; Neo4j is retired. The primary audience remains developers/teams and their supporting reviewers/operators.
- AD-35 is Accepted with partial source and a deferred full runtime. AD-68's bounded tooling selection remains selected; broader AD-68 remains Proposed.

## Decision routing — not a new approval request

### Genuine product choices to package for Sabir

- **AD-65:** user-visible lost-acknowledgement, retry/conflict, legacy-client compatibility and applicable retention/accounting trade-offs. Brooks/Pike/Knuth supply the technical proposal; approval does not extend to unpresented storage mechanics.
- **AD-67:** correction/conflict experience and renewed human review, within the already-fixed immutable-history and human-promotion rules.
- **DOC-09:** whether/when to include a native board or projection surface, plus synchronization/conflict behavior. Allura's status authority stays fixed; optional board work need not block the core memory journey.
- **DOC-02:** exact visual reference/revision/assets only if the first UI story is included in the selected release; otherwise defer with the optional interface.

### Engineering or evidence prerequisites before an owner question

- DOC-03 restore and DOC-05 cross-proposal duplicate behavior: Brooks/data owner present bounded lineage-preserving options before Sabir chooses user-visible behavior.
- DOC-08: locate valid curator-first approval evidence before asking for a new decision. Failed Brain recall does not prove no approval exists.
- AD-66: Brooks/Knuth/Pike prepare authority, migration and restricted-role evidence. Existing isolation is fixed; any security/schema/production change still needs explicit authorization.
- ENT-01: prepare the workspace role/confidentiality contract before product acceptance. ENT-02–05 primarily require assigned engineering/operator/design evidence, not generic owner votes.
- AD-68: produce exact-revision evidence and a measured baseline before budget choices. Existing selected tooling is not reopened. New upgrades, deprecations, retention or destinations require their own bounded proposals.
- Buyer persona, pricing and packaging: deferred unless separately scoped. Their absence is not an immediate blocker to this PRD.

## Reviewer reconciliation

The governance and Notion reviewers use broad lists of unresolved contracts. Those lists mean that the review did not close the records; they do not establish that every item is an immediate question for Sabir. Jobs' narrower ownership classification is adopted because the canonical decision record explicitly assigns technical drafting, evidence and later approval to different owners.

The rubric calls scope honesty strong and an explicit non-goals heading optional. Jobs recommends making the boundary explicit. These are compatible: the draft is honest about limits, yet still needs clearer packaging for sign-off. Likewise, Notion supports the core truthfulness intent while Brooks correctly finds the literal claim ladder inaccurate.

No reviewer approved the PRD. No numerical grade or live status is inferred from reviewer agreement.

## Live Notion reconciliation

Six selected planning pages and two searches succeeded through Docker OAuth, as documented in `review-notion.md`. Parent verification independently fetched the Documentation Hub and confirmed the six-spec authority split and approved DOC-01/06/07 behavior.

- Current top-level planning supports the core governed-memory journey and independent human promotion.
- Historical board authority, Notion-to-repo sync, Neo4j, auto-promotion and dashboard directions are explicitly superseded, not new approvals.
- The navigation pages do not yet mirror the later development-readiness packet. This is planning/index lag, not a competing engineering specification.
- The Engine page records an unresolved memory-write hold. Further Brain writes remain paused; no release of that hold was established here.
- The connector did not expose an explicit truncation flag. Unvisited descendants, comments, database rows and private approvals remain outside this review.
- `https://mcp.faithmeats.org/mcp` responded to an unauthenticated probe with HTTP 401 and valid TLS. This proves ingress response, not authenticated operation health. This session's native recall still returned a generic tool failure; that does not establish an endpoint outage.

## Mechanical notes

- Merge duplicate journey and cross-reference findings rather than inflating counts.
- Original reviewer prose is retained below; the consolidated disposition and owner routing above resolve its broader wording.
- HTML uses the installed template's CSS and collapsible dimension/reviewer structure. Headless delivery does not launch the user's desktop browser.

## Verification and limitations

The PRD, six canonical documents and two governing contract files all matched the pre-review SHA-256 manifest during parent reconciliation. `git diff --check` returned clean. Reviewer files were read in full; selected canonical decision/readiness passages and the live Notion Hub were independently checked.

This review ran no application tests, migrations, or release acceptance. The unauthenticated endpoint response check above was connectivity telemetry only. It changed no original PRD, canonical source, Notion page, Brain record, work status, approval, commit or deployment. Source integrity and generated report structure are checked again in `verification.json`; those checks do not certify product behavior.

## Recommended next action

Authorize a targeted BMAD Update of the existing PRD to apply these drafting corrections, preserve all approved decisions, and package only the remaining bounded product choices. Do not create another PRD, approve proposed schemas implicitly, or begin implementation as part of that update.

## Reviewer files

- `review-rubric.md`
- `review-jobs.md`
- `review-governance.md`
- `review-notion.md`
- `source-sha256.txt`

<!-- REVIEW_APPENDICES -->

## Appendix — Original reviewer findings

Original reviewer wording follows; the consolidated disposition and decision-routing section above resolve differences.

### Source: `review-rubric.md`

### PRD Quality Review — Allura Memory Brownfield Product Contract

#### Overall verdict
This is a disciplined, substantive brownfield companion/index: it states its authority limits, preserves the governed memory thesis, separates claim states, and is unusually honest about unresolved decisions and unverified source presence. It is not yet a decision-complete or downstream-self-sufficient PRD, chiefly because owner decisions are listed as bare IDs and the local FRs do not map one-to-one to canonical acceptance evidence; those gaps are material even though the document correctly refuses to claim implementation readiness.

#### Decision-readiness — thin
The draft makes the most important meta-decision clear: it is unapproved, does not replace the six canonical specifications, and does not authorize implementation (§0, lines 14–22). It also names blocked requirements at the point of impact—for example AD-65 on FR-A3, AD-66 on FR-C2, and AD-67/DOC-03/05 on FR-B5 (§3, lines 62–85)—and explicitly prohibits starting decision-blocked stories (§5, lines 121–123). Those are useful stop/go controls.

However, the decision-maker cannot resolve the outstanding choices from this entry point. The “Owner decisions” line is only a list of IDs—AD-65–68, DOC-02/03/05/08/09, ENT-01–05, and metric budgets—without the question, available choices, trade-off, decision owner, or affected scope (§7, lines 133–139). That is appropriate evidence of uncertainty, but too thin for the stated purpose of a coherent review entry point.

##### Findings
- **high** Owner decisions are discoverable but not actionable (§7, lines 133–139; §3, lines 64, 72, 77, 83–85, 92) — Bare identifiers show where work is blocked but do not let Sabir/Jobs understand or resolve the tension without independently reconstructing it from the canonical set. *Fix:* add a compact decision index sourced verbatim from the canonical documents with ID, one-sentence question, currently documented options/trade-off, owner, affected FRs, and required-by gate; do not choose an option or invent missing choices.

#### Substance over theater — strong
The content is earned. The vision is product-specific—MCP/API-first, self-hosted, governed evidence-to-proposal-to-human-promotion-to-immutable-version retrieval (§1, lines 24–26)—and could not be swapped into a generic memory-product PRD. The listed actors drive concrete authority boundaries and journeys rather than decorative biographies (§1.1–1.2, lines 28–44); the undefined buyer and historical Maya persona are explicitly marked as unresolved/non-primary rather than padded into invented personas (lines 35–36).

The NFRs likewise encode Allura-specific invariants: zero cross-scope results, immutable content and receipts, explicit unknown outcomes, redacted low-cardinality telemetry, reproducible evidence, and nonconflated claim states (§4, lines 102–113). The draft avoids fabricated scale, compliance, or launch claims and says that no numeric SLO or compliance target has been adopted.

##### Findings
No substantive-theater finding.

#### Strategic coherence — adequate
The document has a clear thesis: trusted memory is not raw persistence but governed promotion and scope-safe retrieval, with human independence, immutable versions, provenance, and truthful operational claims. Features A–F consistently follow that arc, and the Now/Next/Later sequence keeps the core data plane ahead of deferred work-plane and personal-AI-OS ambitions (§3–§5, lines 58–127). Counter-metrics are unusually coherent with the thesis: success may not be raised through broader fallback, bypassed review, fabricated scope, silent degradation, history deletion, or false remote-sync claims (§6, lines 129–131).

The weakness is that “Success evidence” is an acceptance-evidence gate, not yet a product-success measure. DEV/CF/BE acceptance sets can prove implementation and claim truthfulness, but they do not by themselves test whether the product thesis delivers useful, current governed continuity; the draft acknowledges that metric budgets remain an owner decision (§3, line 85; §4, line 113; §7, line 136). For an unapproved companion this is acceptable, but it prevents a strong strategic-coherence verdict.

##### Findings
- **medium** Acceptance evidence and product success are conflated by the section label (§6, lines 129–131; §3, line 85; §4, line 113) — Revision-bound test evidence proves that requirements and claims are satisfied, but it does not define how the owner will judge the usefulness of governed retrieval. *Fix:* rename the current section to “Acceptance and release evidence,” add a separate explicitly unresolved “Product success measures” subsection, and link it to the existing metric-budget owner decision; do not invent thresholds or launch metrics.

#### Done-ness clarity — thin
Several requirements contain testable consequences directly: same-key changed payload conflicts (FR-A3), stale exact-version review must reject (FR-B3), denial must not widen fallback (FR-C2), remote `synced` requires destination read-back (FR-D2), and foreign workspace results must remain zero (NFR-1). The document also points to canonical DEV-AC01–12, CF-AC01–05, and BE-AC01–09 as the accepted evidence corpus (§6, lines 129–131).

But most FRs are compact preservation statements followed by broad source ranges, not self-contained done conditions. Examples include “append evidence through the five core memory contracts” (FR-A1), “retrieve through controlled MCP/API services” (FR-C1), and “maintain stable … compatibility through inventory and packed-consumer evidence” (FR-F1) (§3, lines 62, 76, 97). The aggregate AC citation in §6 does not show which acceptance row closes which FR, so story creation cannot reliably determine completion without reconstructing traceability across the six specifications.

##### Findings
- **high** Local FRs lack one-to-one acceptance traceability (§3, lines 58–100; §6, lines 129–131) — The PRD names canonical requirement and AC families, but it does not map each FR to the exact canonical acceptance condition(s), evidence class, or blocking decision. This makes “done” reconstruction-heavy and risks inconsistent story acceptance. *Fix:* add a traceability table mapping every FR to exact canonical source IDs, exact applicable AC IDs, evidence required, and any decision blocker; preserve canonical wording and IDs rather than duplicating or creating requirements.
- **medium** Accessibility and responsive done conditions remain adjectival at the PRD layer (FR-E2 and NFR-6, lines 91 and 109) — “responsive/accessibility behavior,” “screen-reader readable,” and “contrast safe” do not state the bound that a downstream implementer should verify. *Fix:* cite the exact existing CF acceptance conditions or canonical accessibility standard/breakpoint evidence beside FR-E2/NFR-6; if the canonical set has no bound, mark that bound as an owner decision instead of inventing one.

#### Scope honesty — strong
Scope handling is a major strength. The opening warning distinguishes authoring intent from readiness, excludes status and planning mutations, and states that product tests were not executed (lines 14–16). Claim states are explicitly separated (§0, line 22), the optional command center is kept outside the core engine (§1, line 26), and Now/Next/Later distinguishes source-present scope, backlog, and uncommitted intent (§5, lines 115–127). The document also preserves operational routing without pretending that failed recall or unavailable status capability proves absence (§7, lines 133–139).

Omissions are not silently smoothed over: buyer definition, metric budgets, remote authority, work-board behavior, and enterprise roles are called out as owner decisions or blockers. Although there is no dedicated “Non-Goals” heading, the boundary statements in §§0, 1, 3F, and 5 perform that function for this companion/index.

##### Findings
No material scope-honesty finding; the Assumptions Index roundtrip issue is recorded under Mechanical notes.

#### Downstream usability — thin
The glossary is compact and domain-specific (§2, lines 46–56), local UJ/FR/NFR identifiers are unique and contiguous within their series, and most journeys name a role carrying the relevant authority context (§1.2, lines 38–44). Requirements also retain canonical namespaces rather than laundering them into new IDs, which is the right choice for a companion to six authoritative documents (§0, lines 18–22).

The entry point is nevertheless not cleanly source-extractable on its own. It says the six authoritative files are “listed in Blueprint lines 851–876” rather than listing their repository paths (§0, line 20), while FRs mix references such as `B2`, `BP-F60`, `DOC-06`, “architecture constraint §6,” and Data Dictionary table names without a local source map (§3, lines 62–100). Combined with the missing FR-to-AC mapping, downstream UX, architecture, or story workflows must first rediscover which file owns each namespace and which acceptance conditions apply.

##### Findings
- **high** Canonical citations are not locally resolvable from the companion (§0, line 20; §3, lines 62–100) — Referring readers to a line range in Blueprint to discover the six files undermines the PRD’s role as the brownfield entry point and makes source extraction brittle when line numbers move. *Fix:* add a six-row canonical source map with stable repository path, authority/topic, and namespaces owned; keep all requirements and decisions in their existing canonical files.
- **medium** UJ-5 is a system scenario rather than a named-protagonist journey (§1.2, line 44) — “Remote projection remains honest” describes a projection invariant but does not name who initiates the action or needs the outcome, unlike UJ-1 through UJ-4. *Fix:* either name the existing-source protagonist (only if the canonical journey identifies one) and carry that context inline, or relabel UJ-5 as a system/operational scenario rather than inventing a persona.

#### Shape fit — strong
The shape fits a high-stakes brownfield governed MCP/API memory platform. It uses a capability-contract structure rather than consumer-product ceremony, but includes a small number of journeys where multi-role authority and failure paths are load-bearing (§1.2). It explicitly distinguishes existing-source behavior, source-present evidence, verification, and release; identifies the inspected revision in frontmatter; and preserves the PRD as a companion/index instead of forcing a seventh competing specification (§0, lines 1–22).

The document is neither over-formalized with persona narratives nor under-formalized about governance, isolation, lineage, replay, remote observation, and claim truthfulness. Its remaining weaknesses are traceability and decision packaging, not a mismatch between template and product.

##### Findings
No shape-fit finding.

#### Mechanical notes
- **low** Assumptions Index does not roundtrip to inline assumption tags (§7, line 139) — The three indexed assumptions do not appear as `[ASSUMPTION: …]` tags at their first relevant locations, so the index cannot be mechanically checked against the body. *Fix:* either add matching inline tags at the relevant authority/audience/source-present statements or rename these entries as declared constraints if they are already canonical facts; keep a one-to-one index.
- **low** One journey lacks a named protagonist (§1.2, line 44) — UJ-1 through UJ-4 identify a developer, reviewer, operator, or viewer; UJ-5 does not. *Fix:* apply the UJ-5 fix under Downstream usability.
- **medium** Cross-reference resolution depends on an unstable line pointer and implicit namespace knowledge (§0, line 20; §3, lines 62–100) — Local IDs are continuous (`UJ-1`–`UJ-5`, `FR-A1`–`FR-F4` within feature groups, `NFR-1`–`NFR-8`), but canonical targets cannot all be resolved from this document. *Fix:* add the stable canonical source map and FR-to-AC traceability table described above.
- Glossary usage is materially consistent: “evidence,” “proposal,” “semantic version,” “governance receipt,” “delivery observation,” “authority,” “current knowledge,” and “source-present” retain their defined meanings across the requirements.
- Required shape elements are present for the agreed brownfield companion role. A dedicated Non-Goals section is optional here because explicit boundary, deferred-scope, and non-readiness statements already carry the omission burden.


### Source: `review-jobs.md`

### Team RAM Jobs — PRD intent-gate review

**Role:** Team RAM Jobs guidance loaded through `allura_team(team=ram, role=jobs, task="bounded PRD intent review")`. This is a separate intent review, not PRD authorship or product approval.  
**Reviewed revision:** `fcf4a33f025f69a5bc3fd120e974dd079dc65c52` with the existing dirty working tree identified by the review scope.  
**Objective:** Keep the approved Allura promise intact, separate the smallest credible product from optional surfaces, and send Sabir only choices that materially change user experience, scope, risk, cost, or acceptance.

#### Verdict

**REVISE BEFORE OWNER SIGN-OFF.** The PRD substantially preserves the approved memory-engine intent, audience, governance invariants, and DOC-01/DOC-06/DOC-07 decisions. The gate is narrower: its open-question section labels engineering design work, evidence gathering, deferred budget-setting, and contingent approvals as if they were all immediate owner product choices. It also needs a crisper MVP/non-goal boundary. These are targeted PRD corrections, not a reason to reopen approved routing or core product intent.

#### Approved intent that must remain closed

- **Documentation authority (DOC-01):** GitHub owns the six versioned engineering specifications; Notion holds private planning/drafts/approval records and links to the governing revision. This is approved, not an open routing question (`docs/allura/RISKS-AND-DECISIONS.md:19-23`; `docs/allura/DESIGN-ALLURA.md:19-21`).
- **Stale-review behavior (DOC-06):** a new approval must fail when the proposal changed after human review; fresh human review is required, while successful replay returns the original receipt (`docs/allura/RISKS-AND-DECISIONS.md:27`; `docs/allura/DESIGN-ALLURA.md:1115-1119`).
- **Confirmed remote delivery (DOC-07):** `synced` requires destination read-back, the decision receipt remains immutable, and delivery state is separate (`docs/allura/RISKS-AND-DECISIONS.md:28`; `docs/allura/DESIGN-ALLURA.md:1117-1121`).
- **Primary audience:** developers and teams using connected agents are primary; operators and independent human reviewers support them; the enterprise dashboard is optional. The historical Maya/community persona is not the current primary audience (`docs/allura/BLUEPRINT.md:63-65`; `docs/allura/BLUEPRINT.md:954-960`).
- **Core boundary:** Allura is an MCP/API-first governed memory engine. Agent orchestration and domain decisions are outside the engine; the Memory Command Center is optional (`docs/allura/BLUEPRINT.md:163-200`; `_bmad-output/planning-artifacts/prd.md:24-36`).
- **Operational routing:** Allura owns work status, Notion holds planning documents, and Allura Brain provides governed continuity. That approved authority split does **not** select the DOC-09 board/synchronization implementation (`guidelines/ALLURA-BMAD.md:44-48`; `.agents/TEAM-RAM-RUNTIME.md:150-155`; `_bmad-output/planning-artifacts/prd.md:14-16,133-136`).

#### Findings

##### High — The PRD collapses unlike gaps into one “Owner decisions” list

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

##### Medium — “Now” is not a clean MVP boundary

**Evidence.** The PRD’s “Now” bundle includes the core five-tool path, approval, retrieval, SDK/CLI points, and optional operator views, while “Next” says dashboard acceptance still waits on DOC-02/DOC-09 and enterprise role contracts (`_bmad-output/planning-artifacts/prd.md:115-127`). Canonical intent says the engine is usable without a browser and the dashboard is optional (`docs/allura/BLUEPRINT.md:198-200`; `docs/allura/DESIGN-ALLURA.md:55-74`).

**Impact.** A reader cannot tell whether optional dashboard acceptance, Notion projection, or board behavior is required before the first useful release. This weakens sequencing and allows optional polish to block the core outcome.

**Recommended disposition.** **Must revise before sign-off.** Define the MVP as the authenticated, scope-safe journey: capture evidence → create proposal → independent human decision → immutable receipt/version → authorized current retrieval with provenance/audit. Keep the browser dashboard optional; keep remote Notion projection separately releasable under fixed DOC-07 acceptance; keep native board/sync, governed runs, AI Office, and desktop shell outside the MVP. If a first UI story is included, name it explicitly and then resolve DOC-02 for that story only.

##### Medium — The PRD needs an explicit non-goals block rather than scattered exclusions

**Evidence.** The vision and later-scope text contain exclusions, but the PRD has no dedicated non-goals section (`_bmad-output/planning-artifacts/prd.md:24-26,95-100,125-127`). The canonical Blueprint explicitly excludes ungated database editing, fabricated live metrics, decorative unsupported charts, bulk approval without rationale, generated logo marks, and dashboard actions that bypass governance (`docs/allura/BLUEPRINT.md:233-241`). It also keeps orchestration and domain decisions outside the memory-engine responsibility (`docs/allura/BLUEPRINT.md:30-32`).

**Impact.** Optional surfaces can be mistaken for core authority, and deferred platform work can creep into MVP acceptance.

**Recommended disposition.** **Required drafting correction; no owner question.** Add a concise non-goals section preserving: no autonomous promotion; no direct substrate mutation; no orchestration/domain-decision ownership; no fabricated health/quality/compliance claims; no dashboard bypass of MCP/API governance; no native board/sync commitment until DOC-09; no governed-runs/AI-Office/desktop-shell commitment in this implementation pack.

##### Medium — FR-D2 blurs approved DOC-07 intent with remaining AD-68 implementation selection

**Evidence.** FR-D2 correctly states the approved `synced`/immutable-receipt rule but then says “Implementation details/remote authority unresolved” (`_bmad-output/planning-artifacts/prd.md:80-86`). Canonical design is more precise: DOC-07 is already approved; the transport/read route, exact retry policy, durable bridge, and destination-transfer authorization remain implementation work under AD-68 (`docs/allura/DESIGN-ALLURA.md:1115-1121`).

**Impact.** Reviewers could reopen whether remote read-back is required or treat DOC-07 as unapproved.

**Recommended disposition.** **Must clarify, not re-decide.** Replace the vague qualifier with: “DOC-07 behavior is fixed; AD-68 must select and verify the durable handoff, current-observation read route, bounded retry/reconciliation policy, and destination transfer authority.”

##### Medium — The buyer/persona marker reopens an audience question that is not needed for this PRD

**Evidence.** The PRD marks “Buyer/commercial owner” as `[OWNER DECISION]` even though the accepted current audience is already developers/teams, with operators/reviewers supporting and enterprise UI optional (`_bmad-output/planning-artifacts/prd.md:28-36`; `docs/allura/BLUEPRINT.md:63-65,954-960`). No canonical buyer definition exists, but absence is not itself a blocker to the bounded memory product.

**Impact.** Sign-off can be diverted into a whole-market/commercial-persona exercise that does not change the current user journey or acceptance criteria.

**Recommended disposition.** **Remove from current owner decisions.** Label a buyer/commercial persona as deferred market strategy unless a pricing, procurement, or go-to-market milestone is separately scoped.

#### DOC-01 through DOC-09 disposition

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

#### AD-65 through AD-68 disposition

| Decision | Genuine product choice | Engineering drafting/review that should not be pushed to Sabir |
|---|---|---|
| AD-65 | Accept user-visible lost-acknowledgement, same-key retry/conflict, and legacy-client compatibility behavior; approve any retention/product-policy tradeoff. | Key syntax, canonical digest/metadata allowlist, uniqueness/atomicity, response-version mechanics, worker leases/retries, and proof. |
| AD-66 | No new product promise: existing fail-closed workspace isolation is fixed. Later approval is required before a concrete security/schema/production change executes. | Opaque authority signatures, migration inventory, restricted role/RLS proof, legacy-row quarantine, index validation, and worker policy. |
| AD-67 | Accept correction/conflict UX: pending human review, stale-head conflict, no automatic rebase, explicit renewed review. | DTO/public mapping, base/head fields, single-head concurrency, transactionality, and lineage proof. DOC-03/05 remain separate. |
| AD-68 | Set product acceptance budgets only after baseline; approve concrete upgrades/deprecations or changed retention/destination policy when proposed. | CI/tooling lane selection (bounded selection already recorded), test discovery, telemetry/redaction naming, delivery route/digest normalization, baseline production, and exact-head evidence. |

Sources: `docs/allura/RISKS-AND-DECISIONS.md:562-607`; `docs/allura/DESIGN-ALLURA.md:1036-1130`.

#### Concise decision-only list

##### Ready to put to Sabir

1. **DOC-09 — implementation surface:** Under the already approved routing, should Allura-owned work status have a native Allura board now, or remain without a native board while approved projections/adapters are defined? For either choice, approve sync direction and conflict behavior; Allura remains status authority.
2. **DOC-02 — only if UI is in the selected release:** Name the exact approved screen/reference revision and assets for the first capture/review/retrieval UI story. Otherwise explicitly defer DOC-02 with the optional dashboard.
3. **AD-65 product behavior:** Accept that lost acknowledgement is `unknown`, same-key reconciliation/retry must not duplicate evidence, changed payload conflicts, and legacy clients need an explicit compatibility window before key enforcement.
4. **AD-67 product behavior:** Accept that correction conflicts never auto-rebase or auto-approve; the user receives a conflict and a fresh human review is required.

##### Do not put to Sabir until the prerequisite packet exists

5. **DOC-03:** a lineage-preserving restore/rollback UX recommendation from Brooks/data owner.
6. **DOC-05:** a bounded recommendation for distinct-proposal duplicates, with user-visible effects of merge/link/reject/new-version.
7. **ENT-01:** a compatible per-workspace role/confidentiality contract from Brooks.
8. **AD-68 budgets:** a measured baseline and proposed acceptance thresholds; concrete upgrade/deprecation or retention/destination changes if any.
9. **DOC-08:** only if the approval search fails and the curator-first product direction still needs an owner choice.

Not owner choices: DOC-04 verification, AD-66 technical contract/evidence, ENT-02–ENT-05 acceptance evidence, hosted CI/exact-head proof, or defining a buyer persona for this bounded PRD.

#### Residual limitations

- This was a documentation intent review. No product tests, live acceptance, Notion write, Allura status transition, Brain write, implementation change, commit, or deployment was performed.
- The workspace was already broadly dirty. This review intentionally wrote only this report.


### Source: `review-governance.md`

### Brooks governance review — Allura Memory PRD

#### Disposition

**REVISE BEFORE OWNER ACCEPTANCE.** The PRD is a useful, governance-aware companion to the six canonical specifications, but it is not yet approval-ready because it flattens materially different decision/readiness states, uses a noncanonical claim-state alias with an overbroad `source-present` statement, and compresses accepted-but-partial AD-35 semantics. This review is **not approval**, does not change operational status, and authorizes no implementation, status transition, Notion/Brain write, deployment, database action, commit, or canonical edit.

**Role activation:** the requested `allura_team(team="ram", role="brooks", task="bounded PRD governance review")` mechanism was available and loaded successfully. Brooks perspective is therefore active; that is not evidence that any other specialist ran or approved the PRD.

**Review basis:** branch `dev/allura-beta`, HEAD `fcf4a33f025f69a5bc3fd120e974dd079dc65c52`, plus the working-tree files frozen by `source-sha256.txt`. The PRD itself is an untracked authoring draft and several canonical/contract files are modified in the working tree; the commit SHA alone does not identify their reviewed bytes. Bounded Brain recall had already failed and the memory-write hold remains in force (`scope.md:3-13`). No local plan, Notion page, Brain result, or BMAD output was treated as live Allura work status.

#### Six-document coverage

| Canonical specification | Relevant authority extracted | PRD coverage | Brooks result |
|---|---|---|---|
| `docs/allura/BLUEPRINT.md` | Six-document authority and five-step claim ladder (`:19-32`, `:851-876`); five-tool semantics (`:308-312`, `:882`); AD-35 run requirements (`:206-213`, `:385-408`); proposed BP-F59–70 (`:904-929`) | Product boundary, five-tool surface, BP-F59–70, deferred AI Office and authority split are present (`prd.md:20-26,62-100,115-139`) | **Partial.** Core intent is preserved, but `source-present/implemented` is not the canonical ladder and FR-A1 misstates all five contracts as evidence appenders. AD-35 is compressed too broadly into “partial/deferred” and “Later.” |
| `docs/allura/SOLUTION-ARCHITECTURE.md` | Brain is memory-only; orchestration/UI/projection are outside the data plane (`:50-76`); DOC-06/07 architecture gaps (`:116-120`); AD-35 RunRecord is outside Brain with PostgreSQL operational state (`:269-315`, `:339-353`); AD-65–68 topology remains proposed (`:516-565`) | MCP/API-first, PostgreSQL, controlled retrieval, optional UI, authority and projection separation are reflected (`prd.md:26,54,74-100`) | **Mostly aligned.** It omits the accepted AD-35 neutral-state/policy/runtime split and makes the partial run layer look wholly future. |
| `docs/allura/DESIGN-ALLURA.md` | Exact journey states and failures (`:672-702`); DOC-06/07 are approved intended behavior with implementation gaps (`:692-700`, `:1115-1121`); AD-65–68 design remains proposed (`:1036-1160`) | Stale-review, immutable receipt, current retrieval, unknown/degraded outcomes and remote read-back are well represented (`prd.md:40-44,68-86`) | **Substantively aligned.** However, proposed design choices are rendered as implementation “blocked,” contrary to canonical readiness vocabulary. |
| `docs/allura/REQUIREMENTS-MATRIX.md` | Row-level claim states (`:19-35`); all enterprise rows unreleased (`:43-49`); DEV-AC01–12 (`:664-681`); `Ready`, `Needs a decision`, and `Blocked` are distinct and authorize preparation only (`:683-709`) | Acceptance families are cited globally (`prd.md:129-131`) and a proposed preparation order is stated (`:121-123`) | **Insufficiently precise.** No row-level current state is carried, `Needs a decision` is relabeled as blocked for AD-65/66/67, and “Next / existing backlog” can be mistaken for live status despite the draft's status disclaimer. |
| `docs/allura/RISKS-AND-DECISIONS.md` | DOC-06/07 approved specification; DOC-09 needs a decision (`:27-31`); AD-35 Accepted (`:78`); AD-65/66/67/68 Proposed (`:568-607`), with bounded AD-68 tooling selection but broader decisions still proposed (`:600-605`); ENT-01–05 remain open (`:538-550`) | The PRD preserves DOC-06/07 behavior, DOC-09 unresolved state, and lists AD-65–68 plus DOC/ENT IDs (`prd.md:41,44,64-92,123,135-136`) | **Material status loss.** `Owner decisions` flattens Proposed, Needs-a-decision, Blocked-for-affected-stories, Needs-evidence and Open states. AD-68's selected tooling subset is not distinguished from the still-proposed remainder. |
| `docs/allura/DATA-DICTIONARY.md` | Physical journey entities and lifecycle (`:17-35`); proposal/replay/outbox fields and DOC-06/07 gaps (`:279-395`); AD-35 RunRecord/policy/runtime separation and partial implementation (`:693-744`); proposed DTOs are not implemented schemas (`:1651-1722`) | `graph_memories`, `graph_supersedes`, receipts, delivery observations and authority are accurately summarized (`prd.md:48-56,70-83`) | **Partial.** The lifecycle vocabulary is sound, but the PRD does not preserve that `CaptureReceiptV1`, `VectorScopeV1`, `SemanticCorrectionV1`, `RemoteDeliveryObservationV1`, and `OperationObservationV1` are proposed logical contracts requiring AD/schema review. |

#### Current canonical status ledger

| Record | Canonical status and consequence | PRD treatment | Governance conclusion |
|---|---|---|---|
| DOC-06 | **Approved specification.** New approval binds the exact human-reviewed proposal version; stale review rejects without writes; successful replay returns the original receipt. Request/schema enforcement remains an implementation gap (`RISKS-AND-DECISIONS.md:27`; `DESIGN-ALLURA.md:1115-1118`; `DATA-DICTIONARY.md:369-371`). | Behavior is correct (`prd.md:41,70`), but approved intent versus unimplemented enforcement is not stated at the requirement. | Preserve as approved behavior; do not ask the owner to decide it again. DEV-05B is Ready only for bounded preparation/execution under ordinary approvals and independent acceptance (`REQUIREMENTS-MATRIX.md:698`). |
| DOC-07 | **Approved specification.** Remote `synced` requires authorized destination read-back; local `delivered` is not sync; the decision receipt remains immutable. Remote handoff/read model remains missing (`RISKS-AND-DECISIONS.md:28`; `DESIGN-ALLURA.md:1119-1121`; `DATA-DICTIONARY.md:391-395`). | Correct behavior and unresolved implementation/authority (`prd.md:44,83`). | Preserve as approved behavior with an open implementation/evidence gap; do not label it an unresolved product decision. |
| DOC-09 | **Needs a decision:** authoritative operational board, sync direction and conflict rules (`RISKS-AND-DECISIONS.md:30`). | Correctly unresolved and separated from approved routing (`prd.md:16,92,135`). | Preserved. Allura status / Notion planning / Brain continuity does not resolve DOC-09. |
| AD-35 | **Accepted.** Neutral `RunRecord`, policy and runtime-state separation; repository process-engine foundation is partial; full methodology runtime remains deferred until a concrete unmet use case (`RISKS-AND-DECISIONS.md:78`; `SOLUTION-ARCHITECTURE.md:269-302`; `DATA-DICTIONARY.md:693-744`). | `partial/deferred` and then wholly grouped into Later (`prd.md:99,127`). | Split the accepted contract, current partial source, and deferred full runtime. Brain must not become the orchestrator; PostgreSQL owns operational run state. |
| AD-65 | **Proposed.** Capture key/digest, atomic event/receipt/replay/index-intent and compatibility/retry policy (`RISKS-AND-DECISIONS.md:568-576`). | “Implementation blocked” and grouped as owner decision (`prd.md:64,123,136`). | Use **Needs a decision** for DEV-03, not canonical `Blocked` (`REQUIREMENTS-MATRIX.md:695`). |
| AD-66 | **Proposed.** Opaque workspace authority through vector paths; scoped degradation only; deployed impact unverified (`RISKS-AND-DECISIONS.md:578-586`). | “Blocked” (`prd.md:77`). | Use **Needs a decision** plus deployed migration/role evidence for DEV-04 (`REQUIREMENTS-MATRIX.md:696`). Do not imply a demonstrated live leak. |
| AD-67 | **Proposed.** Governed correction, base-head and DOC-06 concurrency checks; preserve lineage (`RISKS-AND-DECISIONS.md:588-596`). | “Blocked” (`prd.md:72`). | Use **Needs a decision** for DEV-05A; only DOC-03/05 affected restore/duplicate stories carry their own blocks (`REQUIREMENTS-MATRIX.md:697`). |
| AD-68 | **Proposed overall.** Main CI + retained Epic 24 checks, Bun 1.3.14, Node 24.19.0, frozen install/digests, real ESLint and strict discovery were selected on 2026-10-22; hosted exact-head/lint evidence and broader delivery, telemetry, retention, budgets, upgrades and release remain open (`RISKS-AND-DECISIONS.md:598-607`). | FR-D3 states the selected requirements, but all of AD-68 is listed generically as an owner decision (`prd.md:84,123,136`). | Record the bounded tooling selection separately; retain the remainder as Proposed. Selection is not hosted acceptance or product readiness. |

#### Findings

##### GOV-01 — High — Canonical claim ladder is blurred and the `Now` claim is overbroad

- **PRD:** `intended → specified → source-present/implemented → verified → released` and a broad bundle labeled `Source-present/tests-unverified` (`prd.md:22,56,117-119`).
- **Canon:** exact ladder is `intended → specified → implemented → verified → released`; implementation evidence is source-specific, verification is revision-bound, and release needs deployment/acceptance (`BLUEPRINT.md:30`; `REQUIREMENTS-MATRIX.md:21-35`). DOC-06 reviewed-version enforcement is not implemented; DOC-07 remote handoff is missing; dashboard/Cloudflare observations are source-local/excluded or unreleased (`DESIGN-ALLURA.md:698-702`; `DATA-DICTIONARY.md:10,371,393-395`; `REQUIREMENTS-MATRIX.md:43-49`).
- **Why it matters:** joining `source-present` and `implemented`, then applying that label to a mixed bundle, can promote a file's existence into implementation evidence for behavior that canon explicitly says is absent.
- **Required repair:** keep the exact five canonical states. Treat “source inspected/present in the reviewed working tree” as evidence provenance, not a claim state. Replace the `Now` paragraph with capability-by-capability states, explicitly naming DOC-06, DOC-07, dashboard/auth and run-layer gaps.

##### GOV-02 — High — Decision and readiness states are flattened or mislabeled

- **PRD:** AD-65/66/67 requirements say `blocked`; §7 labels AD-65–68, DOC-02/03/05/08/09 and ENT-01–05 collectively as `Owner decisions` (`prd.md:64,72,77,123,136`).
- **Canon:** AD-65–68 are **Proposed** (`RISKS-AND-DECISIONS.md:568-607`). DEV-03/04/05A are **Needs a decision**, not `Blocked`; DEV-05B is Ready for a bounded story (`REQUIREMENTS-MATRIX.md:688-703`). DOC-02/05/09 are Needs a decision; DOC-03 is Blocked only for restore/rollback stories; DOC-08 Needs evidence (`RISKS-AND-DECISIONS.md:24-31`); ENT-01–05 are open contracts (`:538-550`).
- **Why it matters:** these labels carry different authority and execution consequences. “Blocked,” “Proposed,” “Needs evidence,” and “Needs a decision” are not synonyms.
- **Required repair:** add a compact decision/readiness ledger with the exact canonical label, owner, affected FR/slice and next evidence. Do not reopen DOC-06/07.

##### GOV-03 — Medium — AD-35 accepted architecture and data semantics are underrepresented

- **PRD:** the run layer is described only as `partial/deferred` and grouped into Later (`prd.md:99,127`).
- **Canon:** AD-35 is Accepted; a partial source foundation exists. `RunRecord` is neutral durable state outside the Brain data plane, with policy and runtime state separate; PostgreSQL owns operational run records/events, while full methodology runtime/product APIs remain deferred (`RISKS-AND-DECISIONS.md:78`; `SOLUTION-ARCHITECTURE.md:269-302,339-353`; `DATA-DICTIONARY.md:693-744`).
- **Required repair:** split (a) accepted contract, (b) partial implementation, and (c) deferred full runtime. State that BMAD 6.12.4 registration/installation acceptance is methodology-tooling evidence only, not completion of AD-35 or product readiness (`guidelines/ALLURA-BMAD.md:71-91`).

##### GOV-04 — Medium — FR-A1 misstates the five-tool interface semantics

- **PRD:** “append evidence through the five core memory contracts” (`prd.md:62`).
- **Canon:** `memory_add` appends evidence; `memory_search`, `memory_get`, and `memory_list` read; `memory_delete` appends a deletion event and marks semantic content deprecated (`BLUEPRINT.md:308-312`). Canonical `memory_add` is available only through authenticated MCP transports, not a generic REST write (`SOLUTION-ARCHITECTURE.md:208-215`).
- **Required repair:** say “use the five core memory contracts,” then separately specify governed evidence capture through `memory_add` and soft deletion semantics through `memory_delete`.

##### GOV-05 — Medium — Proposed data contracts are presented without their schema/approval boundary

- **PRD:** FR-A3/B5/C2/D1/D2 adopt behavior mapped to the development-readiness packet, but do not state that its DTO names/storage contracts remain proposals (`prd.md:64,72,77,82-83`).
- **Canon:** `CaptureReceiptV1`, `IndexIntentV1`/`VectorScopeV1`, `SemanticCorrectionV1`, `RemoteDeliveryObservationV1`, and `OperationObservationV1` are logical proposals only; no table, schema, endpoint or migration is adopted until AD-65–68 and schema review (`DATA-DICTIONARY.md:1651-1722`; `DESIGN-ALLURA.md:1036-1039`).
- **Required repair:** retain the user outcomes as proposed requirements, but add a clear “proposed contract shape; no schema/API adoption” qualifier and avoid binding implementation to unapproved names.

##### GOV-06 — Medium — Snapshot provenance is not reproducible from the PRD alone

- **PRD:** frontmatter records only commit `fcf4a33…`, while also acknowledging a dirty checkout (`prd.md:9,14,56,139`).
- **Evidence:** HEAD matches that commit, but the PRD is untracked and canonical/contract files include working-tree modifications. The review bundle separately records byte hashes in `source-sha256.txt`.
- **Why it matters:** the commit cannot reproduce the actual specification bytes used for this draft.
- **Required repair:** add a bounded source-manifest reference or digest to the PRD frontmatter. Do not call the working-tree snapshot a released or merged revision.

##### GOV-07 — Low — Local planning wording and runtime-role citation need tightening

- **PRD:** `Next (existing DEV backlog)` and a sequence “as grouped in epics.md” (`prd.md:121-123`) can read like current work status; Team RAM roles are sourced to `.opencode/AGENTS.md` (`:138`).
- **Contract:** local plans/stories cannot establish live status; unavailable status stays unknown (`guidelines/ALLURA-BMAD.md:44-57,91-103`; `.agents/TEAM-RAM-RUNTIME.md:24-30,142-155`). Runtime routing authority is the repository Team RAM/runtime contract.
- **Required repair:** relabel the sequence “canonical preparation proposal; not live status,” cite `REQUIREMENTS-MATRIX.md:683-709`, and cite `.agents/TEAM-RAM-RUNTIME.md` for runtime authority. The PRD's explicit unknown-status statements (`:16,135`) are preserved.

#### Preserved decisions and controls

- The PRD remains a noncanonical, unapproved companion; the six GitHub specifications retain engineering authority (`prd.md:14-22`; `BLUEPRINT.md:851-876`).
- Allura owns operational status, Notion planning, and Brain continuity; none substitutes for another and this does not resolve DOC-09 (`prd.md:16,135`; `ALLURA-BMAD.md:44-57`).
- DOC-06 and DOC-07 are approved intended behavior with implementation gaps, not open product choices.
- Independent human approval is mandatory; score, legacy `auto`, tool success, agent persona, or BMAD phase completion cannot promote knowledge (`prd.md:68-70`; `ALLURA-BMAD.md:59-69`).
- PostgreSQL is the durable evidence/proposal/semantic/receipt/outbox substrate; Neo4j is retired; events and semantic history remain append-only/immutable with lineage.
- Local outbox `delivered` is not remote `synced`; projection observations never mutate the approval receipt.
- Server-resolved principal/tenant/workspace/action authority controls access; `group_id` format and request fields do not grant authority; denied scope cannot broaden fallback.
- Review permission is not approval. BMAD installation/registration evidence is distinct from product implementation, verification, release, or live work status.

#### Unresolved choices that remain with owners

1. **AD-65:** capture-key syntax, digest metadata allowlist/default normalization, legacy-client compatibility, admission accounting, retry/claim policy, response scoring compatibility and replay retention.
2. **AD-66:** internal authority signatures, restricted-role/RLS proof, migration applicability, vector model/dimension/index identity, legacy-row quarantine and worker lease/retry details.
3. **AD-67:** correction request/storage fields, base/current-head uniqueness and concurrency mechanism; DOC-03 restore and DOC-05 cross-proposal duplicate behavior remain separate.
4. **AD-68 remainder:** delivery-observation read route, Notion digest normalization, retry/reconciliation, telemetry fields/retention/destination, retrieval budgets/baseline, upgrades/removals/deprecations and release evidence. The bounded CI/runtime selection is already recorded and must not be re-decided implicitly.
5. **DOC-02/03/05/08/09:** exact visual reference; restore/lineage; duplicate policy; curator-first evidence; authoritative board/sync/conflict rules.
6. **ENT-01–05:** workspace role/confidentiality behavior, restricted-role/RLS evidence, complete administration/device/audit flows, production identity/session evidence, and actual responsive/accessibility evidence.
7. **Product choices:** buyer/commercial persona, product-success and retrieval/latency/scale budgets. No values are invented here.

#### Close

The PRD's governed-memory thesis, DOC-06/07 behavior, DOC-09 separation, PostgreSQL-only architecture, human approval gate and claim-truthfulness intent are sound. Approval-readiness depends on correcting the status ledger, restoring exact claim-state semantics, narrowing source-present claims, and making AD-35/proposed data-contract boundaries explicit. No canonical decision, implementation state, operational status or approval was changed by this review.


### Source: `review-notion.md`

### Live Notion planning reconciliation — Allura PRD

- **Review mode:** read-only source reconciliation; no Notion, Brain, status, approval, or canonical-document writes
- **Retrieved:** 2026-10-25T04:11:19Z
- **PRD reviewed:** [`../prd.md`](../prd.md), status `authoring-draft-unapproved`, updated 2026-10-25, source revision `fcf4a33f025f69a5bc3fd120e974dd079dc65c52`
- **Canonical local authorities:** [`docs/allura/RISKS-AND-DECISIONS.md`](../../../docs/allura/RISKS-AND-DECISIONS.md) and [`guidelines/ALLURA-BMAD.md`](../../../guidelines/ALLURA-BMAD.md)
- **Method:** Docker OAuth `notion-remote` through `notion-fetch` and `notion-search` only. Page recency and successful authentication were treated as access evidence, not approval or reconciliation proof.

#### Source coverage and metadata

| Source | URL | Notion metadata / status | Coverage and completeness |
|---|---|---|---|
| Allura Documentation Hub | https://app.notion.com/p/3ca1d9be65b3818c8680cef760371320 | Last edited / fetch snapshot `2026-10-18T22:30:49.576Z`; verification state `unverified` | Fetched. Current authority, publication, DOC-01/06/07, active/superseded-page map, and archive boundary reviewed. Response closed the page/content tags and carried no truncation marker. The connector did not expose an explicit `truncated` boolean. |
| Allura Memory — Engine | https://app.notion.com/p/33b1d9be65b38045b6b0fa8c48dbc17b | Last edited `2026-10-21T12:51:20.468Z`; fetch snapshot `2026-10-21T12:51:31.901Z`; verification state `unverified`; path `Faith Meats HQ` | Fetched. Current header, memory-write hold, six-document index, architecture, DOC-01/06/07, planning links, and preserved historical toggle reviewed. No truncation marker; no explicit connector `truncated` field. |
| Allura Blueprint — private working reference | https://app.notion.com/p/be31d9be65b3828cb46e81b1d1078f3a | Last edited / fetch snapshot `2026-10-18T22:30:51.624Z`; verification state `unverified` | Fetched because the Hub identifies it as the selected private working Blueprint. Current product intent, reference journey, boundaries, and historical toggle reviewed. No truncation marker. |
| Risks and Decisions: Allura | https://app.notion.com/p/33c1d9be65b3817988eae1752da36cdb | Last edited / fetch snapshot `2026-10-18T22:31:00.349Z`; verification state `unverified` | Fetched because it is the Engine's current private decision/risk navigation page. Current reconciliation findings and preserved historical toggle reviewed. No truncation marker. |
| Requirements Matrix: Allura | https://app.notion.com/p/df7e57400a574c619f60442834fed2d5 | Last edited / fetch snapshot `2026-10-18T22:30:58.439Z`; verification state `unverified` | Fetched because it is the Engine's current private acceptance/evidence navigation page. Current claim-state and acceptance boundary reviewed. No truncation marker. |
| Allura Memory Finish Plan | https://app.notion.com/p/3631d9be65b381d58d05f66eaadc946e | Last edited / fetch snapshot `2026-08-02T08:27:52.400Z`; verification state `unverified` | Fetched as the directly linked closure/blocker plan. Its May–August status, architecture, dashboard, and board claims are materially dated. No truncation marker. |
| Workspace searches | Query results for `Allura PRD product requirements` and `DOC-09 Allura board synchronization` | Search executed 2026-10-25; all returned pages were `unverified` | Used to distinguish active pages from archived/recovery duplicates and identify coverage gaps. Search did not return a current Allura product PRD that supersedes the repository draft. |

**Fetch failures:** none. All six selected page fetches and both searches returned successfully. This does not prove that unvisited descendants, private discussions, database rows, or linked evidence are complete or approved.

#### Agreements with the PRD

1. **Authority split is aligned.** The Hub says, exactly: “**Notion is the private authority for strategy, planning, approvals, and working decisions. It is not the published engineering truth.**” The current Engine says it “**does not define a competing architecture, API schema or deployment contract**.” This agrees with PRD §§0 and 7 and with `ALLURA-BMAD.md`: GitHub's six documents own engineering truth; Notion holds private planning; Allura owns operational work-item status; Brain provides governed continuity.

2. **The product boundary and core journey agree.** The private Blueprint says: “**Allura provides governed memory for AI agents and human operators: capture evidence, review proposals, retrieve scoped knowledge and retain an audit trail.**” It defines “**capture → human review → retrieval**,” matching PRD vision, UJ-1/2/3, and Features A–C.

3. **PostgreSQL-only durable architecture is consistent.** Current Blueprint and Engine both state that PostgreSQL stores episodic events, proposals, semantic records, lineage, and RuVector/pgvector retrieval, while Neo4j is retired under AD-50. This agrees with PRD §§1, 5, and FR-F2. Historical Neo4j language remains only inside explicitly superseded toggles.

4. **Independent human promotion remains mandatory.** Current Blueprint: “**A score or the legacy `auto` mode does not authorize semantic promotion.**” This supports PRD FR-B1/B2 and NFR-4; it does not support any historical auto-promotion wording.

5. **DOC-06 is represented correctly and remains an implementation gap.** Current pages repeat: “**A new approval must bind to the exact proposal version the human reviewed. If that version changed, reject without approval effects and require refresh and review.**” They also say the reviewed-version check is not implemented. This agrees with PRD UJ-2 and FR-B3.

6. **DOC-07 is represented correctly and remains unverified remotely.** Current pages state: “**Report Notion as synced only after confirmed remote delivery and read-back evidence for the intended destination and revision. Local outbox delivery alone is not remote synchronization.**” This agrees with PRD UJ-5 and FR-D2.

7. **Evidence-state separation is aligned.** The current Requirements page says: “**Keep intended, specified, implemented, verified and released separate.**” This directly agrees with PRD §§0, 2, 4, and 6. Notion's dated checks, counts, and implementation claims therefore cannot promote the PRD or prove release readiness.

8. **The PRD correctly preserves unresolved product scope.** Current private pages do not provide an approved buyer/commercial persona, numeric product SLOs, retrieval budgets, or a new approved visual reference. The PRD properly leaves those as owner decisions or non-adopted targets.

#### Conflicts, stale notes, and reconciliation consequences

##### Current-page conflicts

No material conflict was found between the **current top-level sections** of the Hub, Engine, private Blueprint, private Risks page, and private Requirements page and the PRD's authority, architecture, governance, DOC-06, or DOC-07 statements.

##### Preserved historical text that must not guide the PRD

1. **Historical board/status authority conflicts with the current approved routing.** The Engine's preserved June snapshot says “**Notion Work Board remains canonical for human/team status**.” The current repository contract says operational status belongs to Allura and DOC-09 remains unresolved. The Engine labels the block “Historical snapshot — superseded working content — not current specification”; therefore it is stale evidence, not a contrary approval.

2. **Historical sync-direction claims conflict with DOC-01.** Preserved Blueprint/Engine text says “**Notion → repo only**,” proposes a GitHub Action to push docs into Notion, and calls Notion a source of truth. Current pages explicitly supersede those tables and say no automatic overwrite or sync is established. The PRD correctly follows current DOC-01 rather than these historical instructions.

3. **Historical Neo4j and auto-promotion claims conflict with current canon.** The preserved Blueprint, Risks, Requirements, and Finish Plan include dual-store, Neo4j, and threshold/`auto` promotion descriptions. Current pages mark them superseded; AD-50 and mandatory HITL govern. The PRD correctly excludes them.

4. **The Finish Plan is not current product or release status.** Its page was last edited 2026-08-02 and includes May-era claims such as “Phase 1 ACTIVE,” port 3100, dashboard rebuild, Neo4j data sources, and Notion/Brain status receipts. These conflict with later architecture and authority decisions. Its useful surviving planning signal is only the direction to “**Finish the Allura Memory System first… Defer new board work until the memory system is stable**,” which is compatible with the PRD's `Now/Next/Later` ordering but is not a current status receipt.

5. **The current Engine still carries mixed historical dashboard directions.** Its preserved body includes AionUI, Control Center sunset, fork, and old board plans. The current Blueprint correctly says old Mission, AionUI, or AlluraBoard directions “**do not choose a current design**.” PRD FR-E1–E4 and DOC-02/09 gating are therefore safer than selecting any historical shell.

6. **Notion has not mirrored the 2026-10-20/22 development-readiness packet.** The fetched current navigation pages focus on the 2026-10-18 repair and DOC-06/07. They do not enumerate proposed AD-65–68, DEV-AC01–12, RK-36–40, AD-69/RK-41, or the later backend/preview findings now present in canonical GitHub. Under DOC-01 this is planning/index lag, not a competing contract. The PRD correctly derives these requirements from the canonical repository, but Notion readers may miss them.

7. **Memory-write hold is active and does not alter product approval.** The Engine's 2026-10-21 header says: “**Memory write hold remains active… proposal/approval lineage is unverified… Read-only audit views returned no matching entries; that does not prove underlying approval absence.**” This supports the review's no-Brain-write boundary and is an operational caution, not evidence that the PRD or any semantic record is approved.

#### Unresolved owner decisions

The Notion review does not close any of the following canonical owner decisions:

- **AD-65–68:** capture replay/projection contract, vector workspace authority, governed correction/single-head concurrency, readiness/maintenance evidence and budgets. Status remains **Proposed** in `RISKS-AND-DECISIONS.md` dated 2026-10-20/22.
- **DOC-02:** exact approved visual reference/revision/assets for the first UI story.
- **DOC-03:** restore/rollback behavior versus immutable lineage.
- **DOC-05:** canonical duplicate behavior across distinct approved proposals.
- **DOC-08:** evidence for the curator-first route/delivery decision.
- **DOC-09:** authoritative operational board, sync direction, and conflict rules. The approved routing—Allura status, Notion planning, Brain continuity—does not choose a native board/sync implementation.
- **ENT-01–05:** workspace-specific roles/confidentiality, live restricted-role/RLS proof, complete administration/device/audit flows, production identity/session evidence, and responsive/accessibility evidence.
- **Metric/product budgets:** retrieval quality, latency, scale, admission/retry/retention, and release thresholds.
- **Buyer/commercial persona and pricing/packaging:** absent from the reviewed canonical/private planning set.

**Owners preserved from the canonical decision record:** Sabir owns product choices and approval boundaries; Brooks specifies architecture/boundaries; Woz implements after decisions; Pike/Knuth/Fowler/Hightower and other named lane owners supply independent security, data, quality, and deployment review/evidence. Assignment is not execution or approval.

#### Coverage gaps and limits

- The `Allura Work Items` databases linked from the Engine were **not queried**. Their rows could provide planning context, but DOC-09 is unresolved and database status must not be treated as operational authority.
- `Allura Projects` and `PRD: Team RAM — Real Actual Masters v1.0` were **not fetched** because they concern team/plugin delivery rather than the bounded Allura Memory product PRD. The Engine's current header supplied the only directly relevant memory-write-hold note.
- Historical/recovery duplicates and archive descendants were not fetched after search and Hub lineage identified them as superseded.
- Comments, discussions, external GitHub PR checks, deployment targets, live databases, Brain records, and work-status systems were not inspected. No conclusion about current implementation, deployment, release, or operational status follows.
- The connector responses included complete-looking closing tags and no truncation notices, but did not expose an explicit truncation flag; inaccessible nested content cannot be ruled out.

#### Verdict

**Notion planning supports the PRD's core product contract and authority boundaries, with no current-page contradiction requiring a PRD rewrite.** The PRD is still an **unapproved authoring draft**: Notion confirms the October 18 DOC-01/06/07 planning decisions and the October 21 memory-write hold, but does not approve the PRD, close the canonical owner decisions, establish operational status, or prove implementation/release. The main reconciliation action is to keep historical Notion bodies explicitly non-authoritative and surface the October 20–22 canonical readiness packet to future Notion readers without creating a second engineering specification.

