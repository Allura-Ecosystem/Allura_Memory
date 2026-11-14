# Legacy runtime: scoped `memory_export` repair preservation

This directory preserves a **tested legacy-runtime candidate**, not a foundation implementation or a deployment acceptance receipt. It follows the adjacent legacy audit/retrieval preservation layout. The rebuilt main branch intentionally has no retired `src/` tree; do not restore one to run these tests. Publication neither deploys the patch nor widens any permission.

## Contents and applicability

- `memory-export-repair.patch`: exact source-only change to `src/mcp/canonical-tools.ts` plus new `src/mcp/canonical-tools/scoped-export.ts`. Final cancellation-safe patch SHA-256: `56b78a161bebd621e9504d9dbe12eb97350bbc31bb91c0e2326b914da4876bcb`.
- `base-source-sha256.json` / `patched-source-sha256.json`: exact two-file applicability/output hashes, including required absence of the new helper before application.
- `baseline-context-sha256.json`: relative paths and hashes for 21 original source/package context files used by the tests. Baseline context is deliberately **not copied into Git**. A matching offline runtime source export is required; the new main checkout or archived old-main revision alone is not a substitute.
- `tests/`, `scripts/`, config, package and lockfile: portable synthetic tests and reproducible verifier. Test principals are synthetic. No dependency cache, runtime receipt, generated log or private runtime identity is publication evidence.
- `REVIEW.md`: independent access/pagination/error review, preserving the original P2 cancellation finding and its verified correction, plus the remaining P3 conservative availability limitation. The final supplied candidate is preserved exactly; packaging does not silently change its source.
- `bundle-sha256.json` / `verify-bundle.py`: exact publication inventory and an offline host-path/runtime-reference check. A separate secret scanner is still required.

The patch replaces the retired graph export call with explicit scoped PostgreSQL SQL. It keeps the existing restricted pool, authenticated transport guard and tenant/workspace/principal transaction helper. Canonical-only reads current semantic data only. Both mode merges current workspace-visible semantic and principal-scoped episodic evidence, with semantic precedence by memory ID **before** pagination. Missing authority and authorization failures fail closed. SQLSTATE `57014` cancellation anywhere in a cycle-safe cause chain throws `DatabaseQueryError`, never a successful partial export; authorization detection retains priority. Other classified unavailability may return an explicitly incomplete surviving source; neither source succeeding throws. The inherited classifier is not proof of a literal connection outage. See the review before interpreting error metadata.

No schema migration, index rebuild, embedding operation, live memory mutation, credential operation, token change or grant change is part of this bundle.

## Compatibility changes requiring explicit review

1. Stable **ascending UTF-8 bytewise memory ID** order replaces the old per-store creation-time order. Counts describe the merged returned page.
2. Offset must be a safe integer from 0 through **100000**. Default returned limit remains 1000; maximum is 10000. Each source reads at most `offset + min(limit,10000) + 1` rows (110001 at the maximum). This is not a byte-size or query-work guarantee. Larger exports require a new cursor design.
3. Healthy truncation uses `export_page_limited`/`incomplete`, not an outage warning. Independent source transactions and offset pages are not snapshot isolated; concurrent writes can move records between pages.
4. Workspace-less legacy data is excluded, not reassigned. Episodic evidence is principal-only; semantic data retains existing workspace sharing unless an explicit verified-principal selector narrows it.

## Reproduce safely

Prerequisites: Python 3.10+, GNU `patch`, Git, and the repository-pinned Node.js **24.19.0** on `PATH` with npm. This harness uses the included exact npm lockfile, independently of foundation's Bun dependency graph. Install only in this artifact directory, with lifecycle scripts disabled:

```sh
cd /path/to/legacy-runtime-export-repair
npm ci --ignore-scripts --no-audit --no-fund
python3 verify-bundle.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/validate.py /path/to/matching-offline-runtime-baseline
```

`validate.py` verifies all 21 baseline hashes, requires the new helper to be absent, copies **only** the allowlisted files to a fresh owned `.validation/run-*` directory, checks/applies the exact patch there, and verifies both output hashes. It then runs tests, changed-file syntax/transpilation checks and a focused strict TypeScript check. It re-verifies the caller's baseline unchanged. It never edits the supplied baseline, regenerates the preserved patch, reads credentials or connects to an external database. Dependencies and generated diagnostics are ignored by Git. Direct raw-tree Vitest/typechecking is not meaningful: `base/`, `candidate/` and `evidence/` exist only in the generated run directory.

To apply to a **separately prepared disposable offline export**:

```sh
python3 verify-export.py /path/to/disposable-offline-export --apply
python3 verify-export.py /path/to/disposable-offline-export
```

Unlike validation, `--apply` intentionally changes the named offline export. Never point it at foundation, installed/running source, an unreviewed revision or a database. It rejects mismatched hashes, existing new source, symlinks and unsafe manifest paths. It does not build or deploy.

Secret scanning should cover only the publication inventory (not dependency caches or copied private context). For Gitleaks 8.30.1, construct a disposable directory from the relative filenames in `bundle-sha256.json`, plus that manifest, then run:

```sh
gitleaks dir /path/to/disposable-publication-inventory --no-banner --redact --exit-code 1
```

Run a second scan on byte-identical copies named `payload-000.txt`, `payload-001.txt`, etc. Include **every inventory entry and `bundle-sha256.json`**, including `package-lock.json`; extension-neutral filenames prevent default path rules from silently excluding lockfile content. Keep both scan reports outside the publication inventory.

## Verified locally

The relocated bundle was exercised using Node 24.19.0, npm 11.17.0, TypeScript 5.9.2 and Vitest 2.1.9:

- **73 Vitest tests passed**: 19 embedded PostgreSQL SQL/RLS, 48 unit/mock-executor and 2 real copied-adapter/legacy-handler characterizations, plus 4 independent review cases. The six added unit cases cover direct/wrapped/preclassified/cyclic cancellation, canonical-only rejection and second-source cancellation discarding the earlier result. The independent cancellation regression also checks permission-first precedence in mixed cause chains.
- **9 dependency-free Python verifier safety tests passed**.
- Focused strict TypeScript check and both changed-file syntax checks exited 0.
- Exact source-only patch dry-run/application and both resulting hashes passed; all 21 supplied baseline context hashes remained unchanged.
- Publication inventory/hash and host-path/runtime-reference checks passed. Gitleaks 8.30.1 found no leaks in the publication payload; a second extension-neutral scan included lockfile contents normally skipped by default path rules. No private runtime receipt or dependency tree was scanned as publication evidence.

These results are bounded. The main SQL fixture is a minimal authored PGlite schema, not the complete migrations or deployed policy set. The review fixture additionally checks actual archived TEXT IDs, TEXT[] tags and REAL score shapes, but does not remove that limitation. Wrapper tests execute exact TypeScript-AST-extracted `memory_export`/`tenantPgQuery` functions, the real scoped service, guard and transaction helper; unrelated full-module imports and the full HTTP server are not exercised. Outage tests inject errors, not real outages. The full application build/typecheck, full-schema/server integration, hosted CI, production latency, deployment and live connector acceptance are **not claimed here**.

The original private runtime-drift observations are intentionally not included or replayed. This bundle's hashes establish offline source compatibility, not the current identity or state of any service. Controlled deployment and integration evidence remain separately owned and must account for the remaining review limitation. No staging, commit, push or runtime operation was performed to prepare this preservation bundle. Protected main CI must validate the exact published revision separately; no production acceptance is claimed.
