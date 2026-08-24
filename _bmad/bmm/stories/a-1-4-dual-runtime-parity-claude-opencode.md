# Story A-1.4 — Dual-Runtime Parity — Claude vs OpenCode

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Status:** Planned
**Owner:** Brooks + Pike + Fowler
**Depends on:** A-1.1
**Blocks:** —

## Outcome

Agent definitions produce identical behavior in both Claude and OpenCode runtimes — no runtime-specific drift in routing, skills, or governance.

## Acceptance Criteria

- [ ] Every agent definition is tested in both Claude and OpenCode runtimes.
- [ ] Routing decisions are identical for the same input in both runtimes.
- [ ] Skill loading is identical in both runtimes.
- [ ] Governance gates fire identically in both runtimes.
- [ ] Parity test suite is green and runs in CI.

## Evidence

- Dual-runtime parity test results.
- CI parity test green.

## Rollback

Runtimes may diverge. Behavior differences are possible between Claude and OpenCode.