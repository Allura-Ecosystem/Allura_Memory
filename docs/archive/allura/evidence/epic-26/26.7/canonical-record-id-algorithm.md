# Bumblebee Upstream Canonical Record-ID Algorithm (verified from pinned v0.1.2 source)

Source: `internal/model/model.go` (perplexityai/bumblebee @ cc57710eeaf685e7b89924a36c8583cad0a378fe), functions `StableID` / `stableID` / `joinWithUnitSeparator` / `canonicalCounts` / `joinSorted` / `boolPointerString`.

## Algorithm

```
record_id = recordType + ":" + hex( sha256( recordType + "\x00" + join(parts, "\x1e") ) )
```

- Separator between fields: `\x1e` (unit separator, `strings.Join`).
- Separator inside compound fields (sorted lists, roots, counts entries): `\x1f`.
- Missing/absent optional string fields contribute the **empty string** (never omitted).
- Absent bool pointer: empty string; present: `"true"`/`"false"`.
- Lists are sorted before joining (sort.Strings).

## Field order per record type

**package** (`Record.StableID`):
1. profile
2. ecosystem
3. normalized_name
4. version
5. project_path
6. root_kind
7. install_scope
8. package_manager
9. source_type
10. source_file
11. direct_dependency (bool pointer → empty when nil)
12. has_lifecycle_scripts (`strconv.FormatBool`)
13. lifecycle_scripts (sorted, `\x1f`-joined; empty string when none)
14. confidence
15. requested_spec
16. server_name

**finding** (`Finding.StableID`):
1. profile
2. finding_type
3. catalog_id
4. ecosystem
5. normalized_name
6. version
7. root_kind
8. project_path
9. source_type
10. source_file
11. confidence

**scan_summary** (`ScanSummary.StableID`):
1. profile
2. status
3. scan_time
4. end_time
5. roots: each `path + "\x1f" + kind`, `\x1e`-joined
6. counts: keys **sorted**, each `key + "\x1f" + strconv.Itoa(count)`, `\x1e`-joined (empty string when map empty)
7. package_records_emitted
8. package_records_suppressed
9. findings_emitted
10. duplicates
11. diagnostics_count
12. files_considered
13. timed_out (`FormatBool`)
14. duration_ms (`FormatInt`)
15. http_batches_attempted
16. http_batches_succeeded
17. http_batches_failed
18. http_last_status
19. error

**diagnostic** (`Diagnostic.StableID`):
1. level
2. path
3. message

## Ground-truth fixtures (from the pinned binary, committed at `scan-output-baseline.ndjson`)

- `package:3e34dec18064de515fd4866c86327ccf262d0d2573947a109620e8a1b59577be` — npm `left-pad@1.3.0`
- `package:1d9b1140470b155b4a9020b4989ac17a7e2d1b77b93cb160317764c5a30a1ee4` — npm `lodash@4.17.21`
- `scan_summary:658e099a808173188827b64bf126588b9815a87745d3198014f57aee803007eb`

These are the test assertions the conformance module's recomputation must reproduce exactly.

## Consequence for ingestion

The conformance module recomputes every record ID from the sanitized record's own fields and rejects a declared `record_id` that does not match (fail-closed). Because the algorithm hashes only scanner-derived public metadata (never the endpoint object), ID recomputation is compatible with endpoint stripping/redaction.