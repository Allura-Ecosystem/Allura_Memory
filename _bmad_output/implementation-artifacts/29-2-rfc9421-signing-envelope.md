# Story 29.2 — RFC 9421 Canonical Signing Envelope — Verifier and Helpers

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want a server-side RFC 9421 HTTP Message Signature verifier and helper utilities,
So that every device proof-of-possession signature is validated against a named standard with full request binding (method, target-uri, content-digest, purpose, audience, nonce, proof-id, device-id, key-generation).

## Outcome

The server can verify any device signature (`pairing_complete`, `exchange`, `rotation_stage`, `rotation_activate`, `recovery_status`) using one canonical envelope, rejecting MITM body swaps, Host rewrites, and audience mismatches.

**Scope:** Implement `src/lib/device-pairing/rfc9421.ts` — signature base string reconstruction, Content-Digest (RFC 9530) verification, `@target-uri` from `ALLURA_DEVICE_AUTH_ORIGIN`, audience check against `ALLURA_DEVICE_AUTH_AUDIENCE`, ECDSA P-256 IEEE P1363 r‖s verification, Ed25519, RSA-PSS-2048. Pure functions, no DB, no API route.

**Dependencies:** Story 29.1

**Blocks:** Story 29.6, Story 29.9, Story 29.12, Story 29.13, Story 29.14, Story 29.18, Story 29.21

**Acceptance Criteria IDs:** AC-09 (partial — copied credentials cannot mint access because RFC 9421 binds the full request and requires the private key).

**Architecture/ADR references:** §4.4, AD-64, AD-60.

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/rfc9421.ts` — `verifyDeviceSignature(input)`, `reconstructTargetUri(origin, target)`, `computeContentDigest(body)`, `verifyContentDigest(body, header)`, `normalizeEcdsaP1363(derSignature)`.
- New: `src/lib/device-pairing/rfc9421-types.ts` — `SigningPurpose`, `DeviceProof`, `VerifiedProof` types.
- New env config readers: `src/lib/device-pairing/config.ts` — `getDeviceAuthOrigin()`, `getDeviceAuthAudience()` reading `ALLURA_DEVICE_AUTH_ORIGIN`, `ALLURA_DEVICE_AUTH_AUDIENCE`.
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/rfc9421-payload.test.ts` — RFC 9421 determinism, Content-Digest binding, signature verify for all 5 purposes.
- `src/lib/device-pairing/__tests__/rfc9421-ecdsa-p1363.test.ts` — ECDSA P-256 IEEE P1363 r‖s normalization (DER→P1363), 64-byte signature, standard base64 (not base64url), `@target-uri` from configured origin, Content-Digest RFC 9530 `sha-256=:base64:`.
- `src/lib/device-pairing/__tests__/rfc9421-body-swap.test.ts` — MITM body swap → content-digest mismatch → signature rejected.
- `src/lib/device-pairing/__tests__/rfc9421-target-uri.test.ts` — `@target-uri` reconstructed from configured origin, not Host; Host rewrite rejected.
- Unit lane (`bun run test:unit`).

**Governance/security evidence:**
- `@target-uri` from configured origin, not untrusted Host (AD-64, §4.4).
- Audience is device-auth API, not MCP endpoint (§4.4).
- Standard base64 (not base64url) for Signature and Content-Digest (§4.4).
- No private key ever parsed by the verifier — only public keys (NFR1).

**Rollback or failure behavior:** Pure function module — if removed, all callers fail closed (no signature accepted). No DB state. No rollback needed.

**Definition of Done:**
- `verifyDeviceSignature()` returns `{ valid: true, purpose, deviceId, keyGeneration }` or `{ valid: false, reason }` for all 5 purposes.
- All RFC 9421 unit tests pass.
- `bun run typecheck` passes.
- Test vectors include a DER→P1363 normalization case (architecture §4.4 ECDSA note).

**Non-goals:**
- No API route integration (Story 29.4+ wires this in).
- No challenge nonce consumption (Story 29.4).
- No key algorithm negotiation — server accepts the algorithm declared at enrollment.

---

## Dev Agent Record

### Implementation Plan

Vertical-slice TDD (RED → GREEN → REFACTOR) across 7 slices:

1. **Types + config readers** — `rfc9421-types.ts` (SigningPurpose, DeviceProof, VerifiedProof, SignatureParams, KeyAlgorithm) + `config.ts` (getDeviceAuthOrigin, getDeviceAuthAudience with Zod validation).
2. **Content-Digest (RFC 9530)** — `computeContentDigest()` / `verifyContentDigest()` producing `sha-256=:<standard base64>:` format.
3. **@target-uri reconstruction** — `reconstructTargetUri(origin, requestTarget)` using configured origin, NOT Host.
4. **ECDSA P-256 DER→P1363 normalization** — `normalizeEcdsaP1363()` converts ASN.1 DER to 64-byte IEEE P1363 r‖s.
5. **Signature base string + verifyDeviceSignature** — `buildSignatureBaseString()`, `parseSignatureInput()`, `verifyDeviceSignature()` for all 5 purposes × 3 algorithms.
6. **Body-swap rejection** — Content-Digest mismatch + signature over stale digest both rejected.
7. **Host rewrite rejection** — signature over configured-origin @target-uri fails when verified against a different origin.

### Debug Log

- Node 22 crypto API: `crypto.sign(algorithm, data, { key, dsaEncoding })` — the 4th positional arg is NOT the encoding string; encoding goes in the key options object. Verified via runtime probing.
- `parseSignatureInput` regex: parameter extraction must handle `name=value` at the start of the params string (after the first `;`), not only after a leading `;`.
- Typecheck: `crypto.verify` key argument needs proper typing — cast to `VerifyKeyObjectInput` for the union of KeyObject and options object.

### Completion Notes

- **39 focused tests pass** across 6 test files (config: 7, content-digest: 6, ecdsa-p1363: 5, payload: 11, body-swap: 4, target-uri: 6).
- All 5 signing purposes verified: `pairing_complete`, `exchange`, `rotation_stage`, `rotation_activate`, `recovery_status`.
- All 3 key algorithms verified: ECDSA P-256 (IEEE P1363 64-byte), Ed25519 (raw 64-byte), RSA-PSS-2048 (256-byte).
- `@target-uri` reconstructed from configured `ALLURA_DEVICE_AUTH_ORIGIN` — Host header is never a parameter to any function.
- Audience checked against configured `ALLURA_DEVICE_AUTH_AUDIENCE` — not the MCP endpoint.
- Content-Digest uses standard base64 (not base64url) per RFC 9530.
- Signature uses standard base64 (not base64url) per RFC 9421.
- DER→P1363 normalization test vector included (architecture §4.4 requirement).
- No private key ever parsed by the verifier — only public keys (NFR1).
- `bun run typecheck` passes.
- Full unit lane was run with Bun on `PATH`: 2,604 passed, 3 failed, 169 skipped. The three failures are in pre-existing SDK package-output and embedding-environment tests outside this story; focused Story 29.2 tests pass with no regressions.

### Code Review

- Final BMAD code review: **APPROVED** — zero Critical, High, or Medium findings.
- Remediated: the RFC 9421 base now lowercases `@method`, serializes the full inner-list plus parameters in `@signature-params`, terminates every base-string line including the final line, and rejects a transmitted `alg` that differs from the enrolled key algorithm.
- Story 29.4 must enforce its endpoint-specific required covered components plus timestamp/nonce replay checks; those are intentionally outside this pure-verifier story.

### File List

New files:
- `src/lib/device-pairing/rfc9421-types.ts` — SigningPurpose, DeviceProof, VerifiedProof, SignatureParams, KeyAlgorithm types.
- `src/lib/device-pairing/rfc9421.ts` — verifyDeviceSignature, reconstructTargetUri, computeContentDigest, verifyContentDigest, normalizeEcdsaP1363, parseSignatureInput, buildSignatureBaseString.
- `src/lib/device-pairing/config.ts` — getDeviceAuthOrigin, getDeviceAuthAudience, clearDevicePairingConfig.
- `src/lib/device-pairing/__tests__/rfc9421-config.test.ts` — 7 tests.
- `src/lib/device-pairing/__tests__/rfc9421-content-digest.test.ts` — 6 tests.
- `src/lib/device-pairing/__tests__/rfc9421-ecdsa-p1363.test.ts` — 5 tests.
- `src/lib/device-pairing/__tests__/rfc9421-payload.test.ts` — 9 tests (all 5 purposes, all 3 algorithms).
- `src/lib/device-pairing/__tests__/rfc9421-body-swap.test.ts` — 4 tests (MITM body swap).
- `src/lib/device-pairing/__tests__/rfc9421-target-uri.test.ts` — 6 tests (Host rewrite rejection).

Modified files:
- `vitest.config.unit.ts` — registered 6 new test files in the unit lane.

## Change Log

- 2026-09-08: Story 29.2 implemented — RFC 9421 canonical signing envelope verifier and helpers. 37 tests pass. Typecheck passes. Status → review.

---
