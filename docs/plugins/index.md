# Plugin Documentation

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

> Documentation for Allura's plugin system — how plugins work, how to use them, and how to write your own.

## What Are Allura Plugins?

Allura plugins extend agent runtimes (Claude Code, Codex, OpenCode) with:

- **Governance enforcement** — invariant checking on every tool call
- **Memory workflows** — structured capture, validation, and handoff protocols
- **Team collaboration** — shared context between different agent runtimes
- **Custom skills** — reusable patterns for common memory operations

## Plugin Architecture

```
plugins/<name>/
├── .claude-plugin/           # Claude Code manifest and hooks
│   └── plugin.json
├── .codex-plugin/            # Codex manifest and hooks
│   └── plugin.json
├── .opencode-plugin/         # OpenCode manifest (future)
├── skills/                   # Reusable skill definitions
│   └── <skill-name>/
│       └── SKILL.md
├── hooks/                    # Pre/post tool call hooks
│   ├── hooks.json            # Hook wiring manifest
│   ├── governance-preflight.py
│   ├── write-receipt.py
│   └── governance-context.py
├── schemas/                  # Machine-readable schemas
│   └── handoff.schema.json
├── scripts/                  # Validation and utility scripts
│   └── validate_plugin.py
├── agents/                   # Agent definitions (for cowork)
├── commands/                 # Command definitions (for cowork)
└── README.md                 # Plugin documentation
```

## Plugin Types

| Type | Purpose | Example |
|------|---------|---------|
| **Governance** | Enforce invariants on tool calls | `allura-governance` |
| **Cowork** | Cross-runtime collaboration | `allura-cowork` |
| **Core** | Runtime-specific skills and assets | `allura` |
| **Agent Tool** | Governed agent-tool integrations | `bumblebee` |
| **Extension** | Additional capabilities | `—` |

## Plugin Manifest

Each runtime has its own manifest format:

### Claude Code (`plugin.json`)

```json
{
  "name": "allura-governance",
  "version": "1.0.0",
  "description": "Hard enforcement of Allura invariants",
  "hooks": {
    "preToolCall": ["governance-preflight.py"],
    "postToolCall": ["write-receipt.py"],
    "userPromptSubmit": ["governance-context.py"]
  }
}
```

### Codex (`plugin.json`)

```json
{
  "name": "allura-cowork",
  "version": "1.0.0",
  "description": "Shared handoff protocol for Claude and Codex",
  "skills": ["allura-cowork"],
  "commands": ["cowork-start", "cowork-handoff", "cowork-validate", "cowork-close"]
}
```

## Hook System

Hooks intercept tool calls and prompt submissions:

| Hook | When | Use |
|------|------|-----|
| `preToolCall` | Before any tool executes | Block violations, inject parameters |
| `postToolCall` | After tool completes | Write receipts, log outcomes |
| `userPromptSubmit` | When user sends a message | Inject context, governance rules |

## Installing Plugins

### Claude Code

```bash
claude plugin install ./plugins/<name>
```

### Codex

```bash
codex plugin install ./plugins/<name>
```

### Validation

```bash
python3 plugins/<name>/scripts/validate_plugin.py plugins/<name>
```

## Plugin Selection Guide

| You need… | Install |
|-----------|---------|
| Hard invariant enforcement | `allura-governance` |
| Claude ↔ Codex handoff | `allura-cowork` |
| Core memory skills for Codex | `allura` |
| Supply-chain threat intelligence | `bumblebee` |

## Writing Custom Plugins

See [`writing-plugins.md`](writing-plugins.md) for the complete plugin authoring guide.

## Plugin Catalog

- [`allura-cowork.md`](allura-cowork.md) — Claude/Codex collaboration plugin
- [`allura-governance.md`](allura-governance.md) — Invariant enforcement plugin
- [`bumblebee/README.md`](bumblebee/README.md) — Supply-chain threat intelligence plugin
- [`writing-plugins.md`](writing-plugins.md) — Authoring guide

---

*Plugin implementations live in [`plugins/`](../../plugins/). For the public plugin index, see [`catalog/plugins.md`](../../catalog/plugins.md).*
