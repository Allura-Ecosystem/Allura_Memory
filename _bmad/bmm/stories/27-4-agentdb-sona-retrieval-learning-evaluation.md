# Story 27.4 — AgentDB/SONA Retrieval-Learning Evaluation

**Status:** draft/planned
**Owner:** Bellard + Fowler + Knuth
**Depends on:** 27.2
**Blocks:** 27.6

## Outcome

Compare current SONA behavior with selected AgentDB retrieval-feedback and consolidation
patterns using identical task classes and fixtures, prefer witnessed test/review/trace
outcomes over executor self-report, and issue an evidence-backed decision that rejects
AgentDB as a second durable authority even if an evaluated pattern wins.

## User Story

As a governed memory operator, I need to know — from witnessed comparison, not self-report —
whether AgentDB's retrieval-feedback and consolidation patterns improve on current SONA
behavior, so that the adoption decision is evidence-backed and names what was rejected.

## Acceptance Criteria

- [ ] Comparison uses identical task classes and fixtures for current SONA behavior and the
      selected AgentDB patterns.
- [ ] Witnessed test/review/trace outcomes are preferred over executor self-report.
- [ ] No model, skill, or ranking promotion without curator approval.
- [ ] The decision explicitly rejects AgentDB as a second durable authority even if an
      evaluated pattern wins; patterns may be adopted only as adaptations inside Allura's
      single authority.

## Dependencies

- 27.2 (branch mechanics to run the evaluated patterns on disposable branches).
- 27.1 (authorized base contract for branch-based evaluation runs).

## Rollback

Evaluation-only story; no canonical mutation. Rollback is removing the evaluation harness
and its recorded artifacts.
