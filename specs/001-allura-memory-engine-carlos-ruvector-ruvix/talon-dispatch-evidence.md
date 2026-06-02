> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed - this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

# TALON Dispatch Evidence

Date: 2026-06-02

## Intended Reviewer

Team TALON Guardian: `talon-deploy-guardian`

## Scope

Read-only validation of the Spec Kit packet for the Carlos six-document canon update.

TALON was asked to validate:

- whether the packet is sufficient for execution;
- whether runtime claims match evidence;
- whether full RuVector is avoided until extension/function proof exists;
- whether approval-required items are clearly separated;
- whether RAM/Troy/TALON ownership is clean.

## Evidence Already Gathered

- `specify check` passed and reported Spec Kit ready.
- Required source docs exist:
  - `docs/allura/BLUEPRINT.md`
  - `docs/allura/SOLUTION-ARCHITECTURE.md`
  - `docs/allura/DESIGN-ALLURA.md`
  - `docs/allura/REQUIREMENTS-MATRIX.md`
  - `docs/allura/RISKS-AND-DECISIONS.md`
  - `docs/allura/DATA-DICTIONARY.md`
  - `guidelines/AI-GUIDELINES.md`
- RuVector readiness evidence:
  - PostgreSQL `vector` extension present: `0.8.2`
  - `ruvector_function_count`: `0`
  - `allura_memories_count`: `3386`
  - classification: `pgvector bridge`, not full RuVector

## Dispatch Blocker

OpenClaw blocked direct TALON dispatch from the Troy Curator session.

Observed blocker messages:

- `agentId is not allowed for sessions_spawn`
- `Session send visibility is restricted. Set tools.sessions.visibility=all to allow cross-agent access`

## Permission Fix Retry

After OpenClaw permission changes, Troy retried `sessions_spawn`.

Retry result:

- status: `accepted`
- child session: `agent:talon-deploy-guardian:subagent:ac2ef737-8c3a-4ff4-8944-edb9f23f9a31`
- run: `43f5b005-57b3-4e45-a23b-01b5f8b8d121`

## Current Verdict

`can_execute`: yes.

TALON Guardian completed read-only validation and cleared the packet for RAM document execution.

Verified again from Troy:

- `specify check` passes from the Allura Memory repo root.
- Required packet files, six canon docs, and `guidelines/AI-GUIDELINES.md` exist; `missing=[]`.
- RuVector readiness classifies the current runtime as `pgvector bridge`, not full RuVector:
  - PostgreSQL `vector` extension: `0.8.2`
  - `ruvector_function_count`: `0`
  - `allura_memories_count`: `3392`
- Spec/plan/tasks/checklist language prevents full RuVector overclaiming and keeps TALON validation separate from RAM implementation.

## TALON Risks To Carry Into RAM Execution

- `docs/allura/index.md` exists even though `guidelines/AI-GUIDELINES.md` describes the canonical docs directory as exactly six Markdown files.
- `docs/allura/DATA-DICTIONARY.md` lacks the required AI-assisted documentation notice block.
- `docs/allura/RISKS-AND-DECISIONS.md` AD-07 still says the dashboard is part of the core engine, which conflicts with AD-31/operator-surface boundary language.
- The six canon docs do not yet contain all planned RuVector/RuVix readiness fields and decisions; RAM must add them without claiming full RuVector.

## Next Action

Route the six-document implementation scope to RAM.

Do not execute runtime/database/MCP/cron/hook changes in this packet. Separate approval is still required for runtime/database changes, MCP config, cron changes, live RAM/Durham hooks, RuVix enforcement changes, semantic memory promotion, Notion sync, or Done/Approved status moves.
