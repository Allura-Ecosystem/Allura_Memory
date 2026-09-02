# Upstream Pin & Schema Compatibility

## Pinned Scanner

The plugin integrates with exactly one upstream scanner release:

| Field | Value |
|-------|-------|
| Repository | [`perplexityai/bumblebee`](https://github.com/perplexityai/bumblebee) |
| Tag | `v0.1.2` |
| Commit | `cc57710eeaf685e7b89924a36c8583cad0a378fe` |
| Tree | `985f57cf1749c15561c886c4476f10950ffa9cae` |
| Emitted record schema | `0.1.0` |
| License | Apache-2.0 |
| Tag signature | None found during review |

The pin is defined in `upstream-contract.ts` as `BUMBLEBEE_UPSTREAM_PIN` (frozen object) and enforced in `source-authority.ts` → `createSourceRevision()`. Any source revision whose scanner tag, commit, or tree doesn't match is rejected with `BUMBLEBEE_SOURCE_SCANNER_PIN_MISMATCH`.

## Record Schema

The pinned scanner emits four record types as NDJSON (one JSON object per line):

| Record type | Purpose |
|-------------|---------|
| `package` | An installed package with ecosystem, name, version, source, lifecycle scripts |
| `finding` | A vulnerability finding with catalog ID, ecosystem, name, finding type |
| `scan_summary` | Trailing summary with status, counts, roots, timing, HTTP batch stats |
| `diagnostic` | A diagnostic message (level, path, message) |

Every record carries:
- `record_id` — `<type>:<sha256>` computed from canonical inputs (the plugin recomputes and verifies this)
- `run_id` — 32-char hex, shared across all records in one scan run
- `schema_version` — must be `0.1.0`

## Ecosystem Allowlists

The pinned schema supports different ecosystems depending on whether findings are emitted:

### Inventory ecosystems (package records)

`npm`, `pypi`, `go`, `rubygems`, `packagist`, `mcp`, `editor-extension`, `browser-extension`, `homebrew`

### Finding ecosystems (finding records)

`npm`, `pypi`, `go`, `rubygems`, `packagist`, `mcp`, `editor-extension`, `browser-extension`

**Note:** `homebrew` is absent from the finding allowlist — the pinned finding schema omits it. The plugin does not silently relax validation.

## Scan Modes

| Mode | Description |
|------|-------------|
| `inventory` | Full package inventory scan (packages + diagnostics + summary) |
| `findings-only` | Vulnerability findings only (findings + diagnostics + summary) — requires `findingsEnabled: true` |

## Scan Profiles

| Profile | Classification | Replaces inventory? |
|---------|---------------|-------------------|
| `baseline` | Routine | Yes — if complete |
| `project` | Routine | Yes — if complete; may be unioned with baseline |
| `deep` | Campaign evidence | Never — held as triage/correlation evidence |

## Compatibility Restrictions

The pinned code can emit `agent-skill` as an ecosystem, but the pinned package/finding schemas omit that enum. The finding schema also omits `homebrew`. **V1 must not silently relax validation.** The source population contract must restrict scanner ecosystems and finding modes to the reviewed schema-compatible allowlist until a corrected upstream schema or separately reviewed compatibility schema is adopted.

Catalog schema version and emitted record schema version are **separate contracts** — a catalog revision may carry its own schema version independent of the scanner's emitted record schema.

## Artifact Checksum

The upstream binary's artifact SHA-256 must be captured and verified by Story 26.7 before acceptance. The `createSourceRevision()` function requires a valid 64-character hex SHA-256 for `scanner.artifactSha256`.