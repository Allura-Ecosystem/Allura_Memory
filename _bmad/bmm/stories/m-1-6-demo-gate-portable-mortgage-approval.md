# Story M-1.6 — Demo Gate — Portable Mortgage Approval Gate Across Hosts

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Status:** Planned
**Owner:** Brooks + Jobs + Pike + Fowler
**Depends on:** M-1.4, M-1.5
**Blocks:** —

## Outcome

A demo proves the portable Mortgage Approval Gate works across Copilot Cowork, Claude Code, and Codex with sanitized fixtures, identical authority, and full traceability.

## Acceptance Criteria

- [ ] Demo uses sanitized fixtures — no real PII or financial data.
- [ ] Demo shows: intake → evidence/OCR → policy → human review → receipt.
- [ ] Demo shows one denied unauthorized attempt with no data leakage.
- [ ] Demo proves identical authority and traceability across all three hosts.
- [ ] Demo explicitly states: no Salesforce dependency, no underwriting/lending/credit decision, no production or regulatory suitability claim.
- [ ] Brooks, Jobs, Pike, and Fowler sign off on the demo.

## Evidence

- Demo runbook with sanitized fixtures.
- Cross-host demo recording or scripted walkthrough.
- Brooks + Jobs + Pike + Fowler sign-off.

## Rollback

Demo is not shown. Plugin remains in pre-demo state.