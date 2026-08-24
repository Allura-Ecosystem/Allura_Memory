# Story 26.7 — Operator Module, Adversarial Tests, and Demo Gate

**Status:** Planned
**Owner:** Pike + Fowler + Brooks + Bellard
**Depends on:** 26.4, 26.5, 26.6, Epic 25 module registry
**Blocks:** —

## Outcome

A truthful operator surface with Sources, Exposures, Policy Drafts, Incidents, and Receipts views, proven by adversarial tests, fail-closed behavior, tenant isolation, accessibility, rollback, and incident-replay evidence.

## Acceptance Criteria

- [ ] Operator module surfaces: Sources, Exposures, Policy Drafts, Incidents, and Receipts.
- [ ] Module is registered through the Epic 25 server-issued module registry.
- [ ] Fail-closed: invalid/incompatible/untrusted/capability-missing modules are rejected.
- [ ] Tenant isolation: a forged tenant cannot read or mutate another tenant's alerts or policy drafts.
- [ ] Accessibility: ARIA/keyboard tests pass for all surfaces.
- [ ] Rollback: disabling Bumblebee leaves the dashboard shell, core API/MCP controls, and other modules operational.
- [ ] Incident replay: an advisory can be replayed through exposure, decision, action result, and recovery evidence.
- [ ] Initial replay fixtures cover: 2025 Nx s1ngularity compromise, 2025 Shai-Hulud supply-chain worm pattern, and a mutable GitHub Action reference compromise.
- [ ] Demo shows the full flow: advisory → exposure → policy draft → approval → action → receipt → recovery.

## Evidence

- `docs/archive/allura/evidence/epic-26/26.7/` complete bundle.
- Adversarial test results.
- Incident replay recordings.
- Pike/Fowler/Brooks approval.

## Rollback

Disable the Bumblebee module through the module registry. The dashboard shell and other modules remain operational.