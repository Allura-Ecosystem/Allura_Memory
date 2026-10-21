# Reddit feedback: documentation and first-use repair

> AI-Assisted Documentation: initial audit and delivery packet, 2026-10-20. The baseline findings below describe the initial inspection. Current changes and remaining evidence are tracked in the [execution checklist](reddit-remediation/execution-checklist.md), [README disposition](reddit-remediation/readme-disposition.md), [visual disposition](reddit-remediation/visual-disposition.md), and [new educational explainers](../readme/first-use/README.md). Local drafts are not release receipts. Notion has not been synced.

## What the feedback requires

The supplied [Reddit discussion](https://www.reddit.com/r/BMAD_Method/comments/1w9avgz/comment/p8mzut0/?context=3) asks for a clear benefit, less reading, less choice overload, and a usable journey. Defending the existence of governance controls does not demonstrate that the product is easy to use. The pasted transcript is the source reviewed; fetching the Reddit page failed. The exact cause of the historical 404 is unconfirmed.

Scope: all tracked README documents, explanatory visual collections, and active product/engineering plans in Allura_Memory. Other Allura repositories and external publications need separate inventories; they are not covered by this receipt. Existing historical evidence and third-party documentation should not be silently rewritten as current marketing.

## Initial findings at the inspected working revision

Base commit: `28d90e843`; the working tree already contains unrelated implementation and canonical-document edits. This audit reads those edits as working evidence, not published GitHub state.

- Root README: 463 lines, nine navigation choices, twelve infographic panels before Getting started. It leads with infrastructure and portfolio material before a specific user outcome.
- Portfolio README: three dashboard screenshots and a six-panel infographic gallery; engineering depth is presented as an entry journey.
- Installation guide: retired Neo4j setup, obsolete clone owner, automatic-promotion language, and a fresh-write/default-search example that needs reconciliation. No clean-install execution was performed.
- Blueprint: the 2026-10 enterprise brief coexists with an older community-organizer persona and belonging-focused brand promise. Audience and product scope conflict.
- Existing REQ-UX-001 already calls for plain copy and progressive disclosure; the missing piece is observed README comprehension and first-use evidence.
- Existing visual QA validates brand/presentation properties. That does not establish comprehension or first-use success. Two representative PNGs were visually inspected; remaining assets are inventoried, not individually approved.
- Brain search in allura-system returned historical imagery/branding records, including `gm-20128` (2026-08-04). Those records do not establish completion of this Reddit remediation.

## One proposed communication contract

Primary reader: a developer or team evaluating persistent project context for AI agents. The enterprise operator, reviewer, and engineering-portfolio reader get deeper paths after this reader understands the core job. This is a proposed resolution of the audience conflict, not an approved replacement brand strategy.

Opening promise: **Project memory your AI agents can return to.**

Example: save a project decision with its reason, then retrieve it in a later session. Clearly separate saved history from human-approved shared knowledge. Explain that agents/integrations must call the service; do not imply installation captures everything or guarantees adherence.

Routine persistence and retrieval should not require the person to browse governance dashboards. Human decisions remain explicit at the relevant promotion boundary. Capture, indexing, retrieval, review, service operations, and optional inspections each need a named responsible party and an honest account of their manual cost.

Productivity improvement remains a hypothesis until measured. Control descriptions must not imply certification or legal sufficiency. Prior regulatory assertions in the Reddit replies need a separate qualified claims review before reuse.

## Delivery sequence and proposed ownership

| Order | Deliverable | Proposed owner | Acceptance evidence | State |
|---|---|---|---|---|
| 1 | Root README: plain benefit, one scenario, one primary action, automation/human split, visible limits | Brooks coordinates editorial draft | Link check, claim review, independent reader review | Local draft this turn; human comprehension untested |
| 2 | One supported installation and first-memory journey; reconcile guide and SDK example | RAM implementation owner + independent reviewer | Current docs/source check, clean setup, authenticated save and retrieval with source/review state; failure recovery | Open; must precede any “easy to start” claim |
| 3 | Audience and product boundary across canonical plans | Brooks + proposed Durham strategy owner | Resolve enterprise/developer/community-persona conflict; approved common brief | Proposed |
| 4 | README sweep from inventory below | Editorial owner + technical owners | Each file marked keep/rewrite/move/retire with reason, working links and tested examples where applicable | Inventoried; not rewritten |
| 5 | Infographic simplification and source/export alignment | Proposed Durham visual owner + independent QA | One question per visual; readable phone/desktop exports; concrete flow and human decision; cited current evidence | Root embeds removed; redesign pending |
| 6 | First-use evaluation and publication | Product owner + actual external participants | Five observed users, recorded failures, revised artifacts, retest, versioned published links | Not run or published |

Named future owners are routing proposals, not claims that those agents ran. A real Scout was invoked for this audit. No UI design approval, Notion status change, runtime mutation, or semantic promotion is implied.

## Visual inventory and disposition

| Collection | Planned treatment | Validation required |
|---|---|---|
| `docs/readme/evidence-explainers/` (six PNGs) | Remove from root reading path; review for retirement or one focused replacement | Review every claim, phone legibility, human-review wording; identify editable source before rebuilding |
| `docs/portfolio/allura-agentic-framework-harness/infographics/` (six SVG/PNG pairs) | Keep technical detail behind a deliberate portfolio/architecture link; reassess each asset | Review SVG and PNG together; remove claims broader than current implementation |
| `docs/portfolio/allura-agentic-framework-harness/evidence-infographics/` (six SVG/PNG pairs) | Consolidate overlapping messages; one practical question per retained graphic | Match titles/descriptions/alt text/source strips to final flow and evidence |
| `public/readme/` (hero, brain, flow, infographic and lifecycle images) | Trace incoming links; retain brand wordmark; classify unused/legacy graphics | Do not delete assets still referenced by other documents; record replacement mapping |
| Portfolio screenshots, deck and interactive demo | Keep synthetic/portfolio labels; review against the same journey after audience approval | Inspect exports and actual entry flow; deck edit requires presentation workflow |
| Diagrams embedded in canonical six and FRAMEWORK.md | Preserve technical detail where it answers an engineering question | Reconcile system boundary, intended vs implemented state, and approval semantics |

Update the generator as well as exported assets when a collection changes. Known generators: `docs/portfolio/allura-agentic-framework-harness/build-assets.mjs` owns the first portfolio set; `build-allura-evidence-infographics.mjs` owns the evidence set; `build-deck.mjs` consumes the first set. `.github/REPOSITORY_SETTINGS.md` also points to the legacy social-preview hero. Existing validator: `docs/portfolio/allura-agentic-framework-harness/qa/validate-infographics.mjs`. Confirm which output set each owns before editing. Brand QA alone cannot close UX acceptance.

## Plan changes to carry into the existing canonical six

| Document | Required reconciliation |
|---|---|
| BLUEPRINT | Resolve target reader, core job and conflicting persona; define the smallest useful memory journey and its manual cost |
| SOLUTION-ARCHITECTURE | Keep memory service, orchestration integrations, portfolio specimen and operational dashboard boundaries explicit |
| DESIGN-ALLURA | Progressive disclosure by task; defaults, human decisions, empty/error/recovery states; exact approved visual references |
| REQUIREMENTS-MATRIX | Add measurable comprehension, first-use, review-boundary and visual-legibility acceptance with evidence state |
| RISKS-AND-DECISIONS | Record audience contradiction, stale setup, unsupported claims and review workload; preserve unresolved decisions |
| DATA-DICTIONARY | Reconcile labels used in the journey with actual persisted entities; no new fields or schema change implied |

Preserve existing engineering requirements and approved DOC decisions. The proposed UX criteria supplement correctness and access controls. Do not replace approved product intent with whatever code currently happens to do. Do not create a seventh canonical specification.

## Proposed acceptance criteria

These are evaluation targets, not measurements already obtained or newly approved product requirements.

- **UX-R01 / comprehension:** at least four of five unfamiliar intended readers explain what Allura does, who it is for, and its next step after 30 seconds. Record each response without coaching.
- **UX-R02 / first use:** at least four of five intended evaluators complete the defined setup/save/retrieve task without facilitator intervention. Record time, errors and help requests; establish baseline before promising a speed target.
- **UX-R03 / human boundary:** all five can distinguish saved evidence from approved knowledge and identify who authorizes promotion. Any dangerous misunderstanding requires revision and retest.
- **UX-R04 / progressive disclosure:** root reading path has one primary action and at most one explanatory image; technical controls remain accessible by task. No required infographic gallery before starting.
- **UX-R05 / visuals:** each retained graphic answers one named reader question. Inspect at desktop width and 390px phone width without unreadable text or horizontal scrolling; provide equivalent meaningful text.
- **UX-R06 / burden and recovery:** measure manual steps, review effort and failure recovery in the observed journey. Do not claim that memory “manages itself” without naming agent setup, operations and human review responsibilities.
- **UX-R07 / claim and publication integrity:** claims have a current source/revision and state; public links work without repository credentials; final PNG/SVG/deck/README agree. Publication is checked after merge/deploy, not inferred from local edits.

Five users provide a small formative study, not statistical proof of productivity or market fit. Recruit from the chosen audience; synthetic agent reviews cannot count as human participants.

## Complete tracked README disposition inventory

Every row below is covered by the plan. “Review” is not a claim that the file has already been corrected. This inventory contains 29 README.md files plus BENCHMARK-README.md (30 documents). Hidden runtime documentation requires the repository's Context7 gate before edits.

| File | Disposition / responsibility |
|---|---|
| `.claude/README.md` | Review runtime-specific onboarding; source/API verification before any command changes |
| `.claude/skills/context7/README.md` | Review provenance and current relevance; preserve upstream/compatibility purpose |
| `.opencode/README.md` | Review runtime-specific onboarding; source/API verification before any command changes |
| `.opencode/command/openagents/README.md` | Review runtime-specific onboarding; source/API verification before any command changes |
| `.opencode/skills/context7/README.md` | Review provenance and current relevance; preserve upstream/compatibility purpose |
| `README.md` | Rewritten local entry draft; comprehension and publication pending |
| `_bmad/bmm/planning/profiles/README.md` | Review provenance and current relevance; preserve upstream/compatibility purpose |
| `_bmad/bmm/v6-shims/README.md` | Review provenance and current relevance; preserve upstream/compatibility purpose |
| `_bmad/core/v6-shims/README.md` | Review provenance and current relevance; preserve upstream/compatibility purpose |
| `docs/archive/allura/superpowers/README.md` | Keep fixture/history; exclude from current entry path and preserve context |
| `docs/design/command-center/README.md` | Review intended reader, current role, links and task-specific next action |
| `docs/plugins/bumblebee/README.md` | Review intended reader, current role, links and task-specific next action |
| `docs/portfolio/allura-agentic-framework-harness/README.md` | Review portfolio purpose, synthetic labels, repeated imagery and entry burden |
| `docs/portfolio/allura-agentic-framework-harness/evidence-infographics/README.md` | Review portfolio purpose, synthetic labels, repeated imagery and entry burden |
| `docs/portfolio/allura-agentic-framework-harness/interactive-demo/README.md` | Review portfolio purpose, synthetic labels, repeated imagery and entry burden |
| `docs/reference/persona-rollout-20261018/README.md` | Review intended reader, current role, links and task-specific next action |
| `examples/controlled-research-agent/README.md` | Review one task, prerequisites, expected result and failure recovery; execute example before recommending |
| `examples/engineering-review-agent/README.md` | Review one task, prerequisites, expected result and failure recovery; execute example before recommending |
| `examples/quickstart/README.md` | Review one task, prerequisites, expected result and failure recovery; execute example before recommending |
| `examples/regulated-document-quality/README.md` | Review one task, prerequisites, expected result and failure recovery; execute example before recommending |
| `packages/mcp-server/README.md` | Review developer contract; keep technical depth, validate examples and link to common setup |
| `packages/rbac/README.md` | Review developer contract; keep technical depth, validate examples and link to common setup |
| `packages/ruvector-adapter/README.md` | Review developer contract; keep technical depth, validate examples and link to common setup |
| `packages/sdk/README.md` | Review developer contract; keep technical depth, validate examples and link to common setup |
| `packages/types/README.md` | Review developer contract; keep technical depth, validate examples and link to common setup |
| `src/__benchmarks__/BENCHMARK-README.md` | Review intended reader, current role, links and task-specific next action |
| `src/lib/graph-adapter/vendor/README.md` | Review provenance and current relevance; preserve upstream/compatibility purpose |
| `src/lib/session/README.md` | Review intended reader, current role, links and task-specific next action |
| `tests/fixtures/docs-sample/docs/roninmemory/README.md` | Keep fixture/history; exclude from current entry path and preserve context |
| `tests/load/README.md` | Review intended reader, current role, links and task-specific next action |

## Receipt and limits

This packet preserves the initial audit and proposed targets. The execution checklist and linked dispositions own the current remediation evidence. A new three-topic explainer set and active README corrections are now prepared; they do not establish live first-use success, human-study results or publication. Original technical graphics remain available as optional/historical references. The active Notion board and operational product UI have not been changed by this documentation slice.
