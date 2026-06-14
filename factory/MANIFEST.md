# Allura Agent Factory — Manifest

## Architecture

The Agent Factory is the shipyard. It takes client requirements in → produces packaged agent teams out, with Allura governance baked in.

```
client brief → (1) SPEC → (2) BUILD → (3) OVERLAY → (4) VALIDATE → (5) PACKAGE → (6) DEPLOY
```

## Directory Layout

```
factory/
├── MANIFEST.md              ← This file
├── templates/
│   ├── team.yaml            ← BMad-compatible team module manifest
│   ├── agent.md             ← Agent persona spec template
│   └── overlay.yaml         ← Governance overlay template (from ADR)
├── validate.sh              ← Validates structure, roster, tenant, dependencies, and Allura gates
├── teams/
│   ├── penasoto/            ← Mortgage audit team (packaged)
│   │   ├── team.yaml
│   │   ├── agents/          ← 7 agent specs
│   │   └── overlay.yaml
│   ├── raleigh/             ← Faith Meats (specs only, needs build)
│   │   ├── team.yaml
│   │   └── agents/          ← 15 agent specs
│   └── charlotte/           ← Difference Driven (specs only, needs build)
│       ├── team.yaml
│       └── agents/          ← 6 agent specs
└── presets/                 ← Reusable agent archetypes
```

## Standards

Every team module must pass:

1. **Structure** — `team.yaml` valid YAML, `agents/*.md` exist, `overlay.yaml` present
2. **Allura gate** — Every agent spec includes `group_id`, `user_id`, `allura-memory-skill`
3. **Governance** — Overlay enforces pol-001 through pol-006 (append-only, SUPERSEDES, HITL)
4. **BMad compliance** — Team manifest meets BMad module schema

## Continuous Integration

- `.github/workflows/factory-ci.yml` validates every module and packages an explicitly selected team.
- `.github/workflows/factory-cross-team-smoke.yml` proves PostgreSQL-first writes, own-tenant retrieval, and cross-tenant isolation against live PostgreSQL and Neo4j services.
- `.github/workflows/ruvector-readiness.yml` verifies the current pgvector bridge and blocks native/upstream claims until their source artifacts exist.
