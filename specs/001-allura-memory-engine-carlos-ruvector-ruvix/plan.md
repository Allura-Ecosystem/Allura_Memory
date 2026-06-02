> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed - this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

# Plan: Allura Memory Engine Carlos Canon Update

## Phase 1: Hydrate

1. Read `guidelines/AI-GUIDELINES.md`.
2. Read all six canonical docs under `docs/allura/`.
3. Run the RuVector readiness checker.
4. Capture current Notion Engine page state.

## Phase 2: Draft Canon Changes

1. Blueprint: update product boundary and non-goals.
2. Solution Architecture: update runtime architecture and proposed hook/gate path.
3. Design: update lifecycle and proof surfaces.
4. Requirements Matrix: add traceable B/F/GOV requirements.
5. Risks & Decisions: add AD/RK entries for RuVector/RuVix choices.
6. Data Dictionary: add gate/receipt/readiness fields.

## Phase 3: TALON Validation

TALON validates:

- Claims match runtime evidence.
- No unsupported full RuVector claim is present.
- Approval-required changes are clearly marked.
- Requirements are traceable.
- Done gate evidence is testable.
- Dashboard/Engine boundary remains intact.

## Phase 4: RAM Implementation

RAM owns repo-side edits after TALON validates the plan and Captain approves the implementation scope.

## Phase 5: Troy Closeout

1. Update Notion canonical pages or repo-to-Notion mirrors according to authority direction.
2. Add Allura Brain receipt.
3. Report remaining blockers.

## Validation Commands

```bash
python3 - <<'PY'
from pathlib import Path
docs = [
  "docs/allura/BLUEPRINT.md",
  "docs/allura/SOLUTION-ARCHITECTURE.md",
  "docs/allura/DESIGN-ALLURA.md",
  "docs/allura/REQUIREMENTS-MATRIX.md",
  "docs/allura/RISKS-AND-DECISIONS.md",
  "docs/allura/DATA-DICTIONARY.md",
]
missing = [p for p in docs if not Path(p).exists()]
print("missing:", missing)
raise SystemExit(1 if missing else 0)
PY

bash /media/ronin704/Games/linux-home/.openclaw/agents/troy-curator/skills/ruvector-operator/scripts/ruvector-readiness.sh /home/ronin704/Projects/ai-agents/allura-memory
```

## Non-Goals

- Do not initialize live hook enforcement.
- Do not migrate database substrate.
- Do not change current app runtime.
- Do not delete or overwrite dashboard page notes without explicit approval.
