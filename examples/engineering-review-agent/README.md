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

## Expected Evidence
- One success case: review completes with quality gate pass
- One policy failure: viewer attempts to approve (denied)
- One recovery case: transient tool error retried successfully

## Cleanup
All test data is cleaned after the scenario completes.