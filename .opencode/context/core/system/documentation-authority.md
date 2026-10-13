<!-- Context: core/system | Priority: critical | Updated: 2026-08-28 -->
# Documentation Authority Map

This is a non-normative context map. The sole policy authority is
[`ai-guidelines` skill](../../../skills/ai-guidelines/SKILL.md).
One authority exists per lifecycle stage; no document is editable in two places.

## Authority

| Surface | Role | Editable where |
|---|---|---|
| Notion | Private drafts, planning, approvals | Notion only |
| BMAD working area | Temporary execution artifacts | `memory-bank/bmad-output/` |
| Canonical six | Public engineering contracts | GitHub PR |
| Allura Brain | Decision lineage, evidence | Governed memory tools |
| Source code / schema | Implementation truth | Git |
| GitHub Pages | Generated public portal | Derived from GitHub Markdown |

## Lifecycle

Notion draft/approve → sanitize → GitHub PR (lint + links + metadata) → named-owner approval → versioned receipt in Brain → GitHub Pages render.

## Canonical Six (only files allowed in docs/allura/)

BLUEPRINT, SOLUTION-ARCHITECTURE, DESIGN-ALLURA, REQUIREMENTS-MATRIX, RISKS-AND-DECISIONS, and DATA-DICTIONARY. No index or additional design document is allowed. Enforced by `.github/scripts/docs-allura-canonical-guard.sh`.

## Hydration Budget

Brooks adaptive hydration: ≤3,000 startup tokens; ≤8,000 task-expansion. Full docs loaded by section or explicit request only. See Task 5 enforcement.
