<!-- Context: core/system | Priority: critical | Updated: 2026-08-28 -->
# Documentation Authority Map

One authority per lifecycle stage. No document is editable in two places.

## Authority

| Surface | Role | Editable where |
|---|---|---|
| Notion | Private drafts, planning, approvals | Notion only |
| Historical BMAD archive | Read-only lineage and evidence; never current planning or status authority | `docs/archive/bmad-legacy/` |
| Canonical six | Public engineering contracts | GitHub PR |
| Allura Brain | Decision lineage, evidence | Governed memory tools |
| Source code / schema | Implementation truth | Git |
| GitHub Pages | Generated public portal | Derived from GitHub Markdown |

## Lifecycle

User intent / sanctioned work board → scoped change → GitHub PR (lint + links + metadata) → named-owner approval → versioned receipt in Brain → GitHub Pages render.

Notion syncs and any `Done` or `Approved` status change require action-specific human approval naming the target and intended effect.

## Canonical Six (only files allowed in docs/allura/)

BLUEPRINT, SOLUTION-ARCHITECTURE, DESIGN-ALLURA, REQUIREMENTS-MATRIX, RISKS-AND-DECISIONS, DATA-DICTIONARY, index. Enforced by `.github/scripts/docs-allura-canonical-guard.sh`.

## Hydration Budget

Brooks adaptive hydration: ≤3,000 startup tokens; ≤8,000 task-expansion. Full docs loaded by section or explicit request only. See Task 5 enforcement.
