# Controlled research scenario fixtures

For engineers inspecting how a research workflow handles fixture tool responses, a simulated injection failure and recovery.

**Start with the [shared first-use guide](../../docs/user-guide/getting-started.md)** if your goal is to save and retrieve a real project decision. This directory is a scenario-harness reference, not that first-use integration.

## What is simulated

The JSON files declare `tool_fixtures`, `principal_fixture`, expected outcomes and, where applicable, `approval_breakpoints`. The [CLI](../../scripts/harness.ts) defaults to `simulate`; the [runner](../../src/lib/harness/runner.ts) consumes those fixtures. A predeclared approval is not an observed human decision. Fixture principal and tenant labels are not credentials or access grants.

The runner still has backing-service dependencies. Simulated tool responses do not mean the entire process is independent of infrastructure.

## Inspect a case

| Fixture | Declared scenario outcome |
|---|---|
| [prompt-injection](scenarios/prompt-injection.json) | `failed` |
| [recovery](scenarios/recovery.json) | `completed` |
| [success](scenarios/success.json) | `completed` |

After provisioning the runner's authorized evaluation dependencies, invoke a case from the repository root:

```bash
bun run scripts/harness.ts examples/controlled-research-agent/scenarios/success.json
```

The CLI writes a local receipt and prints the scenario status. Check both the receipt and the expected scenario outcome; a command exit alone is not proof of the behavior. A fixture's `cleanup: true` is declared intent, not verified deletion authority or a receipt that cleanup happened. Preserve append-only events.

## Current execution evidence

On 2026-10-20, all three cases in this directory were attempted at working revision `28d90e843` plus current edits. Each stopped with `ECONNREFUSED 127.0.0.1:5432` before producing a scenario result. No live approval, successful recovery, cross-tenant enforcement or completed scenario is claimed from those attempts. The [README disposition receipt](../../docs/reference/reddit-remediation/readme-disposition.md) records the scope and limitations.

Do not switch tenant or invent an identity to make a case pass. Establish the intended isolated dependencies and rerun before recommending the example as verified.

*AI-assisted editorial revision, 2026-10-20. Fixture expectations remain distinct from observed outcomes.*
