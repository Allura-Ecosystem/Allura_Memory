# Epic 30 Durham Final UX Direction Review — e7aa0271

Date: 2026-09-27
Reviewer: Brand Orchestrator (Kotler), Team Durham — final UX direction review of the user-approved post-fix candidate.
Gate type: **AI direction review. NOT human accessibility sign-off. NOT release sign-off. NOT Story 30.2 approval.**
Scope discipline: read-only on product source; local files only. No MCP, Brain, web, network, skills, delegation, production, credentials, or live DB used. No test re-execution (read-only constraint). Only this report was written; no other file edited, no commit, no push.

## Roles used

Kotler (brand-orchestrator) performed the entire final review, applying the Glaser
(visual direction) and Munari (consistency/accessibility) lenses inline. No specialist
subagent was dispatched; no specialist ran. The Jobs final approval gate
(`epic30-jobs-final-approval-e7aa0271.md`, VERDICT: CLEAR, same day) is cited as
recorded evidence and was independently cross-checked, not re-run.

Lens provenance: the instructed "canonical Team Durham brand-orchestrator lens at pinned
source commit `75ee7eb`" does **not resolve in this repository's object store**
(`git cat-file -t 75ee7eb` → invalid; absent from `git log --all`). No fetch was attempted
(network banned). This review proceeded under the brand-orchestrator role definition
active in this session (Kotler role card, Team Durham brand-orchestrator). Disclosed as a
provenance gap, not treated as a blocker; if `75ee7eb` lives in another repository, its
content was not loaded.

## Exact candidate and hashes (verified this review)

| Item | Value | Verification |
|---|---|---|
| Candidate HEAD | `fe736755b5339c5cbc7116838d6f5d32344bb1e7` | `git rev-parse HEAD` → identical ✅ |
| TSX SHA-256 (working tree) | `e7aa0271173251cbfc650a5d08b3fa36f632eeafb1a45cff12c23712236a41bb` | `sha256sum` → identical to pinned ✅ |
| CSS SHA-256 (working tree) | `f3ef751984d4f714e7399db56332e6d8d7be54e719238a8bc6b0edbb2a822aa6` | `sha256sum` → identical to pinned ✅ |
| TSX SHA-256 (committed at HEAD) | `f56ca1b137bf3bfd835ccc3dbd8da37b59c42417a4a36da2aba5f1d36d586ee8` | `git show HEAD:…tsx` — matches the Durham pre-fix report's reviewed hash ✅ |
| CSS SHA-256 (committed at HEAD) | `eb0612ae5f8345a10ca4dba327d1024aa8fd216833007eb096a93dcdcd92bdc4` | `git show HEAD:…css` — matches the Durham pre-fix report's reviewed hash ✅ |

Provenance is therefore confirmed end-to-end: the Durham pre-fix report
(`epic30-durham-ux-direction-fe736755.md`, RECOMMEND conditional) reviewed the committed
state at HEAD `fe736755`; the pinned hashes are the user-approved post-fix working-tree
delta on top of that HEAD; the Jobs gate cleared that exact post-fix state.

Git state note: 17 dirty entries observed — 3 candidate files (component TSX, module CSS,
component test) and 2 untracked review reports (the Durham pre-fix report and the Jobs
receipt; 16 at Jobs's run time, its own receipt being the 17th). The remaining 12 modified
files are harness/config files (10 agent-definition `.md` files, `.opencode/config.json`,
`opencode.json`) outside this review's scope; **not inspected**, per the bounded read list.

## Durham pre-fix findings — resolution confirmation (verified against the final diff)

The final diff (HEAD → pinned candidate) touches exactly three files:
15 insertions, 46 deletions — matching the Jobs receipt's count exactly. No scope creep.

### Finding 1 — Brand name casing and accessible name: **RESOLVED**

- Tree brand block: `ALLURA` → `allura` (tsx line 287). Lowercase copy rule satisfied.
- Icon-rail control: `aria-label="Ask Allura"` → `aria-label="Ask allura"` (tsx line 282),
  now consistent with the visible "Ask allura" control (tsx line 404).
- Checked and fine: the lettermark `alt="Allura"` (tsx line 279) names the logo asset —
  permitted in asset/title context; uppercase UI eyebrows ("MY WORK", "YOUR BRAIN",
  "CONTEXT MAP") are chrome labels, not the brand name.

### Finding 2 — Search affordance vs. approved baseline: **RESOLVED (disabled-state option)**

The candidate takes Durham's no-variance-required option — restore the disabled state:

- Search input is `disabled` with `title="Search is not enabled"` (tsx line 291), matching
  the approved packet's "Search remains disabled" pending authorized search (Story 30.8).
- The entire client-side filter path is removed: `searchQuery` state,
  `normalizedSearch`/`searchDocuments`/`hasSearchMatches`, the `role="status"` "No
  authorized matches." surface, the `.searchStatus` CSS rule, the `hidden` tree-section
  toggles, and the "No private matches"/"No department matches" conditional copy.
- The trail and the artifact now agree; no variance record is required.
- The test file locks the behavior: "keeps Search disabled and unavailable pending
  authorized search" asserts the disabled attribute, the title, both tree sections
  present, and no "No authorized matches." status; the two obsolete filter tests were
  removed.

### Finding 3 — Tab hit area vs. packet claim: **RESOLVED**

- `.tabs` row height raised `38px` → `44px` (CSS line 67) — Durham's literal prescription,
  met before the packet claim is re-cited as evidence. Minor residual nuance: the strip's
  1px bottom border means the interactive tab area is 43–44px depending on the app's global
  box-sizing; verify the exact 44px figure in the browser proof (WCAG 2.5.8's 24px AA
  minimum is comfortably met either way).

Durham's six non-blocking preferences were **not** changed in this delta, as expected:
palette derivation record (dark-surface derivatives `#3f73d8/#ff4d1f/#25a665/#f7f3ee/#0f1720`
of canonical `#1D4ED8/#FF5A2E/#157A4A/#F6F4EF/#0F1115`), 9–10px caption floor (`mapCaption`
9px, tree smalls 9px, `detail` 10px), trust cues hidden at ≤1100px/≤760px, title-only
disabled rail hints (unreachable by keyboard), "principal" jargon in user-facing copy, and
inactive-tab `aria-controls` dangling references (shared single `tabpanel`). All remain
recorded preferences; none blocks this verdict.

## Final brand / UX direction

**On-baseline and approved for direction.** The candidate remains the approved
Obsidian-inspired dark knowledge workspace on an Ink/Cream foundation: compact tool rail,
authorized private/department tree, editorial reading pane, co-visible context pane,
outline/access inspector, collapsed Ask rail. Blue carries memory/intelligence and focus,
Orange carries review emphasis, Green carries authorized visibility — consistent with the
`4370cac3` design baseline and the Allura brand tokens (as dark-surface derivatives).

The honest-surface contract is fully preserved at these hashes and remains the strongest
brand expression — it literally enacts "MEMORY THAT SHOWS ITS WORK": the synthetic-data
notice, fail-closed content-free truth states for all eight non-complete conditions,
"PROXIMITY ONLY" map disclaimer with explicit no-verified-relationship copy, truthful
Ask-unavailable disclosure, and search now honestly disabled rather than deceptively
active. STP is intact (calm, single-purpose reading shell for a restricted reader); voice
avoids the banned vocabulary; brand casing is now correct in both copy and accessible
names. The real ARIA tablist with roving focus retains the Story 30.7 variance work.
This is the direction to lock.

## Remaining accessibility risks and human proof

Nothing in this delta introduces new direction risk, but the evidence gap is unchanged and
now binds to the new hashes:

- **Hash-bound browser evidence is absent for this candidate.** All stored WCAG scans,
  screenshots, and audits bind `4370cac3` (or older). Automated WCAG 2 A/AA scans and
  ready/comparison screenshots at 1440 and 320 must be captured against
  `e7aa0271…`/`f3ef7519…`.
- Re-verify the previously incomplete 320px comparison-overlay contrast item at this hash
  (the 10.15:1 disposition binds `4370cac3` only).
- Screen-reader journey evidence; real 200% browser zoom evidence; keyboard focus-ring
  verification on the 44px tab strip (inset `#3f73d8` on `#141f2a` ≈3.7:1, 1.4.11) and
  the rAF roving focus in a real browser; confirm the 43–44px tab interactive area; the
  9px captions remain most demanding at 320px; Escape closes comparison only in the
  mobile dialog (desktop relies on dismiss buttons) — confirm acceptable.
- Restricted-role PostgreSQL/HTTP live browser proof with approved injected credentials.
- The five-person, seven-task uncoached protocol (≥4/5 per task, no critical error, zero
  unauthorized disclosure).
- Human accessibility sign-off; Story 30.2 delta approval binding `fe736755b` +
  `e7aa0271…` + `f3ef7519…`, with Notion board reconciliation. The existing approval
  binds `4370cac3` only.

## Test receipts

The Jobs final gate recorded a live run at these exact hashes (2026-09-27):
`bunx vitest run --config vitest.config.epic30-hermetic.ts` → 38 files, 382 passed,
3 skipped, zero failures, including this component suite at 29/29 with the rewritten
disabled-search test and the roving-tablist keyboard test. This read-only final review did
**not** re-execute the suite (bounded read-only constraint); the receipt is cited, and its
hash binding was independently confirmed against the working tree.

## AI review, not human sign-off

This report is an AI-facilitated final direction review produced under the Team Durham
brand-orchestrator role. It is **not** human sign-off, not Story 30.2 (or any) approval,
not human accessibility sign-off, does not satisfy any HITL gate, and does not change any
board status. All approvals remain with the named human approver; every item in the human
proof list above remains required before any `Done` transition.

VERDICT: RECOMMEND