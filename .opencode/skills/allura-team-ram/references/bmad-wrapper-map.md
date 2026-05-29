# BMad Wrapper Map

> Maps BMad primitive skills to their Allura wrapper equivalents.

## Architecture

```
Allura Wrapper Layer (project-specific governance gates)
  ├── allura-dev-story       → bmad-dev-story + Scout + Brain + Notion + validation
  ├── allura-code-review     → bmad-code-review + Pike/Fowler gates + Brain
  ├── allura-architecture    → bmad-create-architecture + Brooks gate + Brain
  ├── allura-product-intake  → bmad-create-prd + Jobs gate + Brain
  └── allura-retrospective   → bmad-retrospective + Brooks + Brain

Allura Core Layer (shared governance)
  └── allura-team-ram (mandatory first load)

BMad Primitive Layer (reusable workflow engines)
  ├── bmad-dev-story
  ├── bmad-code-review
  ├── bmad-create-architecture
  ├── bmad-create-prd
  └── bmad-retrospective
```

## Routing Table

| BMad Skill | Allura Wrapper | Status | Notes |
|------------|---------------|--------|-------|
| `bmad-dev-story` | `allura-dev-story` | ✅ Created | Pilot wrapper, gates before bmad-dev-story |
| `bmad-code-review` | `allura-code-review` | ✅ Created | Pike/Fowler review gates |
| `bmad-create-architecture` | `allura-architecture` | ✅ Created | Brooks architecture gate |
| `bmad-create-prd` | `allura-product-intake` | ✅ Created | Jobs intent gate |
| `bmad-retrospective` | `allura-retrospective` | ✅ Created | Brooks retrospective gate |
| `bmad-party-mode` | `party-mode` / `team-ram-cowork` | ✅ Existing | Allura-native, not a wrapper |
| `bmad-sprint-status` | `allura-kanban-board` / Notion | ✅ Existing | Notion source of truth |
| `bmad-sprint-planning` | `allura-kanban-board` / Notion | ✅ Existing | Notion source of truth |
| `bmad-quick-dev` | `allura-dev-story` or Woz route | ✅ Created | Routes through dev-story wrapper |
| `bmad-document-project` | `carloss-guidelines` + Allura docs gate | ✅ Existing | Allura-native |

## Demoted BMad Skills (Not Wrapped, Just Replaced)

These BMad skills are replaced by Allura-native alternatives, not wrapped:

| BMad Skill | Replacement | Reason |
|------------|-------------|--------|
| `bmad-agent-analyst` | Team RAM roles (Brooks, Jobs) | Agent roles are defined in AGENTS.md |
| `bmad-agent-architect` | Team RAM roles (Brooks) | Agent roles are defined in AGENTS.md |
| `bmad-agent-dev` | Team RAM roles (Woz) | Agent roles are defined in AGENTS.md |
| `bmad-agent-pm` | Team RAM roles (Jobs) | Agent roles are defined in AGENTS.md |
| `bmad-agent-ux-designer` | Team RAM roles (Sally) | Agent roles are defined in AGENTS.md |
| `bmad-agent-tech-writer` | Team RAM roles (Paige) | Agent roles are defined in AGENTS.md |

## Wrapper Gate Sequence

Every Allura wrapper follows this gate sequence:

1. **Scout Hydration** — load local context + Allura Brain search
2. **Documentation Impact Check** — does this touch canonical docs?
3. **Team RAM Owner Assignment** — who reviews? who builds?
4. **BMad Workflow Execution** — invoke the underlying method skill
5. **Notion Board Update** — update work item status
6. **Validation Evidence** — tests pass, typecheck clean, review approved
7. **Brain Outcome Log** — write result to Allura Brain