# Controlled Research Agent — Reference Integration

## Scenario
A controlled research agent uses multiple mocked tools, blocks untrusted
instructions from becoming authority, and demonstrates fault injection/replay.

## Principal/Tenant Fixture
- Principal: `research-agent` (role: viewer)
- Tenant: `allura-controlled-research`

## Tools
- `memory_search` — query existing knowledge
- `memory_add` — record findings (blocked: viewer role)
- Scenario harness fault injection: TIMEOUT, TRANSIENT_RETRY

## Expected Evidence
- One success case: research completes with read-only access
- One policy failure: viewer attempts memory_add (denied by POL-004)
- One recovery case: transient timeout retried via checkpoint resume

## Cleanup
All test data is cleaned after the scenario completes.