# Phase 0 Final Closeout Template

Date: 2026-05-17
Project: allura-memory
Agent: brooks-architect
Group ID: allura-system

## Use Condition

Use this template only after B04 cash tracker is closed, waived, or deferred by
Captain/source-owner decision.

Do not use it while B04 remains `OPEN`.

## Required Pre-Closeout Checks

Before recording final Phase 0 closeout, verify:

- `blocking_list.md` has no `OPEN` rows.
- `docs/goal.md` Phase 0 checklist has no `Open` rows except historical audit
  rows that clearly say `No-Go` or are superseded by final closeout.
- `docs/plans/phase0-evidence-index.md` has no unresolved blocker rows.
- `docs/plans/allura-memory-finish-plan.md` has no `PENDING` Phase 0 outcome
  except items intentionally marked `DEFERRED`.
- B04 decision is attached to:
  - B04 Notion work item `35d1d9be-65b3-81cc-bbf8-cf73b7c81d5a`
  - cash tracker source contract `35d1d9be-65b3-810e-b080-eddc7e036aee`
  - finish plan `3631d9be-65b3-81d5-8d05-f66eaadc946e`
- B04 decision is explicit. Do not infer closure from source-missing comments,
  no-claims evidence, or prior decision-request comments. The latest B04
  comment-thread verification found no hidden Captain/source-owner decision;
  Brain receipt: `3f09163c-c897-4c5b-9d80-e8d3a03d5db7`.
- The updated B04 decision packet was mirrored to the finish plan for audit
  visibility only; this mirror is not a closure decision. Finish-plan mirror
  comment: `3631d9be-65b3-8101-9f91-001dc63ea001`; Brain receipt:
  `47b9b616-ffcc-4cd8-a9ab-404e774881de`.
- Allura Brain has the B04 decision receipt with `group_id = allura-system`.

## Final Closeout Comment Draft

```text
Phase 0 Final Closeout — Foundation Lock

Verdict: GO for Phase 1 start.

All Phase 0 blockers are DONE, DEFERRED, or WAIVED with evidence.
B04 cash tracker scope is resolved by Captain/source-owner decision:
<insert B04 decision summary and receipt>.

Evidence:
- blocking_list.md: <commit/file state>
- docs/goal.md: <commit/file state>
- docs/plans/phase0-evidence-index.md: <commit/file state>
- docs/plans/allura-memory-finish-plan.md: <commit/file state>
- B04 Notion decision comment: <comment id>
- Allura Brain B04 receipt: <memory id>

RuVix receipt:
- mutate: Phase 0 ledgers and closeout status updated.
- attest: Notion comments, repo ledgers, artifacts, Brain receipts.
- verify: completion audit confirms no OPEN Phase 0 blockers.
- isolate: allura-system / allura-memory.
- sandbox: no unsafe execution path used.
- audit: this Notion closeout plus final Allura Brain receipt.
```

## Final Brain Receipt Draft

```text
2026-05-17 Phase 0 Final Closeout for docs/goal.md / Foundation Lock.
Verdict: GO for Phase 1 start.
All Phase 0 blockers are DONE, DEFERRED, or WAIVED with evidence. B04 cash
tracker scope resolved by Captain/source-owner decision: <summary>.
Notion closeout comment: <comment id>. Repo evidence: blocking_list.md,
docs/goal.md, docs/plans/phase0-evidence-index.md,
docs/plans/allura-memory-finish-plan.md. RuVix receipt: mutate ledgers/status;
attest Notion/repo/Brain; verify no OPEN Phase 0 blockers; isolate
allura-system; sandbox safe local docs; audit final closeout.
```

## Current Status

As of this template creation, final closeout is **not valid** because B04 remains
`OPEN`.
