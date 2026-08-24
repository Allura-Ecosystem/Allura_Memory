# Neo4j Sunset Integrity Gate Contract

**Target script:** `scripts/verify-neo4j-sunset.ts`
**Status:** Required by Story 25.1; read-only verification only.
**Authority:** AD-50, AD-57.

## Purpose

Prevent a PostgreSQL-only Allura implementation from quietly retaining Neo4j as an active runtime dependency, public contract, policy permission, health requirement, or implementation instruction.

The gate does **not** delete files, database data, Docker volumes, images, or containers. Destructive retirement is a separate, explicitly approved operation after verified backup evidence.

## Inputs

- repository root;
- allowlist of historical paths and phrases;
- optional Docker inspection when Docker is available.

## Classification

| Class | Examples | Gate behavior |
|---|---|---|
| Active executable source | imports, driver deps, env vars, route handlers, health probes, MCP tool registration | fail |
| Active contracts/config | schemas, policy YAML, public SDK types, compose service definitions | fail |
| Active operator docs | current architecture, runbooks, quickstarts, dashboard docs | fail |
| Generated output | build output, package dist | report; fail when source is clean but generated output remains stale |
| Historical records | `docs/archive/**`, dated migration receipts, AD-50, explicit `Neo4j sunset` comments | allow |
| Docker residue | stopped containers, images, named volumes | report separately; never delete |

## Required Checks

1. `package.json` and lockfiles do not retain `neo4j-driver` as an active dependency.
2. Active source has no `neo4j-driver` import, `NEO4J_*` runtime config, or Neo4j client/health/backend selection.
3. Active policies do not grant `database:neo4j`, `tool:neo4j.query`, or `tool:neo4j.mutate`.
4. Active schemas, API responses, SDK types, and docs describe PostgreSQL graph tables, not promotion into Neo4j.
5. Tests use PostgreSQL fixtures/contracts, not Neo4j mocks that preserve a dead public path.
6. Historical references are preserved and explicitly marked sunset/migration context.
7. Docker containers/images/volumes are reported as residue, with backup references if present.

## Output Contract

```json
{
  "status": "pass | fail",
  "active_runtime_violations": [{ "path": "", "line": 0, "match": "" }],
  "active_contract_violations": [],
  "active_doc_violations": [],
  "generated_residue": [],
  "allowed_historical_references": [],
  "docker_residue": {
    "containers": [],
    "images": [],
    "volumes": []
  },
  "recommended_actions": []
}
```

Exit `0` only when all active violation arrays are empty. Docker residue alone is non-zero only when the caller passes `--require-no-residue` after backup-and-destroy approval.

## Validation

- Unit fixtures cover active, historical, generated, and Docker-residue classifications.
- CI runs the gate before documentation truth or public-readiness claims can pass.
- Story 25.1 records the baseline report; Epic 25 may not claim Neo4j is fully retired until the gate passes.
