# Legacy runtime: scoped audit hotfix

This directory preserves the implementation patch and synthetic regression tests for a bounded repair to the older runtime still used by an existing deployment. It is **not** a replacement for the rebuilt `foundation/` source and is not a claim that the foundation has been deployed.

## Repair

- Use the selected PostgreSQL/RuVector graph adapter for health and append-only versioning diagnostics; remove retired Neo4j diagnostics from these audit responses.
- Carry tenant, workspace and principal authority from the authenticated MCP boundary into transaction-scoped audit queries. Caller arguments cannot select another workspace.
- Include workspace identity in curator-queue, event and agent-activity reads.
- Fail closed when authenticated workspace authority is absent or the selected graph backend cannot provide versioning diagnostics.
- Derive the MCP tool count from the gateway's actual registered tool list rather than a hard-coded count.
- Update the directly affected health contracts and settings consumers.

No database schema, dependency, credential, permission, automatic-promotion or approval-gate changes are included.

## Exact source applicability

`audit-runtime.patch` changes ten files in the legacy source tree. `base-source-sha256.json` identifies the required unpatched files; `patched-source-sha256.json` identifies the resulting files. The patch is byte-for-byte identical to the deployed implementation patch. Do not apply it to the current foundation, to a running application's files, or to a different legacy revision.

Use an **offline source export** of the matching runtime. The verifier rejects source mismatches before attempting a patch:

```sh
HOTFIX=/absolute/path/to/this/directory
EXPORT=/absolute/path/to/offline-legacy-export
python3 "$HOTFIX/verify-export.py" "$EXPORT" --apply
python3 "$HOTFIX/verify-export.py" "$EXPORT"
```

The utility verifies all ten original hashes, checks patch applicability, applies the patch, then verifies all ten resulting hashes. It does not build, deploy, connect to a database, or read credentials. It is not a substitute for deployment authorization, backups, or startup/migration safety checks.

## Regression tests

The tests use synthetic tenant, workspace and principal identifiers. Their queue counts are fixtures, **not operational tenant data**.

After patching an offline export, copy the test files into that export:

```sh
mkdir -p "$EXPORT/tests" "$EXPORT/src/mcp/__tests__"
cp "$HOTFIX/tests/audit-tools.behavioral.cjs" "$EXPORT/tests/"
cp "$HOTFIX/tests/audit-tools.workspace.test.ts" "$EXPORT/src/mcp/__tests__/"
cd "$EXPORT"
TYPESCRIPT_PATH=/absolute/path/to/installed/typescript node tests/audit-tools.behavioral.cjs
```

The dependency-free behavioral harness transpiles with an existing TypeScript installation and tests five cases using mocked database and graph boundaries. The registered Vitest file contains four tests; run it with the legacy runtime's installed Vitest dependencies, a Node environment and the `@` alias pointing to that export's `src` directory. Do not install or alter dependencies in a running container to run these tests.

## Verification and limits

The deployed derivative was built from the exact running image, preserving its original layer prefix and runtime configuration. Four focused Vitest tests and five offline behavioral cases passed. Live verification exercised health, invariant, event and agent-activity audits, existing-connector recovery after service replacement, memory access, and cross-tenant rejection. Catalog fingerprints were unchanged before and after deployment. These are bounded repair results, not a complete product, multi-tenant security, governance-correctness or launch-readiness certification.

The original image's full typecheck already failed because a benchmark runner imports an absent benchmark-contract file. The repaired image introduced no additional typecheck diagnostics. That unrelated packaging defect was not silently relabeled as a passing full typecheck.

Private records, backup contents, tenant/workspace bindings, hostnames, credential references, deployment configuration and detailed operational receipts are intentionally excluded from this public artifact. Human approval and tenant boundaries remain in force. Source publication does not authorize redeployment or credential renewal.
