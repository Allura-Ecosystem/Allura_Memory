# Claude ↔ Codex Cowork Guide

> Shared handoff protocol for teams using both Claude Code and Codex with Allura Memory.

## Why Cowork?

Claude Code and Codex are different runtimes with different strengths:

- **Claude Code** — Deep reasoning, architecture, long-context analysis
- **Codex** — Fast implementation, code generation, iterative building

The `allura-cowork` plugin creates a **governed bridge** between them so work can hand off without losing context, validation, or accountability.

## What You Get

- **Runtime honesty** — each agent names its runtime instead of blurring them together
- **Memory-first** — search Allura Brain before planning when prior decisions matter
- **Structured handoffs** — machine-readable packets with schema validation
- **Validation gates** — check claims and evidence before calling work done
- **Receipts** — write outcome summaries with remaining risk documented

## Commands

### cowork-start

**When:** Beginning a new work session.
**What it does:**
1. Hydrate project context from local files
2. Search Allura Brain for recent decisions and blockers
3. Identify the active runtime (Claude or Codex)
4. Choose route: build, review, or handoff

**Usage in Claude:**
```
Run cowork-start to begin the session.
```

### cowork-handoff

**When:** Transferring work from Claude to Codex or vice versa.
**What it does:**
1. Package current context into a structured handoff packet
2. Include: active files, decisions made, blockers, next steps
3. Validate packet against `handoff.schema.json`
4. Write packet to Allura Brain for the receiving agent to retrieve

**Usage:**
```
Create a handoff packet for Codex to continue implementation.
```

**Packet schema:** [`plugins/allura-cowork/schemas/handoff.schema.json`](../../plugins/allura-cowork/schemas/handoff.schema.json)

### cowork-validate

**When:** Before calling work "done."
**What it does:**
1. Check that claims are backed by evidence
2. Verify memory searches happened when prior context matters
3. Confirm validation commands ran (tests, typecheck, lint)
4. Flag unsupported claims before they become false "Done" claims

**Usage:**
```
Run cowork-validate before we mark this complete.
```

### cowork-close

**When:** Ending a work session.
**What it does:**
1. Write outcome summary to Allura Brain
2. Document remaining risks and open questions
3. Tag next steps for the following session
4. Clear session-local state

**Usage:**
```
Run cowork-close to wrap up this session.
```

## Handoff Workflow

```
Claude begins work
  ↓
cowork-start (hydrate context + search Brain)
  ↓
Claude architects / reasons / designs
  ↓
cowork-handoff (create packet for Codex)
  ↓
Codex receives packet
  ↓
cowork-start (hydrate from packet + search Brain)
  ↓
Codex implements / builds / iterates
  ↓
cowork-validate (check evidence before done)
  ↓
cowork-close (write outcome + risks)
  ↓
Allura Brain stores the full trace
```

## Runtime Honesty Rules

1. **Name your runtime** — "I am Claude Code" or "I am Codex", never "I am the AI"
2. **Perspective ≠ execution** — stating a plan is not the same as completing it
3. **Search before plan** — query Allura Brain when prior decisions or preferences matter
4. **Validate before done** — run tests, typecheck, or lint before claiming completion
5. **Write receipts** — log outcomes to Allura Brain after substantive work

## Approval Boundaries

The following require explicit approval and cannot be done via automatic handoff:

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

---

*For plugin details, see [`catalog/plugins.md`](../../catalog/plugins.md). For the handoff schema, see [`plugins/allura-cowork/schemas/handoff.schema.json`](../../plugins/allura-cowork/schemas/handoff.schema.json).*
