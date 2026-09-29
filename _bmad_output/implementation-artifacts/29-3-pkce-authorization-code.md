# Story 29.3 — PKCE, Authorization Code, and Completion Nonce Utilities

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want PKCE S256, 256-bit authorization code, and completion nonce generation/verification utilities,
So that the browser→bridge completion is bound by three replay controls at different layers (PKCE verifier match, one-time hashed authorization code, completion nonce bound into the RFC 9421 signature).

## Outcome

An attacker who intercepts the callback URL cannot redeem the authorization code without the PKCE verifier held in bridge memory, and cannot replay a prior approval because the completion nonce is fresh and bound to the enrollment + public key.

**Scope:** Implement `src/lib/device-pairing/pkce.ts` and `src/lib/device-pairing/authorization-code.ts` — `generatePkceVerifier()`, `computePkceCodeChallengeS256(verifier)`, `verifyPkceS256(verifier, storedChallenge)`, `generateAuthorizationCode()` (256-bit, base64url), `hashAuthorizationCode(code)` (SHA-256 hex), `generateCompletionNonce()` (32-byte base64url). Pure functions.

**Dependencies:** Story 29.1

**Blocks:** Story 29.4, Story 29.5, Story 29.6, Story 29.18

**Acceptance Criteria IDs:** AC-08 (partial — PKCE + state binding), AC-09 (partial — copied callback URL cannot mint access without verifier).

**Architecture/ADR references:** §4.1, §4.2, §4.2b, §8.2, AD-65, AD-63.

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/pkce.ts`
- New: `src/lib/device-pairing/authorization-code.ts`
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/pkce.test.ts` — RFC 7636 S256 `code_challenge`/`verifier`, state validation, mismatch, verifier-never-in-URL invariant.
- `src/lib/device-pairing/__tests__/authorization-code.test.ts` — 256-bit code, SHA-256(code) stored (never raw), `completion_nonce` bound to code/enrollment/PK, 60s expiry, replay rejected.
- Unit lane.

**Governance/security evidence:**
- PKCE verifier never stored server-side before redemption (AD-65, §8.2).
- Authorization code stored only as SHA-256 hash (§4.2 step 10).
- Completion nonce bound to `(authorization_code_hash, enrollment_id, public_key)` (§4.2 step 11).
- No raw code in any log/event (NFR1, AC-25).

**Rollback or failure behavior:** Pure functions — no DB state. If removed, callers fail closed.

**Definition of Done:**
- All PKCE + authorization code unit tests pass.
- `bun run typecheck` passes.
- Test asserts the verifier is never serialized to any persistent store in the utility functions.

**Non-goals:**
- No API route integration (Story 29.4).
- No `device_enrollments` row mutation (Story 29.4 calls the SECURITY DEFINER functions).

---

## Dev Agent Record

### Implementation Plan

Vertical-slice TDD (RED → GREEN → REFACTOR) across 2 slices:

1. **PKCE S256 (RFC 7636)** — `pkce.ts`: `generatePkceVerifier()` (32-byte base64url), `computePkceCodeChallengeS256(verifier)` (base64url(SHA-256) no padding), `verifyPkceS256(verifier, storedChallenge)` (constant-time). Wrote `pkce.test.ts` first (RED), implemented to GREEN, validated against the RFC 7636 §B worked-example vector.
2. **Authorization code + completion nonce** — `authorization-code.ts`: `generateAuthorizationCode()` (256-bit base64url), `hashAuthorizationCode(code)` (SHA-256 hex), `generateCompletionNonce()` (32-byte base64url), `bindCompletionNonce()` (length-prefixed canonical binding → SHA-256 `bindingDigest`), `verifyCompletionNonceBinding()` (expiry + binding-mismatch + constant-time digest compare). Wrote `authorization-code.test.ts` first (RED), implemented to GREEN.

### Debug Log

- None. Both slices went RED → GREEN on the first implementation pass with no debug cycle required.
- `bun` was not on `PATH` in the harness shell; resolved via `/home/roninhub/.hermes/profiles/troy/home/.bun/bin`.

### Completion Notes

- **44 focused tests pass** across 2 test files (pkce: 18, authorization-code: 26).
- PKCE S256 verified against the RFC 7636 Appendix B worked-example vector (`verifier` → `challenge`).
- PKCE verifier: 32-byte base64url (43 chars, no padding, no `+`/`/`), never serialized to any persistent store by the utility functions (AD-65, §8.2 invariant test included).
- Authorization code: 256-bit (32 bytes) base64url; `hashAuthorizationCode()` returns a 64-char lowercase hex SHA-256 digest — the only storable form (§4.2 step 10, NFR1, AC-25). Test asserts the hash never equals or contains the raw code.
- Completion nonce: 32-byte base64url; bound to `(authorization_code_hash, enrollment_id, public_key)` via a length-prefixed canonical binding input hashed to `bindingDigest` (§4.2 step 11). Length-prefixing prevents field-boundary ambiguity.
- `verifyCompletionNonceBinding()` enforces: 60s TTL expiry (`expired`), binding-digest mismatch on tampered code/enrollment/PK/nonce (`binding_mismatch`), constant-time digest compare. Replay modeled as a consumed nonce re-bound to a fresh code → bindingDigest mismatch → rejected.
- `bindCompletionNonce()` stores only the code hash, never the raw code (test asserts `JSON.stringify(binding)` does not contain the raw code).
- `bun run typecheck` passes cleanly.
- Full unit lane: 2,650 passed, 2 failed, 169 skipped. The 2 failures (`src/lib/memory/config.test.ts`, `src/lib/ruvector/embedding-service.test.ts`) plus the `packages/sdk/test/dist-consumer.test.ts` suite failure are pre-existing baseline failures outside this story — identical to the 3-baseline-failure note recorded in Story 29.2. No regressions introduced by Story 29.3.
- No API routes, database changes, persistent storage, tokens, deployments, commits, pushes, secrets, or live database mutations — pure utilities only.

### Code Review

- Final BMAD code review: **APPROVED** — zero Block, High, or Medium findings.
- PKCE S256 is verified against RFC 7636 Appendix B; all generated secrets are 256-bit CSPRNG base64url; raw verifier and authorization code values are neither persisted nor logged by these pure utilities.
- Story 29.4 must implement the database-layer one-time code/nonce consumption and its endpoint-level expiry/skew policy; those are intentionally outside this pure-utility story.

### File List

New files:
- `src/lib/device-pairing/pkce.ts` — generatePkceVerifier, computePkceCodeChallengeS256, verifyPkceS256.
- `src/lib/device-pairing/authorization-code.ts` — generateAuthorizationCode, hashAuthorizationCode, generateCompletionNonce, bindCompletionNonce, verifyCompletionNonceBinding, CompletionNonceBinding, DEFAULT_COMPLETION_NONCE_TTL_MS.
- `src/lib/device-pairing/__tests__/pkce.test.ts` — 18 tests (RFC 7636 S256, §B vector, verifier-never-in-URL invariant).
- `src/lib/device-pairing/__tests__/authorization-code.test.ts` — 26 tests (256-bit code, SHA-256 hash, nonce binding, 60s expiry, replay rejection, no-raw-code invariant).

Modified files:
- `vitest.config.unit.ts` — registered 2 new test files in the unit lane (Story 29.3 entries).

## Change Log

- 2026-09-08: Story 29.3 completed — PKCE S256, 256-bit authorization code, and completion nonce binding/verification pure utilities. 44 focused tests pass. Typecheck passes. Final BMAD review approved. Status → done.

---
