# Story 26.5 — Governed Mitigation Policy Drafts

**Status:** Done — all 9 acceptance criteria met, including the canonical approval/receipt path
**Owner:** Brooks + Knuth + Woz
**Depends on:** 26.3, Epic 24 mutation-boundary remediation
**Blocks:** 26.6, 26.7

## Outcome

A verified exposure maps to a versioned mitigation template, producing a reviewable simulated policy draft with dry-run results, scope explanation, rollback evidence, and an approval-required receipt.

## Acceptance Criteria

- [x] Verified exposure maps to a versioned mitigation template.
- [x] Policy draft is reviewable — not active policy.
- [x] Template parameters are derived from verified exposure evidence; untrusted advisory text cannot introduce an executable instruction or broaden the proposed scope.
- [x] Dry-run result shows what would happen without executing.
- [x] Scope explanation is included: what systems, packages, or workflows are affected.
- [x] Approval-required receipt is generated: actor, action, rationale, policy reference, evidence references, timestamp.
- [x] Policy activation, enforcement changes, schedule changes, and external response actions use the canonical Allura approval and receipt path.
- [x] A policy draft is not active policy — activation requires explicit approval.
- [x] Draft generation does not execute package blocks, CI changes, containment, or connector actions.

## Implementation Status — 2026-08-27 (AC 6-7 closure)

AC 1–5 and 8–9 were implemented and independently reviewed PASS on 2026-08-26 (see prior note below). AC 6–7 closed this session:

- **`docker/postgres-init/41-mitigation-receipts.sql`** — new append-only `mitigation_receipts` table (RLS + immutability trigger, mirroring `governance_receipts`' pattern from migration 39). Not foreign-keyed to `canonical_proposals`: a mitigation draft is not a curator promotion proposal, so that pipeline's schema does not apply.
- **`src/lib/mitigation/governed-approval.ts`** (new) — `recordGovernedMitigationApproval()` routes every approval/rejection through `syscall_mutate` (`src/control-plane/syscalls.ts`), which enforces the REQ-GOV-008 `approval_ref` gate (well-formed UUID, required) before any row is written. This is deliberately separate from the pre-existing `src/lib/mitigation/receipt.ts`, which remains local/unauthenticated and still cannot approve or activate anything.
- **`MitigationApprovalAction`** = `approved_for_activation | rejected` — no `"activated"` action exists anywhere in this story's code; Story 26.5 grants no activation authority (AD-57). Approval only marks a draft ready for a later, separately authorized enforcement workflow (26.6+).
- **Verified, not assumed:** wrote `src/lib/mitigation/__tests__/governed-approval.test.ts` (6 tests) against the REAL control-plane gate (only `resolveTarget`/`policy` mocked, matching `syscalls.test.ts`'s own convention) — proves a missing or malformed `approval_ref` throws before `resolveTarget` is ever called, and a valid UUID persists through the real gate. `bun vitest run src/lib/mitigation` → 24/24 passed (18 prior + 6 new). Full unit lane re-run: 1930/1930 passed, 0 failures. `bun run typecheck` exit 0.
- **Migration 41 validated against a fresh disposable PostgreSQL 16 (pgvector/pgvector:pg16), container destroyed after validation, knowledge-postgres untouched:** all 41 migrations applied cleanly (schema_versions confirms `041` as newest). Verified directly, not just schema inspection: (1) a valid insert as `allura_app` with matching session-scoped `group_id`/`workspace_id` succeeds; (2) an insert claiming a different tenant's `group_id`/`workspace_id` is rejected by the RLS policy (`new row violates row-level security policy`); (3) `allura_app` UPDATE/DELETE are rejected at the grant layer (`permission denied for table mitigation_receipts`); (4) the immutability trigger itself was proven separately against the bootstrap superuser role, which bypasses grants but not triggers — both UPDATE and DELETE raised `mitigation_receipts are immutable` from `app.prevent_mitigation_receipt_mutation()`.

## Implementation Status — 2026-08-26 (AC 1-5, 8-9)

- **Safe partial slice implemented and independently re-reviewed PASS:** deterministic in-memory draft generation, strict typed template parameters, non-empty evidence references, tenant/workspace equality checks, dry-run/scope/rollback text, and a local simulation record that cannot approve or activate a policy.
- **Verification:** Team RAM/Pike final PASS; unit lane 99 files / 1,924 tests passed (160 skipped), focused mitigation suite 18/18, full typecheck passed.

## Evidence

- Mitigation template library: `src/lib/mitigation/templates.ts`.
- Policy draft generation tests: `src/lib/mitigation/__tests__/mitigation-drafts.test.ts` (18 tests).
- Dry-run result tests: `mitigation-drafts.test.ts:205`.
- Receipt schema validation: `src/lib/mitigation/schemas.ts` (`MitigationDraftRecord`, `MitigationApprovalReceipt`).
- Governed approval/rejection receipt path: `src/lib/mitigation/governed-approval.ts`, `docker/postgres-init/41-mitigation-receipts.sql`, `src/lib/mitigation/__tests__/governed-approval.test.ts` (6 tests).

## Completion Notes

- agent: Brooks
- date: 2026-08-27
- files changed: `docker/postgres-init/41-mitigation-receipts.sql` (new), `src/lib/mitigation/governed-approval.ts` (new), `src/lib/mitigation/__tests__/governed-approval.test.ts` (new), `src/lib/mitigation/schemas.ts`, `src/lib/mitigation/types.ts`
- evidence: `bun vitest run src/lib/mitigation` -> 24/24 passed, exit 0; `bun run test:unit` -> 1930/1930 passed 0 failed, exit 0; `bun run typecheck` -> exit 0; migration 41 applied against a disposable PostgreSQL 16 container and functionally verified (valid insert, cross-tenant RLS rejection, grant-level and trigger-level immutability), container destroyed afterward
- remaining gaps: none for this story's own scope. Actual policy activation/enforcement (what a `mitigation_receipts` row with `approved_for_activation` eventually authorizes) is explicitly out of this story's scope and belongs to Story 26.6. Deploying migration 41 to the laptop's live Brain instance is a separate, later step the user has indicated will happen once everything here is clear.

## Rollback

Policy drafts are read-only proposals. Disabling draft generation does not affect active policy. The `mitigation_receipts` table is additive-only (migration 41 creates a new table; nothing existing is altered) — dropping it removes only governed mitigation-approval history, not any other subsystem.
