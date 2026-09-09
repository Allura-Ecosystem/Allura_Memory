# Epic 29 — Work-Package Task Plan

**Goal:** Complete Epic 29 end to end so an authorized user can pair once with Clerk, reconnect automatically with OS-keystore proof, rotate keys safely, and lose access immediately when authority is revoked.

**Created:** 2026-09-08
**Owner:** Brooks (sprint planning)
**Status:** Ready for execution

---

## Work-Package Overview

| WP | Name | Stories | Parallelism | Depends On |
|----|------|---------|-------------|------------|
| 1 | Readiness + Sprint Setup | — | Planning gate | — |
| 2 | Foundations — Schema, Signing, PKCE | 29.1, 29.2, 29.3 | 29.2 ∥ 29.3 after 29.1 | WP1 |
| 3 | Pairing — Enrollment, Approval, Completion | 29.4, 29.5, 29.6 | Sequential: 29.4→29.5→29.6 | WP2 |
| 4 | Reconnect + Authority | 29.7, 29.8, 29.9, 29.10, 29.11 | 29.7 ∥ 29.8 ∥ 29.10 → 29.9 → 29.11 | WP3 |
| 5 | Rotation — Stage, Activate, Grace Recovery | 29.12, 29.13, 29.14 | Sequential: 29.12→29.13→29.14 | WP4 |
| 6 | Revocation + Audit | 29.15, 29.16, 29.17 | Sequential: 29.15→29.16→29.17 | WP4, WP5 |
| 7 | Automated Validation — Unit + PG Integration | 29.18, 29.19 | 29.18 ∥ 29.19 | WP6 |
| 8 | External Runtime Proof — Clerk E2E + Platform | 29.20, 29.21 | 29.20 ∥ 29.21 | WP7 |
| 9 | Final Review + CI + Retrospective | — | Sequential gates | WP8 |

---

## WP1: Readiness + Sprint Setup

**Stories:** None — this is the planning/readiness gate.
**Gate:** All prerequisites pass before Story 29.1 starts.

### Checklist
- [ ] Brain running and MCP reachable
- [ ] Scout context hydration complete
- [ ] Required skills resolved (allura-dev-story, allura-code-review, allura-memory-skill)
- [ ] Validation commands identified (`bun run typecheck`, `bun run test:unit`, `bun run test:integration`, `bun run test:live-db`, `bun run test:e2e`)
- [ ] Sprint tracking entries created in sprint-status.yaml
- [ ] All 21 story files verified present and in backlog status
- [ ] Dependency graph validated (acyclic, backward-only)
- [ ] B1 (Clerk test instance) and B2 (desktop client repo) identified as external gates

---

## WP2: Foundations — Schema, Signing, PKCE

**Stories:** 29.1, 29.2, 29.3
**Parallelism:** 29.2 ∥ 29.3 after 29.1 completes

### Story 29.1 — Schema Foundation
- **ACs:** AC-06 (partial), AC-10 (partial)
- **Deliverables:** Migrations 060–063 (device_enrollments, paired_devices, mcp_tokens.paired_device_id, device_challenges)
- **Evidence:** `bun test src/lib/device-pairing/__tests__/migrations/` with RUN_E2E_TESTS=true
- **Done when:** All CHECK constraints, RLS policies, SECURITY DEFINER functions, indexes, and DEFERRABLE trigger exist; schema_versions rows 060–063 inserted

### Story 29.2 — RFC 9421 Signing Envelope
- **ACs:** AC-09
- **Deliverables:** Canonical signing verifier and helpers per architecture §4.4, AD-64
- **Depends on:** 29.1
- **Evidence:** Unit tests proving P1363 normalization, RFC 9530 digest checks, configured origin
- **Done when:** Verifier handles @target-uri, content-digest, and ECDSA P-256 fixed r‖s

### Story 29.3 — PKCE + Authorization Code + Completion Nonce
- **ACs:** AC-08, AC-09
- **Deliverables:** PKCE S256, one-time authorization code (SHA-256 stored), completion_nonce bound to code/enrollment/PK, 60s TTL
- **Depends on:** 29.1
- **Evidence:** Unit tests proving PKCE state binding, code hashing, nonce consumption
- **Done when:** Verifier never in URL; code is single-use; nonce binds code+enrollment+PK

---

## WP3: Pairing — Enrollment, Approval, Completion

**Stories:** 29.4, 29.5, 29.6
**Parallelism:** Strict sequential (29.4→29.5→29.6)

### Story 29.4 — Enrollment API
- **ACs:** AC-07, AC-09
- **Deliverables:** POST /api/device-pairing/enroll with 10-min TTL, PENDING state, single-use
- **Depends on:** 29.1, 29.3
- **Evidence:** Integration tests proving TTL enforcement, single-use, PENDING state
- **Done when:** Enrollment creates PENDING row with expires_at, code, and PK; no tenant authority stored

### Story 29.5 — Approval API
- **ACs:** AC-02, AC-07, AC-08, AC-10
- **Deliverables:** POST /api/device-pairing/approve with pg_advisory_xact_lock device-count enforcement (default 5)
- **Depends on:** 29.1, 29.3, 29.4
- **Evidence:** Integration tests proving device limit, advisory lock, concurrent approval safety
- **Done when:** Approval completes enrollment, enforces device limit, resolves membership from Clerk identity

### Story 29.6 — Complete API
- **ACs:** AC-01, AC-06, AC-08, AC-09
- **Deliverables:** POST /api/device-pairing/complete — OAuth authorization code redemption + pairing_complete proof
- **Depends on:** 29.1, 29.2, 29.3, 29.5
- **Evidence:** Integration tests proving PKCE verifier consumption, RFC 9421 proof verification, paired device creation
- **Done when:** Complete redeems code + verifier + nonce + RFC 9421 proof; creates APPROVED paired device with all authority NOT NULL

---

## WP4: Reconnect + Authority

**Stories:** 29.7, 29.8, 29.9, 29.10, 29.11
**Parallelism:** 29.7 ∥ 29.8 ∥ 29.10 after 29.6; then 29.9; then 29.11

### Story 29.7 — Challenge API (RLS Bootstrap)
- **ACs:** AC-09, AC-11
- **Deliverables:** POST /api/device-pairing/challenge with RLS bootstrap via resolve_device_route()
- **Depends on:** 29.1, 29.6
- **Evidence:** Integration tests proving single-use challenge, RLS enforcement, purpose discriminator
- **Done when:** Challenge creates single-use token with group_id + RLS + purpose; resolve_device_route() returns group_id for APPROVED devices only

### Story 29.8 — Scope Derivation + Atomic Revocation
- **ACs:** AC-12, AC-14
- **Deliverables:** deriveScopesForMembershipRole() helper; atomic revoke at mutation paths (demotion, removal, workspace-lock)
- **Depends on:** 29.1, 29.6
- **Evidence:** Integration tests proving demotion downscopes, removal blocks, full_lockdown blocks, atomic revoke in same transaction
- **Done when:** Demotion/removal/workspace-lock changes atomically revoke all linked device tokens at the mutation path

### Story 29.9 — Exchange API
- **ACs:** AC-03, AC-04, AC-11, AC-13, AC-14, AC-15
- **Deliverables:** POST /api/device-pairing/exchange — atomic token mint with authority resolution
- **Depends on:** 29.1, 29.2, 29.6, 29.7, 29.8
- **Evidence:** Integration tests proving server-derived authority, cross-tenant rejection, concurrent exchange safety
- **Done when:** Exchange uses private key (not Clerk), derives principal/tenant/workspace/role/scopes from server records, mints short-lived MCP token

### Story 29.10 — McpAuthenticator Cache Bypass
- **ACs:** AC-15, AC-22
- **Deliverables:** Paired-device MCP tokens bypass CredentialCache entirely; PrincipalContext.principalId = human; agent_name = principal_id DEFERRABLE trigger
- **Depends on:** 29.1, 29.6
- **Evidence:** Unit tests proving cache bypass, PrincipalContext extension with pairedDeviceId, agent_name invariant
- **Done when:** Device tokens always hit DB on every auth; PrincipalContext includes pairedDeviceId; agent_name enforced at COMMIT

### Story 29.11 — Offline and Key-Loss Failure
- **ACs:** AC-04, AC-05
- **Deliverables:** Failure behavior for offline, key loss, revocation, membership recovery
- **Depends on:** 29.7, 29.9
- **Evidence:** Integration tests proving key persists across updates; key loss/revocation prompts Clerk reauth
- **Done when:** Key persists across updates/outages; key loss/revocation/lost/membership recovery triggers Clerk prompt

---

## WP5: Rotation — Stage, Activate, Grace Recovery

**Stories:** 29.12, 29.13, 29.14
**Parallelism:** Strict sequential (29.12→29.13→29.14)

### Story 29.12 — Rotation Stage API
- **ACs:** AC-16, AC-19
- **Deliverables:** POST /api/device-pairing/rotation/stage with key_generation counter
- **Depends on:** 29.1, 29.2, 29.7, 29.9
- **Evidence:** Integration tests proving crash-before-activation leaves current key valid, replay returns same state
- **Done when:** Rotation stage creates pending key without activating; crash leaves current key usable

### Story 29.13 — Rotation Activate API
- **ACs:** AC-16, AC-18, AC-19
- **Deliverables:** POST /api/device-pairing/rotation/activate — atomic key swap + grace window
- **Depends on:** 29.2, 29.7, 29.12
- **Evidence:** Integration tests proving atomic swap, idempotent receipt, concurrent rotation convergence
- **Done when:** Activation atomically swaps keys; replays return same state + updated receipt; concurrent rotations converge via key_generation counter

### Story 29.14 — Grace-Path Recovery
- **ACs:** AC-18
- **Deliverables:** Old-key recovery-only during grace window (24h default, configurable 1–72h)
- **Depends on:** 29.2, 29.7, 29.13
- **Evidence:** Integration tests proving recovery-only grace, rate limiting, no normal token mint during grace
- **Done when:** Grace window returns scoped recovery token or 403 RECOVERY_REQUIRED; rate-limited per device

---

## WP6: Revocation + Audit

**Stories:** 29.15, 29.16, 29.17
**Parallelism:** Sequential (29.15→29.16→29.17)

### Story 29.15 — Revocation and Mark-Lost APIs
- **ACs:** AC-22, AC-23
- **Deliverables:** Revocation/loss atomically blocks exchanges, invalidates tokens + caches; terminal state
- **Depends on:** 29.1, 29.10
- **Evidence:** Integration tests proving atomic revoke, terminal state, new pairing required
- **Done when:** Revocation/loss blocks new exchanges, invalidates all linked tokens + caches; device is terminal (APPROVED/REVOKED/LOST only)

### Story 29.16 — Transactional Audit Emission
- **ACs:** AC-24
- **Deliverables:** Every lifecycle/security decision creates append-only event (fail-closed)
- **Depends on:** 29.4, 29.5, 29.6, 29.7, 29.9, 29.12, 29.13, 29.14, 29.15
- **Evidence:** Integration tests proving transactional emission, fail-closed on error, correct event types
- **Done when:** All lifecycle decisions create append-only events; pre-human enrollment uses group_id='allura-system'

### Story 29.17 — Automated Credential Leak Scan
- **ACs:** AC-25
- **Deliverables:** Automated scan proving no credentials in events/logs/errors/artifacts
- **Depends on:** 29.16
- **Evidence:** Scan script output showing zero credential matches across all event types
- **Done when:** Automated scan passes with no credential matches; evidence committed

---

## WP7: Automated Validation

**Stories:** 29.18, 29.19
**Parallelism:** 29.18 ∥ 29.19 after WP6

### Story 29.18 — Unit Test Suite
- **ACs:** AC-26
- **Deliverables:** State, signing, replay, expiry, scope, redaction, PKCE, auth code, agent-name invariant tests
- **Depends on:** 29.1–29.17
- **Evidence:** `bun run test:unit` pass with zero failures
- **Done when:** All unit tests pass; coverage of state machine, RFC 9421, replay, expiry, scope, redaction, PKCE, auth code, agent-name

### Story 29.19 — PostgreSQL Integration Test Suite
- **ACs:** AC-20, AC-27
- **Deliverables:** Atomicity, uniqueness, membership, locks, revocation, concurrency, device limit tests
- **Depends on:** 29.1, 29.4–29.16
- **Evidence:** `bun run test:integration` and `bun run test:live-db` pass
- **Done when:** All integration tests pass; concurrency proof (one active token per device), advisory lock proof, device limit proof

---

## WP8: External Runtime Proof

**Stories:** 29.20, 29.21
**Parallelism:** 29.20 ∥ 29.21 after WP7
**External gates:** B1 and B2 — skip does not equal pass

### Story 29.20 — Clerk E2E Test
- **ACs:** AC-28
- **Deliverables:** Browser-to-desktop PKCE completion with Clerk test instance
- **Depends on:** 29.1, 29.4–29.10
- **External gate:** B1 — dedicated Clerk test app/test-token strategy
- **Evidence:** Real Clerk test instance round-trip; browser → approve → complete → connected
- **Done when:** E2E test proves full pairing flow with real Clerk; no mocked Clerk accepted

### Story 29.21 — Platform Contract Tests
- **ACs:** AC-29
- **Deliverables:** macOS Keychain, Windows CNG, Linux libsecret adapter contract tests
- **Depends on:** 29.1, 29.2, 29.6–29.15
- **External gate:** B2 — desktop client repository with real platform adapters
- **Evidence:** Real platform adapter evidence on macOS, Windows, Linux
- **Done when:** Contract tests pass on all three platforms; capability-specific evidence

---

## WP9: Final Review + CI + Retrospective

**Depends on:** WP8
**Stories:** None (gates only)

### Final Gates Checklist
- [ ] All 21 stories show `status: done` in sprint-status.yaml
- [ ] Epic 29 shows `status: done` in sprint-status.yaml
- [ ] AC-01 through AC-29 each have implementation evidence in the traceability matrix
- [ ] `bun run typecheck` passes
- [ ] `bun run test:unit` passes
- [ ] `bun run test:integration` passes
- [ ] `bun run test:live-db` passes
- [ ] `bun run test:e2e` passes
- [ ] Credential-leak scanning passes (Story 29.17)
- [ ] `bun run build` passes
- [ ] Required CI passes (all green)
- [ ] B1 Clerk test-instance evidence passes without skips
- [ ] B2 real macOS/Windows/Linux secure-store evidence passes without skips
- [ ] Independent security review: no BLOCK/HIGH findings
- [ ] Independent maintainability review: no BLOCK/HIGH findings
- [ ] Retrospective accepted and logged

---

## Guardrails (Non-Negotiable)

1. **Follow dependencies** — no story starts before its depends_on are done
2. **One story at a time through dev/review/done** — no parallel stories in same work-package unless explicitly allowed
3. **No fake or skipped evidence** — every claim backed by real test output
4. **No client-supplied tenant/workspace/role/scope** — all authority server-derived
5. **No private-key or reusable bearer leakage** — keys never leave OS store; tokens never returned by API
6. **Migrations additive and rollback-tested** — ordered 063→062→061→060, no CASCADE
7. **No production deployment, secret change, or direct main push without Sabir's separate approval**

---

## Evidence Requirements Per Story

Each story must produce:
1. Implementation code (source files, migrations)
2. Tests (unit or integration as specified)
3. Test output (passing, with coverage where applicable)
4. Typecheck pass (`bun run typecheck`)
5. Code review approval (Pike/Fowler)
6. Story file updated to `status: done` with evidence annotation

---

## Dependency Graph (Simplified)

```
WP1 (29.1)
  ↓
WP2 (29.1→29.2 ∥ 29.3)
  ↓
WP3 (29.4→29.5→29.6)
  ↓
WP4 (29.7 ∥ 29.8 ∥ 29.10 → 29.9 → 29.11)  ←→  WP5 (29.12→29.13→29.14)
  ↓                                              ↓
WP6 (29.15→29.16→29.17) ← depends on WP4+WP5
  ↓
WP7 (29.18 ∥ 29.19)
  ↓
WP8 (29.20[B1] ∥ 29.21[B2])
  ↓
WP9 (final gates + retrospective)
```
