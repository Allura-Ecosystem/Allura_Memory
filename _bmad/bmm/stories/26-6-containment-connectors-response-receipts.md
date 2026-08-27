# Story 26.6 — Containment Connectors and Response Receipts

**Status:** Done — all 6 acceptance criteria met. AC-3 is satisfied for every containment target that exists in this system; `endpoint_isolation` is formally descoped (see AD-59).
**Owner:** Hightower + Brooks + Knuth
**Depends on:** 26.5, role-model reconciliation
**Blocks:** 26.7

## Outcome

Feature-flagged, propose-only connectors for approved response systems with explicit authorization for token revocation, workspace locks, and endpoint actions.

## Acceptance Criteria

- [x] Connectors are feature-flagged and independently disableable.
- [x] Connectors are propose-only — they cannot execute actions without explicit authorization.
- [x] Explicit authorization is required for: token revocation, workspace locks, endpoint actions. — token revocation and workspace locks are implemented, gated, and verified. `endpoint_isolation` is **formally descoped by AD-59**: Allura is a memory/governance control plane and owns no host, device, or network endpoint, so there is no endpoint to isolate. The connector remains in the type system and **fails closed** (throws before any receipt or state change) rather than silently accepting an action it cannot perform. See the AC-3 section below.
- [x] Token revocation, workspace locking, and connector actions are denied without the required role, policy, approval, and receipt.
- [x] Every action produces an immutable receipt with actor, action, rationale, policy reference, authorization chain, and timestamp.
- [x] Role-model reconciliation is complete before response authorization is exposed. (AD-58: security owner = existing `admin` RBAC role — `docs/allura/RISKS-AND-DECISIONS.md`.)

## AC-3 Closure — endpoint_isolation is descoped, not deferred (2026-08-27)

AC-3 names three containment targets. Two are real and fully gated:

| Connector | Real target | Status |
|---|---|---|
| `mcp_token_revocation` | `mcp_tokens.revoked_at` | Implemented, gated, verified |
| `workspace_lock` | `workspaces.lock_mode` | Implemented, gated, verified |
| `endpoint_isolation` | *none* | **Descoped (AD-59)** |

The third was investigated rather than assumed. A repository-wide search for any
host/device/network endpoint concept found only two unrelated senses of the word
"endpoint": HTTP API routes (`src/lib/auth/route-scope-manifest.ts`,
`src/lib/auth/edge-audit.ts`) and third-party advisory API URLs
(`src/lib/threat-ingestion/*`). Neither is a thing that can be *isolated* in the
security sense the AC intends.

That is not an implementation gap; it is a **boundary fact**. Allura is a
memory and governance control plane. It does not run an agent on a host, does
not manage devices, and does not sit in a network path -- so it owns no endpoint
to isolate. Building an `endpoint_isolation` connector would require inventing an
integration with an EDR/MDM/network product that does not exist in this system,
and any such connector would be untestable theatre: it would report success
having done nothing.

The honest engineering outcome is therefore to **fail closed and say so**.
`executeContainmentAction` rejects `endpoint_isolation` before any receipt is
written and before any state is touched, with an error naming the reason. A test
(`rejects endpoint_isolation regardless of role or approval`) pins that
behaviour, so if a real endpoint target is ever introduced, the failing path is
already the deliberate one rather than an accident.

Recorded as **AD-59** in `docs/allura/RISKS-AND-DECISIONS.md`.

## Evidence

- Connector manifest with feature flags: `src/lib/containment/feature-flags.ts` — every connector defaults to disabled; per-connector env var read fresh on every call. Verified: `src/lib/containment/__tests__/feature-flags.test.ts`, 4/4 passed.
- Propose-only descriptions, zero DB access, zero side effects: `src/lib/containment/propose.ts` (`proposeMcpTokenRevocation`, `proposeWorkspaceLock`). Verified: `src/lib/containment/__tests__/propose.test.ts`, 2/2 passed.
- Authorization gate: `src/lib/containment/governed-authorization.ts` (`executeContainmentAction`) — rejects non-admin actors, disabled connectors, tenant-scope mismatches, and blank rationale before any DB call; fails closed on missing/malformed `approval_ref` through the real (unmocked) REQ-GOV-008 `syscall_mutate` gate, mirroring Story 26.5's `governed-approval.ts` convention. Verified: `src/lib/containment/__tests__/governed-authorization.test.ts`, 10/10 passed.
- Immutable receipt schema: `docker/postgres-init/45-containment-receipts.sql` (`containment_receipts`) — RLS-scoped, `actor_role` CHECK restricted to `'admin'`, `connector` CHECK restricted to the three known connectors, append-only trigger blocking both UPDATE and DELETE. Functionally verified against a disposable PostgreSQL 16 container 2026-08-27: real INSERT succeeded under correct tenant scope; cross-tenant SELECT under RLS returned 0 rows; non-admin `actor_role` INSERT rejected by CHECK constraint; invalid `connector` value rejected by CHECK constraint; real UPDATE and real DELETE both rejected by the immutability trigger. Container destroyed afterward; not yet deployed to the laptop live Brain.
- Role-model reconciliation: AD-58 in `docs/allura/RISKS-AND-DECISIONS.md` — decided 2026-08-27, security-owner authority resolves to the existing `admin` RBAC role, no new role introduced.
- Full suite: `bun vitest run src/lib/containment` → 16/16 passed, exit 0. `bun run typecheck` → exit 0. `bun eslint src/lib/containment` → 0 errors, 0 warnings (post `--fix`).

## Rollback

Disable connectors. Policy drafts and alerts remain; no response actions can be initiated.

## Completion Notes

- agent: Brooks
- date: 2026-08-27
- files changed: `docker/postgres-init/45-containment-receipts.sql` (new), `src/lib/containment/{schemas,types,feature-flags,propose,governed-authorization}.ts` (all new), `src/lib/containment/__tests__/{propose,feature-flags,governed-authorization}.test.ts` (all new, 16 tests), `src/lib/db/tenant-table-inventory.ts` (registered `containment_receipts`), `vitest.config.unit.ts` (registered `src/lib/containment/**`), `docs/allura/RISKS-AND-DECISIONS.md` (AD-58)
- evidence: `bun vitest run src/lib/containment` → 16/16 passed, exit 0; `bun run typecheck` → exit 0; `bun eslint src/lib/containment` → 0 errors, 0 warnings; migration 45 functionally verified against a disposable PostgreSQL 16 container (RLS isolation, admin-only actor_role CHECK, connector-allowlist CHECK, immutability trigger on both UPDATE and DELETE — all exercised with real SQL, not just described)
- remaining gaps: `endpoint_isolation` is **descoped by AD-59, not pending** — Allura is a memory/governance control plane and owns no host, device, or network endpoint, so there is nothing to isolate. It fails closed before any receipt or state change, and a test pins that behaviour. If Allura ever gains a real endpoint (an agent running on a managed host, say), AD-59 must be revisited and the connector built then. Migration 45 has not been deployed to the live Brain, only proven against a disposable container. `approval_ref` is checked for presence and well-formed UUID shape by the control-plane gate but is not resolved against a canonical approval-lifecycle record here (same limitation `governed-approval.ts` has in Story 26.5) — that is intentionally deferred to the control-plane layer.