> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

# PRD: Team RAM — Real Actual Masters v1.0

**Date:** 2026-05-23
**Author:** Brooks (Architect)
**Status:** Draft — Source-of-Truth Hardened for BMAD Story 1.2
**Related:** `.opencode/AGENTS.md` · `.opencode/agent/` · `.agents/TEAM-RAM-RUNTIME.md` · `docs/allura/BLUEPRINT.md`

---

## 0. Source-of-Truth and Governance Corrections

This PRD is a **draft planning input**, not final governance authority. Current authority order for Team RAM work is:

1. Direct user request in the current conversation.
2. Active system/developer instructions for the runtime.
3. `.opencode/AGENTS.md`, `.opencode/manifest.json`, `.opencode/SKILL-OWNERSHIP.md`, and live agent definitions in `.opencode/agent/`.
4. `.opencode/context/` files and active BMAD artifacts.
5. Allura Brain memories retrieved with `group_id=allura-system`.
6. Draft PRD/source documents, including this file.

Runtime adapter rule:

- `.opencode/` is canonical for Team RAM agents, skills, commands, guidelines, and OpenCode configuration.
- `.claude/`, `.codex/`, and `.agents/` are adapter or bridge surfaces only. They may mirror approved behavior but must not introduce conflicting governance rules.

Planning/status rule:

- The Notion Work Board / Allura stories Work Items board is the human/team source of truth for status, approvals, owners, and evidence.
- Local BMAD files support reconciliation only.
- Allura Brain is governed memory and audit context, not proof of Done.

Memory/governance invariants:

- Use governed `allura-brain_memory_*` operations for memory write-back.
- Always use `group_id=allura-system` unless a story explicitly defines another valid `allura-*` tenant.
- PostgreSQL traces are append-only.
- Neo4j semantic knowledge is curated/versioned; agents do not autonomously promote memory.
- Evolved decisions use versioning/SUPERSEDES semantics rather than in-place truth rewriting.

Evidence rule:

- Deliverables are not `Complete` until implementation evidence, review evidence, validation output, and board/Brain traceability exist.

---

## 1. Purpose

Team RAM (Real Actual Masters) is the **surgical team** of specialized AI agents that power the Allura Memory ecosystem. Named after Frederick Brooks's concept of a small, highly skilled team where each member owns their domain completely, Team RAM provides:

- **Intent-to-execution routing** — User requests are classified and routed to the right specialist
- **Governed multi-agent collaboration** — Agents work in parallel under Brooks's orchestration
- **Quality gates at every handoff** — No code ships without review; no architecture ships without validation
- **Memory-augmented context** — Every agent hydrates from Allura Brain before acting

> *"The purpose of organization is to reduce the amount of communication and coordination necessary."* — Frederick P. Brooks Jr.

---

## 2. Core Concepts

| Concept | Definition |
|---------|------------|
| **Harness** | The runtime that wraps a model and gives it tools, permissions, memory, and a workflow loop (OpenCode, Claude Code, Codex) |
| **Persona** | The behavioral identity an agent adopts — voice, decision heuristics, tool restrictions |
| **Skill** | Packaged domain knowledge that agents load on-demand (e.g., `allura-memory-skill`, `bmad-dev-story`) |
| **Routing** | The decision of which agent handles which task, based on intent classification |
| **Delegation** | Brooks assigns work to subagents; subagents report back, never self-promote |
| **HITL** | Human-in-the-loop — critical decisions require human approval before execution |
| **ContextScout** | Mandatory first gate: every task begins with reconnaissance and context hydration |

---

## 3. Business Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| B1 | Every user request must be routed to the right specialist within 30 seconds | P0 |
| B2 | Agent outputs must be traceable to the agent, skill, and context that produced them | P0 |
| B3 | No single agent may autonomously modify architecture, security, or governance rules | P0 |
| B4 | Multi-agent tasks must complete with consistent, non-conflicting outputs | P0 |
| B5 | Agent failures must be isolated — one agent crashing cannot bring down the system | P1 |
| B6 | New agents must be addable without modifying existing agent definitions | P1 |

---

## 4. Functional Requirements

### 4.1 Agent Registry (F1–F5)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F1 | **Agent definitions** stored as markdown with frontmatter (name, description, tools, model, mode) | `.opencode/agent/**/*.md` is canonical; runtime adapters mirror only | `.opencode/AGENTS.md` |
| F2 | **Model assignments** declared per agent with primary + fallback, no blanket defaults | `.opencode/agent/**` and `.opencode/config.json` as applicable | `.opencode/AGENTS.md` |
| F3 | **Tool restrictions** enforced per agent — deny lists prevent overreach | Agent frontmatter and runtime permission adapters | `.opencode/AGENTS.md` · `.opencode/guidelines/HOOKS.md` |
| F4 | **Skill ownership matrix** mapping skills to preferred executors | `.opencode/SKILL-OWNERSHIP.md` | `.opencode/SKILL-OWNERSHIP.md` |
| F5 | **Agent status tracking** in Neo4j — runtime state, confidence, contributions | `src/lib/neo4j/agent-nodes.ts` | `src/lib/neo4j/agent-nodes.ts` |

### 4.2 Routing System (F6–F12)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F6 | **Intent classification** — categorize requests into: architecture, implementation, review, research, infra, data | Brooks orchestration layer | `.opencode/agent/core/brooks.md` · `.opencode/AGENTS.md` |
| F7 | **Role-first routing** — primary agent selected by role, not by model capability | `.opencode/agent/` plus runtime adapter bridge | `.agents/TEAM-RAM-RUNTIME.md` |
| F8 | **Task override** — explicit user request to route to specific agent takes precedence | Harness override protocol | `.opencode/AGENTS.md` execution rule |
| F9 | **Fallback-only recovery** — if primary model unavailable, use declared fallback; no multi-hop chains | Agent frontmatter or runtime routing config | `.opencode/agent/` · `.opencode/config.json` |
| F10 | **Parallel dispatch** — party mode launches ≥2 agents simultaneously for complex tasks | `party-mode` skill; Brooks decomposes before dispatch | `.opencode/AGENTS.md` · `.agents/TEAM-RAM-RUNTIME.md` |
| F11 | **Sequential gating** — review agents (Pike, Fowler) must pass before Done/commit | `bmad-code-review` skill or documented Pike/Fowler gate-equivalent review | `_bmad/TEAM-RAM-INTEGRATION.md` |
| F12 | **Context hydration** — Scout loads local context + Allura Brain before any build | `team-ram-cowork` and `allura-memory-skill` | `.opencode/context/index.md` |

### 4.3 Communication Patterns (F13–F18)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F13 | **Brooks as chair** — all significant responses begin with "Brooks active." receipt | Brooks agent definition | `.opencode/agent/core/brooks.md` |
| F14 | **Scout recon receipt** — every task shows: local context checked, Brain queried, skills loaded | Scout protocol | `.opencode/AGENTS.md` ContextScout gate |
| F15 | **RuVix governance receipt** — every mutation shows: mutate, attest, verify, isolate, sandbox, audit | RuVix kernel | `src/kernel/` |
| F16 | **Memory write-back** — every significant action logged to governed Allura Brain memory | `allura-memory-skill` | `.opencode/skills/allura-memory-skill/` |
| F17 | **Reflection block** — substantive architecture/status decisions are logged back to Brain and BMAD evidence | Brooks protocol | `.opencode/agent/core/brooks.md` |
| F18 | **Error escalation** — agent failures escalate to Brooks with context, never silently fail | Agent definitions | `.opencode/AGENTS.md` |

### 4.4 Quality Gates (F19–F23)

| ID | Requirement | Satisfied By | Design Doc |
|----|-------------|--------------|------------|
| F19 | **Pike interface review** — read-only architecture consultation before any API change | Pike agent | `.opencode/agent/subagents/review/pike.md` |
| F20 | **Fowler refactor gate** — maintainability review before any structural change | Fowler agent | `.opencode/agent/subagents/review/fowler.md` |
| F21 | **Bellard diagnostics** — performance measurement before any optimization claim | Bellard agent | `.opencode/agent/subagents/code/bellard.md` |
| F22 | **Carmack performance** — latency analysis before any speed-related decision | Carmack agent | `.opencode/agent/subagents/code/carmack.md` |
| F23 | **Jobs intent gate** — scope control and acceptance criteria before any implementation | Jobs agent | `.opencode/agent/core/jobs.md` |

---

## 5. Agent Directory

### 5.1 Primary Orchestrators (Mode: primary)

| Agent | Persona | Role | Primary Model | Fallback | Use When |
|-------|---------|------|---------------|----------|----------|
| **Brooks** | Frederick P. Brooks Jr. | Architect + Orchestrator | `openai/gpt-5.5` | `ollama-cloud/deepseek-v4-pro` | Task planning, architecture, delegation, final sign-off |
| **Jobs** | Steve Jobs | Intent Gate | `ollama-cloud/deepseek-v4-pro` | `ollama-cloud/kimi-k2.6` | Scope control, acceptance criteria, feature triage |

### 5.2 Implementation Agents (Mode: subagent)

| Agent | Persona | Role | Primary Model | Fallback | Use When |
|-------|---------|------|---------------|----------|----------|
| **Woz** | Steve Wozniak | Primary Builder | `ollama-cloud/qwen3-coder-next` | — | Autonomous implementation, ships working code |
| **Bellard** | Fabrice Bellard | Diagnostics + Perf | `openai/gpt-5.4-mini` | — | Performance, measurement, low-level fixes |
| **Carmack** | John Carmack | Performance Specialist | `openai/gpt-5.4-mini` | — | Optimization, API design, latency analysis |

### 5.3 Review Agents (Mode: subagent)

| Agent | Persona | Role | Primary Model | Fallback | Use When |
|-------|---------|------|---------------|----------|----------|
| **Pike** | Rob Pike | Interface Gate | `openai/gpt-5.4-mini` | — | Read-only architecture consultation, API review |
| **Fowler** | Martin Fowler | Refactor Gate | `openai/gpt-5.5` | — | Maintainability, incremental change, technical debt |

### 5.4 Infrastructure Agents (Mode: subagent)

| Agent | Persona | Role | Primary Model | Fallback | Use When |
|-------|---------|------|---------------|----------|----------|
| **Knuth** | Donald Knuth | Data Architect | `ollama-cloud/qwen3-coder-next` | — | Schema design, query optimization, data modeling |
| **Hightower** | Kelsey Hightower | DevOps Specialist | `openai/gpt-5.5` | `ollama-cloud/deepseek-v4-pro` | CI/CD, IaC, deployment, observability |

### 5.5 Reconnaissance Agents (Mode: subagent)

| Agent | Persona | Role | Primary Model | Fallback | Use When |
|-------|---------|------|---------------|----------|----------|
| **Scout** | — | Recon + Discovery | `openai/gpt-5.4-mini` | `ollama-cloud/nemotron-3-super` | Fast codebase search, pattern discovery, context hydration |

---

## 6. Routing Rules

### 6.1 Essential Routing Table

| Event | Route To | Why |
|-------|----------|-----|
| Task planning | Brooks | Owns the incision, delegates strategically |
| Intent gate | Jobs | Converts requests into crisp objectives |
| Deep implementation | Woz | Give goal, not recipe |
| Architecture question | Pike | Read-only consultation |
| Codebase search | Scout | Fast pattern discovery |
| Strategic planning | Fowler | Interview-mode before code |
| Performance concern | Bellard / Carmack | Measurement-first |
| Data/schema work | Knuth | Schema correctness before speed |
| Infrastructure/CI/CD | Hightower | If it can't be deployed in one command, it's not done |

### 6.2 Category Routing

| Category | Routes To | Use Case |
|----------|-----------|----------|
| `visual-engineering` | Gemini 3.1 Pro | Frontend, UI, design |
| `deep` | GPT-5.5 | Autonomous research + execution |
| `quick` | GPT-5.4 Mini | Single-file changes, typos |
| `ultrabrain` | GPT-5.5 | Hard logic, architecture decisions |
| `ux-design` | Gemini 3.1 Pro | Accessibility review, design patterns |

### 6.3 GitHub Integration

| Event | Route To | Why |
|-------|----------|-----|
| PR review | Pike | Read-only consultation on architecture |
| Code push | Woz | Deep analysis, not surface review |
| Issue triage | Brooks | Orchestrator decides priority |
| Feature request | Jobs → Fowler | Gate intent, then plan |
| Infra concern | Hightower | Deployment and pipeline review |

---

## 7. Tool Restrictions

| Agent | Denied Tools | Why |
|-------|--------------|-----|
| Pike | write, edit, task | Read-only consultation |
| Scout | write, edit, task | Search only |
| Hightower | direct production SSH, manual env changes | Infrastructure as code only |

---

## 8. Communication Overhead

With 10 agents, we have $\frac{10 \times 9}{2} = 45$ communication paths.

The category system reduces this further:
- Intent-based routing (visual-engineering, deep, quick, ultrabrain, ux-design)
- Background agents run in parallel
- Tool restrictions prevent overreach (Pike can't write, only consult)

**Conway's Law:** Communication structures shape systems. The org chart and architecture will converge.

---

## 9. Execution Protocol

### 9.1 Mandatory Gates

Every implementation task must follow this sequence:

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

**No agent may skip step ①.**

### 9.2 Context7 Gate

Before proposing or editing anything involving external tool behavior, runtime configuration, provider/model syntax, library APIs, framework behavior, plugin hooks, MCP configuration, or CLI semantics, load `context7` and retrieve current documentation.

Required receipt:

```text
Context7:
- required: <yes/no>
- library: <id or n/a>
- topic: <query or n/a>
- finding: <one-line evidence or skip reason>
```

### 9.3 Ralph Skill Gate

Ralph may not execute unless this gate passes:

```json
{
  "context_loaded": true,
  "context_files": [],
  "brain_memories_checked": true,
  "required_skills": [],
  "skills_loaded": [],
  "validation_commands": []
}
```

**Failure conditions (Ralph MUST refuse):**
- No Scout context loaded
- Missing required skill
- Stale context without acknowledgment
- Missing validation command

---

## 10. Integration with Allura Brain

### 10.1 Memory Retrieval Order

When working on this project, dispatch Scout to hydrate from Allura Brain:

1. Scout recon on PostgreSQL events — recent activity and blockers
2. Query Neo4j for architecture insights and decisions
3. Synthesize: what's active, what's blocking, what was decided
4. `docs/allura/` — canonical architecture and design docs

### 10.2 Write-Back Contracts

On every significant action, write an outcome memory through the governed interface:

```jsx
allura-brain_memory_add({
  group_id: "allura-system",
  user_id: "{agent-persona}",
  content: "Outcome: {what changed, evidence, blockers, lessons}",
  metadata: { source: "conversation", agent_id: "{agent-persona}" }
})
```

Raw memories are audit/context. Durable semantic truth requires curator review and approved promotion. Do not write directly to Neo4j for autonomous promotion.

### 10.3 Neo4j Promotion Criteria

1. Decision is reusable across ≥2 projects
2. Decision was validated — not just proposed
3. No duplicate exists in semantic memory / Neo4j

---

## 11. Deliverables

| Deliverable | Format | Owner | Due |
|-------------|--------|-------|-----|
| Agent definitions | Markdown + frontmatter under `.opencode/agent/` | Brooks | Evidence required before Done |
| Routing rules documentation | `.opencode/AGENTS.md` and `.agents/TEAM-RAM-RUNTIME.md` bridge | Brooks | Evidence required before Done |
| Skill ownership matrix | `.opencode/SKILL-OWNERSHIP.md` | Brooks | Evidence required before Done |
| Runtime adapter bridge | `.agents/TEAM-RAM-RUNTIME.md` | Brooks | Evidence required before Done |
| Party mode skill | `party-mode` skill | Brooks | Evidence required before Done |
| Context/documentation gates | `.opencode/context/` and `.opencode/guidelines/` | Scout/Brooks | Evidence required before Done |

---

## 12. Open Questions

1. **A2A Protocol**: Should Team RAM agents publish Agent Cards for external orchestrator discovery?
2. **Dynamic spawning**: Should we support runtime agent creation (like the video's sub-agent pattern), or keep the static 10-agent roster?
3. **Agent-to-agent memory**: Should agents share a "team memory" space, or keep memories scoped per agent?
4. **Human override**: What is the escalation path when a user disagrees with Brooks's routing decision?
5. **Metrics**: What agent performance metrics should we track (latency, accuracy, user satisfaction)?

---

## 13. References

- `.opencode/AGENTS.md` — live agent surface and execution gates
- `.opencode/agent/core/brooks.md` — primary orchestrator definition
- `.opencode/agent/subagents/code/woz.md` — primary builder definition
- `.agents/TEAM-RAM-RUNTIME.md` — cross-runtime bridge, not primary authority
- `.opencode/context/index.md` — local context front door
- `.opencode/guidelines/AI-GUIDELINES.md` — documentation and canonical surface standard
- `docs/allura/BLUEPRINT.md` — canonical system blueprint
- `docs/allura/RISKS-AND-DECISIONS.md` — architectural decisions

---

📝 Reflection
├─ Action Taken: Created PRD for Team RAM covering agent directory, routing rules, communication patterns, quality gates, Allura Brain integration
├─ Principle Applied: Surgical Team — specialized roles, clear boundaries, Brooks as chair; Conceptual Integrity — single routing logic across all harnesses
├─ Event Logged: raw Allura Brain outcome memory only after validation/review evidence
├─ Neo4j Promoted: No autonomous promotion; curator approval required
└─ Confidence: High
