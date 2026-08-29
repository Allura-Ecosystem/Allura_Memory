# Regulated Document-Quality Workflow — Reference Integration

## Scenario

A regulated document-quality workflow uses synthetic documents, tenant
isolation, human approval, canonical promotion, and audit export. **Human
final authority is preserved** — generated output is never presented as an
autonomous decision.

## Principal/Tenant Fixture

- Principal: `doc-curator` (role: curator)
- Tenant: `allura-regulated-docs`

## Tools

- `memory_search` — retrieve synthetic documents
- `governance_proposal_approve` — human-gated approval (POL-004)
- `audit_export` — compliance evidence export

## Policies

- `pol-004` — approval requires curator/admin role
- `pol-001` — cross-tenant access denied

## Scenarios (runnable)

| File | Case | Expected |
|------|------|----------|
| `scenarios/success.json` | Success: synthetic doc approved by human, promoted, audit exported | `completed` |
| `scenarios/cross-tenant-denial.json` | Security failure: cross-tenant access denied | `failed` (TENANT_MISMATCH) |
| `scenarios/recovery.json` | Recovery: transient approval-service failure retried | `completed` |

## Run

```bash
# From the repo root, with the local stack up:
set -a && source .env.local && set +a
bun run scripts/harness.ts examples/regulated-document-quality/scenarios/success.json
bun run scripts/harness.ts examples/regulated-document-quality/scenarios/cross-tenant-denial.json
bun run scripts/harness.ts examples/regulated-document-quality/scenarios/recovery.json
```

## Expected Evidence

- One success case: human-approved promotion with audit export
- One policy failure: cross-tenant access denied (TENANT_MISMATCH)
- One recovery case: transient failure retried via checkpoint resume

## Human Authority

This workflow is a **reference implementation**, not a customer deployment
or a claim of bank approval. Every promotion requires an explicit human
approval breakpoint; no generated output is presented as an autonomous
decision.

## Cleanup

All test data is cleaned after the scenario completes (`tenant_fixture.cleanup: true`).
