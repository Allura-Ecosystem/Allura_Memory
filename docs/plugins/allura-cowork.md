# allura-cowork Plugin

> Shared handoff protocol for Claude Code and Codex with governed memory workflows.

## Purpose

The `allura-cowork` plugin helps teams using both Claude Code and Codex run a governed collaboration workflow without learning the entire Allura operating model first.

**What it does not do:** Prevent every hallucination.
**What it does do:** Reduce unsupported claims by making missing memory search, missing validation, and unexecuted handoffs visible before they become "Done" claims.

## Runtime Support

| Runtime | Status | Install Path |
|---------|--------|--------------|
| Claude Code | ✅ Supported | `.claude-plugin/plugin.json` |
| Codex | ✅ Supported | `.codex-plugin/plugin.json` |
| OpenCode | 🔮 Planned | `.opencode-plugin/` (future) |

## Commands

### cowork-start

Hydrate project and memory context, then choose route.

**What happens:**
1. Load local context files (CLAUDE.md, .opencode/, etc.)
2. Search Allura Brain for recent decisions and blockers
3. Identify active runtime (Claude or Codex)
4. Recommend route: build, review, or handoff

### cowork-handoff

Create a structured packet between Claude and Codex.

**What happens:**
1. Package current context: active files, decisions, blockers, next steps
2. Validate against `handoff.schema.json`
3. Write to Allura Brain for receiving agent

**Schema:** [`plugins/allura-cowork/schemas/handoff.schema.json`](../../plugins/allura-cowork/schemas/handoff.schema.json)

### cowork-validate

Check claims and evidence before calling work done.

**What happens:**
1. Verify memory searches happened when prior context matters
2. Confirm validation commands ran (tests, typecheck, lint)
3. Flag unsupported claims

### cowork-close

Write outcome summary and remaining risk.

**What happens:**
1. Write outcome to Allura Brain
2. Document remaining risks and open questions
3. Tag next steps

## Runtime Honesty Rules

1. **Name your runtime** — "I am Claude Code" or "I am Codex"
2. **Perspective ≠ execution** — stating a plan is not completing it
3. **Search before plan** — query Allura Brain when prior decisions matter
4. **Validate before done** — run tests/typecheck/lint before claiming completion
5. **Write receipts** — log outcomes to Allura Brain after substantive work

## Approval Boundaries

These actions require explicit approval and cannot be automated:

- Runtime/database changes
- MCP config mutation
- Cron mutation
- Live hook installation
- RuVix enforcement changes
- Canonical semantic promotion
- Notion sync
- Done/Approved status moves

## Installation

```bash
# Claude Code
claude plugin install ./plugins/allura-cowork

# Codex
codex plugin install ./plugins/allura-cowork
```

## Validation

```bash
python3 plugins/allura-cowork/scripts/validate_plugin.py plugins/allura-cowork
```

## Directory Structure

```
plugins/allura-cowork/
├── .claude-plugin/
│   └── plugin.json
├── .codex-plugin/
│   └── plugin.json
├── README.md
├── agents/
│   └── (agent definitions)
├── commands/
│   ├── cowork-start.md
│   ├── cowork-handoff.md
│   ├── cowork-validate.md
│   └── cowork-close.md
├── hooks/
│   └── (hook implementations)
├── schemas/
│   └── handoff.schema.json
├── scripts/
│   └── validate_plugin.py
└── skills/
    └── allura-cowork/
        └── SKILL.md
```

## See Also

- [`docs/user-guide/cowork.md`](../user-guide/cowork.md) — User guide for the handoff protocol
- [`catalog/plugins.md`](../../catalog/plugins.md) — Public plugin index

---

*Implementation: [`plugins/allura-cowork/`](../../plugins/allura-cowork/). For issues, check [`docs/user-guide/troubleshooting.md`](../user-guide/troubleshooting.md).*
