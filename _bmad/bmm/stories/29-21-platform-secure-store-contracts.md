# Story 29.21 — Platform Contract Tests — macOS, Windows, Linux Secure-Store Adapters (AC-29)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** F — Validation Evidence  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want platform contract tests for macOS Keychain, Windows CNG, and Linux libsecret secure-store adapters,
So that key persistence across application updates is proven on each platform, with capability-specific honesty (macOS/Windows non-exportable where supported; Linux encrypted-keyring + access-controls + no plaintext fallback, NOT claiming non-exportability).

## Outcome

The server-side key-format and signature contract is testable in this repository, while the desktop client receives one precise cross-platform secure-store test contract. AC-29 remains unaccepted until B2 supplies passing macOS, Windows, and Linux evidence.

**⚠️ Implementation prerequisite B2:** This story requires the **desktop client repository** (B2) with OS secure-store adapters. The architecture defines the server contract (§9.1, §9.2) and the `ISecureKeyStore` interface; the adapter implementations and platform tests live in the desktop client repo (B2). This story implements the **server-side contract tests** (RFC 9421 verification, key algorithm validation) in this repo, and defines the **client-adapter test contract** (§12.5) for B2 to implement. **No runtime acceptance for AC-29 is claimed in this document.**

**Scope:**
- **Server-side (this repo):** `src/lib/device-pairing/__tests__/platform/server-contract.test.ts` — verify the server accepts all 3 key algorithms (P-256 mandatory, Ed25519 optional, RSA-PSS legacy), validates PEM/SPKI public key format, and rejects invalid keys. Verify RFC 9421 verification works for all 3 signature byte formats (P-256 IEEE P1363 64-byte, Ed25519 raw 64-byte, RSA-PSS 256-byte).
- **Client-adapter contract (defined here, implemented in B2):** document the §12.5 test contract as a spec file `src/lib/device-pairing/contracts/secure-key-store-contract.md` — persistence (all platforms), non-exportable (macOS/Windows where supported), encrypted-keyring + access-controls (Linux), no plaintext fallback (all platforms). The desktop client repo (B2) implements the platform-specific tests.

**Dependencies:** Story 29.1, Story 29.2, Story 29.6, Story 29.7, Story 29.8, Story 29.9, Story 29.10, Story 29.12, Story 29.13, Story 29.14, Story 29.15; B2 desktop client repository is required for runtime acceptance of AC-29.

**Blocks:** None.

**Acceptance Criteria IDs:** AC-29 (macOS, Windows, and Linux adapter contract tests prove secure-store persistence across application updates; unsupported secure stores fail closed with no plaintext fallback). **No runtime acceptance claimed — gated on B2.**

**Architecture/ADR references:** §9.1 (server contract), §9.2 (client adapter contract + per-platform honesty), §12.1 (contract lane), §12.5 (platform contract tests), AD-60, MED-F1, consistency fix F.

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/__tests__/platform/server-contract.test.ts` — server-side key algorithm acceptance + RFC 9421 verification for all 3 formats.
- New: `src/lib/device-pairing/contracts/secure-key-store-contract.md` — `ISecureKeyStore` interface + §12.5 platform test contract for B2.
- New: `src/lib/device-pairing/contracts/isecure-key-store.ts` — TypeScript interface (mirror of §9.2) for B2 to implement.
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/platform/server-contract.test.ts` — server accepts P-256 (mandatory), Ed25519 (optional, advertised), RSA-PSS (legacy); rejects invalid PEM/SPKI; RFC 9421 verification works for all 3 byte formats; ECDSA P-256 IEEE P1363 normalization verified (DER→P1363).
- **Client-adapter tests (B2 — defined here, implemented in desktop client repo):**
  - **macOS:** persistence across "update" (alias retained, key retained); non-export test required (Keychain supports it) — attempt to export MUST fail.
  - **Windows:** persistence; non-export test required where TPM-backed; if software-backed CNG, document CNG API-level non-exportability honestly.
  - **Linux:** persistence; **MUST NOT claim non-exportability**; encrypted-keyring persistence (GNOME Keyring / KDE Wallet, not plaintext); access controls (only owning user/session); no plaintext fallback.
  - **All platforms:** no plaintext fallback — disable secure store → bridge fails closed → no `-----BEGIN PRIVATE KEY-----` file on disk.
- Server-side test runs in unit lane; client-adapter tests run in B2 CI.

**Governance/security evidence:**
- B2 is an explicit implementation prerequisite (architecture §14, final review §1 focus area 9).
- No runtime acceptance for AC-29 claimed in this document.
- Per-platform capability honesty (MED-F1, consistency fix F, §9.2):
  - macOS Keychain: non-exportable achieved (hardware-backed on T2/Apple Silicon).
  - Windows CNG/TPM: non-exportable achieved when TPM available; software-backed is CNG API-level non-exportable.
  - Linux libsecret: **non-exportable NOT achieved** — stores exportable bytes; test MUST NOT claim it.
- Unsupported secure store → fail closed, no plaintext fallback (AC-29, §9.2).
- ECDSA P-256 mandatory v1; Ed25519 optional; RSA-PSS legacy (AD-60, MED-F1).

**Rollback or failure behavior:** If a platform contract test fails (in B2), the B2 CI fails — the adapter bug must be fixed. If the server-side contract test fails (this repo), this repo's CI fails. No runtime rollback; these are CI gates.

**Definition of Done:**
- Server-side contract test passes (all 3 key algorithms + RFC 9421 formats).
- `ISecureKeyStore` interface + platform test contract documented for B2.
- `bun run typecheck` passes.
- **AC-29 runtime acceptance is NOT claimed by this document — it requires B2 evidence (client-adapter tests in the desktop client repo) at implementation time.**

**Non-goals:**
- No OS secure-store adapter implementation in this repo (B2 — desktop client repo).
- No claim of AC-29 runtime acceptance in this planning artifact.
- No hardware attestation / TPM policy / MDM (SPEC §12 non-goals).

---
