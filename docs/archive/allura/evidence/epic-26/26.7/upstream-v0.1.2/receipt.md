# Story 26.7 — Upstream Bumblebee v0.1.2 Execution Receipt

> [!NOTE]
> **AI-Assisted Documentation**
> This evidence receipt was assembled with AI assistance from command transcripts generated on 2026-08-28. The immutable hashes, exit codes, and aggregate scan facts below were captured from real local execution and must be independently reviewed with the implementation candidate.

## Scope

This bounded evidence slice verifies the pinned upstream source and official Linux archive provenance, installs a checksum-verified user-local Go toolchain, runs the upstream race-enabled Go suite, builds a source-pinned binary, executes its version and self-test commands, and performs one schema-compatible `npm` scan.

It does **not** implement or prove Allura scan leases, credential audiences, HTTPS ingestion, PostgreSQL ledgers, promotion, tenant isolation, or the headless end-to-end flow. No Story 26.7 acceptance checkbox advances from this slice alone.

## Immutable source and artifact provenance

| Fact | Verified value |
| --- | --- |
| Repository | `https://github.com/perplexityai/bumblebee.git` |
| Tag | `v0.1.2` |
| Tag object | `59f4ba1cece7b86a02651a7c140c27bf66823fbe` |
| Commit | `cc57710eeaf685e7b89924a36c8583cad0a378fe` |
| Tree | `985f57cf1749c15561c886c4476f10950ffa9cae` |
| Emitted schema | `0.1.0` |
| License | Apache-2.0; source `LICENSE` SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| Tag signature | Unsigned; `git verify-tag v0.1.2` exited `1` with `no signature found` |
| Official Linux amd64 archive | `bumblebee_0.1.2_linux_amd64.tar.gz` |
| Published and calculated archive SHA-256 | `53b080cf3ddb692b0c4e5492ef4785b4c54daf1624fcd0fcba3958116a0be8d9` |

The checkout was detached at the exact commit. `HEAD`, `v0.1.2^{commit}`, and the planned commit all resolved to the same value; `HEAD^{tree}` matched the planned tree.

The acquisition and pin verification used:

```text
git clone --filter=blob:none --no-checkout \
  https://github.com/perplexityai/bumblebee.git \
  /tmp/allura-bumblebee-v0.1.2
git -C /tmp/allura-bumblebee-v0.1.2 fetch --force origin tag v0.1.2
git -C /tmp/allura-bumblebee-v0.1.2 checkout --detach \
  cc57710eeaf685e7b89924a36c8583cad0a378fe
git -C /tmp/allura-bumblebee-v0.1.2 rev-parse HEAD HEAD^{tree} v0.1.2^{commit}
git -C /tmp/allura-bumblebee-v0.1.2 verify-tag v0.1.2
curl -fL \
  https://github.com/perplexityai/bumblebee/releases/download/v0.1.2/checksums.txt \
  -o /tmp/allura-bumblebee-evidence/upstream-checksums.txt
curl -fL \
  https://github.com/perplexityai/bumblebee/releases/download/v0.1.2/bumblebee_0.1.2_linux_amd64.tar.gz \
  -o /tmp/allura-bumblebee-evidence/bumblebee_0.1.2_linux_amd64.tar.gz
sha256sum /tmp/allura-bumblebee-evidence/bumblebee_0.1.2_linux_amd64.tar.gz
```

The pinned source contains a known version-file discrepancy: `VERSION` says `0.1.1` while tag and release are `v0.1.2`. The build therefore reproduced the upstream GoReleaser contract by explicitly setting `-X main.Version=v0.1.2`; it did not infer or silently repair the source token.

## Toolchain provenance

The host package repository offered Go 1.22, which is below the upstream `go 1.25` requirement. With no non-interactive sudo, the official `go1.25.7.linux-amd64.tar.gz` archive was installed under a user-local toolchain directory. Its Go-published and calculated SHA-256 values both matched:

`12e6d6a191091ae27dc31f6efc630e3a3b8ba409baf3573d955b196fdf086005`

Runtime verification returned `go version go1.25.7 linux/amd64`. Execution used `GOTOOLCHAIN=local` to prevent an implicit toolchain substitution.

## Real execution evidence

### Upstream tests

```text
go test -race ./...
23 packages passed
exit code 0
```

The exact package transcript is retained in [`go-test-race.txt`](go-test-race.txt).

### Source build and identity

```text
CGO_ENABLED=0 go build -trimpath \
  -ldflags '-s -w -X main.Version=v0.1.2' \
  -o /tmp/allura-bumblebee-evidence/dist/bumblebee \
  ./cmd/bumblebee
```

- Build exit: `0`
- Built binary SHA-256: `19e3e4a4af878c983ccd06206ec8d31fbf904f901f6b24614182c5cd946345b4`
- `bumblebee version`: `v0.1.2`, commit `cc57710eeaf685e7b89924a36c8583cad0a378fe`, Go `go1.25.7`, exit `0`
- `bumblebee selftest`: `selftest OK (5 findings in 2ms)`, exit `0`

The build, version, and self-test transcript is retained in [`build-version-selftest.txt`](build-version-selftest.txt).

### Representative schema-compatible scan

The scan was intentionally restricted to the pinned upstream fake npm fixture and `--ecosystem npm`. It did not supply a catalog or `--findings-only`, so it exercised inventory emission without entering the known finding-enum drift around `homebrew` or the package/finding omission of `agent-skill`.

```text
bumblebee scan \
  --profile project \
  --root <pinned-checkout>/cmd/bumblebee/selftest/fixtures/npm-fixture \
  --ecosystem npm \
  --max-duration 30s \
  --concurrency 1 \
  --output file \
  --output-file <ephemeral>/representative-scan.ndjson
```

Verified aggregate facts:

- Exit `0`
- Two records: one `package`, one trailing `scan_summary`
- Every record used schema `0.1.0`, scanner `bumblebee`, and scanner version `v0.1.2`
- The package ecosystem was exactly `npm`
- One unique `run_id` spanned the records
- Summary status `complete`, one package, zero findings, zero diagnostics, and `timed_out=false`
- Structural compatibility assertion returned `true`
- Raw NDJSON SHA-256: `716d03bcd95ab0c56193b81e3818288c3c09d683dad05d0ec09f021b6cf9b425`

The retained structural assertion was evaluated with:

```text
jq -e -s '
  length > 0 and
  all(.[]; .schema_version == "0.1.0") and
  all(.[] | select(.record_type == "package"); .ecosystem == "npm") and
  all(.[]; .record_type == "package" or .record_type == "scan_summary") and
  (.[-1].record_type == "scan_summary") and
  (.[-1].status == "complete")
' /tmp/allura-bumblebee-evidence/representative-scan.ndjson
```

Raw NDJSON is deliberately not committed because upstream records include endpoint and source-path fields. The privacy-safe aggregate and hashes are retained in [`representative-scan-summary.txt`](representative-scan-summary.txt).

## Compatibility decision retained

The reviewed contract remains fail-closed:

- Package-compatible ecosystems: `npm`, `pypi`, `go`, `rubygems`, `packagist`, `mcp`, `editor-extension`, `browser-extension`, `homebrew`.
- Finding-compatible ecosystems exclude `homebrew`.
- `agent-skill` is rejected for both package and finding records under emitted schema `0.1.0`.
- An empty ecosystem filter remains invalid because upstream interprets it as all code-supported ecosystems, including the schema-drifted `agent-skill` value.

## Evidence boundary

These files are tracked evidence, not a claim that the official release tag is cryptographically signed, not a release-binary reproducibility claim, and not proof of the remaining Allura plugin acceptance criteria. The binary, downloaded archives, cloned source, and raw scan output remain ephemeral and are not committed.
