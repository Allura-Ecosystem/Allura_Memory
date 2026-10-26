# Epic 14 — Production Run Kernel

**Planning reconstruction:** 2026-10-25. **Current operational status:** unknown; only Allura can supply it. This document restores the original Epic 14 number, not an implementation or release approval.

## Original purpose and historical evidence

Turn process-engine primitives into a durable, inspectable, repairable workflow runtime. The [original June 12 plan](../../../docs/archive/allura/EPICS-13-17-GOVERNED-AI-OFFICE.md#epic-14-production-run-kernel) defined six stories and required one pinned process to start, block, resume, complete, replay, and survive restart without duplicate side effects.

The [archived sprint evidence](../../../docs/archive/bmad-legacy/bmm/stories/sprint-status.yaml) records that the June 12 audit reopened story 12.2: recording an approval was not proof that remaining steps executed. It listed Epic 14 as backlog. Those are historical observations, not current Allura status or evidence that the defect persists unchanged today. The archive is read-only provenance, not the current status system.

## Current remaining-work boundary

The current technical planning pack identifies **FR-F3 / AD-35 / BP-F49–52 / MEM-UC13** as an unowned implementation-and-acceptance gap for run provenance. This epic is the numbered home for resolving that planning gap. It does **not** declare that an aggregate or row-level release acceptance contract already exists.

Read the current [Blueprint](../../../docs/allura/BLUEPRINT.md), [Requirements Matrix](../../../docs/allura/REQUIREMENTS-MATRIX.md), and [Risks and Decisions](../../../docs/allura/RISKS-AND-DECISIONS.md) before selecting implementation. Existing source, donor commits, historical test counts, and run receipts must be reconciled against exact current revisions; none alone proves the whole runtime accepted.

## Numbered stories

| Story | Outcome | Remaining acceptance / dependency |
|---|---|---|
| 14.1 | Versioned process-definition registry | Preserve original scope. A run must bind to an immutable definition identity/version and accepted policy/configuration contract. Depends on 13.1 contract reconciliation and 14.7 for the missing current acceptance definition. |
| 14.2 | True checkpoint continuation and idempotency | Preserve original scope. Exercise actual remaining-step execution after approved resume and restart; prove no duplicate protected effects. Recording approval alone is insufficient. Depends on 14.1 and accepted action/receipt contracts. |
| 14.3 | Run doctor and repair findings | Preserve original scope. Diagnostics expose source, freshness, failure class, and bounded next action; repair must not silently mutate governance or invent run state. Depends on 14.1 and the accepted event contract. |
| 14.4 | Bounded retries and measured quality gates | Preserve original scope. Define retry budgets and stop conditions before execution; measure declared observations and propagate failed gates. Depends on 14.2 and owner-accepted budgets. |
| 14.5 | Process, run, event, and breakpoint APIs | Preserve original scope. Reconcile authenticated scope, versioned response shapes, event immutability, and consistent reads/writes before changing APIs. Depends on 14.1, 14.7 and applicable schema/security approval. |
| 14.6 | End-to-end run lifecycle evidence | Preserve original scope. Execute the original lifecycle gate at one frozen revision with independent review and real continuation/restart evidence. Depends on 14.1–14.5; it cannot be replaced by isolated fixture or schema checks. |
| 14.7 | Define the missing run-provenance acceptance contract | **New planning-only story.** Canon owner must map AD-35/BP-F49–52/MEM-UC13 to concrete row-level acceptance, identify existing evidence and gaps, and assign bounded implementation ownership. Until approved, FR-F3 remains an implementation-and-acceptance gap. |

The outcome descriptions above preserve or propose acceptance obligations; they do not report current task state, claim newly executed tests, or create Allura work items.

## Relation to the current technical draft

DEV-00 / 13.5 may inventory run-related source and evidence. DEV-09 / 24.7 may assess consumer compatibility. Neither delivers or accepts the run kernel. FR-F3 is routed here for **contract definition first**, with implementation ownership pending the canonical decision. This resolves where the question belongs without concealing the unresolved acceptance gate.

## Next action and gates

1. Canon owner: resolve 14.7 using existing canonical requirements and source evidence. Do not invent a new storage schema, endpoint, execution engine, or release threshold in this rewrite.
2. Integration owner: reconcile preserved implementations through 13.5, retaining the distinction between source recovery and semantic acceptance.
3. After explicit implementation authority: select the bounded original story, execute applicable tests, obtain independent review, and verify exact-revision behavior.
4. Release remains separately gated by integrated lifecycle, security, rollback, deployment evidence, and owner approval.

No application, schema, configuration, runtime, operational status, external publication, or Brain write is authorized or performed by this document.
