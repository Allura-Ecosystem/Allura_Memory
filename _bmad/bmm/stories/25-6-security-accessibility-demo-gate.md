# Story 25.6 — Security, Accessibility, and Demo Gate

**Status:** Planned / blocked
**Owner:** Bellard + Hightower + Pike + Fowler
**Depends on:** 24.5, 24.6, 24.8, 25.5, 25.5a

## Outcome

Prove the Curator Review Console is a truthful, accessible governed operator surface and rehearse a ten-minute scenario that demonstrates both a permitted and denied path.

## Acceptance Criteria

- [ ] Live-DB tests cover viewer, curator, and admin behavior.
- [ ] Tenant forgery cannot read or mutate a different tenant’s proposal.
- [ ] Scenario harness exercises approval, rejection, request evidence, missing rationale, segregation of duties, concurrency, and dependency degradation.
- [ ] Typecheck, lint, unit, integration, live-DB, route-smoke, ARIA, manifest, and evidence validation are green.
- [ ] Seeded focused-subgraph evidence captures server p50/p95 query time, payload size, browser render/interaction timing, cancellation, continuation, and scope-isolation behavior. No scale claim is made beyond those measured budgets.
- [ ] If optional 3D is enabled, feature-flag, 2D/text fallback, supported-device evidence, and rollback proof are included; otherwise it is absent from the release/demo.
- [ ] Evidence artifacts are commit-bound and include commands, exact outputs, and review verdicts.
- [ ] Demo shows private learning → proposal → evidence review → receipt and one denied unauthorized attempt.
- [ ] Mortgage Approval Gate demo uses sanitized fixtures and proves the same identity, scope, evidence, policy, human-review, denial/degraded, and receipt contracts across the dashboard module, Copilot Cowork, Claude Code, and Codex.
- [ ] Module registry tests prove invalid/incompatible/untrusted/capability-missing modules fail closed and Mortgage Gate can be disabled without affecting the dashboard shell or other surfaces.
- [ ] Demo script and UI state explicitly state: no Salesforce dependency; no automated underwriting/lending/credit decision; no production or regulatory suitability claim.
- [ ] Rollback to CLI/MCP-only operation is documented and rehearsed.

## Evidence

- `docs/archive/allura/evidence/epic-25/25.6/` complete bundle.
- Recorded or scripted ten-minute demo runbook.
- Pike/Fowler/Brooks approval.

## Rollback

Disable the operator route while retaining the engine, audit ledger, and MCP/CLI behavior.
