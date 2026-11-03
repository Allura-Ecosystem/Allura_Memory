---
title: '8.3 Real Linux secure-store and client lifecycle witness'
type: feature
created: 2026-10-27
status: done
route: dispatch
baseline_commit: 4e0ace5dbf4ffe8851fa929645ae892958e25ae9
---
# Intent and exact platform contract

Exercise accepted8.2 with real persistent clients and OS secure storage, not simulated keys. Current shipped core supports Linux; first supported client platform is Linux Secret Service via installed `/usr/bin/secret-tool` (libsecret), actual GNOME Keyring and local Unix D-Bus. Windows Credential Manager/macOS Keychain are NOT implemented or claimed; no silent plaintext/in-memory fallback. This is a delegated engineering platform choice matching the current Linux runtime, not a claim Sabir mandated a specific vendor. Product human approval/current owner authority and explicit scope remain unchanged.

Tests MUST use isolated owned HOME/XDG directories, private bus socket under scratch and synthetic generated credentials; never read/write the Captain's existing vault, active session bus, login passwords or other app/profile items. No global daemon/configuration changes. All owned children terminate and temporary resources clean up in finally. Missing/locked/unavailable real platform fails acceptance, never substitutes a simulator. No deployment authority.

## Tasks and acceptance

- [x] `foundation/src/device-secret-store.ts`: real libsecret adapter, fixed executable/no shell, secret bytes via stdin only, bounded output/time, sanitized errors, no credential argv/env/plaintext files. Scope key binds canonical endpoint, allura tenant, workspace and explicit local profile UUID; labels contain no secret. Actual read-back confirms persistence. No cross-tenant lookup, silent fallback or secret console output.
- [x] `foundation/tests/device-secret-store.test.ts`: actual private DBus+GNOME Keyring, write/read/delete across adapter/process restart, scoped isolation, missing bus/invalid scope/oversized values, concurrent distinct slots and locked/missing store failures. Mandatory platform discovery/CI prerequisites, no skips.
- [x] Durable client adapter consumes that store, pre-stores pending exchange/rotation secrets, reconciles public receipts, connects real MCP SDK and stops on current401/403. Human session remains separate and ephemeral; no bearer-to-human conversion.
- [x] Real combined restricted PostgreSQL+HTTP+OS-store witness: enroll/admin approve/exchange, client restart, capture evidence-only, replacement rotation, demotion/removal/lock/revoke/expiry, foreign scope and concurrent attempts. No plaintext synthetic credentials in owned keyring files/client argv/captured output.
- [x] Full gates and exact-source CI; actual concise Epic8 retrospective before9. Do not close8.3/Epic8 from adapter-only tests.

## Current handoff

8.2 exact implementation3159501aaf852bb957772350f6c5f95eac28c307 passed169tests/1445assertions; acceptance-only docs commit4e0ace5dbf4ffe8851fa929645ae892958e25ae9. Native Brooks/Woz guidance/build route reused. Installed Linux binaries discovered read-only; secret-tool help exit2 is normal usage output, not successful storage. Implement secure-store first under isolated actual platform resources, then durable client/integration.6.5 deployment-only gates remain open; no optional7/deferred12–14 adoption.

## Implemented evidence and adopted local decisions

`foundation/src/device-client.ts` exports PersistentDevice through packed consumer `./device`; real installed Node processes exercise it. Same-profile mutations use a kernel lock, independent profiles do not contend, process death releases it. Atomic secure-store reads remain lock-free so concurrent MCP initialization does not collide with itself; stale generations still fail at the server. All begin/complete/rotate/revoke payloads are pre-stored and explicitly replayed after response loss; no automatic reset/retry. Expired/abandoned enrollment requires an explicit fresh profile/current human enrollment, not a local clear masquerading as remote revocation. Read the packed README for host dependencies, exact calls and same-OS-user boundary.

Admission16 TDD/raw logs in direct-build Operations: store/client red tests, focused actual disposable PostgreSQL checks, full1 failure caused by file-URL/path test mismatch, full2 passing, then induced cross-profile lock failure and corrected full3. Original `flock 3 command` treated3 as a filename; final inherited `/proc/self/fd/3` targets the verified private slot inode. Verified empty generated foundation/3 was removed, not ignored. Final `admission16-full3.log`: `bun run check:all` exit0 at2026-10-27T14:45:21-04:00,172tests/1506assertions (unit44/397 DB128/1109), typecheck/lint and required discovery pass. Admission17 verified all15 checkpoint hashes and read the complete staged diff in `admission17-device-candidate.diff`, no independent reviewer. Exact clean-source CI and Epic8 retrospective remain the final gate; do not claim hosted/deployed/human/Windows/macOS acceptance.

## Exact local acceptance — supersedes the pending gate above

Clean runtime `77d4079a0912e642dbfc9db39c34c59fe741ee12`: `ALLURA_CI_OUTPUT=<Operations>/admission17-ci-attempts bun run ci 77d4079a0912e642dbfc9db39c34c59fe741ee12`, exit0 at2026-10-27T15:02:48-04:00;172tests/1506assertions. `admission17-exact-ci.log` and `admission17-ci-attempts/allura-ci-BU3I9j/attempt.json`: all six same-invocation source/exits/log digests verified, native model and frozen install included. Both extracted artifact receipts bind that exact clean SHA; archives copied and rehashed under Operations `releases/77d4079a0912e642dbfc9db39c34c59fe741ee12/` (consumer subdirectory). [Epic8 retrospective](epic-8-retro-2026-10-27.md) records local acceptance, actual faults/fixes and deployment/platform limits. This does not close6.5/Epic6 or imply a deployed/actual-human witness.
