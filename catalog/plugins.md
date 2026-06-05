# Plugin Catalog

> Allura plugins extend agent runtimes with governed memory workflows, governance enforcement, and team collaboration protocols.

## Available Plugins

### allura-cowork

**Runtime:** Claude Code + Codex (dual-runtime)
**Purpose:** Shared handoff protocol between Claude and Codex with runtime honesty rules, validation reminders, and receipt-first collaboration.

**What it gives you:**
- `cowork-start` — hydrate project and memory context, then choose route
- `cowork-handoff` — create a structured packet between Claude and Codex
- `cowork-validate` — check claims and evidence before close
- `cowork-close` — write outcome summary and remaining risk
- Runtime honesty rules: perspective is not execution
- Allura Brain defaults: `group_id=allura-system`
- Approval boundaries for config, cron, runtime, production, semantic promotion, Notion sync, and Done/Approved status mutation

**Install:**
```bash
# Claude Code
claude plugin install ./plugins/allura-cowork

# Codex
codex plugin install ./plugins/allura-cowork
```

**Validate:**
```bash
python3 plugins/allura-cowork/scripts/validate_plugin.py plugins/allura-cowork
```

**Docs:** [`plugins/allura-cowork/README.md`](../plugins/allura-cowork/README.md) · [`docs/plugins/allura-cowork.md`](../docs/plugins/allura-cowork.md)

---

### allura-governance

**Runtime:** Claude Code + Codex (dual-runtime)
**Purpose:** Hard enforcement of Allura's 6 non-negotiable invariants on every tool call.

**What it blocks:**
| Invariant | Action |
|-----------|--------|
| `docker exec` in any bash command | BLOCK |
| UPDATE/DELETE on `events`/`traces` tables | BLOCK |
| Neo4j node mutation without `SUPERSEDES` | BLOCK |
| `memory_promote` without `curator_approved` | BLOCK |
| `group_id` missing from DB query | BLOCK |
| `roninclaw-*` group_id (deprecated namespace) | BLOCK |

**What it injects:**
- Governance rules as context when prompts contain DB/memory/agent keywords
- Write receipt reminder after any memory or DB write tool completes

**Install:**
```bash
# Claude Code
claude plugin install ./plugins/allura-governance

# Codex
codex plugin install ./plugins/allura-governance
```

**Docs:** [`plugins/allura-governance/README.md`](../plugins/allura-governance/README.md) · [`docs/plugins/allura-governance.md`](../docs/plugins/allura-governance.md)

---

### allura (core plugin)

**Runtime:** Codex
**Purpose:** Core Allura memory skills and assets for the Codex runtime.

**Contents:**
- `.codex-plugin/` — Codex plugin manifest and configuration
- `assets/` — Brand assets and shared resources
- `skills/` — Allura memory skills for Codex

**Install:**
```bash
codex plugin install ./plugins/allura
```

**Docs:** [`plugins/allura/README.md`](../plugins/allura/README.md)

---

### superpowers

**Runtime:** Codex
**Purpose:** Extended capability plugin for Codex — additional tools and integrations beyond core memory.

**Contents:**
- `.codex-plugin/` — Codex plugin manifest

**Status:** Minimal surface — manifest only. See plugin directory for future expansion.

**Install:**
```bash
codex plugin install ./plugins/superpowers
```

**Docs:** [`plugins/superpowers/README.md`](../plugins/superpowers/README.md)

## Plugin Selection Guide

| You need… | Install |
|-----------|---------|
| Claude ↔ Codex handoff with validation | `allura-cowork` |
| Hard invariant enforcement on every tool call | `allura-governance` |
| Core memory skills for Codex | `allura` |
| Extended Codex capabilities | `superpowers` |

## Writing Custom Plugins

See [`docs/plugins/writing-plugins.md`](../docs/plugins/writing-plugins.md) for the plugin manifest schema, hook system, and validation requirements.

---

*Plugin implementations live in [`plugins/`](../plugins/). Canonical governance rules live in [`docs/allura/RISKS-AND-DECISIONS.md`](../docs/allura/RISKS-AND-DECISIONS.md).*
