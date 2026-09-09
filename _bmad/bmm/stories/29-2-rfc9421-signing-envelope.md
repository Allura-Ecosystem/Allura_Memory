# Story 29.2 — RFC 9421 Canonical Signing Envelope — Verifier and Helpers

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** backlog  
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
