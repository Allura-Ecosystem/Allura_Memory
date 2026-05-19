# Governance And Audit Standards

> [!NOTE]
> **AI-Assisted Documentation**
> This document was drafted with AI assistance and must be kept aligned with
> `docs/goal.md`, Notion Work Board state, source code, and Team RAM review.

This document standardizes the Phase 3 governance formats for Allura Memory.
It does not replace Notion as the work-board source of truth, and it does not
make Allura Brain receipts proof of done. Evidence proves done.

## Required Ownership Fields

Every important action must identify:

- `owner`: one accountable person or role.
- `source`: the source of truth checked before action.
- `status`: `proposed`, `in-progress`, `review`, `done`, `deferred`, `waived`, `superseded`, or `reverted`.
- `evidence`: file path, command output, Notion page/comment ID, PR/check, or runtime health result.
- `rollback_or_supersession`: rollback command, revert commit, superseding artifact, or explicit `not applicable` reason.

## Evidence Comment Format

Use this format for Notion evidence comments and evidence pages:

```text
Evidence: <short title> — <YYYY-MM-DD>
Owner: <person or role>
Source: <Notion page/card, repo file, PR, runtime, or command>
Status: <proposed|in-progress|review|done|deferred|waived|superseded|reverted>
Validation:
- <command or check> -> <result>
Artifacts:
- <path, URL, comment ID, PR, or receipt>
Rollback or supersession:
- <rollback command, revert commit, superseding artifact, or not applicable reason>
RuVix:
- mutate: <what changed>
- attest: <evidence>
- verify: <validation path>
- isolate: <tenant/project boundary>
- sandbox: <safe execution path>
- audit: <where the trace is logged>
```

## Brain Receipt Format

Brain receipts are audit traces. They do not prove done by themselves.

Use this format when recording or referencing an Allura Brain receipt:

```text
Brain receipt:
- group_id: allura-system
- user_id: <agent identity>
- memory_id: <uuid>
- source: <conversation|manual>
- stores_used: <postgres|graph|both>
- pending_review: <true|false|unknown>
- linked_evidence: <artifact path, Notion page/comment ID, PR, or command>
- claim_boundary: Audit trace only; proof remains in validation evidence.
```

## Waiver Format

Waivers are narrow governance decisions. They must not hide product gaps.

```text
Waiver: <short title> — <YYYY-MM-DD>
Authority: <owner or approving role>
Scope: <exact gate or runtime requirement waived>
Reason: <why the normal gate cannot run>
Evidence still required:
- <non-waived product evidence>
Expiration or supersession:
- <date, condition, or real rerun that supersedes this waiver>
Non-waived boundaries:
- <requirements this waiver does not waive>
Receipts:
- Notion: <page/comment ID>
- Brain: <memory ID>
RuVix:
- mutate: no product mutation unless listed
- attest: <evidence>
- verify: <how waiver scope was checked>
- isolate: <boundary>
- sandbox: <safe path>
- audit: <where recorded>
```

## Decision Log Format

Use append-only decision entries. Do not rewrite prior decisions without a
supersession note.

```text
[YYYY-MM-DD] @<owner> decided <decision> because <rationale>.
Status: <decided|deferred|superseded|reverted>
Source: <source of truth>
Evidence: <artifact, PR, command, or Notion ID>
Supersedes: <prior decision ID or none>
Rollback: <rollback path or not applicable reason>
```

## Rollback And Supersession Format

Every important action needs a rollback or supersession path.

```text
Rollback/supersession: <short title> — <YYYY-MM-DD>
Current status: <active|superseded|reverted|deferred>
Supersedes: <artifact, decision, PR, or none>
Superseded by: <artifact, decision, PR, or none>
Rollback path:
- <command, revert commit, feature flag, config rollback, or not applicable reason>
Validation after rollback:
- <command or runtime check>
Evidence:
- <artifact path, Notion ID, Brain receipt, PR/check>
```

## Review Gates

Use these gates before moving important code, config, or docs to done:

| Gate | Required Evidence |
| --- | --- |
| Jobs scope | Objective, acceptance criteria, owner, reviewers, validation command |
| Brooks architecture | Boundaries, source of truth, route, invariants, rollback/supersession |
| Woz implementation | File diffs, focused tests, simple working path |
| Pike interface | API/surface review, complexity risk, no duplicate contracts |
| Fowler maintainability | Reversibility, debt check, formatting/typecheck or documented substitute |
| Ralph validation | Runtime/route/test validation after review evidence exists, or narrow waiver |
| Allura audit | Notion evidence and Brain receipt with `group_id=allura-system` |

## Existing Phase 3 Evidence

- Cost ledger: formally deferred in `artifacts/cost-ledger-deferral-2026-05-17.md`.
- Owner map: recorded in `OWNERS.yaml` and Notion owner card `35b1d9be-65b3-8154-8b26-ea19c288f96f`.
- Ralph runtime waiver example: `artifacts/allura-ralph-runtime-waiver-2026-05-17.md`.
- Rollback/supersession example: D-lane rollback commit `fbb9cee10d9f65a105a8dbb8e8290e7d731eebf2`.

