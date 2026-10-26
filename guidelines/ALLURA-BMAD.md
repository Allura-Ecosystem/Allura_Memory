# Allura BMAD — retained fresh-build entrypoint contract

Updated 2026-10-26 under the user's explicit Correct Course authorization. This is an active authoring/run adapter, not invented runtime implementation or a new operational tracker.

## Current authority and baseline

The user approved sequential rebuild execution beginning Epic 1, then Epic 2, retaining current BMAD and UX designs/mockups/assets. This supersedes all retain-original-numbering instructions. Story 1.1 is locally verified; 1.2 is the lowest unfinished story. Parent reconciles both workers and commits the clean baseline before development continuation; until then purge/docs/foundation remain uncommitted. Only main/beta and primary checkout. Legacy repair STOP stays intact; it is not a blanket prohibition of the approved rebuild. This correction edits owned documents and reruns existing foundation checks only; no application implementation, install, production, staging/commit/ref/worktree/push action by this worker.

Historical unapproved/repair-readiness flags do not revoke this approval. Conversely, rebuild approval does not decide unresolved product/schema/technical choices or authorize production/data changes. Retained specification files may describe source that was purged; do not execute those old paths as though they exist. Private recovery evidence is historical only, never a wholesale source/doc restoration input.

Allura owns operational work status; Notion holds planning documents; Brain supplies governed continuity. Parent recall failed; this CC run does not retry. Operational status remains unknown. Do not infer status or create a shadow Markdown/JSON/YAML board. Planning files specify work; they do not mark Allura items Done. Production is separate, unchanged and unverified.

## Required current authoring inputs

Read the affected current files, not deleted CLAUDE/runtime guides:

1. [Current PRD](../_bmad-output/planning-artifacts/prds/prd-Allura_Memory-2026-10-25/prd.md) — requirements, approved intent and open choices.
2. [Architecture](../_bmad-output/planning-artifacts/architecture.md) — target boundaries, technology-source limitations and unresolved contracts.
3. [Brief](../_bmad-output/planning-artifacts/brief.md), [epic index](../_bmad-output/planning-artifacts/epics.md), and [readiness](../_bmad-output/planning-artifacts/readiness.md).
4. Concrete current Epic 1 story acceptance in the catalog. Historical numbered drafts/maps reside in private recovery and Git, not active execution inputs. Preserve business requirement IDs unchanged.
5. [Design specification](../docs/allura/DESIGN-ALLURA.md), [operator contract](../docs/design/command-center/operator-surface-contract.md), and retained UX references for affected UI only. Preserve UX bytes in CC; bind exact screen/revision/states before a later UI implementation.
6. [Applied Correct Course](../_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-26.md), [1.1 verified foundation](../_bmad-output/planning-artifacts/stories/1.1-local-executable-foundation.md), and next [1.2 authority/service contracts](../_bmad-output/planning-artifacts/stories/1.2-authority-and-service-contracts.md).

Retained [Blueprint](../docs/allura/BLUEPRINT.md), [Requirements Matrix](../docs/allura/REQUIREMENTS-MATRIX.md), and [Risks and Decisions](../docs/allura/RISKS-AND-DECISIONS.md) supply intent/decision provenance and stable acceptance IDs. The former six-document surface is incomplete after the purge; this contract does not claim otherwise or authorize filling missing schema choices by inference. Do not alter protected specs or UX as a side effect of entrypoint repair.

## Real BMAD workflow and resolver

The retained installation is registered as BMAD 6.12.4. Inspect [installation manifest](../_bmad/_config/manifest.yaml) and [workflow catalogue](../_bmad/_config/bmad-help.csv) for actual routes. Vendor bodies are read-only in this task; use the repository installation, not a similarly named user-level legacy workflow. Do not install or upgrade anything.

For each workflow, read its actual `.agents/skills/<skill>/SKILL.md` fully and required linked checklist. Run the prescribed resolver against the explicit repository root:

```text
uv run _bmad/scripts/resolve_customization.py --skill .agents/skills/<skill> --project-root . --key workflow
uv run _bmad/scripts/resolve_config.py --project-root .
```

The customization resolver structurally merges base → team → user layers. Central config uses its prescribed resolver and includes installation answers; do not infer the resolved user name from base config alone. Preserve outputs and exit codes. Execute actual prepend/append steps in order within current authority. Empty CC activation lists mean no additional steps, not skipped activation. Discover the full nested PRD and current sequential catalog, not merely a top-level prd.md or obsolete numbered drafts.

Correct Course entrypoint: [actual skill](../.agents/skills/bmad-correct-course/SKILL.md) plus [checklist](../.agents/skills/bmad-correct-course/checklist.md). Trigger and Batch mode are already supplied. Document the issue, checklist, exact changes and handoff, then apply the already-approved direction. New choices remain proposals. Resolve `workflow.on_complete` at completion; do not invent a custom terminal instruction if it is empty.

## Missing-input mapping

The CC resolver has no project-specific override and resolves empty prepend/append/facts/on-complete. Other retained workflow TOML overrides still name deleted historical files. This is verified pointer debt, not a parser failure. **TOML/config edits are outside this Markdown-only authorization.** Raw resolver JSON remains unchanged and must not be represented as repaired.

Active Markdown adapters first load this contract and use these explicit planning-context substitutions when a resolved historical reference is absent. Record every substitution in the run receipt; never pretend the missing file was read or recreate it:

| Absent historical input | Actual retained input and limit |
|---|---|
| `CLAUDE.md`, `.agents/TEAM-RAM-RUNTIME.md` | This contract plus the host's actually loaded Team RAM role guidance. No runtime installation or role execution is inferred. |
| `docs/allura/SOLUTION-ARCHITECTURE.md` | Current BMAD architecture and PRD above. Target intent only; unrecorded topology choices still halt affected implementation. |
| `docs/allura/DATA-DICTIONARY.md` | PRD requirements and architecture open-contract section. **Not a schema substitute.** Story 1.3 supplies reviewed detailed contracts before Epic 2 DB/DTO implementation; local 1.1 tooling needs none. |
| `allura-memory-skill` or obsolete Brain tool aliases | Host-exposed governed capability only, if authorized and available. Never invent tool names, persona `user_id`, credentials or successful receipts. Preserve the current write hold; no semantic promotion. |
| Removed `implementation-artifacts/stories/DEV-*` | Current numbered epic index and bounded numbered story specification. DEV acceptance IDs in retained specs remain references only. |
| Archived runtime/repair/CI or numbered epic/story paths | Historical evidence only. Current catalog and current numbered stories own delivery. The 1.1 scaffold exists and is locally verified; new product/hosted lanes still require real independent acceptance. No raw legacy numbering may choose the next story. |

If any essential input beyond these explicit mappings is absent, halt precisely on that boundary. Do not restore archived docs or bypass the resolver. Direct raw vendor invocation that omits this Markdown adapter is not verified as a fresh-build entrypoint; future TOML cleanup needs separately scoped configuration authority.

## Team RAM and execution gates

Load real host Team RAM roles. Brooks owns conceptual integrity and handoff; Woz is the implementation owner when authorized; Fowler independently reviews maintainability/evidence, Pike interfaces/security, Knuth data and Hightower tooling/infrastructure as needed. Persona loading is not delegation. One writer; independent reviewer must inspect final candidate bytes. Do not manufacture a Council or worker result.

Use the installed [build workflow](../.agents/skills/bmad-build/SKILL.md) with the lowest unfinished ready current story's objective, exclusions, accepted inputs, exact acceptance, prerequisites, evidence and independent owner/reviewer. Run Epic 1 through 1.4 before Epic 2; never skip an unresolved prerequisite to reach a later number. Parent commits the baseline before development continuation. Tooling selection for 1.1 is settled; critical authority/schema decisions in 1.2/1.3 are not. Scoped rebuild approval is already present; preserve legacy repair STOP without reopening generic approval ceremonies.

Use the installed [code review](../.agents/skills/bmad-code-review/SKILL.md), [architecture](../.agents/skills/bmad-architecture/SKILL.md), and [retrospective](../.agents/skills/bmad-retrospective/SKILL.md) for their actual methods. Do not invoke nonexistent `bmad-dev-story` or retired product-intake skills. No automatic completion/commit/push/status mutation is permitted by a method step. Retrospective claims require verified completion or explicit partial-retro scope, not old Done labels.

## Invariants and evidence

- Server-resolved tenant/workspace/principal/action authority; namespace format and persona names grant no access.
- PostgreSQL evidence append-only; semantic versions/lineage immutable; independent authorized human promotion in every mode. Neo4j retired.
- Keep DOC-06 exact-reviewed-version and DOC-07 destination-read-back intent. AD-65/66/67 and broader AD-68 plus DOC-02/03/05/08/09/ENT remain explicitly bounded decisions or evidence gaps.
- `intended → specified → implemented → verified → released`; source presence is provenance only.
- Required lanes must discover nonzero real cases; typecheck and lint are distinct; induced-failure checks and final-byte independent review precede acceptance. Retained BMAD validation is not product testing.
- External writes/credentials/schema/services/deployment/semantic promotion and live work status keep their explicit authority boundaries. Use only the public governed Brain endpoint, never direct DB or another tenant as a workaround.
- Record exact paths, before/after hashes, commands/counts/exit codes, review verdict and unresolved limitations. Private Operations evidence is a run receipt, not a status tracker. Report Brain persistence as unperformed/unconfirmed unless an authorized write and exact read-back actually occur.
