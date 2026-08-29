# Engineering Review Agent — Reference Integration

## Scenario

An engineering review agent retrieves approved standards, records tool evidence,
and requires a quality gate before completion.

## Principal/Tenant Fixture

- Principal: `review-agent` (role: curator)
- Tenant: `allura-engineering-review`

## Tools

- `memory_search` — retrieve approved standards
- `memory_add` — record review evidence
- `governance_proposal_approve` — quality gate approval

## Policies

- `pol-004` — approval requires curator/admin role; viewer denial is expected

## Scenarios (runnable)

| File | Case | Expected |
|------|------|----------|
| `scenarios/success.json` | Success: standards retrieved, evidence recorded, gate approved | `completed` |
| `scenarios/policy-denial.json` | Policy failure: viewer attempts approval, denied (POL-004) | `failed` (POLICY_DENIED) |
| `scenarios/recovery.json` | Recovery: transient evidence-store failure retried via checkpoint | `completed` |

## Run

```bash
# From the repo root, with the local stack up:
set -a && source .env.local && set +a
bun run scripts/harness.ts examples/engineering-review-agent/scenarios/success.json
bun run scripts/harness.ts examples/engineering-review-agent/scenarios/policy-denial.json
bun run scripts/harness.ts examples/engineering-review-agent/scenarios/recovery.json
```

## Expected Evidence

- One success case: review completes with approved quality gate
- One policy failure: viewer approval denied (POL-004)
- One recovery case: transient failure retried via checkpoint resume

## Cleanup

All test data is cleaned after the scenario completes (`tenant_fixture.cleanup: true`).
