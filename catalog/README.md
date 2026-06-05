# Allura Catalog

> The public index for Allura Memory — plugins, adapters, workflows, and governance gates.

This directory is the **first-read surface** for newcomers landing on the Allura repository. It links to implementation packages, documentation, and canonical architecture without duplicating governance truth.

## What Allura Is

Allura is a **self-hosted, governed AI memory engine** — a dual-database system (PostgreSQL + Neo4j) that gives AI agents persistent, auditable, multi-tenant memory with human-in-the-loop curation.

**One-sentence promise:** *Memory that shows its work.*

Every memory is captured, scored, and routed through a clear pipeline where human judgment stays in the loop before knowledge enters the long-term graph.

## Start Here

| I want to… | Go to |
|------------|-------|
| Understand what Allura does | [`README.md`](../README.md) · [`docs/user-guide/`](../docs/user-guide/) |
| Install and connect my agent | [`docs/user-guide/getting-started.md`](../docs/user-guide/getting-started.md) |
| Pick a plugin for my runtime | [`plugins.md`](./plugins.md) |
| See how memory flows end-to-end | [`workflows.md`](./workflows.md) |
| Understand governance rules | [`gates.md`](./gates.md) |
| Browse integration examples | [`examples.md`](./examples.md) |
| Read the canonical architecture | [`docs/allura/BLUEPRINT.md`](../docs/allura/BLUEPRINT.md) |

## Catalog Sections

- **[plugins.md](plugins.md)** — Allura plugin packages (Claude Code, Codex, OpenCode, custom)
- **[adapters.md](adapters.md)** — MCP adapters and client configurations
- **[workflows.md](workflows.md)** — End-to-end memory flows (capture → score → curate → promote)
- **[gates.md](gates.md)** — Governance gates, invariants, and approval boundaries
- **[examples.md](examples.md)** — Integration examples and verification snippets

## Governance Note

This catalog is a **public navigation layer**. Canonical architecture decisions, risks, and data definitions live in [`docs/allura/`](../docs/allura/) and are the only source of truth. If this catalog conflicts with `docs/allura/`, the canonical docs win.

---

*Part of the Allura Memory project. See [`docs/allura/BLUEPRINT.md`](../docs/allura/BLUEPRINT.md) for the authoritative design reference.*
