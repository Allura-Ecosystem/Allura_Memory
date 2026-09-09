# Story 29.3 — PKCE, Authorization Code, and Completion Nonce Utilities

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** backlog  
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
