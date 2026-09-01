# Controlled Research Agent — Reference Integration

## Scenario

A controlled research agent uses multiple mocked tools, blocks untrusted
instructions from becoming authority, and demonstrates fault injection/replay.

## Principal/Tenant Fixture

- Principal: `research-agent` (role: viewer)
- Tenant: `allura-controlled-research`

## Tools

- `memory_search` — query existing knowledge
- `web_search` — mocked external source (no real network in simulate mode)
- `memory_add` — record findings (blocked: viewer role)

## Policies

- `pol-004` — viewer role cannot write memories
- `pol-001` — untrusted instructions never become authority

## Scenarios (runnable)

| File | Case | Expected |
|------|------|----------|
| `scenarios/success.json` | Success: read-only research completes with mocked tools | `completed` |
| `scenarios/prompt-injection.json` | Security failure: embedded instruction in tool output blocked | `failed` (UNTRUSTED_INSTRUCTION) |
| `scenarios/recovery.json` | Recovery: transient source failure retried via checkpoint | `completed` |

## Run

```bash
# From the repo root, with the local stack up:
# (bun packages/cli/src/index.ts init creates .env.portfolio.example with
# non-secret defaults; copy it to .env.local and set your secrets first)
set -a && source .env.local && set +a
bun run scripts/harness.ts examples/controlled-research-agent/scenarios/success.json
bun run scripts/harness.ts examples/controlled-research-agent/scenarios/prompt-injection.json
bun run scripts/harness.ts examples/controlled-research-agent/scenarios/recovery.json
```

## Expected Evidence

- One success case: research completes with read-only access
- One policy failure: untrusted instruction in tool output blocked (UNTRUSTED_INSTRUCTION)
- One recovery case: transient failure retried via checkpoint resume

## Cleanup

All test data is cleaned after the scenario completes (`tenant_fixture.cleanup: true`).
