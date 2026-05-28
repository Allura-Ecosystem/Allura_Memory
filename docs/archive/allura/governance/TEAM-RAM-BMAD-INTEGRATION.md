# Team RAM, BMAD, and Allura Integration

This document explains how Team RAM, BMAD planning, and Allura Brain work together.

## Summary

Team RAM is the project operating team.

BMAD is the planning and artifact workflow.

Allura Brain is the governed memory system.

```text
Codex/OpenCode/Claude are the hands.
Team RAM is the thinking style.
BMAD is the planning workflow.
Skills are the playbooks.
Allura Brain is the memory.
```

## Authority

| Layer | Source of Truth | Purpose |
| --- | --- | --- |
| Live agents | `.opencode/agent/` | Active Team RAM personas and permissions |
| Agent registry | `.opencode/config/agent-metadata.json` | Machine-readable roster |
| Skill routing | `.opencode/config/agent-skills.json` | Agent-to-skill mapping |
| BMAD bridge | `_bmad/TEAM-RAM-INTEGRATION.md` | Planning workflow and artifact ownership |
| Epic finish workflow | `_bmad/FINISH-ALL-EPICS-WORKFLOW.md` | Scout-first Kanban route for finishing all epics |
| Allura canon | `docs/allura/*.md` | Product and memory architecture truth |
| Memory | Allura Brain | Raw traces and promoted insights |

## Workflow

Named workflow:

```text
Finish All Epics: Scout-First Kanban Workflow
```

Every implementation task should follow this sequence:

```text
Jobs -> Brooks -> Scout -> Woz -> Review Gate -> Allura Memory Log
```

For finishing all epics, close existing review debt first, finish Epic 2
Frontend Tightening, then execute E1 Host Stability, E2 Dashboard Quality,
E3/E4 Hardening Deploy, E4 Kernel Completion, and E5 Infrastructure Polish.
Scout must be the first real background/recon agent for every epic or story
batch. If Scout is not actually spawned, the runtime must say
`Scout-style hydration only`.

For data work:

```text
Jobs -> Brooks -> Scout -> Knuth -> Woz -> Fowler
```

For infrastructure work:

```text
Jobs -> Brooks -> Scout -> Hightower -> Woz -> Bellard
```

For performance work:

```text
Scout -> Bellard -> Carmack -> Woz -> Pike
```

## Role Map

| Agent | Function in Allura |
| --- | --- |
| Jobs | Clarifies intent, scope, and acceptance criteria |
| Brooks | Owns architecture, invariants, routing, and conceptual integrity |
| Scout | Loads repo context and Allura Brain memory before build |
| Woz | Builds the practical implementation |
| Pike | Reviews interface simplicity and API shape |
| Fowler | Reviews maintainability and refactor safety |
| Knuth | Owns schemas, data contracts, and query correctness |
| Hightower | Owns infrastructure, deployability, and observability |
| Bellard | Owns diagnostics and measurement-first debugging |
| Carmack | Owns performance and hot-path optimization |

## Memory Contract

Allura Brain memory is used as governed project memory.

Memory lookup comes before architecture or build work when memory tools are available.

Task outcomes are logged after meaningful work completes.

Raw memory is not canonical truth. Promoted memory requires governance.

Default tenant:

```text
group_id: allura-system
```

Deprecated or superseded memories may remain in Neo4j for lineage, but normal memory search must filter them out. Historical recall should use an explicit deleted/deprecated-memory path.

## BMAD Contract

BMAD artifacts are planning outputs, not competing sources of truth.

Recovered or generated BMAD files live under:

```text
_bmad-output/
```

Team RAM integration guidance lives under:

```text
_bmad/
```

The canonical Allura architecture remains in:

```text
docs/allura/
```

## Agent Building

Use `bmad-agent-builder` when changing or creating agent skills.

Use `team-ram-cowork` when explaining or operating the Team RAM co-work model across Codex, OpenCode, and Claude.

Agent changes should update:

- `.opencode/agent/`
- `.opencode/config/agent-metadata.json`
- `.opencode/config/agent-skills.json`
- `.opencode/SKILL-OWNERSHIP.md`
- `_bmad/TEAM-RAM-INTEGRATION.md`
- `docs/allura/TEAM-RAM-BMAD-INTEGRATION.md`
