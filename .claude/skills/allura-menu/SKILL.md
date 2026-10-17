---
name: allura-menu
description: "Interactive menu for Allura Memory surgical team. Quick prompts for common workflows."
allowed-tools: ["Read", "Grep", "Bash", "mcp__MCP_DOCKER__*", "allura-brain_*"]
---

# Allura Menu — Quick Prompts

Interactive menu for common Allura Memory workflows.

## Menu Structure

```
╔═══════════════════════════════════════════════════════════════╗
║                    ALLURA MEMORY MENU                        ║
╠═══════════════════════════════════════════════════════════════╣
║  [1] 🚀 Start Session      — Load memory, verify infra       ║
║  [2] 📋 Create Task        — Generate structured task         ║
║  [3] 🎉 Party Mode         — Launch parallel agents           ║
║  [4] 📝 Quick Update        — Sync docs with memory            ║
║  [5] 🔍 Code Review        — Surgical team review             ║
║  [6] 📊 Dashboard           — View system status               ║
║  [7] 🧠 Memory Query       — Search Allura Brain              ║
║  [8] 📤 Promote            — HITL promotion workflow           ║
║  [9] 🏁 End Session        — Persist and archive              ║
║  [0] ❓ Help               — Show this menu                    ║
╚═══════════════════════════════════════════════════════════════╝
```

## Menu Options

### [1] 🚀 Start Session

**Trigger:** `start-session`

**What it does:**

- Verifies PostgreSQL and RuVector connectivity
- Hydrates context from Allura Brain via Scout
- Searches recent events and insights for blockers and decisions
- Logs session start

**Equivalent command:** `/start-session`

---

### [2] 📋 Create Task

**Trigger:** `task-management`

**What it does:**

- Creates structured task files with dependency resolution
- Tracks progress via CLI (`router.sh status/next/blocked`)
- Validates task integrity and dependency trees
- Links to memory insights via Brain

**Equivalent skill:** `task-management <description>`

---

### [3] 🎉 Party Mode

**Trigger:** `party-mode`

**What it does:**

- Launches all agents in parallel
- Each agent works independently
- Brooks synthesizes results
- Maximum throughput

**Equivalent skill:** `party-mode <task>`

---

### [4] 📝 Quick Update

**Trigger:** `memory-client`

**What it does:**

- Stores updates to Allura Brain via `allura-brain_*` tools
- Search-before-write discipline (Hydrate → Plan → Build → Debug → Reflect)
- Syncs with canonical docs in `docs/allura/`
- Logs changes to PostgreSQL events

**Equivalent skill:** `memory-client` (Build mode)

---

### [5] 🔍 Code Review

**Trigger:** `code-review`

**What it does:**

- Pike reviews architecture
- Scout finds patterns
- UX reviews accessibility
- Brooks synthesizes

**Equivalent skill:** `code-review`

---

### [6] 📊 Dashboard

**Trigger:** `dashboard`

**What it does:**

- Shows system status
- Displays active tasks
- Lists recent insights
- Shows blockers

**Equivalent command:** `/dashboard`

---

### [7] 🧠 Memory Query

**Trigger:** `memory-query`

**What it does:**

- Searches Allura Brain
- Returns relevant insights
- Links to related entities
- Shows confidence scores

**Usage:** `memory-query <search term>`

---

### [8] 📤 Promote

**Trigger:** `hitl-governance`

**What it does:**

- Proposes promotion from episodic traces to the canonical semantic layer (PostgreSQL graph_memories)
- Runs HITL governance workflow (draft → evaluating → proposed → approved → promoted)
- Requires human approval
- Logs to audit trail

**Equivalent skill:** `hitl-governance`

---

## Menu Options

### [9] 🏁 End Session

**Trigger:** `end-session`

**What it does:**

- Persists session reflection to Allura Brain (PostgreSQL + RuVector)
- Logs completion to PostgreSQL
- Archives temporary files
- Updates progress

**Equivalent command:** `/end-session <summary>`

---

### [0] ❓ Help

**Trigger:** `help`

**What it does:**

- Shows this menu
- Lists available skills
- Shows current context
- Displays agent status

---

## Quick Prompts

Type these directly in your IDE:

| Prompt            | Action            |
| ----------------- | ----------------- |
| `start`           | Start session     |
| `task <desc>`     | Create/manage task |
| `party <task>`    | Launch party mode |
| `update <target>` | Memory client sync |
| `review`          | Code review       |
| `dash`            | Dashboard         |
| `query <term>`    | Memory query      |
| `promote`         | HITL promotion    |
| `debug <issue>`   | Systematic debug  |
| `end <summary>`   | End session       |

---

## Agent Shortcuts

> **Source of truth:** `.opencode/agent/*.md` — 10 canonical agents. This table is derived, not defining.

| Agent      | Shortcut                 | Persona           | Role                        |
| ---------- | ------------------------ | ----------------- | --------------------------- |
| Brooks     | `@brooks-architect`      | Frederick Brooks  | Architect + Orchestrator    |
| Jobs       | `@jobs-intent-gate`     | Steve Jobs        | Intent Gate + Scope Owner   |
| Woz        | `@woz-builder`          | Steve Wozniak     | Primary Builder             |
| Pike       | `@pike-interface-review` | Rob Pike          | Simplicity Gate (read-only) |
| Scout      | `@scout-recon`          | (none)            | Fast Discovery (read-only)  |
| Bellard    | `@bellard-diagnostics`  | Fabrice Bellard   | Diagnostics + Perf         |
| Carmack    | `@carmack-perf`         | John Carmack      | Performance Specialist      |
| Fowler     | `@fowler-refactor-gate` | Martin Fowler     | Maintainability Gate        |
| Knuth      | `@knuth-data`           | Donald Knuth      | Data Architect              |
| Hightower  | `@hightower-devops`     | Kelsey Hightower  | DevOps + Infrastructure     |

---

**Invoke with:** `allura-menu` or type any quick prompt directly.
