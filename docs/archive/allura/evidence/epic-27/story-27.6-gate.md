# Story 27.6 — Security, Evidence, Release-Witness, and Demo Gate: Evidence Note

> **STATUS: implemented, unit-verified (RED→GREEN), not committed.**
> Repo HEAD `474a326a` (branch `develop`). TDD: tests written first (RED:
> suite failed with "Failed to load url ../epic-gate … Does the file
> exist?"), then the gate + manifest implemented (GREEN: 38/38 branch-gate
> tests, full unit lane 145 files / 2462 tests passed).

## What was built

`src/lib/branch-gate/` is the epic exit gate: it verifies that a branch is
safe to promote before any diff is routed into a curator proposal, and it
produces the one machine-readable release manifest for the epic.

| File | Purpose |
|---|---|
| `epic-gate.ts` | Seven enforcement checks — (a) tenant/workspace isolation fails closed, (b) poisoning blocks, (c) replay dedupes, (d) tamper rejects, (e) quota bounds, (f) expiry blocks, (g) rollback preserves + blocks re-promotion — each returning `{ ok, reason? }`, aggregated by `evaluateGate`. Promotion is proposal-only: the gate never writes canonical memory and never approves anything itself. |
| `release-manifest.ts` | Typed builder producing ONE machine-readable manifest (schema `allura-release-manifest/1`): revision (git HEAD), tests (counts), benchmark (27.2 fixture metrics reference), SBOM/license evidence (agenticow MIT + rvf-node MIT + Allura MIT), browser evidence (not applicable — headless), review verdict (pending — parent fills), Allura receipt (pending — parent fills). `validate()` fails on any missing required field; `pendingFields()` names exactly what the parent must fill. |
| `__tests__/epic-gate.test.ts` | 38 tests: all 7 gate checks, the aggregate, the manifest builder/validate contract, and the final invariant confirmation. |

## Acceptance criteria mapping

- **AC-1 (tenant/workspace isolation tests pass, cross-tenant inheritance
  fails closed):** `checkIsolation` blocks a branch whose base owner is a
  different tenant or a different workspace, and fails closed when the base
  owner is unknown. The predicate model mirrors the branch_registry RLS
  model (migration 53): the tenant is the only RLS axis keyed on
  `current_setting('app.current_group_id', true)` (same as migrations
  36/39/41), and the workspace stays a column predicate (ADR-001). A test
  pins the migration text: RLS on the tenant setting, `workspace_id` as a
  column, and no `app.current_workspace_id` setting. Live-database proof of
  the RLS policy itself remains the live-DB lane's responsibility (the unit
  lane is hermetic by design); the gate's fail-closed predicate is proven
  here.
- **AC-2 (poisoning, replay, tamper, quota, expiry, and rollback tests
  pass):** `checkPoisoning` blocks `quarantined`; `checkReplay` blocks a
  second promotion of the same `base_revision` + diff (deterministic
  `diff-<sha256-prefix>` hash, checked against the append-only
  `promotion_receipts`); `checkTamper` rejects any drift of
  `evidence_refs`/`base_revision`/diff from the recorded creation-time
  snapshot and fails closed with no recorded snapshot; `checkQuota` bounds
  branches per workspace (configurable, default 100); `checkExpiry` blocks
  a passed `retention_expires_at` or `expired` status; `checkRollback`
  blocks re-promotion of a `rolled_back` branch while preserving its diff
  for replay (and fails closed if the preserved diff is missing).
- **AC-3 (one machine-readable release manifest):** `createReleaseManifest`
  builds the manifest with revision/tests/benchmark/SBOM-license/browser/
  review-verdict/Allura-receipt; `validate()` fails while the review
  verdict or Allura receipt is pending and passes once the parent fills
  them. The machine-readable artifact is committed at
  `docs/archive/allura/evidence/epic-27/release-manifest-27.6.json` with
  `review.status: "pending"` and `allura.status: "pending"` — the parent
  fills both after the independent review and the receipt issuance.
- **AC-4 (independent review approves the frozen green diff):** parent
  responsibility — the manifest's `review` block is the slot; `pendingFields`
  reports `["review.verdict", "allura.receipt_id"]` until filled.
- **AC-5 (BMad retrospective records adopt/adapt/reject decisions):** parent
  responsibility (the parent reconciles the board and runs the
  retrospective).
- **AC-6 (production adoption gated on license, provenance, security, and
  benchmark gates):** the manifest carries the SBOM/license evidence
  (agenticow MIT + rvf-node MIT + Allura MIT, per the 27.2 pinned-source
  recon) and the benchmark reference (27.2 fixture metrics, status PASS);
  the gate's fail-closed checks are the security gate. Adoption remains
  out-of-scope for this story.
- **AC-7 (canonical memory cannot be changed through a branch without
  curator approval — final invariant confirmation):** two independent
  proofs. (1) The 27.3 import-scan test
  (`src/lib/branch/__tests__/promotion-adapter.test.ts` — "imports no
  memory-write module and never references canonical memory tables") still
  guards the promotion adapter: it asserts no `@/lib/memory/`,
  `@/mcp/canonical-tools`, `@/lib/graph-adapter`, `@/control-plane/syscalls`,
  `@/lib/neo4j` imports and no `allura_memories`/`graph_memories`
  references. (2) The gate's own no-direct-mutation assertion scans
  `epic-gate.ts` and `release-manifest.ts` for the same forbidden imports
  and table names, and `evaluateGate` reports `promotion: "proposal-only"`.
  Promotion through a branch therefore means creating a curator proposal
  (status `pending`); only the curator flow can approve it.

## Verification receipts

- RED: `vitest run --config vitest.config.unit.ts
  src/lib/branch-gate/__tests__/epic-gate.test.ts` → "Failed to load url
  ../epic-gate … Does the file exist?" (exit 1).
- GREEN: same command → 1 file, 38 tests passed.
- Full unit lane: 145 files passed (6 skipped), 2462 tests passed (160
  skipped) — up from 144 files / 2424 tests before this story.
- `bun run typecheck` (`tsc --noEmit`): 0 errors.
- `npx eslint src/lib/branch-gate/`: clean (0 problems).

## File-disjoint compliance

Touched: `src/lib/branch-gate/epic-gate.ts`,
`src/lib/branch-gate/release-manifest.ts`,
`src/lib/branch-gate/__tests__/epic-gate.test.ts`,
`vitest.config.unit.ts` (added the `src/lib/branch-gate/**/*.test.ts` glob
to the unit lane — the lane's include list is explicit, so without this
glob the tests would not run in CI), this note, the release manifest
artifact, and the 27-6 story file. Nothing committed. `sprint-status.yaml`,
`src/lib/branch/**`, `src/lib/branch-workflows/**`, `src/lib/branch-eval/**`,
`src/lib/bumblebee/**`, and 27-3/27-4/27-5 files untouched.
