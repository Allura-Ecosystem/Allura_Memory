# Epic 30 — Human Gate Workbook

**Purpose:** collect the human evidence required to release Epic 30 without
mistaking an automated check for a human approval.

**Status:** template only. Blank fields are not approvals, completed evidence,
or release authority.

## 1. Freeze the candidate before review

Complete this section once, before any reviewer or participant starts.

| Field | Value |
| --- | --- |
| Pull request | `#156` |
| Exact candidate SHA | `________________________` |
| Review start (UTC) | `________________________` |
| Protected-check read-back link | `________________________` |
| Synthetic test data confirmed | `yes / no` |
| Production database or production deployment used | `must be no` |

If the pull-request head changes, stop and repeat the review on the new SHA.

## 2. Independent review records — Story 30.11

Each review must be performed by a qualified person independent of the code
author. Attach the review to the frozen SHA above. A finding at BLOCK or HIGH
must be fixed and re-reviewed before release.

### Security review

```text
Reviewer name and role:
Date/time (UTC):
Candidate SHA:
Scope: authorization, tenant/workspace isolation, receipts, audit, revocation,
       bypass/leakage/prompt-injection controlled-red coverage.
Findings (include severity):
Verdict: APPROVE | APPROVE WITH REQUIRED FIXES | REJECT
No unresolved BLOCK/HIGH: yes / no
Evidence link or attachment:
```

### Maintainability review

```text
Reviewer name and role:
Date/time (UTC):
Candidate SHA:
Scope: boundaries, tests, error handling, migration clarity, rollback safety,
       operational ownership and documentation.
Findings (include severity):
Verdict: APPROVE | APPROVE WITH REQUIRED FIXES | REJECT
No unresolved BLOCK/HIGH: yes / no
Evidence link or attachment:
```

### Accessibility review

```text
Reviewer name and role:
Date/time (UTC):
Candidate SHA:
Scope: keyboard-only journey, screen-reader journey, focus handling, labels,
       real browser at 200% zoom, unavailable/fail-closed states.
Findings (include severity):
Verdict: APPROVE | APPROVE WITH REQUIRED FIXES | REJECT
No unresolved BLOCK/HIGH: yes / no
Evidence link or attachment:
```

### Migration review

```text
Reviewer name and role:
Date/time (UTC):
Candidate SHA:
Scope: migrations 71–79 and later Epic 30 migrations, fresh bootstrap,
       privilege boundaries, downgrade/rollback plan, data-loss risk.
Findings (include severity):
Verdict: APPROVE | APPROVE WITH REQUIRED FIXES | REJECT
No unresolved BLOCK/HIGH: yes / no
Evidence link or attachment:
```

### Deployment review

```text
Reviewer name and role:
Date/time (UTC):
Candidate SHA:
Scope: environment configuration, protected checks, origin/main plan,
       rollout, monitoring, rollback, and incident owner.
Findings (include severity):
Verdict: APPROVE | APPROVE WITH REQUIRED FIXES | REJECT
No unresolved BLOCK/HIGH: yes / no
Evidence link or attachment:
```

## 3. Accessibility and five-person study — Stories 30.2 and 30.12

Use synthetic data only. Five distinct, uncoached people must complete every
task. A role simulation is not a participant. A disclosure, critical error, or
fewer than four successful participants on any task blocks release until fixed
and retested.

| Participant ID | Keyboard flow | Screen reader | 200% zoom | Private/department boundary | Comparison return | Search/Ask explanation | Critical error | Unauthorized disclosure | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 |  |  |  |  |  |  |  |  |  |
| P2 |  |  |  |  |  |  |  |  |  |
| P3 |  |  |  |  |  |  |  |  |  |
| P4 |  |  |  |  |  |  |  |  |  |
| P5 |  |  |  |  |  |  |  |  |  |

Record browser, operating system, assistive technology, zoom level, task
completion, intervention, and a link to the recording or written notes. Do
not include private production content in the records.

## 4. Policy and production decisions — Stories 30.3, 30.6, 30.8–30.10

These decisions require the named security/data and operational owners; a
release manager cannot silently substitute for them.

| Decision | Required owner | Decision / evidence link | Complete |
| --- | --- | --- | --- |
| Exact authorization policy and threat dispositions | Security owner + data owner |  |  |
| Production read, relationship, citation, cache, and pagination authority | Data owner + service owner |  |  |
| Ask provider no-retention/no-training contract | Security owner + procurement/data owner |  |  |
| Restricted messaging provider, discovery, invitation, delivery and audit policy | Security owner + operations owner |  |  |
| Measured pooled membership, session, and delegation revocation proof | Service owner + security reviewer |  |  |

## 5. Release record — Story 30.13

This section may be completed only after every review, study, policy decision,
and protected check passes for one frozen SHA.

```text
Release authority name and role:
Date/time (UTC):
Frozen candidate SHA:
All five independent reviews attached: yes / no
Five-person study attached and accepted: yes / no
No unresolved BLOCK/HIGH: yes / no
Origin/main SHA before merge:
Merge or publication receipt:
Deployment receipt:
Monitoring owner and first-check time:
Rollback command/runbook link:
Rollback receipt (if exercised):
Decision: AUTHORIZE RELEASE | REJECT RELEASE
Retrospective owner and due date, or authorized waiver:
```

## 6. Closeout rule

Only an authorized human may change the completion checklist from `hold`. The
authoritative checklist is
`_bmad_output/planning-artifacts/epic-30-completion-checklist.json`; this
workbook provides evidence fields for its remaining items and does not close
them by itself.
