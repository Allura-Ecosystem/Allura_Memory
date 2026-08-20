# Allura Memory — OpenCode Config

OAC Core + Allura Overlay architecture.

## Architecture

This directory implements the **OpenAgentsControl (OAC) core** with an **Allura overlay**.

### OAC Core
Context-first, plan-first, validation-first.

- **ContextScout** — Navigation-driven discovery of project standards and patterns
- **`.opencode/context/`** — Deterministic project context (the source of truth for implementation)
- **Command lifecycle** — Scout → Skill resolve → Build → Validate
- **Validation/review gates** — No code ships without passing validation

### Allura Overlay
Project-specific extensions on top of OAC core.

- **Team RAM** — 10 persona-driven agents (Brooks, Woz, Scout, Pike, Fowler, etc.)
- **Brain memory** — Allura Brain (PostgreSQL + Neo4j) for episodic + semantic memory
- **Brooks orchestration** — Architecture-first orchestration via Frederick Brooks persona
- **HITL / curator / governance** — Promotion pipeline with human-in-the-loop approval
- **RuVix control plane** — Policy enforcement gate for all memory operations

## Execution Rule

**Scout before build. Skills before Ralph. Validate before done.**

```
User task
  ↓
① Scout loads local .opencode/context files
  ↓
② Scout searches Allura Brain for prior decisions/blockers
  ↓
③ Skill resolver identifies required skills
  ↓
④ Builder executes with loaded context + skills
  ↓
⑤ Validation passes before done
```

## Directory Structure

| Path | Class | Purpose |
|------|-------|---------|
| `context/core/` | OAC Core | Standards, workflows, system guides |
| `context/development/` | OAC Core | Frontend, backend, infra, data patterns |
| `context/openagents-repo/` | OAC Core | OAC framework documentation |
| `context/project-intelligence/` | OAC Core | Business/technical domain context |
| `context/allura/` | Allura Overlay | Brain prompt, brand identity, blockers |
| `context/ui/` | OAC Core | UI/animation/design patterns |
| `agent/` | Allura Overlay | Team RAM persona definitions |
| `command/` | Mixed | OAC core + Allura overlay commands |
| `skills/` | Mixed | Allura-specific + OAC tool skills |
| `rules/` | Allura Overlay | Operational routing and guidelines |
| `governance/` | Allura Overlay | Curator and HITL |
| `contracts/` | Allura Overlay | Harness and Ralph integration contracts |
| `config/` | Mixed | Agent metadata, skills, harness config |
| `archive/` | Archive | Pruned directories (hooks, routing, state, migrations) |
| `tool/` | Allura Overlay | Env validation |
| `manifest.json` | OAC Core | Machine-readable architecture manifest |
| `SKILL-OWNERSHIP.md` | OAC Core | Skill ownership matrix |

## Invariants

1. Scout before build
2. Context before code
3. Skills before Ralph
4. Validation before done
5. Memory supplements context; it does not replace it
6. No decorative architecture

## Source of Truth

- `opencode.json` — Top-level OpenCode configuration
- `.opencode/agent/` — Active Team RAM agent definitions
- `.opencode/command/` — Reusable workflow commands
- `.opencode/skills/` — Skill definitions and supporting assets
- `.opencode/manifest.json` — Architecture manifest (machine-readable)
- `.opencode/SKILL-OWNERSHIP.md` — Skill ownership matrix
- `.opencode/config/` — Registry and harness metadata

## Notes

- Team RAM is the primary active agent set
- Team RAM consumes OAC context; it does not replace it
- Keep agent permissions and boundaries in agent frontmatter and instructions
- Avoid reintroducing stale legacy naming when current Team RAM names are the intended surface
- Treat memory integration as supporting infrastructure, not as the identity of the harness