> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed - this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

# Spec: Allura Memory Engine Carlos Canon Update

## Status

Draft for TALON validation.

## Goal

Update the Allura Memory Engine canon so the six Professor Carlos AI guideline documents explicitly cover the current RuVector, RuVix, harness-hook, done-gate, and dashboard-boundary decisions without turning exploratory claims into canonical runtime truth.

## Source Of Truth

The six canonical documents are:

1. `docs/allura/BLUEPRINT.md`
2. `docs/allura/SOLUTION-ARCHITECTURE.md`
3. `docs/allura/DESIGN-ALLURA.md`
4. `docs/allura/REQUIREMENTS-MATRIX.md`
5. `docs/allura/RISKS-AND-DECISIONS.md`
6. `docs/allura/DATA-DICTIONARY.md`

The Engine Notion page is the project index. The six documents carry canon.

## Current Evidence

- Current local runtime has PostgreSQL, Neo4j, dashboard, and MCP containers healthy.
- Current local database has `vector` extension installed and `allura_memories` populated.
- Current local database does not show `ruvector` extension or `ruvector_*` SQL functions.
- Current label should be `pgvector bridge`, not `full RuVector`, until runtime checks prove otherwise.
- `specify check` passed on 2026-06-02.

## Scope

### In Scope

- Add or revise doc sections that define:
  - Engine vs Dashboard boundary.
  - Allura Brain as memory API and approval path.
  - RuVix as gate semantics: Permit, Defer, Deny, receipt.
  - RuVector current state as pgvector bridge unless full extension/functions are proven.
  - RAM/Durham harness hooks as proposed governed workflow support.
  - TALON validation and evidence gates.
  - Approval boundaries for runtime, config, database, canonical memory, and harness enforcement changes.

### Out Of Scope

- Runtime database migration to RuVector-Postgres.
- Enabling live RAM/Durham hooks.
- Changing MCP config.
- Changing cron.
- Promoting semantic memory.
- Replacing Allura Brain with RuVector, AgentDB, ruFlo, Agentic-Flow, or RVF.

## Canon Mapping

| Canon Doc | Required Update |
|---|---|
| Blueprint | State product boundary: governed memory engine, not dashboard UI or whole RuVector OS. |
| Solution Architecture | Document PostgreSQL, Neo4j, pgvector bridge, MCP gateway, RuVix gate semantics, and proposed hook wrapper. |
| Design | Define memory lifecycle, agent write-back wrapper, done gate, proof receipts, and dashboard read-only visualization boundary. |
| Requirements Matrix | Add traceable requirements for Brain read-before-work, receipt write-back, Permit/Defer/Deny, tenant isolation, dashboard API-only consumption, and RuVector readiness label. |
| Risks & Decisions | Record decisions and risks for pgvector bridge vs full RuVector-Postgres, SONA timing, RVF MCP, Cognitum Gate adapter, and approval boundaries. |
| Data Dictionary | Add fields for gate decisions, receipts, runtime health, RuVector readiness, harness hook status, and approval-required state. |

## Acceptance Criteria

- All six canonical documents exist.
- All AI-shaped edits include the Carlos AI disclosure.
- No canonical doc claims full RuVector unless runtime evidence proves `ruvector` extension/functions and feedback/search health.
- Requirements Matrix contains traceable entries for every new governance requirement.
- Risks & Decisions contains decision and risk entries for each parked RuVector layer.
- Data Dictionary names the fields needed by dashboard and API surfaces.
- Dashboard page remains UI/project-boundary only and does not own Engine canon.
- TALON returns a validation verdict with evidence and blockers.

## Approval Boundaries

The following require Captain or lane-owner approval before execution:

- Runtime/database changes.
- MCP config mutation.
- Cron mutation.
- Live RAM/Durham hook installation.
- RuVix enforcement changes.
- Canonical semantic memory promotion.
- Dashboard or Engine Done/Approved status changes.
