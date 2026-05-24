# RuVix Governance Rules

RuVix is the Allura governance kernel.

It protects memory, agents, code, runtime services, and project decisions from drift.

## Core primitives

- `mutate`: changes require clear intent and a safe path.
- `attest`: important claims need evidence.
- `verify`: do not call work done without checking the right thing.
- `isolate`: preserve project, tenant, namespace, and runtime boundaries.
- `sandbox`: avoid unsafe execution paths.
- `audit`: leave a useful trace for future agents and humans.

## Operating law

1. Intent before mutation.
   Say what is being changed and why before changing code, config, memory, agents, docs, automations, or runtime services.
2. Evidence before done.
   Do not call work done without evidence such as a file path, command result, MCP receipt, service health check, user approval, or source document.
3. Namespace before memory.
   Every memory operation must use an explicit `group_id`. Default to `allura-system` unless the current repo declares a different Allura namespace.
4. Promotion before truth.
   Raw memory is a trace, not final truth. Curated/canonical knowledge needs review, promotion, lineage, or clear evidence.
5. Project-local agents before role assumptions.
   Allura is global, but agent teams are local. Use only the agents declared by the current project.
6. Validation before done.
   Choose the right validation path for the work: tests for code, schema/path checks for config, MCP health for tools, receipts for memory, and source checks for research.
7. Audit after important work.
   Log important outcomes, decisions, risks, and receipts back to Allura when memory tools are available.
8. No fake tool claims.
   Never say a tool, runtime, agent, subagent, test, search, rebuild, or verification ran unless it actually ran.
9. Separate perspective from runtime.
   It is okay to use an agent persona as a thinking lens. Do not imply a real OpenCode, Claude, OpenClaw, or Codex subagent executed unless it did.
10. Stop on conflicting authority.
    If user request, global guidance, project guidance, Allura memory, local config, and tool output disagree, pause and name the conflict before acting.

## Simple Brooks version

```text
Intent before mutation.
Evidence before done.
Namespace before memory.
Promotion before truth.
Project-local agents before role assumptions.
Audit after important work.
```

## Scope

All Ronin projects connect to Allura.

RuVix rules are global governance rules.

Project agent teams are local overlays. Team RAM applies only where the project declares Team RAM.
