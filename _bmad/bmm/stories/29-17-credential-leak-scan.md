# Story 29.17 — Automated Credential Leak Scan (AC-25)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** E — Audit and Credential Hygiene  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want an automated scan that proves no event metadata, application log, API error response, or test artifact contains private keys, raw MCP tokens, Clerk tokens, PKCE verifiers, unconsumed challenges, or rotation secrets,
So that credential hygiene is continuously verified and any leak is caught in CI before deployment.

## Outcome

A CI gate proves that no credentials leak into events/logs/errors/artifacts — the user's private key, raw MCP token, Clerk session, PKCE verifier, or challenge nonce never appears in any persisted record (AC-25).

**Scope:** Implement `src/lib/device-pairing/__tests__/credential-leak-scan.test.ts` — scans all `events.metadata` columns for patterns: `-----BEGIN PRIVATE KEY-----`, `allura_mcp_`, `sk_`, `pk_`, PKCE verifier patterns, unconsumed challenge nonces, rotation secrets. Scans application log fixtures and API error response fixtures. Runs in CI as part of `bun run test:all`. Also add a `bun run scan:credentials` script that can be run standalone.

**Dependencies:** Story 29.16

**Blocks:** Story 29.18

**Acceptance Criteria IDs:** AC-25 (automated scans prove no event, application log, API error, or test artifact contains private keys or raw credentials).

**Architecture/ADR references:** §11.2 (credential redaction), §12.1 (test lanes — AC-25 is unit lane).

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/__tests__/credential-leak-scan.test.ts`
- New: `scripts/scan-credentials.ts` — standalone scanner.
- Extended: `package.json` — add `"scan:credentials": "bun scripts/scan-credentials.ts"`.
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/credential-leak-scan.test.ts` — scans `events.metadata` for all forbidden patterns; scans test fixtures; scans API error response snapshots; fails on any match.
- `src/lib/device-pairing/__tests__/audit-redaction.test.ts` (from Story 29.16 — verify here that the scan covers all 13 event families).
- Unit lane + CI integration.

**Governance/security evidence:**
- Automated scan runs in CI as part of `bun run test:all` (§11.2, AC-25).
- Forbidden patterns: private keys, raw MCP tokens (`allura_mcp_`), Clerk tokens (`sk_`, `pk_`), PKCE verifiers, unconsumed challenges, rotation secrets (§11.2).
- Allowlisted audit projection — same pattern as `buildAuthAuditEvent` (§11.2).
- Process-memory compromise is outside this epic (THREAT-MODEL.md residual risk).

**Rollback or failure behavior:** If the scan finds a leak, CI fails — the leak must be fixed before merge. No runtime rollback; this is a CI gate.

**Definition of Done:**
- `credential-leak-scan.test.ts` passes (finds no leaks in current codebase).
- `bun run scan:credentials` runs standalone.
- CI integrates the scan into `bun run test:all`.
- All 13 event families scanned.
- `bun run typecheck` passes.

**Non-goals:**
- No process-memory scan (out of scope — THREAT-MODEL.md residual risk).
- No external secret scanning service (e.g., GitHub Secret Scanning) — this is an internal Allura-specific scan.
- No fix for leaks in other epics' code (this story provides the scanner; leaks found must be fixed in their respective stories).

---
