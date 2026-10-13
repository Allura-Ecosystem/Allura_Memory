---
name: allura-documentation-governance
description: Enforce Allura's sole AI-guidelines authority, exact six-file canonical documentation surface, archive routing, documentation impact checks, and validation gates. Use for documentation creation, cleanup, migration, architecture updates, API or schema changes, BMAD output routing, and policy or agent instructions that mention documentation.
metadata:
  audience: contributors
  workflow: documentation-governance
---

# Allura Documentation Governance

Use this skill to apply repository documentation policy without creating a second source of truth.

## Authority

Read `.opencode/rules/AI-GUIDELINES.md` in full before acting. It is the sole normative authority. This skill is only an execution workflow; if it conflicts with the guideline, follow the guideline and repair this skill.

## Workflow

1. Classify the requested change as live architecture, implementation, historical evidence, temporary planning, or durable memory.
2. For live architecture, update the applicable files among the exact canonical six in `docs/allura/`:
   - `BLUEPRINT.md`
   - `SOLUTION-ARCHITECTURE.md`
   - `DESIGN-ALLURA.md`
   - `REQUIREMENTS-MATRIX.md`
   - `RISKS-AND-DECISIONS.md`
   - `DATA-DICTIONARY.md`
3. Route retired or supporting documents to `docs/archive/allura/`, temporary BMAD output to `memory-bank/bmad-output/`, and governed durable evidence to Allura Brain.
4. Do not create `docs/allura/index.md`, another `DESIGN-*` file, a nested directory, or a duplicate AI-guidelines document.
5. For schema or API changes, update the Requirements Matrix and Data Dictionary in the same work slice. Record material design decisions in Risks & Decisions.
6. Respect the guideline's human-decision boundaries for concurrency, failure semantics, security boundaries, naming, business requirements, and breaking changes.
7. Preserve the AI-assistance notice until human review is recorded.

## Validation

Run at minimum:

```bash
bash .github/scripts/documentation-authority-guard.sh
bash .github/scripts/docs-allura-canonical-guard.sh
bash .github/scripts/docs-backend-residue-guard.sh
```

Run affected code, workflow, and link tests when paths or contracts change. Completion requires clean guards and evidence that every moved operational path still resolves.
