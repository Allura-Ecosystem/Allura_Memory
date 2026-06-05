# allura (Core Plugin)

> Core Allura memory skills and brand assets for the Codex runtime.

## Purpose

The `allura` plugin packages the essential skills and visual assets for presenting Allura Brain and governed memory concepts within Codex. It provides:

- **Brand assets** — Logo, hero images, and memory flow diagrams for README/documentation generation
- **Core skills** — Lightweight guidance for explaining Allura Brain, the RuVix proof loop, and governed memory workflows

## Contents

```
plugins/allura/
├── .codex-plugin/
│   └── plugin.json          # Codex manifest
├── assets/
│   └── (brand images)        # Logo, hero, brain diagram, memory flow
└── skills/
    └── allura/
        └── SKILL.md          # Core memory guidance skill
```

## Runtime Support

| Runtime | Status |
|---------|--------|
| Codex | ✅ Supported |
| Claude Code | ❌ Not applicable (use `allura-cowork` or `allura-governance`) |

## Installation

```bash
codex plugin install ./plugins/allura
```

## What It Provides

### Skills

- **`allura`** — Guidance for explaining Allura Brain, governed memory, and the dual-layer architecture (PostgreSQL + Neo4j)

### Assets

- `logo.png` — Allura brand mark
- `readme-hero.png` — Hero image for documentation
- `readme-allura-brain.png` — Dual-layer architecture diagram
- `readme-memory-flow.png` — Memory pipeline flow diagram

## Usage

Once installed, Codex can reference Allura assets when generating documentation or explaining memory concepts:

```
Create a README section explaining Allura Brain using the plugin assets.
```

## See Also

- [`catalog/plugins.md`](../../catalog/plugins.md) — Public plugin index
- [`docs/plugins/index.md`](../../docs/plugins/index.md) — Plugin system overview
- [`plugins/allura-cowork/`](../allura-cowork/) — Cross-runtime collaboration plugin
- [`plugins/allura-governance/`](../allura-governance/) — Invariant enforcement plugin

---

*This is a core plugin. For extended capabilities, see [`plugins/superpowers/`](../superpowers/).*
