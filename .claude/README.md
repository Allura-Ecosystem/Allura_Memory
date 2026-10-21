# Claude adapter reference for Allura Memory

This directory contains Claude-facing adapters and workflow material for contributors. The repository's [agent instructions](../AGENTS.md) and [Team RAM runtime bridge](../.agents/TEAM-RAM-RUNTIME.md) establish project coordination. The local [.opencode agent definitions](../.opencode/agent/) own Team RAM behavior; an adapter or roster is not evidence that an agent ran.

For the product's first task, use the shared [save-and-retrieve guide](../docs/user-guide/getting-started.md). It currently evaluates an existing authorized gateway; it does not establish a fresh self-hosted installation.

## Contributor path

1. Load the task's applicable local context and governed Brain evidence.
2. Resolve the required skills and validation before implementation.
3. Make a bounded change and record actual review/test evidence.
4. Log meaningful outcomes through the governed Brain interface.

The memory service uses PostgreSQL and the RuVector graph adapter by default. Neo4j is retired. Use the authorized `allura-system` project scope; role selection does not grant another tenant, credential, or human-promotion authority.

See the [OpenCode/OAC harness reference](../.opencode/README.md) for the canonical local directory map. Older copied instructions and plugin examples must be reconciled with current project rules and source before execution. Configuration and permissions remain separate from explanatory README text.

*AI-assisted factual correction, 2026-10-20. No runtime settings or agent definitions changed.*
