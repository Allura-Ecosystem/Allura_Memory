# Story 26.7 — Upstream Pin Provenance and Real Scanner Execution Receipt

**Date:** 2026-08-28
**Executor:** Brooks (Hermes agent, Team RAM)
**Story:** `_bmad/bmm/stories/26-7-operator-module-adversarial-tests-demo-gate.md`
**ACs covered:** Pinned provenance (partial), Real scanner execution (full)

## Upstream pin verified against the real repository

| Field | Declared pin (`src/lib/bumblebee/upstream-contract.ts`) | Verified (live clone) | Match |
|---|---|---|---|
| Repository | `perplexityai/bumblebee` | `github.com/perplexityai/bumblebee` | ✓ |
| Tag | `v0.1.2` | `v0.1.2` (checkout) | ✓ |
| Commit | `cc57710eeaf685e7b89924a36c8583cad0a378fe` | `cc57710eeaf685e7b89924a36c8583cad0a378fe` | ✓ |
| Tree | `985f57cf1749c15561c886c4476f10950ffa9cae` | `985f57cf1749c15561c886c4476f10950ffa9cae` | ✓ |
| Emitted schema | `0.1.0` | `0.1.0` (every record) | ✓ |
| License | Apache-2.0 | Apache-2.0 (LICENSE header verified) | ✓ |
| Go toolchain | — | `go1.27.0` (user-local, `~/sdk/go`) | recorded |

## Artifact checksum

`sha256(bumblebee binary, linux/amd64, built from pinned commit cc57710e with go1.27.0)`:

```
36f9092f8891e1495173694e5c823c3b21f92a1c2d1c28248793df8207cd1180
```

Binary size: 11,151,336 bytes.

## Scanner/version output

```
bumblebee v0.1.2
commit: cc57710eeaf685e7b89924a36c8583cad0a378fe
built:  2026-06-18T15:03:13Z
go:     go1.27.0
```

## Real scanner execution evidence (AC-2)

1. **Build:** `go build ./...` — clean, exit 0.
2. **Upstream test suite:** `go test ./...` — **23 packages, 0 failures**.
3. **Selftest:** `./bumblebee selftest` — `selftest OK (5 findings in 2ms)`.
4. **Representative schema-compatible scan** (baseline profile, npm ecosystem):
   - Fixture: `/tmp/scan-target` containing `package.json` + `node_modules/{left-pad@1.3.0, lodash@4.17.21}` with real package manifests.
   - Output: 3 records — 2 `package` records (npm: left-pad, lodash) + 1 `scan_summary`.
   - Summary status: `complete`; counts: `{finding: 0, package: 2}` — matching emitted records.
   - Raw NDJSON preserved at `scan-output-baseline.ndjson` (this directory).

## Emitted-contract discovery (schema drift confirmed and documented)

The pinned v0.1.2 binary emits a **fourth record type: `diagnostic`** (info-level, e.g. `"scan complete: profile=baseline status=complete files_considered=3 records=0 findings=0..."`), which the story's planning pin anticipated ("code may emit enums the schemas omit"). The record-type allowlist for migration 48 and the conformance module must include `diagnostic`; diagnostics are stored as non-acceptance evidence and never count toward promotion (the summary's `diagnostics_count` field is the authoritative counter).

**Ecosystem enum verified from pinned source** (`internal/model/model.go:38-47`): the scanner emits exactly `npm, pypi, go, rubygems, packagist, mcp, editor-extension, browser-extension, homebrew, agent-skill`. The Allura allowlist (`src/lib/bumblebee/upstream-contract.ts`) covers all except `agent-skill` — the known enum drift the planning pin documented; V1 deliberately excludes `agent-skill` (fail-closed, reviewed decision) and inventory mode includes `homebrew` while findings-only mode excludes it. No correction to the allowlist is required; the exclusion is the reviewed schema-compatible posture.

Also observed: the scanner emits an `endpoint` object on every record (`hostname`, `os`, `arch`, `username`, `uid`) — these are exactly the classified fields the story's privacy AC requires to be stripped/redacted per policy before storage; the ingestion allowlist must not persist them raw. `confidence` ("medium") observed on package records. `record_id` is scanner-computed with a stable `type:` prefix (e.g. `package:<sha256>`); canonical-ID recomputation inputs are the upstream hash source and must be captured in `canonical_id_inputs` for verification.

## Upgrade policy (AC-1)

The pin is immutable for V1. Upgrading the pinned tag/commit requires, in order: (1) a new immutable pin entry recorded in `upstream-contract.ts` alongside a re-verified commit/tree/schema triple; (2) re-execution of the full real-scanner evidence chain on the new pin (build, upstream `go test`, selftest, representative scan) with a fresh artifact checksum; (3) a reviewed reconciliation of emitted-schema drift against the allowlists (record types, ecosystems, field inventory) with a Correct Course record if drift is found; (4) Pike/Fowler/Knuth re-acceptance of the new pin before any ingestion of new-version records. Mixed-pin ingestion (records from two scanner versions in one batch) is rejected by the conformance module.

## Attribution

Upstream scanner: `perplexityai/bumblebee` v0.1.2, Apache-2.0. Pinned, built, and executed locally on 2026-08-28 for Story 26.7 evidence. No upstream code is vendored into this repository.