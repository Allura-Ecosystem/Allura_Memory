# Epic 4 Retrospective: Curator Workflow and HITL Receipts

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD retrospective artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Epic Summary

Epic 4 completed the curator workflow slice: safe proposal queue rendering, explicit HITL approval/rejection actions, request-evidence flow, and inspectable curator decision receipts.

Completed stories:

- `4-1-render-curator-proposal-queue-safely` — read-only queue rendering, no mutation affordance while viewing.
- `4-2-implement-hitl-approval-and-rejection-actions` — rationale-gated approval/rejection through a governed decision door with durable outbox receipts.
- `4-3-add-request-evidence-request-changes-flow` — append-only request-evidence receipt while keeping proposal status pending.
- `4-4-show-curator-decision-receipts` — receipt mapper, missing-receipt degraded blocker state, and receipt UI persistence.

## Allura Drift Gate

- Brain query: `Epic 4 retrospective curator workflow HITL receipts blockers decisions outcomes`
- group_id: `allura-system`
- Memory context used:
  - PostgreSQL is append-only audit/episodic storage; Neo4j is semantic/versioned storage.
  - HITL promotion and SOC2 curator approval are mandatory.
  - Notion remains canonical for Work Board planning/status.
  - Agents must not autonomously promote to Neo4j or Notion.
- Drift classification: no local critical drift found for retrospective readiness.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## What Went Well

- The team preserved the single governed curator decision door instead of multiplying mutation endpoints.
- Review pressure caught the important cross-store atomicity werewolf before local Done was trusted.
- The final approval path now uses a durable PostgreSQL `promotion_sync_pending` outbox rather than synchronous route-level Neo4j mutation.
- Missing receipts are represented as degraded blockers instead of disappearing from the UI.
- Story evidence consistently recorded validation output, review disposition, Brain memory IDs, and Notion tooling caveats.

## What Was Hard

- Approval/rejection sounded simple but concealed cross-store ordering complexity: proposal status, audit event, promotion sync, and Notion sync cannot be treated as independent effects.
- Legacy compatibility surfaces (`/api/curator/reject`) remained dangerous until turned into a shim.
- Request-evidence had to avoid inventing unsupported proposal statuses while still producing durable audit evidence.
- Notion Work Board updates remained pending because authorized Notion tooling was unavailable.

## Lessons Learned

- Terminal proposal status must not outrun durable sync receipts. If a downstream side effect is required for auditability, write a durable outbox event before commit.
- Compatibility endpoints are still live interfaces. Either delete them, hard-fail them, or delegate them to the governed path.
- Receipt UX must show degraded blockers for missing append-only evidence; silence is a false sense of proof.
- Request-evidence is an audit decision, not a schema status, unless Knuth approves a migration.
- Brain memories are context/audit, not proof; validation and review output remain the Done evidence.

## Follow-Up Actions for Epic 5

1. Hightower: verify runtime health/recovery baseline before any final cutover story starts.
2. Brooks/Knuth: preserve the outbox-first decision pattern in final regression/cutover evidence.
3. Scout: continue flagging Notion Work Board sync as pending until authorized tooling returns.
4. Pike/Fowler: treat any resurrected direct mutation path as a blocker, not a cleanup note.

## Validation Evidence

- `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text()); print('YAML parse passed')"` -> `YAML parse passed`.
- Targeted `git diff --check` for sprint status and retrospective artifact -> no output.

## Brain Outcome

- Retrospective memory: `c79141ba-acab-4f2f-bbc9-2b467e3842c1`.

## Board Traceability

- Notion Work Board update pending; no authorized Notion tooling is available in this runtime.
