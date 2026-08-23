# Story 25.1 — Scope and Product Truth Documentation Loop

> [!NOTE]
> **AI-Assisted Documentation** — scaffolded 2026-08-23 from the Notion Epic 25 page and
> verified repository state. Acceptance criteria have not been reviewed by Jobs.

**Status:** Done — independent Pike/Fowler review approved 2026-08-23
**Owner:** Brooks + Jobs
**Depends on:** —
**Blocks:** 25.3, 25.4, 25.5, 25.6, 25.7; unblocks the Done transition for 25.2a

## Outcome

Establish one written, current definition of what the Curator Review Console is, what is
in scope for beta, and what is deliberately excluded — so that no later story infers scope
from presentation text or from a stale document.

## Verified Current-State Facts (2026-08-23, corrected after Scout recon)

> An earlier draft of this section contained four errors, written before the canonical docs
> were read in full. They are corrected below. Evidence:
> `scratchpad/scout-25-1-findings.md`.

- Epic 25 was fully specified in Notion but had no repository planning document until the
  2026-08-23 scaffolding pass, which created
  `_bmad/bmm/planning/epic-25-governed-curator-review-console.md`.
- Story 25.2a is merged (PR #97, `9f8e5dac`) with an APPROVE verdict but is deliberately
  held at dependency-blocked, naming 25.1 as a blocker.
- **CORRECTED.** `docs/allura/REQUIREMENTS-MATRIX.md` is 489 lines. Lines 1–198 are the
  mem0 competitive comparison; **lines 199–489 are a real Business → Functional
  traceability section with B#/F# IDs.** Section 6E (lines 435–443) **already defines
  REQ-CUR-001 through REQ-CUR-010 for the Curator Review Console**, with "25.1" in the
  Trace column. This story completes and verifies that section; it does not create it.
- **CORRECTED.** `sprint-status.yaml` now contains a full `epic_25` block with all eight
  stories, added 2026-08-23. The prior "no 25.x entries" statement described the state
  before that pass.
- **CORRECTED.** All six canonical docs in `docs/allura/` exist and are substantive
  (BLUEPRINT 1018 lines, SOLUTION-ARCHITECTURE 675, DESIGN-ALLURA 897,
  REQUIREMENTS-MATRIX 489, RISKS-AND-DECISIONS 517, DATA-DICTIONARY 1286). None are stubs.
- **NEW FINDING.** `docs/allura/DEVELOPMENT-LOOP.md` **does not exist**, yet both the Notion
  Epic 25 page and the new repository planning doc reference it as canonical. This is a
  dangling reference this story must resolve.
- **NEW FINDING.** AD-58 is **not recorded** in `docs/allura/RISKS-AND-DECISIONS.md`. The
  highest AD there is **AD-56**; the highest risk is **RK-34**. AD-57, AD-58, AD-59, AD-61,
  AD-62, and AD-63 are cited in the epic planning doc and in REQUIREMENTS-MATRIX trace
  columns but were never propagated into the decisions log.
- **NEW FINDING (live drift instance).** The epic planning doc's Stories table omits 25.2a
  from 25.3's blockers, while `_bmad/bmm/stories/25-3-*.md:9` and `sprint-status.yaml` both
  include it. This is exactly the class of drift AC-3 must detect.
- Three drift scripts exist — `scripts/drift-check.sh` (skill-file drift),
  `scripts/run-drift-audit.sh` (Story 21.3 DB/retrieval drift), and
  `scripts/drift-detection.ts` (agent-registry drift, wired as `registry:drift`). **None
  checks story dependency metadata against the epic document.**

## Acceptance Criteria

- [x] A written scope statement defines the beta Curator Review Console in terms of the
      single reviewer workflow: sign in → see tenant/workspace-scoped proposals → inspect
      evidence → record a decision → receive an immutable receipt.
- [x] An explicit out-of-scope list names, at minimum: enterprise SSO/SCIM, broad dashboard
      restoration, polyglot SDKs, agent-framework integrations, and planning loops — each
      with the epic or backlog item that owns it instead.
- [x] Every Epic 25 story file's `Depends on` and `Blocks` lines agree with the epic
      planning document's story table AND with `sprint-status.yaml`. A **new** dependency
      drift check exists — the three existing drift scripts check unrelated surfaces and
      must not be reused. It detects, at minimum, the known live instance: the epic doc
      omits 25.2a from 25.3's blockers while the story file and sprint status include it.
      **Reconciled and tested.** `bun run epic25:drift` exits 0 and focused fixture tests
      cover no-drift, membership, dependency, status, malformed-input, range, and Blocks
      behavior. See Brooks Gate Addendum for the historical handoff attribution.
- [x] `docs/allura/REQUIREMENTS-MATRIX.md` Section 6E (REQ-CUR-001 through REQ-CUR-010) is
      **verified complete and accurate** against the eight scaffolded story files. Every
      REQ-CUR row's Trace column points at a story that exists; every Epic 25 story is
      covered by at least one REQ-CUR row. Gaps are filled; the section is not rewritten
      from scratch.
- [x] `docs/allura/RISKS-AND-DECISIONS.md` records AD-57 through AD-63 — including AD-58,
      Relational Facts Before Semantic Expansion — with Status, Decision, Rationale,
      Alternatives, and References. These are currently cited in the epic doc and matrix
      trace columns but absent from the decisions log, so no reader can resolve them.
- [x] The `docs/allura/DEVELOPMENT-LOOP.md` dangling reference is resolved: the document
      remains intentionally absent under the closed six-document rule, and the repository
      and verified Notion Epic 25 page no longer reference it as canonical. The exact
      Notion/repository ownership reconciliation is recorded and contract-tested below.
- [x] The documentation loop is defined: Notion is canonical for scope, acceptance criteria,
      and decisions; the repository is the versioned implementation/test/commit-evidence
      mirror. Reconcilers and triggers are recorded in the planning document.
- [x] 25.2a's `Depends on` line is re-evaluated against this story's output, and 25.2a's
      status is either advanced with evidence or its remaining blockers are restated
      explicitly.

## Evidence Command

```bash
bun run typecheck && bun run test:unit && bun run epic25:drift
```

The `epic25:drift` script is created by this story and must be wired into `package.json`.
Do **not** substitute `scripts/drift-check.sh`, `scripts/run-drift-audit.sh`, or
`scripts/drift-detection.ts` — all three check unrelated surfaces.

## Notes

This story is documentation-first. The **only** executable artifact it may produce is the
Epic 25 dependency drift checker and its wiring. No application code, no route, no schema
change. An earlier draft of this story said "writes no application code and must not,"
which contradicted its own drift-check acceptance criterion; that contradiction is
resolved here in favor of one narrowly scoped script.

---

## Dev Agent Record

**Agent:** Woz (builder). **Date:** 2026-08-23.

### Implementation Plan (as executed)

1. Read the three canonical inputs in full before writing anything:
   `docs/allura/REQUIREMENTS-MATRIX.md` lines 400-489 (Section 6D/6E),
   `docs/allura/RISKS-AND-DECISIONS.md` (summary table + AD-49/AD-56 detail format, to
   match the existing entry shape), the epic planning doc, all eight `25-*.md` headers,
   and `sprint-status.yaml` lines 289-346.
2. Build the drift checker first (AC-3), because it is the only artifact that can prove
   the rest of the dependency work. Prove it fails on a deliberately introduced drift
   before trusting a pass.
3. Fix every drift finding reachable inside the permitted file boundary.
4. AC-1/AC-2/AC-6/AC-7 into the epic planning doc (not `docs/allura/`, which is closed to
   new files by the canonical-six rule).
5. AC-4 as a row-by-row audit of Section 6E, not a rewrite.
6. AC-5 into `RISKS-AND-DECISIONS.md`, recording unratified decisions as `Proposed` with
   the absence of rationale stated plainly rather than filled in.
7. AC-8 into the 25.2a story file.
8. Run `bun run typecheck`, `bun run test:unit`, `bun run epic25:drift`; report real exit
   codes.

### Completion Notes

**Verification commands and actual exit codes (2026-08-23):**

| Command | Exit code |
|---|---|
| `bun run typecheck` | **0** (`tsc --noEmit`, clean) |
| `bun run test:unit` | **0** (94 files passed, 6 skipped; 1750 tests passed, 160 skipped) |
| `bun run epic25:drift` | **1** at builder handoff - 3 findings remain, all outside the permitted file boundary. **Superseded: now 0.** See Brooks Gate Addendum. |

**AC-1 - satisfied.** Scope statement added to the epic planning doc as "## Beta scope
statement", written as the five-step single-reviewer workflow named in the AC, each step
attributed to the stories that deliver it.

**AC-2 - satisfied.** "## Explicitly out of scope for beta" table in the epic planning
doc. Names all five required exclusions plus four more found during the Section 6E audit.
Owners are sourced, not invented: SSO/SCIM -> AD-61/REQ-ID-001 (proposed story 25.4b, no
story file); broad dashboard restoration -> AD-46 + Section 6D REQ-DASH-001..009; polyglot
SDKs -> Story 24.7; agent-framework integrations -> Story 24.9. **Planning loops have no
owner in this repository** - AD-51..AD-54 point at `epic-level-4-pattern-learning.md`,
which does not exist here. That is recorded as an unowned exclusion rather than assigned
to a fabricated owner.

**AC-3 - NOT COMPLETE.** The checker half is done; the "all three agree" half is not.

- `scripts/check-epic25-drift.ts` written, wired as `"epic25:drift"` in `package.json`.
  It parses the epic planning doc `## Stories` table, every `25-*.md` header, and the
  `epic_25:` block of `sprint-status.yaml`, then compares membership, status (normalised
  across the three vocabularies), `Depends on` (three-way), and `Blocks` (declared vs the
  transitive reverse-closure of the dependency graph). Exits 0 / 1 / 2. It reuses none of
  `scripts/drift-check.sh`, `scripts/run-drift-audit.sh`, or `scripts/drift-detection.ts`.
- **Proven to fail.** The live instance the AC names (epic doc omitting 25.2a from 25.3's
  blockers) was **already fixed in the tree** before this story ran - the AC's premise is
  stale. To prove detection, that exact drift was reintroduced into the epic doc; the
  checker reported `[25.3] Depends-on epic-doc Blocked-by=[24.11, 25.1, 25.2b] !=
  story-file Depends-on=[24.11, 25.1, 25.2a, 25.2b]` and exited 1. The file was then
  restored byte-for-byte from a backup copy and re-verified.
- **Baseline drift found: 8 findings. Fixed: 5. Remaining: 3.**
  Fixed - 25.2a `Blocks` was `25.2-25.6`, referencing a story `25.2` that does not exist
  and omitting 25.7 (now `25.3, 25.4, 25.5, 25.6, 25.7`); epic doc omitted 24.2 and 24.3
  from 25.2a's blockers; epic doc listed no blockers for 25.2b; 25.7's `Depends on` and
  the epic doc's 25.7 row both omitted 25.6.
- **The 3 remaining findings are all fixable by two one-line edits to
  `_bmad/bmm/stories/sprint-status.yaml`, which was outside this story's permitted file
  boundary. They were not made.**
  1. `25.2a` `status: changes-requested` should be `dependency-blocked`. The entry's own
     `status_evidence` says the independent review returned APPROVE and the hold is
     deliberate dependency-blocking - `changes-requested` contradicts its own evidence.
  2. `25.7` `depends_on: ["24.5","24.6","24.8","25.5"]` should include `"25.6"`. Story
     25.7's own acceptance criteria require "record a decision, read the receipt" and
     cover "decision replay"; both are 25.6 deliverables, and 25.7's Notes say it exists
     "as a separate gate rather than folding into 25.6". The 25.7 story file and the epic
     doc were corrected; `sprint-status.yaml` could not be.

**AC-4 - satisfied.** Section 6E audited row by row and completed, not rewritten. Four
defects corrected: (a) heading claimed `REQ-CUR-001-008` with ten rows present; (b) a
blank line split the table so REQ-CUR-009/010 rendered outside it; (c) three Trace cells
cited story `25.2`, which has no story file - the Notion draft's 25.2 was split into 25.2a
and 25.2b with the retrieval/read-contract remainder becoming 25.3, sourced from
`sprint-status.yaml`'s own 25.3 evidence line, so those cells now read `25.3`; (d) stories
**25.2b and 25.7 had no REQ-CUR coverage at all** - REQ-CUR-011 and REQ-CUR-012 were added
to cover them. All ten pre-existing REQ-CUR Trace values were checked against the story
files; all now point at stories that exist, and all eight Epic 25 stories are covered.
The non-`REQ-CUR` rows in the same section (REQ-AST/COP/ID/MTG/MOD/MAP) cite six story
keys that do not exist; that is documented in a note but deliberately left unchanged, as
AC-4 scoped the verification to REQ-CUR rows.

**AC-5 - satisfied, with the honesty caveat the AC's own wording invites.** AD-57 through
AD-63 are now recorded in `RISKS-AND-DECISIONS.md` - seven summary-table rows plus three
detail sections, matching the existing AD-49/AD-56 entry format.
- **AD-58 is the only one with real sourced content.** Status `Accepted`. Decision,
  rationale, alternatives, consequences, owner, and references are recorded; the source is
  the epic planning doc's AD-58 section, including the `SemanticProjection` addition.
- **AD-57, AD-59, AD-61, AD-62, AD-63 are recorded as `Proposed`.** Their decision
  statements are reverse-engineered from the requirement rows that cite them. **Rationale
  and alternatives do not exist anywhere in this repository and were not invented.** Each
  entry says so explicitly and carries an "Action required" line.
- **AD-60 is cited nowhere in the repository at all.** Recorded as `Proposed`/reserved with
  no content, so the number is not silently reused.

**AC-6 - NOT COMPLETE, and it collides with a project invariant.**
- `docs/allura/DEVELOPMENT-LOOP.md` **was not created.** Creating it would violate the
  Canonical Surface Rule in `guidelines/AI-GUIDELINES.md`, which permits exactly six files
  under `docs/allura/`. **Reporting the conflict rather than silently violating the rule.**
- The repository-side dangling reference **was removed** from the epic planning doc's
  References section and replaced with an explanation of where the content actually lives
  (the "Delivery loop" and new "Documentation loop" sections of that same doc).
- **The identical reference on the Notion Epic 25 page was NOT removed.** Modifying Notion
  content was outside this story's authorisation. Until that is done, the AC's "every
  reference ... in the epic planning doc and Notion is removed" is not met.

**AC-7 - satisfied as written, recorded as Proposed.** "## Documentation loop" added to the
epic planning doc: canonical artifact per concern, named reconciler, and trigger, in three
tables. The split is resolved in one direction - **the repository is canonical for Epic 25
delivery state** (story membership, status, dependency edges), on the ground that a
canonical source no automated gate can read cannot be canonical for delivery; Notion stays
canonical for epic intent and stakeholder narrative. **It is recorded with Status:
Proposed. Brooks and Jobs have not ratified it, and this story did not have standing to
ratify it for them.**

**AC-8 - satisfied.** A "Dependency Re-evaluation" section was added to
`25-2a-workspace-evidence-lifecycle-foundation.md`. 25.2a is **not advanced**; its status
stays `dependency-blocked`. Its three remaining blockers are restated explicitly, with the
two exact `sprint-status.yaml` edits needed to green the drift gate. The `**Depends on:**`
header line was deliberately left unchanged, because it is the dependency edge the drift
checker compares against the other two sources.

### Known limitations of the drift checker

- `Blocks` is compared against the **transitive** reverse-closure of the dependency graph,
  because the story files declare it transitively (25.1 lists 25.3-25.7, not just its
  direct dependents). A story that intends to declare only direct blocks will be flagged.
- The `sprint-status.yaml` parser is a targeted reader for the known `epic_25:` shape, not
  a general YAML parser. It exits 2 if the block is missing or yields no stories.
- The checker validates Epic 25 only. Cross-epic keys (24.x) are compared as opaque tokens
  and are not checked against Epic 24 artifacts.

### File List

| File | Change |
|---|---|
| `scripts/check-epic25-drift.ts` | **New.** 515 lines. Epic 25 dependency drift checker. |
| `package.json` | Line 65: added `"epic25:drift": "bun run scripts/check-epic25-drift.ts"`. |
| `_bmad/bmm/planning/epic-25-governed-curator-review-console.md` | Added "## Beta scope statement" and "## Explicitly out of scope for beta" (before "## Delivery loop"); added "## Documentation loop" (before "## Guardrails"); Stories table rows for 25.2a, 25.2b, 25.7 corrected; References `DEVELOPMENT-LOOP.md` entry replaced. |
| `docs/allura/REQUIREMENTS-MATRIX.md` | Section 6E: heading corrected, verification note added, table break closed, three `25.2` Trace cells repointed to `25.3`, REQ-CUR-011 and REQ-CUR-012 added. |
| `docs/allura/RISKS-AND-DECISIONS.md` | Summary table lines 72-78: AD-57..AD-63 rows. Detail sections added before "## References": "AD-57", "AD-58", "AD-59, AD-60, AD-61, AD-62, AD-63". |
| `_bmad/bmm/stories/25-1-scope-product-truth-documentation-loop.md` | AC checkboxes, this Dev Agent Record. |
| `_bmad/bmm/stories/25-2a-workspace-evidence-lifecycle-foundation.md` | `**Blocks:**` corrected; "## Dependency Re-evaluation" section added. |
| `_bmad/bmm/stories/25-7-security-accessibility-demo-gate.md` | `**Depends on:**` gained `25.6`. |

**Not touched, by instruction:** `src/`, `docker/`, any `*.test.ts`, `src/lib/memory/`,
`src/curator/`, `docker/postgres-init/`. **Also not touched, and this is the reason the
drift gate is red:** `_bmad/bmm/stories/sprint-status.yaml`.

### Story status (as reported by the builder at handoff)

**Not Done.** Six of eight acceptance criteria are satisfied. AC-3 and AC-6 are not, for
the reasons above. Both remaining AC-3 findings and the Notion half of AC-6 need an editor
with a wider file/system boundary than this story was given.

---

## Brooks Gate Addendum (2026-08-23, after builder handoff)

Everything above this line is the builder's record at the moment it stopped, and was
accurate then. This section records what changed afterwards, so the two are not confused.

**Why this section exists.** Both review gates (Pike and Fowler) independently raised the
same HIGH finding: the Completion Notes state that `sprint-status.yaml` was "not touched"
and that `epic25:drift` exits 1, while the working tree shows the file modified and the
gate passing. That contradiction was **created by Brooks, not by the builder.** The builder
was correctly forbidden from editing `sprint-status.yaml`; Brooks owns status transitions
under the sprint-loop contract and closed the three findings after handoff. Rather than
rewrite the builder's notes to look as though it did more than it did, the sequence is
recorded here.

**Edits made by Brooks to `_bmad/bmm/stories/sprint-status.yaml`:**

1. `25.2a` `status:` `changes-requested` -> `dependency-blocked`. The prior value
   contradicted the story's own `status_evidence`, which records that the independent
   Pike/Fowler/Knuth review returned APPROVE. The hold is a deliberate dependency block,
   not a rejection.
2. `25.7` `depends_on:` gained `"25.6"`. Story 25.7's acceptance criteria require recording
   a decision, reading the receipt, and testing decision replay — all Story 25.6
   deliverables. The omission was a Stage 0 scaffolding error by Brooks.
3. `status_evidence` on both entries records the change and its reason.

**Verified after those edits:** `python3 -c "yaml.safe_load(...)"` parses;
`bun run epic25:drift` exits **0** — "PASS - no drift. All three sources agree on status,
Depends-on, and Blocks."

**AC-3 is therefore satisfied**, by two hands rather than one. AC-6 remains **not
satisfied** and the builder's analysis of it stands unchanged: creating
`docs/allura/DEVELOPMENT-LOOP.md` would add a seventh file to a directory the Canonical
Surface Rule in `guidelines/AI-GUIDELINES.md` closes at six. The repository-side dangling
reference was removed; the identical Notion reference was not, because no agent in this
loop is authorised to modify Notion.

**Process lesson for the loop.** An orchestrator that edits the tree after a builder hands
off invalidates that builder's evidence table. Either the orchestrator makes its edits
before handoff, or it records them in a separate addendum like this one. Silently editing
the builder's notes to match would have produced exactly the doc-versus-reality drift this
story exists to prevent.

### Brooks Gate Addendum — Reconciliation Update (2026-08-23)

This update extends, rather than rewrites, the builder's historical red handoff and the
first Brooks addendum above. The canonical Notion Epic 25 page was subsequently verified at
[page ID `3c41d9be-65b3-819b-96c6-c9d14a3424ea`](https://app.notion.com/p/3c41d9be65b3819b96c6c9d14a3424ea?pvs=204):
Notion is canonical for scope, acceptance criteria, and decisions; the repository is its
versioned implementation/test/commit-evidence mirror. The dangling documentation-loop
reference has been removed from both sources; no seventh `docs/allura/` artifact is created.

**Verified current result:** `bun run epic25:drift` exits 0, and `bun run
test:epic25:drift` passes the checker fixtures plus the documentation-loop contract. AC-6
and AC-7 are therefore advanced above based on exact repository/Notion reconciliation and
durable tests. **Story 25.1 remains `ready-for-dev`, not Done:** independent review is still
required before any Done claim.
