# Story 27.5 — Team RAM and Durham Branch Workflows: Evidence Note

> **STATUS: implemented, unit-verified (RED→GREEN), not committed.**
> Repo HEAD `94a321c6` (branch `develop`). TDD: tests written first (RED:
> suite failed with "Failed to load url ../lane-config … Does the file
> exist?"), then lane config + workflow runner implemented (GREEN: 20/20
> branch-workflow tests, full unit lane 144 files / 2424 tests passed).

## What was built

`src/lib/branch-workflows/` operates Team RAM and Durham branch lanes as a
thin operator over the existing branch registry and the 27.3 promotion
adapter — no broad new agent framework, no duplicate workflow-status ledger.

| File | Purpose |
|---|---|
| `lane-config.ts` | Typed lane configuration: Team RAM lanes (one branch per story/agent/review lane, each with exactly one writer) and Durham concept branches (conservative, expressive, crop-resilient), each carrying reference, prompt, token, asset, accessibility, and provenance manifests. `assertDurhamManifestsComplete` fails closed on any missing/empty manifest. |
| `workflow-runner.ts` | `openLane` (records sole-writer ownership in `branch_registry`; rejects a second writer, a quarantined lane, or a Durham lane with incomplete manifests), `runLaneWork` (sole-writer-only writes into per-lane branch evidence), `reviewLaneEvidence` (Munari/Rand gate: only an approved diff is routed through `createPromotionProposal`; rejected/quarantined evidence freezes the lane via `quarantineBranch`), `updateLaneStatus` (explicit degraded/expired/rejected/quarantined/rolled_back states in the registry). |

## Acceptance criteria mapping

- **AC-1 (one branch per story/agent/review lane with sole-writer ownership):**
  `TEAM_RAM_LANES` = 6 story lanes + 11 agent lanes + 3 review lanes; every
  lane has exactly one `writer`; `openLane` records `agent_id` in
  `branch_registry` and throws `SoleWriterViolation` when a different actor
  opens or writes the same lane. Tests: "defines one branch per story, agent,
  and review lane", "gives every lane exactly one writer and covers the full
  roster", "records sole-writer ownership when a lane is opened", "rejects a
  second writer on the same lane", "rejects lane work from anyone but the
  sole writer".
- **AC-2 (Durham concept branches with all six manifests):** `DURHAM_CONCEPTS`
  = conservative, expressive, crop-resilient; each carries non-empty
  reference/prompt/token/asset/accessibility/provenance manifests; the runner
  attaches the concept's manifests to the lane's branch evidence. Tests:
  "defines conservative, expressive, and crop-resilient concept branches",
  "carries reference, prompt, token, asset, accessibility, and provenance
  manifests per concept", "fails closed when a manifest is missing or empty",
  "attaches the concept manifests to the lane's branch evidence".
- **AC-3 (Munari/Rand review gate; only an approved diff becomes a proposal
  via the 27.3 adapter):** `reviewLaneEvidence` imports and calls
  `createPromotionProposal` from `../branch/promotion-adapter` only on
  verdict `approved`; the proposal starts `pending` (curator flow owns
  approval). Rejected/quarantined verdicts write no proposal row and freeze
  the lane in the registry. Tests: "routes an approved diff through the
  promotion adapter into a curator proposal", "never creates a proposal for
  an unapproved diff", "quarantines a lane whose evidence fails review",
  "fails closed when review runs on a lane with no evidence", "routes
  promotion through the promotion adapter import".
- **AC-4 (no broad new agent framework, no duplicate workflow-status
  ledger):** the runner is a module, not a framework; it creates no tables
  and names no `workflow_status`/`lane_status` table. Status stays in
  `branch_registry` (same `BranchRegistryStatus` vocabulary as the adapter);
  promotion writes go only to `promotion_proposals` + `approval_transitions`.
  Tests: "creates no new table from the runner or lane config", "writes only
  branch_registry, promotion_proposals, and approval_transitions", "reuses
  the branch registry status vocabulary from the promotion adapter".
- **AC-5 (degraded/expired/rejected/quarantined/rolled_back explicit in real
  lanes):** `updateLaneStatus` moves a real lane into each lifecycle state
  (reason + retention + preserved diff snapshot via the adapter's
  `quarantineBranch`), and a quarantined lane refuses to reopen. Tests:
  "marks a lane degraded, expired, rejected, quarantined, or rolled back and
  reflects it in the registry", "keeps a quarantined lane quarantined and
  refuses to reopen it".

## Verification receipts

- RED: `vitest run --config vitest.config.unit.ts
  src/lib/branch-workflows/__tests__/workflow-runner.test.ts` → "Failed to
  load url ../lane-config … Does the file exist?" (exit 1).
- GREEN: same command → 1 file, 20 tests passed; with the 27.3 branch tests →
  3 files, 35 tests passed.
- Full unit lane: 144 files passed (6 skipped), 2424 tests passed (160
  skipped).
- `bun run typecheck` (`tsc --noEmit`): 0 errors.
- `npx eslint src/lib/branch-workflows/`: clean (0 problems).

## File-disjoint compliance

Touched: `src/lib/branch-workflows/lane-config.ts`,
`src/lib/branch-workflows/workflow-runner.ts`,
`src/lib/branch-workflows/__tests__/workflow-runner.test.ts`,
`vitest.config.unit.ts` (added the `src/lib/branch-workflows/**/*.test.ts`
glob to the unit lane), this note, and the 27-5 story file. Nothing
committed. `sprint-status.yaml`, `src/lib/branch/**`, `src/lib/branch-eval/**`,
`src/lib/bumblebee/**`, and 27-3/27-4/27-6 files untouched.
