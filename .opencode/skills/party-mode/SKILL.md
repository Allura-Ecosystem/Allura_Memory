---
name: party-mode
description: Dispatch real Team RAM specialists for independent work slices. Brooks routes and synthesizes; one explicitly named owner writes each file.
---

# Party Mode — Native Parallel Build

Use party mode only when a task has at least two meaningful, independent slices
whose saved time exceeds coordination cost.

## Protocol

1. Brooks decomposes the task into independent outcomes with acceptance checks.
2. Scout hydrates local context once; run at most one focused Allura Brain query
   (`group_id: allura-system`, `limit: 5`) for the shared task context.
3. Brooks creates one compact ContextPacket and sends it to every specialist.
4. Dispatch specialists through the host's native Codex subagent mechanism.
5. Assign one writer owner per file or module. Read-only recon and review agents
   must not edit.
6. Collect results, resolve conflicts, run relevant validation, and let Brooks
   synthesize the outcome.

Parallelize independent work only. Sequence anything that depends on another
slice's output. Never launch the full roster by default.

## Default roles

Use the canonical roster from `team-ram-cowork`. Typical routing is:

- Scout: read-only evidence and risk map.
- Woz: default implementation owner.
- Pike: read-only interface review.
- Fowler: read-only maintainability/reversibility review unless explicitly given
  a non-overlapping edit slice.
- Knuth: data/schema review or explicitly owned migrations.
- Hightower: deployment, CI, secrets, and observability.
- Bellard/Carmack: diagnostics or performance only when measurement warrants it.

For brand work, use the governed Team Durham handoff rather than inventing brand
roles or copying the Durham roster.

## Runtime honesty

Name only agents actually dispatched. If native dispatch is unavailable, report
that limitation and run the smallest single-owner workflow. Reuse the shared
ContextPacket; do not make each specialist repeat repository hydration or Brain
searches.

Party mode does not authorize commits, deployment, promotion, destructive
actions, or broader file ownership. Ruflo is not required by this workflow.
