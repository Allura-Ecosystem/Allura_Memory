# PRD Quality Review — Allura Memory Brownfield Product Contract

## Overall verdict
This is a disciplined, substantive brownfield companion/index: it states its authority limits, preserves the governed memory thesis, separates claim states, and is unusually honest about unresolved decisions and unverified source presence. It is not yet a decision-complete or downstream-self-sufficient PRD, chiefly because owner decisions are listed as bare IDs and the local FRs do not map one-to-one to canonical acceptance evidence; those gaps are material even though the document correctly refuses to claim implementation readiness.

## Decision-readiness — thin
The draft makes the most important meta-decision clear: it is unapproved, does not replace the six canonical specifications, and does not authorize implementation (§0, lines 14–22). It also names blocked requirements at the point of impact—for example AD-65 on FR-A3, AD-66 on FR-C2, and AD-67/DOC-03/05 on FR-B5 (§3, lines 62–85)—and explicitly prohibits starting decision-blocked stories (§5, lines 121–123). Those are useful stop/go controls.

However, the decision-maker cannot resolve the outstanding choices from this entry point. The “Owner decisions” line is only a list of IDs—AD-65–68, DOC-02/03/05/08/09, ENT-01–05, and metric budgets—without the question, available choices, trade-off, decision owner, or affected scope (§7, lines 133–139). That is appropriate evidence of uncertainty, but too thin for the stated purpose of a coherent review entry point.

### Findings
- **high** Owner decisions are discoverable but not actionable (§7, lines 133–139; §3, lines 64, 72, 77, 83–85, 92) — Bare identifiers show where work is blocked but do not let Sabir/Jobs understand or resolve the tension without independently reconstructing it from the canonical set. *Fix:* add a compact decision index sourced verbatim from the canonical documents with ID, one-sentence question, currently documented options/trade-off, owner, affected FRs, and required-by gate; do not choose an option or invent missing choices.

## Substance over theater — strong
The content is earned. The vision is product-specific—MCP/API-first, self-hosted, governed evidence-to-proposal-to-human-promotion-to-immutable-version retrieval (§1, lines 24–26)—and could not be swapped into a generic memory-product PRD. The listed actors drive concrete authority boundaries and journeys rather than decorative biographies (§1.1–1.2, lines 28–44); the undefined buyer and historical Maya persona are explicitly marked as unresolved/non-primary rather than padded into invented personas (lines 35–36).

The NFRs likewise encode Allura-specific invariants: zero cross-scope results, immutable content and receipts, explicit unknown outcomes, redacted low-cardinality telemetry, reproducible evidence, and nonconflated claim states (§4, lines 102–113). The draft avoids fabricated scale, compliance, or launch claims and says that no numeric SLO or compliance target has been adopted.

### Findings
No substantive-theater finding.

## Strategic coherence — adequate
The document has a clear thesis: trusted memory is not raw persistence but governed promotion and scope-safe retrieval, with human independence, immutable versions, provenance, and truthful operational claims. Features A–F consistently follow that arc, and the Now/Next/Later sequence keeps the core data plane ahead of deferred work-plane and personal-AI-OS ambitions (§3–§5, lines 58–127). Counter-metrics are unusually coherent with the thesis: success may not be raised through broader fallback, bypassed review, fabricated scope, silent degradation, history deletion, or false remote-sync claims (§6, lines 129–131).

The weakness is that “Success evidence” is an acceptance-evidence gate, not yet a product-success measure. DEV/CF/BE acceptance sets can prove implementation and claim truthfulness, but they do not by themselves test whether the product thesis delivers useful, current governed continuity; the draft acknowledges that metric budgets remain an owner decision (§3, line 85; §4, line 113; §7, line 136). For an unapproved companion this is acceptable, but it prevents a strong strategic-coherence verdict.

### Findings
- **medium** Acceptance evidence and product success are conflated by the section label (§6, lines 129–131; §3, line 85; §4, line 113) — Revision-bound test evidence proves that requirements and claims are satisfied, but it does not define how the owner will judge the usefulness of governed retrieval. *Fix:* rename the current section to “Acceptance and release evidence,” add a separate explicitly unresolved “Product success measures” subsection, and link it to the existing metric-budget owner decision; do not invent thresholds or launch metrics.

## Done-ness clarity — thin
Several requirements contain testable consequences directly: same-key changed payload conflicts (FR-A3), stale exact-version review must reject (FR-B3), denial must not widen fallback (FR-C2), remote `synced` requires destination read-back (FR-D2), and foreign workspace results must remain zero (NFR-1). The document also points to canonical DEV-AC01–12, CF-AC01–05, and BE-AC01–09 as the accepted evidence corpus (§6, lines 129–131).

But most FRs are compact preservation statements followed by broad source ranges, not self-contained done conditions. Examples include “append evidence through the five core memory contracts” (FR-A1), “retrieve through controlled MCP/API services” (FR-C1), and “maintain stable … compatibility through inventory and packed-consumer evidence” (FR-F1) (§3, lines 62, 76, 97). The aggregate AC citation in §6 does not show which acceptance row closes which FR, so story creation cannot reliably determine completion without reconstructing traceability across the six specifications.

### Findings
- **high** Local FRs lack one-to-one acceptance traceability (§3, lines 58–100; §6, lines 129–131) — The PRD names canonical requirement and AC families, but it does not map each FR to the exact canonical acceptance condition(s), evidence class, or blocking decision. This makes “done” reconstruction-heavy and risks inconsistent story acceptance. *Fix:* add a traceability table mapping every FR to exact canonical source IDs, exact applicable AC IDs, evidence required, and any decision blocker; preserve canonical wording and IDs rather than duplicating or creating requirements.
- **medium** Accessibility and responsive done conditions remain adjectival at the PRD layer (FR-E2 and NFR-6, lines 91 and 109) — “responsive/accessibility behavior,” “screen-reader readable,” and “contrast safe” do not state the bound that a downstream implementer should verify. *Fix:* cite the exact existing CF acceptance conditions or canonical accessibility standard/breakpoint evidence beside FR-E2/NFR-6; if the canonical set has no bound, mark that bound as an owner decision instead of inventing one.

## Scope honesty — strong
Scope handling is a major strength. The opening warning distinguishes authoring intent from readiness, excludes status and planning mutations, and states that product tests were not executed (lines 14–16). Claim states are explicitly separated (§0, line 22), the optional command center is kept outside the core engine (§1, line 26), and Now/Next/Later distinguishes source-present scope, backlog, and uncommitted intent (§5, lines 115–127). The document also preserves operational routing without pretending that failed recall or unavailable status capability proves absence (§7, lines 133–139).

Omissions are not silently smoothed over: buyer definition, metric budgets, remote authority, work-board behavior, and enterprise roles are called out as owner decisions or blockers. Although there is no dedicated “Non-Goals” heading, the boundary statements in §§0, 1, 3F, and 5 perform that function for this companion/index.

### Findings
No material scope-honesty finding; the Assumptions Index roundtrip issue is recorded under Mechanical notes.

## Downstream usability — thin
The glossary is compact and domain-specific (§2, lines 46–56), local UJ/FR/NFR identifiers are unique and contiguous within their series, and most journeys name a role carrying the relevant authority context (§1.2, lines 38–44). Requirements also retain canonical namespaces rather than laundering them into new IDs, which is the right choice for a companion to six authoritative documents (§0, lines 18–22).

The entry point is nevertheless not cleanly source-extractable on its own. It says the six authoritative files are “listed in Blueprint lines 851–876” rather than listing their repository paths (§0, line 20), while FRs mix references such as `B2`, `BP-F60`, `DOC-06`, “architecture constraint §6,” and Data Dictionary table names without a local source map (§3, lines 62–100). Combined with the missing FR-to-AC mapping, downstream UX, architecture, or story workflows must first rediscover which file owns each namespace and which acceptance conditions apply.

### Findings
- **high** Canonical citations are not locally resolvable from the companion (§0, line 20; §3, lines 62–100) — Referring readers to a line range in Blueprint to discover the six files undermines the PRD’s role as the brownfield entry point and makes source extraction brittle when line numbers move. *Fix:* add a six-row canonical source map with stable repository path, authority/topic, and namespaces owned; keep all requirements and decisions in their existing canonical files.
- **medium** UJ-5 is a system scenario rather than a named-protagonist journey (§1.2, line 44) — “Remote projection remains honest” describes a projection invariant but does not name who initiates the action or needs the outcome, unlike UJ-1 through UJ-4. *Fix:* either name the existing-source protagonist (only if the canonical journey identifies one) and carry that context inline, or relabel UJ-5 as a system/operational scenario rather than inventing a persona.

## Shape fit — strong
The shape fits a high-stakes brownfield governed MCP/API memory platform. It uses a capability-contract structure rather than consumer-product ceremony, but includes a small number of journeys where multi-role authority and failure paths are load-bearing (§1.2). It explicitly distinguishes existing-source behavior, source-present evidence, verification, and release; identifies the inspected revision in frontmatter; and preserves the PRD as a companion/index instead of forcing a seventh competing specification (§0, lines 1–22).

The document is neither over-formalized with persona narratives nor under-formalized about governance, isolation, lineage, replay, remote observation, and claim truthfulness. Its remaining weaknesses are traceability and decision packaging, not a mismatch between template and product.

### Findings
No shape-fit finding.

## Mechanical notes
- **low** Assumptions Index does not roundtrip to inline assumption tags (§7, line 139) — The three indexed assumptions do not appear as `[ASSUMPTION: …]` tags at their first relevant locations, so the index cannot be mechanically checked against the body. *Fix:* either add matching inline tags at the relevant authority/audience/source-present statements or rename these entries as declared constraints if they are already canonical facts; keep a one-to-one index.
- **low** One journey lacks a named protagonist (§1.2, line 44) — UJ-1 through UJ-4 identify a developer, reviewer, operator, or viewer; UJ-5 does not. *Fix:* apply the UJ-5 fix under Downstream usability.
- **medium** Cross-reference resolution depends on an unstable line pointer and implicit namespace knowledge (§0, line 20; §3, lines 62–100) — Local IDs are continuous (`UJ-1`–`UJ-5`, `FR-A1`–`FR-F4` within feature groups, `NFR-1`–`NFR-8`), but canonical targets cannot all be resolved from this document. *Fix:* add the stable canonical source map and FR-to-AC traceability table described above.
- Glossary usage is materially consistent: “evidence,” “proposal,” “semantic version,” “governance receipt,” “delivery observation,” “authority,” “current knowledge,” and “source-present” retain their defined meanings across the requirements.
- Required shape elements are present for the agreed brownfield companion role. A dedicated Non-Goals section is optional here because explicit boundary, deferred-scope, and non-readiness statements already carry the omission burden.
