# B2 secure-key-store contract — Story 29.21 / AC-29

B2 (the desktop client repository) implements `ISecureKeyStore` from
`isecure-key-store.ts`. This repository has only the server contract and does
not implement OS adapters. Passing B2 tests are required before AC-29 runtime
acceptance can be claimed.

## Shared requirements

- The store owns the private key. It exposes only `getPublicKey`, `sign`, and
  `delete`; it has no private-key export/read method.
- `getPublicKey` returns SPKI PEM or canonical standard-base64 SPKI DER.
- B2 emits P-256 signatures as exactly 64-byte IEEE P1363 `r || s`; Ed25519 as
  exactly 64 raw bytes; and legacy RSA-PSS-2048 as exactly 256 bytes.
- A named key survives an application update/relaunch: the alias/identifier,
  algorithm, public SPKI, and ability to sign are retained.
- If the secure store is unavailable, locked, or unsupported, `getOrCreate`
  and `sign` fail closed. There is no plaintext private-key fallback on any
  platform.

## Required B2 CI evidence

### macOS Keychain

1. Create a named P-256 key, capture its public SPKI and a successful RFC 9421
   signature, simulate update/relaunch, then prove the same named key still
   supplies the same public SPKI and signs successfully.
2. Provide a non-exportability receipt: an attempted private-key export through
   the selected Keychain/Secure Enclave API fails. Record whether hardware-backed
   protection (T2/Apple Silicon) was available; the test must not manufacture a
   successful export path.
3. Disable or deny Keychain access and prove bridge initialization/signing fails
   without creating a PEM, DER, JSON, SQLite, preferences, cache, or temporary
   plaintext private-key file.

### Windows CNG

1. Create a named P-256 key, simulate update/relaunch, and prove alias,
   public SPKI, and signing continuity.
2. Provide a non-exportability receipt. With TPM-backed CNG, private-key export
   must fail. With software-backed CNG, record the CNG API-level non-exportable
   property and the provider used; do not claim TPM/hardware non-exportability.
3. Disable or deny CNG access and prove fail-closed behavior with no plaintext
   private-key artifact in files, registry-backed app state, caches, or temp
   directories.

### Linux libsecret (GNOME Keyring or KDE Wallet)

1. Store encrypted private-key bytes only in libsecret/Keyring or KDE Wallet,
   simulate update/relaunch, and prove alias, public SPKI, and signing continuity.
2. Prove access controls: a different Unix user/session cannot read or use the
   stored key material; the owning unlocked user/session can.
3. Linux **MUST NOT claim non-exportability**. libsecret/KWallet stores
   exportable bytes; its evidence is encrypted keyring storage plus access
   controls, not hardware/API non-exportability.
4. Disable or deny the keyring and prove the bridge fails closed with no
   plaintext private-key fallback anywhere on disk.

## B2 completion receipt

Attach per-platform CI logs/artifacts that identify OS version, secure-store
provider, test key alias, update/relaunch result, signature format/length, and
fail-closed scan result. A skipped test is not a pass. Until B2 supplies passing
macOS, Windows, and Linux evidence, AC-29 remains unaccepted.
