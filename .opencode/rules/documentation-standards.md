# Documentation Standards Execution Policy

This file is a non-normative execution aid. The sole documentation authority is the
[`ai-guidelines` skill](../skills/ai-guidelines/SKILL.md).

Before adding or changing documentation:

1. Load the canonical `ai-guidelines` skill.
2. Update one or more of the six files in `docs/allura/` when the change affects live architecture, requirements, design, decisions, risk, or data contracts.
3. Put historical and supporting material in `docs/archive/allura/`, temporary BMAD output in `memory-bank/bmad-output/`, or durable decision evidence in Allura Brain.
4. Run `.github/scripts/docs-allura-canonical-guard.sh` and the relevant documentation checks.

This file must never restate or override normative policy.
