---
name: team-ram-framework
description: Run Allura development from scoped intent through implementation and evidence-backed completion. Use for Team RAM delivery, epic execution, or requests to use our framework; not for unrelated questions or as authority to deploy.
metadata:
  owner: brooks
  version: "0.1.0"
  authority: ai-guidelines
---

# Team RAM Framework

Load [AI Guidelines](../ai-guidelines/SKILL.md) and
[Team RAM operating core](../allura-team-ram/SKILL.md). This is a derived
execution aid, not a competing policy. Its
[design and limitations](../../../docs/allura/DESIGN-ALLURA.md#team-ram-framework-v01)
live in the canonical six documents.

## Start with the outcome

Extract objective, authorized scope, exclusions, and observable acceptance from
the user's request. Preserve existing approvals; do not repeatedly ask whether
to continue. Resolve genuinely missing business/security/concurrency/failure
decisions with the user, as required by AI Guidelines.

Read git/worktree state, relevant code, local context, and applicable canonical
sections. Search scoped Brain when available; distinguish current code and user
decisions from historical memory. Missing optional tools are disclosed, not
invented. Preserve unrelated edits and stashes.

Choose the smallest sufficient delivery track:

- Fix: reproduce the problem, regression test, narrow change, review.
- Feature: add contracts and UX acceptance before implementation.
- Epic: decompose dependencies and ownership; retain aggregate acceptance until
  every required slice and integration check passes.

These tracks change planning depth, not governance or acceptance standards.

## Work loop

1. Identify the next authorized, unblocked slice and its validation.
2. Load only the context/skills relevant to that slice. Consult current primary
   library/tool documentation when behavior matters.
3. Implement; run tests; inspect actual outputs. UI work also needs rendered
   visual/interaction evidence against the approved design.
4. Review correctness, simplicity, and impacted canonical documentation. Label
   self-review; do not impersonate an independent reviewer. A local checker
   pass does not waive the AI Guidelines' outside-review requirement for a
   documentation PR, or any task-specific independent review requirement.
5. Repair evidenced defects. Continue in-scope work until aggregate acceptance
   passes; a commit, story, or agent handoff is not epic completion.

If authorized delegation helps, use bounded independent tasks with explicit
file ownership, acceptance, context sources, and required evidence. Workers
must preserve others' edits. Integrate and retest their output. Do not describe
role perspectives as actual agent runs. Do not delegate merely to fill a roster.

Use host/runtime budgets and interruption controls. Do not add forever loops,
auto-approval, or new permissions. If an attempt repeats without new evidence,
diagnose or change approach; when safely actionable work is exhausted, report
the precise blocker and recovery action. A continuation request does not grant
push, merge, deployment, destructive cleanup, or semantic-promotion authority.

## Evidence and recovery

For each delivery track, including a small fix, maintain a completion record using
[the starter](assets/completion-record.json). Store task artifacts in the
approved scratch/evidence area, not as new live architecture docs. Fill it
from actual results, never a template's sample claims. Record the tested snapshot
(including uncommitted content), artifact hashes, all acceptance, unresolved
blockers, and exact next action. This local snapshot is not a substitute for
Brain or the process engine's journal.

On resume, recheck authorization, working tree, capability availability, and
evidence freshness. Do not repeat completed external side effects without
checking their actual state. There is no automatic resume or dispatch in v0.1.

Before claiming completion, run from repository root:

```bash
bun run framework:check <record.json> <expected-revision> [artifact-root]
```

Done requires all acceptance linked to passing checks, test/review/docs
evidence, matching revisions, intact artifacts, no blockers, and no remaining
next action. Inspect the evidence as well as the checker result: hashes prove
file integrity, not that tests ran, reviewers were independent, or permissions
were granted. The checker does not authenticate receipts or enforce runtime
authorization. Never remove failing acceptance just to make it pass.

Finish with delivered scope, actual validation, remaining limitations, and
evidence links. Write an evidenced outcome to Brain if available; do not
promote semantic memory without its existing approval path.
