# Epic 30 Durham UX Direction Review — fe736755

Date: 2026-09-27
Reviewer: Brand Orchestrator (Kotler), Team Durham
Scope: bounded direction review of the frozen user-approved candidate. Local files only; no MCP, web, skills, or delegation used.

## Roles used

Kotler (brand-orchestrator) performed the entire bounded review and applied the Glaser
(visual direction) and Munari (consistency/accessibility) lenses inline. Glaser and
Munari were **not** separately dispatched; no specialist subagent ran. No Brain search
or write was performed (bounded local-only instruction).

## Exact candidate and hashes (verified this review)

- Candidate commit: `fe736755b5339c5cbc7116838d6f5d32344bb1e7` — confirmed as HEAD.
- `src/components/dashboard/my-work-workspace.tsx` SHA-256: `f56ca1b137bf3bfd835ccc3dbd8da37b59c42417a4a36da2aba5f1d36d586ee8` — confirmed.
- `src/components/dashboard/my-work-workspace.module.css` SHA-256: `eb0612ae5f8345a10ca4dba327d1024aa8fd216833007eb096a93dcdcd92bdc4` — confirmed.
- Working tree clean for both files; reviewed content matches HEAD.

Governance note: the human-approved design baseline in `epic-30-design-approval-packet.md`
is bound to `4370cac3` (TSX `7de47369…`, CSS `c0e55367…`). This candidate is a successor
implementing variance-record work assigned to Story 30.7 (real ARIA memory tabs, truth-state
contract). It has not itself received a design approval; a delta approval binding
`fe736755` is required before it is treated as the locked design hash.

## Design direction

Sound and on-baseline. Obsidian-inspired dark knowledge workspace on an Ink/Cream
foundation: compact tool rail, authorized private/department tree, editorial reading pane,
co-visible context pane, outline/access inspector, collapsed Ask rail. Blue carries
memory/intelligence and focus, Orange carries review emphasis, Green carries authorized
visibility — consistent with the approved direction. One primary document plus at most one
comparison pane, with focus restoration to the opener, is preserved.

The honest-surface design is the strongest brand expression in the candidate: the
synthetic-data notice, fail-closed content-free truth states, "PROXIMITY ONLY" map
disclaimer, and the truthful Ask-unavailable disclosure literally enact the brand promise
"MEMORY THAT SHOWS ITS WORK." STP is intact — a calm, single-purpose reading shell for a
restricted reader — and the voice avoids the banned vocabulary. The real ARIA tablist with
roving focus closes the packet's tab variance in the direction Story 30.7 required.

## Must-fix findings

1. **Brand name casing.** The tree brand block renders `ALLURA` (uppercase), violating the
   allura name rule (always lowercase in copy). The icon-rail control is also named
   `aria-label="Ask Allura"` while the visible Ask control says "Ask allura" — fix the
   accessible name to `Ask allura` for both brand rule and name consistency.
2. **Search affordance vs. approved baseline.** Search is now an active client-side filter,
   but the approved packet states "Search remains disabled" and assigns authorized search to
   Story 30.8. Either record an explicit variance (local filtering of already-visible
   authorized documents is not authorized search) in the approval trail, or restore the
   disabled state until 30.8. Do not let the trail and the artifact disagree.
3. **Tab hit area vs. packet claim.** Tab buttons are 38 px tall; the packet claims
   "interactive targets meet the 44 px local design target." Raise the tab strip to 44 px or
   amend the packet claim before it is re-cited as evidence.

## Preferences (non-blocking)

- Palette uses dark-surface derivatives (`#3f73d8`, `#ff4d1f`, `#25a665`, `#f7f3ee`,
  `#0f1720`) of the canonical tokens (`#1D4ED8`, `#FF5A2E`, `#157A4A`, `#F6F4EF`,
  `#0F1115`); acceptable for dark mode, but record the derivation in the brand record.
- 9–10 px monospace captions (`mapCaption` 9 px, tree smalls 9 px, `detail` 10 px) are very
  small; consider a 10–11 px floor. Module relies on inherited typography — confirm IBM
  Plex Sans is applied globally.
- Trust cues (inspector "Authority boundary", notice "Scope verified server-side") are
  hidden at ≤1100 px / ≤760 px; consider a compact authority note on narrow layouts.
- Disabled rail buttons explain themselves only via `title`, unreachable by keyboard;
  consider `aria-describedby` or a visible hint.
- "principal" is internal jargon in user-facing copy; brand voice prefers plainer words.
- Inactive tabs point `aria-controls` at panel IDs not currently rendered (shared single
  tabpanel); verify the automated audit tolerates the dangling references at this hash.

## Accessibility risks at 320 / 1440 / keyboard

- **320 px:** re-verify the previously incomplete axe color-contrast item on the fixed
  comparison overlay at this hash (the prior 10.15:1 disposition binds `4370cac3`); the
  horizontally scrolled tab strip inside a 38 px row needs visible focus and touch-scroll
  checks; inspector/map/tree/noticeEnd are hidden — confirm no authority information is
  lost; safe-area padding is present; 9 px captions are most demanding here.
- **1440 px:** context-map nodes use fixed absolute percentages (`mapNode1–6`); verify no
  node overlap or overflow at the minimum 320 px right column; the caption disclaims
  relationship claims — keep that.
- **Keyboard:** roving tabindex with rAF focus is implemented; re-verify in-browser focus
  ring on tabs (inset `#3f73d8` outline on `#141f2a` ≈ 3.7:1 — passes 1.4.11, confirm);
  Escape closes comparison only in the mobile dialog — desktop close relies on the dismiss
  buttons, confirm acceptable; opener/fallback focus restoration and mobile inert
  background + focus containment are implemented — re-verify in a real browser.

## RECOMMEND or BLOCK for implementation

**RECOMMEND for implementation, conditional.** The direction is consistent with the approved
baseline and the Story 30.7 variance assignment, and the honest-surface pattern is exemplary.
Before locking this hash: fix must-fix items 1–3 (or record the two variances), and obtain a
delta design approval binding `fe736755`, since the existing approval binds `4370cac3` only.

## Human proof still needed

- Automated WCAG 2 A/AA scans and screenshots (ready/comparison at 1440 and 320) bound to
  the `fe736755` hashes — all prior evidence binds `4370cac3`.
- Screen-reader journey evidence.
- Real 200% browser zoom evidence.
- Restricted-role PostgreSQL/HTTP live browser proof with approved injected credentials.
- The five-person, seven-task uncoached protocol (≥4/5 per task, no critical error, zero
  unauthorized disclosure).
- Human accessibility sign-off — the one prior axe incomplete item was disposed by a bounded
  AI preflight, not by a human.
- Story 30.2 delta approval binding the new candidate and hashes, with Notion board
  reconciliation.

## AI review, not human sign-off

This report is an AI-facilitated direction review produced under the Team Durham
brand-orchestrator role. It is **not** human sign-off, does not constitute Story 30.2 (or
any) approval, does not satisfy any HITL gate, and does not change any board status. All
approvals remain with the named human approver.

VERDICT: RECOMMEND