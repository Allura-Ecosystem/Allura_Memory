# Review and Validation Evidence Packet

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Purpose

This packet defines the evidence required before a BMAD story can move to Review or Done. It supports the Notion Work Board and Allura Brain audit trail; it does not replace either.

## Ready-for-Review Packet Checklist

- [ ] Story ID, title, owner, and local status are recorded.
- [ ] Acceptance criteria are checked as satisfied, deferred, or blocked.
- [ ] Changed files are listed.
- [ ] Implementation summary names the bounded slice completed.
- [ ] Allura Drift Gate result is attached or linked.
- [ ] Validation commands and exact command output are attached; use `no output` only when the command prints nothing.
- [ ] Known residual risks and follow-ups are listed.
- [ ] Notion board receipt is attached, or unavailability is explicitly recorded.

## Validation Packet Checklist

- [ ] Exact validation commands are listed in execution order.
- [ ] Each command has `passed`, `failed`, or `blocked` result.
- [ ] Exact command output is included; for silent commands, record `no output`.
- [ ] Scope explains why the validation is sufficient for the story slice.
- [ ] Any unrun expected command is named with reason and recovery path.
- [ ] Failures include root cause before another fix attempt.
- [ ] Generated artifacts are listed by path.

## Done Packet Checklist

- [ ] Review packet is complete.
- [ ] Validation packet is complete.
- [ ] No blocking review findings remain.
- [ ] Pike/Fowler review notes or documented gate-equivalent review notes are attached.
- [ ] Allura Brain outcome receipt ID is recorded; `pending` is not valid for Done.
- [ ] `status_evidence` in `_bmad/bmm/stories/sprint-status.yaml` includes `drift_gate`, `validation`, `review`, `brain_memory_id`, and `board_traceability`.
- [ ] Notion board is updated when tooling is available; otherwise local status is explicitly marked reconciliation-only.

## Failure Handling

Validation failures and unavailable required tools are blockers, not warnings. Record the exact command/output, classify the blocker, and propose recovery. Do not mark Done until the blocker is resolved or Brooks explicitly accepts a documented deferral with owner and follow-up.

## Template

```markdown
### Evidence Packet

- Story: `{story_id} — {story_title}`
- Owner: `{owner}`
- Status: `{in-progress|review|done}`
- Changed files:
  - `{path}`
- Acceptance criteria:
  - `{criterion}` — `{satisfied|deferred|blocked}`
- Drift gate: `{summary/link}`
- Validation:
  - Command: `{command}`
  - Result: `{passed|failed|blocked}`
  - Exact output: `{verbatim output or no output}`
  - Scope: `{why sufficient}`
- Review:
  - Pike/Fowler or equivalent notes: `{findings summary; required before Done}`
- Brain outcome receipt: `{id; pending allowed only while status is review}`
- Board traceability: `{Notion receipt or pending caveat}`
- Residual risks/follow-ups: `{items or none}`
```
